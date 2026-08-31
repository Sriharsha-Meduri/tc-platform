import { join } from 'path';
import { describeScenario } from '../../helpers/scenario';
import type { TransactionContext } from '../../../src/reasoner/reasoning-definition';

const SCENARIO_DIR = join(__dirname);

const context: TransactionContext = {
  finalAgreedPrice: 900000,
  loanAmount: 720000,
  closeOfEscrowDate: '2026-03-15',
  buyerNames: ['John Buyer'],
  sellerNames: ['Jane Seller'],
};

describeScenario(SCENARIO_DIR, {
  stage: 'APPRAISAL',
  context,

  extraction: {
    pdfFiles: [
      'day-12-appraisal.pdf',
      'day-14-paa.pdf',
      'day-14-cr-b.pdf',
    ],
  },

  reasoning: [
    {
      round: 1,
      label: 'Day 12 — Appraisal report received, $25k below value',
      expect: {
        appraisedValue: 875000,
        appraisalContingencyStatus: 'below_value',
        valueGap: 25000,
        readyToAdvance: false,
      },
    },
    {
      round: 2,
      label: 'Day 14 — Price renegotiated, appraisal contingency removed',
      expect: {
        appraisalContingencyStatus: 'removed',
        appraisalContingencyRemoved: true,
        readyToAdvance: true,
      },
    },
  ],
});
