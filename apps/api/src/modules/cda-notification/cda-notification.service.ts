import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TransactionEntity, TransactionSide } from '../transactions/entities/transaction.entity';
import { TransactionPartyEntity, PartyRole } from '../transaction-parties/entities/transaction-party.entity';
import { TransactionDocumentsService } from '../transaction-documents/transaction-documents.service';
import { BuyerSideInformationService } from '../transaction-contact-information/buyer-side-information.service';
import { UploadLinkService } from '../upload-links/upload-link.service';
import { UploadLinkEmailService, UploadLinkEmailContext } from '../upload-links/upload-link-email.service';
import { UploadLinkRepository } from '../upload-links/upload-link.repository';
import { BUYER_AGENT_TRANSACTION_DOCUMENT_UPLOAD, BROKER_TRANSACTION_DOCUMENT_UPLOAD, ESCROW_OFFICER_TRANSACTION_DOCUMENT_UPLOAD, UploadLinkPurpose } from '../upload-links/upload-link.types';
import { getTransactionCoordinatorContact } from '../transactions/transaction-coordinator-contact.util';
import { EscrowInformationService } from '../transaction-contact-information/escrow-information.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditAction } from '../audit-log/audit-log.entity';
import { CDA_DOCUMENT_TYPE } from '../cda/cda.constants';

/**
 * Notifies the Buyer Agent and Broker, by replying on each of their own
 * existing upload-link email threads, once a CDA has actually become
 * available (or its content has materially changed). Deliberately
 * independent of whatever triggered CdaGenerationService.maybeGenerateCda —
 * self-contained, so it can be called identically from the Buyer
 * Agent/Broker save path (UploadLinkController.saveTransactionInfo) and from
 * the contract-price-change cascade (TransactionsService.update()), neither
 * of which is guaranteed to have a live token for the recipient(s) that need
 * notifying.
 *
 * Registered as a provider directly on UploadLinksModule (see
 * upload-links.module.ts) — not its own module — for the same reason
 * EscrowOnboardingService/BrokerOnboardingService are: it needs
 * UploadLinkService/UploadLinkEmailService/UploadLinkRepository, all of
 * which live in UploadLinksModule, and UploadLinksModule itself needs
 * CdaGenerationModule (for the controller's own CDA-generation trigger) —
 * making a reverse import circular.
 */
@Injectable()
export class CdaNotificationService {
  private readonly logger = new Logger(CdaNotificationService.name);

  constructor(
    private readonly buyerSideInformationService: BuyerSideInformationService,
    private readonly escrowInformationService: EscrowInformationService,
    private readonly transactionDocumentsService: TransactionDocumentsService,
    @InjectRepository(TransactionPartyEntity)
    private readonly partiesRepo: Repository<TransactionPartyEntity>,
    private readonly uploadLinkService: UploadLinkService,
    private readonly uploadLinkEmailService: UploadLinkEmailService,
    private readonly uploadLinkRepo: UploadLinkRepository,
    private readonly auditLogService: AuditLogService,
  ) {}

  /** Shared by every notification method below — the "from" identity and property address every upload-link email carries. */
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

  /**
   * No-ops (never throws) when: there's no CDA yet, the transaction isn't
   * buyer-side, a recipient's own upload link can't be found (shouldn't
   * happen — the CDA can't exist until both sides have already gone through
   * their own links), or that recipient was already notified about this
   * exact CDA content. Callers wrap this in try/catch anyway for genuine
   * failures (email send, DB), matching every other non-fatal auto-trigger
   * in this codebase.
   */
  async notifyIfCdaReady(transaction: TransactionEntity): Promise<void> {
    if (transaction.side !== TransactionSide.BUYER_SIDE) return;

    const cda = (await this.transactionDocumentsService.findActiveByTransaction(transaction.id))
      .find((doc) => doc.documentType === CDA_DOCUMENT_TYPE);
    if (!cda) return;

    const contentFingerprint = (cda.metadataJson as { contentFingerprint?: string } | null)?.contentFingerprint ?? null;
    if (!contentFingerprint) return;

    const [buyerAgentParty, buyerSide] = await Promise.all([
      this.partiesRepo.findOne({ where: { transactionId: transaction.id, partyRole: PartyRole.BUYER_AGENT } }),
      this.buyerSideInformationService.findByTransaction(transaction.id),
    ]);

    const ctx = this.buildEmailContext(transaction);

    if (buyerAgentParty?.email) {
      await this.notifyRecipient(transaction, BUYER_AGENT_TRANSACTION_DOCUMENT_UPLOAD, buyerAgentParty.email, contentFingerprint, ctx);
    }
    if (buyerSide?.brokerEmail) {
      await this.notifyRecipient(transaction, BROKER_TRANSACTION_DOCUMENT_UPLOAD, buyerSide.brokerEmail, contentFingerprint, ctx);
    }
  }

  private async notifyRecipient(
    transaction: TransactionEntity,
    purpose: UploadLinkPurpose,
    recipientEmail: string,
    contentFingerprint: string,
    ctx: UploadLinkEmailContext,
  ): Promise<void> {
    const existingLink = await this.uploadLinkService.findActiveLinkForEmail(transaction.id, recipientEmail, purpose);
    if (!existingLink || !existingLink.emailSentAt) return; // nothing to reply to yet

    if (existingLink.cdaNotifiedContentHash === contentFingerprint) {
      this.logger.log(`CDA content unchanged since the last notification to ${recipientEmail} for link ${existingLink.id} — skipping`);
      return;
    }

    // A fresh token is required to embed a working link in the email — the raw token
    // for an already-delivered link is never persisted (see UploadLinkEntity's own doc
    // comment), so regenerating is the only way to produce a clickable URL for a
    // recipient we're notifying outside of their own in-flight request. emailMessageId
    // carries forward automatically (see UploadLinkRepository.regenerate), so the reply
    // still threads into the original conversation.
    const { link, token } = await this.uploadLinkService.regenerateSecureUploadLink(existingLink.id);
    if (!token) return;

    const result = await this.uploadLinkEmailService.sendCdaReadyEmail(link, token, ctx);
    if (!result.sent) return;

    await this.uploadLinkRepo.recordCdaNotified(link.id, contentFingerprint);

    await this.auditLogService.log({
      accountId: null,
      action: AuditAction.CDA_NOTIFICATION_SENT,
      targetType: 'upload_link',
      targetId: link.id,
      targetDisplayName: transaction.transactionNumber,
      description: `CDA-ready notification sent to ${recipientEmail} for transaction ${transaction.transactionNumber}`,
      details: {
        transactionId: transaction.id,
        uploadLinkId: link.id,
        purpose,
        recipientEmail,
        contentFingerprint,
      },
    });
  }

  /**
   * Replies on the Escrow Officer's own existing upload-link email thread
   * once the Broker uploads the signed CDA — always sends (no content-
   * fingerprint dedup like notifyIfCdaReady above, since this is driven by a
   * discrete user action — an actual upload — rather than a recompute-on-
   * every-save trigger that can otherwise fire as a no-op). A repeat signed-
   * CDA upload (the broker corrects a mistake) sends a fresh notification
   * each time, which is the correct behavior: Escrow should know the file
   * changed. No-ops when Escrow hasn't been onboarded yet (no escrow email
   * saved, or their own welcome email hasn't gone out) — the same defensive
   * gate every other reply-notification here uses.
   */
  async notifyEscrowOfSignedCda(transaction: TransactionEntity): Promise<void> {
    const escrowInfo = await this.escrowInformationService.findByTransaction(transaction.id);
    if (!escrowInfo?.escrowEmail) return;

    const existingLink = await this.uploadLinkService.findActiveLinkForEmail(
      transaction.id, escrowInfo.escrowEmail, ESCROW_OFFICER_TRANSACTION_DOCUMENT_UPLOAD,
    );
    if (!existingLink || !existingLink.emailSentAt) return; // Escrow hasn't been onboarded yet — nothing to reply to

    const { link, token } = await this.uploadLinkService.regenerateSecureUploadLink(existingLink.id);
    if (!token) return;

    const ctx = this.buildEmailContext(transaction);
    const result = await this.uploadLinkEmailService.sendSignedCdaAvailableEmail(link, token, ctx);
    if (!result.sent) return;

    await this.auditLogService.log({
      accountId: null,
      action: AuditAction.SIGNED_CDA_AVAILABLE_EMAIL_SENT,
      targetType: 'upload_link',
      targetId: link.id,
      targetDisplayName: transaction.transactionNumber,
      description: `Signed CDA availability notification sent to ${escrowInfo.escrowEmail} for transaction ${transaction.transactionNumber}`,
      details: {
        transactionId: transaction.id,
        uploadLinkId: link.id,
        recipientEmail: escrowInfo.escrowEmail,
      },
    });
  }
}
