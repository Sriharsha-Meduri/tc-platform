import { describe, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { DocumentIntelligencePipeline } from '../src/pipeline/document-intelligence';
import { normalizeToExtractionResult } from '../src/validator/stages/contract.stage';

function isRpaDocument(extraction: { documentType?: string | null; formsAndDisclosures?: { formCode?: string | null; title?: string | null }[] | null }): boolean {
  const docType = (extraction.documentType ?? '').toLowerCase();
  if (/\brpa\b/.test(docType) || /purchase\s{0,5}agreement/i.test(docType) || /residential\s{0,10}purchase/i.test(docType)) {
    return true;
  }
  return (extraction.formsAndDisclosures ?? []).some((f) => {
    const code = (f.formCode ?? '').toLowerCase();
    const title = (f.title ?? '').toLowerCase();
    return /\brpa\b/.test(code) || /\brpa\b/.test(title) || /purchase\s{0,5}agreement/i.test(title);
  });
}

describe('diagnostic: RPA identification + gate', () => {
  it('springhill RPA.pdf → identify, extract, gate', async () => {
    const pdf = readFileSync(join(__dirname, 'extraction', 'springhill-home', 'pdfs', 'RPA.pdf'));
    const geminiKey = process.env.GEMINI_API_KEY;
    const pipeline = new DocumentIntelligencePipeline({
      identifier: { apiKey: geminiKey!, temperature: 0 },
      extractor: { provider: 'gemini', apiKey: geminiKey!, temperature: 0 },
    });

    const result = await pipeline.process(pdf, {
      onProgress: (e) => process.stdout.write(`\r[${e.percent}%] ${e.message}  `),
    });
    process.stdout.write('\n');

    console.log('\n══ IDENTIFICATION ══');
    console.log(JSON.stringify(result.formGroups, null, 2));

    console.log('\n══ EXTRACTIONS ══');
    for (const e of result.extractions) {
      console.log(`formCode=${e.formCode} error=${e.error ?? 'none'} model=${e.output?.modelName ?? '-'}`);
      if (e.output?.data) {
        console.log(`  header.form_code=${(e.output.data as any).header?.form_code}`);
        const normalized = normalizeToExtractionResult(e.output.data as Record<string, unknown>);
        console.log(`  normalized.documentType=${normalized?.documentType}`);
        console.log(`  normalized.formsAndDisclosures=${JSON.stringify(normalized?.formsAndDisclosures)}`);
        console.log(`  isRpaDocument=${isRpaDocument(normalized ?? { documentType: null })}`);
      }
    }
  }, 180_000);
});
