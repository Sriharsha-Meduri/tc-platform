import { Injectable, Logger, NotFoundException, UnprocessableEntityException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Not } from 'typeorm';
import { TransactionEntity } from './entities/transaction.entity';
import { TransactionStage } from './entities/transaction-stage-instance.entity';
import { DisclosurePacketEntity, DisclosurePacketStatus } from './entities/disclosure-packet.entity';
import { TransactionPartyEntity, PartyRole } from '../transaction-parties/entities/transaction-party.entity';
import { TransactionDocumentEntity, DocumentStatus } from '../transaction-documents/entities/transaction-document.entity';
import {
  TransactionMessageEntity, MessageChannel, MessageDirection, MessageStatus,
} from '../transaction-messages/entities/transaction-message.entity';
import { getTransactionCoordinatorContact } from './transaction-coordinator-contact.util';
import { isValidEmail } from './transaction-welcome-email.service';
import { MailgunService } from '../auth/mailgun.service';
import { EmailTemplateService } from '../auth/email-template.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditAction } from '../audit-log/audit-log.entity';

/** Document types that make up the seller disclosure packet (mirrors the revalidate-disclosures set). */
const DISCLOSURE_DOCUMENT_TYPES = ['disclosure', 'tbs', 'avds', 'nhd', 'avid', 'bia', 'bhia', 'tds', 'spq', 'hoa', 'cc&rs'];

@Injectable()
export class DisclosurePacketService {
  private readonly logger = new Logger(DisclosurePacketService.name);

  constructor(
    @InjectRepository(DisclosurePacketEntity)
    private readonly packetsRepo: Repository<DisclosurePacketEntity>,
    @InjectRepository(TransactionEntity)
    private readonly transactionsRepo: Repository<TransactionEntity>,
    @InjectRepository(TransactionPartyEntity)
    private readonly partiesRepo: Repository<TransactionPartyEntity>,
    @InjectRepository(TransactionDocumentEntity)
    private readonly documentsRepo: Repository<TransactionDocumentEntity>,
    @InjectRepository(TransactionMessageEntity)
    private readonly messagesRepo: Repository<TransactionMessageEntity>,
    private readonly mailgunService: MailgunService,
    private readonly emailTemplateService: EmailTemplateService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async findByTransaction(transactionId: string): Promise<DisclosurePacketEntity | null> {
    return this.packetsRepo.findOne({ where: { transactionId } });
  }

  /** Returns the transaction's disclosure packet, creating it (SENT_TO_SELLER) if none exists yet. */
  async getOrCreate(transactionId: string): Promise<DisclosurePacketEntity> {
    const existing = await this.packetsRepo.findOne({ where: { transactionId } });
    if (existing) return existing;
    const created = this.packetsRepo.create({
      transactionId,
      status: DisclosurePacketStatus.SENT_TO_SELLER,
      sentToSellerAt: new Date(),
    });
    return this.packetsRepo.save(created);
  }

  /** Marks the seller's disclosures as returned and ready for TC review. */
  async markSellerCompleted(transactionId: string): Promise<DisclosurePacketEntity> {
    const packet = await this.getOrCreate(transactionId);
    packet.status = DisclosurePacketStatus.SELLER_COMPLETED;
    packet.sellerCompletedAt = packet.sellerCompletedAt ?? new Date();
    return this.packetsRepo.save(packet);
  }

  /** Listing TC marks the disclosures reviewed for completeness. */
  async markReviewed(transactionId: string, accountId: string | null, notes?: string | null): Promise<DisclosurePacketEntity> {
    const tx = await this.transactionsRepo.findOne({ where: { id: transactionId } });
    if (!tx) throw new NotFoundException(`Transaction ${transactionId} not found`);
    const packet = await this.getOrCreate(transactionId);
    packet.status = DisclosurePacketStatus.TC_REVIEWED;
    packet.reviewedAt = new Date();
    packet.reviewedByAccountId = accountId ?? null;
    packet.reviewNotes = notes ?? packet.reviewNotes;
    const saved = await this.packetsRepo.save(packet);

    await this.auditLogService.log({
      accountId: accountId ?? null,
      action: AuditAction.DISCLOSURE_PACKET_REVIEWED,
      targetType: 'transaction',
      targetId: transactionId,
      targetDisplayName: tx.transactionNumber,
      description: `Seller disclosures reviewed for transaction ${tx.transactionNumber}`,
      details: { transactionId, notes: notes ?? null },
    });
    return saved;
  }

  /**
   * Forwards the reviewed disclosure packet to the Buyer TC and Buyer Agent.
   * Requires the packet to be in TC_REVIEWED. Emails the buyer side a summary of
   * the completed disclosure forms. (Default delivery per the plan's open
   * question Q2 is an emailed notice; richer secure-link/DocuSign delivery is a
   * later refinement.)
   */
  async forwardToBuyer(transactionId: string): Promise<DisclosurePacketEntity> {
    const tx = await this.transactionsRepo.findOne({
      where: { id: transactionId },
      relations: ['createdByAccount', 'createdByAccount.user'],
    });
    if (!tx) throw new NotFoundException(`Transaction ${transactionId} not found`);

    const packet = await this.getOrCreate(transactionId);
    if (packet.status !== DisclosurePacketStatus.TC_REVIEWED && packet.status !== DisclosurePacketStatus.SENT_TO_BUYER) {
      throw new BadRequestException('Disclosures must be reviewed by the TC before they can be forwarded to the buyer side.');
    }

    const parties = await this.partiesRepo.find({ where: { transactionId } });
    const buyerTc = parties.find((p) => p.partyRole === PartyRole.BUYER_TRANSACTION_COORDINATOR) ?? null;
    const buyerAgent = parties.find((p) => p.partyRole === PartyRole.BUYER_AGENT) ?? null;

    const recipients: string[] = [];
    const seen = new Set<string>();
    for (const party of [buyerTc, buyerAgent]) {
      if (party && isValidEmail(party.email) && !seen.has(party.email!.toLowerCase())) {
        recipients.push(party.email!);
        seen.add(party.email!.toLowerCase());
      }
    }
    if (recipients.length === 0) {
      throw new UnprocessableEntityException({
        code: 'DISCLOSURE_FORWARD_MISSING_BUYER_RECIPIENT',
        message: 'Cannot forward disclosures. No valid Buyer TC or Buyer Agent email is on file.',
      });
    }

    const docs = await this.documentsRepo.find({
      where: {
        transactionId,
        status: Not(In([DocumentStatus.SUPERSEDED, DocumentStatus.REJECTED])),
      },
    });
    const disclosureDocs = docs.filter((d) => DISCLOSURE_DOCUMENT_TYPES.includes((d.documentType ?? '').toLowerCase()));
    const documentTitles = disclosureDocs.map((d) => d.title || d.fileName || d.documentType).filter(Boolean) as string[];

    const propertyAddress = [tx.propertyAddressLine1, tx.propertyCity, tx.propertyState]
      .filter(Boolean).join(', ') || tx.propertyAddressLine1 || 'the property';
    const contact = getTransactionCoordinatorContact(tx, tx.createdByAccount, this.logger);
    const fromAddress = tx.outboundEmailAddress
      ? `TC Platform <${tx.outboundEmailAddress}>`
      : `TC Platform <noreply@txn.mytcapp.net>`;

    const subject = `Seller disclosures completed – ${propertyAddress}`;
    const ctx = {
      propertyAddress,
      txNumber: tx.transactionNumber,
      documentTitles,
      hasDocuments: documentTitles.length > 0,
      tcName: contact.name ?? 'The Listing Transaction Coordinator',
      tcPhone: contact.phone ?? 'Not provided',
      transactionEmail: contact.email ?? tx.outboundEmailAddress,
    };
    const html = this.emailTemplateService.render('disclosures-forwarded.html.hbs', ctx);
    const text = this.emailTemplateService.render('disclosures-forwarded.text.hbs', ctx);

    try {
      const mailResult = await this.mailgunService.sendEmail(recipients, subject, html, text, fromAddress);
      await this.messagesRepo.save(
        this.messagesRepo.create({
          transactionId,
          channel: MessageChannel.EMAIL,
          direction: MessageDirection.OUTBOUND,
          status: MessageStatus.SENT,
          subject,
          bodyText: text,
          bodyHtml: html,
          providerName: 'mailgun',
          providerMessageId: mailResult?.messageId ?? null,
          stage: TransactionStage.DISCLOSURES,
          sentAt: new Date(),
          metadataJson: { to: recipients, type: 'disclosures_forwarded', documentTitles },
        }),
      );
    } catch (err) {
      this.logger.error(`Failed to send disclosures-forwarded email for tx ${tx.transactionNumber}: ${(err as Error).message}`);
      throw err;
    }

    packet.status = DisclosurePacketStatus.SENT_TO_BUYER;
    packet.forwardedAt = new Date();
    packet.forwardedTo = { recipients, documentTitles };
    const saved = await this.packetsRepo.save(packet);

    await this.auditLogService.log({
      accountId: null,
      action: AuditAction.DISCLOSURES_FORWARDED_TO_BUYER,
      targetType: 'transaction',
      targetId: transactionId,
      targetDisplayName: tx.transactionNumber,
      description: `Reviewed seller disclosures forwarded to the buyer side for transaction ${tx.transactionNumber}`,
      details: { transactionId, recipients, documentCount: documentTitles.length },
    });
    return saved;
  }
}
