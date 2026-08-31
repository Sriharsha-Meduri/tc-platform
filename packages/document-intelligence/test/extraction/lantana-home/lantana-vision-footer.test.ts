import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { PdfSplitter } from '../../../src/splitter/pdf-splitter';
import { detectFooterInitialsWithVision } from '../../../src/vision/initials-slot-detector';
import { resolveFooterInitialVerdict } from '../../../src/vision/footer-initials-vision';
import { RenderedPageCache } from '../../../src/page-converter/rendered-page-cache';

/**
 * LLM-gated regression test: on the real lantana-home-rpa.pdf, the merged
 * footer-initials verdict (Gemini vision OR dark-pixel analysis) must be
 * "present" for all four slots on every known footer page — the same pages
 * where the deterministic pixel analysis already proves real ink exists.
 * The vision leg is exercised for real here; it can only add confidence,
 * never contradict a proven-present slot.
 */
const FOOTER_PHYSICAL_PAGES = [3, 6, 9, 10, 11, 12, 13, 14];
const SLOTS = ['buyerSlot1', 'buyerSlot2', 'sellerSlot1', 'sellerSlot2'] as const;

describe('detectFooterInitialsWithVision (real lantana-home-rpa.pdf)', () => {
  it('merged verdict is present for every footer slot (gemini OR pixel)', async () => {
    const apiKey = process.env.GEMINI_API_KEY ?? '';
    if (!apiKey) {
      console.log('GEMINI_API_KEY not set — skipping vision leg');
      return;
    }
    const fullPdf = readFileSync('test/extraction/lantana-home/lantana-home-rpa.pdf');
    const splitter = new PdfSplitter();
    const { pageBuffers } = await splitter.split(fullPdf);
    const cache = new RenderedPageCache({ dpi: 200 });

    for (const physicalPage of FOOTER_PHYSICAL_PAGES) {
      const verification = await detectFooterInitialsWithVision(pageBuffers[physicalPage - 1], cache, apiKey);
      expect(verification, `page ${physicalPage}: slots should be located`).not.toBeNull();

      for (const slotKey of SLOTS) {
        const pixel = verification!.pixel[slotKey];
        const gemini = verification!.gemini?.[slotKey];
        const verdict = resolveFooterInitialVerdict(pixel, gemini);
        console.log(
          `P${physicalPage} ${slotKey}: pixel=${pixel?.initialsPresent ?? 'n/a'} ` +
          `gemini=${gemini ?? 'n/a'} => ${verdict}`,
        );
        expect(verdict, `page ${physicalPage} ${slotKey} should be present`).toBe('present');
      }
    }
  }, 120000);
});
