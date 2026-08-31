import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { classifyFromPrintedText, AVID_KNOWN_REVISION } from '../../src/identifier/form-identifier';

/**
 * Extracts each page's own embedded text layer from a real PDF, the same
 * way FormIdentifier's private extractPageText() does internally — used
 * here to feed classifyFromPrintedText() with real page text rather than
 * a hand-written string, for the regression test below.
 */
async function extractPageTexts(pdfPath: string): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const bytes = readFileSync(pdfPath);
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise;
  try {
    const texts: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const text = (content.items as Array<{ str?: string }>)
        .map((item) => item.str ?? '')
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      texts.push(text);
    }
    return texts;
  } finally {
    await doc.destroy().catch(() => {});
  }
}

describe('classifyFromPrintedText — AVID', () => {
  it('identifies AVID from the full title immediately followed by its own page-count footer', () => {
    const result = classifyFromPrintedText(
      `AGENT VISUAL INSPECTION DISCLOSURE (AVID PAGE 1 OF 3) AGENT VISUAL INSPECTION DISCLOSURE ` +
        `(CALIFORNIA CIVIL CODE § 2079 ET SEQ.) (C.A.R. Form AVID, Revised ${AVID_KNOWN_REVISION})`,
    );
    expect(result?.formCode).toBe('AVID');
    expect(result?.formName).toBe('Agent Visual Inspection Disclosure');
    expect(result?.pageNumber).toBe(1);
    expect(result?.totalPages).toBe(3);
    expect(result?.source).toBe('title_footer');
  });

  it('identifies AVID from the short form-code revision footer (real-world zipForm style)', () => {
    const result = classifyFromPrintedText(`Some body text. AVID REVISED ${AVID_KNOWN_REVISION} (PAGE 2 OF 3)`);
    expect(result?.formCode).toBe('AVID');
    expect(result?.formRevision).toBe(AVID_KNOWN_REVISION);
    expect(result?.pageNumber).toBe(2);
    expect(result?.totalPages).toBe(3);
    expect(result?.source).toBe('revision_footer');
  });

  it('identifies AVID from the C.A.R. header identifier when no footer is present', () => {
    const result = classifyFromPrintedText(`Some heading. (C.A.R. Form AVID, Revised ${AVID_KNOWN_REVISION}) more body text.`);
    expect(result?.formCode).toBe('AVID');
    expect(result?.formRevision).toBe(AVID_KNOWN_REVISION);
    expect(result?.source).toBe('header');
  });

  it('identifies a future AVID revision (e.g. 6/26) exactly the same way — the revision is never hardcoded', () => {
    const result = classifyFromPrintedText('AGENT VISUAL INSPECTION DISCLOSURE (AVID PAGE 1 OF 3). AVID REVISED 6/26 (PAGE 1 OF 3)');
    expect(result?.formCode).toBe('AVID');
    expect(result?.formRevision).toBeNull(); // title_footer tier wins first and doesn't capture a revision
  });

  it('classifies an RPA page as RPA, never AVID, even when its body references "Agent Visual Inspection Disclosure (AVID)" by name', () => {
    const result = classifyFromPrintedText(
      'Buyer has received a copy of the Agent Visual Inspection Disclosure (AVID) (C.A.R. Form AVID). ' +
        'RPA REVISED 6/26 (PAGE 16 OF 17)',
    );
    expect(result?.formCode).toBe('RPA');
    expect(result?.formCode).not.toBe('AVID');
  });

  it('returns null (UNKNOWN, falls back to Gemini) for a page mentioning AVID with no anchoring title/footer/header of its own', () => {
    // A different form's checklist line that merely lists "AVID" as an
    // attached/referenced form, with no AVID title, footer, or C.A.R. header
    // citation actually printed on THIS page.
    expect(classifyFromPrintedText('Attached forms: TDS, SPQ, AVID, NHD.')).toBeNull();
  });

  it('never misclassifies a TDS page as AVID from its own "Agent\'s Inspection Disclosure" checkbox referencing AVID by full name', () => {
    // Real C.A.R. TDS boilerplate (Section II, "Agent's Inspection
    // Disclosure") literally reads this checkbox line, which — unlike the
    // bare "AVID" abbreviation above — spells out AVID's full bare title and
    // used to satisfy Tier 4 unconditionally, misclassifying the whole TDS
    // page as a standalone AVID document (and stealing it out of the TDS
    // extraction, silently dropping any SPQ/TDS content on that page).
    const result = classifyFromPrintedText(
      'THE UNDERSIGNED, BASED ON A REASONABLY COMPETENT AND DILIGENT VISUAL INSPECTION OF THE ACCESSIBLE AREAS '
        + 'OF THE PROPERTY IN CONJUNCTION WITH THAT LISTING OR SALE, STATES THE FOLLOWING: '
        + '☐ See attached Agent Visual Inspection Disclosure (AVID Form) '
        + 'REAL ESTATE TRANSFER DISCLOSURE STATEMENT (C.A.R. Form TDS, Revised 6/26)',
    );
    expect(result?.formCode).not.toBe('AVID');
  });

  it('rejects a bare-title match for any form whose title is preceded by reference/attachment phrasing, not just AVID', () => {
    expect(classifyFromPrintedText('Buyer to receive a copy of the Buyer Counter Offer.')?.formCode).not.toBe('BCO');
    expect(classifyFromPrintedText('See attached Seller Counter Offer for terms.')?.formCode).not.toBe('SCO');
  });

  it('still bare-title-matches a genuine AVID title that is NOT preceded by reference phrasing', () => {
    const result = classifyFromPrintedText('AGENT VISUAL INSPECTION DISCLOSURE');
    expect(result?.formCode).toBe('AVID');
    expect(result?.source).toBe('title');
  });
});

describe('classifyFromPrintedText — AVID real-PDF regression', () => {
  it('identifies all 3 pages of a real AVID PDF as AVID', async () => {
    const pdfPath = join(__dirname, '../extraction/somerset-home/AVID-SA-FE_3847.pdf');
    const pageTexts = await extractPageTexts(pdfPath);
    expect(pageTexts).toHaveLength(3);

    const results = pageTexts.map((text) => classifyFromPrintedText(text));

    results.forEach((result, i) => {
      expect(result, `page ${i + 1} should be identified as AVID`).not.toBeNull();
      expect(result?.formCode).toBe('AVID');
      expect(result?.pageNumber).toBe(i + 1);
      expect(result?.totalPages).toBe(3);
    });

    // Page 1 carries the full title + its own page-count footer — the
    // strongest tier.
    expect(results[0]?.source).toBe('title_footer');
  });
});
