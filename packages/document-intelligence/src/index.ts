// Splitter
export { PdfSplitter } from './splitter/pdf-splitter';
export type { SplitResult } from './splitter/pdf-splitter';
export { mergePageBuffers } from './splitter/pdf-merge';
export { estimateLlmCostUsd } from './llm-cost';

// Identifier
export { FormIdentifier, classifyFromPrintedText, identifyPdfFirstPage } from './identifier/form-identifier';
export type { FormIdentifierConfig, DeterministicMatch } from './identifier/form-identifier';
export type { PageClassification, PageClassificationSource, FormGroup } from './identifier/identifier.types';

// Extractor — types
export type {
  FormExtractionOutput,
  ExtractionResult,
  ExtractionProperty,
  ExtractionTransaction,
  ExtractionParties,
  ExtractionBuyer,
  ExtractionSeller,
  ExtractionAgent,
  ExtractionCompany,
  ExtractionContractTerms,
  ExtractionDeadline,
  ExtractionForm,
  ExtractionSignatures,
  ExtractionConfidenceSummary,
  ContractDocumentExtraction,
  ContractDocumentExtractedTerms,
  ContractDocumentExtractedTermsFields,
  ContractDocumentSignatures,
  ContractContingencyInfo,
  FieldSourceType,
  FieldSource,
  FieldEvidence,
  ExtractedContractField,
} from './extractor/extractor.types';

// Extractor — runtime
export { FormExtractor } from './extractor/form-extractor';
export type { FormExtractorConfig, ExtractionProvider, ExtractionProgressEvent } from './extractor/form-extractor';
export { AnthropicProvider } from './extractor/providers/anthropic.provider';
export { GeminiProvider } from './extractor/providers/gemini.provider';
export { FORM_REGISTRY, resolveFormDefinition } from './extractor/forms/registry';
export type { FormDefinition, PageDefinition } from './extractor/forms/form-definition';

// AcroForm
export { AcroFormExtractor } from './acroform/acroform-extractor';
export { AcroFormMapper } from './acroform/acroform-mapper';
export type { AcroFormExtractionResult } from './acroform/acroform-extractor';

// RPA text-layer contingency overrides (deterministic correction for section 3L blanks)
export { extractRpaContingencyTextOverrides, applyRpaContingencyTextOverrides, clearEmptyOtherTermsModifications } from './extractor/rpa-contingency-text-override';
export type { RpaContingencyTextOverrides } from './extractor/rpa-contingency-text-override';

// Reasoner — types
export type {
  ReasoningInput,
  ReasoningResult,
  ReasoningDefinition,
  TransactionContext,
} from './reasoner/reasoning-definition';
export { buildContextBlock } from './reasoner/reasoning-definition';

// Reasoner — runtime
export { StageReasoner } from './reasoner/stage-reasoner';
export { REASONING_REGISTRY } from './reasoner/registry';

// Validator — types
export type {
  ComplianceCheck,
  ComplianceSummary,
  ComplianceResult,
  StageValidationResult,
  ComplianceSeverity,
  ComplianceStatus,
  CompliancePhase,
  ComplianceCategory,
  PdfSourceType,
  AcroFieldInfo,
  BlockerOutput,
  WarningOutput,
  BlockerWarningEntry,
  RuleIssue,
  RuleResult,
  ValidationType,
  FieldAttribution,
  ValidationUploadSource,
} from './validator/validator.types';

// Validator — runtime
export { StageValidator } from './validator/stage-validator';
export { validateContractStage, buildSummary, normalizeToExtractionResult, resolveAcceptanceDate, normalizeContractDocument, resolvePurchasePrice } from './validator/stages/contract.stage';
export { validateContractChain, normalizeContractFormCode, isContractFormCode, detectCounterNumber } from './validator/stages/contract-chain';
export type { NegotiationChainResult, NegotiationChainDocument } from './validator/stages/contract-chain';
export { resolveFinalNegotiatedTerms, attachValidation } from './validator/stages/final-terms';
export type {
  FinalTermKey,
  FinalTermStatus,
  FinalTermSource,
  FinalTerm,
  FinalValueKey,
  FinalValueTerm,
  FinalNegotiatedTerms,
  FinalTermsRawContractTerms,
  FinalTermsInputDocument,
  FinalTermsCrRemoval,
  ResolveFinalNegotiatedTermsOptions,
  ResolvedContractTerm,
} from './validator/stages/final-terms';
export {
  isWeekend, isHoliday, isBusinessDay, addCalendarDays,
  adjustToNextBusinessDay, addBusinessAdjustedDays, addBusinessDays,
} from './validator/stages/business-day.util';
export { validateDuplicateDocuments } from './validator/stages/contract-duplicate';
export { enrichDocumentsWithGeminiContingency, extractContingencyViaGeminiForDocument, mergeGeminiContingencyResult } from './validator/stages/contract.contingency-extraction';
export type { OtherTermsContingencyResult } from './validator/stages/contract.contingency-extraction';
export { enrichDocumentsWithFieldRegionCrops, enrichDocumentWithFieldRegionCrops, reconcileFieldWithCrop } from './validator/stages/contract.field-crop-enrichment';
export type { ReconcileResult } from './validator/stages/contract.field-crop-enrichment';
export { RenderedPageCache } from './page-converter/rendered-page-cache';
export type { RenderedPageBitmap } from './page-converter/rendered-page-cache';
export { logResolvedFieldDebug } from './validator/stages/contract-terms-debug.util';
export type { FieldValidationSummary } from './validator/stages/contract-terms-debug.util';
export { BLOCKER_FIELD_ATTRIBUTIONS, attributionsFor } from './validator/stages/contract.blocker-field-map';
export { validateDisclosuresStage } from './validator/stages/disclosures.stage';
export { STAGE_VALIDATOR_REGISTRY, STAGE_FORM_EXPECTATIONS } from './validator/stages/registry';
export type { TransactionStage, StageFormExpectation } from './validator/stages/registry';
export { CONTRACT_BLOCKER_CATALOG, resolveContractBlocker, resolveContractWarning } from './validator/stages/contract.blocker-catalog';
export { DISCLOSURES_BLOCKER_CATALOG, resolveDisclosuresBlocker, resolveDisclosuresWarning } from './validator/stages/disclosures.blocker-catalog';
export { validateBhiaWithSchema } from './validator/bhia-validation';
export type { BhiaValidationOutput, BuyerAcknowledgementSlot } from './extractor/forms/bhia/bhia.validation.v06-24';
export { validateBiaWithSchema } from './validator/bia-validation';
export type { BiaValidationOutput, BuyerSignatureSlot, BuyerAcknowledgements as BiaBuyerAcknowledgements, InvestigationCategories, ProhibitedExecutionRequirements as BiaProhibitedExecutionRequirements } from './extractor/forms/bia/bia.validation.v06-25';
export { validateWfaWithSchema } from './validator/wfa-validation';
export type { WfaValidationOutput, PartyAcknowledgements, SignatureSlot } from './extractor/forms/wfa/wfa.validation.v06-25';
export { validateFhdaWithSchema } from './validator/fhda-validation';
export type { FhdaValidationOutput, PartyAcknowledgements as FhdaPartyAcknowledgements, SignatureSlot as FhdaSignatureSlot, TransactionType as FhdaTransactionType } from './extractor/forms/fhda/fhda.validation.v12-24';
export { validateCcpaWithSchema } from './validator/ccpa-validation';
export type { CcpaApplicablePartyRole, CcpaValidationOutput } from './validator/ccpa-validation';

// Disclosure Execution Validator — shared config-driven module
export { validateDisclosureExecution, createDisclosureExecutionPrompt } from './validator/disclosure-execution-validator';
export type {
  DisclosureExecutionConfig,
  DisclosureExecutionExtraction,
  DisclosureValidationContext,
  DisclosureExecutionValidationResult,
  DisclosurePageRule,
  RoleExecutionRule,
  ExtractedExecutionSlot,
  ExtractedPartyExecution,
  ExtractedDisclosurePage,
  ExecutionValidationIssue,
  RequirementLevel,
  ExecutionMarkType,
  PartyRole,
} from './validator/disclosure-execution-validator';

// Disclosure configs and definitions
export { BHIA_CONFIG, BIA_CONFIG, WFA_CONFIG, FHDA_CONFIG, AVID_CONFIG, CCPA_CONFIG } from './validator/disclosure-configs';
export { BHIA_DEFINITION, BIA_DEFINITION, WFA_DEFINITION, FHDA_DEFINITION, AVID_DEFINITION, CCPA_DEFINITION, DISCLOSURE_DEFINITIONS, getDisclosureDefinition } from './validator/disclosure-definitions';
export type { DisclosureDefinition } from './validator/disclosure-definitions';

// Enhanced WFA Signature Extraction and Validation
export { validateWfaSignatures } from './validator/wfa-signature-validator';
export type {
  WfaSignatureExtraction,
  WfaValidationContext,
  WfaValidationResult,
  SignatureFieldObservation,
  UnassignedExecutionMark,
  SignatureValidationStatus,
  ValidationIssue,
  SignatureRole,
  SignatureMarkType,
  FieldAlignment,
  SignerNameSource,
} from './validator/disclosure-signature-extraction';
export { BUYER_TENANT_FIELDS, SELLER_HOUSING_PROVIDER_FIELDS, ROLE_FIELDS, ROLE_LABELS } from './validator/disclosure-signature-extraction';
export { wfaSignatureExtraction, isWfaSignatureExtraction } from './validator/wfa-signature-extraction';
export { WFA_SIGNATURE_EXTRACTION_SCHEMA } from './validator/wfa-signature-extraction';

// AVID Enhanced Execution Extraction
export type {
  AvidExecutionExtraction,
  AvidExecutionFieldObservation,
  AvidUnassignedExecutionMark,
  AvidValidationContext,
  AvidValidationIssue,
  AvidExecutionValidationResult,
  AvidExecutionZone,
  AvidMarkType,
  AvidFieldAlignment,
  AvidSignatureSource,
  AvidExecutionValidationStatus,
} from './validator/avid-execution-extraction';
export {
  P1_BUYER_INITIAL_FIELDS,
  P2_BUYER_INITIAL_FIELDS,
  P3_AGENT_SIGNATURE_FIELD,
  P3_BUYER_ACKNOWLEDGEMENT_FIELDS,
  P3_RECEIPT_EVIDENCE_FIELD,
  REQUIRED_FIELDS,
  ZONE_LABELS,
} from './validator/avid-execution-extraction';
export { avidExecutionExtractionPages, isAvidExecutionExtraction } from './validator/avid-execution-extraction-prompt';
export { AVID_EXECUTION_EXTRACTION_SCHEMA } from './validator/avid-execution-extraction-prompt';
export { validateAvidExecution } from './validator/avid-execution-validator';

// Pipeline
export { DocumentIntelligencePipeline } from './pipeline/document-intelligence';
export type { DocumentIntelligenceConfig } from './pipeline/document-intelligence';
export type {
  PipelineOptions,
  PipelineResult,
  FormExtractionResult,
  PipelineProgressEvent,
  PipelineStage,
} from './pipeline/pipeline.types';

// Comparison
export type {
  ChangeSeverity,
  FieldChange,
  FormComparisonResult,
  RpaMaterialDifferenceConfig,
} from './comparison/comparison.types';
export {
  DEFAULT_RPA_MATERIAL_CONFIG,
  isMaterialChange,
} from './comparison/comparison.types';
export { compareRpaExtractions } from './comparison/rpa-comparison';
export { compareScoExtractions } from './comparison/sco-comparison';

// Sequence
export type { FormFamily, FormFamilyId } from './sequence/sequence.types';
export type { FamilyMatch } from './sequence/resolver';
export { FORM_FAMILIES } from './sequence/form-families';
export { getFamilyById, getFamilyForFormCode, isInSameFamily, findLatestInFamily } from './sequence/resolver';

// Page Converter
export { PdfjsPageConverter } from './page-converter/page-converter';
export type { PageConverter, PageConverterConfig, PageConversionResult } from './page-converter/page-converter.types';
export { DEFAULT_PAGE_CONVERTER_CONFIG } from './page-converter/page-converter.types';

// CDA (Commission Disbursement Authorization) generation
export { generateCda } from './cda';
export type { CdaGenerationInput, ResolvedCdaValues, CdaFieldName } from './cda';
