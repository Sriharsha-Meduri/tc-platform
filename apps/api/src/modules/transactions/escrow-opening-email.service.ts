import { Injectable, Logger, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { TransactionEntity } from './entities/transaction.entity';
import { TransactionStage } from './entities/transaction-stage-instance.entity';
import { TransactionPartyEntity, PartyRole } from '../transaction-parties/entities/transaction-party.entity';
import {
  TransactionMessageEntity, MessageChannel, MessageDirection, MessageStatus,
} from '../transaction-messages/entities/transaction-message.entity';
import { getTransactionCoordinatorContact } from './transaction-coordinator-contact.util';
import { isValidEmail } from './transaction-welcome-email.service';
import { MailgunService } from '../auth/mailgun.service';
import { EmailTemplateService } from '../auth/email-template.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditAction } from '../audit-log/audit-log.entity';
import { EscrowInformationService } from '../transaction-contact-information/escrow-information.service';
import { BuyerSideInformationService } from '../transaction-contact-information/buyer-side-information.service';
import { SellerSideInformationService } from '../transaction-contact-information/seller-side-information.service';

/** Distinct prefix so the idempotency Like() check never collides with the welcome-email senders. */
export const ESCROW_OPENING_EMAIL_SUBJECT_PREFIX = 'Opening Escrow';

const CURRENCY = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

function money(v: number | null | undefined): string {
  return v === null || v === undefined ? 'Not provided' : CURRENCY.format(v);
}
function orNotProvided(v: string | null | undefined): string {
  return v && v.trim() ? v : 'Not provided';
}
function yesNoUnknown(v: boolean | null | undefined): string {
  if (v === true) return 'Yes';
  if (v === false) return 'No';
  return 'Not specified';
}

/**
 * Sends the seller-side "Escrow Opening" email to the escrow company once a
 * seller-side transaction has an executed contract. Mirrors
 * TransactionWelcomeEmailService: idempotent (one send per transaction, guarded
 * by a subject-prefix Like check), recipients resolved from parties + contact
 * information, sent from the transaction's stable outbound address, and logged
 * to transaction_messages + the audit log.
 */
@Injectable()
export class EscrowOpeningEmailService {
  private readonly logger = new Logger(EscrowOpeningEmailService.name);

  constructor(
    @InjectRepository(TransactionEntity)
    private readonly transactionsRepo: Repository<TransactionEntity>,
    @InjectRepository(TransactionPartyEntity)
    private readonly partiesRepo: Repository<TransactionPartyEntity>,
    @InjectRepository(TransactionMessageEntity)
    private readonly messagesRepo: Repository<TransactionMessageEntity>,
    private readonly mailgunService: MailgunService,
    private readonly emailTemplateService: EmailTemplateService,
    private readonly auditLogService: AuditLogService,
    private readonly escrowInformationService: EscrowInformationService,
    private readonly buyerSideInformationService: BuyerSideInformationService,
    private readonly sellerSideInformationService: SellerSideInformationService,
  ) {}

  /**
   * Sends the Escrow Opening email. Idempotent: a second call after a
   * successful send is a no-op. Throws UnprocessableEntityException when no
   * valid escrow-company recipient is on file (escrow cannot be opened without
   * one). Returns the list of recipient emails actually sent to.
   */
  async sendEscrowOpeningEmail(transactionId: string): Promise<string[]> {
    const tx = await this.transactionsRepo.findOne({
      where: { id: transactionId },
      relations: ['createdByAccount', 'createdByAccount.user'],
    });
    if (!tx) throw new NotFoundException(`Transaction ${transactionId} not found`);

    const alreadySent = await this.messagesRepo.findOne({
      where: { transactionId, subject: Like(`${ESCROW_OPENING_EMAIL_SUBJECT_PREFIX}%`), status: MessageStatus.SENT },
    });
    if (alreadySent) return [];

    const [parties, escrow, buyerSide, sellerSide] = await Promise.all([
      this.partiesRepo.find({ where: { transactionId } }),
      this.escrowInformationService.findByTransaction(transactionId),
      this.buyerSideInformationService.findByTransaction(transactionId),
      this.sellerSideInformationService.findByTransaction(transactionId),
    ]);

    const escrowOfficer = parties.find((p) => p.partyRole === PartyRole.ESCROW_OFFICER) ?? null;
    const buyerAgent = parties.find((p) => p.partyRole === PartyRole.BUYER_AGENT) ?? null;
    const sellerAgent = parties.find((p) => p.partyRole === PartyRole.SELLER_AGENT) ?? null;
    const sellerTc = parties.find((p) => p.partyRole === PartyRole.SELLER_TRANSACTION_COORDINATOR) ?? null;

    // The escrow company is the To recipient. escrow_information.escrowEmail is
    // the authoritative address, with the Escrow Officer party as a fallback.
    const escrowEmail = isValidEmail(escrow?.escrowEmail)
      ? escrow!.escrowEmail!
      : isValidEmail(escrowOfficer?.email)
        ? escrowOfficer!.email!
        : null;

    if (!escrowEmail) {
      throw new UnprocessableEntityException({
        code: 'ESCROW_OPENING_EMAIL_MISSING_ESCROW_RECIPIENT',
        message: 'Cannot send the Escrow Opening email. No valid escrow company email address is on file.',
      });
    }

    const cc: string[] = [];
    const seen = new Set<string>([escrowEmail.toLowerCase()]);
    for (const party of [sellerAgent, buyerAgent, sellerTc]) {
      if (party && isValidEmail(party.email) && !seen.has(party.email!.toLowerCase())) {
        cc.push(party.email!);
        seen.add(party.email!.toLowerCase());
      }
    }

    const propertyAddress = [tx.propertyAddressLine1, tx.propertyCity, tx.propertyState]
      .filter(Boolean).join(', ') || tx.propertyAddressLine1 || 'the property';

    const contact = getTransactionCoordinatorContact(tx, tx.createdByAccount, this.logger);
    const fromAddress = tx.outboundEmailAddress
      ? `TC Platform <${tx.outboundEmailAddress}>`
      : `TC Platform <noreply@txn.mytcapp.net>`;

    const subject = `${ESCROW_OPENING_EMAIL_SUBJECT_PREFIX} – ${propertyAddress}`;
    const ctx = {
      propertyAddress,
      txNumber: tx.transactionNumber,
      escrowContactName: orNotProvided(escrow?.escrowContactName),
      preferredEscrowCompany: orNotProvided(sellerSide?.preferredEscrowCompany ?? escrow?.escrowContactName ?? null),
      buyerAgentName: orNotProvided(buyerAgent?.displayName),
      buyerAgentEmail: orNotProvided(buyerAgent?.email),
      buyerAgentBrokerage: orNotProvided(buyerSide?.brokerageName),
      buyerAgentCommission: money(buyerSide?.grossCommission),
      sellerAgentName: orNotProvided(sellerAgent?.displayName),
      sellerAgentEmail: orNotProvided(sellerAgent?.email),
      sellerAgentCommission: money(sellerSide?.sellerAgentCommission),
      titleCompany: orNotProvided(sellerSide?.preferredTitleCompany),
      titleContactName: orNotProvided(sellerSide?.titleContactName),
      titleContactEmail: orNotProvided(sellerSide?.titleContactEmail),
      titleContactPhone: orNotProvided(sellerSide?.titleContactPhone),
      homeWarrantyCompany: orNotProvided(sellerSide?.homeWarrantyCompany),
      sellerPaysHomeWarranty: yesNoUnknown(sellerSide?.sellerPaysHomeWarranty),
      nhdCompany: orNotProvided(sellerSide?.nhdCompany),
      tcName: contact.name ?? 'Your Transaction Coordinator',
      tcPhone: contact.phone ?? 'Not provided',
      transactionEmail: contact.email ?? tx.outboundEmailAddress,
    };

    const html = this.emailTemplateService.render('escrow-opening.html.hbs', ctx);
    const text = this.emailTemplateService.render('escrow-opening.text.hbs', ctx);

    try {
      const mailResult = await this.mailgunService.sendEmail(
        escrowEmail, subject, html, text, fromAddress, cc.length ? cc : undefined,
      );

      await this.messagesRepo.save(
        this.messagesRepo.create({
          transactionId: tx.id,
          channel: MessageChannel.EMAIL,
          direction: MessageDirection.OUTBOUND,
          status: MessageStatus.SENT,
          subject,
          bodyText: text,
          bodyHtml: html,
          providerName: 'mailgun',
          providerMessageId: mailResult?.messageId ?? null,
          stage: TransactionStage.ESCROW,
          sentAt: new Date(),
          metadataJson: { to: [escrowEmail], cc, type: 'escrow_opening_email' },
        }),
      );

      await this.auditLogService.log({
        accountId: null,
        action: AuditAction.ESCROW_OPENING_EMAIL_SENT,
        targetType: 'transaction',
        targetId: transactionId,
        targetDisplayName: tx.transactionNumber,
        description: `Escrow Opening email sent for transaction ${tx.transactionNumber}`,
        details: { to: [escrowEmail], cc, status: 'sent', providerMessageId: mailResult?.messageId ?? null },
      });

      this.logger.log(`Escrow Opening email sent for transaction ${tx.transactionNumber}; to: ${escrowEmail}; cc: ${cc.join(', ') || 'none'}`);
      return [escrowEmail, ...cc];
    } catch (err) {
      const message = (err as Error).message;
      this.logger.error(`Failed to send Escrow Opening email for transaction ${tx.transactionNumber}: ${message}`);

      await this.messagesRepo.save(
        this.messagesRepo.create({
          transactionId: tx.id,
          channel: MessageChannel.EMAIL,
          direction: MessageDirection.OUTBOUND,
          status: MessageStatus.FAILED,
          subject,
          bodyText: text,
          bodyHtml: html,
          stage: TransactionStage.ESCROW,
          metadataJson: { to: [escrowEmail], cc, type: 'escrow_opening_email', error: message },
        }),
      );

      await this.auditLogService.log({
        accountId: null,
        action: AuditAction.ESCROW_OPENING_EMAIL_SENT,
        targetType: 'transaction',
        targetId: transactionId,
        targetDisplayName: tx.transactionNumber,
        description: `Escrow Opening email failed to send for transaction ${tx.transactionNumber}`,
        details: { to: [escrowEmail], cc, status: 'failed', error: message },
      });

      return [];
    }
  }
}
