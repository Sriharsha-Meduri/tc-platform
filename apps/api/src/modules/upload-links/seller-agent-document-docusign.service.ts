import { Injectable, Logger, NotFoundException, ConflictException, UnprocessableEntityException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UploadLinkEntity } from './entities/upload-link.entity';
import { UploadAuditService } from './upload-audit.service';
import { SELLER_AGENT_TRANSACTION_DOCUMENT_UPLOAD } from './upload-link.types';
import { resolveBuyerSideRecipients, missingRecipientsFor } from './docusign-recipient-rules.util';
import { TransactionEntity } from '../transactions/entities/transaction.entity';
import { TransactionDocumentEntity } from '../transaction-documents/entities/transaction-document.entity';
import { TransactionPartyEntity } from '../transaction-parties/entities/transaction-party.entity';
import { TransactionFormTemplatesService, UnmatchedDocumentDto, DocumentChecklistStatus } from '../transaction-form-templates/transaction-form-templates.service';
import { DocuSignService } from '../docusign/docusign.service';
import { DocuSignEnvelopeEntity, DocuSignEnvelopeStatus } from '../docusign/entities/docusign-envelope.entity';
import { BUYER_REVIEW_REMINDER_TEXT } from './seller-agent-docusign.service';
import { ChecklistItemDto, SellerAgentDocumentDocusignDto, buildDocumentValidation } from '../transaction-form-templates/checklist-matching.util';
import { BlockerOverrideService } from '../blocker-overrides/blocker-override.service';
import type { TransactionBlockerOverrideEntity } from '../blocker-overrides/entities/transaction-blocker-override.entity';

/** Envelope statuses that don't block sending a fresh one for the same document — a prior attempt that was declined, voided, or itself failed to send isn't "already sent" for duplicate-prevention purposes. */
const NON_BLOCKING_ENVELOPE_STATUSES = new Set<string>([
  DocuSignEnvelopeStatus.DECLINED,
  DocuSignEnvelopeStatus.VOIDED,
  DocuSignEnvelopeStatus.FAILED,
]);

/**
 * Per-document sibling of SellerAgentDocusignService — sends exactly one
 * document via DocuSign instead of everything on the link at once. Reuses
 * the bulk flow's own recipient rule and its actual envelope-creation call
 * (DocuSignService.sendSellerDocumentsToBuyer already accepts an arbitrary
 * documentIds array; a one-element array IS a per-document envelope, no new
 * schema needed). Deliberately its own service, not a modification of
 * SellerAgentDocusignService, so the existing bulk flow's behavior and
 * tests are left untouched.
 */
@Injectable()
export class SellerAgentDocumentDocusignService {
  private readonly logger = new Logger(SellerAgentDocumentDocusignService.name);

  constructor(
    private readonly formTemplatesService: TransactionFormTemplatesService,
    private readonly docuSignService: DocuSignService,
    private readonly auditService: UploadAuditService,
    @InjectRepository(TransactionPartyEntity)
    private readonly partiesRepo: Repository<TransactionPartyEntity>,
    @InjectRepository(DocuSignEnvelopeEntity)
    private readonly envelopeRepo: Repository<DocuSignEnvelopeEntity>,
    private readonly blockerOverrideService: BlockerOverrideService,
  ) {}

  private assertSellerAgentPurpose(link: UploadLinkEntity): void {
    if (link.purpose !== SELLER_AGENT_TRANSACTION_DOCUMENT_UPLOAD) {
      throw new NotFoundException('This feature is only available on the Seller Agent upload link.');
    }
  }

  /** The most recent envelope containing this specific document, regardless of status — what the checklist displays (declined/voided/failed included, so the UI can show the status and a Resend affordance). */
  private async findMostRecentEnvelopeForDocument(uploadLinkId: string, documentId: string): Promise<DocuSignEnvelopeEntity | null> {
    const envelopes = await this.envelopeRepo.find({ where: { uploadLinkId }, order: { createdAt: 'DESC' } });
    return envelopes.find((e) => (e.documentIds ?? []).includes(documentId)) ?? null;
  }

  /** The most recent envelope containing this specific document that would block a fresh send — null if there's none, or the only ones are declined/voided/failed. */
  private async findBlockingEnvelopeForDocument(uploadLinkId: string, documentId: string): Promise<DocuSignEnvelopeEntity | null> {
    const envelopes = await this.envelopeRepo.find({ where: { uploadLinkId }, order: { createdAt: 'DESC' } });
    return envelopes.find((e) => (e.documentIds ?? []).includes(documentId) && !NON_BLOCKING_ENVELOPE_STATUSES.has(e.status)) ?? null;
  }

  /**
   * `allRequiredSubmitted` gates every document on the link, not just the one
   * being checked — DocuSign processing must not begin for ANY document until
   * every required checklist item is itself 'submitted' (matched, analyzed,
   * and free of active blockers — never just "uploaded"), per the checklist's
   * own `allRequiredSubmitted`, the same source of truth the page's pending
   * notice reads.
   */
  private isDocumentEligible(
    doc: TransactionDocumentEntity | null,
    overrides: readonly TransactionBlockerOverrideEntity[] = [],
    allRequiredSubmitted = true,
  ): { eligible: boolean; ineligibleReason?: string } {
    if (!allRequiredSubmitted) return { eligible: false, ineligibleReason: 'All required documents must be submitted before any document can be sent via DocuSign.' };
    if (!doc) return { eligible: false, ineligibleReason: 'Document has not completed upload and validation yet.' };
    if (doc.analysisStatus !== 'completed') return { eligible: false, ineligibleReason: 'Document has not completed upload and validation yet.' };
    if (!doc.formCode) return { eligible: false, ineligibleReason: 'Document type has not been identified.' };
    const metadata = doc.metadataJson as { compliance?: { blockers?: Array<{ code: string }> } } | null;
    if (this.blockerOverrideService.hasActiveBlockers(metadata?.compliance?.blockers, overrides, { documentId: doc.id, formCode: doc.formCode })) {
      return { eligible: false, ineligibleReason: 'Document has not passed every required validation check.' };
    }
    return { eligible: true };
  }

  private async buildDocusignDto(link: UploadLinkEntity, transaction: TransactionEntity, doc: TransactionDocumentEntity | null, overrides: readonly TransactionBlockerOverrideEntity[] = [], allRequiredSubmitted = true): Promise<SellerAgentDocumentDocusignDto | null> {
    if (!doc) return null;

    const [{ eligible, ineligibleReason }, { buyers, buyerAgent }, mostRecentEnvelope] = await Promise.all([
      Promise.resolve(this.isDocumentEligible(doc, overrides, allRequiredSubmitted)),
      resolveBuyerSideRecipients(this.partiesRepo, transaction.id),
      this.findMostRecentEnvelopeForDocument(link.id, doc.id),
    ]);

    return {
      eligible,
      ineligibleReason,
      recipients: {
        signers: buyers.map((b) => ({ name: b.displayName, email: b.email ?? '' })),
        cc: buyerAgent ? [{ name: buyerAgent.displayName, email: buyerAgent.email ?? '' }] : [],
      },
      envelope: mostRecentEnvelope ? { envelopeId: mostRecentEnvelope.envelopeId, status: mostRecentEnvelope.status, sentAt: mostRecentEnvelope.sentAt } : null,
    };
  }

  /**
   * Attaches per-document `docusign` and `validation`/`lastRejectionReasons`
   * info onto an already-computed Seller Agent checklist, for every item
   * that has a document to act on. Purely additive to the checklist shape —
   * called only from the Seller Agent branch of getDocumentChecklist.
   */
  async enrichChecklistWithDocusignInfo(
    link: UploadLinkEntity,
    transaction: TransactionEntity,
    checklist: DocumentChecklistStatus,
  ): Promise<DocumentChecklistStatus> {
    this.assertSellerAgentPurpose(link);

    const [rejectionReasons, overrides] = await Promise.all([
      this.auditService.findMostRecentRejectionReasons(link.id),
      this.blockerOverrideService.findForTransaction(transaction.id),
    ]);

    const enrichItem = async (item: ChecklistItemDto): Promise<ChecklistItemDto> => {
      const doc = item.matchedDocument
        ? await this.formTemplatesService.getValidatedDocumentById(link.id, transaction.id, item.matchedDocument.id)
        : null;

      const lastRejectionReasons = item.status === 'reupload_required'
        ? (rejectionReasons.get(item.formCode) ?? [])
        : null;

      return {
        ...item,
        validation: buildDocumentValidation(doc, overrides),
        docusign: await this.buildDocusignDto(link, transaction, doc, overrides, checklist.allRequiredSubmitted),
        lastRejectionReasons,
      };
    };

    const enrichUnmatched = async (doc: UnmatchedDocumentDto): Promise<UnmatchedDocumentDto> => {
      const fullDoc = await this.formTemplatesService.getValidatedDocumentById(link.id, transaction.id, doc.id);

      return {
        ...doc,
        validation: buildDocumentValidation(fullDoc, overrides),
        docusign: await this.buildDocusignDto(link, transaction, fullDoc, overrides, checklist.allRequiredSubmitted),
      };
    };

    const [items, optionalItems, unmatchedDocuments] = await Promise.all([
      Promise.all(checklist.items.map(enrichItem)),
      Promise.all(checklist.optionalItems.map(enrichItem)),
      Promise.all(checklist.unmatchedDocuments.map(enrichUnmatched)),
    ]);

    return { ...checklist, items, optionalItems, unmatchedDocuments };
  }

  /**
   * Sends one or more documents via DocuSign as a single combined envelope —
   * re-validates everything server-side rather than trusting an earlier
   * checklist read, since that read could be stale by the time this is
   * called (another tab, a slow page, a retried request). `resend: true` is
   * the only way to bypass an existing non-terminal envelope for any of the
   * requested documents. `sendDocument` (single-document) is a thin wrapper
   * around this — one envelope containing one document IS a per-document
   * send, no separate code path needed.
   */
  async sendDocuments(link: UploadLinkEntity, transaction: TransactionEntity, documentIds: string[], opts: { resend?: boolean } = {}): Promise<DocuSignEnvelopeEntity> {
    this.assertSellerAgentPurpose(link);
    if (documentIds.length === 0) {
      throw new UnprocessableEntityException('Select at least one document to send.');
    }

    const [docs, overrides, checklist] = await Promise.all([
      Promise.all(documentIds.map((id) => this.formTemplatesService.getValidatedDocumentById(link.id, transaction.id, id))),
      this.blockerOverrideService.findForTransaction(transaction.id),
      this.formTemplatesService.getSellerAgentChecklistStatus(transaction, link.id, new Set()),
    ]);

    const ineligible: string[] = [];
    docs.forEach((doc, i) => {
      const { eligible, ineligibleReason } = this.isDocumentEligible(doc, overrides, checklist.allRequiredSubmitted);
      if (!eligible) ineligible.push(`${doc?.fileName ?? documentIds[i]}: ${ineligibleReason ?? 'Document is not eligible to be sent via DocuSign.'}`);
    });
    if (ineligible.length > 0) {
      throw new UnprocessableEntityException(`The following document(s) are not eligible to be sent via DocuSign — ${ineligible.join('; ')}`);
    }

    if (!opts.resend) {
      const blocking = await Promise.all(documentIds.map((id) => this.findBlockingEnvelopeForDocument(link.id, id)));
      if (blocking.some((e) => e !== null)) {
        throw new ConflictException('One or more selected documents have already been sent via DocuSign.');
      }
    }

    const { buyers, buyerAgent } = await resolveBuyerSideRecipients(this.partiesRepo, transaction.id);
    const missing = missingRecipientsFor(buyers, buyerAgent);
    if (missing.length > 0) {
      throw new UnprocessableEntityException(`Missing required recipient(s): ${missing.join(', ')}`);
    }

    try {
      const envelope = await this.docuSignService.sendSellerDocumentsToBuyer({
        transactionId: transaction.id,
        uploadLinkId: link.id,
        documentIds,
        buyers: buyers.map((b) => ({ name: b.displayName, email: b.email! })),
        buyerAgent: { name: buyerAgent!.displayName, email: buyerAgent!.email! },
        emailBody: BUYER_REVIEW_REMINDER_TEXT,
      });

      await this.auditService.recordDocusignEnvelopeSentAuditEvent({
        transactionId: link.transactionId,
        uploadLinkId: link.id,
        envelopeId: envelope.envelopeId,
        documentIds,
        buyerEmails: buyers.map((b) => b.email!),
        buyerAgentEmail: buyerAgent!.email!,
      });

      this.logger.log(`DocuSign send complete for ${documentIds.length} document(s) on link ${link.id}: envelope ${envelope.envelopeId}`);
      return envelope;
    } catch (err) {
      // Never persist or return the raw DocuSign API error body — it can contain account/internal details.
      const sanitizedReason = 'The DocuSign envelope could not be created. Please try again.';
      this.logger.error(`DocuSign send failed for documents [${documentIds.join(', ')}]: ${(err as Error).message}`);

      const subject = docs.length === 1
        ? `Signature Request – ${docs[0]!.fileName ?? 'document'}`
        : `Signature Request – ${docs.length} documents`;

      await this.envelopeRepo.save(this.envelopeRepo.create({
        transactionId: transaction.id,
        status: DocuSignEnvelopeStatus.FAILED,
        subject,
        documentIds,
        uploadLinkId: link.id,
        error: sanitizedReason,
      }));

      await Promise.all(documentIds.map((documentId) => this.auditService.recordDocumentDocusignSendFailedAuditEvent({
        transactionId: transaction.id,
        uploadLinkId: link.id,
        documentId,
        reason: sanitizedReason,
      })));

      throw new UnprocessableEntityException(sanitizedReason);
    }
  }

  /** Single-document send — see sendDocuments, which this delegates to with a one-element array. */
  async sendDocument(link: UploadLinkEntity, transaction: TransactionEntity, documentId: string, opts: { resend?: boolean } = {}): Promise<DocuSignEnvelopeEntity> {
    return this.sendDocuments(link, transaction, [documentId], opts);
  }
}
