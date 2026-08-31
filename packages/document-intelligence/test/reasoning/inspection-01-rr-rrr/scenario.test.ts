import { join } from 'path';
import { describeScenario } from '../../helpers/scenario';
import type { TransactionContext } from '../../../src/reasoner/reasoning-definition';

const SCENARIO_DIR = join(__dirname);

// Prior stage context — populate from a completed CONTRACT reasoning result
const context: TransactionContext = {
  finalAgreedPrice: 900000,
  closeOfEscrowDate: '2026-03-15',
  buyerNames: ['John Buyer'],
  sellerNames: ['Jane Seller'],
};

describeScenario(SCENARIO_DIR, {
  stage: 'INSPECTION',
  context,

  extraction: {
    pdfFiles: [
      'day-05-rr.pdf',
      'day-08-rrr.pdf',
      'day-10-cr-b.pdf',
    ],
  },

  reasoning: [
    {
      round: 1,
      label: 'Day 5 — RR submitted, awaiting seller response',
      expect: {
        rrStatus: 'submitted',
        rrrStatus: 'none',
        readyToAdvance: false,
      },
    },
    {
      round: 2,
      label: 'Day 8 — RRR received, seller agrees with $3,500 credit',
      expect: {
        rrStatus: 'responded',
        rrrStatus: 'agreed',
        creditAgreed: 3500,
        readyToAdvance: false,
      },
    },
    {
      round: 3,
      label: 'Day 10 — Buyer removes inspection contingency',
      expect: {
        inspectionContingencyRemoved: true,
        readyToAdvance: true,
      },
    },
  ],
});
