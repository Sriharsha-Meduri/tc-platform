import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { PdfSplitter } from '../../../src/splitter/pdf-splitter';
import { FormIdentifier } from '../../../src/identifier/form-identifier';
import type { PageClassification } from '../../../src/identifier/identifier.types';

/**
 * Regression for the RPA -> BCO misclassification bug: an RPA page's own
 * acceptance/escrow paragraph references attached counter-offer forms using
 * the same "C.A.R. Form X, Revised Y" phrasing the page's own header would
 * use (see physical page 17 of this fixture, whose body reads "...Seller
 * Counter Offer (C.A.R. Form SCO or SMCO) Back-Up Offer Ad[dendum]..."). The
 * page's own printed footer must remain authoritative regardless, and no
 * Gemini call should ever be made for these pages — the deterministic text
 * path resolves every one of them from embedded PDF text alone.
 */
describe('lantana-home-rpa.pdf classification', () => {
  it('classifies every logical RPA page as RPA with correct logical page numbers, using only deterministic text matching (no Gemini)', async () => {
    const pdf = readFileSync('test/extraction/lantana-home/lantana-home-rpa.pdf');
    const { pageBuffers } = await new PdfSplitter().split(pdf);
    expect(pageBuffers.length).toBe(25);

    // Non-RPA disclosure pages (AD/FHDA/BHIA/WFA/BIA) have no deterministic
    // match for RPA/SCO/SMCO/BCO and would fall to a live Gemini call. Stub
    // that fallback so this test runs deterministically and without an API
    // key — its result is irrelevant here, which only asserts on the RPA
    // pages and the absence of any BCO classification, and that Gemini is
    // never invoked for the RPA pages themselves.
    let geminiCallCount = 0;
    const stubFallback = async (_buf: Buffer, pageIndex: number): Promise<PageClassification> => {
      geminiCallCount++;
      return { pageIndex, formCodes: ['UNKNOWN'], pageNumber: null, totalPages: null, confidence: 0, source: 'unknown', evidence: [] };
    };

    const identifier = new FormIdentifier({ apiKey: 'test-key', classifyFallback: stubFallback });
    const classifications = await identifier.classifyPages(pageBuffers);

    expect(classifications).toHaveLength(25);

    // No page anywhere in this real RPA+disclosures package should ever be
    // classified as BCO — the fixture contains no BCO form at all.
    for (const c of classifications) {
      expect(c.formCodes).not.toContain('BCO');
    }

    // Physical pages 2..18 are logical RPA pages 1..17, sourced from each
    // page's own printed text (deterministic — no Gemini fallback invoked).
    for (let logicalPage = 1; logicalPage <= 17; logicalPage++) {
      const physicalIndex = logicalPage + 1;
      const c = classifications[physicalIndex];
      expect(c.formCodes).toEqual(['RPA']);
      expect(c.pageNumber).toBe(logicalPage);
      expect(c.totalPages).toBe(17);
      expect(c.formName).toBe('California Residential Purchase Agreement and Joint Escrow Instructions');
      // Every page in this real fixture carries the full title immediately
      // followed by "(RPA PAGE N OF 17)" — the highest-priority tier, which
      // (per the exact spec'd regex) does not itself capture a revision.
      expect(c.source).toBe('title_footer');
    }

    // The Gemini fallback must never fire for the RPA pages — only (at most)
    // for the non-RPA disclosure pages that this test isn't asserting on.
    expect(geminiCallCount).toBeLessThanOrEqual(25 - 17);

    // Grouping must produce a contiguous 17-page RPA group — no RPA pages
    // should be split off into (or merged with) a BCO group.
    const groups = identifier.groupByFormCode(classifications);
    const rpaGroups = groups.filter((g) => g.formCode === 'RPA');
    expect(rpaGroups).toHaveLength(1);
    expect(rpaGroups[0].pageIndices).toEqual(Array.from({ length: 17 }, (_, i) => i + 2));
    expect(groups.some((g) => g.formCode === 'BCO')).toBe(false);
  });
});
