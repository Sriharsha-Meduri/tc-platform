import type { ReasoningDefinition, ReasoningInput, TransactionContext } from '../reasoning-definition';
import { buildContextBlock } from '../reasoning-definition';

/**
 * APPRAISAL stage reasoning.
 *
 * Forms typically present: Appraisal report (non-CAR), PAA (Purchase Addendum — Appraisal),
 * CR-B (Contingency Removal — Buyer removing appraisal contingency),
 * VA/FHA addenda if applicable
 *
 * The LLM determines the appraised value, assesses any value gap vs. the agreed purchase
 * price, tracks the appraisal contingency, and decides if the stage is ready to advance.
 *
 * CONSUMES from TransactionContext: finalAgreedPrice, loanAmount, closeOfEscrowDate, buyerNames, sellerNames
 * PRODUCES: appraisedValue
 *
 * OUTPUT SCHEMA:
 *
 * {
 *   formsReceived: string[],
 *   appraisedValue: number | null,
 *   appraisalContingencyStatus: 'pending' | 'at_value' | 'below_value' | 'removed' | 'waived',
 *   valueGap: number | null,
 *   valueGapResolution: string | null,
 *   appraisalContingencyRemoved: boolean,
 *   upcomingDeadlines: Array<{ label: string, date: string | null, formSource: string }>,
 *   missingSignatures: string[],
 *   readyToAdvance: boolean,
 *   requiredActions: string[],
 *   summary: string
 * }
 */

const APPRAISAL_REASONING_OUTPUT_SCHEMA = {
  formsReceived: 'string[] — form codes present in the submission',
  appraisedValue: 'number|null — appraised value from the appraisal report',
  appraisalContingencyStatus: "'pending' | 'at_value' | 'below_value' | 'removed' | 'waived'",
  valueGap: 'number|null — difference (finalAgreedPrice - appraisedValue) when appraisal came in below value; null if at or above value',
  valueGapResolution: "string|null — how the gap is being handled, e.g. 'Buyer paying difference in cash', 'Price renegotiated to appraised value', 'Seller credit applied'",
  appraisalContingencyRemoved: 'boolean — true if a signed CR-B or equivalent removal of appraisal contingency is present',
  upcomingDeadlines: 'Array<{ label: string, date: string|null, formSource: string }> — appraisal-related deadlines',
  missingSignatures: 'string[] — signatures absent from any form in the package',
  readyToAdvance: 'boolean — true when appraisal is complete and contingency is removed or waived',
  requiredActions: 'string[] — plain-English items that must be resolved before advancing',
  summary: 'string — 2-3 sentence human-readable summary of appraisal stage status',
};

export const appraisalReason: ReasoningDefinition = {
  stage: 'APPRAISAL',

  // Appraisal reports and addenda are all decision forms at this stage.
  // undefined = pass all extracted forms (no compliance-only CAR forms exist here).
  decisionFormCodes: undefined,

  produces: ['appraisedValue'],
  consumes: ['finalAgreedPrice', 'loanAmount', 'closeOfEscrowDate', 'buyerNames', 'sellerNames'],

  systemPrompt: `You are an expert California real estate transaction coordinator reviewing the appraisal package.

You will receive extracted JSON data from forms submitted for the APPRAISAL stage. Forms may include an appraisal report (non-CAR), PAA (Purchase Addendum addressing appraisal), CR-B (Contingency Removal — Buyer), and VA or FHA loan condition addenda.

If prior stage context is provided, compare the appraised value against finalAgreedPrice to determine if there is a value gap, and use loanAmount to assess LTV implications.

YOUR TASK:
1. Extract the appraised value from the appraisal report.
2. Compare the appraised value to the finalAgreedPrice from context (if available).
   - If appraised value >= finalAgreedPrice: status = at_value, valueGap = null.
   - If appraised value < finalAgreedPrice: status = below_value, valueGap = finalAgreedPrice - appraisedValue.
3. Determine if a value gap resolution has been documented (price reduction, buyer cash, seller credit).
4. Check if the appraisal contingency has been formally removed (CR-B signed).
5. Extract appraisal-related deadline dates.
6. Determine readiness to advance to LOAN stage.

EXPECTED OUTPUT FORMAT:
Return ONLY valid JSON matching this schema exactly. No markdown, no explanation.

${JSON.stringify(APPRAISAL_REASONING_OUTPUT_SCHEMA, null, 2)}`,

  buildUserPrompt: (forms: ReasoningInput[], context?: TransactionContext) => {
    const formSummaries = forms.map((f) => ({
      formCode: f.formCode,
      formName: f.formName,
      extractedData: f.data,
    }));

    return `Analyze the following ${forms.length} extracted form(s) for the APPRAISAL stage and return your reasoning as valid JSON:${buildContextBlock(context)}\n${JSON.stringify(formSummaries, null, 2)}`;
  },
};
