export type ChecklistItemStatus = 'required' | 'analyzing' | 'submitted' | 'reupload_required';
export type UnmatchedDocumentStatus = 'uploaded' | 'analyzing' | 'analysis_failed' | 'unknown_form' | 'needs_review' | 'original';

export interface DocumentValidationCheckDto {
  id: string;
  label: string;
  status: 'passed' | 'failed' | 'not_applicable' | 'pending' | 'overridden';
  severity?: 'error' | 'warning' | 'info';
  detail?: string;
  /** Human-readable location hint, e.g. "Page 2", shown alongside the check's label when present. */
  location?: string;
}

export interface DocumentValidationDto {
  checks: DocumentValidationCheckDto[];
}

export interface SellerAgentDocumentDocusignDto {
  eligible: boolean;
  ineligibleReason?: string;
  recipients: {
    signers: Array<{ name: string; email: string }>;
    cc: Array<{ name: string; email: string }>;
  };
  envelope: { envelopeId: string | null; status: string; sentAt: string | null } | null;
}

export interface ChecklistItemDto {
  formCode: string;
  formName: string;
  category: string;
  status: ChecklistItemStatus;
  matchedDocument: { id: string; fileName: string | null; formType: string | null; uploadedAt: string } | null;
  /** Always `!!matchedDocument` — a convenience mirror, not independent state. */
  uploaded: boolean;
  /** This item's compliance outcome, resolved through the centralized blocker-override store. */
  validationStatus: 'passed' | 'blocked' | 'overridden' | null;
  /** Escrow's "Signed RPA" item only — whether the RPA's own Page 17 (Escrow Holder Acknowledgment) is complete; a false value keeps the item 'required' even once uploaded. */
  escrowPage17Completed?: boolean | null;
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
  /** Seller Agent checklist only. */
  validation?: DocumentValidationDto | null;
  /** Seller Agent checklist only. */
  docusign?: SellerAgentDocumentDocusignDto | null;
  /** Seller Agent checklist only — populated when status is 'reupload_required'. */
  lastRejectionReasons?: string[] | null;
  /** Dynamically-added AVID item only: why it's on the checklist / the missing-document message while status isn't 'submitted'. */
  requirementNote?: string | null;
}

export interface UnmatchedDocumentDto {
  id: string;
  fileName: string | null;
  formType: string | null;
  status: UnmatchedDocumentStatus;
  uploadedAt: string;
  /** True for the original combined file once it's been split into per-form documents. */
  isOriginalPackage: boolean;
  /** The original file's document id, for a document split out of a combined PDF — null otherwise. */
  sourceDocumentId: string | null;
  validation?: DocumentValidationDto | null;
  docusign?: SellerAgentDocumentDocusignDto | null;
}

export interface DocumentChecklistStatus {
  items: ChecklistItemDto[];
  /** Always-present, never-required items (Buyer Agent link only — currently RR/RRRR) — missing one never blocks anything. */
  optionalItems: ChecklistItemDto[];
  unmatchedDocuments: UnmatchedDocumentDto[];
  requiredCount: number;
  submittedCount: number;
  allRequiredSubmitted: boolean;
  /**
   * Transaction-wide, not just this link's own checklist: true only once every
   * upload-link audience (Buyer Agent, Seller Agent, Escrow, Broker) has fully
   * satisfied its checklist, every DocuSign signature request has resolved,
   * and (buyer-side only) the signed CDA is on file. Same value on every
   * upload-link page for a given transaction — see TransactionCompletionService.
   */
  transactionCompleted: boolean;
}

export const DOCUSIGN_ENVELOPE_STATUS_LABELS: Record<string, string> = {
  created: 'Created',
  sent: 'Sent',
  delivered: 'Delivered',
  completed: 'Completed',
  declined: 'Declined',
  voided: 'Voided',
  send_failed: 'Send Failed',
};

export const CHECKLIST_STATUS_LABELS: Record<ChecklistItemStatus, string> = {
  required: 'Required',
  analyzing: 'Analyzing',
  submitted: 'Submitted',
  reupload_required: 'Reupload Required',
};

export const UNMATCHED_STATUS_LABELS: Record<UnmatchedDocumentStatus, string> = {
  uploaded: 'Uploaded',
  analyzing: 'Analyzing',
  analysis_failed: 'Analysis Failed',
  unknown_form: 'Unknown Form',
  /** 'needs_review' means analysis finished but no form could be identified at all — an identification gap, not a compliance verdict, so it's labeled the same as a plain upload rather than a generic status word. */
  needs_review: 'Uploaded',
  original: 'Original',
};
