import { join } from 'path';
import { describeScenario } from '../../helpers/scenario';

describeScenario(join(__dirname), {
  stage: 'DISCLOSURES',

  extraction: {
    // Drop all disclosure forms bundled into one PDF
    pdfFiles: ['upload.pdf'],
  },

});
