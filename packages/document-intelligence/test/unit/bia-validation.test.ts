import { describe, it, expect } from 'vitest';
import { validateBiaWithSchema } from '../../src/validator/bia-validation';
import { validateDisclosuresStage } from '../../src/validator/stages/disclosures.stage';
import type { FormExtractionOutput } from '../../src/extractor/extractor.types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function validBia() {
  return {
    form_type: 'BIA' as const,
    form_validation: {
      is_bia: true,
      form_title: "BUYER'S INVESTIGATION ADVISORY",
      form_revision: '6/25',
      expected_page_count: 2,
      detected_logical_pages: [1, 2],
      all_required_pages_present: true,
      missing_pages: [],
      duplicate_pages: [],
      page_order_valid: true,
      mixed_form_revisions: false,
      document_complete: true,
      form_identity_status: 'valid' as const,
    },
    transaction_context: {
      expected_buyers: 1,
      expected_buyer_names: ['John Buyer'],
      expected_property_address: '123 Main St, Los Angeles, CA 90001',
    },
    page_1: {
      page_present: true,
      correct_page_label: true,
      page_revision: '6/25',
      section_1_importance_of_property_investigation_present: true,
      section_2_broker_obligations_present: true,
      section_3_investigation_advice_heading_present: true,
      investigation_categories: {
        section_3a_general_condition_present: true,
        section_3b_square_footage_age_boundaries_present: true,
        section_3c_wood_destroying_pests_present: true,
        section_3d_soil_stability_present: true,
        section_3e_water_utilities_well_waste_present: true,
        section_3f_environmental_hazards_present: true,
        section_3g_earthquakes_and_flooding_present: true,
        section_3h_fire_hazard_and_other_insurance_present: true,
        section_3i_building_permits_zoning_address_present: true,
        section_3j_rental_property_restrictions_present: true,
        section_3k_security_and_safety_present: true,
        section_3l_utilities_sewer_internet_present: true,
        section_3m_solar_power_system_present: true,
        all_page_1_categories_present: true,
      },
      prohibited_execution_requirements: {
        buyer_signatures_present_on_page: false,
        buyer_signatures_required_on_page: false,
        buyer_initials_present_on_page: false,
        buyer_initials_required_on_page: false,
        seller_signatures_present_on_page: false,
        seller_signatures_required_on_page: false,
        seller_initials_present_on_page: false,
        seller_initials_required_on_page: false,
        broker_or_agent_signature_required_on_page: false,
      },
      page_completion_status: 'complete' as const,
    },
    page_2: {
      page_present: true,
      correct_page_label: true,
      page_revision: '6/25',
      section_3n_neighborhood_area_subdivision_conditions_present: true,
      acknowledgement_text_present: true,
      buyer_acknowledgements: {
        buyer_1: {
          signature_present: true,
          signature_text: 'John Buyer',
          signature_type: 'handwritten' as const,
          signer_matches_expected_buyer: true,
          date: '2026-07-15',
          date_present: true,
          date_valid: true,
          completion_status: 'complete' as const,
        },
        buyer_2: {
          signature_present: false,
          signature_text: null,
          signature_type: 'blank' as const,
          signer_matches_expected_buyer: null,
          date: null,
          date_present: false,
          date_valid: null,
          completion_status: 'missing_signature_and_date' as const,
        },
        required_signature_count: 1,
        valid_required_signature_count: 1,
        missing_required_signature_count: 0,
        missing_required_date_count: 0,
        all_required_buyers_signed: true,
        all_required_signatures_dated: true,
        completion_status: 'complete' as const,
      },
      prohibited_execution_requirements: {
        buyer_initials_present_on_page: false,
        buyer_initials_required_on_page: false,
        seller_signatures_present_on_page: false,
        seller_signatures_required_on_page: false,
        seller_initials_present_on_page: false,
        seller_initials_required_on_page: false,
        broker_or_agent_signature_required_on_page: false,
      },
      page_completion_status: 'complete' as const,
    },
    cross_page_validation: {
      revision_consistent: true,
      page_sequence_consistent: true,
      pages_appear_to_belong_to_same_form_set: true,
      cross_page_status: 'consistent' as const,
      inconsistency_messages: [],
    },
    non_required_fields: {
      property_address_required_on_form: false,
      buyer_initials_required: false,
      seller_signatures_required: false,
      seller_initials_required: false,
      broker_signature_required: false,
      agent_signature_required: false,
      escrow_signature_required: false,
      investigation_checkboxes_required: false,
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
    formCode: 'BIA',
    formName: "Buyer's Investigation Advisory",
    confidence: 0.95,
    data,
  };
}

// ─── Schema validation tests ──────────────────────────────────────────────────

describe('validateBiaWithSchema', () => {
  it('happy path — well-formed BIA passes with no blockers', () => {
    const result = validateBiaWithSchema(validBia() as unknown as Record<string, unknown>);
    const blockerCodes = result.issues.filter((i) => i.code.startsWith('BLOCKER')).map((i) => i.code);
    expect(blockerCodes).toHaveLength(0);
    expect(result.checks.length).toBeGreaterThan(0);
  });

  it('wrong form type — emits BLOCKER_BIA_WRONG_FORM', () => {
    const result = validateBiaWithSchema({ form_type: 'BHIA' } as unknown as Record<string, unknown>);
    expect(result.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'BLOCKER_BIA_WRONG_FORM' })]),
    );
  });

  it('missing page 1 — emits BLOCKER_BIA_PAGE_MISSING', () => {
    const data = validBia();
    data.page_1.page_present = false;
    data.form_validation.document_complete = false;
    data.form_validation.form_identity_status = 'missing_pages';
    data.form_validation.missing_pages = [1];
    const result = validateBiaWithSchema(data as unknown as Record<string, unknown>);
    expect(result.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'BLOCKER_BIA_PAGE_MISSING' })]),
    );
  });

  it('missing page 2 — emits BLOCKER_BIA_PAGE_MISSING', () => {
    const data = validBia();
    data.page_2.page_present = false;
    data.form_validation.document_complete = false;
    data.form_validation.form_identity_status = 'missing_pages';
    data.form_validation.missing_pages = [2];
    const result = validateBiaWithSchema(data as unknown as Record<string, unknown>);
    expect(result.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'BLOCKER_BIA_PAGE_MISSING' })]),
    );
  });

  it('acknowledgment missing — emits BLOCKER_BIA_ACKNOWLEDGMENT_MISSING', () => {
    const data = validBia();
    data.page_2.acknowledgement_text_present = false;
    const result = validateBiaWithSchema(data as unknown as Record<string, unknown>);
    expect(result.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'BLOCKER_BIA_ACKNOWLEDGMENT_MISSING' })]),
    );
  });

  it('missing buyer 1 signature — emits BLOCKER_BIA_BUYER_1_SIGNATURE_MISSING', () => {
    const data = validBia();
    data.page_2.buyer_acknowledgements.buyer_1.signature_present = false;
    data.page_2.buyer_acknowledgements.buyer_1.completion_status = 'missing_signature';
    const result = validateBiaWithSchema(data as unknown as Record<string, unknown>);
    expect(result.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'BLOCKER_BIA_BUYER_1_SIGNATURE_MISSING' })]),
    );
  });

  it('missing buyer 1 date — emits BLOCKER_BIA_BUYER_1_DATE_MISSING', () => {
    const data = validBia();
    data.page_2.buyer_acknowledgements.buyer_1.date_present = false;
    data.page_2.buyer_acknowledgements.buyer_1.completion_status = 'missing_date';
    const result = validateBiaWithSchema(data as unknown as Record<string, unknown>);
    expect(result.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'BLOCKER_BIA_BUYER_1_DATE_MISSING' })]),
    );
  });

  it('2 buyers required, buyer 2 missing — emits BLOCKER_BIA_BUYER_2_SIGNATURE_MISSING', () => {
    const data = validBia();
    data.transaction_context.expected_buyers = 2;
    data.page_2.buyer_acknowledgements.required_signature_count = 2;
    data.page_2.buyer_acknowledgements.buyer_2.signature_present = false;
    data.page_2.buyer_acknowledgements.buyer_2.completion_status = 'missing_signature_and_date';
    data.page_2.buyer_acknowledgements.all_required_buyers_signed = false;
    const result = validateBiaWithSchema(data as unknown as Record<string, unknown>);
    expect(result.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'BLOCKER_BIA_BUYER_2_SIGNATURE_MISSING' })]),
    );
  });

  it('2 buyers required, buyer 2 missing date — emits BLOCKER_BIA_BUYER_2_DATE_MISSING', () => {
    const data = validBia();
    data.transaction_context.expected_buyers = 2;
    data.page_2.buyer_acknowledgements.required_signature_count = 2;
    data.page_2.buyer_acknowledgements.buyer_2.signature_present = true;
    data.page_2.buyer_acknowledgements.buyer_2.signature_text = 'Jane Buyer';
    data.page_2.buyer_acknowledgements.buyer_2.date_present = false;
    data.page_2.buyer_acknowledgements.buyer_2.completion_status = 'missing_date';
    data.page_2.buyer_acknowledgements.all_required_signatures_dated = false;
    const result = validateBiaWithSchema(data as unknown as Record<string, unknown>);
    expect(result.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'BLOCKER_BIA_BUYER_2_DATE_MISSING' })]),
    );
  });

  it('signer mismatch — emits BLOCKER_BIA_BUYER_SIGNER_MISMATCH', () => {
    const data = validBia();
    data.page_2.buyer_acknowledgements.buyer_1.signer_matches_expected_buyer = false;
    data.page_2.buyer_acknowledgements.buyer_1.signature_text = 'Wrong Person';
    const result = validateBiaWithSchema(data as unknown as Record<string, unknown>);
    expect(result.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'BLOCKER_BIA_BUYER_SIGNER_MISMATCH' })]),
    );
  });

  it('unreadable signature — emits WARN_BIA_SIGNATURE_UNREADABLE', () => {
    const data = validBia();
    data.page_2.buyer_acknowledgements.buyer_1.signature_type = 'unreadable';
    data.page_2.buyer_acknowledgements.buyer_1.signature_text = null;
    const result = validateBiaWithSchema(data as unknown as Record<string, unknown>);
    expect(result.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'WARN_BIA_SIGNATURE_UNREADABLE' })]),
    );
  });

  it('unknown buyer count — emits WARN_BIA_BUYER_COUNT_UNKNOWN', () => {
    const data = validBia();
    data.transaction_context.expected_buyers = null;
    data.page_2.buyer_acknowledgements.required_signature_count = null;
    data.page_2.buyer_acknowledgements.completion_status = 'unknown';
    const result = validateBiaWithSchema(data as unknown as Record<string, unknown>);
    expect(result.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'WARN_BIA_BUYER_COUNT_UNKNOWN' })]),
    );
  });

  it('manual review — emits WARN_BIA_MANUAL_REVIEW', () => {
    const data = validBia();
    data.validation_summary.overall_status = 'manual_review_required';
    data.validation_summary.has_warning = true;
    const result = validateBiaWithSchema(data as unknown as Record<string, unknown>);
    expect(result.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'WARN_BIA_MANUAL_REVIEW' })]),
    );
  });

  it('document incomplete — emits BLOCKER_BIA_CONTENT_INCOMPLETE', () => {
    const data = validBia();
    data.form_validation.document_complete = false;
    const result = validateBiaWithSchema(data as unknown as Record<string, unknown>);
    expect(result.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'BLOCKER_BIA_CONTENT_INCOMPLETE' })]),
    );
  });

  it('mixed revision — emits BLOCKER_BIA_MIXED_REVISION', () => {
    const data = validBia();
    data.form_validation.form_identity_status = 'mixed_revision';
    data.form_validation.mixed_form_revisions = true;
    const result = validateBiaWithSchema(data as unknown as Record<string, unknown>);
    expect(result.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'BLOCKER_BIA_MIXED_REVISION' })]),
    );
  });

  it('wrong page order — emits BLOCKER_BIA_WRONG_PAGE_ORDER', () => {
    const data = validBia();
    data.form_validation.form_identity_status = 'wrong_page_order';
    data.form_validation.page_order_valid = false;
    const result = validateBiaWithSchema(data as unknown as Record<string, unknown>);
    expect(result.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'BLOCKER_BIA_WRONG_PAGE_ORDER' })]),
    );
  });

  it('page 1 content incomplete — emits BLOCKER_BIA_CONTENT_INCOMPLETE', () => {
    const data = validBia();
    data.page_1.page_completion_status = 'content_incomplete';
    data.page_1.investigation_categories.all_page_1_categories_present = false;
    data.page_1.section_1_importance_of_property_investigation_present = false;
    const result = validateBiaWithSchema(data as unknown as Record<string, unknown>);
    expect(result.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'BLOCKER_BIA_CONTENT_INCOMPLETE' })]),
    );
  });

  it('non-required fields — no blocker for missing initials, seller sigs, property address', () => {
    const data = validBia();
    // Verify non-required fields are all false (not required)
    expect(data.non_required_fields.buyer_initials_required).toBe(false);
    expect(data.non_required_fields.seller_signatures_required).toBe(false);
    expect(data.non_required_fields.property_address_required_on_form).toBe(false);
    expect(data.non_required_fields.broker_signature_required).toBe(false);
    expect(data.non_required_fields.agent_signature_required).toBe(false);
  });

  describe('Seller Agent upload — BIA has no seller-side content at all, so buyer checks are the whole form', () => {
    it('does not blocker on a missing buyer signature when uploaded via the Seller Agent link', () => {
      const data = validBia();
      data.page_2.buyer_acknowledgements.buyer_1.signature_present = false;
      data.page_2.buyer_acknowledgements.buyer_1.completion_status = 'missing_signature';
      const result = validateBiaWithSchema(data as unknown as Record<string, unknown>, 'seller_agent');
      expect(result.issues.some((i) => i.code === 'BLOCKER_BIA_BUYER_1_SIGNATURE_MISSING')).toBe(false);
    });

    it('does not blocker on a missing buyer date when uploaded via the Seller Agent link', () => {
      const data = validBia();
      data.page_2.buyer_acknowledgements.buyer_1.date_present = false;
      data.page_2.buyer_acknowledgements.buyer_1.completion_status = 'missing_date';
      const result = validateBiaWithSchema(data as unknown as Record<string, unknown>, 'seller_agent');
      expect(result.issues.some((i) => i.code === 'BLOCKER_BIA_BUYER_1_DATE_MISSING')).toBe(false);
    });

    it('still blockers on a missing buyer signature for a regular (non-seller-agent) upload — regression', () => {
      const data = validBia();
      data.page_2.buyer_acknowledgements.buyer_1.signature_present = false;
      data.page_2.buyer_acknowledgements.buyer_1.completion_status = 'missing_signature';
      const result = validateBiaWithSchema(data as unknown as Record<string, unknown>);
      expect(result.issues.some((i) => i.code === 'BLOCKER_BIA_BUYER_1_SIGNATURE_MISSING')).toBe(true);
    });

    it('still runs page 2 content checks (acknowledgment text, Section 3N) for a Seller Agent upload — only the buyer signature is suppressed', () => {
      const data = validBia();
      data.page_2.acknowledgement_text_present = false;
      const result = validateBiaWithSchema(data as unknown as Record<string, unknown>, 'seller_agent');
      expect(result.issues.some((i) => i.code === 'BLOCKER_BIA_ACKNOWLEDGMENT_MISSING')).toBe(true);
    });

    it('still runs page 1 and form-identity checks for a Seller Agent upload', () => {
      const data = validBia();
      data.form_validation.form_identity_status = 'wrong_form';
      const result = validateBiaWithSchema(data as unknown as Record<string, unknown>, 'seller_agent');
      expect(result.issues.some((i) => i.code === 'BLOCKER_BIA_WRONG_FORM')).toBe(true);
    });
  });
});

// ─── Integration with validateDisclosuresStage ────────────────────────────────

describe('validateDisclosuresStage — BIA integration', () => {
  it('valid BIA passes with checks', () => {
    const extractions = [makeExtraction(validBia())];
    const result = validateDisclosuresStage(extractions);
    expect(result.checks.some((c) => c.formCode === 'BIA')).toBe(true);
  });

  it('missing buyer 1 signature → blocker', () => {
    const data = validBia();
    data.page_2.buyer_acknowledgements.buyer_1.signature_present = false;
    data.page_2.buyer_acknowledgements.buyer_1.completion_status = 'missing_signature';
    const extractions = [makeExtraction(data)];
    const result = validateDisclosuresStage(extractions);
    const hasBlocker = result.blockers.some((b) => b.code.includes('BUYER_1_SIGNATURE_MISSING') && b.formCode === 'BIA');
    expect(hasBlocker).toBe(true);
  });

  it('missing buyer 1 date → blocker', () => {
    const data = validBia();
    data.page_2.buyer_acknowledgements.buyer_1.date_present = false;
    data.page_2.buyer_acknowledgements.buyer_1.completion_status = 'missing_date';
    const extractions = [makeExtraction(data)];
    const result = validateDisclosuresStage(extractions);
    const hasBlocker = result.blockers.some((b) => b.code.includes('BUYER_1_DATE_MISSING') && b.formCode === 'BIA');
    expect(hasBlocker).toBe(true);
  });

  it('2 buyers, buyer 2 missing → blocker', () => {
    const data = validBia();
    data.transaction_context.expected_buyers = 2;
    data.page_2.buyer_acknowledgements.required_signature_count = 2;
    data.page_2.buyer_acknowledgements.buyer_2.signature_present = false;
    data.page_2.buyer_acknowledgements.buyer_2.completion_status = 'missing_signature_and_date';
    data.page_2.buyer_acknowledgements.all_required_buyers_signed = false;
    const extractions = [makeExtraction(data)];
    const result = validateDisclosuresStage(extractions);
    const hasBlocker = result.blockers.some((b) => b.code.includes('BUYER_2_SIGNATURE_MISSING') && b.formCode === 'BIA');
    expect(hasBlocker).toBe(true);
  });

  it('acknowledgment missing → blocker', () => {
    const data = validBia();
    data.page_2.acknowledgement_text_present = false;
    const extractions = [makeExtraction(data)];
    const result = validateDisclosuresStage(extractions);
    const hasBlocker = result.blockers.some((b) => b.code.includes('ACKNOWLEDGMENT_MISSING') && b.formCode === 'BIA');
    expect(hasBlocker).toBe(true);
  });

  it('no BIA-specific check for missing initials or seller signatures', () => {
    const data = validBia();
    const extractions = [makeExtraction(data)];
    const result = validateDisclosuresStage(extractions);
    // Should not have any BIA blockers for non-required fields
    const biaBlockers = result.blockers.filter((b) => b.formCode === 'BIA');
    const initialsBlocker = biaBlockers.find((b) => b.code.includes('INITIALS'));
    const sellerBlocker = biaBlockers.find((b) => b.code.includes('SELLER'));
    expect(initialsBlocker).toBeUndefined();
    expect(sellerBlocker).toBeUndefined();
  });
});

// ─── Standard extraction fallback tests ───────────────────────────────────────

describe('validateDisclosuresStage — BIA standard extraction fallback', () => {
  it('buyer_1_signed true → execution_valid pass, no blockers', () => {
    const data = {
      buyer_acknowledgement: {
        buyer_1_signed: true,
        buyer_1_signature_date: '2026-07-15',
        buyer_2_signed: false,
        buyer_2_signature_date: null,
      },
    };
    const extractions: FormExtractionOutput[] = [makeExtraction(data)];
    const result = validateDisclosuresStage(extractions);
    expect(result.checks.some((c) => c.ruleId === 'bia_execution_valid' && c.status === 'pass')).toBe(true);
    expect(result.blockers.filter((b) => b.formCode === 'BIA').length).toBe(0);
  });

  it('buyer_1_signed false → BLOCKER_BIA_BUYER_1_SIGNATURE_MISSING', () => {
    const data = {
      buyer_acknowledgement: {
        buyer_1_signed: false,
        buyer_1_signature_date: null,
        buyer_2_signed: false,
        buyer_2_signature_date: null,
      },
    };
    const extractions: FormExtractionOutput[] = [makeExtraction(data)];
    const result = validateDisclosuresStage(extractions);
    const hasBlocker = result.blockers.some((b) => b.code.includes('BUYER_1_SIGNATURE_MISSING') && b.formCode === 'BIA');
    expect(hasBlocker).toBe(true);
  });

  it('buyer 1 signed but date missing → BLOCKER_BIA_BUYER_1_DATE_MISSING', () => {
    const data = {
      buyer_acknowledgement: {
        buyer_1_signed: true,
        buyer_1_signature_date: null,
        buyer_2_signed: false,
        buyer_2_signature_date: null,
      },
    };
    const extractions: FormExtractionOutput[] = [makeExtraction(data)];
    const result = validateDisclosuresStage(extractions);
    const hasBlocker = result.blockers.some((b) => b.code.includes('BUYER_1_DATE_MISSING') && b.formCode === 'BIA');
    expect(hasBlocker).toBe(true);
  });

  it('buyer 2 signed with date → no blockers (only 1 buyer expected)', () => {
    const data = {
      buyer_acknowledgement: {
        buyer_1_signed: true,
        buyer_1_signature_date: '2026-07-15',
        buyer_2_signed: true,
        buyer_2_signature_date: '2026-07-16',
      },
    };
    const extractions: FormExtractionOutput[] = [makeExtraction(data)];
    const result = validateDisclosuresStage(extractions);
    expect(result.blockers.filter((b) => b.formCode === 'BIA').length).toBe(0);
  });

  it('buyer 2 signed but date missing → no blocker (only 1 buyer expected)', () => {
    const data = {
      buyer_acknowledgement: {
        buyer_1_signed: true,
        buyer_1_signature_date: '2026-07-15',
        buyer_2_signed: true,
        buyer_2_signature_date: null,
      },
    };
    const extractions: FormExtractionOutput[] = [makeExtraction(data)];
    const result = validateDisclosuresStage(extractions);
    expect(result.blockers.filter((b) => b.formCode === 'BIA').length).toBe(0);
  });

  it('no buyer_acknowledgement data → BLOCKER_BIA_BUYER_1_SIGNATURE_MISSING', () => {
    const data = { header: { property_address: '123 Main St' } };
    const extractions: FormExtractionOutput[] = [makeExtraction(data)];
    const result = validateDisclosuresStage(extractions);
    expect(result.blockers.some((b) => b.code.includes('BUYER_1_SIGNATURE_MISSING') && b.formCode === 'BIA')).toBe(true);
  });

  it('formCode BIA routes to BIA validation (not BHIA)', () => {
    const data = {
      buyer_acknowledgement: {
        buyer_1_signed: true,
        buyer_1_signature_date: '2026-07-15',
        buyer_2_signed: false,
        buyer_2_signature_date: null,
      },
    };
    const extractions: FormExtractionOutput[] = [makeExtraction(data)];
    const result = validateDisclosuresStage(extractions);
    expect(result.checks.some((c) => c.formCode === 'BIA')).toBe(true);
  });
});
