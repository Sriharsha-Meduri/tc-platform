import { validateContractStage } from './contract.stage';
import { validateDisclosuresStage } from './disclosures.stage';
import type { FormExtractionOutput } from '../../extractor/extractor.types';
import type { ComplianceResult } from '../validator.types';

export type TransactionStage =
  | 'INTAKE'
  | 'CONTRACT'
  | 'DISCLOSURES'
  | 'INSPECTION'
  | 'APPRAISAL'
  | 'LOAN'
  | 'ESCROW'
  | 'CLOSING'
  | 'POST_CLOSE';

/**
 * Stage form expectations — names which forms are required for a stage.
 *
 * `required: true` → this form's absence is surfaced in `missingForms`, an
 * informational list for the checklist to consume. It is never turned into a
 * validation blocker or warning — TransactionFormTemplatesService owns
 * "what's still outstanding" via the document checklist.
 *
 * ADD A NEW STAGE:
 *   1. Create src/validator/stages/<stage>.stage.ts
 *   2. Export a validate function matching the StageValidator signature
 *   3. Add form expectations here
 *   4. Register the validator below
 */
export interface StageFormExpectation {
  formCode: string;
  required: boolean;
}

export const STAGE_FORM_EXPECTATIONS: Partial<Record<TransactionStage, StageFormExpectation[]>> = {
  CONTRACT: [
    { formCode: 'RPA', required: true },
  ],
  DISCLOSURES: [
    { formCode: 'TDS', required: true },
    { formCode: 'SPQ', required: true },
    { formCode: 'NHD', required: true },
  ],
};

/**
 * Registry of stage validator functions.
 *
 * Each receives the full array of extracted forms and runs its own
 * per-form, cross-form, and stage-level business rule checks.
 *
 * ADD A NEW STAGE:
 *   1. Create src/validator/stages/<stage>.stage.ts
 *   2. Export a validate function matching the signature below
 *   3. Add form expectations to STAGE_FORM_EXPECTATIONS above
 *   4. Register it in STAGE_VALIDATOR_REGISTRY below
 */
type StageValidator = (extractions: FormExtractionOutput[]) => ComplianceResult;

export const STAGE_VALIDATOR_REGISTRY: Partial<Record<TransactionStage, StageValidator>> = {
  CONTRACT:    (extractions) => validateContractStage(extractions),
  DISCLOSURES: (extractions) => validateDisclosuresStage(extractions),
};
