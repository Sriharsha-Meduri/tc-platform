import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UploadLinkEntity } from './entities/upload-link.entity';
import { UploadLinkRepository } from './upload-link.repository';
import { MailgunService } from '../auth/mailgun.service';
import { EmailTemplateService } from '../auth/email-template.service';
import { TransactionMessageEntity, MessageChannel, MessageDirection, MessageStatus } from '../transaction-messages/entities/transaction-message.entity';
import { TransactionStage } from '../transactions/entities/transaction-stage-instance.entity';
import { UploadLinkPurpose } from './upload-link.types';

/** The frontend's upload-link page root — kept in one place so a route rename only ever needs one edit. */
function buildUploadPageUrl(token: string): string {
  const webUrl = process.env.WEB_APP_URL ?? 'http://localhost:3001';
  return `${webUrl}/upload-link/${token}`;
}

export interface UploadLinkEmailContext {
  tcName: string | null;
  /**
   * The transaction-specific Mailgun-generated address
   * (`transaction.outboundEmailAddress`) — NEVER the TC's myTC login email.
   */
  transactionEmail: string | null;
  tcPhone: string | null;
  propertyAddress: string;
  outboundEmailAddress?: string | null;
  /** Footer reference for the recipient — the transaction's stable id (never a placeholder). */
  transactionId?: string | null;
  /**
   * Only used by the escrow welcome-email template's "please copy this
   * address on transaction communications" line — set only when a real,
   * valid transaction Mailgun address exists (never the signer's own
   * address). Every other purpose's template simply doesn't reference this
   * field, so it's a no-op for them.
   */
  ccInstructionEmail?: string | null;
}

interface PurposeEmailConfig {
  subjectPrefix: string;
  htmlTemplate: string;
  textTemplate: string;
}

/** One config per purpose — keeps each purpose's copy/subject independently reviewable without branching logic scattered through the send path. */
const PURPOSE_EMAIL_CONFIG: Record<UploadLinkPurpose, PurposeEmailConfig> = {
  document_upload: {
    subjectPrefix: 'Upload Transaction Documents',
    htmlTemplate: 'upload-link-request.html.hbs',
    textTemplate: 'upload-link-request.text.hbs',
  },
  seller_agent_document_upload: {
    subjectPrefix: 'Upload Seller-Side Transaction Documents',
    htmlTemplate: 'upload-link-request-seller-agent.html.hbs',
    textTemplate: 'upload-link-request-seller-agent.text.hbs',
  },
  escrow_officer_document_upload: {
    subjectPrefix: 'Escrow Onboarding – Upload Transaction Documents',
    htmlTemplate: 'upload-link-request-escrow.html.hbs',
    textTemplate: 'upload-link-request-escrow.text.hbs',
  },
  broker_document_upload: {
    subjectPrefix: 'Broker Document Upload',
    htmlTemplate: 'upload-link-request-broker.html.hbs',
    textTemplate: 'upload-link-request-broker.text.hbs',
  },
};

export interface RejectedDocumentSummary {
  fileName: string;
  reasons: string[];
}

export interface SellerAgentRejectionEmailResult {
  sent: boolean;
  providerMessageId: string | null;
}

export interface BuyerAgentRejectionEmailResult {
  sent: boolean;
  providerMessageId: string | null;
}

export interface EscrowRejectionEmailResult {
  sent: boolean;
  providerMessageId: string | null;
}

export interface SellerAgentDocusignConfirmationEmailResult {
  sent: boolean;
  providerMessageId: string | null;
}

export interface CdaReadyEmailResult {
  sent: boolean;
  providerMessageId: string | null;
}

export interface SignedCdaAvailableEmailResult {
  sent: boolean;
  providerMessageId: string | null;
}

export interface VpSentToBrokerEmailResult {
  sent: boolean;
  providerMessageId: string | null;
}

@Injectable()
export class UploadLinkEmailService {
  private readonly logger = new Logger(UploadLinkEmailService.name);

  constructor(
    private readonly uploadLinkRepo: UploadLinkRepository,
    private readonly mailgunService: MailgunService,
    private readonly emailTemplateService: EmailTemplateService,
    @InjectRepository(TransactionMessageEntity)
    private readonly messagesRepo: Repository<TransactionMessageEntity>,
  ) {}

  /**
   * Sends the upload-link email to the link's recipient, CC'ing `link.ccEmail`
   * when the link has one (e.g. the Seller Transaction Coordinator on a Seller
   * Agent link) — never to any other party. Subject/copy are selected by the
   * link's purpose. `token` is null when the caller is re-using an
   * already-delivered active link (see UploadLinkService.createSecureUploadLink)
   * — in that case this is a no-op, so retrying the submission workflow never
   * re-sends the email.
   */
  async sendUploadLinkEmail(link: UploadLinkEntity, token: string | null, ctx: UploadLinkEmailContext): Promise<void> {
    if (!token) {
      this.logger.log(`Upload link ${link.id} already delivered — skipping duplicate send`);
      return;
    }

    const uploadUrl = buildUploadPageUrl(token);

    const fromAddress = ctx.outboundEmailAddress
      ? `TC Platform <${ctx.outboundEmailAddress}>`
      : `TC Platform <noreply@txn.mytcapp.net>`;

    const config = PURPOSE_EMAIL_CONFIG[link.purpose as UploadLinkPurpose] ?? PURPOSE_EMAIL_CONFIG.document_upload;
    const subject = `${config.subjectPrefix} – ${ctx.propertyAddress}`;
    const templateCtx = {
      recipientName: link.recipientName,
      propertyAddress: ctx.propertyAddress,
      uploadUrl,
      tcName: ctx.tcName,
      transactionEmail: ctx.transactionEmail,
      tcPhone: ctx.tcPhone,
      transactionId: ctx.transactionId ?? link.transactionId,
      ccInstructionEmail: ctx.ccInstructionEmail ?? null,
    };

    const html = this.emailTemplateService.render(config.htmlTemplate, templateCtx);
    const text = this.emailTemplateService.render(config.textTemplate, templateCtx);

    try {
      const result = await this.mailgunService.sendEmail(link.recipientEmail, subject, html, text, fromAddress, link.ccEmail ?? undefined);

      await this.messagesRepo.save(
        this.messagesRepo.create({
          transactionId: link.transactionId,
          channel: MessageChannel.EMAIL,
          direction: MessageDirection.OUTBOUND,
          status: MessageStatus.SENT,
          subject,
          bodyText: text,
          bodyHtml: html,
          providerName: 'mailgun',
          providerMessageId: result?.messageId ?? null,
          recipientPartyId: link.recipientPartyId,
          stage: TransactionStage.CONTRACT,
          sentAt: new Date(),
          metadataJson: {
            to: link.recipientEmail,
            role: link.recipientRole,
            type: 'upload-link-request',
            uploadLinkId: link.id,
            purpose: link.purpose,
            ...(link.ccEmail ? { cc: link.ccEmail, ccRole: link.ccRole } : {}),
          },
        }),
      );

      await this.uploadLinkRepo.recordEmailSent(link.id, result?.messageId ?? null);
      this.logger.log(`Upload-link email sent to ${link.recipientEmail}${link.ccEmail ? ` (cc: ${link.ccEmail})` : ''} for link ${link.id}`);
    } catch (err) {
      this.logger.error(`Failed to send upload-link email for link ${link.id}: ${(err as Error).message}`);
    }
  }

  /**
   * Replies (via In-Reply-To/References on link.emailMessageId) to the same email
   * thread that originally delivered the Seller Agent's upload link, identifying
   * which document(s) failed validation and why, with the same secure link (built
   * from `token` — the raw token already in hand from this exact upload request,
   * never re-minted) so the Seller Agent can reupload corrected files. CCs
   * `link.ccEmail` (the Seller TC) whenever the link has one, same as the original
   * welcome email. Idempotency (at most one of these per upload attempt) is the
   * caller's responsibility — this method always sends when called.
   */
  async sendSellerAgentRejectionEmail(
    link: UploadLinkEntity,
    token: string,
    ctx: UploadLinkEmailContext,
    rejectedDocuments: RejectedDocumentSummary[],
    idempotencyKey: string | null,
  ): Promise<SellerAgentRejectionEmailResult> {
    const uploadUrl = buildUploadPageUrl(token);

    const fromAddress = ctx.outboundEmailAddress
      ? `TC Platform <${ctx.outboundEmailAddress}>`
      : `TC Platform <noreply@txn.mytcapp.net>`;

    const config = PURPOSE_EMAIL_CONFIG.seller_agent_document_upload;
    const subject = `Re: ${config.subjectPrefix} – ${ctx.propertyAddress}`;
    const templateCtx = {
      recipientName: link.recipientName,
      propertyAddress: ctx.propertyAddress,
      uploadUrl,
      rejectedDocuments,
      tcName: ctx.tcName,
      transactionEmail: ctx.transactionEmail,
      tcPhone: ctx.tcPhone,
      transactionId: ctx.transactionId ?? link.transactionId,
    };

    const html = this.emailTemplateService.render('upload-link-seller-agent-rejection.html.hbs', templateCtx);
    const text = this.emailTemplateService.render('upload-link-seller-agent-rejection.text.hbs', templateCtx);

    try {
      const result = await this.mailgunService.sendEmail(
        link.recipientEmail, subject, html, text, fromAddress, link.ccEmail ?? undefined, link.emailMessageId ?? undefined,
      );

      await this.messagesRepo.save(
        this.messagesRepo.create({
          transactionId: link.transactionId,
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
          stage: TransactionStage.CONTRACT,
          sentAt: new Date(),
          metadataJson: {
            to: link.recipientEmail,
            role: link.recipientRole,
            type: 'seller_agent_document_rejection',
            uploadLinkId: link.id,
            idempotencyKey,
            rejectedFileNames: rejectedDocuments.map((d) => d.fileName),
            ...(link.ccEmail ? { cc: link.ccEmail, ccRole: link.ccRole } : {}),
          },
        }),
      );

      this.logger.log(`Seller Agent rejection email sent to ${link.recipientEmail}${link.ccEmail ? ` (cc: ${link.ccEmail})` : ''} for link ${link.id} — ${rejectedDocuments.length} document(s) rejected`);
      return { sent: true, providerMessageId: result?.messageId ?? null };
    } catch (err) {
      this.logger.error(`Failed to send Seller Agent rejection email for link ${link.id}: ${(err as Error).message}`);
      return { sent: false, providerMessageId: null };
    }
  }

  /**
   * Replies (via In-Reply-To/References on link.emailMessageId) to the same email
   * thread that originally delivered the Buyer Agent's upload link, identifying
   * which RR/RRRR document(s) failed validation and why, with the same secure link
   * (built from `token` — the raw token already in hand from this exact upload
   * request, never re-minted) so the Buyer Agent can reupload corrected files.
   * Buyer Agent links don't carry a CC recipient the way Seller Agent links do,
   * but `link.ccEmail` is still honored generically in case one is ever set.
   * Idempotency (at most one of these per upload attempt) is the caller's
   * responsibility — this method always sends when called.
   */
  async sendBuyerAgentRejectionEmail(
    link: UploadLinkEntity,
    token: string,
    ctx: UploadLinkEmailContext,
    rejectedDocuments: RejectedDocumentSummary[],
    idempotencyKey: string | null,
  ): Promise<BuyerAgentRejectionEmailResult> {
    const uploadUrl = buildUploadPageUrl(token);

    const fromAddress = ctx.outboundEmailAddress
      ? `TC Platform <${ctx.outboundEmailAddress}>`
      : `TC Platform <noreply@txn.mytcapp.net>`;

    const config = PURPOSE_EMAIL_CONFIG.document_upload;
    const subject = `Re: ${config.subjectPrefix} – ${ctx.propertyAddress}`;
    const templateCtx = {
      recipientName: link.recipientName,
      propertyAddress: ctx.propertyAddress,
      uploadUrl,
      rejectedDocuments,
      tcName: ctx.tcName,
      transactionEmail: ctx.transactionEmail,
      tcPhone: ctx.tcPhone,
      transactionId: ctx.transactionId ?? link.transactionId,
    };

    const html = this.emailTemplateService.render('upload-link-buyer-agent-rejection.html.hbs', templateCtx);
    const text = this.emailTemplateService.render('upload-link-buyer-agent-rejection.text.hbs', templateCtx);

    try {
      const result = await this.mailgunService.sendEmail(
        link.recipientEmail, subject, html, text, fromAddress, link.ccEmail ?? undefined, link.emailMessageId ?? undefined,
      );

      await this.messagesRepo.save(
        this.messagesRepo.create({
          transactionId: link.transactionId,
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
          stage: TransactionStage.CONTRACT,
          sentAt: new Date(),
          metadataJson: {
            to: link.recipientEmail,
            role: link.recipientRole,
            type: 'buyer_agent_document_rejection',
            uploadLinkId: link.id,
            idempotencyKey,
            rejectedFileNames: rejectedDocuments.map((d) => d.fileName),
            ...(link.ccEmail ? { cc: link.ccEmail, ccRole: link.ccRole } : {}),
          },
        }),
      );

      this.logger.log(`Buyer Agent rejection email sent to ${link.recipientEmail}${link.ccEmail ? ` (cc: ${link.ccEmail})` : ''} for link ${link.id} — ${rejectedDocuments.length} document(s) rejected`);
      return { sent: true, providerMessageId: result?.messageId ?? null };
    } catch (err) {
      this.logger.error(`Failed to send Buyer Agent rejection email for link ${link.id}: ${(err as Error).message}`);
      return { sent: false, providerMessageId: null };
    }
  }

  /**
   * Same idempotency-dedup + reply-in-thread pattern as
   * sendSellerAgentRejectionEmail/sendBuyerAgentRejectionEmail, for the
   * Escrow Officer's synchronous validation gate.
   */
  async sendEscrowRejectionEmail(
    link: UploadLinkEntity,
    token: string,
    ctx: UploadLinkEmailContext,
    rejectedDocuments: RejectedDocumentSummary[],
    idempotencyKey: string | null,
  ): Promise<EscrowRejectionEmailResult> {
    const uploadUrl = buildUploadPageUrl(token);

    const fromAddress = ctx.outboundEmailAddress
      ? `TC Platform <${ctx.outboundEmailAddress}>`
      : `TC Platform <noreply@txn.mytcapp.net>`;

    const config = PURPOSE_EMAIL_CONFIG.escrow_officer_document_upload;
    const subject = `Re: ${config.subjectPrefix} – ${ctx.propertyAddress}`;
    const templateCtx = {
      recipientName: link.recipientName,
      propertyAddress: ctx.propertyAddress,
      uploadUrl,
      rejectedDocuments,
      tcName: ctx.tcName,
      transactionEmail: ctx.transactionEmail,
      tcPhone: ctx.tcPhone,
      transactionId: ctx.transactionId ?? link.transactionId,
    };

    const html = this.emailTemplateService.render('upload-link-escrow-rejection.html.hbs', templateCtx);
    const text = this.emailTemplateService.render('upload-link-escrow-rejection.text.hbs', templateCtx);

    try {
      const result = await this.mailgunService.sendEmail(
        link.recipientEmail, subject, html, text, fromAddress, link.ccEmail ?? undefined, link.emailMessageId ?? undefined,
      );

      await this.messagesRepo.save(
        this.messagesRepo.create({
          transactionId: link.transactionId,
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
          stage: TransactionStage.CONTRACT,
          sentAt: new Date(),
          metadataJson: {
            to: link.recipientEmail,
            role: link.recipientRole,
            type: 'escrow_document_rejection',
            uploadLinkId: link.id,
            idempotencyKey,
            rejectedFileNames: rejectedDocuments.map((d) => d.fileName),
            ...(link.ccEmail ? { cc: link.ccEmail, ccRole: link.ccRole } : {}),
          },
        }),
      );

      this.logger.log(`Escrow rejection email sent to ${link.recipientEmail}${link.ccEmail ? ` (cc: ${link.ccEmail})` : ''} for link ${link.id} — ${rejectedDocuments.length} document(s) rejected`);
      return { sent: true, providerMessageId: result?.messageId ?? null };
    } catch (err) {
      this.logger.error(`Failed to send Escrow rejection email for link ${link.id}: ${(err as Error).message}`);
      return { sent: false, providerMessageId: null };
    }
  }

  /**
   * Replies (via In-Reply-To/References on link.emailMessageId) to the same email
   * thread that originally delivered the Seller Agent's upload link, once their
   * required-document checklist becomes fully complete — notifying them the
   * documents are ready to go to the Buyer for signature, and asking them to
   * confirm before anything is sent. The confirmation action is the same secure
   * link (built from `token`, never re-minted); confirming happens via a button
   * click on that page, not by simply opening this email. CCs `link.ccEmail`
   * (the Seller TC) whenever the link has one. Idempotency (send at most once per
   * link) is the caller's responsibility via `docusignConfirmationRequestedAt`.
   */
  async sendSellerAgentDocusignConfirmationEmail(
    link: UploadLinkEntity,
    token: string,
    ctx: UploadLinkEmailContext,
  ): Promise<SellerAgentDocusignConfirmationEmailResult> {
    const uploadUrl = buildUploadPageUrl(token);

    const fromAddress = ctx.outboundEmailAddress
      ? `TC Platform <${ctx.outboundEmailAddress}>`
      : `TC Platform <noreply@txn.mytcapp.net>`;

    const config = PURPOSE_EMAIL_CONFIG.seller_agent_document_upload;
    const subject = `Re: ${config.subjectPrefix} – ${ctx.propertyAddress}`;
    const templateCtx = {
      recipientName: link.recipientName,
      propertyAddress: ctx.propertyAddress,
      uploadUrl,
      tcName: ctx.tcName,
      transactionEmail: ctx.transactionEmail,
      tcPhone: ctx.tcPhone,
      transactionId: ctx.transactionId ?? link.transactionId,
    };

    const html = this.emailTemplateService.render('upload-link-seller-agent-docusign-confirmation.html.hbs', templateCtx);
    const text = this.emailTemplateService.render('upload-link-seller-agent-docusign-confirmation.text.hbs', templateCtx);

    try {
      const result = await this.mailgunService.sendEmail(
        link.recipientEmail, subject, html, text, fromAddress, link.ccEmail ?? undefined, link.emailMessageId ?? undefined,
      );

      await this.messagesRepo.save(
        this.messagesRepo.create({
          transactionId: link.transactionId,
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
          stage: TransactionStage.CONTRACT,
          sentAt: new Date(),
          metadataJson: {
            to: link.recipientEmail,
            role: link.recipientRole,
            type: 'seller_agent_docusign_confirmation_request',
            uploadLinkId: link.id,
            ...(link.ccEmail ? { cc: link.ccEmail, ccRole: link.ccRole } : {}),
          },
        }),
      );

      this.logger.log(`Seller Agent DocuSign confirmation email sent to ${link.recipientEmail}${link.ccEmail ? ` (cc: ${link.ccEmail})` : ''} for link ${link.id}`);
      return { sent: true, providerMessageId: result?.messageId ?? null };
    } catch (err) {
      this.logger.error(`Failed to send Seller Agent DocuSign confirmation email for link ${link.id}: ${(err as Error).message}`);
      return { sent: false, providerMessageId: null };
    }
  }

  /**
   * Replies (via In-Reply-To/References on link.emailMessageId) to the same email
   * thread that originally delivered the Buyer Agent's or Broker's upload link, once
   * the CDA has been generated (or materially regenerated) — one shared template for
   * both purposes, since the copy ("your CDA is ready, use the same link") is
   * identical either way; only the subject's purpose-specific prefix differs (reused
   * from PURPOSE_EMAIL_CONFIG). CCs `link.ccEmail` whenever the link has one.
   * Idempotency (never send twice for the same CDA content) is CdaNotificationService's
   * responsibility via UploadLinkEntity.cdaNotifiedContentHash — this method always
   * sends when called.
   */
  async sendCdaReadyEmail(link: UploadLinkEntity, token: string, ctx: UploadLinkEmailContext): Promise<CdaReadyEmailResult> {
    const uploadUrl = buildUploadPageUrl(token);

    const fromAddress = ctx.outboundEmailAddress
      ? `TC Platform <${ctx.outboundEmailAddress}>`
      : `TC Platform <noreply@txn.mytcapp.net>`;

    const config = PURPOSE_EMAIL_CONFIG[link.purpose as UploadLinkPurpose] ?? PURPOSE_EMAIL_CONFIG.document_upload;
    const subject = `Re: ${config.subjectPrefix} – ${ctx.propertyAddress}`;
    const templateCtx = {
      recipientName: link.recipientName,
      propertyAddress: ctx.propertyAddress,
      uploadUrl,
      tcName: ctx.tcName,
      transactionEmail: ctx.transactionEmail,
      tcPhone: ctx.tcPhone,
      transactionId: ctx.transactionId ?? link.transactionId,
    };

    const html = this.emailTemplateService.render('upload-link-cda-ready.html.hbs', templateCtx);
    const text = this.emailTemplateService.render('upload-link-cda-ready.text.hbs', templateCtx);

    try {
      const result = await this.mailgunService.sendEmail(
        link.recipientEmail, subject, html, text, fromAddress, link.ccEmail ?? undefined, link.emailMessageId ?? undefined,
      );

      await this.messagesRepo.save(
        this.messagesRepo.create({
          transactionId: link.transactionId,
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
          stage: TransactionStage.CONTRACT,
          sentAt: new Date(),
          metadataJson: {
            to: link.recipientEmail,
            role: link.recipientRole,
            type: 'cda_ready_notification',
            uploadLinkId: link.id,
            ...(link.ccEmail ? { cc: link.ccEmail, ccRole: link.ccRole } : {}),
          },
        }),
      );

      this.logger.log(`CDA-ready email sent to ${link.recipientEmail}${link.ccEmail ? ` (cc: ${link.ccEmail})` : ''} for link ${link.id}`);
      return { sent: true, providerMessageId: result?.messageId ?? null };
    } catch (err) {
      this.logger.error(`Failed to send CDA-ready email for link ${link.id}: ${(err as Error).message}`);
      return { sent: false, providerMessageId: null };
    }
  }

  /**
   * Replies (via In-Reply-To/References on link.emailMessageId) to the same email
   * thread that originally delivered the Escrow Officer's upload link, once the
   * Broker uploads the signed CDA — notifying Escrow that it's received and
   * available through their existing link. Escrow-purpose-only; unlike
   * sendCdaReadyEmail, there's only one purpose this is ever sent for, so no
   * PURPOSE_EMAIL_CONFIG lookup is needed for the subject prefix.
   */
  async sendSignedCdaAvailableEmail(link: UploadLinkEntity, token: string, ctx: UploadLinkEmailContext): Promise<SignedCdaAvailableEmailResult> {
    const uploadUrl = buildUploadPageUrl(token);

    const fromAddress = ctx.outboundEmailAddress
      ? `TC Platform <${ctx.outboundEmailAddress}>`
      : `TC Platform <noreply@txn.mytcapp.net>`;

    const config = PURPOSE_EMAIL_CONFIG.escrow_officer_document_upload;
    const subject = `Re: ${config.subjectPrefix} – ${ctx.propertyAddress}`;
    const templateCtx = {
      recipientName: link.recipientName,
      propertyAddress: ctx.propertyAddress,
      uploadUrl,
      tcName: ctx.tcName,
      transactionEmail: ctx.transactionEmail,
      tcPhone: ctx.tcPhone,
      transactionId: ctx.transactionId ?? link.transactionId,
    };

    const html = this.emailTemplateService.render('upload-link-signed-cda-available.html.hbs', templateCtx);
    const text = this.emailTemplateService.render('upload-link-signed-cda-available.text.hbs', templateCtx);

    try {
      const result = await this.mailgunService.sendEmail(
        link.recipientEmail, subject, html, text, fromAddress, link.ccEmail ?? undefined, link.emailMessageId ?? undefined,
      );

      await this.messagesRepo.save(
        this.messagesRepo.create({
          transactionId: link.transactionId,
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
          stage: TransactionStage.CONTRACT,
          sentAt: new Date(),
          metadataJson: {
            to: link.recipientEmail,
            role: link.recipientRole,
            type: 'signed_cda_available_notification',
            uploadLinkId: link.id,
            ...(link.ccEmail ? { cc: link.ccEmail, ccRole: link.ccRole } : {}),
          },
        }),
      );

      this.logger.log(`Signed-CDA-available email sent to ${link.recipientEmail}${link.ccEmail ? ` (cc: ${link.ccEmail})` : ''} for link ${link.id}`);
      return { sent: true, providerMessageId: result?.messageId ?? null };
    } catch (err) {
      this.logger.error(`Failed to send signed-CDA-available email for link ${link.id}: ${(err as Error).message}`);
      return { sent: false, providerMessageId: null };
    }
  }

  /**
   * Replies (via In-Reply-To/References on link.emailMessageId) to the same email
   * thread that originally delivered the Broker's upload link, once a Verification
   * of Property document uploaded through the Buyer Agent Upload Link has passed
   * every required validation check and been auto-sent to the Broker via DocuSign
   * for signature. Broker-purpose-only — same single-purpose shape as
   * sendSignedCdaAvailableEmail, no PURPOSE_EMAIL_CONFIG lookup needed. This is a
   * distinct, informational reply from the separate signing-invite email DocuSign
   * itself sends directly to the Broker.
   */
  async sendVpSentToBrokerEmail(link: UploadLinkEntity, token: string, ctx: UploadLinkEmailContext): Promise<VpSentToBrokerEmailResult> {
    const uploadUrl = buildUploadPageUrl(token);

    const fromAddress = ctx.outboundEmailAddress
      ? `TC Platform <${ctx.outboundEmailAddress}>`
      : `TC Platform <noreply@txn.mytcapp.net>`;

    const config = PURPOSE_EMAIL_CONFIG.broker_document_upload;
    const subject = `Re: ${config.subjectPrefix} – ${ctx.propertyAddress}`;
    const templateCtx = {
      recipientName: link.recipientName,
      propertyAddress: ctx.propertyAddress,
      uploadUrl,
      tcName: ctx.tcName,
      transactionEmail: ctx.transactionEmail,
      tcPhone: ctx.tcPhone,
      transactionId: ctx.transactionId ?? link.transactionId,
    };

    const html = this.emailTemplateService.render('upload-link-vp-sent-to-broker.html.hbs', templateCtx);
    const text = this.emailTemplateService.render('upload-link-vp-sent-to-broker.text.hbs', templateCtx);

    try {
      const result = await this.mailgunService.sendEmail(
        link.recipientEmail, subject, html, text, fromAddress, link.ccEmail ?? undefined, link.emailMessageId ?? undefined,
      );

      await this.messagesRepo.save(
        this.messagesRepo.create({
          transactionId: link.transactionId,
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
          stage: TransactionStage.CONTRACT,
          sentAt: new Date(),
          metadataJson: {
            to: link.recipientEmail,
            role: link.recipientRole,
            type: 'vp_sent_to_broker_notification',
            uploadLinkId: link.id,
            ...(link.ccEmail ? { cc: link.ccEmail, ccRole: link.ccRole } : {}),
          },
        }),
      );

      this.logger.log(`VP-sent-to-broker email sent to ${link.recipientEmail}${link.ccEmail ? ` (cc: ${link.ccEmail})` : ''} for link ${link.id}`);
      return { sent: true, providerMessageId: result?.messageId ?? null };
    } catch (err) {
      this.logger.error(`Failed to send VP-sent-to-broker email for link ${link.id}: ${(err as Error).message}`);
      return { sent: false, providerMessageId: null };
    }
  }
}
