import { TransactionDocumentEntity } from '../transaction-documents/entities/transaction-document.entity';
import type { ComplianceCheck } from '../document-extraction/compliance-result.types';
import { hasActiveBlockers as hasActiveBlockersOverrideAware, effectiveCheckStatus, type BlockerOverrideRecord } from '../blocker-overrides/blocker-override.util';

/**
 * 'analyzing' and 'reupload_required' are only ever produced by
 * matchDocumentsToSellerAgentChecklist below — matchDocumentsToChecklist's
 * existing two-state behavior (Buyer Agent, Escrow, and the authenticated
 * dashboard's per-side checklists) is unchanged, this is purely an additive
 * widening of the shared status type.
 */
export type ChecklistItemStatus = 'required' | 'analyzing' | 'submitted' | 'reupload_required';

export interface ChecklistMatchedDocument {
  id: string;
  fileName: string | null;
  formType: string | null;
  uploadedAt: Date;
}

/** One row of a document's structured validation-check breakdown — see SellerAgentDocumentDocusignService.mapComplianceChecks. */
export interface DocumentValidationCheckDto {
  id: string;
  label: string;
  /** 'overridden' means the underlying check still failed/warned, but an authorized user accepted it — see blocker-override.util.ts. The check itself is never deleted or hidden. */
  status: 'passed' | 'failed' | 'not_applicable' | 'pending' | 'overridden';
  /** Only present when status is 'failed' — lets the UI tell a hard blocker apart from a non-blocking warning without a 5th status value. */
  severity?: 'error' | 'warning' | 'info';
  detail?: string;
  /** Human-readable location hint, e.g. "Page 2" — mirrors ComplianceCheck.location, shown by the checklist's validation dropdown alongside the check. */
  location?: string;
}

export interface DocumentValidationDto {
  checks: DocumentValidationCheckDto[];
}

/**
 * Maps a document's raw ComplianceCheck[] (produced by the per-form
 * blocker/warning catalogs — document type identified, property address
 * matched, signatures, initials, dates, pages, form revision, and any other
 * form-specific checks) into the checklist's plain passed/failed/not_applicable
 * vocabulary. Purpose-agnostic — used by every checklist's validation dropdown
 * (Seller Agent's own enrichment composes this, and the Buyer Agent checklist
 * uses it directly), not just the Seller Agent's DocuSign-specific one.
 *
 * `overrides` + `scope` route every check through the single shared
 * blocker-override resolver (effectiveCheckStatus) — a failed/warning check
 * whose rule has been overridden shows as 'overridden' here, never silently
 * as 'passed' (the underlying issue is never hidden, only accepted) and
 * never duplicating the override lookup independently.
 */
export function mapComplianceChecks(
  checks: ComplianceCheck[],
  overrides: readonly BlockerOverrideRecord[] = [],
  scope: { documentId?: string | null; formCode?: string | null } = {},
): DocumentValidationCheckDto[] {
  return checks.map((c) => ({
    id: c.ruleId,
    label: c.label,
    status: effectiveCheckStatus(c, overrides, scope),
    severity: c.status === 'fail' || c.status === 'warning' ? c.severity : undefined,
    detail: c.detail,
    location: c.location,
  }));
}

/** Builds the checklist's `validation` field from a document's own metadataJson.compliance.checks — null when there's no document, or it has no compliance result yet (still analyzing). */
export function buildDocumentValidation(
  doc: TransactionDocumentEntity | null,
  overrides: readonly BlockerOverrideRecord[] = [],
): DocumentValidationDto | null {
  const compliance = (doc?.metadataJson as { compliance?: { checks?: ComplianceCheck[] } } | null)?.compliance;
  return doc && compliance?.checks
    ? { checks: mapComplianceChecks(compliance.checks, overrides, { documentId: doc.id, formCode: doc.formCode }) }
    : null;
}

/** Seller Agent checklist only — per-document DocuSign eligibility/envelope/recipient info, attached by SellerAgentDocumentDocusignService.enrichChecklistWithDocusignInfo. */
export interface SellerAgentDocumentDocusignDto {
  eligible: boolean;
  ineligibleReason?: string;
  recipients: {
    signers: Array<{ name: string; email: string }>;
    cc: Array<{ name: string; email: string }>;
  };
  envelope: { envelopeId: string | null; status: string; sentAt: Date | null } | null;
}

/**
 * The item's compliance outcome, kept deliberately separate from `status`
 * (which is about upload/matching state) and from `matchedDocument` (which
 * is about whether a document exists at all) — see ChecklistItemDto.uploaded.
 * null when there's no document to validate yet (nothing uploaded, or still
 * analyzing with no compliance result yet).
 */
export type ChecklistValidationStatus = 'passed' | 'blocked' | 'overridden' | null;

export interface ChecklistItemDto {
  formCode: string;
  formName: string;
  category: string;
  status: ChecklistItemStatus;
  matchedDocument: ChecklistMatchedDocument | null;
  /**
   * Whether a document is actually attached to this item, independent of
   * its validation outcome — always `!!matchedDocument`. An overridden
   * blocker never makes this true on its own; only an actual uploaded
   * document does. See ChecklistValidationStatus above.
   */
  uploaded: boolean;
  /** This item's matched document's compliance outcome — see ChecklistValidationStatus. */
  validationStatus: ChecklistValidationStatus;
  /** Contingency-removal items only (Buyer Agent checklist): which contingency this item tracks. */
  contingencyType?: 'inspection' | 'loan' | 'appraisal';
  /** Contingency-removal items only: human-readable contract timeframe, e.g. "17 days after Acceptance". */
  contractTimeframe?: string;
  /** Contingency-removal items only: ISO date string of the calculated deadline, or null when it can't be determined. */
  deadline?: string | null;
  /** Contingency-removal items only: human-readable deadline, or "N/A — Deadline not found" when `deadline` is null. */
  deadlineDisplay?: string;
  /** Contingency-removal items only: whole days remaining (negative when past due), or null when `deadline` is null. */
  daysRemaining?: number | null;
  /** Contingency-removal items only: true when the deadline has passed and the item isn't yet submitted. */
  isPastDue?: boolean;
  /** Seller Agent checklist only, attached post-hoc — null everywhere else (including while the document is still analyzing, or before anything's been uploaded). */
  validation?: DocumentValidationDto | null;
  /** Seller Agent checklist only — same enrichment step. */
  docusign?: SellerAgentDocumentDocusignDto | null;
  /** Seller Agent checklist only — the most recent rejection's failure messages, when status is 'reupload_required'; null otherwise. */
  lastRejectionReasons?: string[] | null;
  /**
   * "Signed RPA" item only (Escrow Upload Link checklist): whether the
   * submitted RPA's logical Page 17 (Escrow Holder Acknowledgment) has the
   * required escrow/company info and escrow holder signature — see
   * isRpaEscrowPage17Completed in rpa-escrow-page17.util.ts. This is the
   * ONLY thing that governs this item's `status`, independent of buyer/
   * seller execution on pages 1-16 or the mere fact that an RPA was
   * uploaded (see `uploaded` above). Null for every other checklist item.
   */
  escrowPage17Completed?: boolean | null;
  /**
   * Dynamically-added AVID item only (Seller Agent checklist): explains why
   * this item is on the checklist and, while it's missing, the exact
   * missing-document message — see
   * TransactionFormTemplatesService.computeAvidRequirement. Cleared
   * (undefined) once the item's status is 'submitted'. Null/undefined for
   * every other checklist item.
   */
  requirementNote?: string | null;
}

export interface ChecklistRequiredItem {
  /** formCode for CAR-forms items (matchBy: 'formCode'), documentType for dedicated-category items (matchBy: 'documentType'). */
  key: string;
  label: string;
  category: string;
}

/**
 * True when a document's own compliance result recorded at least one blocker
 * — the gate behind "a split document is complete only after it passes every
 * required validation check" and "one valid document must never mark another
 * invalid document complete": since each split document carries its OWN
 * formCode and its OWN compliance result, this check is inherently per-document,
 * never influenced by a sibling form split from the same original PDF.
 */
export function hasComplianceBlockers(doc: TransactionDocumentEntity): boolean {
  const metadata = doc.metadataJson as { compliance?: { blockers?: unknown[] } } | null;
  return (metadata?.compliance?.blockers?.length ?? 0) > 0;
}

/**
 * Override-aware replacement for hasComplianceBlockers — a document whose
 * every recorded blocker has been overridden is no longer treated as
 * blocked. This is the ONLY place checklist matching decides "blocked",
 * so every checklist (Buyer Agent, Seller Agent, Escrow) that goes through
 * matchDocumentsToChecklist/matchDocumentsToSellerAgentChecklist inherits
 * override-awareness automatically — no per-checklist override logic.
 */
function hasActiveComplianceBlockers(doc: TransactionDocumentEntity, overrides: readonly BlockerOverrideRecord[]): boolean {
  const metadata = doc.metadataJson as { compliance?: { blockers?: Array<{ code: string }> } } | null;
  return hasActiveBlockersOverrideAware(metadata?.compliance?.blockers, overrides, { documentId: doc.id, formCode: doc.formCode });
}

/**
 * This item's validation outcome, kept independent of upload/matching
 * status — see ChecklistItemDto.uploaded/validationStatus. `null` when
 * there's no document yet, or it hasn't finished analysis.
 */
export function computeValidationStatus(doc: TransactionDocumentEntity | undefined, overrides: readonly BlockerOverrideRecord[]): ChecklistValidationStatus {
  if (!doc || doc.analysisStatus !== 'completed') return null;
  if (!hasComplianceBlockers(doc)) return 'passed';
  return hasActiveComplianceBlockers(doc, overrides) ? 'blocked' : 'overridden';
}

/**
 * The single reusable "required item vs. uploaded documents" matcher behind
 * every checklist in this app (the Buyer Agent's public CAR-forms + dedicated
 * checklist, and the authenticated dashboard's per-side Buyer/Seller/Escrow
 * checklists) — extracted out of TransactionFormTemplatesService.getChecklistStatus
 * so those callers can each pass a *different* (requiredItems, docs) pair
 * without duplicating the matching logic itself.
 *
 * - matchBy: 'formCode' — CAR-form items; only "submitted" once a document with
 *   that formCode has *completed* analysis AND passed every required
 *   validation check (an in-flight document can't yet be attributed to a
 *   specific item; a completed-but-blocked document is 'reupload_required'
 *   instead, carrying its own failed checks — never silently "required" as
 *   if nothing were ever uploaded).
 * - matchBy: 'documentType' — dedicated-category items (Lender Prequal, Proof of
 *   Funds, Escrow Instructions, etc.); "submitted" as soon as a document with that
 *   documentType is present — these are tagged deterministically via their own
 *   dedicated upload buttons, not automatic classification, so analysis (and
 *   compliance) is never a gate for these.
 */
export function matchDocumentsToChecklist(
  requiredItems: ChecklistRequiredItem[],
  docs: TransactionDocumentEntity[],
  matchBy: 'formCode' | 'documentType',
  overrides: readonly BlockerOverrideRecord[] = [],
): ChecklistItemDto[] {
  return requiredItems.map((reqItem) => {
    const matched = docs
      .filter((d) => (matchBy === 'formCode'
        ? d.formCode === reqItem.key && d.analysisStatus === 'completed'
        : d.documentType === reqItem.key))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];

    const blocked = matchBy === 'formCode' && !!matched && hasActiveComplianceBlockers(matched, overrides);

    return {
      formCode: reqItem.key,
      formName: reqItem.label,
      category: reqItem.category,
      status: blocked ? 'reupload_required' : matched ? 'submitted' : 'required',
      matchedDocument: matched
        ? { id: matched.id, fileName: matched.fileName, formType: matched.formCode, uploadedAt: matched.createdAt }
        : null,
      uploaded: !!matched,
      validationStatus: matchBy === 'formCode' ? computeValidationStatus(matched, overrides) : null,
    };
  });
}

/**
 * The Seller Agent checklist's matcher — always by formCode (Seller Agent has
 * no dedicated documentType items like Buyer Agent's Lender Prequal/Proof of
 * Funds). Four states instead of matchDocumentsToChecklist's two:
 *
 *   1. 'submitted'         — a document with this formCode has completed analysis.
 *   2. 'analyzing'         — no completed match yet, but one is in flight — an
 *                            in-flight document IS attributable here (unlike the
 *                            two-state matcher, which can't tell which item an
 *                            unanalyzed document belongs to yet).
 *   3. 'reupload_required' — no live document at all, but a recent upload for this
 *                            same formCode was rejected by the synchronous
 *                            validation gate (never saved) — `rejectedFormCodes`
 *                            is the caller's set of those, sourced from the
 *                            validation-failure audit trail for this upload link.
 *   4. 'required'          — nothing uploaded for this item yet.
 *
 * "Complete" only ever means 'submitted' — a rejected or in-flight document
 * never marks an item done, matching "mark an item complete only after the
 * required document passes validation."
 */
export function matchDocumentsToSellerAgentChecklist(
  requiredItems: ChecklistRequiredItem[],
  docs: TransactionDocumentEntity[],
  rejectedFormCodes: ReadonlySet<string>,
  overrides: readonly BlockerOverrideRecord[] = [],
): ChecklistItemDto[] {
  return requiredItems.map((reqItem) => {
    const forThisItem = docs.filter((d) => d.formCode === reqItem.key);
    const submitted = forThisItem
      .filter((d) => d.analysisStatus === 'completed')
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    const analyzing = forThisItem
      .filter((d) => d.analysisStatus === 'analyzing')
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];

    // A "completed" document that still has an ACTIVE (non-overridden)
    // compliance blocker never counts as submitted — it's reupload_required
    // instead, with matchedDocument pointing at the very document whose own
    // failed checks the UI shows. Once every blocker on it is overridden,
    // it's submitted like any clean document.
    const blocked = submitted && hasActiveComplianceBlockers(submitted, overrides);

    const matched = submitted ?? analyzing;
    const status: ChecklistItemStatus = submitted && !blocked
      ? 'submitted'
      : blocked
        ? 'reupload_required'
        : analyzing
          ? 'analyzing'
          : rejectedFormCodes.has(reqItem.key)
            ? 'reupload_required'
            : 'required';

    return {
      formCode: reqItem.key,
      formName: reqItem.label,
      category: reqItem.category,
      status,
      matchedDocument: matched
        ? { id: matched.id, fileName: matched.fileName, formType: matched.formCode, uploadedAt: matched.createdAt }
        : null,
      uploaded: !!matched,
      validationStatus: computeValidationStatus(matched, overrides),
    };
  });
}
