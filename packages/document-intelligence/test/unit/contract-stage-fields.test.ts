import { describe, it, expect } from 'vitest';
import { normalizeContractDocument } from '../../src/validator/stages/contract.stage';
import type { FormExtractionResult } from '../../src/pipeline/pipeline.types';

/**
 * Regression coverage for the additive `.fields` provenance layer (spec
 * items 1-4): every wrapped field must still resolve to the same flat
 * scalar value as before (backward compatibility, decision D), and the
 * provenance object must faithfully carry entered-vs-default/source data
 * without ever being influenced by anything execution/validation-related
 * (there is no such input in scope here — extraction and validation are
 * separate passes).
 */

function scoResult(data: Record<string, unknown>): FormExtractionResult {
  return {
    formCode: 'SCO',
    formName: 'Seller Counter Offer',
    pageIndices: [0, 1],
    output: {
      formCode: 'SCO',
      formName: 'Seller Counter Offer',
      data,
      rawResponse: '',
      promptTokens: null,
      completionTokens: null,
      modelName: 'test',
    },
  };
}

function fieldSchemaValue(opts: {
  defaultValue?: unknown;
  enteredValue?: unknown;
  resolvedValue?: unknown;
  enteredValuePresent: boolean;
  sourceType?: string;
  evidenceText?: string | null;
  confidence?: number | null;
}) {
  return {
    default_value: opts.defaultValue ?? null,
    entered_value: opts.enteredValue ?? null,
    resolved_value: opts.resolvedValue ?? null,
    entered_value_present: opts.enteredValuePresent,
    source_type: opts.sourceType ?? 'typed',
    evidence_text: opts.evidenceText ?? null,
    confidence: opts.confidence ?? null,
  };
}

describe('normalizeContractDocument — SCO/BCO .fields provenance', () => {
  it('populates fields.purchasePrice from a wrapped other_terms_modifications entry and keeps the flat scalar in sync', () => {
    const data = {
      header: { property_address: '123 Main St', date: '2026-05-01', counter_offer_number: '1' },
      parties: { buyer_names: ['John Buyer'], seller_names: ['Jane Seller'] },
      offer_reference: { referenced_form_code: 'RPA', referenced_offer_date: '2026-04-28', referenced_counter_offer_number: null },
      counter_offer_terms: {
        purchase_price: fieldSchemaValue({ enteredValuePresent: false }),
        other_terms_text: 'Purchase price increased to $925,000',
        other_terms_modifications: {
          purchase_price: fieldSchemaValue({
            enteredValue: 925000,
            resolvedValue: 925000,
            enteredValuePresent: true,
            sourceType: 'typed',
            evidenceText: 'Purchase price increased to $925,000',
          }),
        },
        attached_addenda: [],
      },
      expiration: { expiration_date: '2026-05-04' },
      section_4_offer: { offeror_1_signature_date: '2026-05-01' },
      section_5_acceptance: { subject_to_attached_counter_offer: false, acceptor_1_signature_date: '2026-05-02' },
    };

    const doc = normalizeContractDocument(scoResult(data), 'SCO-1.pdf', 1);
    expect(doc).not.toBeNull();
    expect(doc!.extractedTerms.purchasePrice).toBe(925000);

    const field = doc!.extractedTerms.fields?.purchasePrice;
    expect(field).not.toBeNull();
    expect(field!.value).toBe(925000);
    // The flat scalar and field.value can never drift — they're the same 925000.
    expect(field!.value).toBe(doc!.extractedTerms.purchasePrice);
    expect(field!.enteredValue).toBe(925000);
    expect(field!.sourceType).toBe('typed');
    expect(field!.evidence?.text).toBe('Purchase price increased to $925,000');
    expect(field!.source).toEqual({ documentId: null, formCode: 'SCO', page: 1 });
  });

  it('does not fabricate an override when Other Terms leaves the field untouched (no entered value, no printed default)', () => {
    // Section 1D "Other Terms" is free-form text with no pre-printed values —
    // fieldSchema() is built without hasPrintedDefault, so a real extraction
    // leaves default_value null whenever nothing was actually written. An
    // untouched field must resolve to null, not silently invent a value.
    const data = {
      header: { property_address: '123 Main St', date: '2026-05-01', counter_offer_number: '1' },
      parties: { buyer_names: ['John Buyer'], seller_names: ['Jane Seller'] },
      offer_reference: { referenced_form_code: 'RPA', referenced_offer_date: '2026-04-28', referenced_counter_offer_number: null },
      counter_offer_terms: {
        other_terms_text: '',
        other_terms_modifications: {
          loan_contingency_days: fieldSchemaValue({
            enteredValuePresent: false,
            sourceType: 'unknown',
          }),
        },
        attached_addenda: [],
      },
      expiration: {},
      section_4_offer: {},
      section_5_acceptance: { subject_to_attached_counter_offer: false },
    };

    const doc = normalizeContractDocument(scoResult(data), 'SCO-2.pdf', 1);
    const field = doc!.extractedTerms.fields?.loanContingencyDays;
    expect(field?.value).toBeNull();
    expect(field?.enteredValue).toBeNull();
    expect(field?.defaultValue).toBeNull();
    // No override present -> the flat scalar must not fabricate a contingency deadline either.
    expect(doc!.extractedTerms.loanContingency).toBeNull();
  });
});
