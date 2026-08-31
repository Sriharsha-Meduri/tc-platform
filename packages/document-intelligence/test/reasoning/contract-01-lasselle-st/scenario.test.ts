import { describe, it, expect } from 'vitest';
import { describeScenario, assertSnap } from '../../helpers/scenario';

const SCENARIO_DIR = __dirname;

/**
 * CONTRACT stage reasoning — 15982 Lasselle St, Moreno Valley.
 *
 * Source extraction fixtures come from:
 *   test/extraction/contract-03-lasselle-st-rpa-bundle/extractions/
 *
 * Only decision forms are present here (RPA + FRR-PA). The 7 compliance-only
 * forms from the original bundle (BIA, BHIA, PRBS, WFA, CCPA, FHDA, AD) are
 * intentionally excluded — they live in the extraction scenario and are never
 * passed to the reasoning LLM.
 *
 * Known facts from fixtures:
 *   - Purchase price: $451,000 (RPA §3A)
 *   - Financing: Conventional, loan $361,000 (RPA §2B)
 *   - Buyer: Varun Srivastava
 *   - Sellers: Jeannette Gonzalez, Xala Flores Esteban Roberto
 *   - Status: accepted_subject_to_counter_offer = true → counter is PENDING
 *   - COE: 30 days from acceptance, no absolute date yet
 */
describeScenario(SCENARIO_DIR, {
  stage: 'CONTRACT',

  reasoning: [
    {
      label: 'RPA + FRR-PA — Conventional loan, counter offer pending',
      expect: {
        // accepted_subject_to_counter_offer: true → counter is pending, so no
        // final agreed price yet. The RPA price ($451,000) appears in priceHistory
        // but is not confirmed as final until the counter chain is resolved.
        finalAgreedPrice: null,
        financingType: 'Conventional',
        loanAmount: 361000,
        readyToAdvance: false,
      },
    },
  ],
});

// ── Snap assertions — free, no API key ───────────────────────────────────────

describe('contract-01-lasselle-st snap assertions — RPA', () => {
  it('purchase price is $451,000', () => {
    const rpa = assertSnap(SCENARIO_DIR, 'RPA');
    const terms = rpa.terms_of_purchase as Record<string, unknown>;
    expect(terms.purchase_price).toBe(451000);
  });

  it('financing is Conventional with $361,000 loan', () => {
    const rpa = assertSnap(SCENARIO_DIR, 'RPA');
    const terms = rpa.terms_of_purchase as Record<string, unknown>;
    expect(terms.loan_type_1).toBe('Conventional');
    expect(terms.loan_amount_1).toBe(361000);
    expect(terms.is_all_cash).toBe(false);
  });

  it('buyer is Varun Srivastava', () => {
    const rpa = assertSnap(SCENARIO_DIR, 'RPA');
    const parties = rpa.parties as Record<string, unknown>;
    expect(parties.buyer_names as string[]).toContain('Varun Srivastava');
  });

  it('seller Jeannette Gonzalez is present', () => {
    const rpa = assertSnap(SCENARIO_DIR, 'RPA');
    const parties = rpa.parties as Record<string, unknown>;
    expect(parties.seller_names as string[]).toContain('Jeannette Gonzalez');
  });

  it('contract is pending counter offer — not yet final', () => {
    const rpa = assertSnap(SCENARIO_DIR, 'RPA');
    const acceptance = rpa.seller_acceptance as Record<string, unknown>;
    expect(acceptance.accepted_subject_to_counter_offer).toBe(true);
  });

  it('COE is 30 days, no absolute date', () => {
    const rpa = assertSnap(SCENARIO_DIR, 'RPA');
    const terms = rpa.terms_of_purchase as Record<string, unknown>;
    expect(terms.close_of_escrow_days).toBe(30);
    expect(terms.close_of_escrow_date).toBeNull();
  });
});

describe('contract-01-lasselle-st snap assertions — FRR-PA', () => {
  it('property address matches RPA', () => {
    const frrpa = assertSnap(SCENARIO_DIR, 'FRR-PA');
    const property = frrpa.property as Record<string, unknown>;
    expect(String(property.streetAddress)).toContain('Lasselle');
  });

  it('offer date is present', () => {
    const frrpa = assertSnap(SCENARIO_DIR, 'FRR-PA');
    const transaction = frrpa.transaction as Record<string, unknown>;
    expect(transaction.offerDate).toBe('02/26/2026');
  });
});
