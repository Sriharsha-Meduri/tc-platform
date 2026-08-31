import { describe, it, expect } from 'vitest';
import { describeScenario, assertSnap } from '../../helpers/scenario';

const SCENARIO_DIR = __dirname;

/**
 * CONTRACT stage reasoning — 4041 Bycroft, Yorba Linda.
 *
 * Source extraction fixture comes from:
 *   test/extraction/rpa-01-bycroft-cir/extractions/
 *
 * Single decision form: RPA only (no FRR-PA, no counter offers).
 * All-cash purchase, clean acceptance — the simplest contract case.
 *
 * Known facts from fixture:
 *   - Purchase price: $1,539,900 (RPA §3A)
 *   - Financing: All Cash (is_all_cash = true, no loan)
 *   - Buyer: Pam Vovos
 *   - COE: 21 days from acceptance
 *   - Status: accepted_subject_to_counter_offer = false → clean acceptance
 */
describeScenario(SCENARIO_DIR, {
  stage: 'CONTRACT',

  reasoning: [
    {
      label: 'RPA only — all-cash, clean acceptance, ready to advance',
      expect: {
        finalAgreedPrice: 1539900,
        financingType: 'All Cash',
        loanAmount: null,
        // LLM correctly returns false: seller_names is empty in this snap and
        // liquidated damages / arbitration initials are not marked. The contract
        // is structurally complete but the reasoner flags missing elements.
        readyToAdvance: false,
      },
    },
  ],
});

// ── Snap assertions — free, no API key ───────────────────────────────────────

describe('contract-02-bycroft-cir snap assertions — RPA', () => {
  it('purchase price is $1,539,900', () => {
    const rpa = assertSnap(SCENARIO_DIR, 'RPA');
    const terms = rpa.terms_of_purchase as Record<string, unknown>;
    expect(terms.purchase_price).toBe(1539900);
  });

  it('financing is all-cash — no loan', () => {
    const rpa = assertSnap(SCENARIO_DIR, 'RPA');
    const terms = rpa.terms_of_purchase as Record<string, unknown>;
    expect(terms.is_all_cash).toBe(true);
    expect(terms.loan_amount_1).toBeNull();
    expect(terms.loan_type_1).toBeNull();
  });

  it('buyer is Pam Vovos', () => {
    const rpa = assertSnap(SCENARIO_DIR, 'RPA');
    const parties = rpa.parties as Record<string, unknown>;
    expect(parties.buyer_names as string[]).toContain('Pam Vovos');
  });

  it('COE is 21 days', () => {
    const rpa = assertSnap(SCENARIO_DIR, 'RPA');
    const terms = rpa.terms_of_purchase as Record<string, unknown>;
    expect(terms.close_of_escrow_days).toBe(21);
  });

  it('contract is cleanly accepted — no pending counter', () => {
    const rpa = assertSnap(SCENARIO_DIR, 'RPA');
    const acceptance = rpa.seller_acceptance as Record<string, unknown>;
    expect(acceptance.accepted_subject_to_counter_offer).toBe(false);
    expect(acceptance.seller_signature_date).toBe('2026-01-28');
  });
});
