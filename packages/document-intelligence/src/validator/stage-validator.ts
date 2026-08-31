import { STAGE_VALIDATOR_REGISTRY, STAGE_FORM_EXPECTATIONS, type TransactionStage, type StageFormExpectation } from './stages/registry';
import type { BlockerOutput, WarningOutput, StageValidationResult } from './validator.types';
import type { FormExtractionOutput } from '../extractor/extractor.types';

export class StageValidator {
validate(
    stage: TransactionStage,
    extractions: FormExtractionOutput[],
    formExpectations?: StageFormExpectation[],
  ): StageValidationResult {
    const presentCodes = extractions.map((e) => e.formCode.toUpperCase());

    // STAGE_FORM_EXPECTATIONS still names which forms belong to a stage, but a
    // form not yet present is a checklist concern (TransactionFormTemplatesService),
    // never a validation blocker/warning — so `missingForms` below is purely
    // informational and does not affect blockers, warnings, or canAdvanceStage.
    const expectations = formExpectations ?? STAGE_FORM_EXPECTATIONS[stage] ?? [];
    const missingForms = expectations
      .filter((e) => e.required && !presentCodes.includes(e.formCode))
      .map((e) => e.formCode);

    const stageValidator = STAGE_VALIDATOR_REGISTRY[stage];
    const complianceResult = stageValidator
      ? stageValidator(extractions)
      : { sourceType: 'llm_extraction' as const, hasAcroForm: false, acroFieldCount: 0, checks: [], summary: { overallStatus: 'compliant' as const, passCount: 0, failCount: 0, warningCount: 0, skippedCount: 0 }, signatureFields: [], emptyRequiredAcroFields: [] };

    const allBlockers: BlockerOutput[] = complianceResult.blockers ?? [];
    const allWarnings: WarningOutput[] = complianceResult.warnings ?? [];

    const canAdvanceStage = allBlockers.length === 0;

    const requiredActions = allBlockers.map((b) => `Resolve: ${b.message}`);

    const communicationTriggers = this.buildCommunicationTriggers(stage, complianceResult.blockers ?? [], complianceResult.warnings ?? []);

    return {
      stage,
      complete: canAdvanceStage,
      missingForms,
      blockers: allBlockers,
      warnings: allWarnings,
      checks: complianceResult.checks,
      summary: {
        overallStatus: allBlockers.length > 0 ? 'non_compliant' : allWarnings.length > 0 ? 'needs_review' : 'compliant',
        passCount: complianceResult.summary.passCount,
        failCount: allBlockers.length,
        warningCount: allWarnings.length,
        skippedCount: complianceResult.summary.skippedCount,
      },
      decisions: {
        canAdvanceStage,
        requiredActions,
        communicationTriggers,
      },
    };
  }

  private buildCommunicationTriggers(
    stage: TransactionStage,
    blockers: BlockerOutput[],
    warnings: WarningOutput[],
  ): string[] {
    const triggers: string[] = [];

    if (stage === 'CONTRACT') {
      const buyerUnsigned = blockers.find((b) => b.code === 'BLOCKER_BUYER_SIGNATURE');
      if (buyerUnsigned) triggers.push('NOTIFY_BUYER_SIGNATURE_REQUIRED');

      const sellerUnsigned = blockers.find((b) => b.code === 'BLOCKER_SELLER_SIGNATURE');
      if (sellerUnsigned) triggers.push('NOTIFY_SELLER_SIGNATURE_REQUIRED');
    }

    if (stage === 'DISCLOSURES') {
      const tdsUnsigned = warnings.find((w) => w.code === 'WARN_TDS_SELLER_SIGNED');
      if (tdsUnsigned) triggers.push('NOTIFY_SELLER_TDS_SIGNATURE_REQUIRED');
    }

    return triggers;
  }
}
