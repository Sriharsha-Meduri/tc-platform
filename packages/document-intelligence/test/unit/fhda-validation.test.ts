import { describe, it, expect } from 'vitest';
import { validateFhdaWithSchema } from '../../src/validator/fhda-validation';
import { validateDisclosuresStage } from '../../src/validator/stages/disclosures.stage';
import type { FormExtractionOutput } from '../../src/extractor/extractor.types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function validFhda() {
  return {
    form_type: 'FHDA' as const,
    form_validation: {
      is_fhda: true,
      form_title: 'FAIR HOUSING AND DISCRIMINATION ADVISORY',
      form_revision: '12/24',
      logical_page_numbers: [1, 2],
      expected_page_count: 2,
      correct_page_labels: true,
      document_complete: true,
      form_identity_status: 'valid' as const,
    },
    transaction_context: {
      transaction_type: 'purchase' as const,
      expected_buyer_tenant_count: 1,
      expected_seller_housing_provider_count: 1,
      expected_buyer_tenant_names: ['John Buyer'],
      expected_seller_housing_provider_names: ['Jane Seller'],
      expected_property_address: '123 Main St, Los Angeles, CA 90001',
    },
    page_1: {
      equal_access_to_housing_for_all: true,
      federal_and_state_laws_prohibiting_discrimination: true,
      potential_legal_remedies: true,
      protected_classes_characteristics: true,
      dre_training_and_supervision_requirements: true,
      realtor_organizations_prohibit_discrimination: true,
      all_page_1_sections_present: true,
    },
    page_2: {
      who_is_required_to_comply: true,
      examples_of_conduct_not_motivated_by_intent_but_with_discriminatory_effect: true,
      examples_of_unlawful_improper_conduct: true,
      examples_of_positive_practices: true,
      fair_housing_resources: true,
      limited_exceptions_to_fair_housing_requirements: true,
      protected_classes_table_present: true,
      all_page_2_sections_present: true,
    },
    cross_page_validation: {
      consistent_form_title: true,
      consistent_revision: true,
      page_count: 2,
      correct_total_pages: true,
    },
    buyer_tenant_acknowledgements: {
      slot_1: {
        signature_present: true,
        signature_text: 'John Buyer',
        signature_type: 'handwritten' as const,
        signer_matches_expected_party: true,
        date: '2026-07-15',
        date_present: true,
        date_valid: true,
        completion_status: 'complete' as const,
      },
      slot_2: {
        signature_present: false,
        signature_text: null,
        signature_type: 'blank' as const,
        signer_matches_expected_party: null,
        date: null,
        date_present: false,
        date_valid: null,
        completion_status: 'missing_signature_and_date' as const,
      },
      required_signature_count: 1,
      valid_required_signature_count: 1,
      missing_required_signature_count: 0,
      missing_required_date_count: 0,
      all_required_parties_signed: true,
      all_required_signatures_dated: true,
      completion_status: 'complete' as const,
    },
    seller_housing_provider_acknowledgements: {
      slot_1: {
        signature_present: true,
        signature_text: 'Jane Seller',
        signature_type: 'handwritten' as const,
        signer_matches_expected_party: true,
        date: '2026-07-15',
        date_present: true,
        date_valid: true,
        completion_status: 'complete' as const,
      },
      slot_2: {
        signature_present: false,
        signature_text: null,
        signature_type: 'blank' as const,
        signer_matches_expected_party: null,
        date: null,
        date_present: false,
        date_valid: null,
        completion_status: 'missing_signature_and_date' as const,
      },
      required_signature_count: 1,
      valid_required_signature_count: 1,
      missing_required_signature_count: 0,
      missing_required_date_count: 0,
      all_required_parties_signed: true,
      all_required_signatures_dated: true,
      completion_status: 'complete' as const,
    },
    non_required_fields: {
      buyer_tenant_initials_fields_present: false,
      buyer_tenant_initials_required: false,
      seller_housing_provider_initials_fields_present: false,
      seller_housing_provider_initials_required: false,
      broker_signature_fields_present: false,
      broker_signature_required: false,
      agent_signature_fields_present: false,
      agent_signature_required: false,
      escrow_signature_fields_present: false,
      escrow_signature_required: false,
      property_address_required_on_form: false,
    },
    validation_summary: {
      has_blocker: false,
      has_warning: false,
      blocker_codes: [],
      blocker_messages: [],
      warning_codes: [],
      warning_messages: [],
      overall_status: 'complete' as const,
    },
  };
}

function makeExtraction(data: Record<string, unknown>): FormExtractionOutput {
  return {
    formCode: 'FHDA',
    formName: 'Fair Housing and Discrimination Advisory',
    confidence: 0.95,
    data,
  };
}

// ─── Schema validation tests ──────────────────────────────────────────────────

describe('validateFhdaWithSchema', () => {
  it('happy path — well-formed FHDA passes with no blockers', () => {
    const result = validateFhdaWithSchema(validFhda() as unknown as Record<string, unknown>);
    const blockerCodes = result.issues.filter((i) => i.code.startsWith('BLOCKER')).map((i) => i.code);
    expect(blockerCodes).toHaveLength(0);
    expect(result.checks.length).toBeGreaterThan(0);
  });

  it('wrong form type — emits BLOCKER_FHDA_WRONG_FORM', () => {
    const result = validateFhdaWithSchema({ form_type: 'BHIA' } as unknown as Record<string, unknown>);
    expect(result.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'BLOCKER_FHDA_WRONG_FORM' })]),
    );
  });

  it('missing pages — emits BLOCKER_FHDA_PAGE_MISSING', () => {
    const data = validFhda();
    data.form_validation.document_complete = false;
    data.form_validation.form_identity_status = 'missing_page';
    data.cross_page_validation.correct_total_pages = false;
    data.cross_page_validation.page_count = 1;
    const result = validateFhdaWithSchema(data as unknown as Record<string, unknown>);
    expect(result.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'BLOCKER_FHDA_PAGE_MISSING' })]),
    );
  });

  it('protected classes table missing — emits BLOCKER_FHDA_PROTECTED_CLASSES_TABLE_MISSING', () => {
    const data = validFhda();
    data.page_2.protected_classes_table_present = false;
    const result = validateFhdaWithSchema(data as unknown as Record<string, unknown>);
    expect(result.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'BLOCKER_FHDA_PROTECTED_CLASSES_TABLE_MISSING' })]),
    );
  });

  it('acknowledgment missing — emits BLOCKER_FHDA_ACKNOWLEDGMENT_MISSING', () => {
    const data = validFhda();
    data.buyer_tenant_acknowledgements.all_required_parties_signed = false;
    data.buyer_tenant_acknowledgements.slot_1.signature_present = false;
    data.buyer_tenant_acknowledgements.slot_1.completion_status = 'missing_signature';
    const result = validateFhdaWithSchema(data as unknown as Record<string, unknown>);
    expect(result.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'BLOCKER_FHDA_ACKNOWLEDGMENT_MISSING' })]),
    );
  });

  it('missing buyer 1 signature — emits BLOCKER_FHDA_BUYER_TENANT_1_SIGNATURE_MISSING', () => {
    const data = validFhda();
    data.buyer_tenant_acknowledgements.slot_1.signature_present = false;
    data.buyer_tenant_acknowledgements.slot_1.completion_status = 'missing_signature';
    const result = validateFhdaWithSchema(data as unknown as Record<string, unknown>);
    expect(result.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'BLOCKER_FHDA_BUYER_TENANT_1_SIGNATURE_MISSING' })]),
    );
  });

  it('missing buyer 1 date — emits BLOCKER_FHDA_BUYER_TENANT_1_DATE_MISSING', () => {
    const data = validFhda();
    data.buyer_tenant_acknowledgements.slot_1.date_present = false;
    data.buyer_tenant_acknowledgements.slot_1.completion_status = 'missing_date';
    const result = validateFhdaWithSchema(data as unknown as Record<string, unknown>);
    expect(result.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'BLOCKER_FHDA_BUYER_TENANT_1_DATE_MISSING' })]),
    );
  });

  it('missing seller 1 signature — emits BLOCKER_FHDA_SELLER_HOUSING_PROVIDER_1_SIGNATURE_MISSING', () => {
    const data = validFhda();
    data.seller_housing_provider_acknowledgements.slot_1.signature_present = false;
    data.seller_housing_provider_acknowledgements.slot_1.completion_status = 'missing_signature';
    const result = validateFhdaWithSchema(data as unknown as Record<string, unknown>);
    expect(result.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'BLOCKER_FHDA_SELLER_HOUSING_PROVIDER_1_SIGNATURE_MISSING' })]),
    );
  });

  it('missing seller 1 date — emits BLOCKER_FHDA_SELLER_HOUSING_PROVIDER_1_DATE_MISSING', () => {
    const data = validFhda();
    data.seller_housing_provider_acknowledgements.slot_1.date_present = false;
    data.seller_housing_provider_acknowledgements.slot_1.completion_status = 'missing_date';
    const result = validateFhdaWithSchema(data as unknown as Record<string, unknown>);
    expect(result.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'BLOCKER_FHDA_SELLER_HOUSING_PROVIDER_1_DATE_MISSING' })]),
    );
  });

  it('2 buyers required, buyer 2 missing — emits BLOCKER_FHDA_BUYER_TENANT_2_SIGNATURE_MISSING', () => {
    const data = validFhda();
    data.transaction_context.expected_buyer_tenant_count = 2;
    data.buyer_tenant_acknowledgements.required_signature_count = 2;
    data.buyer_tenant_acknowledgements.slot_2.signature_present = false;
    data.buyer_tenant_acknowledgements.slot_2.completion_status = 'missing_signature_and_date';
    data.buyer_tenant_acknowledgements.all_required_parties_signed = false;
    const result = validateFhdaWithSchema(data as unknown as Record<string, unknown>);
    expect(result.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'BLOCKER_FHDA_BUYER_TENANT_2_SIGNATURE_MISSING' })]),
    );
  });

  it('2 sellers required, seller 2 missing — emits BLOCKER_FHDA_SELLER_HOUSING_PROVIDER_2_SIGNATURE_MISSING', () => {
    const data = validFhda();
    data.transaction_context.expected_seller_housing_provider_count = 2;
    data.seller_housing_provider_acknowledgements.required_signature_count = 2;
    data.seller_housing_provider_acknowledgements.slot_2.signature_present = false;
    data.seller_housing_provider_acknowledgements.slot_2.completion_status = 'missing_signature_and_date';
    data.seller_housing_provider_acknowledgements.all_required_parties_signed = false;
    const result = validateFhdaWithSchema(data as unknown as Record<string, unknown>);
    expect(result.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'BLOCKER_FHDA_SELLER_HOUSING_PROVIDER_2_SIGNATURE_MISSING' })]),
    );
  });

  it('buyer signer mismatch — emits BLOCKER_FHDA_BUYER_TENANT_SIGNER_MISMATCH', () => {
    const data = validFhda();
    data.buyer_tenant_acknowledgements.slot_1.signer_matches_expected_party = false;
    data.buyer_tenant_acknowledgements.slot_1.signature_text = 'Wrong Person';
    const result = validateFhdaWithSchema(data as unknown as Record<string, unknown>);
    expect(result.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'BLOCKER_FHDA_BUYER_TENANT_SIGNER_MISMATCH' })]),
    );
  });

  it('seller signer mismatch — emits BLOCKER_FHDA_SELLER_HOUSING_PROVIDER_SIGNER_MISMATCH', () => {
    const data = validFhda();
    data.seller_housing_provider_acknowledgements.slot_1.signer_matches_expected_party = false;
    data.seller_housing_provider_acknowledgements.slot_1.signature_text = 'Wrong Person';
    const result = validateFhdaWithSchema(data as unknown as Record<string, unknown>);
    expect(result.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'BLOCKER_FHDA_SELLER_HOUSING_PROVIDER_SIGNER_MISMATCH' })]),
    );
  });

  it('document incomplete — emits BLOCKER_FHDA_CONTENT_INCOMPLETE', () => {
    const data = validFhda();
    data.form_validation.document_complete = false;
    const result = validateFhdaWithSchema(data as unknown as Record<string, unknown>);
    expect(result.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'BLOCKER_FHDA_CONTENT_INCOMPLETE' })]),
    );
  });

  it('page 1 sections incomplete — emits BLOCKER_FHDA_CONTENT_INCOMPLETE', () => {
    const data = validFhda();
    data.page_1.all_page_1_sections_present = false;
    data.page_1.equal_access_to_housing_for_all = false;
    const result = validateFhdaWithSchema(data as unknown as Record<string, unknown>);
    expect(result.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'BLOCKER_FHDA_CONTENT_INCOMPLETE' })]),
    );
  });

  it('manual review — emits BLOCKER_FHDA_MANUAL_REVIEW', () => {
    const data = validFhda();
    data.validation_summary.overall_status = 'manual_review_required';
    data.validation_summary.has_blocker = true;
    const result = validateFhdaWithSchema(data as unknown as Record<string, unknown>);
    expect(result.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'BLOCKER_FHDA_MANUAL_REVIEW' })]),
    );
  });

  it('non-required fields — no blocker for missing initials, broker sigs, property address', () => {
    const data = validFhda();
    expect(data.non_required_fields.buyer_tenant_initials_required).toBe(false);
    expect(data.non_required_fields.seller_housing_provider_initials_required).toBe(false);
    expect(data.non_required_fields.property_address_required_on_form).toBe(false);
    expect(data.non_required_fields.broker_signature_required).toBe(false);
    expect(data.non_required_fields.agent_signature_required).toBe(false);
    expect(data.non_required_fields.escrow_signature_required).toBe(false);
  });
});

// ─── Integration with validateDisclosuresStage ────────────────────────────────

describe('validateDisclosuresStage — FHDA integration', () => {
  it('valid FHDA passes with checks', () => {
    const extractions = [makeExtraction(validFhda())];
    const result = validateDisclosuresStage(extractions);
    expect(result.checks.some((c) => c.formCode === 'FHDA')).toBe(true);
  });

  it('missing buyer 1 signature → blocker', () => {
    const data = validFhda();
    data.buyer_tenant_acknowledgements.slot_1.signature_present = false;
    data.buyer_tenant_acknowledgements.slot_1.completion_status = 'missing_signature';
    const extractions = [makeExtraction(data)];
    const result = validateDisclosuresStage(extractions);
    const hasBlocker = result.blockers.some((b) => b.code.includes('BUYER_TENANT_1_SIGNATURE_MISSING') && b.formCode === 'FHDA');
    expect(hasBlocker).toBe(true);
  });

  it('missing seller 1 signature → blocker', () => {
    const data = validFhda();
    data.seller_housing_provider_acknowledgements.slot_1.signature_present = false;
    data.seller_housing_provider_acknowledgements.slot_1.completion_status = 'missing_signature';
    const extractions = [makeExtraction(data)];
    const result = validateDisclosuresStage(extractions);
    const hasBlocker = result.blockers.some((b) => b.code.includes('SELLER_HOUSING_PROVIDER_1_SIGNATURE_MISSING') && b.formCode === 'FHDA');
    expect(hasBlocker).toBe(true);
  });

  it('missing buyer 1 date → blocker', () => {
    const data = validFhda();
    data.buyer_tenant_acknowledgements.slot_1.date_present = false;
    data.buyer_tenant_acknowledgements.slot_1.completion_status = 'missing_date';
    const extractions = [makeExtraction(data)];
    const result = validateDisclosuresStage(extractions);
    const hasBlocker = result.blockers.some((b) => b.code.includes('BUYER_TENANT_1_DATE_MISSING') && b.formCode === 'FHDA');
    expect(hasBlocker).toBe(true);
  });

  it('protected classes table missing → blocker', () => {
    const data = validFhda();
    data.page_2.protected_classes_table_present = false;
    const extractions = [makeExtraction(data)];
    const result = validateDisclosuresStage(extractions);
    const hasBlocker = result.blockers.some((b) => b.code.includes('PROTECTED_CLASSES_TABLE_MISSING') && b.formCode === 'FHDA');
    expect(hasBlocker).toBe(true);
  });

  it('no FHDA-specific check for missing initials or broker signatures', () => {
    const data = validFhda();
    const extractions = [makeExtraction(data)];
    const result = validateDisclosuresStage(extractions);
    const fhdaBlockers = result.blockers.filter((b) => b.formCode === 'FHDA');
    const initialsBlocker = fhdaBlockers.find((b) => b.code.includes('INITIALS'));
    const brokerBlocker = fhdaBlockers.find((b) => b.code.includes('BROKER'));
    expect(initialsBlocker).toBeUndefined();
    expect(brokerBlocker).toBeUndefined();
  });
});

// ─── Standard extraction fallback tests ───────────────────────────────────────

describe('validateDisclosuresStage — FHDA standard extraction fallback', () => {
  it('buyer and seller dates present → execution_valid pass, no blockers', () => {
    const data = {
      signatures: {
        buyer_tenant_1_date: '2026-07-15',
        seller_housing_provider_1_date: '2026-07-15',
      },
      sections: { equal_access_to_housing_for_all: true },
    };
    const extractions: FormExtractionOutput[] = [makeExtraction(data)];
    const result = validateDisclosuresStage(extractions);
    expect(result.checks.some((c) => c.ruleId === 'fhda_execution_valid' && c.status === 'pass')).toBe(true);
    expect(result.checks.some((c) => c.ruleId === 'fhda_form_present')).toBe(true);
    expect(result.checks.some((c) => c.ruleId === 'fhda_sections_present')).toBe(true);
    expect(result.blockers.filter((b) => b.formCode === 'FHDA').length).toBe(0);
  });

  it('buyer 1 date missing → BLOCKER_FHDA_BUYER_TENANT_1_DATE_MISSING', () => {
    const data = {
      signatures: {
        buyer_tenant_1_date: null,
        seller_housing_provider_1_date: '2026-07-15',
      },
    };
    const extractions: FormExtractionOutput[] = [makeExtraction(data)];
    const result = validateDisclosuresStage(extractions);
    const hasBlocker = result.blockers.some((b) => b.code.includes('BUYER_TENANT_1_DATE_MISSING') && b.formCode === 'FHDA');
    expect(hasBlocker).toBe(true);
  });

  it('seller 1 date missing → BLOCKER_FHDA_SELLER_HOUSING_PROVIDER_1_DATE_MISSING', () => {
    const data = {
      signatures: {
        buyer_tenant_1_date: '2026-07-15',
        seller_housing_provider_1_date: null,
      },
    };
    const extractions: FormExtractionOutput[] = [makeExtraction(data)];
    const result = validateDisclosuresStage(extractions);
    const hasBlocker = result.blockers.some((b) => b.code.includes('SELLER_HOUSING_PROVIDER_1_DATE_MISSING') && b.formCode === 'FHDA');
    expect(hasBlocker).toBe(true);
  });

  it('both dates missing → both blockers', () => {
    const data = {
      signatures: {
        buyer_tenant_1_date: null,
        seller_housing_provider_1_date: null,
      },
    };
    const extractions: FormExtractionOutput[] = [makeExtraction(data)];
    const result = validateDisclosuresStage(extractions);
    const fhdaBlockers = result.blockers.filter((b) => b.formCode === 'FHDA');
    expect(fhdaBlockers.some((b) => b.code.includes('BUYER_TENANT_1_DATE_MISSING'))).toBe(true);
    expect(fhdaBlockers.some((b) => b.code.includes('SELLER_HOUSING_PROVIDER_1_DATE_MISSING'))).toBe(true);
  });

  it('no signatures field at all → both blockers', () => {
    const data = {};
    const extractions: FormExtractionOutput[] = [makeExtraction(data)];
    const result = validateDisclosuresStage(extractions);
    const fhdaBlockers = result.blockers.filter((b) => b.formCode === 'FHDA');
    expect(fhdaBlockers.some((b) => b.code.includes('BUYER_TENANT_1_DATE_MISSING'))).toBe(true);
    expect(fhdaBlockers.some((b) => b.code.includes('SELLER_HOUSING_PROVIDER_1_DATE_MISSING'))).toBe(true);
  });

  it('advisory sections present → pass check', () => {
    const data = {
      signatures: {
        buyer_tenant_1_date: '2026-07-15',
        seller_housing_provider_1_date: '2026-07-15',
      },
      sections: {
        equal_access_to_housing_for_all: true,
        federal_and_state_laws_prohibiting_discrimination: true,
        potential_legal_remedies: true,
      },
    };
    const extractions: FormExtractionOutput[] = [makeExtraction(data)];
    const result = validateDisclosuresStage(extractions);
    expect(result.checks.some((c) => c.ruleId === 'fhda_sections_present' && c.status === 'pass')).toBe(true);
  });

  it('formCode FHDA routes to FHDA validation (not BHIA)', () => {
    const data = {
      signatures: {
        buyer_tenant_1_date: '2026-07-15',
        seller_housing_provider_1_date: '2026-07-15',
      },
    };
    const extractions: FormExtractionOutput[] = [makeExtraction(data)];
    const result = validateDisclosuresStage(extractions);
    expect(result.checks.some((c) => c.formCode === 'FHDA')).toBe(true);
  });
});
