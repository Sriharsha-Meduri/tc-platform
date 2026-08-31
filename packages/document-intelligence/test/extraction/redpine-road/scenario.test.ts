import { join } from 'path';
import { describeScenario } from '../../helpers/scenario';

describeScenario(join(__dirname), {
  stage: 'CONTRACT',

  extraction: {
    pdfFiles: ['redpine-rpa-buyersigned.pdf'],
  },
});
