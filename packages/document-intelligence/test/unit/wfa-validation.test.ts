/**
 * WFA Validation Logic Tests
 *
 * Tests validateWfaWithSchema — processes WfaValidationOutput and produces
 * blockers and warnings through the compliance system.
 */

import { describe, it, expect } from 'vitest';
import { validateWfaWithSchema } from '../../src/validator/wfa-validation';
import type { WfaValidationOutput, SignatureSlot } from '../../src/extractor/forms/wfa/wfa.validation.v06-25';
import { validateDisclosuresStage } from '../../src/validator/stages/disclosures.stage';
import type { FormExtractionOutput } from '../../src/extractor/extractor.types';

// ─── Factory ──────────────────────────────────────────────────────────────────

function validSlot(overrides?: Partial<SignatureSlot>): SignatureSlot {
  return {
    signature_present: true,
    signature_text: 'John Doe',
    signature_type: 'electronic',
    signer_matches_expected_party: true,
    date: '2026-06-15',
    date_present: true,
    date_valid: true,
    completion_status: 'complete',
    ...overrides,
  };
}

function validWfa(overrides?: Partial<WfaValidationOutput>): WfaValidationOutput {
  return {
    form_type: 'WFA',
    form_validation: {
      is_wfa: true,
      form_title: 'WIRE FRAUD AND ELECTRONIC FUNDS TRANSFER ADVISORY',
      form_revision: 'Reviewed 6/25',
      logical_page_number: 1,
      expected_page_count: 1,
      correct_page_label: true,
      document_complete: true,
      form_identity_status: 'valid',
    },
    transaction_context: {
      transaction_type: 'purchase',
      expected_buyer_tenant_count: 1,
      expected_seller_housing_provider_count: 1,
      expected_buyer_tenant_names: ['John Doe'],
      expected_seller_housing_provider_names: ['Jane Smith'],
      expected_property_address: null,
    },
    advisory_content_validation: {
      advisory_heading_present: true,
      warning_explanation_present: true,
      recommendation_1_present: true,
      recommendation_2_present: true,
      recommendation_3_present: true,
      recommendation_4_present: true,
      recommendation_5_present: true,
      suspicious_instructions_response_present: true,
      resources_present: true,
      acknowledgement_text_present: true,
      all_required_content_present: true,
    },
    buyer_tenant_acknowledgements: {
      slot_1: validSlot(),
      slot_2: validSlot({ signature_present: false, signature_text: null, signature_type: 'blank', signer_matches_expected_party: null, date: null, date_present: false, date_valid: null, completion_status: 'missing_signature_and_date' }),
      required_signature_count: 1,
      valid_required_signature_count: 1,
      missing_required_signature_count: 0,
      missing_required_date_count: 0,
      all_required_parties_signed: true,
      all_required_signatures_dated: true,
      completion_status: 'complete',
    },
    seller_housing_provider_acknowledgements: {
      slot_1: validSlot({ signature_text: 'Jane Smith' }),
      slot_2: validSlot({ signature_present: false, signature_text: null, signature_type: 'blank', signer_matches_expected_party: null, date: null, date_present: false, date_valid: null, completion_status: 'missing_signature_and_date' }),
      required_signature_count: 1,
      valid_required_signature_count: 1,
      missing_required_signature_count: 0,
      missing_required_date_count: 0,
      all_required_parties_signed: true,
      all_required_signatures_dated: true,
      completion_status: 'complete',
    },
    non_required_execution_fields: {
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
      overall_status: 'complete',
    },
    ...overrides,
  };
}

function makeExtraction(data: Record<string, unknown>): FormExtractionOutput {
  return {
    formCode: 'WFA',
    formName: 'WFA',
    data,
    rawResponse: '',
    promptTokens: null,
    completionTokens: null,
    modelName: 'test',
  };
}

// ─── validateWfaWithSchema tests ──────────────────────────────────────────────

describe('validateWfaWithSchema', () => {
  it('happy path — valid complete WFA produces no issues', () => {
    const result = validateWfaWithSchema(validWfa() as unknown as Record<string, unknown>);
    expect(result.issues).toHaveLength(0);
    expect(result.checks.length).toBeGreaterThan(0);
    expect(result.checks.some((c) => c.ruleId === 'wfa_form_identified')).toBe(true);
    expect(result.checks.some((c) => c.ruleId === 'wfa_document_complete')).toBe(true);
    expect(result.checks.some((c) => c.ruleId === 'wfa_acknowledgment_present')).toBe(true);
    expect(result.checks.some((c) => c.ruleId === 'wfa_all_content_present')).toBe(true);
  });

  it('valid 2 buyers and 2 sellers', () => {
    const data = validWfa();
    data.transaction_context.expected_buyer_tenant_count = 2;
    data.transaction_context.expected_seller_housing_provider_count = 2;
    data.buyer_tenant_acknowledgements.required_signature_count = 2;
    data.buyer_tenant_acknowledgements.slot_2 = validSlot({ signature_text: 'Bob Doe' });
    data.buyer_tenant_acknowledgements.valid_required_signature_count = 2;
    data.buyer_tenant_acknowledgements.all_required_parties_signed = true;
    data.buyer_tenant_acknowledgements.all_required_signatures_dated = true;
    data.buyer_tenant_acknowledgements.completion_status = 'complete';
    data.seller_housing_provider_acknowledgements.required_signature_count = 2;
    data.seller_housing_provider_acknowledgements.slot_2 = validSlot({ signature_text: 'Sue Smith' });
    data.seller_housing_provider_acknowledgements.valid_required_signature_count = 2;
    data.seller_housing_provider_acknowledgements.all_required_parties_signed = true;
    data.seller_housing_provider_acknowledgements.all_required_signatures_dated = true;
    data.seller_housing_provider_acknowledgements.completion_status = 'complete';

    const result = validateWfaWithSchema(data as unknown as Record<string, unknown>);
    expect(result.issues).toHaveLength(0);
  });

  it('1 buyer expected with blank second line — no blocker', () => {
    const data = validWfa();
    data.buyer_tenant_acknowledgements.slot_2 = validSlot({
      signature_present: false, signature_text: null, signature_type: 'blank',
      signer_matches_expected_party: null, date: null, date_present: false,
      date_valid: null, completion_status: 'missing_signature_and_date',
    });

    const result = validateWfaWithSchema(data as unknown as Record<string, unknown>);
    const buyerIssues = result.issues.filter((i) => i.code.includes('BUYER_TENANT'));
    expect(buyerIssues).toHaveLength(0);
  });

  // ── Form identity blockers ────────────────────────────────────────────────

  it('wrong form — emits BLOCKER_WFA_WRONG_FORM', () => {
    const data = validWfa();
    data.form_validation.is_wfa = false;
    data.form_validation.form_identity_status = 'wrong_form';

    const result = validateWfaWithSchema(data as unknown as Record<string, unknown>);
    expect(result.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'BLOCKER_WFA_WRONG_FORM' })]),
    );
  });

  it('wrong page — emits BLOCKER_WFA_WRONG_PAGE', () => {
    const data = validWfa();
    data.form_validation.form_identity_status = 'wrong_page';

    const result = validateWfaWithSchema(data as unknown as Record<string, unknown>);
    expect(result.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'BLOCKER_WFA_WRONG_PAGE' })]),
    );
  });

  it('missing page — emits BLOCKER_WFA_PAGE_MISSING', () => {
    const data = validWfa();
    data.form_validation.form_identity_status = 'missing_page';

    const result = validateWfaWithSchema(data as unknown as Record<string, unknown>);
    expect(result.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'BLOCKER_WFA_PAGE_MISSING' })]),
    );
  });

  // ── Content completeness ──────────────────────────────────────────────────

  it('document incomplete — emits BLOCKER_WFA_CONTENT_INCOMPLETE', () => {
    const data = validWfa();
    data.form_validation.document_complete = false;

    const result = validateWfaWithSchema(data as unknown as Record<string, unknown>);
    expect(result.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'BLOCKER_WFA_CONTENT_INCOMPLETE' })]),
    );
  });

  it('acknowledgment missing — emits BLOCKER_WFA_ACKNOWLEDGMENT_MISSING', () => {
    const data = validWfa();
    data.advisory_content_validation.acknowledgement_text_present = false;

    const result = validateWfaWithSchema(data as unknown as Record<string, unknown>);
    expect(result.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'BLOCKER_WFA_ACKNOWLEDGMENT_MISSING' })]),
    );
  });

  it('content incomplete when document_complete but all_required_content_present is false', () => {
    const data = validWfa();
    data.advisory_content_validation.all_required_content_present = false;

    const result = validateWfaWithSchema(data as unknown as Record<string, unknown>);
    expect(result.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'BLOCKER_WFA_CONTENT_INCOMPLETE' })]),
    );
  });

  // ── Buyer/Tenant signature blockers ───────────────────────────────────────

  it('buyer 1 sig missing — emits BLOCKER_WFA_BUYER_TENANT_1_SIGNATURE_MISSING', () => {
    const data = validWfa();
    data.buyer_tenant_acknowledgements.slot_1 = validSlot({
      signature_present: false, signature_text: null, signature_type: 'blank',
      signer_matches_expected_party: null, date: null, date_present: false,
      date_valid: null, completion_status: 'missing_signature_and_date',
    });
    data.buyer_tenant_acknowledgements.valid_required_signature_count = 0;
    data.buyer_tenant_acknowledgements.missing_required_signature_count = 1;

    const result = validateWfaWithSchema(data as unknown as Record<string, unknown>);
    expect(result.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'BLOCKER_WFA_BUYER_TENANT_1_SIGNATURE_MISSING' })]),
    );
  });

  it('buyer 1 date missing — emits BLOCKER_WFA_BUYER_TENANT_1_DATE_MISSING', () => {
    const data = validWfa();
    data.buyer_tenant_acknowledgements.slot_1 = validSlot({
      date: null, date_present: false, date_valid: null, completion_status: 'missing_date',
    });
    data.buyer_tenant_acknowledgements.valid_required_signature_count = 0;
    data.buyer_tenant_acknowledgements.missing_required_date_count = 1;

    const result = validateWfaWithSchema(data as unknown as Record<string, unknown>);
    expect(result.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'BLOCKER_WFA_BUYER_TENANT_1_DATE_MISSING' })]),
    );
  });

  it('buyer 2 sig missing when count=2 — emits BLOCKER_WFA_BUYER_TENANT_2_SIGNATURE_MISSING', () => {
    const data = validWfa();
    data.transaction_context.expected_buyer_tenant_count = 2;
    data.buyer_tenant_acknowledgements.required_signature_count = 2;
    data.buyer_tenant_acknowledgements.slot_2 = validSlot({
      signature_present: false, signature_text: null, signature_type: 'blank',
      signer_matches_expected_party: null, date: null, date_present: false,
      date_valid: null, completion_status: 'missing_signature_and_date',
    });

    const result = validateWfaWithSchema(data as unknown as Record<string, unknown>);
    expect(result.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'BLOCKER_WFA_BUYER_TENANT_2_SIGNATURE_MISSING' })]),
    );
  });

  it('buyer 2 date missing when count=2 — emits BLOCKER_WFA_BUYER_TENANT_2_DATE_MISSING', () => {
    const data = validWfa();
    data.transaction_context.expected_buyer_tenant_count = 2;
    data.buyer_tenant_acknowledgements.required_signature_count = 2;
    data.buyer_tenant_acknowledgements.slot_2 = validSlot({
      date: null, date_present: false, date_valid: null, completion_status: 'missing_date',
    });

    const result = validateWfaWithSchema(data as unknown as Record<string, unknown>);
    expect(result.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'BLOCKER_WFA_BUYER_TENANT_2_DATE_MISSING' })]),
    );
  });

  it('no blocker when buyer count=0', () => {
    const data = validWfa();
    data.transaction_context.expected_buyer_tenant_count = 0;
    data.buyer_tenant_acknowledgements.required_signature_count = 0;
    data.buyer_tenant_acknowledgements.slot_1 = validSlot({
      signature_present: false, signature_text: null, signature_type: 'blank',
      signer_matches_expected_party: null, date: null, date_present: false,
      date_valid: null, completion_status: 'missing_signature_and_date',
    });

    const result = validateWfaWithSchema(data as unknown as Record<string, unknown>);
    const buyerBlockers = result.issues.filter((i) => i.code.startsWith('BLOCKER_WFA_BUYER_TENANT'));
    expect(buyerBlockers).toHaveLength(0);
  });

  it('no blocker for buyer 2 when only 1 expected', () => {
    const data = validWfa();
    data.buyer_tenant_acknowledgements.required_signature_count = 1;
    data.buyer_tenant_acknowledgements.slot_2 = validSlot({
      signature_present: false, signature_text: null, signature_type: 'blank',
      signer_matches_expected_party: null, date: null, date_present: false,
      date_valid: null, completion_status: 'missing_signature_and_date',
    });

    const result = validateWfaWithSchema(data as unknown as Record<string, unknown>);
    const blocker2 = result.issues.filter((i) => i.code === 'BLOCKER_WFA_BUYER_TENANT_2_SIGNATURE_MISSING' || i.code === 'BLOCKER_WFA_BUYER_TENANT_2_DATE_MISSING');
    expect(blocker2).toHaveLength(0);
  });

  it('signer mismatch — emits BLOCKER_WFA_BUYER_TENANT_SIGNER_MISMATCH', () => {
    const data = validWfa();
    data.buyer_tenant_acknowledgements.slot_1 = validSlot({
      signature_text: 'Wrong Person',
      signer_matches_expected_party: false,
    });

    const result = validateWfaWithSchema(data as unknown as Record<string, unknown>);
    expect(result.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'BLOCKER_WFA_BUYER_TENANT_SIGNER_MISMATCH' })]),
    );
  });

  // ── Seller/Housing Provider signature blockers ────────────────────────────

  it('seller 1 sig missing — emits BLOCKER_WFA_SELLER_HOUSING_PROVIDER_1_SIGNATURE_MISSING', () => {
    const data = validWfa();
    data.seller_housing_provider_acknowledgements.slot_1 = validSlot({
      signature_present: false, signature_text: null, signature_type: 'blank',
      signer_matches_expected_party: null, date: null, date_present: false,
      date_valid: null, completion_status: 'missing_signature_and_date',
    });
    data.seller_housing_provider_acknowledgements.valid_required_signature_count = 0;
    data.seller_housing_provider_acknowledgements.missing_required_signature_count = 1;

    const result = validateWfaWithSchema(data as unknown as Record<string, unknown>);
    expect(result.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'BLOCKER_WFA_SELLER_HOUSING_PROVIDER_1_SIGNATURE_MISSING' })]),
    );
  });

  it('seller 1 date missing — emits BLOCKER_WFA_SELLER_HOUSING_PROVIDER_1_DATE_MISSING', () => {
    const data = validWfa();
    data.seller_housing_provider_acknowledgements.slot_1 = validSlot({
      date: null, date_present: false, date_valid: null, completion_status: 'missing_date',
    });
    data.seller_housing_provider_acknowledgements.valid_required_signature_count = 0;
    data.seller_housing_provider_acknowledgements.missing_required_date_count = 1;

    const result = validateWfaWithSchema(data as unknown as Record<string, unknown>);
    expect(result.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'BLOCKER_WFA_SELLER_HOUSING_PROVIDER_1_DATE_MISSING' })]),
    );
  });

  // ── Warnings ──────────────────────────────────────────────────────────────

  it('buyer count unknown — emits WARN_WFA_BUYER_TENANT_COUNT_UNKNOWN', () => {
    const data = validWfa();
    data.buyer_tenant_acknowledgements.required_signature_count = null;
    data.buyer_tenant_acknowledgements.completion_status = 'unknown';

    const result = validateWfaWithSchema(data as unknown as Record<string, unknown>);
    expect(result.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'WARN_WFA_BUYER_TENANT_COUNT_UNKNOWN' })]),
    );
  });

  it('seller count unknown — emits WARN_WFA_SELLER_HOUSING_PROVIDER_COUNT_UNKNOWN', () => {
    const data = validWfa();
    data.seller_housing_provider_acknowledgements.required_signature_count = null;
    data.seller_housing_provider_acknowledgements.completion_status = 'unknown';

    const result = validateWfaWithSchema(data as unknown as Record<string, unknown>);
    expect(result.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'WARN_WFA_SELLER_HOUSING_PROVIDER_COUNT_UNKNOWN' })]),
    );
  });

  it('signature unreadable — emits WARN_WFA_SIGNATURE_UNREADABLE', () => {
    const data = validWfa();
    data.buyer_tenant_acknowledgements.slot_1 = validSlot({
      signature_type: 'unreadable',
      signer_matches_expected_party: null,
    });

    const result = validateWfaWithSchema(data as unknown as Record<string, unknown>);
    expect(result.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'WARN_WFA_SIGNATURE_UNREADABLE' })]),
    );
  });

  it('signer identity unknown — emits WARN_WFA_SIGNER_IDENTITY_UNKNOWN', () => {
    const data = validWfa();
    data.buyer_tenant_acknowledgements.slot_1 = validSlot({
      signer_matches_expected_party: null,
    });

    const result = validateWfaWithSchema(data as unknown as Record<string, unknown>);
    expect(result.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'WARN_WFA_SIGNER_IDENTITY_UNKNOWN' })]),
    );
  });

  it('manual review — emits WARN_WFA_MANUAL_REVIEW', () => {
    const data = validWfa();
    data.validation_summary.overall_status = 'manual_review_required';

    const result = validateWfaWithSchema(data as unknown as Record<string, unknown>);
    expect(result.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'WARN_WFA_MANUAL_REVIEW' })]),
    );
  });

  // ── Wrong form type ───────────────────────────────────────────────────────

  it('wrong form type — emits BLOCKER_WFA_WRONG_FORM', () => {
    const result = validateWfaWithSchema({ form_type: 'BHIA' } as unknown as Record<string, unknown>);
    expect(result.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'BLOCKER_WFA_WRONG_FORM' })]),
    );
    expect(result.checks).toHaveLength(0);
  });

  // ── Non-required field sanity checks ──────────────────────────────────────

  it('no non-required field blockers for initials', () => {
    const data = validWfa();
    data.non_required_execution_fields.buyer_tenant_initials_fields_present = false;
    data.non_required_execution_fields.seller_housing_provider_initials_fields_present = false;

    const result = validateWfaWithSchema(data as unknown as Record<string, unknown>);
    const initialsIssues = result.issues.filter((i) => i.code.includes('INITIALS'));
    expect(initialsIssues).toHaveLength(0);
  });

  it('no non-required field blockers for broker/agent signatures', () => {
    const data = validWfa();
    data.non_required_execution_fields.broker_signature_fields_present = false;
    data.non_required_execution_fields.agent_signature_fields_present = false;

    const result = validateWfaWithSchema(data as unknown as Record<string, unknown>);
    const brokerIssues = result.issues.filter((i) => i.code.includes('BROKER') || i.code.includes('AGENT'));
    expect(brokerIssues).toHaveLength(0);
  });
});

// ─── validateDisclosuresStage integration tests ───────────────────────────────

describe('validateDisclosuresStage — WFA integration', () => {
  it('passes through schema validation for WFA', () => {
    const data = validWfa();
    const extractions: FormExtractionOutput[] = [makeExtraction(data as unknown as Record<string, unknown>)];
    const result = validateDisclosuresStage(extractions);

    expect(result.checks.some((c) => c.ruleId === 'wfa_form_identified')).toBe(true);
    expect(result.checks.some((c) => c.ruleId === 'wfa_document_complete')).toBe(true);
  });

  it('emits blockers from WFA schema validation', () => {
    const data = validWfa();
    data.form_validation.is_wfa = false;
    data.form_validation.form_identity_status = 'wrong_form';

    const extractions: FormExtractionOutput[] = [makeExtraction(data as unknown as Record<string, unknown>)];
    const result = validateDisclosuresStage(extractions);

    expect(result.blockers).toEqual(
      expect.arrayContaining([expect.objectContaining({ compositeId: expect.stringContaining('WFA') })]),
    );
  });

  it('emits warnings alongside blockers', () => {
    const data = validWfa();
    data.form_validation.document_complete = false;
    data.buyer_tenant_acknowledgements.required_signature_count = null;
    data.buyer_tenant_acknowledgements.completion_status = 'unknown';

    const extractions: FormExtractionOutput[] = [makeExtraction(data as unknown as Record<string, unknown>)];
    const result = validateDisclosuresStage(extractions);

    expect(result.blockers.length).toBeGreaterThan(0);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('returns non_compliant for WFA alone with blockers', () => {
    const data = validWfa();
    data.form_validation.is_wfa = false;
    data.form_validation.form_identity_status = 'wrong_form';

    const extractions: FormExtractionOutput[] = [makeExtraction(data as unknown as Record<string, unknown>)];
    const result = validateDisclosuresStage(extractions);

    expect(result.summary.overallStatus).toBe('non_compliant');
  });
});

// ─── Standard extraction fallback tests ───────────────────────────────────────

describe('validateDisclosuresStage — WFA standard extraction fallback', () => {
  it('valid extraction with signatures → execution_valid pass, no blockers', () => {
    const data = {
      acknowledges_advisory: true,
      buyer_signatures: [{ buyer_name: 'John Doe', date: '2026-06-15' }],
      seller_signatures: [{ seller_name: 'Jane Smith', date: '2026-06-15' }],
    };
    const extractions: FormExtractionOutput[] = [makeExtraction(data)];
    const result = validateDisclosuresStage(extractions);

    expect(result.checks.some((c) => c.ruleId === 'wfa_form_present')).toBe(true);
    expect(result.checks.some((c) => c.ruleId === 'wfa_acknowledges_advisory')).toBe(true);
    expect(result.checks.some((c) => c.ruleId === 'wfa_execution_valid')).toBe(true);
    expect(result.blockers.filter((b) => b.formCode === 'WFA').length).toBe(0);
  });

  it('acknowledges_advisory false → no blocker for missing advisory (content check)', () => {
    const data = {
      acknowledges_advisory: false,
      buyer_signatures: [],
      seller_signatures: [],
    };
    const extractions: FormExtractionOutput[] = [makeExtraction(data)];
    const result = validateDisclosuresStage(extractions);

    // No MANUAL_REVIEW warning — the shared validator emits blockers for missing sigs
    expect(result.warnings.some((w) => w.code.includes('MANUAL_REVIEW'))).toBe(false);
    // But there should be signature blockers
    expect(result.blockers.some((b) => b.formCode === 'WFA')).toBe(true);
  });

  it('no buyer signatures', () => {
    const data = {
      acknowledges_advisory: true,
      buyer_signatures: [],
      seller_signatures: [],
    };
    const extractions: FormExtractionOutput[] = [makeExtraction(data)];
    const result = validateDisclosuresStage(extractions);

    const buyerMissing = result.blockers.find((b) => b.code.includes('BUYER_TENANT'));
    expect(buyerMissing).toBeDefined();
  });

  it('no seller signatures', () => {
    const data = {
      acknowledges_advisory: true,
      buyer_signatures: [{ buyer_name: 'John Doe', date: '2026-06-15' }],
      seller_signatures: [],
    };
    const extractions: FormExtractionOutput[] = [makeExtraction(data)];
    const result = validateDisclosuresStage(extractions);

    const sellerMissing = result.blockers.find((b) => b.code.includes('SELLER_HOUSING_PROVIDER'));
    expect(sellerMissing).toBeDefined();
  });

  it('buyer signature present but date missing', () => {
    const data = {
      acknowledges_advisory: true,
      buyer_signatures: [{ buyer_name: 'John Doe', date: null }],
      seller_signatures: [{ seller_name: 'Jane Smith', date: '2026-06-15' }],
    };
    const extractions: FormExtractionOutput[] = [makeExtraction(data)];
    const result = validateDisclosuresStage(extractions);

    const dateMissing = result.blockers.find((b) => b.code.includes('DATE_MISSING'));
    expect(dateMissing).toBeDefined();
  });

  it('formCode check — WFA routes to disclosure validation', () => {
    const data = {
      acknowledges_advisory: true,
      buyer_signatures: [{ buyer_name: 'John Doe', date: '2026-06-15' }],
      seller_signatures: [{ seller_name: 'Jane Smith', date: '2026-06-15' }],
    };
    const extractions: FormExtractionOutput[] = [makeExtraction(data)];
    const result = validateDisclosuresStage(extractions);

    expect(result.checks.some((c) => c.formCode === 'WFA')).toBe(true);
  });
});
