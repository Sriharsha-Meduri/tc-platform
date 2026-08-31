import type { PageClassification, FormGroup } from '../identifier/identifier.types';
import type { FormExtractionOutput } from '../extractor/extractor.types';
import type { StageValidationResult } from '../validator/validator.types';
import type { TransactionStage, StageFormExpectation } from '../validator/stages/registry';

export type PipelineStage = 'splitting' | 'classifying' | 'grouping' | 'extracting' | 'validating' | 'complete' | 'error';

export interface PipelineProgressEvent {
  stage: PipelineStage;
  message: string;
  /** 0–100 */
  percent: number;
  /** Structured error details (e.g. RPA_NOT_FOUND code). Only present when stage === 'error'. */
  details?: Record<string, unknown>;
  detail?: {
    currentPage?: number;
    totalPages?: number;
    currentForm?: number;
    totalForms?: number;
    formCode?: string;
    formName?: string | null;
  };
}

export interface FormExtractionResult {
  formCode: string;
  formName: string | null;
  pageIndices: number[];
  output: FormExtractionOutput | null;
  error?: string;
}

export interface PipelineResult {
  totalPages: number;
  classifications: PageClassification[];
  formGroups: FormGroup[];
  extractions: FormExtractionResult[];
  validation: StageValidationResult | null;
  /**
   * True when every page classified as UNKNOWN with zero confidence — a
   * strong signal that the classifier itself failed to run (provider error,
   * rate limit, quota, auth issue) rather than genuinely not recognizing the
   * document. Callers should treat this as "the extraction service failed",
   * not "this document isn't a recognized form".
   */
  identifierMayHaveFailed: boolean;
}

export interface PipelineOptions {
  /** If provided, runs stage-level validation after extraction */
  stage?: TransactionStage;
  onProgress?: (event: PipelineProgressEvent) => void;
  /** Minimum pages a form group must have to be sent to the extractor */
  minPagesForExtraction?: number;
  /**
   * Pre-loaded extraction outputs keyed by uppercase form code (e.g. 'RPA', 'TDS').
   * When a snap is present for a form, the pipeline skips the LLM call for that form
   * and uses the snap data directly. Forms not covered here are extracted normally.
   *
   * Populated by the test helper from *.snap.json files in the scenario's extractions/ folder.
   * Production pipelines (NestJS) never set this — it is test-only.
   */
  extractionSnaps?: Record<string, FormExtractionOutput>;
  /** Custom form expectations for this stage — overrides STAGE_FORM_EXPECTATIONS */
  formExpectations?: StageFormExpectation[];
}
