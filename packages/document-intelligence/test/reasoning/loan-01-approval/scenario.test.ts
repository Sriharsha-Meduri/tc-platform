import { join } from 'path';
import { describeScenario } from '../../helpers/scenario';
import type { TransactionContext } from '../../../src/reasoner/reasoning-definition';

const SCENARIO_DIR = join(__dirname);

const context: TransactionContext = {
  finalAgreedPrice: 900000,
  financingType: 'Conventional',
  loanAmount: 720000,
  closeOfEscrowDate: '2026-03-15',
  buyerNames: ['John Buyer'],
  sellerNames: ['Jane Seller'],
};

describeScenario(SCENARIO_DIR, {
  stage: 'LOAN',
  context,

  extraction: {
    pdfFiles: [
      'day-15-conditional-approval.pdf',
      'day-19-clear-to-close.pdf',
      'day-20-cr-b.pdf',
    ],
  },

  reasoning: [
    {
      round: 1,
      label: 'Day 15 — Conditional approval, outstanding conditions',
      expect: {
        loanStatus: 'conditionally_approved',
        loanContingencyRemoved: false,
        readyToAdvance: false,
      },
    },
    {
      round: 2,
      label: 'Day 19 — Clear-to-close issued, all conditions satisfied',
      expect: {
        loanStatus: 'fully_approved',
        loanContingencyRemoved: false,
        readyToAdvance: false,
      },
    },
    {
      round: 3,
      label: 'Day 20 — Buyer removes loan contingency',
      expect: {
        loanStatus: 'fully_approved',
        loanContingencyRemoved: true,
        readyToAdvance: true,
      },
    },
  ],
});
