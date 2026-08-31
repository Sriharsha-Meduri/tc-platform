import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VerificationOfPropertyEntity, VpStatus } from './entities/verification-of-property.entity';
import { TransactionEntity } from '../transactions/entities/transaction.entity';
import { TransactionPartyEntity, PartyRole } from '../transaction-parties/entities/transaction-party.entity';
import { TransactionMessageEntity, MessageChannel, MessageDirection, MessageStatus } from '../transaction-messages/entities/transaction-message.entity';
import { TransactionDocumentEntity, DocumentStatus } from '../transaction-documents/entities/transaction-document.entity';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditAction } from '../audit-log/audit-log.entity';
import { DocuSignService } from '../docusign/docusign.service';
import { MailgunService } from '../auth/mailgun.service';
import { EmailTemplateService } from '../auth/email-template.service';
import { TransactionStageInstancesService } from '../transactions/transaction-stage-instances.service';
import { AccountEntity } from '../accounts/entities/account.entity';

export interface ScheduleVopInput {
  transactionId: string;
  scheduledDate: string;
  createdByAccountId?: string;
  notes?: string;
}

export interface UpdateVopDateInput {
  scheduledDate: string;
  updatedByAccountId?: string;
}

@Injectable()
export class VerificationOfPropertyService {
  private readonly logger = new Logger(VerificationOfPropertyService.name);

  constructor(
    @InjectRepository(VerificationOfPropertyEntity)
    private readonly repo: Repository<VerificationOfPropertyEntity>,
    @InjectRepository(TransactionEntity)
    private readonly txRepo: Repository<TransactionEntity>,
    @InjectRepository(TransactionPartyEntity)
    private readonly partyRepo: Repository<TransactionPartyEntity>,
    @InjectRepository(TransactionMessageEntity)
    private readonly messageRepo: Repository<TransactionMessageEntity>,
    @InjectRepository(TransactionDocumentEntity)
    private readonly docRepo: Repository<TransactionDocumentEntity>,
    private readonly auditLog: AuditLogService,
    private readonly docusignService: DocuSignService,
    private readonly mailgunService: MailgunService,
    private readonly emailTemplateService: EmailTemplateService,
    private readonly stageInstancesService: TransactionStageInstancesService,
  ) {}

  async findByTransaction(transactionId: string): Promise<VerificationOfPropertyEntity | null> {
    return this.repo.findOne({ where: { transactionId } });
  }

  async findById(id: string): Promise<VerificationOfPropertyEntity | null> {
    return this.repo.findOne({ where: { id } });
  }

  async schedule(input: ScheduleVopInput): Promise<VerificationOfPropertyEntity> {
    const tx = await this.txRepo.findOne({ where: { id: input.transactionId } });
    if (!tx) throw new NotFoundException('Transaction not found');

    const existing = await this.findByTransaction(input.transactionId);
    if (existing) {
      existing.scheduledDate = new Date(input.scheduledDate + 'T12:00:00');
      existing.notes = input.notes ?? existing.notes;
      existing.createdByAccountId = input.createdByAccountId ?? existing.createdByAccountId;

      if (existing.status === VpStatus.SCHEDULED) {
        // Keep scheduled — just update date
      } else if (existing.status === VpStatus.REMINDER_SENT) {
        existing.status = VpStatus.WAITING_FOR_FORM;
      }
      // For all other statuses, keep current status (don't regress)

      const saved = await this.repo.save(existing);

      await this.logAction(AuditAction.VP_DATE_UPDATED, tx, input.createdByAccountId,
        `VP inspection date updated to ${input.scheduledDate}`,
        { scheduledDate: input.scheduledDate });

      // Activate the CLOSING stage so the stage tab shows the blue active indicator
      await this.stageInstancesService.activateStage(
        input.transactionId, 'closing', input.createdByAccountId,
      ).catch((err: Error) => this.logger.warn(`Failed to activate closing stage: ${err.message}`));

      this.logger.log(`VP date updated for tx=${input.transactionId.slice(0, 8)}`);
      return saved;
    }

    const entity = this.repo.create({
      transactionId: input.transactionId,
      status: VpStatus.SCHEDULED,
      scheduledDate: new Date(input.scheduledDate + 'T12:00:00'),
      createdByAccountId: input.createdByAccountId ?? null,
      notes: input.notes ?? null,
    });

    const saved = await this.repo.save(entity);

    await this.logAction(AuditAction.VP_SCHEDULED, tx, input.createdByAccountId,
        `VP inspection scheduled for ${input.scheduledDate}`,
      { scheduledDate: input.scheduledDate });

    // Activate the CLOSING stage so the stage tab shows the blue active indicator
    await this.stageInstancesService.activateStage(
      input.transactionId, 'closing', input.createdByAccountId,
    ).catch((err: Error) => this.logger.warn(`Failed to activate closing stage: ${err.message}`));

    this.logger.log(`VP scheduled for tx=${input.transactionId.slice(0, 8)} id=${saved.id.slice(0, 8)}`);
    return saved;
  }

  async sendReminder(transactionId: string, triggeredByAccountId?: string): Promise<VerificationOfPropertyEntity> {
    const vop = await this.findByTransaction(transactionId);
    if (!vop) throw new NotFoundException('VP not found for this transaction');
    if (!vop.scheduledDate) throw new BadRequestException('VP inspection date is not scheduled');

    const tx = await this.txRepo.findOne({ where: { id: transactionId } });
    if (!tx) throw new NotFoundException('Transaction not found');

    const buyerAgentParty = await this.findParty(transactionId, 'buyer_agent');
    const buyerParty = await this.findParty(transactionId, 'buyer');
    const recipientName = buyerAgentParty?.displayName ?? buyerParty?.displayName ?? 'Buyer Agent';
    const recipientEmail = buyerAgentParty?.email ?? buyerParty?.email;

    if (!recipientEmail) {
      throw new BadRequestException('No buyer agent or buyer email found for this transaction');
    }

    const propertyAddress = this.formatAddress(tx);

    try {
      const inspectionDate = vop.scheduledDate.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });

      const ctx = {
        name: recipientName,
        role: buyerAgentParty?.partyRole ?? 'buyer_agent',
        inspectionDate,
        address: propertyAddress,
        txNumber: tx.transactionNumber,
        uploadLink: null,
      };

      const htmlBody = this.emailTemplateService.render('vp-reminder.html.hbs', ctx);
      const textBody = this.emailTemplateService.render('vp-reminder.text.hbs', ctx);
      const subject = `Verification of Property Today — ${propertyAddress}`;

      const mailResult = await this.mailgunService.sendEmail(
        recipientEmail,
        subject,
        htmlBody,
        textBody,
        tx.outboundEmailAddress ?? undefined,
      );

      // Record outbound message for swimlane visibility + reply tracking
      await this.messageRepo.save(
        this.messageRepo.create({
          transactionId: tx.id,
          channel: MessageChannel.EMAIL,
          direction: MessageDirection.OUTBOUND,
          status: MessageStatus.SENT,
          subject,
          bodyText: textBody,
          bodyHtml: htmlBody,
          providerName: 'mailgun',
          providerMessageId: mailResult?.messageId ?? null,
          recipientPartyId: buyerAgentParty?.id ?? null,
          stage: 'closing',
          sentAt: new Date(),
          metadataJson: { to: recipientEmail, role: 'buyer_agent', type: 'vp-reminder' },
        }),
      );

      // Update VP status
      const now = new Date();
      vop.status = VpStatus.REMINDER_SENT;
      vop.reminderSentAt = now;
      const saved = await this.repo.save(vop);

      await this.logAction(AuditAction.VP_REMINDER_SENT, tx, triggeredByAccountId,
        `VP reminder email sent to ${recipientEmail}`,
        { recipientEmail, recipientName, scheduledDate: vop.scheduledDate?.toISOString() });

      // Create system message
      await this.createSystemMessage(tx.id,
        `Verification of Property reminder sent to ${recipientName} (${recipientEmail}). The VP inspection is scheduled for ${inspectionDate}.`);

      this.logger.log(`VP reminder sent for tx=${transactionId.slice(0, 8)} to ${recipientEmail}`);
      return saved;
    } catch (err) {
      this.logger.error(`Failed to send VP reminder: ${(err as Error).message}`);
      throw err;
    }
  }

  async markDocumentReceived(vopId: string, documentId: string, accountId?: string): Promise<VerificationOfPropertyEntity> {
    const vop = await this.repo.findOne({ where: { id: vopId } });
    if (!vop) throw new NotFoundException('VP not found');

    // Check for duplicate document
    if (vop.vopDocumentId && vop.vopDocumentId !== documentId) {
      const existingDoc = await this.docRepo.findOne({ where: { id: vop.vopDocumentId } });
      if (existingDoc && existingDoc.status !== DocumentStatus.SUPERSEDED) {
        this.logger.warn(`VP already has document ${vop.vopDocumentId} — received new document ${documentId}`);
      }
    }

    vop.vopDocumentId = documentId;
    vop.documentReceivedAt = new Date();
    if (vop.status === VpStatus.REMINDER_SENT || vop.status === VpStatus.SCHEDULED) {
      vop.status = VpStatus.FORM_RECEIVED;
    }

    const saved = await this.repo.save(vop);

    const tx = await this.txRepo.findOne({ where: { id: vop.transactionId } });
    if (tx) {
      await this.logAction(AuditAction.VP_DOCUMENT_RECEIVED, tx, accountId,
        `VP document received`,
        { vopDocumentId: documentId });

      await this.createSystemMessage(tx.id,
        'Verification of Property (VP) form has been received and is pending validation.');
    }

    this.logger.log(`VP document received for vop=${vopId.slice(0, 8)} doc=${documentId.slice(0, 8)}`);
    return saved;
  }

  async markValidated(vopId: string, accountId?: string): Promise<VerificationOfPropertyEntity> {
    const vop = await this.repo.findOne({ where: { id: vopId } });
    if (!vop) throw new NotFoundException('VP not found');

    if (!vop.vopDocumentId) {
      throw new BadRequestException('No VP document has been received yet');
    }

    vop.status = VpStatus.VALIDATED;
    vop.validatedAt = new Date();

    const saved = await this.repo.save(vop);

    const tx = await this.txRepo.findOne({ where: { id: vop.transactionId } });
    if (tx) {
      await this.logAction(AuditAction.VP_VALIDATED, tx, accountId,
        `VP document validated`,
        { vopDocumentId: vop.vopDocumentId });

      await this.createSystemMessage(tx.id,
        'Verification of Property (VP) form has been validated and is ready for signature.');
    }

    this.logger.log(`VP validated for vop=${vopId.slice(0, 8)}`);
    return saved;
  }

  async sendForSignature(vopId: string, accountId?: string): Promise<VerificationOfPropertyEntity> {
    const vop = await this.repo.findOne({ where: { id: vopId } });
    if (!vop) throw new NotFoundException('VP not found');

    if (!vop.vopDocumentId) {
      throw new BadRequestException('No VP document has been received yet');
    }

    if (vop.status !== VpStatus.VALIDATED && vop.status !== VpStatus.READY_FOR_DOCUSIGN && vop.status !== VpStatus.FORM_RECEIVED) {
      throw new BadRequestException(`VP must be validated before sending for signature (current status: ${vop.status})`);
    }

    const tx = await this.txRepo.findOne({ where: { id: vop.transactionId } });
    if (!tx) throw new NotFoundException('Transaction not found');

    // Find signers: seller and seller agent (or buyer agent as fallback)
    const sellerParty = await this.findParty(vop.transactionId, 'seller');
    const sellerAgentParty = await this.findParty(vop.transactionId, 'seller_agent');
    const buyerAgentParty = await this.findParty(vop.transactionId, 'buyer_agent');

    const signers: Array<{ name: string; email: string; role?: string }> = [];

    if (sellerParty?.email) {
      signers.push({ name: sellerParty.displayName, email: sellerParty.email, role: 'Seller' });
    }
    if (sellerAgentParty?.email) {
      signers.push({ name: sellerAgentParty.displayName, email: sellerAgentParty.email, role: 'Seller Agent' });
    }

    // If no seller/seller-agent, fall back to buyer agent (buyer verifies the property)
    if (signers.length === 0 && buyerAgentParty?.email) {
      signers.push({ name: buyerAgentParty.displayName, email: buyerAgentParty.email, role: 'Buyer Agent' });
    }

    if (signers.length === 0) {
      throw new BadRequestException('No signers found for this transaction (need seller, seller agent, or buyer agent)');
    }

    const propertyAddress = this.formatAddress(tx);

    try {
      const envelope = await this.docusignService.createEnvelope({
        transactionId: tx.id,
        documentIds: [vop.vopDocumentId],
        signers,
        emailSubject: `Verification of Property – ${propertyAddress}`,
        emailBody: 'Please sign the Verification of Property (VP) form to confirm the property condition before closing.',
      });

      vop.status = VpStatus.SENT_VIA_DOCUSIGN;
      vop.docusignEnvelopeId = envelope.envelopeId ?? null;
      vop.sentForSignatureAt = new Date();

      const saved = await this.repo.save(vop);

      await this.logAction(AuditAction.VP_SENT_FOR_SIGNATURE, tx, accountId,
        `VP sent via DocuSign`,
        { envelopeId: envelope.envelopeId, signers: signers.map((s) => s.email) });

      await this.createSystemMessage(tx.id,
        `Verification of Property (VP) sent for electronic signature via DocuSign. Recipients: ${signers.map((s) => `${s.name} (${s.role})`).join(', ')}.`);

      this.logger.log(`VP sent for signature for vop=${vopId.slice(0, 8)} envelope=${envelope.envelopeId}`);
      return saved;
    } catch (err) {
      const message = (err as Error).message ?? 'Unknown error';
      this.logger.error(`Failed to send VP via DocuSign: ${message}`);

      if (message.includes('not configured') || message.includes('authentication failed')) {
        throw new BadRequestException(`DocuSign is not available: ${message}`);
      }
      if (message.includes('No documents found') || message.includes('stored PDF')) {
        throw new BadRequestException(`VP document is missing: ${message}`);
      }
      throw new BadRequestException(`Failed to send VP via DocuSign: ${message}`);
    }
  }

  async markFullyExecuted(vopId: string, accountId?: string): Promise<VerificationOfPropertyEntity> {
    const vop = await this.repo.findOne({ where: { id: vopId } });
    if (!vop) throw new NotFoundException('VP not found');

    vop.status = VpStatus.FULLY_EXECUTED;
    vop.fullyExecutedAt = new Date();

    const saved = await this.repo.save(vop);

    const tx = await this.txRepo.findOne({ where: { id: vop.transactionId } });
    if (tx) {
      await this.logAction(AuditAction.VP_FULLY_EXECUTED, tx, accountId,
        `VP fully executed`,
        { docusignEnvelopeId: vop.docusignEnvelopeId });

      await this.createSystemMessage(tx.id,
        'Verification of Property (VP) has been fully executed. Closing documents are complete.');
    }

    this.logger.log(`VP fully executed for vop=${vopId.slice(0, 8)}`);
    return saved;
  }

  async setReadyForDocuSign(vopId: string, accountId?: string): Promise<VerificationOfPropertyEntity> {
    const vop = await this.repo.findOne({ where: { id: vopId } });
    if (!vop) throw new NotFoundException('VP not found');

    if (!vop.vopDocumentId) {
      throw new BadRequestException('No VP document has been received yet');
    }

    vop.status = VpStatus.READY_FOR_DOCUSIGN;
    const saved = await this.repo.save(vop);

    const tx = await this.txRepo.findOne({ where: { id: vop.transactionId } });
    if (tx) {
      await this.createSystemMessage(tx.id,
        'Verification of Property (VP) is ready to be sent for signatures.');
    }

    return saved;
  }

  async createSystemMessage(transactionId: string, content: string): Promise<void> {
    try {
      const tx = await this.txRepo.findOne({ where: { id: transactionId } });
      if (!tx) return;
      const msg = this.messageRepo.create({
        transactionId,
        channel: MessageChannel.IN_APP,
        direction: MessageDirection.INTERNAL,
        subject: 'VP Workflow',
        bodyHtml: `<p>${content}</p>`,
        bodyText: content,
        stage: 'closing',
      });
      await this.messageRepo.save(msg);
    } catch (err) {
      this.logger.error(`Failed to create system message: ${(err as Error).message}`);
    }
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private async findParty(transactionId: string, role: string): Promise<TransactionPartyEntity | null> {
    const parties = await this.partyRepo.find({
      where: { transactionId, partyRole: role as PartyRole },
      order: { isPrimary: 'DESC' },
      take: 1,
    });
    return parties[0] ?? null;
  }

  private formatAddress(tx: TransactionEntity): string {
    const parts = [tx.propertyAddressLine1];
    if (tx.propertyAddressLine2) parts.push(tx.propertyAddressLine2);
    parts.push(`${tx.propertyCity}, ${tx.propertyState}`);
    if (tx.propertyPostalCode) parts[parts.length - 1] += ` ${tx.propertyPostalCode}`;
    return parts.join(', ');
  }

  private async logAction(
    action: AuditAction,
    tx: TransactionEntity | null,
    accountId: string | undefined,
    description: string,
    details?: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.auditLog.log({
        accountId: accountId ?? null,
        action,
        targetType: 'verification_of_property',
        targetId: tx?.id ?? null,
        targetDisplayName: tx?.transactionNumber ?? null,
        description,
        details: details ?? null,
      });
    } catch (err) {
      this.logger.error(`Audit log write failed: ${(err as Error).message}`);
    }
  }
}
