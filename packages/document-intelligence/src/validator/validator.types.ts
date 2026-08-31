export type ComplianceSeverity = 'error' | 'warning' | 'info';
export type ComplianceStatus   = 'pass' | 'fail' | 'warning' | 'skipped';

export type CompliancePhase =
  | 'contract'
  | 'disclosure'
  | 'inspection'
  | 'finance'
  | 'closing';

export type ComplianceCategory =
  | 'parties'
  | 'property'
  | 'financial'
  | 'dates'
  | 'signatures'
  | 'initials'
  | 'contingencies'
  | 'forms_disclosures';

/**
 * What kind of execution/compliance concern a check or blocker is about —
 * distinct from the contract-field VALUE it may be attributed to via
 * fieldAttributions. See extractor.types.ts's ExtractedContractField for the
 * value side of the extraction/validation split.
 */
export type ValidationType = 'signature' | 'initials' | 'date' | 'required_document' | 'execution';

/**
 * Identifies which upload channel a document came through, when that changes
 * which party's execution requirements apply. Currently only 'seller_agent'
 * carries special behavior (buyer-side signature/initials/date requirements
 * are excluded — the Seller Agent Upload Link only has the seller's own
 * execution to hand, never the buyer's); every other value or `undefined`
 * preserves today's unrestricted validation, unchanged.
 */
export type ValidationUploadSource = 'seller_agent';

/** Structured pointer from a compliance check/blocker to the contract field it gates, for joining validation output back to a resolved field for display. */
export interface FieldAttribution {
  /** Matches a ContractDocumentExtractedTermsFields / FinalValueKey / FinalTermKey name. */
  fieldKey: string;
  page?: number;
  formCode?: string;
}

export interface ComplianceCheck {
  ruleId: string;
  category: ComplianceCategory;
  formCode: string;
  phase: CompliancePhase;
  severity: ComplianceSeverity;
  status: ComplianceStatus;
  label: string;
  detail?: string;
  fields?: string[];
  validationType?: ValidationType;
  fieldAttributions?: FieldAttribution[];
  /** Human-readable location hint, e.g. "Page 2" — mirrors BlockerOutput/WarningOutput.location so the checklist's validation dropdown can show page numbers for a check the same way the rejection UI/email already does for its underlying blocker. */
  location?: string;
}

export interface ComplianceSummary {
  overallStatus: 'compliant' | 'non_compliant' | 'needs_review';
  passCount: number;
  failCount: number;
  warningCount: number;
  skippedCount: number;
}

// ─── Blocker / Warning system ─────────────────────────────────────────────────

/**
 * Catalog entry — single source of truth for a blocker or warning code.
 *
 * Composite ID convention: `TYPE-FORMCODE-NUMBER`
 *   e.g. `BLOCKER-RPA-1`, `WARN-RPA-AD-1001`
 *
 * Number ranges per form (each form gets a 5000-wide block):
 *   ───────────┬────────────┬────────────┬──────────┬──────────┐
 *   Form       │ Block      │ Specific   │ Cross    │ Business │
 *   ───────────┼────────────┼────────────┼──────────┼──────────┤
 *   RPA        │ 1–5000     │ 1–1000     │ 1001–2000│ 2001–3000│
 *   AD         │ 5001–10000 │ 5001–6000  │ 6001–7000│ 7001–8000│
 *   TDS        │ 10001–15000│ 10001–11000│ 11001–…  │ 12001–…  │
 *   SPQ        │ 15001–20000│ …          │ …        │ …        │
 *   NHD        │ 20001–25000│ …          │ …        │ …        │
 *   AVID       │ 25001–30000│ …          │ …        │ …        │
 *   BIA        │ 30001–35000│ …          │ …        │ …        │
 *   ───────────┴────────────┴────────────┴──────────┴──────────┘
 *
 * Cross-form composite IDs chain all involved form codes:
 *   BLOCKER-RPA-AD-1050  → RPA is leading, cross-form range, #1050
 *   WARN-RPA-AD-TDS-1150 → RPA leading, 3 forms, cross-form, #1150
 *
 * `combinations` documents which form codes + versions trigger this rule.
 *   ['RPA:*', 'AD:v1,v4,v5'] → fires when RPA (any version) AND AD (v1/v4/v5)
 *   Format: FORMCODE:versionList  where versionList is '*' or comma-sep
 *   Currently used as documentation only — rule functions handle preconditions.
 */
export interface BlockerWarningEntry {
  id: string;
  compositeId: string;
  type: 'blocker' | 'warning';
  formCode: string;
  combinations: string[];
  message: string;
  description: string;
  category: ComplianceCategory;
  phase: CompliancePhase;
  effective: boolean;
  introducedBy: string;
  dateAdded: string;
}

export interface BlockerOutput {
  code: string;
  compositeId: string;
  message: string;
  formCode: string;
  type: 'blocker';
  fields?: string[];
  /** Human-readable location hint, e.g. "Page 2 — Signature section". */
  location?: string;
  fieldAttributions?: FieldAttribution[];
}

export interface WarningOutput {
  code: string;
  compositeId: string;
  message: string;
  formCode: string;
  type: 'warning';
  fields?: string[];
  /** Human-readable location hint, e.g. "Sections 5-19, Pages 1-4". */
  location?: string;
}

/** Intermediate type used inside rule functions before catalog resolution. */
export interface RuleIssue {
  code: string;
  fields?: string[];
  /** Human-readable location hint, e.g. "Page 2 — Signature section". */
  location?: string;
  fieldAttributions?: FieldAttribution[];
  /** Overrides the blocker/warning catalog entry's static `message` with issue-specific text (e.g. naming the exact item number involved) — falls back to the catalog message when absent. */
  message?: string;
}

export interface RuleResult {
  issues: RuleIssue[];
  checks: ComplianceCheck[];
}

// ─── Stage-level validation result ────────────────────────────────────────────

export interface StageValidationResult {
  stage: string;
  complete: boolean;
  missingForms: string[];
  blockers: BlockerOutput[];
  warnings: WarningOutput[];
  checks: ComplianceCheck[];
  summary: ComplianceSummary;
  decisions: {
    canAdvanceStage: boolean;
    requiredActions: string[];
    communicationTriggers: string[];
  };
}

// ─── Legacy ComplianceResult shape (used by existing API responses) ───────────

export type PdfSourceType = 'acroform' | 'llm_extraction' | 'scanned_no_ocr';

export interface AcroFieldInfo {
  name: string;
  type: 'text' | 'checkbox' | 'radio' | 'dropdown' | 'signature' | 'unknown';
  value: string | boolean | null;
  isSigned?: boolean;
  isEmpty: boolean;
}

export interface ComplianceResult {
  sourceType: PdfSourceType;
  hasAcroForm: boolean;
  acroFieldCount: number;
  acroFields?: AcroFieldInfo[];
  checks: ComplianceCheck[];
  blockers?: BlockerOutput[];
  warnings?: WarningOutput[];
  summary: ComplianceSummary;
  signatureFields: Array<{ fieldName: string; isSigned: boolean }>;
  emptyRequiredAcroFields: string[];
}
