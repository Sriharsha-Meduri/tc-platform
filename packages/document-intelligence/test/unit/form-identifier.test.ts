import { describe, it, expect } from 'vitest';
import { FormIdentifier, classifyFromPrintedText } from '../../src/identifier/form-identifier';
import type { PageClassification } from '../../src/identifier/identifier.types';

function page(
  pageIndex: number,
  formCode: string,
  overrides: Partial<PageClassification> = {},
): PageClassification {
  return {
    pageIndex,
    formCodes: [formCode],
    pageNumber: pageIndex + 1,
    totalPages: null,
    confidence: 0.9,
    ...overrides,
  };
}

describe('FormIdentifier.groupByFormCode', () => {
  const identifier = new FormIdentifier({ apiKey: 'test-key' });

  it('groups a consistent 17-page RPA into a single RPA group', () => {
    const classifications = Array.from({ length: 17 }, (_, i) =>
      page(i, 'RPA', { totalPages: 17 }),
    );
    const groups = identifier.groupByFormCode(classifications);
    expect(groups).toHaveLength(1);
    expect(groups[0].formCode).toBe('RPA');
    expect(groups[0].pageIndices).toEqual(Array.from({ length: 17 }, (_, i) => i));
  });

  it('smooths an isolated BCO misread sandwiched inside a long RPA run back to RPA', () => {
    // Pages 0-9 correctly read RPA, page 10 misread as BCO (a router error),
    // pages 11-16 correctly read RPA again. This mirrors the real bug: a
    // single-page misclassification should not fragment or hijack the
    // document into a bogus counter-offer group.
    const classifications: PageClassification[] = [
      ...Array.from({ length: 10 }, (_, i) => page(i, 'RPA', { totalPages: 17 })),
      page(10, 'BCO', { totalPages: 17 }),
      ...Array.from({ length: 6 }, (_, i) => page(11 + i, 'RPA', { totalPages: 17 })),
    ];
    const groups = identifier.groupByFormCode(classifications);
    expect(groups).toHaveLength(1);
    expect(groups[0].formCode).toBe('RPA');
    expect(groups[0].pageIndices).toHaveLength(17);
    expect(groups[0].pageIndices).toContain(10);
  });

  it('smooths a leading BCO misread using the implausible totalPages signal, even without a left neighbor', () => {
    // Page 0 misread as BCO but reports totalPages=17 (impossible for a real
    // 1-2 page BCO) while pages 1-16 correctly read RPA. There's no run
    // before page 0, so only the totalPages signal can catch this.
    const classifications: PageClassification[] = [
      page(0, 'BCO', { totalPages: 17 }),
      ...Array.from({ length: 16 }, (_, i) => page(1 + i, 'RPA', { totalPages: 17 })),
    ];
    const groups = identifier.groupByFormCode(classifications);
    expect(groups).toHaveLength(1);
    expect(groups[0].formCode).toBe('RPA');
    expect(groups[0].pageIndices).toContain(0);
  });

  it('does not alter a genuine standalone 1-page BCO document', () => {
    const classifications: PageClassification[] = [page(0, 'BCO', { totalPages: 1 })];
    const groups = identifier.groupByFormCode(classifications);
    expect(groups).toHaveLength(1);
    expect(groups[0].formCode).toBe('BCO');
  });

  it('does not smooth a long counter-offer-family run (e.g. a real multi-page SMCO) even next to an RPA', () => {
    // The interrupting run must be SHORT (<=2 pages) to be considered a
    // misread; a 3+ page counter-offer run is left as-is.
    const classifications: PageClassification[] = [
      ...Array.from({ length: 5 }, (_, i) => page(i, 'RPA', { totalPages: 17 })),
      page(5, 'SMCO', { totalPages: 3 }),
      page(6, 'SMCO', { totalPages: 3 }),
      page(7, 'SMCO', { totalPages: 3 }),
    ];
    const groups = identifier.groupByFormCode(classifications);
    const codes = groups.map((g) => g.formCode).sort();
    expect(codes).toEqual(['RPA', 'SMCO']);
  });

  it('still votes for the majority code within a genuine counter-offer family group', () => {
    const classifications: PageClassification[] = [
      page(0, 'SCO', { totalPages: 2 }),
      page(1, 'SCO', { totalPages: 2 }),
      page(2, 'BCO', { totalPages: 2 }),
    ];
    const groups = identifier.groupByFormCode(classifications);
    expect(groups).toHaveLength(1);
    expect(groups[0].formCode).toBe('SCO');
  });

  it('does not smooth two agreeing short neighbor runs that are themselves short (no plausible long document)', () => {
    // prev and next runs both length 2 (< MIN_LONG_RUN) — should not smooth
    // via the sandwich rule, and totalPages is plausible for BCO, so it
    // should also not smooth via the totalPages rule. The BCO run stays.
    const classifications: PageClassification[] = [
      page(0, 'RPA', { totalPages: 2 }),
      page(1, 'RPA', { totalPages: 2 }),
      page(2, 'BCO', { totalPages: 2 }),
      page(3, 'RPA', { totalPages: 2 }),
      page(4, 'RPA', { totalPages: 2 }),
    ];
    const groups = identifier.groupByFormCode(classifications);
    const bcoGroup = groups.find((g) => g.formCode === 'BCO' || g.formCode === 'COUNTER_OFFER');
    expect(bcoGroup).toBeDefined();
    expect(bcoGroup?.pageIndices).toEqual([2]);
  });

  it('never smooths a deterministically-sourced page, even when sandwiched by long agreeing runs', () => {
    // Regression: only Gemini/unknown-sourced pages may ever be reassigned.
    // A page identified from its own printed title/header/footer (source
    // 'title_footer', 'title', 'header', or 'revision_footer') is
    // authoritative and must never be overwritten by the smoothing pass,
    // even if it looks exactly like the isolated-misread shape the
    // smoothing pass is designed to correct.
    const classifications: PageClassification[] = [
      ...Array.from({ length: 5 }, (_, i) => page(i, 'RPA', { totalPages: 17, source: 'revision_footer' })),
      page(5, 'BCO', { totalPages: 17, source: 'revision_footer' }),
      ...Array.from({ length: 5 }, (_, i) => page(6 + i, 'RPA', { totalPages: 17, source: 'revision_footer' })),
    ];
    const groups = identifier.groupByFormCode(classifications);
    // Grouping is by normalized code (not physical sequence), so the two RPA
    // runs land in one group and the untouched BCO page in its own — the
    // key assertion is that page 5 stays BCO and is never folded into RPA.
    const bcoGroup = groups.find((g) => g.formCode === 'BCO');
    const rpaGroup = groups.find((g) => g.formCode === 'RPA');
    expect(bcoGroup?.pageIndices).toEqual([5]);
    expect(rpaGroup?.pageIndices).toEqual([0, 1, 2, 3, 4, 6, 7, 8, 9, 10]);
  });
});

describe('classifyFromPrintedText', () => {
  it('identifies RPA from the full title immediately followed by its own page-count footer', () => {
    const result = classifyFromPrintedText(
      'CALIFORNIA RESIDENTIAL PURCHASE AGREEMENT\nAND JOINT ESCROW INSTRUCTIONS\n(RPA PAGE 5 OF 17)',
    );
    expect(result?.formCode).toBe('RPA');
    expect(result?.formName).toBe('California Residential Purchase Agreement and Joint Escrow Instructions');
    expect(result?.pageNumber).toBe(5);
    expect(result?.totalPages).toBe(17);
    expect(result?.source).toBe('title_footer');
  });

  it('identifies RPA from the short form-code revision footer (real-world zipForm style)', () => {
    const result = classifyFromPrintedText('Some body text. RPA REVISED 6/26 (PAGE 16 OF 17)');
    expect(result?.formCode).toBe('RPA');
    expect(result?.formRevision).toBe('6/26');
    expect(result?.pageNumber).toBe(16);
    expect(result?.totalPages).toBe(17);
    expect(result?.source).toBe('revision_footer');
  });

  it('identifies RPA from the C.A.R. header identifier when no footer is present', () => {
    const result = classifyFromPrintedText('Some heading. (C.A.R. Form RPA, Revised 6/26) more body text.');
    expect(result?.formCode).toBe('RPA');
    expect(result?.formRevision).toBe('6/26');
    expect(result?.source).toBe('header');
  });

  it('classifies an RPA page as RPA even when its body mentions "Buyer Counter Offer (C.A.R. Form BCO)"', () => {
    // The exact scenario reported: an RPA page's Other Terms / acceptance
    // section references an attached Buyer Counter Offer by name and by
    // C.A.R. form code, but THIS page's own title/footer says RPA.
    const result = classifyFromPrintedText(
      "Seller's acceptance is subject to the attached Buyer Counter Offer (C.A.R. Form BCO). " +
        'RPA REVISED 6/26 (PAGE 16 OF 17)',
    );
    expect(result?.formCode).toBe('RPA');
    expect(result?.pageNumber).toBe(16);
  });

  it('classifies an RPA page as RPA even when its body mentions Seller Counter Offer / SMCO by full title', () => {
    const result = classifyFromPrintedText(
      "Seller's acceptance is subject to the attached Counter Offer. " +
        'Seller Counter Offer (C.A.R. Form SCO or SMCO) Back-Up Offer Addendum. ' +
        'RPA REVISED 6/26 (PAGE 16 OF 17)',
    );
    expect(result?.formCode).toBe('RPA');
  });

  it('classifies an RPA page as RPA even when the body fully cites a Buyer Counter Offer with its own revision date', () => {
    // A body reference formatted exactly like a real header/footer citation
    // (including its own "Revised M/YY") must still never outrank the
    // page's own footer.
    const result = classifyFromPrintedText(
      "Buyer's offer is countered per the attached Buyer Counter Offer (C.A.R. Form BCO, Revised 6/26). " +
        'RPA REVISED 6/26 (PAGE 16 OF 17)',
    );
    expect(result?.formCode).toBe('RPA');
    expect(result?.pageNumber).toBe(16);
  });

  it('identifies a Seller Counter Offer from its title and footer', () => {
    const titleFooter = classifyFromPrintedText('SELLER COUNTER OFFER (SCO PAGE 1 OF 2)');
    expect(titleFooter?.formCode).toBe('SCO');
    expect(titleFooter?.pageNumber).toBe(1);
    expect(titleFooter?.totalPages).toBe(2);

    const revisionFooter = classifyFromPrintedText('5. ACCEPTANCE. SCO REVISED 6/26 (PAGE 2 OF 2)');
    expect(revisionFooter?.formCode).toBe('SCO');
    expect(revisionFooter?.pageNumber).toBe(2);
  });

  it('identifies a Seller Multiple Counter Offer and does not confuse it with SCO', () => {
    const result = classifyFromPrintedText('SELLER MULTIPLE COUNTER OFFER (SMCO PAGE 1 OF 2)');
    expect(result?.formCode).toBe('SMCO');
    expect(result?.formCode).not.toBe('SCO');
  });

  it('identifies a Buyer Counter Offer from its title and revision footer', () => {
    const title = classifyFromPrintedText('BUYER COUNTER OFFER');
    expect(title?.formCode).toBe('BCO');

    const revisionFooter = classifyFromPrintedText('Some terms. BCO REVISED 6/26 (PAGE 1 OF 1)');
    expect(revisionFooter?.formCode).toBe('BCO');
    expect(revisionFooter?.pageNumber).toBe(1);
  });

  it('keeps a genuine BCO page BCO even when its body references the underlying Purchase Agreement', () => {
    const result = classifyFromPrintedText(
      'This Buyer Counter Offer amends the Purchase Agreement as follows. BCO REVISED 6/26 (PAGE 1 OF 1)',
    );
    expect(result?.formCode).toBe('BCO');
  });

  it('keeps a genuine BCO page BCO even when its own Acceptance paragraph checkbox mentions SCO/SMCO by full name (real C.A.R. BCO boilerplate)', () => {
    // Real BCO form body text (paragraph 4, ACCEPTANCE) literally reads:
    // "...SUBJECT TO THE ATTACHED SELLER COUNTER OFFER No. OR SELLER
    // MULTIPLE COUNTER OFFER No. ...". Before the tier-first fix, SMCO's
    // weak bare-title tier matched this body checkbox before BCO's own much
    // stronger footer was ever tried, misclassifying the page as SMCO.
    const result = classifyFromPrintedText(
      'BUYER COUNTER OFFER No. (C.A.R. Form BCO, Revised 12/25) '
        + '4. ACCEPTANCE: I/WE accept the above Buyer Counter Offer and all Signed Addenda, if any, '
        + '(If checked SUBJECT TO THE ATTACHED SELLER COUNTER OFFER No. OR SELLER MULTIPLE COUNTER OFFER No. ), '
        + 'and acknowledge receipt of a Copy. '
        + 'BCO REVISED 12/25 (PAGE 1 OF 1) BUYER COUNTER OFFER (BCO PAGE 1 OF 1)',
    );
    expect(result?.formCode).toBe('BCO');
    expect(result?.formCode).not.toBe('SMCO');
    expect(result?.source).toBe('title_footer');
  });

  it('symmetrically keeps a genuine SCO page SCO even when its body mentions Buyer Counter Offer', () => {
    const result = classifyFromPrintedText(
      'This is a counter offer to the Buyer Counter Offer No. , OR Buyer Multiple Counter Offer No. , Other. '
        + 'SCO REVISED 12/25 (PAGE 1 OF 1) SELLER COUNTER OFFER (SCO PAGE 1 OF 1)',
    );
    expect(result?.formCode).toBe('SCO');
    expect(result?.formCode).not.toBe('BCO');
  });

  it('returns null (UNKNOWN, falls back to Gemini) when the text matches none of RPA/SCO/SMCO/BCO', () => {
    expect(classifyFromPrintedText('DISCLOSURE REGARDING REAL ESTATE AGENCY RELATIONSHIP')).toBeNull();
    expect(classifyFromPrintedText('')).toBeNull();
    expect(classifyFromPrintedText('lorem ipsum dolor sit amet')).toBeNull();
  });
});
