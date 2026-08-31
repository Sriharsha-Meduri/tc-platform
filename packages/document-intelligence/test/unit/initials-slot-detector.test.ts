import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { PdfSplitter } from '../../src/splitter/pdf-splitter';
import { detectFooterInitialSlots } from '../../src/vision/initials-slot-detector';
import { RenderedPageCache } from '../../src/page-converter/rendered-page-cache';

/**
 * Regression test for the real false-negative reported against
 * lantana-home-rpa.pdf: the LLM repeatedly reported Buyer/Seller slot 2 on
 * the standard footer as blank even though a direct pixel decode of the
 * PDF's own embedded ink stamps proves real ink is there in all four slots
 * on every footer page. This locks in the deterministic pixel-analysis
 * fallback so that false-negative class of bug can't silently regress.
 *
 * Physical pages (1-indexed) known to carry the standard footer in this
 * fixture, established by direct inspection of the PDF's embedded images.
 */
const FOOTER_PHYSICAL_PAGES = [3, 6, 9, 10, 11, 12, 13, 14];

describe('detectFooterInitialSlots (real lantana-home-rpa.pdf)', () => {
  it('finds real ink in all four footer slots on every known footer page', async () => {
    const fullPdf = readFileSync('test/extraction/lantana-home/lantana-home-rpa.pdf');
    const splitter = new PdfSplitter();
    const { pageBuffers } = await splitter.split(fullPdf);
    const cache = new RenderedPageCache({ dpi: 200 });

    for (const physicalPage of FOOTER_PHYSICAL_PAGES) {
      const pageBuffer = pageBuffers[physicalPage - 1];
      const detection = await detectFooterInitialSlots(pageBuffer, cache);
      expect(detection, `page ${physicalPage}: pixel geometry should be found`).not.toBeNull();

      for (const slotKey of ['buyerSlot1', 'buyerSlot2', 'sellerSlot1', 'sellerSlot2'] as const) {
        const slot = detection![slotKey];
        expect(slot, `page ${physicalPage} ${slotKey}: should be analyzable`).not.toBeNull();
        expect(slot!.initialsPresent, `page ${physicalPage} ${slotKey}: should detect real ink`).toBe(true);
        expect(slot!.largestComponentArea).toBeGreaterThan(0);
      }
    }
  }, 60000);

  it('returns null for a page with no footer-initials text layer to anchor off of', async () => {
    const fullPdf = readFileSync('test/extraction/lantana-home/lantana-home-rpa.pdf');
    const splitter = new PdfSplitter();
    const { pageBuffers } = await splitter.split(fullPdf);
    // Physical page 1 is the AD (agency disclosure) cover page — no
    // "Buyer's Initials / Seller's Initials" footer line at all.
    const cache = new RenderedPageCache({ dpi: 200 });
    const detection = await detectFooterInitialSlots(pageBuffers[0], cache);
    expect(detection).toBeNull();
  }, 30000);
});
