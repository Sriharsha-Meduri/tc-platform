import { Injectable } from '@nestjs/common';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditAction } from '../audit-log/audit-log.entity';

const AUTHENTICATION_SOURCE = 'secure email upload link';

export interface AuditCcRecipient {
  role: string;
  partyId: string | null;
  name: string;
  email: string;
}

export interface RecordValidationFailureAuditEventParams {
  transactionId: string;
  propertyAddress: string;
  originalFileName: string;
  uploadLinkId: string;
  recipientName: string;
  recipientEmail: string;
  reasons: string[];
  /** The synchronous pipeline's form-code guess for the rejected file, even though it was never saved — lets the Seller Agent checklist later flag the corresponding required item as "Reupload Required" rather than plain "Required". Null when the pipeline couldn't identify a form at all. */
  detectedFormCode: string | null;
}

export interface RecordRejectionEmailSentAuditEventParams {
  transactionId: string;
  uploadLinkId: string;
  recipientEmail: string;
  ccEmail?: string | null;
  rejectedFileNames: string[];
  providerMessageId: string | null;
}

export interface RecordDocusignConfirmationRequestedAuditEventParams {
  transactionId: string;
  uploadLinkId: string;
  recipientEmail: string;
  ccEmail?: string | null;
  providerMessageId: string | null;
}

export interface RecordDocusignConfirmedAuditEventParams {
  transactionId: string;
  uploadLinkId: string;
  recipientEmail: string;
}

export interface RecordDocusignEnvelopeSentAuditEventParams {
  transactionId: string;
  uploadLinkId: string;
  envelopeId: string | null;
  documentIds: string[];
  buyerEmails: string[];
  buyerAgentEmail: string;
}

export interface RecordDocumentDocusignSendFailedAuditEventParams {
  transactionId: string;
  uploadLinkId: string;
  documentId: string;
  /** Sanitized, user-facing message only — never the raw DocuSign API response body. */
  reason: string;
}

export interface RecordUploadAuditEventParams {
  transactionId: string;
  propertyAddress: string;
  documentId: string | null;
  originalFileName: string;
  storageKey: string | null;
  fileType: string;
  fileSize: number;
  /** Generic recipient identity — whatever role the upload link was issued to (Buyer Agent, Seller Agent, others later). */
  recipientRole: string;
  recipientPartyId: string | null;
  recipientName: string;
  recipientEmail: string;
  /** The secondary party CC'd on the link's delivery email (e.g. Seller TC on a Seller Agent link), when applicable. */
  ccRecipient?: AuditCcRecipient | null;
  uploadLinkId: string;
  uploadLinkPurpose: string;
  uploadSource: string;
  /** The Mailgun message ID for the email that delivered this link, so the audit trail can be cross-referenced to the actual send. */
  emailMessageId?: string | null;
  status: 'success' | 'failed';
  failureReason?: string | null;
}

/**
 * Thin wrapper around the existing, already-append-only AuditLogService —
 * this module doesn't need a bespoke audit table, it just needs a
 * consistent, well-defined `details` shape for upload events.
 *
 * Because no login is required for this upload path, attribution is to the
 * party associated with the secure token, not an authenticated account —
 * both `description` and `details.authenticationSource` say so explicitly
 * rather than implying login-verified identity.
 */
@Injectable()
export class UploadAuditService {
  constructor(private readonly auditLogService: AuditLogService) {}

  async recordUploadAuditEvent(params: RecordUploadAuditEventParams): Promise<void> {
    const now = new Date();

    await this.auditLogService.log({
      action: AuditAction.DOCUMENT_UPLOADED,
      targetType: 'transaction_document',
      targetId: params.documentId,
      targetDisplayName: params.originalFileName,
      description: params.status === 'success'
        ? `${params.originalFileName} uploaded via secure upload link by ${params.recipientName} (${params.recipientRole}) — identity attributed to the link's token, not an authenticated login`
        : `Upload of ${params.originalFileName} via secure upload link failed: ${params.failureReason ?? 'unknown error'}`,
      details: {
        transactionId: params.transactionId,
        propertyAddress: params.propertyAddress,
        documentId: params.documentId,
        originalFileName: params.originalFileName,
        storageKey: params.storageKey,
        fileType: params.fileType,
        fileSize: params.fileSize,
        recipientRole: params.recipientRole,
        recipientPartyId: params.recipientPartyId,
        recipientName: params.recipientName,
        recipientEmail: params.recipientEmail,
        ccRecipientRole: params.ccRecipient?.role ?? null,
        ccRecipientPartyId: params.ccRecipient?.partyId ?? null,
        ccRecipientName: params.ccRecipient?.name ?? null,
        ccRecipientEmail: params.ccRecipient?.email ?? null,
        uploadLinkId: params.uploadLinkId,
        uploadLinkPurpose: params.uploadLinkPurpose,
        uploadSource: params.uploadSource,
        emailMessageId: params.emailMessageId ?? null,
        authenticationSource: AUTHENTICATION_SOURCE,
        uploadedAtUtc: now.toISOString(),
        status: params.status,
        failureReason: params.failureReason ?? null,
      },
    });
  }

  /** A Seller Agent document that was NOT saved because it failed the synchronous compliance-validation gate. */
  async recordValidationFailureAuditEvent(params: RecordValidationFailureAuditEventParams): Promise<void> {
    await this.auditLogService.log({
      action: AuditAction.SELLER_AGENT_DOCUMENT_VALIDATION_FAILED,
      targetType: 'upload_link',
      targetId: params.uploadLinkId,
      targetDisplayName: params.originalFileName,
      description: `${params.originalFileName} uploaded by ${params.recipientName} (${params.recipientEmail}) via the Seller Agent secure upload link failed validation and was not saved: ${params.reasons.join('; ')}`,
      details: {
        transactionId: params.transactionId,
        propertyAddress: params.propertyAddress,
        originalFileName: params.originalFileName,
        uploadLinkId: params.uploadLinkId,
        recipientName: params.recipientName,
        recipientEmail: params.recipientEmail,
        reasons: params.reasons,
        detectedFormCode: params.detectedFormCode,
        authenticationSource: AUTHENTICATION_SOURCE,
      },
    });
  }

  /** The consolidated reply-email notifying the Seller Agent (and Seller TC, when CC'd) of rejected document(s). */
  async recordRejectionEmailSentAuditEvent(params: RecordRejectionEmailSentAuditEventParams): Promise<void> {
    await this.auditLogService.log({
      action: AuditAction.SELLER_AGENT_REJECTION_EMAIL_SENT,
      targetType: 'upload_link',
      targetId: params.uploadLinkId,
      targetDisplayName: params.rejectedFileNames.join(', '),
      description: `Validation-failure reply email sent to ${params.recipientEmail}${params.ccEmail ? ` (cc: ${params.ccEmail})` : ''} for ${params.rejectedFileNames.length} rejected document(s)`,
      details: {
        transactionId: params.transactionId,
        uploadLinkId: params.uploadLinkId,
        recipientEmail: params.recipientEmail,
        ccEmail: params.ccEmail ?? null,
        rejectedFileNames: params.rejectedFileNames,
        providerMessageId: params.providerMessageId,
      },
    });
  }

  /** A Buyer Agent RR/RRRR document that was NOT saved because it failed the synchronous compliance-validation gate. */
  async recordBuyerAgentValidationFailureAuditEvent(params: RecordValidationFailureAuditEventParams): Promise<void> {
    await this.auditLogService.log({
      action: AuditAction.BUYER_AGENT_DOCUMENT_VALIDATION_FAILED,
      targetType: 'upload_link',
      targetId: params.uploadLinkId,
      targetDisplayName: params.originalFileName,
      description: `${params.originalFileName} uploaded by ${params.recipientName} (${params.recipientEmail}) via the Buyer Agent secure upload link failed validation and was not saved: ${params.reasons.join('; ')}`,
      details: {
        transactionId: params.transactionId,
        propertyAddress: params.propertyAddress,
        originalFileName: params.originalFileName,
        uploadLinkId: params.uploadLinkId,
        recipientName: params.recipientName,
        recipientEmail: params.recipientEmail,
        reasons: params.reasons,
        detectedFormCode: params.detectedFormCode,
        authenticationSource: AUTHENTICATION_SOURCE,
      },
    });
  }

  /** The consolidated reply-email notifying the Buyer Agent of rejected RR/RRRR document(s). */
  async recordBuyerAgentRejectionEmailSentAuditEvent(params: RecordRejectionEmailSentAuditEventParams): Promise<void> {
    await this.auditLogService.log({
      action: AuditAction.BUYER_AGENT_REJECTION_EMAIL_SENT,
      targetType: 'upload_link',
      targetId: params.uploadLinkId,
      targetDisplayName: params.rejectedFileNames.join(', '),
      description: `Validation-failure reply email sent to ${params.recipientEmail}${params.ccEmail ? ` (cc: ${params.ccEmail})` : ''} for ${params.rejectedFileNames.length} rejected document(s)`,
      details: {
        transactionId: params.transactionId,
        uploadLinkId: params.uploadLinkId,
        recipientEmail: params.recipientEmail,
        ccEmail: params.ccEmail ?? null,
        rejectedFileNames: params.rejectedFileNames,
        providerMessageId: params.providerMessageId,
      },
    });
  }

  /** An Escrow Officer document that was NOT saved because it failed the synchronous compliance-validation gate. */
  async recordEscrowValidationFailureAuditEvent(params: RecordValidationFailureAuditEventParams): Promise<void> {
    await this.auditLogService.log({
      action: AuditAction.ESCROW_DOCUMENT_VALIDATION_FAILED,
      targetType: 'upload_link',
      targetId: params.uploadLinkId,
      targetDisplayName: params.originalFileName,
      description: `${params.originalFileName} uploaded by ${params.recipientName} (${params.recipientEmail}) via the Escrow Officer secure upload link failed validation and was not saved: ${params.reasons.join('; ')}`,
      details: {
        transactionId: params.transactionId,
        propertyAddress: params.propertyAddress,
        originalFileName: params.originalFileName,
        uploadLinkId: params.uploadLinkId,
        recipientName: params.recipientName,
        recipientEmail: params.recipientEmail,
        reasons: params.reasons,
        detectedFormCode: params.detectedFormCode,
        authenticationSource: AUTHENTICATION_SOURCE,
      },
    });
  }

  /** The consolidated reply-email notifying the Escrow Officer of rejected document(s). */
  async recordEscrowRejectionEmailSentAuditEvent(params: RecordRejectionEmailSentAuditEventParams): Promise<void> {
    await this.auditLogService.log({
      action: AuditAction.ESCROW_REJECTION_EMAIL_SENT,
      targetType: 'upload_link',
      targetId: params.uploadLinkId,
      targetDisplayName: params.rejectedFileNames.join(', '),
      description: `Validation-failure reply email sent to ${params.recipientEmail}${params.ccEmail ? ` (cc: ${params.ccEmail})` : ''} for ${params.rejectedFileNames.length} rejected document(s)`,
      details: {
        transactionId: params.transactionId,
        uploadLinkId: params.uploadLinkId,
        recipientEmail: params.recipientEmail,
        ccEmail: params.ccEmail ?? null,
        rejectedFileNames: params.rejectedFileNames,
        providerMessageId: params.providerMessageId,
      },
    });
  }

  /** The Seller Agent's checklist just became fully complete and was asked to confirm sending everything to the Buyer via DocuSign. */
  async recordDocusignConfirmationRequestedAuditEvent(params: RecordDocusignConfirmationRequestedAuditEventParams): Promise<void> {
    await this.auditLogService.log({
      action: AuditAction.SELLER_DOCUSIGN_CONFIRMATION_REQUESTED,
      targetType: 'upload_link',
      targetId: params.uploadLinkId,
      targetDisplayName: null,
      description: `DocuSign confirmation request sent to ${params.recipientEmail}${params.ccEmail ? ` (cc: ${params.ccEmail})` : ''} — required checklist complete`,
      details: {
        transactionId: params.transactionId,
        uploadLinkId: params.uploadLinkId,
        recipientEmail: params.recipientEmail,
        ccEmail: params.ccEmail ?? null,
        providerMessageId: params.providerMessageId,
      },
    });
  }

  /** The Seller confirmed sending their documents to the Buyer for signature. */
  async recordDocusignConfirmedAuditEvent(params: RecordDocusignConfirmedAuditEventParams): Promise<void> {
    await this.auditLogService.log({
      action: AuditAction.SELLER_DOCUSIGN_CONFIRMED,
      targetType: 'upload_link',
      targetId: params.uploadLinkId,
      targetDisplayName: null,
      description: `Seller Agent (${params.recipientEmail}) confirmed sending documents to the Buyer via DocuSign`,
      details: {
        transactionId: params.transactionId,
        uploadLinkId: params.uploadLinkId,
        recipientEmail: params.recipientEmail,
      },
    });
  }

  /** The DocuSign envelope was created and sent to the Buyer(s), CC'ing the Buyer Agent. */
  async recordDocusignEnvelopeSentAuditEvent(params: RecordDocusignEnvelopeSentAuditEventParams): Promise<void> {
    await this.auditLogService.log({
      action: AuditAction.SELLER_DOCUSIGN_ENVELOPE_SENT,
      targetType: 'upload_link',
      targetId: params.uploadLinkId,
      targetDisplayName: params.envelopeId,
      description: `DocuSign envelope ${params.envelopeId ?? ''} sent to ${params.buyerEmails.join(', ')} (cc: ${params.buyerAgentEmail}) with ${params.documentIds.length} document(s)`,
      details: {
        transactionId: params.transactionId,
        uploadLinkId: params.uploadLinkId,
        envelopeId: params.envelopeId,
        documentIds: params.documentIds,
        buyerEmails: params.buyerEmails,
        buyerAgentEmail: params.buyerAgentEmail,
      },
    });
  }

  /** Form codes the synchronous validation gate rejected for this upload link, recent-first — drives the checklist's 'reupload_required' status. */
  async findRecentlyRejectedFormCodes(uploadLinkId: string): Promise<ReadonlySet<string>> {
    const events = await this.auditLogService.findByTarget('upload_link', uploadLinkId);
    const formCodes = events
      .filter((e) => e.action === AuditAction.SELLER_AGENT_DOCUMENT_VALIDATION_FAILED)
      .map((e) => (e.detailsJson as Record<string, unknown> | null)?.detectedFormCode as string | null)
      .filter((code): code is string => !!code);
    return new Set(formCodes);
  }

  /** Form codes (RR/RRRR) the synchronous validation gate rejected for this Buyer Agent upload link, recent-first — drives the optional-checklist's 'reupload_required' status. */
  async findRecentlyRejectedBuyerAgentFormCodes(uploadLinkId: string): Promise<ReadonlySet<string>> {
    const events = await this.auditLogService.findByTarget('upload_link', uploadLinkId);
    const formCodes = events
      .filter((e) => e.action === AuditAction.BUYER_AGENT_DOCUMENT_VALIDATION_FAILED)
      .map((e) => (e.detailsJson as Record<string, unknown> | null)?.detectedFormCode as string | null)
      .filter((code): code is string => !!code);
    return new Set(formCodes);
  }

  /**
   * The actual failure reason messages behind each rejected form code for
   * this Seller Agent upload link — a sibling of findRecentlyRejectedFormCodes
   * (same query, same event filter), except this one keeps `reasons` instead
   * of discarding them, for the checklist's "what needs to be corrected"
   * dropdown content. Events are recent-first, so the first occurrence of a
   * form code sets its reasons — a later (older) rejection of the same form
   * never overwrites the most recent one.
   */
  async findMostRecentRejectionReasons(uploadLinkId: string): Promise<Map<string, string[]>> {
    const events = await this.auditLogService.findByTarget('upload_link', uploadLinkId);
    const reasonsByFormCode = new Map<string, string[]>();
    for (const e of events) {
      if (e.action !== AuditAction.SELLER_AGENT_DOCUMENT_VALIDATION_FAILED) continue;
      const details = e.detailsJson as Record<string, unknown> | null;
      const formCode = details?.detectedFormCode as string | null;
      const reasons = details?.reasons as string[] | undefined;
      if (!formCode || reasonsByFormCode.has(formCode)) continue;
      reasonsByFormCode.set(formCode, reasons ?? []);
    }
    return reasonsByFormCode;
  }

  /** Buyer Agent sibling of findMostRecentRejectionReasons — same shape, scoped to BUYER_AGENT_DOCUMENT_VALIDATION_FAILED events, for the Buyer Agent checklist's own "what needs to be corrected" dropdown content. */
  async findMostRecentBuyerAgentRejectionReasons(uploadLinkId: string): Promise<Map<string, string[]>> {
    const events = await this.auditLogService.findByTarget('upload_link', uploadLinkId);
    const reasonsByFormCode = new Map<string, string[]>();
    for (const e of events) {
      if (e.action !== AuditAction.BUYER_AGENT_DOCUMENT_VALIDATION_FAILED) continue;
      const details = e.detailsJson as Record<string, unknown> | null;
      const formCode = details?.detectedFormCode as string | null;
      const reasons = details?.reasons as string[] | undefined;
      if (!formCode || reasonsByFormCode.has(formCode)) continue;
      reasonsByFormCode.set(formCode, reasons ?? []);
    }
    return reasonsByFormCode;
  }

  /** Escrow sibling of findMostRecentRejectionReasons/findMostRecentBuyerAgentRejectionReasons — same shape, scoped to ESCROW_DOCUMENT_VALIDATION_FAILED events. */
  async findMostRecentEscrowRejectionReasons(uploadLinkId: string): Promise<Map<string, string[]>> {
    const events = await this.auditLogService.findByTarget('upload_link', uploadLinkId);
    const reasonsByFormCode = new Map<string, string[]>();
    for (const e of events) {
      if (e.action !== AuditAction.ESCROW_DOCUMENT_VALIDATION_FAILED) continue;
      const details = e.detailsJson as Record<string, unknown> | null;
      const formCode = details?.detectedFormCode as string | null;
      const reasons = details?.reasons as string[] | undefined;
      if (!formCode || reasonsByFormCode.has(formCode)) continue;
      reasonsByFormCode.set(formCode, reasons ?? []);
    }
    return reasonsByFormCode;
  }

  /** A per-document DocuSign send attempt whose DocuSign API call itself failed — the envelope was never created on DocuSign's side. */
  async recordDocumentDocusignSendFailedAuditEvent(params: RecordDocumentDocusignSendFailedAuditEventParams): Promise<void> {
    await this.auditLogService.log({
      action: AuditAction.SELLER_AGENT_DOCUMENT_DOCUSIGN_SEND_FAILED,
      targetType: 'transaction_document',
      targetId: params.documentId,
      targetDisplayName: null,
      description: `DocuSign send failed for document ${params.documentId}: ${params.reason}`,
      details: {
        transactionId: params.transactionId,
        uploadLinkId: params.uploadLinkId,
        documentId: params.documentId,
        reason: params.reason,
      },
    });
  }
}
