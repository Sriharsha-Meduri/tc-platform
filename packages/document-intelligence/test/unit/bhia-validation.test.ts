import { describe, it, expect } from 'vitest';
import { validateBhiaWithSchema } from '../../src/validator/bhia-validation';
import type { BhiaValidationOutput } from '../../src/extractor/forms/bhia/bhia.validation.v06-24';
import type { FormExtractionOutput } from '../../src/extractor/extractor.types';
import { validateDisclosuresStage } from '../../src/validator/stages/disclosures.stage';

function validBhia(overrides?: Partial<BhiaValidationOutput>): BhiaValidationOutput {
  return {
    form_type: 'BHIA',
    form_validation: {
      is_bhia: true,
      form_title: 'BUYER HOMEOWNERS\' INSURANCE ADVISORY',
      form_revision: 'BHIA 6/24',
      logical_page_number: 1,
      expected_page_count: 1,
      correct_page_label: true,
      document_complete: true,
      form_identity_status: 'valid',
    },
    transaction_context: {
      expected_buyers: 1,
      expected_buyer_names: ['Alice Smith'],
      expected_property_address: '123 Main St, Los Angeles, CA',
    },
    advisory_content_validation: {
      section_1_importance_of_obtaining_property_insurance_present: true,
      section_2_property_insurance_and_purchase_contract_terms_present: true,
      section_3_california_property_insurance_market_present: true,
      section_4_insurance_conditions_present: true,
      section_5_resources_present: true,
      section_6_broker_recommendation_present: true,
      acknowledgement_text_present: true,
      all_required_sections_present: true,
    },
    buyer_acknowledgements: {
      buyer_1: {
        signature_present: true,
        signature_text: 'Alice Smith',
        signature_type: 'handwritten',
        signer_matches_expected_buyer: true,
        date: '2024-03-15',
        date_present: true,
        date_valid: true,
        completion_status: 'complete',
      },
      buyer_2: {
        signature_present: false,
        signature_text: null,
        signature_type: 'blank',
        signer_matches_expected_buyer: null,
        date: null,
        date_present: false,
        date_valid: null,
        completion_status: 'missing_signature',
      },
      required_signature_count: 1,
      valid_required_signature_count: 1,
      missing_required_signature_count: 0,
      missing_required_date_count: 0,
      all_required_buyers_signed: true,
      all_required_signatures_dated: true,
      completion_status: 'complete',
    },
    non_required_execution_fields: {
      buyer_initials_fields_present: false,
      buyer_initials_required: false,
      seller_signature_fields_present: false,
      seller_signatures_required: false,
      seller_initials_fields_present: false,
      seller_initials_required: false,
      broker_signature_fields_present: false,
      broker_signature_required: false,
      agent_signature_fields_present: false,
      agent_signature_required: false,
    },
    validation_summary: {
      has_blocker: false,
      has_warning: false,
      blocker_codes: [],
      blocker_messages: [],
      warning_codes: [],
      warning_messages: [],
      overall_status: 'complete',
    },
    ...overrides,
  };
}

function makeExtraction(data: BhiaValidationOutput): FormExtractionOutput {
  return {
    formCode: 'BHIA',
    pageNumber: 1,
    confidence: 0.95,
    data: data as unknown as Record<string, unknown>,
  } as FormExtractionOutput;
}

describe('validateBhiaWithSchema', () => {
  describe('happy path — complete valid BHIA', () => {
    it('returns no issues and pass checks for a complete, valid BHIA', () => {
      const result = validateBhiaWithSchema(validBhia());
      expect(result.issues).toHaveLength(0);
      expect(result.checks.some(c => c.status === 'pass')).toBe(true);
    });

    it('returns no issues when 2 expected buyers both signed and dated', () => {
      const data = validBhia({
        transaction_context: {
          expected_buyers: 2,
          expected_buyer_names: ['Alice Smith', 'Bob Smith'],
          expected_property_address: '123 Main St, Los Angeles, CA',
        },
        buyer_acknowledgements: {
          buyer_1: {
            signature_present: true,
            signature_text: 'Alice Smith',
            signature_type: 'handwritten',
            signer_matches_expected_buyer: true,
            date: '2024-03-15',
            date_present: true,
            date_valid: true,
            completion_status: 'complete',
          },
          buyer_2: {
            signature_present: true,
            signature_text: 'Bob Smith',
            signature_type: 'handwritten',
            signer_matches_expected_buyer: true,
            date: '2024-03-15',
            date_present: true,
            date_valid: true,
            completion_status: 'complete',
          },
          required_signature_count: 2,
          valid_required_signature_count: 2,
          missing_required_signature_count: 0,
          missing_required_date_count: 0,
          all_required_buyers_signed: true,
          all_required_signatures_dated: true,
          completion_status: 'complete',
        },
      });
      const result = validateBhiaWithSchema(data);
      expect(result.issues).toHaveLength(0);
    });

    it('returns no issues when only 1 buyer expected and blank second line', () => {
      const result = validateBhiaWithSchema(validBhia());
      expect(result.issues).toHaveLength(0);
    });
  });

  describe('form identity blockers', () => {
    it('emits BLOCKER_BHIA_WRONG_FORM when form is not BHIA', () => {
      const data = validBhia();
      data.form_validation.form_identity_status = 'wrong_form';
      data.form_validation.is_bhia = false;
      const result = validateBhiaWithSchema(data);
      expect(result.issues.some(i => i.code === 'BLOCKER_BHIA_WRONG_FORM')).toBe(true);
    });

    it('emits BLOCKER_BHIA_WRONG_PAGE when logical page is wrong', () => {
      const data = validBhia();
      data.form_validation.form_identity_status = 'wrong_page';
      data.form_validation.logical_page_number = 2;
      const result = validateBhiaWithSchema(data);
      expect(result.issues.some(i => i.code === 'BLOCKER_BHIA_WRONG_PAGE')).toBe(true);
    });

    it('emits BLOCKER_BHIA_PAGE_MISSING when page is missing', () => {
      const data = validBhia();
      data.form_validation.form_identity_status = 'missing_page';
      const result = validateBhiaWithSchema(data);
      expect(result.issues.some(i => i.code === 'BLOCKER_BHIA_PAGE_MISSING')).toBe(true);
    });
  });

  describe('content completeness blockers', () => {
    it('emits BLOCKER_BHIA_CONTENT_INCOMPLETE when document is incomplete', () => {
      const data = validBhia();
      data.form_validation.document_complete = false;
      const result = validateBhiaWithSchema(data);
      expect(result.issues.some(i => i.code === 'BLOCKER_BHIA_CONTENT_INCOMPLETE')).toBe(true);
    });

    it('emits BLOCKER_BHIA_ACKNOWLEDGMENT_MISSING when acknowledgment is missing', () => {
      const data = validBhia();
      data.advisory_content_validation.acknowledgement_text_present = false;
      const result = validateBhiaWithSchema(data);
      expect(result.issues.some(i => i.code === 'BLOCKER_BHIA_ACKNOWLEDGMENT_MISSING')).toBe(true);
    });

    it('emits BLOCKER_BHIA_CONTENT_INCOMPLETE when sections are missing', () => {
      const data = validBhia();
      data.advisory_content_validation.section_3_california_property_insurance_market_present = false;
      data.advisory_content_validation.all_required_sections_present = false;
      const result = validateBhiaWithSchema(data);
      expect(result.issues.some(i => i.code === 'BLOCKER_BHIA_CONTENT_INCOMPLETE')).toBe(true);
    });
  });

  describe('buyer signature blockers', () => {
    it('emits BLOCKER_BHIA_BUYER_1_SIGNATURE_MISSING when buyer 1 is required and unsigned', () => {
      const data = validBhia();
      data.buyer_acknowledgements.buyer_1.signature_present = false;
      data.buyer_acknowledgements.buyer_1.completion_status = 'missing_signature';
      const result = validateBhiaWithSchema(data);
      expect(result.issues.some(i => i.code === 'BLOCKER_BHIA_BUYER_1_SIGNATURE_MISSING')).toBe(true);
    });

    it('emits BLOCKER_BHIA_BUYER_1_DATE_MISSING when buyer 1 signed but no date', () => {
      const data = validBhia();
      data.buyer_acknowledgements.buyer_1.date_present = false;
      data.buyer_acknowledgements.buyer_1.completion_status = 'missing_date';
      const result = validateBhiaWithSchema(data);
      expect(result.issues.some(i => i.code === 'BLOCKER_BHIA_BUYER_1_DATE_MISSING')).toBe(true);
    });

    it('emits BLOCKER_BHIA_BUYER_2_SIGNATURE_MISSING when buyer 2 is required and unsigned', () => {
      const data = validBhia({
        transaction_context: {
          expected_buyers: 2,
          expected_buyer_names: ['Alice Smith', 'Bob Smith'],
          expected_property_address: '123 Main St',
        },
        buyer_acknowledgements: {
          buyer_1: {
            signature_present: true,
            signature_text: 'Alice Smith',
            signature_type: 'handwritten',
            signer_matches_expected_buyer: true,
            date: '2024-03-15',
            date_present: true,
            date_valid: true,
            completion_status: 'complete',
          },
          buyer_2: {
            signature_present: false,
            signature_text: null,
            signature_type: 'blank',
            signer_matches_expected_buyer: null,
            date: null,
            date_present: false,
            date_valid: null,
            completion_status: 'missing_signature',
          },
          required_signature_count: 2,
          valid_required_signature_count: 1,
          missing_required_signature_count: 1,
          missing_required_date_count: 0,
          all_required_buyers_signed: false,
          all_required_signatures_dated: false,
          completion_status: 'missing_signature',
        },
      });
      const result = validateBhiaWithSchema(data);
      expect(result.issues.some(i => i.code === 'BLOCKER_BHIA_BUYER_2_SIGNATURE_MISSING')).toBe(true);
    });

    it('emits BLOCKER_BHIA_BUYER_2_DATE_MISSING when buyer 2 signed but no date', () => {
      const data = validBhia({
        transaction_context: {
          expected_buyers: 2,
          expected_buyer_names: ['Alice Smith', 'Bob Smith'],
          expected_property_address: '123 Main St',
        },
        buyer_acknowledgements: {
          buyer_1: {
            signature_present: true,
            signature_text: 'Alice Smith',
            signature_type: 'handwritten',
            signer_matches_expected_buyer: true,
            date: '2024-03-15',
            date_present: true,
            date_valid: true,
            completion_status: 'complete',
          },
          buyer_2: {
            signature_present: true,
            signature_text: 'Bob Smith',
            signature_type: 'handwritten',
            signer_matches_expected_buyer: true,
            date: null,
            date_present: false,
            date_valid: null,
            completion_status: 'missing_date',
          },
          required_signature_count: 2,
          valid_required_signature_count: 2,
          missing_required_signature_count: 0,
          missing_required_date_count: 1,
          all_required_buyers_signed: true,
          all_required_signatures_dated: false,
          completion_status: 'missing_date',
        },
      });
      const result = validateBhiaWithSchema(data);
      expect(result.issues.some(i => i.code === 'BLOCKER_BHIA_BUYER_2_DATE_MISSING')).toBe(true);
    });

    it('does NOT emit buyer 1 blocker when required count is 0', () => {
      const data = validBhia();
      data.buyer_acknowledgements.required_signature_count = 0;
      data.buyer_acknowledgements.buyer_1.signature_present = false;
      const result = validateBhiaWithSchema(data);
      expect(result.issues.some(i => i.code === 'BLOCKER_BHIA_BUYER_1_SIGNATURE_MISSING')).toBe(false);
    });

    it('does NOT emit buyer 2 blocker when only 1 buyer is expected', () => {
      const data = validBhia();
      data.buyer_acknowledgements.required_signature_count = 1;
      data.buyer_acknowledgements.buyer_2.signature_present = false;
      const result = validateBhiaWithSchema(data);
      expect(result.issues.some(i => i.code === 'BLOCKER_BHIA_BUYER_2_SIGNATURE_MISSING')).toBe(false);
    });

    it('emits BLOCKER_BHIA_BUYER_SIGNER_MISMATCH when signer does not match expected buyer', () => {
      const data = validBhia();
      data.buyer_acknowledgements.buyer_1.signer_matches_expected_buyer = false;
      data.buyer_acknowledgements.buyer_1.signature_text = 'Charlie Brown';
      const result = validateBhiaWithSchema(data);
      expect(result.issues.some(i => i.code === 'BLOCKER_BHIA_BUYER_SIGNER_MISMATCH')).toBe(true);
      const mismatchIssue = result.issues.find(i => i.code === 'BLOCKER_BHIA_BUYER_SIGNER_MISMATCH');
      expect(mismatchIssue?.location).toContain('Alice Smith');
      expect(mismatchIssue?.location).toContain('Charlie Brown');
    });
  });

  describe('warnings', () => {
    it('emits WARN_BHIA_BUYER_COUNT_UNKNOWN when required count is null', () => {
      const data = validBhia();
      data.buyer_acknowledgements.required_signature_count = null;
      const result = validateBhiaWithSchema(data);
      expect(result.issues.some(i => i.code === 'WARN_BHIA_BUYER_COUNT_UNKNOWN')).toBe(true);
    });

    it('emits WARN_BHIA_SIGNATURE_UNREADABLE for buyer 1 unreadable signature', () => {
      const data = validBhia();
      data.buyer_acknowledgements.buyer_1.signature_type = 'unreadable';
      data.buyer_acknowledgements.buyer_1.signature_text = null;
      const result = validateBhiaWithSchema(data);
      expect(result.issues.some(i => i.code === 'WARN_BHIA_SIGNATURE_UNREADABLE')).toBe(true);
    });

    it('emits WARN_BHIA_SIGNATURE_UNREADABLE for buyer 2 unreadable signature', () => {
      const data = validBhia({
        transaction_context: {
          expected_buyers: 2,
          expected_buyer_names: ['Alice Smith', 'Bob Smith'],
          expected_property_address: '123 Main St',
        },
        buyer_acknowledgements: {
          buyer_1: {
            signature_present: true,
            signature_text: 'Alice Smith',
            signature_type: 'handwritten',
            signer_matches_expected_buyer: true,
            date: '2024-03-15',
            date_present: true,
            date_valid: true,
            completion_status: 'complete',
          },
          buyer_2: {
            signature_present: true,
            signature_text: null,
            signature_type: 'unreadable',
            signer_matches_expected_buyer: null,
            date: '2024-03-15',
            date_present: true,
            date_valid: true,
            completion_status: 'complete',
          },
          required_signature_count: 2,
          valid_required_signature_count: 2,
          missing_required_signature_count: 0,
          missing_required_date_count: 0,
          all_required_buyers_signed: true,
          all_required_signatures_dated: true,
          completion_status: 'complete',
        },
      });
      const result = validateBhiaWithSchema(data);
      expect(result.issues.some(i => i.code === 'WARN_BHIA_SIGNATURE_UNREADABLE' && i.location?.includes('Buyer 2'))).toBe(true);
    });

    it('emits WARN_BHIA_SIGNER_IDENTITY_UNKNOWN when signature present but matcher is null', () => {
      const data = validBhia();
      data.buyer_acknowledgements.buyer_1.signer_matches_expected_buyer = null;
      const result = validateBhiaWithSchema(data);
      expect(result.issues.some(i => i.code === 'WARN_BHIA_SIGNER_IDENTITY_UNKNOWN')).toBe(true);
    });

    it('emits WARN_BHIA_MANUAL_REVIEW when overall status is manual_review_required', () => {
      const data = validBhia();
      data.validation_summary.overall_status = 'manual_review_required';
      const result = validateBhiaWithSchema(data);
      expect(result.issues.some(i => i.code === 'WARN_BHIA_MANUAL_REVIEW')).toBe(true);
    });
  });

  describe('multiple blockers', () => {
    it('emits multiple issues when multiple problems exist', () => {
      const data = validBhia({
        transaction_context: {
          expected_buyers: 2,
          expected_buyer_names: ['Alice Smith', 'Bob Smith'],
          expected_property_address: '123 Main St',
        },
        buyer_acknowledgements: {
          buyer_1: {
            signature_present: false,
            signature_text: null,
            signature_type: 'blank',
            signer_matches_expected_buyer: null,
            date: null,
            date_present: false,
            date_valid: null,
            completion_status: 'missing_signature',
          },
          buyer_2: {
            signature_present: true,
            signature_text: 'Bob Smith',
            signature_type: 'handwritten',
            signer_matches_expected_buyer: true,
            date: null,
            date_present: false,
            date_valid: null,
            completion_status: 'missing_date',
          },
          required_signature_count: 2,
          valid_required_signature_count: 1,
          missing_required_signature_count: 1,
          missing_required_date_count: 1,
          all_required_buyers_signed: false,
          all_required_signatures_dated: false,
          completion_status: 'missing_signature_and_date',
        },
      });
      const result = validateBhiaWithSchema(data);
      expect(result.issues.some(i => i.code === 'BLOCKER_BHIA_BUYER_1_SIGNATURE_MISSING')).toBe(true);
      expect(result.issues.some(i => i.code === 'BLOCKER_BHIA_BUYER_2_DATE_MISSING')).toBe(true);
    });
  });

  describe('no non-required field blockers', () => {
    it('never emits a blocker for missing buyer initials', () => {
      const data = validBhia();
      data.non_required_execution_fields.buyer_initials_fields_present = false;
      const result = validateBhiaWithSchema(data);
      expect(result.issues).toHaveLength(0);
    });

    it('never emits a blocker for missing seller signatures', () => {
      const data = validBhia();
      data.non_required_execution_fields.seller_signature_fields_present = false;
      const result = validateBhiaWithSchema(data);
      expect(result.issues).toHaveLength(0);
    });

    it('never emits a blocker for missing broker or agent signatures', () => {
      const data = validBhia();
      data.non_required_execution_fields.broker_signature_fields_present = false;
      data.non_required_execution_fields.agent_signature_fields_present = false;
      const result = validateBhiaWithSchema(data);
      expect(result.issues).toHaveLength(0);
    });
  });

  describe('Seller Agent upload — BHIA has no seller-side content at all, so buyer checks are the whole form', () => {
    it('does not blocker on a missing buyer signature when uploaded via the Seller Agent link', () => {
      const data = validBhia();
      data.buyer_acknowledgements.buyer_1.signature_present = false;
      data.buyer_acknowledgements.buyer_1.completion_status = 'missing_signature';
      const result = validateBhiaWithSchema(data, 'seller_agent');
      expect(result.issues.some(i => i.code === 'BLOCKER_BHIA_BUYER_1_SIGNATURE_MISSING')).toBe(false);
    });

    it('does not blocker on a missing buyer date when uploaded via the Seller Agent link', () => {
      const data = validBhia();
      data.buyer_acknowledgements.buyer_1.date_present = false;
      data.buyer_acknowledgements.buyer_1.completion_status = 'missing_date';
      const result = validateBhiaWithSchema(data, 'seller_agent');
      expect(result.issues.some(i => i.code === 'BLOCKER_BHIA_BUYER_1_DATE_MISSING')).toBe(false);
    });

    it('still blockers on a missing buyer signature for a regular (non-seller-agent) upload — regression', () => {
      const data = validBhia();
      data.buyer_acknowledgements.buyer_1.signature_present = false;
      data.buyer_acknowledgements.buyer_1.completion_status = 'missing_signature';
      const result = validateBhiaWithSchema(data);
      expect(result.issues.some(i => i.code === 'BLOCKER_BHIA_BUYER_1_SIGNATURE_MISSING')).toBe(true);
    });

    it('still runs form-identity and content checks for a Seller Agent upload — only the buyer signature is suppressed', () => {
      const data = validBhia({
        form_validation: {
          is_bhia: true,
          form_title: 'BUYER HOMEOWNERS\' INSURANCE ADVISORY',
          form_revision: 'BHIA 6/24',
          logical_page_number: 1,
          expected_page_count: 1,
          correct_page_label: true,
          document_complete: false,
          form_identity_status: 'valid',
        },
      });
      const result = validateBhiaWithSchema(data, 'seller_agent');
      expect(result.issues.some(i => i.code === 'BLOCKER_BHIA_CONTENT_INCOMPLETE')).toBe(true);
    });
  });
});

// ── disclosures.stage.ts integration tests ─────────────────────────────────

describe('validateDisclosuresStage — BHIA comprehensive validation', () => {
  it('uses validateBhiaWithSchema when data has form_validation field', () => {
    const data = validBhia();
    const result = validateDisclosuresStage([makeExtraction(data)]);
    expect(result.checks.some(c => c.formCode === 'BHIA' && c.status === 'pass')).toBe(true);
    expect(result.summary.passCount).toBeGreaterThan(0);
  });

  it('emits blockers when BHIA is missing required fields', () => {
    const data = validBhia();
    data.buyer_acknowledgements.buyer_1.signature_present = false;
    data.buyer_acknowledgements.buyer_1.completion_status = 'missing_signature';
    const result = validateDisclosuresStage([makeExtraction(data)]);
    expect(result.blockers.some(b => b.code === 'BLOCKER_BHIA_BUYER_1_SIGNATURE_MISSING')).toBe(true);
    expect(result.summary.overallStatus).toBe('non_compliant');
  });

  it('emits warnings alongside blockers for incomplete BHIA', () => {
    const data = validBhia();
    data.buyer_acknowledgements.required_signature_count = null;
    data.buyer_acknowledgements.buyer_1.signature_type = 'unreadable';
    const result = validateDisclosuresStage([makeExtraction(data)]);
    expect(result.warnings.some(w => w.code === 'WARN_BHIA_BUYER_COUNT_UNKNOWN')).toBe(true);
    expect(result.warnings.some(w => w.code === 'WARN_BHIA_SIGNATURE_UNREADABLE')).toBe(true);
  });

  it('returns compliant for valid BHIA alone — TDS/SPQ/NHD not being uploaded yet is a checklist concern, not a validation blocker', () => {
    const data = validBhia();
    const result = validateDisclosuresStage([makeExtraction(data)]);
    expect(result.summary.overallStatus).toBe('compliant');
    expect(result.blockers.some(b => b.code === 'BLOCKER_TDS_MISSING')).toBe(false);
  });
});

// ── Standard extraction fallback tests ────────────────────────────────────────

describe('BHIA standard extraction fallback', () => {
  function makeStandardExtraction(data: Record<string, unknown>): FormExtractionOutput {
    return {
      formCode: 'BHIA',
      formName: "BUYER HOMEOWNERS' INSURANCE ADVISORY",
      data,
      rawResponse: '',
      promptTokens: null,
      completionTokens: null,
      modelName: 'llm',
    };
  }

  it('produces checks for standard extraction with valid buyer signature and date', () => {
    const data = {
      acknowledges_advisory: true,
      buyer_signatures: [{ buyer_name: 'Alice Smith', date: '2026-06-15' }],
      footer_form_info: { form_code_in_footer: 'BHIA 6/24 (PAGE 1 OF 1)' },
    };
    const result = validateDisclosuresStage([makeStandardExtraction(data)]);
    const bhiaChecks = result.checks.filter(c => c.formCode === 'BHIA');
    expect(bhiaChecks.length).toBeGreaterThanOrEqual(2);
    expect(bhiaChecks.some(c => c.ruleId === 'bhia_form_present')).toBe(true);
    expect(bhiaChecks.some(c => c.ruleId === 'bhia_acknowledges_advisory')).toBe(true);
    expect(result.blockers.filter(b => b.formCode === 'BHIA').length).toBe(0);
  });

  it('no warning when acknowledges_advisory is false (content check only)', () => {
    const data = {
      acknowledges_advisory: false,
      buyer_signatures: [{ buyer_name: 'Alice Smith', date: '2026-06-15' }],
      footer_form_info: { form_code_in_footer: 'BHIA 6/24 (PAGE 1 OF 1)' },
    };
    const result = validateDisclosuresStage([makeStandardExtraction(data)]);
    expect(result.warnings.some(w => w.code === 'WARN_BHIA_MANUAL_REVIEW')).toBe(false);
    expect(result.blockers.filter(b => b.formCode === 'BHIA').length).toBe(0);
  });

  it('emits blocker when no buyer signatures present', () => {
    const data = {
      acknowledges_advisory: false,
      buyer_signatures: [],
      footer_form_info: { form_code_in_footer: 'BHIA 6/24 (PAGE 1 OF 1)' },
    };
    const result = validateDisclosuresStage([makeStandardExtraction(data)]);
    expect(result.blockers.some(b => b.code === 'BLOCKER_BHIA_BUYER_1_SIGNATURE_MISSING')).toBe(true);
  });

  it('emits blocker when buyer signature has no date', () => {
    const data = {
      acknowledges_advisory: true,
      buyer_signatures: [{ buyer_name: 'Alice Smith', date: null }],
      footer_form_info: { form_code_in_footer: 'BHIA 6/24 (PAGE 1 OF 1)' },
    };
    const result = validateDisclosuresStage([makeStandardExtraction(data)]);
    expect(result.blockers.some(b => b.code === 'BLOCKER_BHIA_BUYER_1_DATE_MISSING')).toBe(true);
  });

  it('BHIA checks carry formCode=HBIA for the web UI dropdown', () => {
    const data = {
      acknowledges_advisory: true,
      buyer_signatures: [{ buyer_name: 'Alice Smith', date: '2026-06-15' }],
      footer_form_info: { form_code_in_footer: 'BHIA 6/24 (PAGE 1 OF 1)' },
    };
    const result = validateDisclosuresStage([makeStandardExtraction(data)]);
    const bhiaChecks = result.checks.filter(c => c.formCode === 'BHIA');
    expect(bhiaChecks.length).toBeGreaterThanOrEqual(1);
    bhiaChecks.forEach(c => expect(c.formCode).toBe('BHIA'));
  });
});
