import type { ReasoningDefinition, ReasoningInput, TransactionContext } from '../reasoning-definition';
import { buildContextBlock } from '../reasoning-definition';

/**
 * CLOSING stage reasoning.
 *
 * Forms typically present: BWCA (Buyer's Walkthrough and Acceptance Advisory),
 * final Closing Disclosure (CD), grant deed, deed of trust, settlement statement,
 * keys/possession confirmation
 *
 * The LLM confirms the final walkthrough was completed, closing documents are signed,
 * funds have been confirmed, and the transaction is recorded or ready to record.
 *
 * CONSUMES from TransactionContext: finalAgreedPrice, closeOfEscrowDate, buyerNames, sellerNames, escrowNumber, escrowOfficer
 * PRODUCES: nothing (terminal stage)
 *
 * OUTPUT SCHEMA:
 *
 * {
 *   formsReceived: string[],
 *   walkthroughCompleted: boolean,
 *   walkthroughIssues: string[],
 *   closingDisclosureReceived: boolean,
 *   closingDocumentsSigned: boolean,
 *   fundsConfirmed: boolean,
 *   recordingStatus: 'pending' | 'scheduled' | 'recorded',
 *   actualClosingDate: string | null,
 *   possessionDate: string | null,
 *   upcomingDeadlines: Array<{ label: string, date: string | null, formSource: string }>,
 *   missingSignatures: string[],
 *   readyToAdvance: boolean,
 *   requiredActions: string[],
 *   summary: string
 * }
 */

const CLOSING_REASONING_OUTPUT_SCHEMA = {
  formsReceived: 'string[] — form codes present in the submission',
  walkthroughCompleted: 'boolean — true if a signed BWCA or equivalent walkthrough confirmation is present',
  walkthroughIssues: "string[] — issues discovered during the final walkthrough that must be resolved, e.g. 'Seller has not vacated', 'Appliances missing'",
  closingDisclosureReceived: 'boolean — true if a final Closing Disclosure (CD) is present',
  closingDocumentsSigned: 'boolean — true if grant deed, deed of trust, and settlement statement are all signed',
  fundsConfirmed: 'boolean — true if buyer funds have been wired and confirmed by escrow',
  recordingStatus: "'pending' | 'scheduled' | 'recorded' — status of grant deed recording with the county",
  actualClosingDate: 'string|null (YYYY-MM-DD) — date the transaction actually recorded or is scheduled to record',
  possessionDate: 'string|null (YYYY-MM-DD) — date buyer takes possession per the agreement',
  upcomingDeadlines: 'Array<{ label: string, date: string|null, formSource: string }> — remaining closing deadlines',
  missingSignatures: 'string[] — signatures absent from any form in the closing package',
  readyToAdvance: 'boolean — true when deed is recorded, funds are disbursed, and possession is transferred',
  requiredActions: 'string[] — plain-English items that must be completed to close the transaction',
  summary: 'string — 2-3 sentence human-readable summary of closing stage status',
};

export const closingReason: ReasoningDefinition = {
  stage: 'CLOSING',

  // BWCA confirms property acceptance. CD finalises settlement figures. Both drive closing decisions.
  // undefined = pass all extracted forms (all closing documents are decision forms).
  decisionFormCodes: undefined,

  produces: [],
  consumes: ['finalAgreedPrice', 'closeOfEscrowDate', 'buyerNames', 'sellerNames', 'escrowNumber', 'escrowOfficer'],

  systemPrompt: `You are an expert California real estate transaction coordinator reviewing the closing package.

You will receive extracted JSON data from documents submitted for the CLOSING stage. Documents may include: BWCA (Buyer's Walkthrough and Acceptance Advisory), the final Closing Disclosure (CD), grant deed, deed of trust, settlement statement, and possession confirmation.

If prior stage context is provided, verify that closing figures match the agreed purchase price, escrow number, and parties from prior stages. Flag any discrepancies.

YOUR TASK:
1. Confirm the final walkthrough has been completed and note any issues discovered.
2. Confirm the Closing Disclosure has been received and reviewed.
3. Confirm that all closing documents (grant deed, deed of trust, settlement statement) are signed.
4. Determine if buyer funds have been confirmed by escrow.
5. Determine the recording status of the grant deed.
6. Extract the actual closing date and the possession date.
7. Determine if any remaining actions are needed to complete the transaction.

WALKTHROUGH RULES:
- A signed BWCA with no issues noted = walkthrough completed, no issues.
- If BWCA notes issues, list them in walkthroughIssues and add resolution steps to requiredActions.
- Walkthrough must occur within 5 days before close of escrow per standard CAR contract.

EXPECTED OUTPUT FORMAT:
Return ONLY valid JSON matching this schema exactly. No markdown, no explanation.

${JSON.stringify(CLOSING_REASONING_OUTPUT_SCHEMA, null, 2)}`,

  buildUserPrompt: (forms: ReasoningInput[], context?: TransactionContext) => {
    const formSummaries = forms.map((f) => ({
      formCode: f.formCode,
      formName: f.formName,
      extractedData: f.data,
    }));

    return `Analyze the following ${forms.length} extracted form(s) for the CLOSING stage and return your reasoning as valid JSON:${buildContextBlock(context)}\n${JSON.stringify(formSummaries, null, 2)}`;
  },
};
