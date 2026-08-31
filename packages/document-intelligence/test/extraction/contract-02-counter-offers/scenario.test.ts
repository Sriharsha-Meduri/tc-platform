import { join } from 'path';
import { describeScenario } from '../../helpers/scenario';

describeScenario(join(__dirname), {
  stage: 'CONTRACT',

  extraction: {
    // Each file is extracted independently — drop them individually as they arrive
    pdfFiles: [
      'day-01-rpa.pdf',
      'day-03-counter-1.pdf',
      'day-05-counter-2.pdf',
    ],
  },

});
