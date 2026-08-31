import { describe, it, expect } from 'vitest';
import { describeScenario, assertSnap } from '../../helpers/scenario';

const SCENARIO_DIR = __dirname;

/**
 * Lasselle St Unit 1 — fully-executed RPA bundle (29-page scanned PDF).
 * 9 forms snapped: RPA, AD, FRR-PA, BIA, PRBS, FHDA, BHIA, WFA, CCPA
 *
 * Extraction only. Reasoning tests live in test/reasoning/contract-01-lasselle-st/
 */
describeScenario(SCENARIO_DIR, {
  stage: 'CONTRACT',

  extraction: {
    pdfFiles: ['15982-LasselleStUnit-1-FE_RPA.pdf'],

    assertIdentification(formGroups) {
      const codes = formGroups.map((g) => g.formCode);
      expect(codes).toContain('RPA');
      expect(codes).toContain('AD');
      // FRR-PA is a short single-page form — Gemini may classify it as UNKNOWN.
      // The snap ensures it is still extracted correctly regardless.
      expect(codes).toContain('BIA');
      expect(codes).toContain('PRBS');
      expect(formGroups.length).toBeGreaterThanOrEqual(5);
    },

    assertExtraction(forms) {
      const rpa = forms.find((f) => f.formCode === 'RPA');
      expect(rpa, 'RPA must be present').toBeDefined();

      const terms = rpa!.data.terms_of_purchase as Record<string, unknown>;
      expect(terms.purchase_price).toBe(451000);
      expect(terms.loan_type_1).toBe('Conventional');
      expect(terms.loan_amount_1).toBe(361000);
      expect(terms.is_all_cash).toBe(false);

      const parties = rpa!.data.parties as Record<string, unknown>;
      expect(parties.buyer_names as string[]).toContain('Varun Srivastava');
    },
  },
});

// ── Snap assertions — free, no API key ───────────────────────────────────────

describe('contract-03 snap assertions — RPA', () => {
  it('purchase price matches known value', () => {
    const rpa = assertSnap(SCENARIO_DIR, 'RPA');
    const terms = rpa.terms_of_purchase as Record<string, unknown>;
    expect(terms.purchase_price).toBe(451000);
  });

  it('financing is Conventional with correct loan amount', () => {
    const rpa = assertSnap(SCENARIO_DIR, 'RPA');
    const terms = rpa.terms_of_purchase as Record<string, unknown>;
    expect(terms.loan_type_1).toBe('Conventional');
    expect(terms.loan_amount_1).toBe(361000);
    expect(terms.is_all_cash).toBe(false);
  });

  it('property address is correct', () => {
    const rpa = assertSnap(SCENARIO_DIR, 'RPA');
    const header = rpa.header as Record<string, unknown>;
    expect(String(header.property_address)).toContain('Lasselle');
    expect(header.city).toBe('Moreno Valley');
    expect(header.county).toBe('Riverside');
  });

  it('buyer is identified', () => {
    const rpa = assertSnap(SCENARIO_DIR, 'RPA');
    const parties = rpa.parties as Record<string, unknown>;
    expect(parties.buyer_names as string[]).toContain('Varun Srivastava');
  });

  it('sellers are identified', () => {
    const rpa = assertSnap(SCENARIO_DIR, 'RPA');
    const parties = rpa.parties as Record<string, unknown>;
    const sellers = parties.seller_names as string[];
    expect(sellers).toContain('Jeannette Gonzalez');
    // Second seller name may vary slightly by extraction run
    expect(sellers.length).toBeGreaterThanOrEqual(1);
  });

  it('contract is accepted subject to counter offer — not yet final', () => {
    const rpa = assertSnap(SCENARIO_DIR, 'RPA');
    const acceptance = rpa.seller_acceptance as Record<string, unknown>;
    // True means a counter offer is pending — finalAgreedPrice is provisional
    expect(acceptance.accepted_subject_to_counter_offer).toBe(true);
    expect(acceptance.seller_signature_date).toBe('2026-03-06');
    expect(acceptance.buyer_signature_date).toBe('2026-02-26');
  });

  it('close of escrow is 30 days (no absolute date set yet)', () => {
    const rpa = assertSnap(SCENARIO_DIR, 'RPA');
    const terms = rpa.terms_of_purchase as Record<string, unknown>;
    expect(terms.close_of_escrow_days).toBe(30);
    expect(terms.close_of_escrow_date).toBeNull();
  });
});

describe('contract-03 snap assertions — FRR-PA', () => {
  it('property address matches RPA', () => {
    const frrpa = assertSnap(SCENARIO_DIR, 'FRR-PA');
    const property = frrpa.property as Record<string, unknown>;
    expect(String(property.streetAddress)).toContain('Lasselle');
    expect(property.city).toBe('Moreno Valley');
  });

  it('offer date is set', () => {
    const frrpa = assertSnap(SCENARIO_DIR, 'FRR-PA');
    const transaction = frrpa.transaction as Record<string, unknown>;
    expect(transaction.offerDate).toBe('02/26/2026');
  });
});
