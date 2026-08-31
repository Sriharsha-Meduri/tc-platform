/**
 * Enhanced Disclosure Signature Extraction Schema
 *
 * Provides detailed visual evidence for signature field observations on
 * disclosure forms, particularly WFA. This schema enables the validator
 * to distinguish between:
 * - Confirmed missing signatures
 * - Ambiguous placements requiring manual review
 * - Electronic signature field misalignment
 * - Unassigned execution marks between fields
 *
 * The enhanced extraction feeds into the deterministic validator which
 * uses a confidence-based approach to avoid false positive blockers.
 */

// ─── Signature Role Types ─────────────────────────────────────────────────────

export type SignatureRole =
  | 'buyer_tenant'
  | 'seller_housing_provider';

// ─── Signature Mark Types ─────────────────────────────────────────────────────

export type SignatureMarkType =
  | 'handwritten'
  | 'electronic'
  | 'typed_electronic_signature'
  | 'blank'
  | 'unreadable';

// ─── Field Alignment Types ────────────────────────────────────────────────────

export type FieldAlignment =
  | 'inside_field'
  | 'overlaps_field'
  | 'between_fields'
  | 'closer_to_adjacent_field'
  | 'outside_execution_area'
  | 'unknown';

// ─── Signer Name Source Types ─────────────────────────────────────────────────

export type SignerNameSource =
  | 'signature_mark'
  | 'electronic_signature_block'
  | 'typed_name_inside_signature_field'
  | 'printed_form_text'
  | 'footer_metadata'
  | 'unknown';

// ─── Signature Field Observation ──────────────────────────────────────────────

/**
 * Detailed visual observation of a single signature field on a disclosure form.
 *
 * Each observation includes spatial alignment information, confidence scores,
 * and flags that help the validator determine whether a signature is:
 * - Clearly present
 * - Clearly missing
 * - Ambiguous (requires manual review)
 */
export interface SignatureFieldObservation {
  /** Unique field identifier (e.g., 'buyer_tenant_1', 'seller_housing_provider_2') */
  fieldId: string;

  /** Role of the expected signer */
  role: SignatureRole;

  /** Slot number within the role (1 or 2) */
  slotNumber: 1 | 2;

  /** Printed label on the form next to this signature field */
  printedLabel: 'Buyer/Tenant' | 'Seller/Housing Provider';

  /** Whether any signature mark is visually present in or overlapping this field */
  signatureMarkPresent: boolean;

  /** Type of signature mark detected (if present) */
  signatureMarkType: SignatureMarkType;

  /** Extracted signer name from the signature mark (null if not readable) */
  signerName: string | null;

  /** Source where the signer name was extracted from */
  signerNameSource: SignerNameSource;

  /** Whether a date is visually present near this signature field */
  datePresent: boolean;

  /** Extracted date text (if present and readable) */
  dateText: string | null;

  /** Whether the date is associated with this specific field (not another row) */
  dateAssociatedWithThisField: boolean;

  /** Spatial alignment of the signature mark relative to the printed field */
  fieldAlignment: FieldAlignment;

  /** Whether this signature mark overlaps into an adjacent field's row */
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
}

// ─── Unassigned Execution Mark ────────────────────────────────────────────────

/**
 * An execution mark (signature or date) that could not be reliably assigned
 * to a specific field. These marks prevent false positive missing-signature
 * blockers because they might belong to the adjacent field.
 */
export interface UnassignedExecutionMark {
  /** Extracted signer name (if readable) */
  signerName: string | null;

  /** Extracted date text (if readable) */
  dateText: string | null;

  /** Visual description of the mark and its location */
  visualEvidence: string;

  /** The field ID this mark is nearest to (if determinable) */
  nearestFieldId: string | null;

  /** Confidence score for the nearest field assignment */
  confidence: number;
}

// ─── WFA Signature Extraction Result ──────────────────────────────────────────

/**
 * Complete signature extraction result for a WFA form.
 *
 * Contains detailed observations for all four signature fields plus
 * any unassigned execution marks that couldn't be reliably positioned.
 */
export interface WfaSignatureExtraction {
  /** Form type identifier */
  formType: 'WFA';

  /** Form-level validation results */
  formValidation: {
    /** Whether the document is actually a WFA form */
    isWfa: boolean;
    /** Whether the page label matches expected WFA format */
    correctPageLabel: boolean;
    /** Whether the page appears complete (not cropped) */
    pageComplete: boolean;
  };

  /** Detailed observations for all four signature fields */
  fields: SignatureFieldObservation[];

  /** Execution marks that could not be reliably assigned to a field */
  unassignedExecutionMarks: UnassignedExecutionMark[];

  /** Any warnings from the extraction process */
  extractionWarnings: string[];
}

// ─── Validation Context ───────────────────────────────────────────────────────

/**
 * Transaction context needed for WFA signature validation.
 * Provides expected party counts and names for matching.
 */
export interface WfaValidationContext {
  /** Number of expected Buyer/Tenant signers (null if unknown) */
  expectedBuyerTenantCount: number | null;

  /** Number of expected Seller/Housing Provider signers (null if unknown) */
  expectedSellerHousingProviderCount: number | null;

  /** Expected Buyer/Tenant names for signer matching (optional) */
  expectedBuyerTenantNames?: string[] | null;

  /** Expected Seller/Housing Provider names for signer matching (optional) */
  expectedSellerHousingProviderNames?: string[] | null;
}

// ─── Validation Issue ─────────────────────────────────────────────────────────

/**
 * A single validation issue (blocker or warning) found during validation.
 */
export interface ValidationIssue {
  /** Unique issue code (e.g., 'BLOCKER_WFA_BUYER_TENANT_1_SIGNATURE_MISSING') */
  code: string;

  /** Severity level */
  severity: 'blocker' | 'warning';

  /** Field ID this issue relates to (null for document-level issues) */
  fieldId: string | null;

  /** Human-readable message describing the issue */
  message: string;
}

// ─── Signature Validation Status ──────────────────────────────────────────────

/**
 * The validation status of a single signature field.
 *
 * Three-state outcome:
 * - 'present': Signature confirmed present and valid
 * - 'missing': Signature confirmed missing (can confidently determine)
 * - 'manual_review_required': Ambiguous case requiring human review
 */
export type SignatureValidationStatus =
  | 'present'
  | 'missing'
  | 'manual_review_required';

// ─── WFA Validation Result ────────────────────────────────────────────────────

/**
 * Complete validation result for WFA signature extraction.
 */
export interface WfaValidationResult {
  /** Whether all required signatures are present (no blockers) */
  valid: boolean;

  /** Whether any warnings exist requiring manual review */
  manualReviewRequired: boolean;

  /** Blocking issues that prevent form completion */
  blockers: ValidationIssue[];

  /** Non-blocking warnings for review */
  warnings: ValidationIssue[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Ordered field IDs for buyer/tenant role */
export const BUYER_TENANT_FIELDS = [
  'buyer_tenant_1',
  'buyer_tenant_2',
] as const;

/** Ordered field IDs for seller/housing provider role */
export const SELLER_HOUSING_PROVIDER_FIELDS = [
  'seller_housing_provider_1',
  'seller_housing_provider_2',
] as const;

/** Map of role to ordered field IDs */
export const ROLE_FIELDS: Record<SignatureRole, readonly string[]> = {
  buyer_tenant: BUYER_TENANT_FIELDS,
  seller_housing_provider: SELLER_HOUSING_PROVIDER_FIELDS,
};

/** Human-readable role labels */
export const ROLE_LABELS: Record<SignatureRole, string> = {
  buyer_tenant: 'Buyer/Tenant',
  seller_housing_provider: 'Seller/Housing Provider',
};
