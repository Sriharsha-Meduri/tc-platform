import type { ReasoningDefinition, ReasoningInput, TransactionContext } from '../reasoning-definition';
import { buildContextBlock } from '../reasoning-definition';

/**
 * CONTRACT stage reasoning.
 *
 * Forms typically present: RPA, COUNTER (one or more), AD, FRR-PA, BIA, PRBS
 *
 * The LLM receives all extracted form JSONs and determines the final agreed terms
 * after resolving counter offers, identifies open items, and decides if the contract
 * stage is ready to advance.
 *
 * PRODUCES (written to TransactionContext for later stages):
 *   finalAgreedPrice, closeOfEscrowDate, financingType, loanAmount, buyerNames, sellerNames
 *
 * OUTPUT SCHEMA:
 *
 * {
 *   finalAgreedPrice: number | null,
 *   priceHistory: Array<{ source: string, price: number, date: string | null }>,
 *   financingType: string | null,
 *   loanAmount: number | null,
 *   closeOfEscrowDate: string | null,
 *   buyerNames: string[],
 *   sellerNames: string[],
 *   openContingencies: string[],
 *   missingSignatures: string[],
 *   upcomingDeadlines: Array<{ label: string, date: string | null, formSource: string }>,
 *   readyToAdvance: boolean,
 *   requiredActions: string[],
 *   summary: string
 * }
 */

const CONTRACT_REASONING_OUTPUT_SCHEMA = {
  finalAgreedPrice: 'number|null — purchase price after all counter offers are resolved',
  priceHistory: 'Array<{ source: string, price: number, date: string|null }> — one entry per price across forms, in document order',
  financingType: 'string|null — one of: Conventional, FHA, VA, All Cash, Seller Financing',
  loanAmount: 'number|null',
  closeOfEscrowDate: 'string|null (YYYY-MM-DD)',
  buyerNames: 'string[]',
  sellerNames: 'string[]',
  openContingencies: 'string[] — active contingencies with days, e.g. "Loan contingency (21 days)"',
  missingSignatures: 'string[] — specific signatures or initials that are absent',
  upcomingDeadlines: 'Array<{ label: string, date: string|null, formSource: string }> — key contract deadlines extracted from RPA and addenda',
  readyToAdvance: 'boolean — true only if all required forms are signed and no blocking issues exist',
  requiredActions: 'string[] — plain-English items that must be resolved before advancing',
  summary: 'string — 2-3 sentence human-readable summary of contract status',
};

export const contractReason: ReasoningDefinition = {
  stage: 'CONTRACT',

  // RPA and COUNTER change agreed terms. FRR-PA overrides financing terms.
  // BIA, BHIA, PRBS, SBSA, WFA, AVID, AD are compliance-only — validated by StageValidator.
  decisionFormCodes: ['RPA', 'COUNTER', 'FRR-PA'],

  produces: ['finalAgreedPrice', 'closeOfEscrowDate', 'financingType', 'loanAmount', 'buyerNames', 'sellerNames'],
  consumes: [],

  systemPrompt: `You are an expert California real estate transaction coordinator reviewing a contract package.

You will receive extracted JSON data from one or more CAR forms submitted for the CONTRACT stage of a real estate transaction. Forms may include: RPA (Residential Purchase Agreement), COUNTER (Seller or Buyer Counter Offer), AD (Agent Visual Inspection Disclosure), FRR-PA (Financing Addendum), BIA (Buyer's Inspection Advisory), PRBS (Possible Representation of Both Seller and Buyer), and others.

YOUR TASK:
1. Identify all purchase prices across forms. The FINAL agreed price is the price from the most recent accepted counter offer. If no counter offer is present, it is the RPA purchase price.
2. Determine financing type and loan amount from the most authoritative source (FRR-PA overrides RPA if present).
3. Extract the close of escrow date.
4. List all open contingencies that have not been removed.
5. List any missing signatures or initials required for the contract to be binding.
6. Extract all key deadline dates from RPA and addenda (inspection contingency, loan contingency, appraisal contingency, disclosure delivery, close of escrow).
7. Determine if the contract stage is ready to advance (all forms signed, no blocking issues).
8. List required actions in plain English.

COUNTER OFFER RESOLUTION RULES:
- Multiple counter offers may be present. Process them in the order they appear in the data.
- The final agreed price is the price from the last accepted counter offer in the chain.
- If a counter offer shows "accepted_subject_to_counter_offer: true", that counter is still pending — do NOT use its price as final.
- If the RPA shows "accepted_subject_to_counter_offer: true" and a COUNTER form is present, the COUNTER terms supersede the RPA for the fields it addresses.

EXPECTED OUTPUT FORMAT:
Return ONLY valid JSON matching this schema exactly. No markdown, no explanation.

${JSON.stringify(CONTRACT_REASONING_OUTPUT_SCHEMA, null, 2)}`,

  buildUserPrompt: (forms: ReasoningInput[], context?: TransactionContext) => {
    const formSummaries = forms.map((f) => ({
      formCode: f.formCode,
      formName: f.formName,
      extractedData: f.data,
    }));

    return `Analyze the following ${forms.length} extracted form(s) for the CONTRACT stage and return your reasoning as valid JSON:${buildContextBlock(context)}\n${JSON.stringify(formSummaries, null, 2)}`;
  },
};
