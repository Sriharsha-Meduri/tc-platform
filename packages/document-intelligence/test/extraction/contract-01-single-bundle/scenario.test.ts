import { join } from 'path';
import { describeScenario } from '../../helpers/scenario';

describeScenario(join(__dirname), {
  stage: 'CONTRACT',

  extraction: {
    // Drop all forms as a single bundled PDF named upload.pdf
    pdfFiles: ['upload.pdf'],
  },

});
