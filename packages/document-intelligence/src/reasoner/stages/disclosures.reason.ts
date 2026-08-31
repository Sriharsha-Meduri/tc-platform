import type { ReasoningDefinition, ReasoningInput, TransactionContext } from '../reasoning-definition';
import { buildContextBlock } from '../reasoning-definition';

/**
 * DISCLOSURES stage reasoning.
 *
 * Forms typically present: TDS, SPQ, NHD, BIA, BHIA, MCA, AVID, PRBS, SBSA
 *
 * The LLM receives all extracted disclosure form JSONs and determines whether
 * all required disclosures are complete, identifies deficiencies or items requiring
 * follow-up, and decides if the disclosures stage is ready to advance.
 *
 * CONSUMES from TransactionContext: finalAgreedPrice, closeOfEscrowDate, buyerNames, sellerNames
 * PRODUCES: nothing (disclosures do not contribute new facts to later stages)
 *
 * OUTPUT SCHEMA:
 *
 * {
 *   formsReceived: string[],
 *   formsComplete: string[],
 *   formsIncomplete: Array<{ formCode: string, reason: string }>,
 *   formsMissing: string[],
 *   disclosedIssues: string[],
 *   sellerSignaturesMissing: string[],
 *   buyerAcknowledgementsMissing: string[],
 *   upcomingDeadlines: Array<{ label: string, date: string | null, formSource: string }>,
 *   readyToAdvance: boolean,
 *   requiredActions: string[],
 *   summary: string
 * }
 */

const DISCLOSURES_REASONING_OUTPUT_SCHEMA = {
  formsReceived: 'string[] — form codes present in the submission',
  formsComplete: 'string[] — form codes that appear fully completed and signed',
  formsIncomplete: 'Array<{ formCode: string, reason: string }> — forms present but missing data or signatures',
  formsMissing: 'string[] — standard disclosure forms expected but not present (TDS, SPQ, NHD are always required)',
  disclosedIssues: 'string[] — material defects or issues disclosed by seller that may require follow-up',
  sellerSignaturesMissing: 'string[] — form codes where seller signature is absent',
  buyerAcknowledgementsMissing: 'string[] — form codes where buyer acknowledgement is absent',
  upcomingDeadlines: 'Array<{ label: string, date: string|null, formSource: string }> — disclosure delivery deadlines found in forms',
  readyToAdvance: 'boolean — true only if all required disclosures are complete and signed',
  requiredActions: 'string[] — plain-English items that must be resolved before advancing',
  summary: 'string — 2-3 sentence human-readable summary of disclosure package status',
};

export const disclosuresReason: ReasoningDefinition = {
  stage: 'DISCLOSURES',

  // TDS and SPQ contain material defects that can affect negotiations.
  // NHD reveals hazard zones that can affect insurability and value.
  // BIA, BHIA, MCA, AVID, CCPA, FHDA, SBSA, PRBS are compliance-only — StageValidator handles them.
  decisionFormCodes: ['TDS', 'SPQ', 'NHD'],

  produces: [],
  consumes: ['finalAgreedPrice', 'closeOfEscrowDate', 'buyerNames', 'sellerNames'],

  systemPrompt: `You are an expert California real estate transaction coordinator reviewing a disclosures package.

You will receive extracted JSON data from one or more CAR disclosure forms submitted for the DISCLOSURES stage. Forms may include: TDS (Transfer Disclosure Statement), SPQ (Seller Property Questionnaire), NHD (Natural Hazard Disclosure), BIA (Buyer's Inspection Advisory), BHIA (Buyer's Home Inspection Advisory), MCA (Market Conditions Advisory), AVID (Agent Visual Inspection Disclosure), PRBS (Possible Representation of Both Seller and Buyer), SBSA (Statewide Buyer and Seller Advisory), and others.

If prior stage context is provided, use it to verify parties and flag any discrepancies between disclosed information and the agreed contract terms.

YOUR TASK:
1. Identify which standard disclosure forms are present and which are missing.
   Always required: TDS, SPQ, NHD.
   Common but not always required: BIA, BHIA, MCA, AVID.
2. For each form present, determine if it is complete (all required fields filled, all signatures present).
3. Extract any material defects or issues disclosed by the seller in TDS or SPQ (Section II-B, II-C answers of "Yes").
4. Identify missing seller signatures and buyer acknowledgements.
5. Extract any disclosure delivery deadline dates found in the forms.
6. Determine if the disclosure package is ready to advance to INSPECTION stage.

SIGNATURE RULES:
- TDS requires seller signature on both page 2 and page 3.
- SPQ requires seller signature on the final page.
- NHD requires seller and agent signatures.
- Missing any required signature = not ready to advance.

EXPECTED OUTPUT FORMAT:
Return ONLY valid JSON matching this schema exactly. No markdown, no explanation.

${JSON.stringify(DISCLOSURES_REASONING_OUTPUT_SCHEMA, null, 2)}`,

  buildUserPrompt: (forms: ReasoningInput[], context?: TransactionContext) => {
    const formSummaries = forms.map((f) => ({
      formCode: f.formCode,
      formName: f.formName,
      extractedData: f.data,
    }));

    return `Analyze the following ${forms.length} extracted disclosure form(s) and return your reasoning as valid JSON:${buildContextBlock(context)}\n${JSON.stringify(formSummaries, null, 2)}`;
  },
};
