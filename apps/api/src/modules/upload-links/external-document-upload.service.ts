import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UploadLinkService } from './upload-link.service';
import { UploadLinkRepository } from './upload-link.repository';
import { FileValidationService } from './file-validation.service';
import { TransactionDocumentStorageService } from './transaction-document-storage.service';
import { UploadAuditService, AuditCcRecipient } from './upload-audit.service';
import { UploadLinkEmailService, RejectedDocumentSummary } from './upload-link-email.service';
import {
  getDefaultAllowedFileConfig, UploadLinkPurpose, BUYER_AGENT_TRANSACTION_DOCUMENT_UPLOAD,
  ESCROW_OFFICER_TRANSACTION_DOCUMENT_UPLOAD, SELLER_AGENT_TRANSACTION_DOCUMENT_UPLOAD, HOA_DOCUMENT_TYPE,
  ALL_SPECIAL_BUYER_AGENT_DOCUMENT_TYPES, REQUIRED_ESCROW_DOCUMENT_TYPES, BROKER_TRANSACTION_DOCUMENT_UPLOAD,
} from './upload-link.types';
import { UploadLinkEntity } from './entities/upload-link.entity';
import { TransactionDocumentsService } from '../transaction-documents/transaction-documents.service';
import { TransactionDocumentEntity } from '../transaction-documents/entities/transaction-document.entity';
import { DocumentPipelineService, PipelineProcessResult } from '../document-extraction/document-pipeline.service';
import { DocumentFormSplitterService } from '../document-extraction/document-form-splitter.service';
import { S3StorageService } from '../storage/s3-storage.service';
import type { FormExtractionResult } from '@tc/document-intelligence';
import { TransactionMessageEntity, MessageDirection } from '../transaction-messages/entities/transaction-message.entity';
import { TransactionFormTemplatesService } from '../transaction-form-templates/transaction-form-templates.service';
import { TransactionEntity } from '../transactions/entities/transaction.entity';
import { getTransactionCoordinatorContact } from '../transactions/transaction-coordinator-contact.util';
import { propertyAddressMatchesTransaction, extractHeaderPropertyAddress, appendAddressMismatchBlocker } from './property-address-match.util';
import { ContingencyRemovalReminderSchedulerService } from '../reminders/contingency-removal-reminder-scheduler.service';
import { VerificationOfPropertyReminderSchedulerService } from '../reminders/verification-of-property-reminder-scheduler.service';
import { SellerSideDocumentReminderSchedulerService } from '../reminders/seller-side-document-reminder-scheduler.service';
import { ContingencyType } from '../reminders/entities/contingency-removal-reminder.entity';
import { resolveUploadLinkVisibilityType, resolveUploadedByType, UploadedByType } from './document-visibility.util';
import { VerificationOfPropertyBrokerDocusignService } from './verification-of-property-broker-docusign.service';

/**
 * Every Buyer Agent PDF now runs the synchronous compliance gate (see the
 * trigger condition in uploadTransactionDocuments below) — a document with
 * no configured validator for its form code always resolves 'compliant'
 * (see noValidationRequired in DocumentPipelineService), so widening the
 * gate to every form never rejects a document nothing actually checks. This
 * set is now scoped to a single narrower purpose: which detected forms also
 * get the property-address-match blocker injected (a check that only makes
 * sense for these transaction-specific forms, not e.g. a lender-prequal PDF).
 */
const BUYER_AGENT_ADDRESS_MATCH_FORM_CODES = new Set(['RR', 'RRRR', 'CR-B', 'VP']);

/** All files land under this fixed storage segment — distinct from pipeline-stage folders (contract/disclosures/etc.) since these uploads aren't tied to a specific workflow stage. */
const EXTERNAL_UPLOAD_STAGE = 'external-uploads';

/** One upload source tag per purpose, so audit/document metadata can distinguish which secure-link workflow a file came through. */
const UPLOAD_SOURCE_BY_PURPOSE: Record<UploadLinkPurpose, string> = {
  document_upload: 'secure_email_link',
  seller_agent_document_upload: 'seller_agent_secure_upload_link',
  escrow_officer_document_upload: 'escrow_officer_secure_upload_link',
  broker_document_upload: 'broker_secure_upload_link',
};

const BROKER_LINK_MESSAGE = 'This upload link is invalid or has expired.';

/** Only PDFs go through the document-analysis pipeline — images/Office docs have nothing to detect. */
const ANALYZABLE_MIME_TYPE = 'application/pdf';

const ANALYSIS_FAILED_MESSAGE = 'Document uploaded successfully, but the form type could not be identified.';

function uploadSourceFor(purpose: string): string {
  return UPLOAD_SOURCE_BY_PURPOSE[purpose as UploadLinkPurpose] ?? 'secure_email_link';
}

function ccRecipientFor(link: UploadLinkEntity): AuditCcRecipient | null {
  if (!link.ccEmail) return null;
  return { role: link.ccRole ?? 'unknown', partyId: link.ccPartyId, name: link.ccName ?? '', email: link.ccEmail };
}

/**
 * The myTC account that created the transaction is the source of truth for the
 * "Transaction Coordinator" identity on every upload-link email — never a
 * manually-entered transaction party or link-level CC field. Optional values
 * that are missing come back as null so the templates can omit them entirely.
 *
 * The email shown is the transaction-specific Mailgun address
 * (`transaction.outboundEmailAddress`) — never the TC's myTC login email —
 * via the shared getTransactionCoordinatorContact helper.
 */
function creatorTcIdentity(transaction: TransactionEntity): { tcName: string | null; transactionEmail: string | null; tcPhone: string | null } {
  const contact = getTransactionCoordinatorContact(transaction, transaction.createdByAccount);
  return {
    tcName: contact.name,
    transactionEmail: contact.email,
    tcPhone: contact.phone,
  };
}

export interface FileUploadResult {
  fileName: string;
  status: 'success' | 'failed';
  documentId?: string;
  error?: string;
  /** Present when this file was rejected by the synchronous compliance-validation gate — one entry per failed required check, human-readable, prefixed with its page/location when known (e.g. "Page 6 — Buyer initials are missing."). */
  validationFailures?: string[];
  /** The pipeline's detected form code for a rejected file, even though it was never saved — lets the frontend show "RPA — Re-upload Required" instead of just a bare filename. Null when the pipeline couldn't identify a form at all. */
  formCode?: string | null;
}

export type UploadedDocumentDisplayStatus = 'uploaded' | 'analyzing' | 'saved' | 'analysis_failed';

export type UploadedDocumentCategory =
  | 'general' | 'hoa_document' | 'lender_prequalification' | 'proof_of_funds'
  | 'escrow_instructions' | 'preliminary_title_report' | 'estimated_closing_statement';

const HOA_DOCUMENT_CATEGORY: UploadedDocumentCategory = HOA_DOCUMENT_TYPE as UploadedDocumentCategory;

/**
 * Every `documentCategory` value the upload endpoint recognizes, mapped to the
 * upload-link purpose(s) allowed to use it — deliberately explicit rather
 * than inferred from analysis/form-classification. A link passing a category
 * outside its own purpose's set has it silently ignored (falls through to a
 * normal, untagged upload) rather than erroring, so as not to leak which
 * categories exist for other purposes. `hoa_document` is the one category
 * shared by two purposes — both the Buyer Agent and the Escrow Officer pages
 * can tag an HOA document upload, so it lands on the Escrow checklist's
 * conditional "HOA Documents" item regardless of who actually uploads it.
 */
const DEDICATED_CATEGORY_PURPOSE: ReadonlyMap<string, ReadonlySet<UploadLinkPurpose>> = new Map([
  ...ALL_SPECIAL_BUYER_AGENT_DOCUMENT_TYPES.map((t) => [t, new Set([BUYER_AGENT_TRANSACTION_DOCUMENT_UPLOAD])] as const),
  ...REQUIRED_ESCROW_DOCUMENT_TYPES.map((t) => [t.documentType, new Set([ESCROW_OFFICER_TRANSACTION_DOCUMENT_UPLOAD])] as const),
  [HOA_DOCUMENT_TYPE, new Set([BUYER_AGENT_TRANSACTION_DOCUMENT_UPLOAD, ESCROW_OFFICER_TRANSACTION_DOCUMENT_UPLOAD])],
]);

/** Public-safe shape for the "Uploaded Documents" list — never includes storageKey, metadataJson, or extraction/compliance internals. */
export interface PublicUploadedDocumentDto {
  id: string;
  fileName: string | null;
  formType: string | null;
  recipientRole: string;
  uploadedAt: Date;
  fileSizeBytes: number | null;
  status: UploadedDocumentDisplayStatus;
  category: UploadedDocumentCategory;
  message?: string;
  /** Token-scoped file-streaming route — null when there's no stored file (e.g. still analyzing). */
  viewUrl: string | null;
  /** True for the original combined file once it's been split into per-form documents — lets the UI group a split document under its own original. */
  isOriginalPackage: boolean;
  /** The original uploaded file's document id, for a document that was split out of it — null for the original itself and for any document that was never split. */
  sourceDocumentId: string | null;
  /** This document's own canonical origin — see document-visibility.util.ts. Not necessarily the audience currently viewing it (e.g. an Escrow link sees a BUYER_AGENT-origin RPA). */
  uploadedByType: UploadedByType;
}

function toDisplayStatus(analysisStatus: string | null): UploadedDocumentDisplayStatus {
  if (analysisStatus === 'analyzing') return 'analyzing';
  if (analysisStatus === 'failed') return 'analysis_failed';
  if (analysisStatus === 'completed') return 'saved';
  return 'uploaded';
}

/**
 * `doc.uploadLink` (when set) is THIS document's own originating link, which
 * — now that a document can be listed on a DIFFERENT link's page than the
 * one it was uploaded through (e.g. an RPA shown on the Escrow link) — is
 * never necessarily the same as the link whose token is currently viewing
 * it. recipientRole/uploadedByType are therefore always derived from the
 * document's own origin, never from the requesting link.
 */
function toPublicDto(doc: TransactionDocumentEntity, token: string): PublicUploadedDocumentDto {
  const status = toDisplayStatus(doc.analysisStatus);
  const category: UploadedDocumentCategory = DEDICATED_CATEGORY_PURPOSE.has(doc.documentType)
    ? (doc.documentType as UploadedDocumentCategory)
    : 'general';
  return {
    id: doc.id,
    fileName: doc.fileName,
    formType: doc.formCode,
    recipientRole: doc.uploadLink?.recipientRole ?? 'internal',
    uploadedByType: resolveUploadedByType(doc.uploadLinkId, doc.uploadLink?.purpose),
    uploadedAt: doc.createdAt,
    fileSizeBytes: doc.fileSizeBytes,
    status,
    category,
    viewUrl: doc.storageKey ? `/api/v1/upload-links/token/${token}/documents/${doc.id}/file` : null,
    isOriginalPackage: doc.isOriginalPackage,
    sourceDocumentId: doc.sourceDocumentId,
    ...(status === 'analysis_failed' ? { message: ANALYSIS_FAILED_MESSAGE } : {}),
  };
}

@Injectable()
export class ExternalDocumentUploadService {
  private readonly logger = new Logger(ExternalDocumentUploadService.name);

  constructor(
    private readonly uploadLinkService: UploadLinkService,
    private readonly uploadLinkRepo: UploadLinkRepository,
    private readonly fileValidationService: FileValidationService,
    private readonly storageService: TransactionDocumentStorageService,
    private readonly auditService: UploadAuditService,
    private readonly documentsService: TransactionDocumentsService,
    private readonly pipelineService: DocumentPipelineService,
    private readonly uploadLinkEmailService: UploadLinkEmailService,
    private readonly formTemplatesService: TransactionFormTemplatesService,
    private readonly contingencyReminderScheduler: ContingencyRemovalReminderSchedulerService,
    private readonly vpReminderScheduler: VerificationOfPropertyReminderSchedulerService,
    private readonly sellerSideReminderScheduler: SellerSideDocumentReminderSchedulerService,
    private readonly vpBrokerDocusignService: VerificationOfPropertyBrokerDocusignService,
    private readonly formSplitter: DocumentFormSplitterService,
    private readonly s3: S3StorageService,
    @InjectRepository(TransactionMessageEntity)
    private readonly messagesRepo: Repository<TransactionMessageEntity>,
  ) {}

  /**
   * When the sync pipeline detected more than one form in a single uploaded
   * PDF (e.g. one file containing both an RPA and an AVID), splits it into
   * one document per form — each carrying its own extraction + compliance
   * (already computed by DocumentPipelineService, no new LLM calls) — and
   * marks the original row as the visible "original uploaded PDF" package,
   * clearing its own formCode so it can never itself satisfy a checklist item
   * (only its split children, linked back via sourceDocumentId, can).
   *
   * A no-op (returns an empty array) when the pipeline found 0 or 1 forms —
   * the original row keeps behaving exactly as it did before this feature,
   * which is also what happens for every document uploaded before this change.
   */
  private async trySplitIntoFormDocuments(
    originalDoc: TransactionDocumentEntity,
    pipelineResult: PipelineProcessResult,
    fileBuffer: Buffer,
    uploadLinkId: string,
  ): Promise<Array<{ formCode: string; documentId: string }>> {
    const formParts = pipelineResult.formParts;
    if (!formParts || formParts.length < 2) return [];

    // pageRoutedExtractions is built from the exact same filtered/ordered list
    // (pageResult.extractions.filter(e => e.output !== null)) as formParts, so
    // the two arrays are positionally aligned — this recovers the real
    // FormExtractionOutput each part needs without re-deriving anything.
    const rawOutputs = pipelineResult.pageRoutedExtractions ?? [];
    const splitRequests: FormExtractionResult[] = formParts.map((part, i) => ({
      formCode: part.formCode,
      formName: part.formName,
      pageIndices: part.pageIndices,
      output: rawOutputs[i] ?? null,
    }));

    let splitMap: Map<string, { buffer: Buffer; pageStart: number; pageEnd: number }>;
    try {
      splitMap = await this.formSplitter.splitByForm(fileBuffer, splitRequests);
    } catch (err) {
      this.logger.error(`Per-form PDF splitting failed for document ${originalDoc.id}: ${(err as Error).message}`);
      return [];
    }
    if (splitMap.size === 0) return [];

    const stage = originalDoc.stage ?? EXTERNAL_UPLOAD_STAGE;
    const baseFileName = (originalDoc.fileName ?? 'document').replace(/\.pdf$/i, '');
    const createdDocs: Array<{ formCode: string; documentId: string }> = [];

    for (const part of formParts) {
      const split = splitMap.get(part.formCode);
      if (!split) continue;

      const perFormFilename = `${part.formCode}-${baseFileName}.pdf`;
      const { storageKey } = await this.s3.upload(originalDoc.transactionId, stage, perFormFilename, split.buffer, 'application/pdf');

      const splitDoc = await this.documentsService.createDocumentWithMetadata({
        transactionId: originalDoc.transactionId,
        stage,
        documentType: originalDoc.documentType,
        title: part.formName ?? part.formCode,
        storageKey,
        fileName: perFormFilename,
        mimeType: 'application/pdf',
        sourceDocumentId: originalDoc.id,
        sourcePageStart: split.pageStart,
        sourcePageEnd: split.pageEnd,
        formCode: part.formCode,
        uploadLinkId,
        analysisStatus: 'completed',
        metadataJson: {
          extraction: part.extraction,
          compliance: part.compliance,
          detectedFormCode: part.formCode,
          detectedFormName: part.formName,
          splitFromOriginal: true,
          originalFileName: originalDoc.fileName,
        },
      });
      createdDocs.push({ formCode: part.formCode, documentId: splitDoc.id });
    }

    if (createdDocs.length > 0) {
      await this.documentsService.markAsOriginalPackage(originalDoc.id);
      this.logger.log(`Split document ${originalDoc.id} into ${createdDocs.length} form(s): ${createdDocs.map((d) => d.formCode).join(', ')}`);
    }

    return createdDocs;
  }

  /**
   * Validates the token once, then processes each file independently so one
   * bad file in a batch doesn't block the others. For each successfully
   * stored PDF, kicks off background form-type detection (fire-and-forget —
   * the HTTP response returns as soon as the file is stored, not once
   * analysis completes). Out of scope by design: no PDF splitting, no
   * blockers, no swimlane/stage effects — analysis results only ever update
   * this document's own row.
   *
   * `documentCategory` tags a document's stored `documentType` directly, from
   * whichever dedicated upload button the Buyer Agent used — not from
   * automatic form-classification. `'hoa_document'` (HOA yes/no section) never
   * triggers analysis, even for a PDF, since analyzing HOA documents is
   * explicitly out of scope. `'lender_prequalification'` and `'proof_of_funds'`
   * (the two required-document upload fields) are still analyzed normally for
   * a PDF — only their documentType tag is deterministic, not their analysis
   * status. All three are Buyer Agent link features only: a Seller Agent link
   * passing any of these values has it silently ignored.
   */
  /**
   * The broker's own page is a placeholder — no upload capability, by design
   * (see BROKER_TRANSACTION_DOCUMENT_UPLOAD's doc comment). A broker token
   * successfully validates (it needs to, for the page's own context/property
   * lookup), so this explicit rejection is the only thing standing between a
   * broker link and the document endpoints — never rely on
   * resolveUploadLinkVisibilityType's 'NONE' fallthrough alone reaching here
   * first. Same generic message as every other invalid-link rejection.
   */
  private assertNotBrokerLink(purpose: string): void {
    if (purpose === BROKER_TRANSACTION_DOCUMENT_UPLOAD) {
      throw new NotFoundException(BROKER_LINK_MESSAGE);
    }
  }

  async uploadTransactionDocuments(
    token: string,
    files: Express.Multer.File[],
    idempotencyKey?: string | null,
    documentCategory?: string | null,
  ): Promise<FileUploadResult[]> {
    const { link, transaction } = await this.uploadLinkService.validateUploadToken(token);
    this.assertNotBrokerLink(link.purpose);
    const config = getDefaultAllowedFileConfig();
    const propertyAddress = [transaction.propertyAddressLine1, transaction.propertyCity, transaction.propertyState]
      .filter(Boolean).join(', ') || transaction.propertyAddressLine1;

    const uploadSource = uploadSourceFor(link.purpose);
    const ccRecipient = ccRecipientFor(link);
    const isSellerAgentLink = link.purpose === SELLER_AGENT_TRANSACTION_DOCUMENT_UPLOAD;
    const isBuyerAgentLink = link.purpose === BUYER_AGENT_TRANSACTION_DOCUMENT_UPLOAD;
    const isEscrowLink = link.purpose === ESCROW_OFFICER_TRANSACTION_DOCUMENT_UPLOAD;

    const results: FileUploadResult[] = [];
    const sellerRejectedDocuments: RejectedDocumentSummary[] = [];
    const buyerRejectedDocuments: RejectedDocumentSummary[] = [];
    const escrowRejectedDocuments: RejectedDocumentSummary[] = [];

    for (const file of files) {
      const validation = this.fileValidationService.validateFile(file, config);

      if (!validation.valid) {
        await this.auditService.recordUploadAuditEvent({
          transactionId: transaction.id,
          propertyAddress,
          documentId: null,
          originalFileName: file.originalname,
          storageKey: null,
          fileType: file.mimetype,
          fileSize: file.size,
          recipientRole: link.recipientRole,
          recipientPartyId: link.recipientPartyId,
          recipientName: link.recipientName,
          recipientEmail: link.recipientEmail,
          ccRecipient,
          uploadLinkId: link.id,
          uploadLinkPurpose: link.purpose,
          uploadSource,
          emailMessageId: link.emailMessageId,
          status: 'failed',
          failureReason: validation.reason,
        });
        results.push({ fileName: file.originalname, status: 'failed', error: validation.reason });
        continue;
      }

      const fileIdempotencyKey = idempotencyKey ? `${idempotencyKey}:${validation.sanitizedFileName}` : null;
      if (fileIdempotencyKey) {
        const existing = await this.documentsService.findByUploadLinkAndIdempotencyKey(link.id, fileIdempotencyKey);
        if (existing) {
          this.logger.log(`Duplicate upload request for link ${link.id} (idempotency key match) — returning existing document ${existing.id}`);
          results.push({ fileName: file.originalname, status: 'success', documentId: existing.id });
          continue;
        }
      }

      // Category tagging (HOA / lender-prequalification / proof-of-funds / the 3 escrow
      // document types) is only honored on the ONE purpose each category belongs to — a link
      // passing a category outside its own purpose has it silently ignored, not honored, so
      // the upload proceeds as an untagged normal document instead of erroring. Resolved here
      // (rather than only later, at storage time) because the sync-validation gate below also
      // needs to know isHoaDocument before it decides whether to run at all.
      const resolvedCategory = documentCategory && DEDICATED_CATEGORY_PURPOSE.get(documentCategory)?.has(link.purpose as UploadLinkPurpose)
        ? documentCategory
        : null;
      const isHoaDocument = resolvedCategory === HOA_DOCUMENT_CATEGORY;
      // Escrow's own dedicated document types (Escrow Instructions, Preliminary
      // Title Report, Estimated Closing Statement) — like HOA — are never CAR
      // forms and have no configured validator, so they stay on the pre-existing
      // async analysis path rather than entering the sync compliance gate below.
      // Escrow's only OTHER possible categories are these 3 plus HOA (see
      // DEDICATED_CATEGORY_PURPOSE), so "any resolved category at all" is the
      // correct, complete exemption for this purpose.
      const isEscrowDedicatedCategory = isEscrowLink && !!resolvedCategory;

      // Every Seller Agent, Buyer Agent, and Escrow Officer PDF runs the same
      // document-intelligence pipeline used for async analysis SYNCHRONOUSLY, before
      // ever storing the file, so a document that fails a required (blocker-severity)
      // compliance check is never saved at all — only warnings (needs_review) or a
      // clean pass let it through. This is safe to apply unconditionally (not just to
      // a fixed allowlist of form codes): a form with no configured validator always
      // resolves 'compliant' with zero blockers (see noValidationRequired in
      // DocumentPipelineService), so a document nothing actually checks can never be
      // rejected here. HOA-tagged PDFs (Buyer Agent or Escrow) are the one exception
      // that skips this synchronous step entirely — analyzing HOA documents at all
      // (sync or async) is explicitly out of scope, unchanged from before this feature.
      // Non-PDF files keep the existing store-then-analyze-async behavior.
      let syncPipelineResult: PipelineProcessResult | null = null;
      if ((isSellerAgentLink || (isBuyerAgentLink && !isHoaDocument) || (isEscrowLink && !isEscrowDedicatedCategory)) && file.mimetype === ANALYZABLE_MIME_TYPE) {
        try {
          // A Seller Agent upload only has the seller's own execution to
          // give — buyer-side signature/initials/date requirements are
          // never enforced against it (see @tc/document-intelligence's
          // ValidationUploadSource).
          syncPipelineResult = await this.pipelineService.process(file.buffer, isSellerAgentLink ? 'seller_agent' : undefined);
        } catch (err) {
          // An infrastructure failure running the pipeline itself is not a validation
          // failure — fall through and store the file, deferring to the normal
          // fire-and-forget async analysis path rather than rejecting on our own error.
          this.logger.error(`Synchronous validation failed to run for ${file.originalname} on link ${link.id}: ${(err as Error).message}`);
          syncPipelineResult = null;
        }

        const detectedFormCode = syncPipelineResult?.detectedFormCode ?? null;
        const isAddressMatchBuyerAgentForm = isBuyerAgentLink && !!detectedFormCode && BUYER_AGENT_ADDRESS_MATCH_FORM_CODES.has(detectedFormCode);

        if (syncPipelineResult && isAddressMatchBuyerAgentForm) {
          // Property-address-matching-to-transaction has no existing home in the
          // document-intelligence package's validators (they never receive live
          // transaction context) — synthesized here, the one place that does.
          const extractedAddress = extractHeaderPropertyAddress(syncPipelineResult.extraction);
          if (!propertyAddressMatchesTransaction(extractedAddress, transaction.propertyAddressLine1)) {
            syncPipelineResult.compliance = appendAddressMismatchBlocker(syncPipelineResult.compliance, detectedFormCode as 'RR' | 'RRRR' | 'CR-B' | 'VP');
          }
        }

        // Every gated purpose enforces the same rule now: any detected (or
        // undetected) form whose compliance run comes back non_compliant is
        // rejected — see the comment above for why this can never reject a
        // document with no applicable validator.
        const enforcesComplianceGate = isSellerAgentLink || isBuyerAgentLink || isEscrowLink;

        if (syncPipelineResult && enforcesComplianceGate && syncPipelineResult.compliance.summary.overallStatus === 'non_compliant') {
          // "Page 6 — Buyer initials are missing." when the blocker carries a
          // location hint, otherwise just the bare message.
          const reasons = (syncPipelineResult.compliance.blockers ?? []).map((b) => (b.location ? `${b.location} — ${b.message}` : b.message));
          if (isSellerAgentLink) {
            await this.auditService.recordValidationFailureAuditEvent({
              transactionId: transaction.id,
              propertyAddress,
              originalFileName: file.originalname,
              uploadLinkId: link.id,
              recipientName: link.recipientName,
              recipientEmail: link.recipientEmail,
              reasons,
              detectedFormCode: syncPipelineResult.detectedFormCode,
            });
            sellerRejectedDocuments.push({ fileName: file.originalname, reasons });
          } else if (isBuyerAgentLink) {
            await this.auditService.recordBuyerAgentValidationFailureAuditEvent({
              transactionId: transaction.id,
              propertyAddress,
              originalFileName: file.originalname,
              uploadLinkId: link.id,
              recipientName: link.recipientName,
              recipientEmail: link.recipientEmail,
              reasons,
              detectedFormCode: syncPipelineResult.detectedFormCode,
            });
            buyerRejectedDocuments.push({ fileName: file.originalname, reasons });
          } else {
            await this.auditService.recordEscrowValidationFailureAuditEvent({
              transactionId: transaction.id,
              propertyAddress,
              originalFileName: file.originalname,
              uploadLinkId: link.id,
              recipientName: link.recipientName,
              recipientEmail: link.recipientEmail,
              reasons,
              detectedFormCode: syncPipelineResult.detectedFormCode,
            });
            escrowRejectedDocuments.push({ fileName: file.originalname, reasons });
          }
          results.push({
            fileName: file.originalname,
            status: 'failed',
            error: 'Document failed validation and was not saved.',
            validationFailures: reasons,
            formCode: syncPipelineResult.detectedFormCode,
          });
          continue;
        }
      }

      try {
        // Only the HOA category skips analysis — lender-prequalification/proof-of-funds are still
        // analyzed normally; their documentType is assigned deterministically regardless of what
        // (if anything) the analysis pipeline later detects. A Seller Agent or gated Buyer Agent
        // PDF that already ran the synchronous validation gate above (and passed) already HAS its
        // analysis result — it goes straight to 'completed', skipping the async re-analysis entirely.
        const analysisStatus = syncPipelineResult
          ? 'completed'
          : !isHoaDocument && file.mimetype === ANALYZABLE_MIME_TYPE ? 'analyzing' : 'completed';
        const doc = await this.storageService.storeUploadedFile({
          transactionId: transaction.id,
          stage: EXTERNAL_UPLOAD_STAGE,
          file,
          sanitizedFileName: validation.sanitizedFileName,
          uploadLinkId: link.id,
          idempotencyKey: fileIdempotencyKey,
          fileSizeBytes: file.size,
          analysisStatus,
          documentType: resolvedCategory ?? undefined,
          metadataJson: {
            uploadSource,
            uploadLinkId: link.id,
            uploadLinkPurpose: link.purpose,
            recipientRole: link.recipientRole,
            recipientPartyId: link.recipientPartyId,
            recipientName: link.recipientName,
            recipientEmail: link.recipientEmail,
            ...(resolvedCategory ? { documentCategory: resolvedCategory } : {}),
            ...(ccRecipient ? { ccRole: ccRecipient.role, ccPartyId: ccRecipient.partyId, ccName: ccRecipient.name, ccEmail: ccRecipient.email } : {}),
          },
        });

        await this.auditService.recordUploadAuditEvent({
          transactionId: transaction.id,
          propertyAddress,
          documentId: doc.id,
          originalFileName: file.originalname,
          storageKey: doc.storageKey,
          fileType: file.mimetype,
          fileSize: file.size,
          recipientRole: link.recipientRole,
          recipientPartyId: link.recipientPartyId,
          recipientName: link.recipientName,
          recipientEmail: link.recipientEmail,
          ccRecipient,
          uploadLinkId: link.id,
          uploadLinkPurpose: link.purpose,
          uploadSource,
          emailMessageId: link.emailMessageId,
          status: 'success',
        });

        await this.uploadLinkRepo.incrementUploadCount(link.id);
        results.push({ fileName: file.originalname, status: 'success', documentId: doc.id });

        if (syncPipelineResult) {
          // Already ran synchronously above (and passed) — patch the result directly
          // instead of re-running analysis in the background.
          await this.documentsService.updateAnalysisResult(doc.id, {
            analysisStatus: 'completed',
            formCode: syncPipelineResult.detectedFormCode,
            analyzedAt: new Date(),
          });
          await this.documentsService.patchMetadataJson(doc.id, {
            extraction: syncPipelineResult.extraction,
            compliance: syncPipelineResult.compliance,
            detectedFormCode: syncPipelineResult.detectedFormCode,
            detectedFormName: syncPipelineResult.detectedFormName,
          });

          // A combined PDF (e.g. RPA + AVID in one file) gets split into one
          // document per form here — each split doc inherits its own formCode's
          // provenance + already-computed compliance, and the original row
          // becomes the visible "original uploaded PDF" (no formCode of its
          // own, so it can never itself satisfy a checklist item).
          const splitDocs = await this.trySplitIntoFormDocuments(doc, syncPipelineResult, file.buffer, link.id);
          const splitFormCodes = splitDocs.map((d) => d.formCode);
          const splitDocumentIdByFormCode = new Map(splitDocs.map((d) => [d.formCode, d.documentId]));

          // Reminder-cancellation side effects apply per detected form — the
          // primary form plus every split form, since a CR-B or VP hidden as a
          // secondary form inside a combined PDF must still cancel its reminder.
          // documentId resolves to the split-out row when this form was pulled
          // out of a combined PDF, or `doc.id` itself in the common single-form
          // case (trySplitIntoFormDocuments never ran, so nothing to split to).
          const formsToCheck: Array<{ formCode: string; extraction: unknown; documentId: string }> = [];
          if (syncPipelineResult.detectedFormCode) {
            formsToCheck.push({
              formCode: syncPipelineResult.detectedFormCode,
              extraction: syncPipelineResult.extraction,
              documentId: splitDocumentIdByFormCode.get(syncPipelineResult.detectedFormCode) ?? doc.id,
            });
          }
          for (const part of syncPipelineResult.formParts ?? []) {
            if (splitFormCodes.includes(part.formCode) && part.formCode !== syncPipelineResult.detectedFormCode) {
              const documentId = splitDocumentIdByFormCode.get(part.formCode);
              if (documentId) formsToCheck.push({ formCode: part.formCode, extraction: part.extraction, documentId });
            }
          }

          for (const { formCode, extraction, documentId } of formsToCheck) {
            if (isBuyerAgentLink && formCode === 'CR-B') {
              const extractionRecord = extraction as unknown as Record<string, unknown> | null;
              const removed = extractionRecord?.['contingencies_removed'] as Record<string, unknown> | undefined;
              const satisfiedTypes: ContingencyType[] = (['inspection', 'loan', 'appraisal'] as ContingencyType[])
                .filter((t) => !!removed && (removed[t] === true || removed['all_contingencies'] === true));
              if (satisfiedTypes.length > 0) {
                await this.contingencyReminderScheduler.cancelForSatisfiedContingencies(transaction.id, satisfiedTypes);
              }
            }

            if (isBuyerAgentLink && formCode === 'VP') {
              await this.vpReminderScheduler.cancelIfSatisfied(transaction.id);
              await this.vpBrokerDocusignService.handleVpUploaded(transaction, documentId);
            }

            if (isSellerAgentLink) {
              await this.sellerSideReminderScheduler.cancelIfSatisfied(transaction.id, formCode);
            }
          }
        } else if (analysisStatus === 'analyzing') {
          // Fire-and-forget — the response above already reflects a successful upload;
          // analysis results land on the document row asynchronously.
          void this.analyzeUploadedDocument(doc.id, file.buffer);
        }
      } catch (err) {
        const message = (err as Error).message;
        this.logger.error(`Upload failed for ${file.originalname} on link ${link.id}: ${message}`);
        await this.auditService.recordUploadAuditEvent({
          transactionId: transaction.id,
          propertyAddress,
          documentId: null,
          originalFileName: file.originalname,
          storageKey: null,
          fileType: file.mimetype,
          fileSize: file.size,
          recipientRole: link.recipientRole,
          recipientPartyId: link.recipientPartyId,
          recipientName: link.recipientName,
          recipientEmail: link.recipientEmail,
          ccRecipient,
          uploadLinkId: link.id,
          uploadLinkPurpose: link.purpose,
          uploadSource,
          emailMessageId: link.emailMessageId,
          status: 'failed',
          failureReason: message,
        });
        results.push({ fileName: file.originalname, status: 'failed', error: message });
      }
    }

    if (sellerRejectedDocuments.length > 0) {
      await this.dispatchSellerAgentRejectionEmail(link, transaction, token, propertyAddress, sellerRejectedDocuments, idempotencyKey ?? null);
    }

    if (buyerRejectedDocuments.length > 0) {
      await this.dispatchBuyerAgentRejectionEmail(link, transaction, token, propertyAddress, buyerRejectedDocuments, idempotencyKey ?? null);
    }

    if (escrowRejectedDocuments.length > 0) {
      await this.dispatchEscrowRejectionEmail(link, transaction, token, propertyAddress, escrowRejectedDocuments, idempotencyKey ?? null);
    }

    if (isSellerAgentLink) {
      await this.maybeSendDocusignConfirmationEmail(link, transaction, token, propertyAddress);
    }

    return results;
  }

  /**
   * Once the Seller Agent's dynamic, template-driven checklist becomes fully
   * complete, replies to the same email thread asking them to confirm sending
   * everything to the Buyer via DocuSign. Sent at most once per link — guarded
   * by `docusignConfirmationRequestedAt`, stamped immediately (before the send
   * even resolves) so a slow or failed send is never re-attempted by a later
   * upload in this same batch or a subsequent request. A no-op for every other
   * purpose, and a no-op if the checklist isn't complete yet.
   */
  private async maybeSendDocusignConfirmationEmail(
    link: UploadLinkEntity,
    transaction: TransactionEntity,
    token: string,
    propertyAddress: string,
  ): Promise<void> {
    const current = await this.uploadLinkRepo.findById(link.id);
    if (!current || current.docusignConfirmationRequestedAt) return;

    const rejectedFormCodes = await this.auditService.findRecentlyRejectedFormCodes(link.id);
    const checklist = await this.formTemplatesService.getSellerAgentChecklistStatus(transaction, link.id, rejectedFormCodes);
    if (!checklist.allRequiredSubmitted) return;

    await this.uploadLinkRepo.recordDocusignConfirmationRequested(link.id);

    const result = await this.uploadLinkEmailService.sendSellerAgentDocusignConfirmationEmail(
      link,
      token,
      {
        ...creatorTcIdentity(transaction),
        propertyAddress,
        transactionId: transaction.id,
        outboundEmailAddress: transaction.outboundEmailAddress,
      },
    );

    if (result.sent) {
      await this.auditService.recordDocusignConfirmationRequestedAuditEvent({
        transactionId: link.transactionId,
        uploadLinkId: link.id,
        recipientEmail: link.recipientEmail,
        ccEmail: link.ccEmail,
        providerMessageId: result.providerMessageId,
      });
    }
  }

  /**
   * Sends at most one consolidated validation-failure reply email per upload
   * attempt (deduped on `idempotencyKey`, the same key the frontend already
   * generates once per submit) — a query builder isn't needed since the number
   * of messages per transaction is small; filtering the already-fetched rows
   * in memory avoids any JSONB-column-name fragility.
   */
  private async dispatchSellerAgentRejectionEmail(
    link: UploadLinkEntity,
    transaction: TransactionEntity,
    token: string,
    propertyAddress: string,
    rejectedDocuments: RejectedDocumentSummary[],
    idempotencyKey: string | null,
  ): Promise<void> {
    if (idempotencyKey) {
      const existingMessages = await this.messagesRepo.find({ where: { transactionId: link.transactionId, direction: MessageDirection.OUTBOUND } });
      const alreadySent = existingMessages.some((m) =>
        m.metadataJson?.type === 'seller_agent_document_rejection'
        && m.metadataJson?.uploadLinkId === link.id
        && m.metadataJson?.idempotencyKey === idempotencyKey);
      if (alreadySent) {
        this.logger.log(`Rejection email already sent for link ${link.id} / idempotency key ${idempotencyKey} — skipping duplicate send`);
        return;
      }
    }

    const result = await this.uploadLinkEmailService.sendSellerAgentRejectionEmail(
      link,
      token,
      {
        ...creatorTcIdentity(transaction),
        propertyAddress,
        transactionId: transaction.id,
        outboundEmailAddress: transaction.outboundEmailAddress,
      },
      rejectedDocuments,
      idempotencyKey,
    );

    if (result.sent) {
      await this.auditService.recordRejectionEmailSentAuditEvent({
        transactionId: link.transactionId,
        uploadLinkId: link.id,
        recipientEmail: link.recipientEmail,
        ccEmail: link.ccEmail,
        rejectedFileNames: rejectedDocuments.map((d) => d.fileName),
        providerMessageId: result.providerMessageId,
      });
    }
  }

  /**
   * Same idempotency-dedup + reply-in-thread pattern as
   * dispatchSellerAgentRejectionEmail, for the Buyer Agent's RR/RRRR gate —
   * kept as a sibling method rather than merged since the two purposes' audit
   * actions and email-service methods are distinct.
   */
  private async dispatchBuyerAgentRejectionEmail(
    link: UploadLinkEntity,
    transaction: TransactionEntity,
    token: string,
    propertyAddress: string,
    rejectedDocuments: RejectedDocumentSummary[],
    idempotencyKey: string | null,
  ): Promise<void> {
    if (idempotencyKey) {
      const existingMessages = await this.messagesRepo.find({ where: { transactionId: link.transactionId, direction: MessageDirection.OUTBOUND } });
      const alreadySent = existingMessages.some((m) =>
        m.metadataJson?.type === 'buyer_agent_document_rejection'
        && m.metadataJson?.uploadLinkId === link.id
        && m.metadataJson?.idempotencyKey === idempotencyKey);
      if (alreadySent) {
        this.logger.log(`Buyer Agent rejection email already sent for link ${link.id} / idempotency key ${idempotencyKey} — skipping duplicate send`);
        return;
      }
    }

    const result = await this.uploadLinkEmailService.sendBuyerAgentRejectionEmail(
      link,
      token,
      {
        ...creatorTcIdentity(transaction),
        propertyAddress,
        transactionId: transaction.id,
        outboundEmailAddress: transaction.outboundEmailAddress,
      },
      rejectedDocuments,
      idempotencyKey,
    );

    if (result.sent) {
      await this.auditService.recordBuyerAgentRejectionEmailSentAuditEvent({
        transactionId: link.transactionId,
        uploadLinkId: link.id,
        recipientEmail: link.recipientEmail,
        ccEmail: link.ccEmail,
        rejectedFileNames: rejectedDocuments.map((d) => d.fileName),
        providerMessageId: result.providerMessageId,
      });
    }
  }

  /**
   * Same idempotency-dedup + reply-in-thread pattern as
   * dispatchSellerAgentRejectionEmail/dispatchBuyerAgentRejectionEmail, for
   * the Escrow Officer's synchronous validation gate.
   */
  private async dispatchEscrowRejectionEmail(
    link: UploadLinkEntity,
    transaction: TransactionEntity,
    token: string,
    propertyAddress: string,
    rejectedDocuments: RejectedDocumentSummary[],
    idempotencyKey: string | null,
  ): Promise<void> {
    if (idempotencyKey) {
      const existingMessages = await this.messagesRepo.find({ where: { transactionId: link.transactionId, direction: MessageDirection.OUTBOUND } });
      const alreadySent = existingMessages.some((m) =>
        m.metadataJson?.type === 'escrow_document_rejection'
        && m.metadataJson?.uploadLinkId === link.id
        && m.metadataJson?.idempotencyKey === idempotencyKey);
      if (alreadySent) {
        this.logger.log(`Escrow rejection email already sent for link ${link.id} / idempotency key ${idempotencyKey} — skipping duplicate send`);
        return;
      }
    }

    const result = await this.uploadLinkEmailService.sendEscrowRejectionEmail(
      link,
      token,
      {
        ...creatorTcIdentity(transaction),
        propertyAddress,
        transactionId: transaction.id,
        outboundEmailAddress: transaction.outboundEmailAddress,
      },
      rejectedDocuments,
      idempotencyKey,
    );

    if (result.sent) {
      await this.auditService.recordEscrowRejectionEmailSentAuditEvent({
        transactionId: link.transactionId,
        uploadLinkId: link.id,
        recipientEmail: link.recipientEmail,
        ccEmail: link.ccEmail,
        rejectedFileNames: rejectedDocuments.map((d) => d.fileName),
        providerMessageId: result.providerMessageId,
      });
    }
  }

  /**
   * Runs the existing document-analysis pipeline (the same entry point used
   * for authenticated uploads and inbound email attachments) and records the
   * detected form type. The pipeline also computes a compliance result as an
   * inherent part of that single call — it's stored in metadataJson for
   * potential later reuse but never acted on here: no blockers are created,
   * and it's never exposed through the public document list. A failed
   * analysis never touches the stored file or any other field on the row.
   */
  async analyzeUploadedDocument(documentId: string, buffer: Buffer): Promise<void> {
    try {
      const result = await this.pipelineService.process(buffer);
      await this.documentsService.updateAnalysisResult(documentId, {
        analysisStatus: 'completed',
        formCode: result.detectedFormCode,
        analyzedAt: new Date(),
      });
      await this.documentsService.patchMetadataJson(documentId, {
        extraction: result.extraction,
        compliance: result.compliance,
        detectedFormCode: result.detectedFormCode,
        detectedFormName: result.detectedFormName,
      });

      // Same combined-PDF splitting as the synchronous (Seller/Buyer Agent) path —
      // this is the path Escrow Officer PDFs (and HOA-tagged Buyer Agent PDFs) go
      // through, so they get split documents on their own checklists/lists too.
      const doc = await this.documentsService.findOne(documentId);
      if (doc.uploadLinkId) {
        await this.trySplitIntoFormDocuments(doc, result, buffer, doc.uploadLinkId);
      }
    } catch (err) {
      this.logger.error(`Analysis failed for document ${documentId}: ${(err as Error).message}`);
      await this.documentsService.updateAnalysisResult(documentId, {
        analysisStatus: 'failed',
        analyzedAt: new Date(),
      });
    }
  }

  /**
   * The persisted "Uploaded Documents" list for a secure link, scoped to
   * that link's own transaction + audience — never every document on the
   * transaction. Resolved through the single canExternalUserSeeDocument
   * rule (findVisibleForUploadLink): a Buyer Agent link sees its own
   * uploads plus internal (TC/myTC) uploads; a Seller Agent link sees only
   * its own uploads, never Buyer Agent or internal ones; an Escrow link
   * sees its own uploads plus the transaction's current RPA regardless of
   * who uploaded it. Superseded rows (e.g. an unsigned original replaced by
   * its DocuSign-signed version) are excluded, so this list is always the
   * current active set — never both an old and new version of the same
   * document.
   */
  async listUploadedDocuments(token: string): Promise<PublicUploadedDocumentDto[]> {
    const { link, transaction } = await this.uploadLinkService.validateUploadToken(token);
    this.assertNotBrokerLink(link.purpose);
    const linkType = resolveUploadLinkVisibilityType(link.purpose);
    const docs = await this.documentsService.findVisibleForUploadLink(transaction.id, linkType);
    return docs.map((doc) => toPublicDto(doc, token));
  }
}
