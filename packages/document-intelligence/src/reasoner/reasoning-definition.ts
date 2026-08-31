/**
 * Cross-stage facts carried forward from one stage reasoner to the next.
 * The application accumulates this as stages complete and passes it into
 * each subsequent StageReasoner.reason() call.
 *
 * Only fields that later stages actually need are included — keep it lean.
 */
export interface TransactionContext {
  /** ISO date string used as "today" for deadline urgency descriptions (YYYY-MM-DD). */
  referenceDate?: string;
  /** Resolved purchase price after all counter offers are settled. Set by CONTRACT. */
  finalAgreedPrice?: number | null;
  /** Close of escrow date from RPA or most recent counter offer. Set by CONTRACT. */
  closeOfEscrowDate?: string | null;
  /** Financing type (Conventional, FHA, VA, All Cash, Seller Financing). Set by CONTRACT. */
  financingType?: string | null;
  /** Loan amount. Set by CONTRACT. */
  loanAmount?: number | null;
  /** Buyer full names. Set by CONTRACT. */
  buyerNames?: string[];
  /** Seller full names. Set by CONTRACT. */
  sellerNames?: string[];
  /** Repair credit agreed in RR/RRR negotiation, if any. Set by INSPECTION. */
  creditAgreed?: number | null;
  /** Appraised value from appraisal report. Set by APPRAISAL. */
  appraisedValue?: number | null;
  /** Date lender issued final loan approval. Set by LOAN. */
  loanApprovalDate?: string | null;
  /** Escrow file number assigned by escrow company. Set by ESCROW. */
  escrowNumber?: string | null;
  /** Escrow officer name. Set by ESCROW. */
  escrowOfficer?: string | null;
}

/**
 * Builds the prior-stage context block injected into the user prompt.
 * Returns an empty string when context is absent or empty.
 */
export function buildContextBlock(context?: TransactionContext): string {
  if (!context || Object.keys(context).length === 0) return '';
  return `\n## Prior stage context\n${JSON.stringify(context, null, 2)}\n`;
}

/**
 * Input to the reasoner — one entry per extracted form.
 * Save these as JSON fixtures in test/scenarios/<name>/extractions/.
 */
export interface ReasoningInput {
  formCode: string;
  formName: string | null;
  data: Record<string, unknown>;
  /** Optional: stage the form belongs to. Populated when a combined PDF spans multiple stages. */
  stage?: string;
}

/**
 * Result returned by StageReasoner.reason().
 * Shape of `data` is defined by the stage reasoning prompt.
 */
export interface ReasoningResult {
  stage: string;
  data: Record<string, unknown>;
  rawResponse: string;
  promptTokens?: number | null;
  completionTokens?: number | null;
  modelName?: string;
}

/**
 * One reasoning definition per transaction stage.
 * The AI engineer edits systemPrompt (and optionally buildUserPrompt) to control reasoning behavior.
 */
export interface ReasoningDefinition {
  stage: string;
  systemPrompt: string;
  /**
   * CAR form codes (uppercase) whose extracted JSON should be passed to the LLM for reasoning.
   * Only forms that change transaction terms, dates, prices, or contingencies belong here.
   *
   * Compliance-only forms (BIA, BHIA, SBSA, PRBS, WFA, AVID, MCA, CCPA, FHDA, etc.) are
   * extracted and stored in the DB but filtered out before the reasoning call — they are
   * validated by the deterministic StageValidator, not the LLM.
   *
   * When undefined, all extracted forms are passed (suitable for later stages where every
   * form is a decision document). When an empty array [], reasoning is always skipped.
   */
  decisionFormCodes?: string[];
  /**
   * Keys this stage writes into TransactionContext after reasoning completes.
   * The application reads these keys from result.data and merges them into the
   * accumulated context before calling the next stage.
   */
  produces?: (keyof TransactionContext)[];
  /**
   * Keys this stage reads from TransactionContext.
   * Documents which prior-stage facts this prompt depends on.
   */
  consumes?: (keyof TransactionContext)[];
  /** Override to control how form JSONs are serialised into the user turn. Default: JSON array. */
  buildUserPrompt?: (forms: ReasoningInput[], context?: TransactionContext) => string;
}
