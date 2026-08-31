import { it } from 'vitest';
import { readFileSync } from 'fs';
import { DocumentIntelligencePipeline } from '../../../src/pipeline/document-intelligence';

it('dumps RPA JSON', async () => {
  const pipeline = new DocumentIntelligencePipeline({
    identifier: { apiKey: process.env.GEMINI_API_KEY!, provider: 'gemini' },
    extractor: { provider: 'gemini', apiKey: process.env.GEMINI_API_KEY! },
  });
  const pdf = readFileSync('test/extraction/lantana-home/lantana-home-rpa.pdf');
  const result = await pipeline.process(pdf);
  const rpa = result.extractions.find(e => e.formCode === 'RPA');
  if (!rpa?.output?.data) { console.log('No RPA data'); return; }
  console.log(JSON.stringify(rpa.output.data, null, 2));
}, 600000);
