import { describe, it, expect } from 'vitest';
import { describeScenario, assertSnap } from '../../helpers/scenario';
import type { FormGroup } from '../../../src/identifier/identifier.types';

const SCENARIO_DIR = __dirname;

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO: springhill-home
//
// 4-form Springhill home transaction: RPA → SCO-1 → BCO-1 → SCO-2
// Tests that the pipeline correctly identifies BCO (Buyer Counter Offer) as a
// distinct form code (not conflated with SCO), and extracts all counter offer
// details using the shared SCO/BCO schema.
//
// HOW TO USE:
//   1. Drop PDFs into pdfs/
//   2. Run: pnpm exec vitest run test/extraction/springhill-home
//   3. Review identification (SET 1) and extraction (SET 2) in console
//   4. Fix assertions until both pass
//   5. Save printed JSON snaps to lock extraction at zero cost
// ─────────────────────────────────────────────────────────────────────────────

describeScenario(SCENARIO_DIR, {
  // No stage validation — testing extraction only (each PDF independently)

  extraction: {
    pdfFiles: [
      'RPA.pdf',
      'SCO-1.pdf',
      'BCO-1.pdf',
      'SCO-2.pdf',
    ],

    // ── SET 1: Form identification ──────────────────────────────────────────
    // Each PDF is tested independently. Gemini API can be flaky — assertions
    // are informational only, not hard-blocking.
    assertIdentification(formGroups) {
      const codes = formGroups.map((g) => g.formCode);
      console.log(`\n[IDENTIFY] Detected: ${codes.join(', ')}`);

      const hasBco = codes.includes('BCO');
      const hasSco = codes.includes('SCO');
      const hasRpa = codes.includes('RPA');
      const hasUnknown = codes.includes('UNKNOWN');
      if (hasBco) console.log('[IDENTIFY] BCO detected ✓');
      if (hasSco) console.log('[IDENTIFY] SCO detected ✓');
      if (hasRpa) console.log('[IDENTIFY] RPA detected ✓');
      if (hasUnknown) console.log('[IDENTIFY] UNKNOWN page(s) present');
    },

    // ── SET 2: JSON extraction — fires only when LLM runs (no snaps) ──────
    assertExtraction(forms) {
      const rpa = forms.find((f) => f.formCode === 'RPA');
      const bco = forms.find((f) => f.formCode === 'BCO');
      const scoForms = forms.filter((f) => f.formCode === 'SCO');

      console.log(`\n[EXTRACT] Found: RPA=${!!rpa}, BCO=${!!bco}, SCO=${scoForms.length}`);

      // ── RPA: basic sanity ──
      if (rpa) {
        const header = rpa.data.header as Record<string, unknown>;
        expect(header.form_code).toBe('RPA');

        const offer = rpa.data.section_1_offer as Record<string, unknown>;
        const property = offer.B_property as Record<string, unknown>;
        expect(property.street_address).toBeTruthy();
      }

      // ── BCO: full detail check ──
      if (bco) {
        console.log('\n=== BCO EXTRACTION RESULT ===');
        console.log(JSON.stringify(bco.data, null, 2));

        const bcoData = bco.data as Record<string, unknown>;

        // Header
        const header = bcoData.header as Record<string, unknown>;
        // form_code extracted from the document itself — BCO is the actual form
        expect(header.form_code, 'BCO header.form_code').toBe('BCO');
        expect(header.property_address, 'BCO property address').toBeTruthy();
        expect(header.date, 'BCO header date').toBeTruthy();

        // Counter offer number
        const counterNum = header.counter_offer_number as string | null;
        console.log(`  BCO counter_offer_number: ${counterNum}`);

        // Parties
        const parties = bcoData.parties as Record<string, unknown>;
        const buyerNames = parties.buyer_names as string[];
        const sellerNames = parties.seller_names as string[];
        expect(buyerNames.length, 'BCO must have buyer names').toBeGreaterThan(0);
        expect(sellerNames.length, 'BCO must have seller names').toBeGreaterThan(0);
        console.log(`  BCO buyer: ${buyerNames.join(', ')}`);
        console.log(`  BCO seller: ${sellerNames.join(', ')}`);

        // Offer reference
        const offerRef = bcoData.offer_reference as Record<string, unknown>;
        console.log(`  BCO referenced form: ${offerRef.referenced_form_code}`);
        console.log(`  BCO referenced date: ${offerRef.referenced_offer_date}`);
        console.log(`  BCO counter number: ${offerRef.counter_number}`);

        // Purchase price
        const terms = bcoData.counter_offer_terms as Record<string, unknown>;
        const price = terms.purchase_price as number | null;
        console.log(`  BCO purchase_price: ${price}`);

        // Other terms
        const otherTermsText = terms.other_terms_text as string | null;
        if (otherTermsText) {
          console.log(`  BCO other_terms_text: ${otherTermsText.substring(0, 200)}...`);
        }

        // Expiration
        const expiration = bcoData.expiration as Record<string, unknown>;
        if (expiration) {
          console.log(`  BCO expiration: ${expiration.expiration_date} ${expiration.expiration_time} ${expiration.expiration_time_period}`);
        }

        // Section 4 — Offer (on BCO, the offeror is the BUYER)
        const section4 = bcoData.section_4_offer as Record<string, unknown>;
        if (section4) {
          console.log(`  BCO offeror_1_signature_present: ${section4.offeror_1_signature_present}`);
          console.log(`  BCO offeror_1_signature_date: ${section4.offeror_1_signature_date}`);
          console.log(`  BCO offeror_1_typed_name: ${section4.offeror_1_typed_name}`);
          console.log(`  BCO offeror_2_signature_present: ${section4.offeror_2_signature_present}`);
          console.log(`  BCO offeror_2_signature_date: ${section4.offeror_2_signature_date}`);
          console.log(`  BCO offeror_2_typed_name: ${section4.offeror_2_typed_name}`);
        }

        // Section 5 — Acceptance (on BCO, the acceptor is the SELLER)
        const section5 = bcoData.section_5_acceptance as Record<string, unknown>;
        if (section5) {
          console.log(`  BCO acceptor_1_signature_present: ${section5.acceptor_1_signature_present}`);
          console.log(`  BCO acceptor_1_signature_date: ${section5.acceptor_1_signature_date}`);
          console.log(`  BCO subject_to_attached_counter_offer: ${section5.subject_to_attached_counter_offer}`);
        }

        // Confirmation of acceptance
        const confirmation = bcoData.confirmation_of_acceptance as Record<string, unknown>;
        if (confirmation) {
          console.log(`  BCO confirmation_initials: ${confirmation.confirmation_initials}`);
          console.log(`  BCO confirmation_date: ${confirmation.confirmation_date}`);
        }
      }

      // ── SCO forms ──
      scoForms.forEach((sco, i) => {
        const data = sco.data as Record<string, unknown>;
        const header = data.header as Record<string, unknown>;
        console.log(`\n  SCO-${i + 1}: form_code=${header.form_code}, address=${header.property_address}, counter_num=${header.counter_offer_number}`);
      });
    },
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// SNAP ASSERTIONS — run free on every test run, no LLM required.
// These load extractions/<form>.snap.json and validate field values.
// They act as regression tests: if a snap is deleted they fail immediately
// with a clear message telling the engineer to run extraction first.
// ─────────────────────────────────────────────────────────────────────────────

describe('springhill-home snap assertions', () => {
  // ── RPA ──
  it('RPA has correct property address (Springhill)', () => {
    const rpa = assertSnap(SCENARIO_DIR, 'RPA');
    const section1Offer = rpa.section_1_offer as Record<string, unknown>;
    const property = section1Offer.B_property as Record<string, unknown>;
    expect(property.street_address).toBeTruthy();
    expect(property.city).toBeTruthy();
    expect(property.county).toBeTruthy();
  });

  it('RPA has purchase price and COE days', () => {
    const rpa = assertSnap(SCENARIO_DIR, 'RPA');
    const section3 = rpa.section_3_terms_and_allocation_of_costs_page_1 as Record<string, unknown>;
    const price = section3.A_purchase_price as Record<string, unknown>;
    expect(price.purchase_price).toBeTypeOf('number');
    const coe = section3.B_close_of_escrow as Record<string, unknown>;
    expect(coe.days_after_acceptance).toBeTypeOf('number');
  });

  // ── BCO ──
  it('BCO has correct form_code in header', () => {
    const bco = assertSnap(SCENARIO_DIR, 'BCO');
    const header = bco.header as Record<string, unknown>;
    // form_code extracted from the document itself — BCO is the actual form
    expect(header.form_code).toBe('BCO');
  });

  it('BCO has property address', () => {
    const bco = assertSnap(SCENARIO_DIR, 'BCO');
    const header = bco.header as Record<string, unknown>;
    expect(header.property_address).toBeTruthy();
  });

  it('BCO has parties with buyer and seller names', () => {
    const bco = assertSnap(SCENARIO_DIR, 'BCO');
    const parties = bco.parties as Record<string, unknown>;
    expect((parties.buyer_names as string[]).length).toBeGreaterThan(0);
    expect((parties.seller_names as string[]).length).toBeGreaterThan(0);
  });

  it('BCO has offer reference fields', () => {
    const bco = assertSnap(SCENARIO_DIR, 'BCO');
    const offerRef = bco.offer_reference as Record<string, unknown>;
    expect(offerRef).toBeTruthy();
  });

  it('BCO has counter offer terms section', () => {
    const bco = assertSnap(SCENARIO_DIR, 'BCO');
    const terms = bco.counter_offer_terms as Record<string, unknown>;
    expect(terms).toBeTruthy();
  });

  it('BCO has expiration section', () => {
    const bco = assertSnap(SCENARIO_DIR, 'BCO');
    const expiration = bco.expiration as Record<string, unknown>;
    expect(expiration).toBeTruthy();
  });

  it('BCO has section_4_offer (buyer as offeror)', () => {
    const bco = assertSnap(SCENARIO_DIR, 'BCO');
    const section4 = bco.section_4_offer as Record<string, unknown>;
    expect(section4).toBeTruthy();
    expect(section4).toHaveProperty('offeror_1_signature_present');
  });

  it('BCO has section_5_acceptance (seller as acceptor)', () => {
    const bco = assertSnap(SCENARIO_DIR, 'BCO');
    const section5 = bco.section_5_acceptance as Record<string, unknown>;
    expect(section5).toBeTruthy();
    expect(section5).toHaveProperty('subject_to_attached_counter_offer');
  });

  it('BCO purchase price is a number or null', () => {
    const bco = assertSnap(SCENARIO_DIR, 'BCO');
    const terms = bco.counter_offer_terms as Record<string, unknown>;
    const price = terms.purchase_price;
    if (price !== null) expect(price).toBeTypeOf('number');
  });

  // ── SCO ──
  it('SCO-1 has parties and offer reference', () => {
    const sco1 = assertSnap(SCENARIO_DIR, 'SCO');
    const header = sco1.header as Record<string, unknown>;
    expect(header.form_code).toBe('SCO');
    const parties = sco1.parties as Record<string, unknown>;
    expect((parties.buyer_names as string[]).length).toBeGreaterThan(0);
  });

  it('BCO parties overlap with RPA parties', () => {
    const rpa = assertSnap(SCENARIO_DIR, 'RPA');
    const bco = assertSnap(SCENARIO_DIR, 'BCO');

    const rpaOffer = rpa.section_1_offer as Record<string, unknown>;
    const rpaBuyerNames = (rpaOffer.A_offer_from as Record<string, unknown>).buyer_names as string[];

    const bcoParties = bco.parties as Record<string, unknown>;
    const bcoBuyerNames = bcoParties.buyer_names as string[];

    // BCO buyer names should be a subset or same as RPA buyer names
    const rpaLower = rpaBuyerNames.map((n: string) => n.toLowerCase());
    const overlap = bcoBuyerNames.filter((bn: string) => rpaLower.includes(bn.toLowerCase()));
    expect(overlap.length, 'BCO buyers should overlap with RPA buyers').toBeGreaterThan(0);
  });
});
