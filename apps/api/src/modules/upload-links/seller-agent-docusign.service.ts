import { Injectable, Logger, NotFoundException, ConflictException, UnprocessableEntityException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UploadLinkEntity } from './entities/upload-link.entity';
import { UploadLinkRepository } from './upload-link.repository';
import { UploadAuditService } from './upload-audit.service';
import { SELLER_AGENT_TRANSACTION_DOCUMENT_UPLOAD } from './upload-link.types';
import { TransactionEntity } from '../transactions/entities/transaction.entity';
import { TransactionPartyEntity } from '../transaction-parties/entities/transaction-party.entity';
import { TransactionFormTemplatesService } from '../transaction-form-templates/transaction-form-templates.service';
import { DocuSignService } from '../docusign/docusign.service';
import { DocuSignEnvelopeEntity, DocuSignEnvelopeStatus } from '../docusign/entities/docusign-envelope.entity';
import { resolveBuyerSideRecipients, missingRecipientsFor } from './docusign-recipient-rules.util';

export interface SellerAgentDocusignStatusDto {
  eligible: boolean;
  confirmationRequested: boolean;
  confirmed: boolean;
  existingEnvelope: { status: string; sentAt: Date | null } | null;
  documents: Array<{ id: string; fileName: string | null; formCode: string | null }>;
  buyers: Array<{ name: string; email: string }>;
  buyerAgent: { name: string; email: string } | null;
  missingRecipients: string[];
}

/** Exact reminder text required in both the confirmation flow's DocuSign envelope message and (already, via the confirmation email template) the confirmation-request email. */
export const BUYER_REVIEW_REMINDER_TEXT = 'Please review these documents with your Buyer Agent before signing.';

/** Envelope statuses that don't block sending a fresh one for the same link — a prior attempt that was declined or voided isn't "already sent" for duplicate-prevention purposes. */
const NON_BLOCKING_ENVELOPE_STATUSES = new Set<string>([DocuSignEnvelopeStatus.DECLINED, DocuSignEnvelopeStatus.VOIDED]);

/**
 * Orchestrates the Seller Agent's "send everything to the Buyer via DocuSign"
 * flow — the eligibility/preview read, the seller's explicit confirmation,
 * and the actual send. Deliberately its own service (not folded into
 * ExternalDocumentUploadService or ExternalTransactionInformationService)
 * since it composes across three other services (checklist, DocuSign,
 * parties) rather than owning a table of its own.
 */
@Injectable()
export class SellerAgentDocusignService {
  private readonly logger = new Logger(SellerAgentDocusignService.name);

  constructor(
    private readonly uploadLinkRepo: UploadLinkRepository,
    private readonly formTemplatesService: TransactionFormTemplatesService,
    private readonly docuSignService: DocuSignService,
    private readonly auditService: UploadAuditService,
    @InjectRepository(TransactionPartyEntity)
    private readonly partiesRepo: Repository<TransactionPartyEntity>,
    @InjectRepository(DocuSignEnvelopeEntity)
    private readonly envelopeRepo: Repository<DocuSignEnvelopeEntity>,
  ) {}

  private assertSellerAgentPurpose(link: UploadLinkEntity): void {
    if (link.purpose !== SELLER_AGENT_TRANSACTION_DOCUMENT_UPLOAD) {
      throw new NotFoundException('This feature is only available on the Seller Agent upload link.');
    }
  }

  /** The most recent envelope for this link that would block a fresh send — null if there's none, or the only ones are declined/voided. */
  private async findBlockingEnvelope(uploadLinkId: string): Promise<DocuSignEnvelopeEntity | null> {
    const envelopes = await this.envelopeRepo.find({ where: { uploadLinkId }, order: { createdAt: 'DESC' } });
    return envelopes.find((e) => !NON_BLOCKING_ENVELOPE_STATUSES.has(e.status)) ?? null;
  }

  async getStatus(link: UploadLinkEntity, transaction: TransactionEntity): Promise<SellerAgentDocusignStatusDto> {
    this.assertSellerAgentPurpose(link);

    const rejectedFormCodes = await this.auditService.findRecentlyRejectedFormCodes(link.id);
    const [checklist, { buyers, buyerAgent }, existingEnvelope, documents] = await Promise.all([
      this.formTemplatesService.getSellerAgentChecklistStatus(transaction, link.id, rejectedFormCodes),
      resolveBuyerSideRecipients(this.partiesRepo, transaction.id),
      this.findBlockingEnvelope(link.id),
      this.formTemplatesService.getValidatedDocumentsForEnvelope(link.id, transaction.id),
    ]);

    return {
      eligible: checklist.allRequiredSubmitted,
      confirmationRequested: !!link.docusignConfirmationRequestedAt,
      confirmed: !!link.docusignConfirmedAt,
      existingEnvelope: existingEnvelope ? { status: existingEnvelope.status, sentAt: existingEnvelope.sentAt } : null,
      documents: documents.map((d) => ({ id: d.id, fileName: d.fileName, formCode: d.formCode })),
      buyers: buyers.map((b) => ({ name: b.displayName, email: b.email ?? '' })),
      buyerAgent: buyerAgent ? { name: buyerAgent.displayName, email: buyerAgent.email ?? '' } : null,
      missingRecipients: missingRecipientsFor(buyers, buyerAgent),
    };
  }

  /** Idempotent — confirming a second time is a no-op, not an error, so a Seller Agent clicking the button twice (or the email link and the in-page button) never fails. */
  async confirm(link: UploadLinkEntity, transaction: TransactionEntity): Promise<{ confirmed: boolean }> {
    this.assertSellerAgentPurpose(link);
    if (link.docusignConfirmedAt) return { confirmed: true };

    const rejectedFormCodes = await this.auditService.findRecentlyRejectedFormCodes(link.id);
    const checklist = await this.formTemplatesService.getSellerAgentChecklistStatus(transaction, link.id, rejectedFormCodes);
    if (!checklist.allRequiredSubmitted) {
      throw new UnprocessableEntityException('The required document checklist is not complete yet.');
    }

    await this.uploadLinkRepo.recordDocusignConfirmed(link.id);
    await this.auditService.recordDocusignConfirmedAuditEvent({
      transactionId: link.transactionId,
      uploadLinkId: link.id,
      recipientEmail: link.recipientEmail,
    });
    return { confirmed: true };
  }

  /**
   * The actual send — re-validates everything server-side rather than
   * trusting an earlier /status read, since that read could be stale by the
   * time this is called (another tab, a slow page, a retried request).
   */
  async send(link: UploadLinkEntity, transaction: TransactionEntity): Promise<DocuSignEnvelopeEntity> {
    this.assertSellerAgentPurpose(link);

    const current = await this.uploadLinkRepo.findById(link.id);
    if (!current) throw new NotFoundException('Upload link not found');

    const rejectedFormCodes = await this.auditService.findRecentlyRejectedFormCodes(link.id);
    const checklist = await this.formTemplatesService.getSellerAgentChecklistStatus(transaction, link.id, rejectedFormCodes);
    if (!checklist.allRequiredSubmitted) {
      throw new UnprocessableEntityException('The required document checklist is not complete yet.');
    }
    if (!current.docusignConfirmedAt) {
      throw new UnprocessableEntityException('Seller confirmation is required before sending.');
    }

    const blockingEnvelope = await this.findBlockingEnvelope(link.id);
    if (blockingEnvelope) {
      throw new ConflictException('Documents have already been sent to the Buyer for this transaction.');
    }

    const { buyers, buyerAgent } = await resolveBuyerSideRecipients(this.partiesRepo, transaction.id);
    const missing = missingRecipientsFor(buyers, buyerAgent);
    if (missing.length > 0) {
      throw new UnprocessableEntityException(`Missing required recipient(s): ${missing.join(', ')}`);
    }

    const documents = await this.formTemplatesService.getValidatedDocumentsForEnvelope(link.id, transaction.id);
    if (documents.length === 0) {
      throw new UnprocessableEntityException('No validated documents are available to send.');
    }

    const envelope = await this.docuSignService.sendSellerDocumentsToBuyer({
      transactionId: transaction.id,
      uploadLinkId: link.id,
      documentIds: documents.map((d) => d.id),
      buyers: buyers.map((b) => ({ name: b.displayName, email: b.email! })),
      buyerAgent: { name: buyerAgent!.displayName, email: buyerAgent!.email! },
      emailBody: BUYER_REVIEW_REMINDER_TEXT,
    });

    await this.auditService.recordDocusignEnvelopeSentAuditEvent({
      transactionId: link.transactionId,
      uploadLinkId: link.id,
      envelopeId: envelope.envelopeId,
      documentIds: documents.map((d) => d.id),
      buyerEmails: buyers.map((b) => b.email!),
      buyerAgentEmail: buyerAgent!.email!,
    });

    this.logger.log(`Seller Agent DocuSign send complete for link ${link.id}: envelope ${envelope.envelopeId}`);
    return envelope;
  }
}
