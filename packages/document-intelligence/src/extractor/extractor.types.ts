export interface FormExtractionOutput {
  formCode: string;
  formName: string | null;
  /** Parsed JSON from the LLM — shape varies by form schema */
  data: Record<string, unknown>;
  rawResponse: string;
  promptTokens: number | null;
  completionTokens: number | null;
  modelName: string;
}

// ─── Generic extraction result (returned by the generic extraction path) ──────

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
  /** Business days after acceptance the initial deposit (EMD) must be delivered — RPA §D1. */
  initialDepositBusinessDays: number | null;
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
  /** Parties who have a visible signature but no date next to it */
  missingSignatureDates: string[];
}

export interface ExtractionInitials {
  liquidatedDamagesBuyer: boolean | null;
  liquidatedDamagesSeller: boolean | null;
  arbitrationBuyer: boolean | null;
  arbitrationSeller: boolean | null;
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
  initials?: ExtractionInitials;
  extractionWarnings: string[];
  rawFacts?: Record<string, string>;
  confidenceSummary: ExtractionConfidenceSummary;
}

// ─── Per-document contract review types ────────────────────────────────────────

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
  /**
   * Per-field source tracking for contingency values extracted via Gemini.
   * Key is the override field name (e.g. "loanContingencyDays"),
   * value is the document label (e.g. "BCO Other Terms", "SCO Other Terms").
   */
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
  formRevision: string | null;
  formRevisionLabel: string | null;
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
  /** Additive per-field provenance — see ContractDocumentExtractedTermsFields. Optional: absent on pre-refactor persisted rows. */
  fields?: ContractDocumentExtractedTermsFields;
  /** Non-fatal notices from extraction/corroboration (e.g. a field-region crop disagreed with the page-level value and was NOT applied). Never a substitute for a real blocker/warning. */
  extractionWarnings?: string[];
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

// ─── Extraction/validation separation — per-field provenance ──────────────────
//
// A contract field's VALUE must be derivable purely from what the document
// itself shows (typed/handwritten/checked/selected entries, or a printed
// default when nothing was entered). Compliance validation (signatures,
// initials, execution dates) is a completely separate concern — see
// validator/validator.types.ts's ComplianceCheck/BlockerOutput — and must
// never influence a field's value here. See docs/design.md's extraction
// pipeline notes for the full rationale.

export type FieldSourceType =
  | 'typed'
  | 'handwritten'
  | 'checkbox'
  | 'radio'
  | 'pdf_form_field'
  | 'pdf_text'
  | 'vision'
  | 'printed_default'
  | 'derived'
  | 'unknown';

export interface FieldSource {
  /** Null at extraction-normalization time, before the document is persisted and assigned a real id — mirrors ContractDocumentExtraction.documentId's own nullability. */
  documentId: string | null;
  formCode: string;
  page: number;
}

export interface FieldEvidence {
  text?: string;
  description?: string;
  confidence?: number;
}

/**
 * A single contract field's resolved value plus the raw entered/default
 * values it was resolved from and where it came from. `value` is always
 * `enteredValue ?? defaultValue ?? null` — never anything derived from
 * validation/compliance state.
 */
export interface ExtractedContractField<T> {
  value: T | null;
  defaultValue?: T | null;
  enteredValue?: T | null;
  sourceType: FieldSourceType;
  source: FieldSource;
  evidence?: FieldEvidence;
}

/**
 * Additive sibling of ContractDocumentExtractedTerms's existing flat scalars
 * — every key here mirrors an existing flat field 1:1. The flat scalar stays
 * the source of truth for existing consumers (computed as `field.value`);
 * this object exists purely to carry provenance for new consumers.
 */
export interface ContractDocumentExtractedTermsFields {
  purchasePrice?: ExtractedContractField<number> | null;
  closeOfEscrowDate?: ExtractedContractField<string> | null;
  closeOfEscrowDays?: ExtractedContractField<number> | null;
  acceptanceDate?: ExtractedContractField<string> | null;
  initialDeposit?: ExtractedContractField<number> | null;
  initialDepositBusinessDays?: ExtractedContractField<number> | null;
  increasedDeposit?: ExtractedContractField<number> | null;
  loanAmount?: ExtractedContractField<number> | null;
  financingType?: ExtractedContractField<string> | null;
  loanContingencyDays?: ExtractedContractField<number> | null;
  loanContingencyWaived?: ExtractedContractField<boolean> | null;
  appraisalContingencyDays?: ExtractedContractField<number> | null;
  appraisalContingencyWaived?: ExtractedContractField<boolean> | null;
  inspectionContingencyDays?: ExtractedContractField<number> | null;
  insuranceContingencyDays?: ExtractedContractField<number> | null;
  sellerDocumentReviewDays?: ExtractedContractField<number> | null;
  titleReviewDays?: ExtractedContractField<number> | null;
  hoaReviewDays?: ExtractedContractField<number> | null;
  leasedLienedReviewDays?: ExtractedContractField<number> | null;
  possession?: ExtractedContractField<string> | null;
  sellerCreditToBuyer?: ExtractedContractField<number> | null;
  buyerBrokerCompensation?: ExtractedContractField<string> | null;
  itemsIncludedOrExcluded?: ExtractedContractField<string> | null;
  homeWarranty?: ExtractedContractField<string> | null;
  escrowHolder?: ExtractedContractField<string> | null;
  titleCompany?: ExtractedContractField<string> | null;
  hoaTerms?: ExtractedContractField<string> | null;
  solarOrLeasedItems?: ExtractedContractField<string> | null;
  otherTermsText?: ExtractedContractField<string> | null;
}
