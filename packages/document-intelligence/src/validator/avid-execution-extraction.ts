/**
 * Enhanced AVID Execution Extraction Schema
 *
 * Provides detailed visual evidence for execution field observations on
 * C.A.R. Form AVID (Agent Visual Inspection Disclosure).
 *
 * This schema enables the validator to distinguish between:
 * - Confirmed missing signatures/initials
 * - Ambiguous placements requiring manual review
 * - Electronic signature field misalignment
 * - Unassigned execution marks between fields
 * - Optional fields (receipt evidence) that should not generate blockers
 *
 * AVID has 3 pages with 5 execution zones:
 * - Page 1: Buyer initials (2 slots)
 * - Page 2: Buyer initials (2 slots)
 * - Page 3: Inspecting agent signature + date
 * - Page 3: Buyer acknowledgement signatures + dates (2 slots)
 * - Page 3: Optional receipt evidence
 */

// ─── Execution Zone Types ─────────────────────────────────────────────────────

export type AvidExecutionZone =
  | 'page_1_buyer_initials'
  | 'page_2_buyer_initials'
  | 'page_3_agent_signature'
  | 'page_3_buyer_acknowledgement'
  | 'page_3_receipt_evidence';

// ─── Mark Types ───────────────────────────────────────────────────────────────

export type AvidMarkType =
  | 'handwritten'
  | 'electronic'
  | 'typed_initials'
  | 'typed_electronic_signature'
  | 'blank'
  | 'unreadable';

// ─── Field Alignment Types ────────────────────────────────────────────────────

export type AvidFieldAlignment =
  | 'inside_field'
  | 'overlaps_field'
  | 'between_fields'
  | 'closer_to_adjacent_field'
  | 'outside_execution_area'
  | 'unknown';

// ─── Signature Source Types ───────────────────────────────────────────────────

export type AvidSignatureSource =
  | 'signature_mark'
  | 'electronic_signature_block'
  | 'typed_name_inside_field'
  | 'printed_form_text'
  | 'footer_metadata'
  | 'unknown';

// ─── Execution Field Observation ──────────────────────────────────────────────

/**
 * Detailed visual observation of a single execution field on the AVID form.
 *
 * Each observation includes spatial alignment information, confidence scores,
 * and flags that help the validator determine whether a signature/initial is:
 * - Clearly present
 * - Clearly missing
 * - Ambiguous (requires manual review)
 */
export interface AvidExecutionFieldObservation {
  /** Unique field identifier (e.g., 'p1_buyer_initials_1', 'p3_agent_signature') */
  fieldId: string;

  /** Execution zone this field belongs to */
  zone: AvidExecutionZone;

  /** Page number (1, 2, or 3) */
  pageNumber: 1 | 2 | 3;

  /** Slot number within the zone (1-indexed, 1 for single-field zones) */
  slotNumber: number;

  /** Printed label on the form next to this field */
  printedLabel: string;

  /** Whether any signature/initial mark is visually present */
  markPresent: boolean;

  /** Type of mark detected (if present) */
  markType: AvidMarkType;

  /** Extracted signer/initialer name from the mark (null if not readable) */
  signerName: string | null;

  /** Source where the signer name was extracted from */
  signerNameSource: AvidSignatureSource;

  /** Whether a date is visually present near this field */
  datePresent: boolean;

  /** Extracted date text (if present and readable) */
  dateText: string | null;

  /** Whether the date is associated with this specific field */
  dateAssociatedWithThisField: boolean;

  /** Spatial alignment of the mark relative to the printed field */
  fieldAlignment: AvidFieldAlignment;

  /** Whether this mark overlaps into an adjacent field */
  overlapsAdjacentField: boolean;

  /** The field ID of the adjacent field being overlapped (if applicable) */
  adjacentFieldId: string | null;

  /** Whether detected text is only from printed form text or metadata (not execution) */
  isPrintedMetadataOnly: boolean;

  /** Confidence score (0-1) for the overall field observation */
  confidence: number;

  /** Whether this field requires manual review by a human */
  requiresManualReview: boolean;

  /** Reason manual review is required (if applicable) */
  manualReviewReason: string | null;

  /** Concise description of what is visually present and where */
  visualEvidence: string;

  /** Whether this field is optional (e.g., receipt evidence) */
  isOptional: boolean;
}

// ─── Unassigned Execution Mark ────────────────────────────────────────────────

/**
 * An execution mark (signature, initial, or date) that could not be reliably
 * assigned to a specific field. These marks prevent false positive missing-signature
 * blockers because they might belong to the adjacent field.
 */
export interface AvidUnassignedExecutionMark {
  /** Extracted signer/initialer name (if readable) */
  signerName: string | null;

  /** Extracted date text (if readable) */
  dateText: string | null;

  /** Visual description of the mark and its location */
  visualEvidence: string;

  /** The field ID this mark is nearest to (if determinable) */
  nearestFieldId: string | null;

  /** Confidence score for the nearest field assignment */
  confidence: number;

  /** The zone where this mark was found */
  zone: AvidExecutionZone;
}

// ─── AVID Execution Extraction Result ─────────────────────────────────────────

/**
 * Complete execution extraction result for an AVID form.
 *
 * Contains detailed observations for all execution fields plus
 * any unassigned execution marks that couldn't be reliably positioned.
 */
export interface AvidExecutionExtraction {
  /** Form type identifier */
  formType: 'AVID';

  /** Form-level validation results */
  formValidation: {
    /** Whether the document is actually an AVID form */
    isAvid: boolean;
    /** Detected form revision */
    formRevision: string | null;
    /** Whether all required pages are present */
    allPagesPresent: boolean;
    /** Number of detected pages */
    detectedPageCount: number;
  };

  /** Detailed observations for all execution fields */
  fields: AvidExecutionFieldObservation[];

  /** Execution marks that could not be reliably assigned to a field */
  unassignedExecutionMarks: AvidUnassignedExecutionMark[];

  /** Any warnings from the extraction process */
  extractionWarnings: string[];
}

// ─── Validation Context ───────────────────────────────────────────────────────

/**
 * Transaction context needed for AVID signature validation.
 * Provides expected party counts and names for matching.
 */
export interface AvidValidationContext {
  /** Number of expected buyers (null if unknown) */
  expectedBuyerCount: number | null;

  /** Expected buyer names for signer matching (optional) */
  expectedBuyerNames?: string[] | null;

  /** Expected inspecting agent name (optional) */
  expectedAgentName?: string | null;
}

// ─── Validation Issue ─────────────────────────────────────────────────────────

/**
 * A single validation issue (blocker or warning) found during validation.
 */
export interface AvidValidationIssue {
  /** Unique issue code (e.g., 'BLOCKER_AVID_P3_AGENT_SIGNATURE_MISSING') */
  code: string;

  /** Severity level */
  severity: 'blocker' | 'warning';

  /** Field ID this issue relates to (null for document-level issues) */
  fieldId: string | null;

  /** Human-readable message describing the issue */
  message: string;
}

// ─── Execution Validation Status ──────────────────────────────────────────────

/**
 * The validation status of a single execution field.
 *
 * Three-state outcome:
 * - 'present': Signature/initial confirmed present and valid
 * - 'missing': Signature/initial confirmed missing (can confidently determine)
 * - 'manual_review_required': Ambiguous case requiring human review
 */
export type AvidExecutionValidationStatus =
  | 'present'
  | 'missing'
  | 'manual_review_required';

// ─── AVID Validation Result ───────────────────────────────────────────────────

/**
 * Complete validation result for AVID execution extraction.
 */
export interface AvidExecutionValidationResult {
  /** Whether all required signatures/initials are present (no blockers) */
  valid: boolean;

  /** Whether any warnings exist requiring manual review */
  manualReviewRequired: boolean;

  /** Blocking issues that prevent form completion */
  blockers: AvidValidationIssue[];

  /** Non-blocking warnings for review */
  warnings: AvidValidationIssue[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Ordered field IDs for page 1 buyer initials */
export const P1_BUYER_INITIAL_FIELDS = [
  'p1_buyer_initials_1',
  'p1_buyer_initials_2',
] as const;

/** Ordered field IDs for page 2 buyer initials */
export const P2_BUYER_INITIAL_FIELDS = [
  'p2_buyer_initials_1',
  'p2_buyer_initials_2',
] as const;

/** Field ID for inspecting agent signature */
export const P3_AGENT_SIGNATURE_FIELD = 'p3_agent_signature' as const;

/** Ordered field IDs for page 3 buyer acknowledgements */
export const P3_BUYER_ACKNOWLEDGEMENT_FIELDS = [
  'p3_buyer_acknowledgement_1',
  'p3_buyer_acknowledgement_2',
] as const;

/** Field ID for optional receipt evidence */
export const P3_RECEIPT_EVIDENCE_FIELD = 'p3_receipt_evidence' as const;

/** All required field IDs (excluding optional receipt evidence) */
export const REQUIRED_FIELDS = [
  ...P1_BUYER_INITIAL_FIELDS,
  ...P2_BUYER_INITIAL_FIELDS,
  P3_AGENT_SIGNATURE_FIELD,
  ...P3_BUYER_ACKNOWLEDGEMENT_FIELDS,
] as const;

/** Human-readable zone labels */
export const ZONE_LABELS: Record<AvidExecutionZone, string> = {
  page_1_buyer_initials: 'Page 1 Buyer Initials',
  page_2_buyer_initials: 'Page 2 Buyer Initials',
  page_3_agent_signature: 'Page 3 Inspecting Agent Signature',
  page_3_buyer_acknowledgement: 'Page 3 Buyer Acknowledgements',
  page_3_receipt_evidence: 'Page 3 Receipt Evidence',
};
