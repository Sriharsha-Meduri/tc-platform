import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TransactionEntity } from '../transactions/entities/transaction.entity';
import { TransactionMessageEntity, MessageChannel, MessageDirection, MessageStatus } from '../transaction-messages/entities/transaction-message.entity';
import { getTransactionCoordinatorContact } from '../transactions/transaction-coordinator-contact.util';
import { EscrowInformationService } from '../transaction-contact-information/escrow-information.service';
import { UploadLinkRepository } from '../upload-links/upload-link.repository';
import { ESCROW_OFFICER_TRANSACTION_DOCUMENT_UPLOAD } from '../upload-links/upload-link.types';
import { MailgunService } from '../auth/mailgun.service';
import { EmailTemplateService } from '../auth/email-template.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditAction } from '../audit-log/audit-log.entity';

/** Mirrors upload-link-email.service.ts's own module-local helper — deliberately duplicated rather than imported, since importing it would require importing UploadLinksModule, which itself imports DocuSignModule (see this file's own class doc comment for why). */
function buildUploadPageUrl(token: string): string {
  const webUrl = process.env.WEB_APP_URL ?? 'http://localhost:3001';
  return `${webUrl}/upload-link/${token}`;
}

/**
 * Replies on the Escrow Officer's own existing upload-link email thread once
 * the Broker completes signing the Verification of Property via DocuSign —
 * the DocuSign-triggered sibling of CdaNotificationService.notifyEscrowOfSignedCda
 * (which fires on a manual Broker upload instead).
 *
 * Deliberately self-contained and registered directly on DocuSignModule
 * rather than living in upload-links/ alongside CdaNotificationService: the
 * trigger point (DocuSignService.processCompletedEnvelope) lives in
 * DocuSignModule, and UploadLinksModule already imports DocuSignModule (for
 * VerificationOfPropertyBrokerDocusignService's own envelope-creation call) —
 * so DocuSignModule importing UploadLinksModule back would be circular.
 * UploadLinkRepository is safe to re-provide here directly (see its own doc
 * comment: "the single, dependency-light home for this logic... callable...
 * from anywhere else that only has this repository available"); the actual
 * email send is reimplemented in the same minimal style as
 * SignedDocumentNotificationService (this module's other self-contained
 * notifier) rather than routed through UploadLinkEmailService, for the same
 * circularity reason.
 */
@Injectable()
export class VpSignedEscrowNotificationService {
  private readonly logger = new Logger(VpSignedEscrowNotificationService.name);

  constructor(
    private readonly escrowInformationService: EscrowInformationService,
    private readonly uploadLinkRepo: UploadLinkRepository,
    @InjectRepository(TransactionMessageEntity)
    private readonly messagesRepo: Repository<TransactionMessageEntity>,
    private readonly mailgunService: MailgunService,
    private readonly emailTemplateService: EmailTemplateService,
    private readonly auditLogService: AuditLogService,
  ) {}

  /**
   * No-ops (logs and returns) when: no escrow email is on file yet, or
   * Escrow hasn't been onboarded yet (no upload link ever emailed to them —
   * nothing to reply to). Never throws — callers treat this as a best-effort
   * side effect of DocuSign completion processing.
   */
  async notifyEscrowOfSignedVp(transaction: TransactionEntity, documentId: string): Promise<void> {
    try {
      const escrowInfo = await this.escrowInformationService.findByTransaction(transaction.id);
      if (!escrowInfo?.escrowEmail) {
        this.logger.log(`No escrow email on file for transaction ${transaction.id} — skipping signed-VP notification`);
        return;
      }

      const existingLink = await this.uploadLinkRepo.findActiveForRecipientEmail(
        transaction.id, escrowInfo.escrowEmail, ESCROW_OFFICER_TRANSACTION_DOCUMENT_UPLOAD,
      );
      if (!existingLink || !existingLink.emailSentAt) {
        this.logger.log(`Escrow ${escrowInfo.escrowEmail} has no existing upload-link email thread yet for transaction ${transaction.id} — skipping signed-VP notification`);
        return;
      }

      const { link, token } = await this.uploadLinkRepo.regenerate(existingLink);
      const uploadUrl = buildUploadPageUrl(token);

      const fromAddress = transaction.outboundEmailAddress
        ? `TC Platform <${transaction.outboundEmailAddress}>`
        : `TC Platform <noreply@txn.mytcapp.net>`;

      const creatorContact = getTransactionCoordinatorContact(transaction, transaction.createdByAccount, this.logger);
      const propertyAddress = [transaction.propertyAddressLine1, transaction.propertyCity, transaction.propertyState]
        .filter(Boolean).join(', ') || transaction.propertyAddressLine1;

      const subject = `Re: Escrow Onboarding – Upload Transaction Documents – ${propertyAddress}`;
      const templateCtx = {
        recipientName: link.recipientName,
        propertyAddress,
        uploadUrl,
        tcName: creatorContact.name,
        transactionEmail: creatorContact.email,
        tcPhone: creatorContact.phone,
        transactionId: transaction.id,
      };

      const html = this.emailTemplateService.render('upload-link-signed-vp-available.html.hbs', templateCtx);
      const text = this.emailTemplateService.render('upload-link-signed-vp-available.text.hbs', templateCtx);

      const result = await this.mailgunService.sendEmail(
        link.recipientEmail, subject, html, text, fromAddress, link.ccEmail ?? undefined, link.emailMessageId ?? undefined,
      );

      await this.messagesRepo.save(
        this.messagesRepo.create({
          transactionId: transaction.id,
          channel: MessageChannel.EMAIL,
          direction: MessageDirection.OUTBOUND,
          status: MessageStatus.SENT,
          subject,
          bodyText: text,
          bodyHtml: html,
          providerName: 'mailgun',
          providerMessageId: result?.messageId ?? null,
          providerThreadId: link.emailMessageId,
          threadKey: link.emailMessageId,
          recipientPartyId: link.recipientPartyId,
          sentAt: new Date(),
          metadataJson: {
            to: link.recipientEmail,
            role: link.recipientRole,
            type: 'signed_vp_available_notification',
            uploadLinkId: link.id,
            documentId,
            ...(link.ccEmail ? { cc: link.ccEmail, ccRole: link.ccRole } : {}),
          },
        }),
      );

      this.logger.log(`Signed-VP-available email sent to ${link.recipientEmail} for link ${link.id}`);

      await this.auditLogService.log({
        accountId: null,
        action: AuditAction.SIGNED_VP_AVAILABLE_EMAIL_SENT,
        targetType: 'upload_link',
        targetId: link.id,
        targetDisplayName: transaction.transactionNumber,
        description: `Signed-VP availability notification sent to ${escrowInfo.escrowEmail} for transaction ${transaction.transactionNumber}`,
        details: { transactionId: transaction.id, uploadLinkId: link.id, recipientEmail: escrowInfo.escrowEmail, documentId },
      });
    } catch (err) {
      this.logger.error(`Signed-VP escrow notification failed for transaction ${transaction.id}, document ${documentId}: ${(err as Error).message}`);
    }
  }
}
