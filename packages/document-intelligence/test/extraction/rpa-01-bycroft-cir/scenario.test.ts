import { describe, it, expect } from 'vitest';
import { describeScenario, assertSnap } from '../../helpers/scenario';

const SCENARIO_DIR = __dirname;

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO: rpa-01-bycroft-cir
//
// Single fully-executed RPA (17 pages, all-cash, Yorba Linda).
// No companion forms — used to iterate on the RPA schema and prompt.
//
// HOW TO ITERATE ON THE RPA SCHEMA:
//   1. Edit src/extractor/forms/rpa/rpa.standard.v12-23.ts
//   2. Delete extractions/rpa.standard.snap.json
//   3. Run: pnpm exec vitest run test/scenarios/rpa-01-bycroft-cir
//   4. Review SET 1 (identification) and SET 2 (extraction) results in console
//   5. Fix assertions or schema until both pass
//   6. Save printed JSON as rpa.standard.snap.json to lock cost at zero
// ─────────────────────────────────────────────────────────────────────────────

describeScenario(SCENARIO_DIR, {
  stage: 'CONTRACT',

  extraction: {
    pdfFiles: ['RPA-FE_pdfaa05.pdf'],

    // ── SET 1: Form identification ──────────────────────────────────────────
    // Fires every time the pipeline runs — even when snaps are present.
    // Gemini reads each page and returns the CAR form code and page grouping.
    // Assert that the right forms were detected and page boundaries are correct.
    assertIdentification(formGroups) {
      // This PDF contains only RPA pages — expect exactly one form group
      const rpa = formGroups.find((g) => g.formCode === 'RPA');
      expect(rpa, 'Gemini must identify RPA in this PDF').toBeDefined();

      // Gemini classifies blank/separator pages as UNKNOWN — threshold accounts
      // for up to 4 unreadable pages in this 17-page PDF.
      expect(rpa!.pageIndices.length).toBeGreaterThanOrEqual(12);

      // No unexpected form codes (anything that is not RPA or UNKNOWN is suspicious)
      const unexpected = formGroups.filter(
        (g) => g.formCode !== 'RPA' && g.formCode !== 'UNKNOWN',
      );
      expect(unexpected, 'No unexpected form codes should appear in an RPA-only PDF').toHaveLength(0);
    },

    // ── SET 2: JSON field and value extraction ──────────────────────────────
    // Fires ONLY when the LLM runs — i.e. when no snap exists.
    // Delete rpa.standard.snap.json to trigger this on the next run.
    // Assert that schema changes produce the correct structured output.
    assertExtraction(forms) {
      const rpa = forms.find((f) => f.formCode === 'RPA');
      expect(rpa, 'RPA must be present in extraction output').toBeDefined();

      // ── Header: form footer fields (universal across all CAR forms) ──
      const header = rpa!.data.header as Record<string, unknown>;
      expect(header.form_code, 'form_code from page footer').toBe('RPA');
      expect(header.form_version, 'form_version from page footer').toBe('Revised 12/25');

      // ── Section 1 Offer: Property details ──
      const section1Offer = rpa!.data.section_1_offer as Record<string, unknown>;
      const property = section1Offer.B_property as Record<string, unknown>;
      expect(property.street_address).toContain('Bycroft');
      expect(property.city).toBe('Yorba Linda');
      expect(property.county).toBe('Orange');

      // ── Buyer names ──
      const offerFrom = section1Offer.A_offer_from as Record<string, unknown>;
      expect(offerFrom.buyer_names as string[]).toContain('Pam Vovos');

      // ── Section 3 Terms ──
      const section3Page1 = rpa!.data.section_3_terms_and_allocation_of_costs_page_1 as Record<string, unknown>;
      const purchasePrice = section3Page1.A_purchase_price as Record<string, unknown>;
      expect(purchasePrice.purchase_price).toBe(1539900);
      expect(purchasePrice.all_cash_checked).toBe(true);

      const closeOfEscrow = section3Page1.B_close_of_escrow as Record<string, unknown>;
      expect(closeOfEscrow.days_after_acceptance).toBe(21);

      // ── Section 2 Agency ──
      const section2Agency = rpa!.data.section_2_agency as Record<string, unknown>;
      const confirmation = section2Agency.B_confirmation as Record<string, unknown>;
      expect(confirmation.seller_agent).toBe('Ashok Patil');
      expect(confirmation.buyer_agent).toBe('Andrea Kaesbauer');

      // ── Acceptance ──
      const acceptance = rpa!.data.seller_acceptance as Record<string, unknown>;
      expect(acceptance.accepted_subject_to_counter_offer).toBe(false);
    },
  },

});

// ─────────────────────────────────────────────────────────────────────────────
// SNAP ASSERTIONS — run free on every test run, no LLM required.
// These load extractions/rpa.standard.snap.json and validate structure + data.
// They act as regression tests: if the snap is deleted they fail immediately
// with a clear message telling the engineer to run extraction first.
// ─────────────────────────────────────────────────────────────────────────────

describe('rpa-01 snap assertions', () => {
  it('header contains form_code and form_version from page footer', () => {
    const rpa = assertSnap(SCENARIO_DIR, 'RPA');
    const header = rpa.header as Record<string, unknown>;
    expect(header.form_code).toBe('RPA');
    expect(header.form_version).toBe('Revised 12/25');
  });

  it('header contains correct property details', () => {
    const rpa = assertSnap(SCENARIO_DIR, 'RPA');
    const section1Offer = rpa.section_1_offer as Record<string, unknown>;
    const property = section1Offer.B_property as Record<string, unknown>;
    expect(property.street_address).toContain('Bycroft');
    expect(property.city).toBe('Yorba Linda');
    expect(property.county).toBe('Orange');
  });

  it('purchase price and financing type are correct', () => {
    const rpa = assertSnap(SCENARIO_DIR, 'RPA');
    const section3Page1 = rpa.section_3_terms_and_allocation_of_costs_page_1 as Record<string, unknown>;
    const purchasePrice = section3Page1.A_purchase_price as Record<string, unknown>;
    expect(purchasePrice.purchase_price).toBe(1539900);
    expect(purchasePrice.all_cash_checked).toBe(true);

    const closeOfEscrow = section3Page1.B_close_of_escrow as Record<string, unknown>;
    expect(closeOfEscrow.days_after_acceptance).toBe(21);
  });

  it('buyer is identified', () => {
    const rpa = assertSnap(SCENARIO_DIR, 'RPA');
    const section1Offer = rpa.section_1_offer as Record<string, unknown>;
    const offerFrom = section1Offer.A_offer_from as Record<string, unknown>;
    expect(offerFrom.buyer_names as string[]).toContain('Pam Vovos');
  });

  it('listing and buyer agents are identified', () => {
    const rpa = assertSnap(SCENARIO_DIR, 'RPA');
    const section2Agency = rpa.section_2_agency as Record<string, unknown>;
    const confirmation = section2Agency.B_confirmation as Record<string, unknown>;
    expect(confirmation.seller_agent).toBe('Ashok Patil');
    expect(confirmation.seller_brokerage_firm).toBe('Blue Lotus Realty');
    expect(confirmation.buyer_agent).toBe('Andrea Kaesbauer');
    expect(confirmation.buyer_brokerage_firm).toContain('Keller Williams');
  });

  it('contract accepted without counter offer', () => {
    const rpa = assertSnap(SCENARIO_DIR, 'RPA');
    const acceptance = rpa.seller_acceptance as Record<string, unknown>;
    expect(acceptance.accepted_subject_to_counter_offer).toBe(false);
    expect(acceptance.seller_signature_date).toBe('2026-01-28');
    expect(acceptance.buyer_signature_date).toBe('2026-01-27');
  });
});
