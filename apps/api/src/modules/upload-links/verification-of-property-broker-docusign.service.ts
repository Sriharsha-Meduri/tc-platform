import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TransactionEntity } from '../transactions/entities/transaction.entity';
import { TransactionDocumentsService } from '../transaction-documents/transaction-documents.service';
import { BuyerSideInformationService } from '../transaction-contact-information/buyer-side-information.service';
import { DocuSignService } from '../docusign/docusign.service';
import { DocuSignEnvelopeEntity, DocuSignEnvelopeStatus } from '../docusign/entities/docusign-envelope.entity';
import { BlockerOverrideService } from '../blocker-overrides/blocker-override.service';
import { UploadLinkService } from './upload-link.service';
import { UploadLinkEmailService, UploadLinkEmailContext } from './upload-link-email.service';
import { BROKER_TRANSACTION_DOCUMENT_UPLOAD } from './upload-link.types';
import { getTransactionCoordinatorContact } from '../transactions/transaction-coordinator-contact.util';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditAction } from '../audit-log/audit-log.entity';

/** Envelope statuses that don't block a fresh send for the same document — mirrors SellerAgentDocumentDocusignService's own dedup rule. */
const NON_BLOCKING_ENVELOPE_STATUSES = new Set<string>([
  DocuSignEnvelopeStatus.DECLINED,
  DocuSignEnvelopeStatus.VOIDED,
  DocuSignEnvelopeStatus.FAILED,
]);

/**
 * Auto-sends a Verification of Property (VP) document to the Broker via
 * DocuSign the moment it's uploaded through the Buyer Agent Upload Link and
 * passes every required validation check — then replies on the Broker's own
 * existing upload-link email thread to let them know. Called from
 * ExternalDocumentUploadService right after a VP-form document is stored
 * with a completed, passing synchronous validation result; entirely
 * best-effort — every public entry point here catches its own errors and
 * never throws, so a DocuSign or email failure never turns an otherwise-
 * successful document upload into a failed HTTP response.
 *
 * Registered directly on UploadLinksModule (not its own module) for the
 * same reason CdaNotificationService/BrokerOnboardingService are — it needs
 * UploadLinkService/UploadLinkEmailService, both of which live here.
 */
@Injectable()
export class VerificationOfPropertyBrokerDocusignService {
  private readonly logger = new Logger(VerificationOfPropertyBrokerDocusignService.name);

  constructor(
    private readonly documentsService: TransactionDocumentsService,
    private readonly buyerSideInformationService: BuyerSideInformationService,
    private readonly docuSignService: DocuSignService,
    private readonly blockerOverrideService: BlockerOverrideService,
    @InjectRepository(DocuSignEnvelopeEntity)
    private readonly envelopeRepo: Repository<DocuSignEnvelopeEntity>,
    private readonly uploadLinkService: UploadLinkService,
    private readonly uploadLinkEmailService: UploadLinkEmailService,
    private readonly auditLogService: AuditLogService,
  ) {}

  /**
   * Entry point — call once per VP document right after it's stored with a
   * completed, passing synchronous validation result. No-ops (logs and
   * returns) for every condition that means "nothing to send yet": the
   * document isn't really a validated, blocker-free VP; there's no broker
   * email on file for this transaction; or this exact document has already
   * been sent to the broker via a still-live envelope.
   */
  async handleVpUploaded(transaction: TransactionEntity, documentId: string): Promise<void> {
    try {
      const eligible = await this.isDocumentEligible(transaction.id, documentId);
      if (!eligible) return;

      const buyerSide = await this.buyerSideInformationService.findByTransaction(transaction.id);
      if (!buyerSide?.brokerEmail) {
        this.logger.log(`No broker email on file for transaction ${transaction.id} — skipping VP-to-broker DocuSign send`);
        return;
      }

      const blockingEnvelope = await this.findBlockingEnvelopeForDocument(transaction.id, documentId);
      if (blockingEnvelope) {
        this.logger.log(`VP document ${documentId} already sent to the broker via DocuSign (envelope ${blockingEnvelope.envelopeId}) — skipping`);
        return;
      }

      const sent = await this.sendToBroker(transaction, documentId, buyerSide.brokerFullName, buyerSide.brokerEmail);
      if (!sent) return;

      await this.notifyBroker(transaction, buyerSide.brokerEmail, buyerSide.brokerFullName);
    } catch (err) {
      this.logger.error(`VP-to-broker DocuSign workflow failed for transaction ${transaction.id}, document ${documentId}: ${(err as Error).message}`);
    }
  }

  /** Re-validates independently of whatever gate already ran at upload time — never trusts a stale/external caller's assumption. */
  private async isDocumentEligible(transactionId: string, documentId: string): Promise<boolean> {
    const doc = await this.documentsService.findOne(documentId).catch(() => null);
    if (!doc || doc.formCode !== 'VP' || doc.analysisStatus !== 'completed') return false;

    const metadata = doc.metadataJson as { compliance?: { blockers?: Array<{ code: string }> } } | null;
    const overrides = await this.blockerOverrideService.findForTransaction(transactionId);
    if (this.blockerOverrideService.hasActiveBlockers(metadata?.compliance?.blockers, overrides, { documentId: doc.id, formCode: 'VP' })) {
      return false;
    }
    return true;
  }

  private async findBlockingEnvelopeForDocument(transactionId: string, documentId: string): Promise<DocuSignEnvelopeEntity | null> {
    const envelopes = await this.envelopeRepo.find({ where: { transactionId }, order: { createdAt: 'DESC' } });
    return envelopes.find((e) => (e.documentIds ?? []).includes(documentId) && !NON_BLOCKING_ENVELOPE_STATUSES.has(e.status)) ?? null;
  }

  private async sendToBroker(transaction: TransactionEntity, documentId: string, brokerFullName: string | null, brokerEmail: string): Promise<boolean> {
    try {
      const envelope = await this.docuSignService.createEnvelope({
        transactionId: transaction.id,
        documentIds: [documentId],
        signers: [{ name: brokerFullName ?? 'Broker', email: brokerEmail, role: 'Broker' }],
        emailSubject: `Verification of Property – Signature Required`,
        emailBody: 'The Verification of Property (VP) has passed validation and is ready for your signature.',
      });

      await this.auditLogService.log({
        accountId: null,
        action: AuditAction.VP_SENT_TO_BROKER_VIA_DOCUSIGN,
        targetType: 'transaction_document',
        targetId: documentId,
        targetDisplayName: transaction.transactionNumber,
        description: `Verification of Property sent to Broker (${brokerEmail}) via DocuSign for transaction ${transaction.transactionNumber}`,
        details: { transactionId: transaction.id, documentId, envelopeId: envelope.envelopeId, brokerEmail },
      });

      this.logger.log(`VP document ${documentId} sent to broker ${brokerEmail} via DocuSign — envelope ${envelope.envelopeId}`);
      return true;
    } catch (err) {
      const sanitizedReason = 'The DocuSign envelope could not be created. Please try again.';
      this.logger.error(`Failed to send VP document ${documentId} to broker via DocuSign: ${(err as Error).message}`);

      await this.envelopeRepo.save(this.envelopeRepo.create({
        transactionId: transaction.id,
        status: DocuSignEnvelopeStatus.FAILED,
        subject: 'Verification of Property – Signature Required',
        documentIds: [documentId],
        error: sanitizedReason,
      }));

      await this.auditLogService.log({
        accountId: null,
        action: AuditAction.VP_SENT_TO_BROKER_VIA_DOCUSIGN,
        targetType: 'transaction_document',
        targetId: documentId,
        targetDisplayName: transaction.transactionNumber,
        description: `Failed to send Verification of Property to Broker via DocuSign for transaction ${transaction.transactionNumber}`,
        details: { transactionId: transaction.id, documentId, brokerEmail, error: sanitizedReason },
      });

      return false;
    }
  }

  /**
   * Replies on the Broker's own existing upload-link email thread — the
   * exact same "regenerate to carry the token forward, emailMessageId comes
   * along automatically" mechanism CdaNotificationService uses. No-ops
   * silently when the Broker hasn't been onboarded yet (no welcome email
   * sent yet, so there's no thread to reply into) — the DocuSign send above
   * still went through independently; only this notification is skipped.
   */
  private async notifyBroker(transaction: TransactionEntity, brokerEmail: string, brokerFullName: string | null): Promise<void> {
    const existingLink = await this.uploadLinkService.findActiveLinkForEmail(transaction.id, brokerEmail, BROKER_TRANSACTION_DOCUMENT_UPLOAD);
    if (!existingLink || !existingLink.emailSentAt) {
      this.logger.log(`Broker ${brokerEmail} has no existing upload-link email thread yet for transaction ${transaction.id} — skipping VP notification`);
      return;
    }

    const { link, token } = await this.uploadLinkService.regenerateSecureUploadLink(existingLink.id);
    if (!token) return;

    const ctx = this.buildEmailContext(transaction);
    const result = await this.uploadLinkEmailService.sendVpSentToBrokerEmail(link, token, ctx);
    if (!result.sent) return;

    await this.auditLogService.log({
      accountId: null,
      action: AuditAction.VP_BROKER_NOTIFICATION_SENT,
      targetType: 'upload_link',
      targetId: link.id,
      targetDisplayName: transaction.transactionNumber,
      description: `VP-sent-for-signature notification sent to ${brokerEmail} for transaction ${transaction.transactionNumber}`,
      details: { transactionId: transaction.id, uploadLinkId: link.id, brokerEmail, brokerFullName },
    });
  }

  /** Shared "from" identity and property address every upload-link email carries — mirrors CdaNotificationService's own helper. */
  private buildEmailContext(transaction: TransactionEntity): UploadLinkEmailContext {
    const creatorContact = getTransactionCoordinatorContact(transaction, transaction.createdByAccount, this.logger);
    const propertyAddress = [transaction.propertyAddressLine1, transaction.propertyCity, transaction.propertyState]
      .filter(Boolean).join(', ') || transaction.propertyAddressLine1;
    return {
      tcName: creatorContact.name,
      transactionEmail: creatorContact.email,
      tcPhone: creatorContact.phone,
      propertyAddress,
      transactionId: transaction.id,
      outboundEmailAddress: transaction.outboundEmailAddress,
    };
  }
}
