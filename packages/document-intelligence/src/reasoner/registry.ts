import { contractReason } from './stages/contract.reason';
import { disclosuresReason } from './stages/disclosures.reason';
import { inspectionReason } from './stages/inspection.reason';
import { appraisalReason } from './stages/appraisal.reason';
import { loanReason } from './stages/loan.reason';
import { escrowReason } from './stages/escrow.reason';
import { closingReason } from './stages/closing.reason';
import type { ReasoningDefinition } from './reasoning-definition';

/**
 * Registry mapping transaction stage names (uppercase) to reasoning definitions.
 *
 * ADD A NEW STAGE:
 *   1. Create src/reasoner/stages/<stage>.reason.ts following the contract.reason.ts pattern
 *   2. Declare produces[] and consumes[] to document context flow
 *   3. Import it here and add an entry below
 */
export const REASONING_REGISTRY: Record<string, ReasoningDefinition> = {
  CONTRACT:    contractReason,
  DISCLOSURES: disclosuresReason,
  INSPECTION:  inspectionReason,
  APPRAISAL:   appraisalReason,
  LOAN:        loanReason,
  ESCROW:      escrowReason,
  CLOSING:     closingReason,
};
