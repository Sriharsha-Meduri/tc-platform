import { join } from 'path';
import { describeScenario } from '../../helpers/scenario';
import type { TransactionContext } from '../../../src/reasoner/reasoning-definition';

const SCENARIO_DIR = join(__dirname);

const context: TransactionContext = {
  finalAgreedPrice: 900000,
  closeOfEscrowDate: '2026-03-15',
  buyerNames: ['John Buyer'],
  sellerNames: ['Jane Seller'],
  escrowNumber: '12345',
  escrowOfficer: 'Jane Escrow',
};

describeScenario(SCENARIO_DIR, {
  stage: 'CLOSING',
  context,

  extraction: {
    pdfFiles: [
      'day-28-bwca-issues.pdf',
      'day-29-bwca-accepted.pdf',
      'day-29-cd.pdf',
    ],
  },

  reasoning: [
    {
      round: 1,
      label: 'Day 28 — Walkthrough notes issue, seller has not fully vacated',
      expect: {
        walkthroughCompleted: false,
        readyToAdvance: false,
      },
    },
    {
      round: 2,
      label: 'Day 29 — Property accepted, CD received, ready to close',
      expect: {
        walkthroughCompleted: true,
        closingDisclosureReceived: true,
        readyToAdvance: true,
      },
    },
  ],
});
