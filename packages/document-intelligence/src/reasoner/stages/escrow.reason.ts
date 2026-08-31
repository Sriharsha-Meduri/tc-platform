import type { ReasoningDefinition, ReasoningInput, TransactionContext } from '../reasoning-definition';
import { buildContextBlock } from '../reasoning-definition';

/**
 * ESCROW stage reasoning.
 *
 * Forms typically present: Escrow instructions (non-CAR), Preliminary title report (non-CAR),
 * SSD (Short Sale Addendum, if applicable), HOA documents, wire fraud advisory (WFA),
 * estimated closing statement (HUD-1 / CD)
 *
 * The LLM confirms escrow is opened, title is clear, all parties have signed escrow
 * instructions, and the transaction is on track to fund.
 *
 * CONSUMES from TransactionContext: finalAgreedPrice, closeOfEscrowDate, buyerNames, sellerNames, loanApprovalDate
 * PRODUCES: escrowNumber, escrowOfficer
 *
 * OUTPUT SCHEMA:
 *
 * {
 *   formsReceived: string[],
 *   escrowNumber: string | null,
 *   escrowOfficer: string | null,
 *   escrowCompany: string | null,
 *   titleCompany: string | null,
 *   preliminaryReportReceived: boolean,
 *   titleExceptions: string[],
 *   escrowInstructionsSigned: boolean,
 *   estimatedClosingCosts: number | null,
 *   upcomingDeadlines: Array<{ label: string, date: string | null, formSource: string }>,
 *   missingSignatures: string[],
 *   readyToAdvance: boolean,
 *   requiredActions: string[],
 *   summary: string
 * }
 */

const ESCROW_REASONING_OUTPUT_SCHEMA = {
  formsReceived: 'string[] — form codes present in the submission',
  escrowNumber: 'string|null — escrow file number assigned by escrow company',
  escrowOfficer: 'string|null — name of the escrow officer handling this file',
  escrowCompany: 'string|null — name of the escrow company',
  titleCompany: 'string|null — name of the title company',
  preliminaryReportReceived: 'boolean — true if preliminary title report is present',
  titleExceptions: 'string[] — title exceptions or encumbrances that require resolution, e.g. "Mechanic\'s lien", "HOA delinquency"',
  escrowInstructionsSigned: 'boolean — true if escrow instructions have been signed by all required parties',
  estimatedClosingCosts: 'number|null — estimated total closing costs from HUD-1 or CD if available',
  upcomingDeadlines: 'Array<{ label: string, date: string|null, formSource: string }> — escrow-related deadlines',
  missingSignatures: 'string[] — signatures absent from any form in the package',
  readyToAdvance: 'boolean — true when escrow is open, title is clear, instructions are signed, and funds are on track',
  requiredActions: 'string[] — plain-English items that must be resolved before advancing',
  summary: 'string — 2-3 sentence human-readable summary of escrow stage status',
};

export const escrowReason: ReasoningDefinition = {
  stage: 'ESCROW',

  // Escrow instructions and preliminary title report are decision forms.
  // WFA (Wire Fraud Advisory) is compliance-only — acknowledged by parties but doesn't change terms.
  decisionFormCodes: ['ESCROW_INST', 'PRELIM', 'TIP', 'SSD'],

  produces: ['escrowNumber', 'escrowOfficer'],
  consumes: ['finalAgreedPrice', 'closeOfEscrowDate', 'buyerNames', 'sellerNames', 'loanApprovalDate'],

  systemPrompt: `You are an expert California real estate transaction coordinator reviewing the escrow package.

You will receive extracted JSON data from documents submitted for the ESCROW stage. Documents may include escrow instructions, a preliminary title report, an estimated closing statement (HUD-1 or Closing Disclosure), HOA documents, and a Wire Fraud Advisory (WFA).

If prior stage context is provided, verify that escrow terms (purchase price, close of escrow date, party names) match the contract terms from prior stages, and flag any discrepancies.

YOUR TASK:
1. Confirm escrow is opened and extract the escrow number and officer name.
2. Confirm the title company and whether the preliminary title report has been received.
3. Identify any title exceptions or encumbrances in the preliminary report that require resolution.
4. Determine if escrow instructions have been signed by all required parties.
5. Extract estimated closing costs if a HUD-1 or Closing Disclosure is present.
6. Extract escrow-related deadline dates (close of escrow, HOA document deadline, wire transfer deadline).
7. Determine readiness to advance to CLOSING stage.

TITLE EXCEPTION RULES:
- Routine exceptions (easements, CC&Rs) do not block advancement.
- Blocking exceptions: mechanic's liens, judgment liens, HOA delinquencies, unreleased deeds of trust.
- Flag blocking exceptions in titleExceptions and list resolution in requiredActions.

EXPECTED OUTPUT FORMAT:
Return ONLY valid JSON matching this schema exactly. No markdown, no explanation.

${JSON.stringify(ESCROW_REASONING_OUTPUT_SCHEMA, null, 2)}`,

  buildUserPrompt: (forms: ReasoningInput[], context?: TransactionContext) => {
    const formSummaries = forms.map((f) => ({
      formCode: f.formCode,
      formName: f.formName,
      extractedData: f.data,
    }));

    return `Analyze the following ${forms.length} extracted form(s) for the ESCROW stage and return your reasoning as valid JSON:${buildContextBlock(context)}\n${JSON.stringify(formSummaries, null, 2)}`;
  },
};
