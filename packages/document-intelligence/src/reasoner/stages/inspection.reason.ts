import type { ReasoningDefinition, ReasoningInput, TransactionContext } from '../reasoning-definition';
import { buildContextBlock } from '../reasoning-definition';

/**
 * INSPECTION stage reasoning.
 *
 * Forms typically present: RR (Request for Repair), RRR (Response to Request for Repair),
 * CR-B (Contingency Removal — Buyer), BWCA (Buyer's Walkthrough and Acceptance Advisory),
 * RBCS (Repair and Buyer Credit Statement), inspection reports (non-CAR)
 *
 * The LLM receives all extracted form JSONs and tracks the full RR → RRR negotiation chain,
 * determines the agreed repair scope and any credit, and decides if inspection contingency
 * has been removed.
 *
 * CONSUMES from TransactionContext: finalAgreedPrice, closeOfEscrowDate, buyerNames, sellerNames
 * PRODUCES: creditAgreed
 *
 * OUTPUT SCHEMA:
 *
 * {
 *   formsReceived: string[],
 *   rrStatus: 'not_submitted' | 'submitted' | 'responded' | 'resolved',
 *   rrItems: string[],
 *   rrrStatus: 'pending' | 'agreed' | 'countered' | 'rejected' | 'none',
 *   agreedRepairs: string[],
 *   creditRequested: number | null,
 *   creditAgreed: number | null,
 *   inspectionContingencyRemoved: boolean,
 *   upcomingDeadlines: Array<{ label: string, date: string | null, formSource: string }>,
 *   missingSignatures: string[],
 *   readyToAdvance: boolean,
 *   requiredActions: string[],
 *   summary: string
 * }
 */

const INSPECTION_REASONING_OUTPUT_SCHEMA = {
  formsReceived: 'string[] — form codes present in the submission',
  rrStatus: "'not_submitted' | 'submitted' | 'responded' | 'resolved' — overall state of the repair request",
  rrItems: "string[] — specific repair items the buyer requested, e.g. 'Replace water heater', 'Fix roof leak at chimney'",
  rrrStatus: "'pending' | 'agreed' | 'countered' | 'rejected' | 'none' — seller's response status",
  agreedRepairs: 'string[] — repairs or credits the seller has agreed to',
  creditRequested: 'number|null — cash credit amount the buyer requested in lieu of repairs',
  creditAgreed: 'number|null — cash credit amount the seller agreed to',
  inspectionContingencyRemoved: 'boolean — true if a signed CR-B or equivalent removal is present',
  upcomingDeadlines: 'Array<{ label: string, date: string|null, formSource: string }> — inspection-related deadlines extracted from forms',
  missingSignatures: 'string[] — signatures absent from RR, RRR, or CR-B',
  readyToAdvance: 'boolean — true when inspection contingency is removed and any repair/credit agreement is fully executed',
  requiredActions: 'string[] — plain-English items that must be resolved before advancing',
  summary: 'string — 2-3 sentence human-readable summary of inspection stage status',
};

export const inspectionReason: ReasoningDefinition = {
  stage: 'INSPECTION',

  // RR/RRR drive repair negotiations. CR-B removes the contingency. RBCS formalises any credit.
  // BWCA is a walkthrough advisory — compliance only; it becomes a decision form at CLOSING.
  decisionFormCodes: ['RR', 'RRR', 'CR-B', 'RBCS'],

  produces: ['creditAgreed'],
  consumes: ['finalAgreedPrice', 'closeOfEscrowDate', 'buyerNames', 'sellerNames'],

  systemPrompt: `You are an expert California real estate transaction coordinator reviewing the inspection package.

You will receive extracted JSON data from one or more CAR forms submitted for the INSPECTION stage. Forms may include: RR (Request for Repair), RRR (Response to Request for Repair), CR-B (Contingency Removal — Buyer removing inspection contingency), RBCS (Repair and Buyer Credit Statement), and BWCA (Buyer's Walkthrough and Acceptance Advisory). Non-CAR inspection reports may also be present.

If prior stage context is provided, use it to evaluate repair credit amounts relative to the agreed purchase price and to verify party names match.

YOUR TASK:
1. Determine the current status of the RR/RRR negotiation chain.
   - If no RR is present and no CR-B is present: status = not_submitted.
   - If RR is present but no RRR: status = submitted (awaiting seller response).
   - If RR and RRR are present: status = responded (may be agreed, countered, or rejected).
   - If inspection contingency has been formally removed: status = resolved.
2. Extract all repair items the buyer requested from RR forms.
3. Determine the seller's response from RRR: which items they agreed to, countered, or rejected.
4. Identify any agreed cash credit in lieu of repairs.
5. Check if the inspection contingency has been formally removed (CR-B signed by buyer).
6. Extract deadline dates (inspection completion, contingency removal deadline, walkthrough date).
7. List missing signatures on any form in the package.

RR/RRR CHAIN RULES:
- Multiple RR forms may be present (buyer may resubmit). Use the most recent one as the active request.
- If RRR shows partial agreement, list only the agreed items in agreedRepairs.
- creditAgreed is the final agreed credit amount; if the seller countered with a different amount, use the countered amount only if the buyer accepted it.

EXPECTED OUTPUT FORMAT:
Return ONLY valid JSON matching this schema exactly. No markdown, no explanation.

${JSON.stringify(INSPECTION_REASONING_OUTPUT_SCHEMA, null, 2)}`,

  buildUserPrompt: (forms: ReasoningInput[], context?: TransactionContext) => {
    const formSummaries = forms.map((f) => ({
      formCode: f.formCode,
      formName: f.formName,
      extractedData: f.data,
    }));

    return `Analyze the following ${forms.length} extracted form(s) for the INSPECTION stage and return your reasoning as valid JSON:${buildContextBlock(context)}\n${JSON.stringify(formSummaries, null, 2)}`;
  },
};
