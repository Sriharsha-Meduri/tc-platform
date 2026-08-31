import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { buildPipeline } from '../../helpers/pipeline';
import { validateDisclosuresStage } from '../../../src/validator/stages/disclosures.stage';

/**
 * LLM-gated regression test: on a real SPQ where the seller checked several
 * Yes boxes but only some of them have a matching explanation, the SPQ
 * Yes-explanation vision pass must flag exactly the unexplained items and
 * nothing else — not just some of them, and never crediting one item's
 * explanation to a different item in the same section.
 *
 * Ground truth confirmed by direct visual inspection of the rendered PDF
 * pages (not by OCR/manual reading): 6L, 7E, 7F(1), 8D, 8E, 9B, and 11D are
 * Yes with no matching explanation; 5C, 6A, and 7D are Yes WITH a matching
 * explanation and must not blocker.
 */
describe('SPQ Yes-explanation vision pass (real fixture)', () => {
  it('flags exactly the unexplained Yes items and none of the explained ones', async () => {
    const apiKey = process.env.GEMINI_API_KEY ?? '';
    if (!apiKey) {
      console.log('GEMINI_API_KEY not set — skipping vision leg');
      return;
    }
    const spq = readFileSync('test/extraction/spq-yes-explanations/spq.pdf');
    const pipeline = buildPipeline();
    const result = await pipeline.process(spq);
    const primary = result.extractions[0];
    expect(primary.formCode).toBe('SPQ');

    const validation = validateDisclosuresStage([primary.output!]);
    const blockerItems = validation.blockers
      .filter((b) => b.code.startsWith('BLOCKER_SPQ_YES_ITEM_MISSING_EXPLANATION'))
      .map((b) => b.code.split(':')[1])
      .sort();

    expect(blockerItems).toEqual(['11D', '6L', '7E', '7F(1)', '8D', '8E', '9B'].sort());

    for (const explainedItem of ['5C', '6A', '7D']) {
      expect(blockerItems, `${explainedItem} has an explanation and must not blocker`).not.toContain(explainedItem);
    }
  }, 600000);
});
