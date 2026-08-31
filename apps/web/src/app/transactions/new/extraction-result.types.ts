// Mirrors apps/api/src/modules/document-extraction/extraction-result.types.ts
//         and apps/api/src/modules/document-extraction/compliance-result.types.ts
// Keep in sync when adding new fields.

export interface ExtractionProperty {
  streetAddress: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  county: string | null;
  apn: string | null;
  mlsNumber: string | null;
  legalDescription: string | null;
}

export interface ExtractionTransaction {
  purchasePrice: number | null;
  earnestMoneyAmount: number | null;
  offerDate: string | null;
  acceptanceDate: string | null;
  closingDate: string | null;
  possessionDate: string | null;
  financingType: string | null;
  loanAmount: number | null;
  occupancyType: string | null;
}

export interface ExtractionBuyer {
  fullName: string | null;
  email: string | null;
  phone: string | null;
  mailingAddress: string | null;
  signaturePresent: boolean;
  confidence: number | null;
}

export interface ExtractionSeller {
  fullName: string | null;
  email: string | null;
  phone: string | null;
  mailingAddress: string | null;
  signaturePresent: boolean;
  confidence: number | null;
}

export interface ExtractionAgent {
  fullName: string | null;
  email: string | null;
  phone: string | null;
  licenseNumber: string | null;
  companyName: string | null;
  confidence: number | null;
}

export interface ExtractionCompany {
  companyName: string | null;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  confidence: number | null;
}

export interface ExtractionParties {
  buyers: ExtractionBuyer[];
  sellers: ExtractionSeller[];
  buyerAgents: ExtractionAgent[];
  listingAgents: ExtractionAgent[];
  brokers: ExtractionCompany[];
  escrowCompanies: ExtractionCompany[];
  lenders: ExtractionCompany[];
  attorneys: ExtractionAgent[];
  otherParties: ExtractionCompany[];
}

export interface ExtractionDeadline {
  label: string;
  value: string | null;
}

export interface ExtractionContractTerms {
  inspectionContingencyDays: number | null;
  loanContingencyDays: number | null;
  loanContingencyWaived: boolean;
  appraisalContingencyDays: number | null;
  appraisalContingencyWaived: boolean;
  disclosuresDueDays: number | null;
  otherDeadlines: ExtractionDeadline[];
  otherTermsText: string | null;
}

export interface ExtractionForm {
  title: string;
  formCode: string | null;
  status: string;
  confidence: number | null;
}

export interface ExtractionSignatures {
  buyerSigned: boolean;
  sellerSigned: boolean;
  signedParties: string[];
  missingSignatures: string[];
  missingSignatureDates: string[];
}

export interface ExtractionConfidenceSummary {
  overall: number;
  property: number | null;
  transaction: number | null;
  parties: number | null;
  formsAndDisclosures: number | null;
}

export interface ExtractionResult {
  documentType: string | null;
  documentSubtypes: string[];
  sourceLanguage: string | null;
  property: ExtractionProperty;
  transaction: ExtractionTransaction;
  parties: ExtractionParties;
  contractTerms: ExtractionContractTerms;
  formsAndDisclosures: ExtractionForm[];
  signatures: ExtractionSignatures;
  extractionWarnings: string[];
  rawFacts?: Record<string, string>;
  confidenceSummary: ExtractionConfidenceSummary;
}

// ── Per-document contract review types ────────────────────────────────────────

export interface OtherTermsOverrides {
  purchasePrice: number | null;
  closeOfEscrow: string | null;
  closeOfEscrowDays: number | null;
  possession: string | null;
  initialDeposit: number | null;
  increasedDeposit: number | null;
  sellerCreditToBuyer: number | null;
  loanContingencyWaived: boolean | null;
  loanContingencyDays: number | null;
  appraisalContingencyWaived: boolean | null;
  appraisalContingencyDays: number | null;
  inspectionContingencyDays: number | null;
  sellerDocumentReviewDays: number | null;
  titleReviewDays: number | null;
  insuranceContingencyDays: number | null;
  hoaReviewDays: number | null;
  leasedLienedReviewDays: number | null;
  saleOfBuyersProperty: boolean | null;
  buyerBrokerCompensation: string | null;
  repairsOrCredits: string | null;
  occupancyOrRentBack: string | null;
  homeWarranty: string | null;
  itemsIncludedOrExcluded: string | null;
  hoaTerms: string | null;
  solarOrLeasedItems: string | null;
  otherDeadlinesOrObligations: string | null;
  contingencySource: Record<string, string> | null;
}

export interface ContractContingencyInfo {
  status: string;
  deadline: string | null;
}

export interface ContractDocumentSignatures {
  buyerSigned: boolean;
  sellerSigned: boolean;
  buyerSignedDate: string | null;
  sellerSignedDate: string | null;
}

export interface ContractDocumentExtractedTerms {
  datePrepared: string | null;
  offerDate: string | null;
  acceptanceDate: string | null;
  expirationDate: string | null;
  buyerName: string | null;
  sellerName: string | null;
  propertyAddress: string | null;
  purchasePrice: number | null;
  initialDeposit: number | null;
  closeOfEscrow: string | null;
  sellerCreditToBuyer: string | null;
  buyerBrokerCompensation: string | null;
  loanContingency: ContractContingencyInfo | null;
  appraisalContingency: ContractContingencyInfo | null;
  inspectionContingency: ContractContingencyInfo | null;
  insuranceContingency: ContractContingencyInfo | null;
  sellerDocumentReview: { deadline: string | null } | null;
  titleReview: { deadline: string | null } | null;
  hoaReview: { deadline: string | null } | null;
  possession: string | null;
  otherTerms: string | null;
  otherTermsOverrides: OtherTermsOverrides | null;
  signatures: ContractDocumentSignatures;
}

export interface ContractDocumentExtraction {
  documentId: string | null;
  fileName: string;
  documentType: 'RPA' | 'SCO' | 'BCO' | 'SMCO' | 'BMCO';
  counterNumber: number;
  sequenceOrder: number;
  /** The form code this counter offer is responding to (e.g. 'RPA', 'SCO', 'BCO'). null when not available. */
  referencedFormCode: string | null;
  /** The counter offer number this document is responding to, as extracted from the form. null when not applicable. */
  referencedCounterOfferNumber: string | null;
  extractedTerms: ContractDocumentExtractedTerms;
}

// ── Compliance types (mirrors compliance-result.types.ts) ─────────────────────

export type ComplianceSeverity = 'error' | 'warning' | 'info';
export type ComplianceStatus   = 'pass' | 'fail' | 'warning' | 'skipped';
export type ComplianceCategory =
  | 'parties' | 'property' | 'financial' | 'dates'
  | 'signatures' | 'contingencies' | 'forms_disclosures';

export type CompliancePhase = 'contract' | 'disclosure' | 'inspection' | 'finance' | 'closing';

export interface ComplianceCheck {
  ruleId: string;
  category: ComplianceCategory;
  /** CAR form code this rule validates, e.g. "RPA", "TDS", "AD" */
  formCode: string;
  /** Transaction phase — used to filter which accordions to show per stage */
  phase: CompliancePhase;
  severity: ComplianceSeverity;
  status: ComplianceStatus;
  label: string;
  detail?: string;
  fields?: string[];
}

export interface ComplianceSummary {
  overallStatus: 'compliant' | 'non_compliant' | 'needs_review';
  passCount: number;
  failCount: number;
  warningCount: number;
  skippedCount: number;
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

export interface ComplianceResult {
  sourceType: 'acroform' | 'llm_extraction' | 'scanned_no_ocr';
  hasAcroForm: boolean;
  acroFieldCount: number;
  checks: ComplianceCheck[];
  blockers?: BlockerOutput[];
  warnings?: WarningOutput[];
  summary: ComplianceSummary;
  signatureFields: Array<{ fieldName: string; isSigned: boolean }>;
  emptyRequiredAcroFields: string[];
}

// ── Contract package validation types ──────────────────────────────────────────

export type PackageBlockerCode =
  | 'DUPLICATE_DOCUMENT'
  | 'MISSING_RPA'
  | 'MISSING_COUNTER_OFFER';

export interface PackageValidationIssue {
  code: PackageBlockerCode;
  severity: 'warning' | 'blocker';
  message: string;
  detail?: string;
  duplicateFiles?: string[];
}

export interface PackageValidationResult {
  issues: PackageValidationIssue[];
  canCalculateFinalTerms: boolean;
  canSendEmails: boolean;
}
