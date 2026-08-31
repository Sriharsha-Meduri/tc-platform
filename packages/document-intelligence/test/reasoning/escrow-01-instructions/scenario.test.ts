import { join } from 'path';
import { describeScenario } from '../../helpers/scenario';
import type { TransactionContext } from '../../../src/reasoner/reasoning-definition';

const SCENARIO_DIR = join(__dirname);

const context: TransactionContext = {
  finalAgreedPrice: 900000,
  closeOfEscrowDate: '2026-03-15',
  buyerNames: ['John Buyer'],
  sellerNames: ['Jane Seller'],
  loanApprovalDate: '2026-03-05',
};

describeScenario(SCENARIO_DIR, {
  stage: 'ESCROW',
  context,

  extraction: {
    pdfFiles: [
      'day-22-escrow-instructions.pdf',
      'day-22-prelim.pdf',
      'day-26-prelim-amended.pdf',
    ],
  },

  reasoning: [
    {
      round: 1,
      label: 'Day 22 — Escrow open, prelim shows mechanic\'s lien',
      expect: {
        escrowNumber: '12345',
        preliminaryReportReceived: true,
        readyToAdvance: false,
      },
    },
    {
      round: 2,
      label: 'Day 26 — Lien released, title clear, instructions signed',
      expect: {
        escrowInstructionsSigned: true,
        readyToAdvance: true,
      },
    },
  ],
});
