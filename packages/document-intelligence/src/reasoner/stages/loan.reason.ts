import type { ReasoningDefinition, ReasoningInput, TransactionContext } from '../reasoning-definition';
import { buildContextBlock } from '../reasoning-definition';

/**
 * LOAN stage reasoning.
 *
 * Forms typically present: Loan approval letter (non-CAR), LCA (Loan Contingency Addendum),
 * LORA (Loan Contingency Removal Addendum), CR-B (Contingency Removal — Buyer removing loan contingency),
 * lender condition letters
 *
 * The LLM determines loan approval status, identifies outstanding lender conditions,
 * and decides if the loan contingency has been removed.
 *
 * CONSUMES from TransactionContext: finalAgreedPrice, financingType, loanAmount, closeOfEscrowDate, buyerNames, sellerNames
 * PRODUCES: loanApprovalDate
 *
 * OUTPUT SCHEMA:
 *
 * {
 *   formsReceived: string[],
 *   loanStatus: 'pending_application' | 'applied' | 'conditionally_approved' | 'fully_approved' | 'denied',
 *   lenderName: string | null,
 *   loanApprovalDate: string | null,
 *   openConditions: string[],
 *   loanContingencyRemoved: boolean,
 *   upcomingDeadlines: Array<{ label: string, date: string | null, formSource: string }>,
 *   missingSignatures: string[],
 *   readyToAdvance: boolean,
 *   requiredActions: string[],
 *   summary: string
 * }
 */

const LOAN_REASONING_OUTPUT_SCHEMA = {
  formsReceived: 'string[] — form codes present in the submission',
  loanStatus: "'pending_application' | 'applied' | 'conditionally_approved' | 'fully_approved' | 'denied'",
  lenderName: 'string|null — name of the lending institution',
  loanApprovalDate: 'string|null (YYYY-MM-DD) — date of final unconditional approval',
  openConditions: "string[] — outstanding lender conditions that must be satisfied before funding, e.g. 'Provide 2 months bank statements', 'HOA certification required'",
  loanContingencyRemoved: 'boolean — true if a signed CR-B or LORA removing the loan contingency is present',
  upcomingDeadlines: 'Array<{ label: string, date: string|null, formSource: string }> — loan-related deadlines',
  missingSignatures: 'string[] — signatures absent from any form in the package',
  readyToAdvance: 'boolean — true when loan is fully approved and loan contingency is removed',
  requiredActions: 'string[] — plain-English items that must be resolved before advancing',
  summary: 'string — 2-3 sentence human-readable summary of loan stage status',
};

export const loanReason: ReasoningDefinition = {
  stage: 'LOAN',

  // Loan approval letters, LCA, LORA, CR-B are all decision forms here.
  // undefined = pass all extracted forms (no compliance-only CAR forms at loan stage).
  decisionFormCodes: undefined,

  produces: ['loanApprovalDate'],
  consumes: ['finalAgreedPrice', 'financingType', 'loanAmount', 'closeOfEscrowDate', 'buyerNames', 'sellerNames'],

  systemPrompt: `You are an expert California real estate transaction coordinator reviewing the loan package.

You will receive extracted JSON data from documents submitted for the LOAN stage. Documents may include a loan approval letter (non-CAR), LCA (Loan Contingency Addendum), LORA (Loan Contingency Removal Addendum), CR-B (Contingency Removal — Buyer), and lender condition letters.

If prior stage context is provided, verify that the loan amount and financing type match the contract terms, and flag any discrepancies.

YOUR TASK:
1. Determine the current loan status from the documents.
   - pending_application: no loan documents submitted yet.
   - applied: application submitted, awaiting decision.
   - conditionally_approved: approval letter present but with outstanding conditions.
   - fully_approved: clean approval letter with no outstanding conditions.
   - denied: lender has declined the loan.
2. Extract the lender name and the date of any approval letter.
3. List all outstanding lender conditions from conditional approval letters.
4. Check if the loan contingency has been formally removed (CR-B or LORA signed).
5. Extract loan-related deadline dates (loan contingency removal deadline, funding date).
6. Determine readiness to advance to ESCROW stage.

NOTE: For All Cash transactions (financingType = "All Cash"), loan stage may have no forms. In that case, set loanStatus = "fully_approved" if the prior context confirms all-cash, loanContingencyRemoved = true, and openConditions = [].

EXPECTED OUTPUT FORMAT:
Return ONLY valid JSON matching this schema exactly. No markdown, no explanation.

${JSON.stringify(LOAN_REASONING_OUTPUT_SCHEMA, null, 2)}`,

  buildUserPrompt: (forms: ReasoningInput[], context?: TransactionContext) => {
    const formSummaries = forms.map((f) => ({
      formCode: f.formCode,
      formName: f.formName,
      extractedData: f.data,
    }));

    return `Analyze the following ${forms.length} extracted form(s) for the LOAN stage and return your reasoning as valid JSON:${buildContextBlock(context)}\n${JSON.stringify(formSummaries, null, 2)}`;
  },
};
