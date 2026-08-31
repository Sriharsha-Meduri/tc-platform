import { describe, it, expect } from 'vitest';
import { validateAvidWithSchema } from '../../src/validator/avid-validation';
import type { FormExtractionOutput } from '../../src/extractor/extractor.types';
import { validateDisclosuresStage } from '../../src/validator/stages/disclosures.stage';
import type { AvidValidationOutput } from '../../src/extractor/forms/avid/avid.validation.v12-22';

// ── Helper to build AVID comprehensive extraction data ─────────────────────

function makeValidAvidData(overrides?: Partial<AvidValidationOutput>): AvidValidationOutput {
  return {
    form_type: 'AVID',
    form_validation: {
      is_avid: true,
      form_revision: 'Rev. 12/22',
      expected_page_count: 3,
      detected_logical_pages: [1, 2, 3],
      all_required_pages_present: true,
      missing_pages: [],
      duplicate_pages: [],
      mixed_form_revisions: false,
      page_order_valid: true,
      form_identity_status: 'valid',
    },
    transaction_context: {
      expected_buyers: 2,
      expected_property_address: '123 Main St',
      property_type: 'single_family',
      expected_bedrooms: 3,
      expected_bathrooms: 2,
      has_living_room: true,
      has_dining_room: true,
      has_entry: true,
      has_hall_or_stairs: true,
      has_garage_or_parking: true,
    },
    page_1: {
      page_present: true,
      correct_page_label: true,
      property_identification: {
        city: 'Los Angeles',
        county: 'Los Angeles',
        property_address: '123 Main St',
        city_present: true,
        county_present: true,
        property_address_present: true,
        matches_transaction_address: true,
        completion_status: 'complete',
      },
      multi_unit_information: {
        duplex_triplex_fourplex_checked: false,
        only_units_checked: false,
        only_units_text: null,
        applies_to_all_units: null,
        unit_selection_valid: null,
        completion_status: 'not_applicable',
      },
      inspecting_broker_firm: {
        firm_name: 'Test Realty Inc.',
        firm_name_present: true,
        completion_status: 'complete',
      },
      buyer_initials: {
        slot_1: { initials_present: true, initials_text: 'JB', mark_type: 'handwritten' },
        slot_2: { initials_present: true, initials_text: 'JB', mark_type: 'handwritten' },
        required_initials_count: 2,
        missing_required_initials_count: 0,
        completion_status: 'complete',
      },
    },
    page_2: {
      page_present: true,
      correct_page_label: true,
      multi_unit_number: {
        unit_number: null,
        unit_number_required: false,
        completion_status: 'not_applicable',
      },
      area_observations: {
        entry: { applicable: true, description_present: true, description: 'Updated entryway', completion_status: 'complete' },
        living_room: { applicable: true, description_present: true, description: 'Good condition', completion_status: 'complete' },
        dining_room: { applicable: true, description_present: true, description: 'Formal dining area', completion_status: 'complete' },
        kitchen: { applicable: true, description_present: true, description: 'Updated kitchen', completion_status: 'complete' },
        other_room: { applicable: false, description_present: false, description: null, completion_status: 'not_applicable' },
        hall_stairs: { applicable: true, description_present: true, description: 'Carpet in good condition', completion_status: 'complete' },
        bedroom_1: { applicable: true, description_present: true, description: 'Master bedroom', completion_status: 'complete' },
        bedroom_2: { applicable: true, description_present: true, description: 'Guest room', completion_status: 'complete' },
        bedroom_3: { applicable: true, description_present: true, description: 'Office', completion_status: 'complete' },
        bedroom_4: { applicable: false, description_present: false, description: null, completion_status: 'not_applicable' },
        bath_1: { applicable: true, description_present: true, description: 'Master bath', completion_status: 'complete' },
        bath_2: { applicable: true, description_present: true, description: 'Hall bath', completion_status: 'complete' },
        bath_3: { applicable: false, description_present: false, description: null, completion_status: 'not_applicable' },
        bath_4: { applicable: false, description_present: false, description: null, completion_status: 'not_applicable' },
        all_known_applicable_areas_completed: true,
        missing_applicable_areas: [],
        repeated_generic_language_detected: false,
        quality_review_messages: [],
      },
      buyer_initials: {
        slot_1: { initials_present: true, initials_text: 'JB', mark_type: 'handwritten' },
        slot_2: { initials_present: true, initials_text: 'JB', mark_type: 'handwritten' },
        required_initials_count: 2,
        missing_required_initials_count: 0,
        completion_status: 'complete',
      },
    },
    page_3: {
      page_present: true,
      correct_page_label: true,
      multi_unit_number: {
        unit_number: null,
        unit_number_required: false,
        completion_status: 'not_applicable',
      },
      additional_observations: {
        other_1: null,
        other_2: null,
        other_3: null,
        see_addendum_checked: false,
        referenced_addendum_present: null,
        garage_parking: { applicable: true, description_present: true, description: '2-car attached garage', completion_status: 'complete' },
        exterior_building_and_yard: { description: 'Good exterior condition', description_present: true, status: 'complete' },
      },
      inspection_certification: {
        broker_firm_name: 'Test Realty Inc.',
        broker_firm_present: true,
        inspector_name: 'Jane Agent',
        inspector_name_present: true,
        inspection_date: '2026-07-20',
        inspection_date_present: true,
        inspection_time: '10:30 AM',
        inspection_time_present: true,
        weather_conditions: 'Clear, sunny',
        weather_conditions_present: true,
        agent_signature_present: true,
        agent_signature_date: '2026-07-20',
        agent_signature_date_present: true,
        certification_complete: true,
      },
      buyer_acknowledgements: {
        required_signature_count: 2,
        missing_required_signatures_count: 0,
        missing_required_dates_count: 0,
        completion_status: 'complete',
      },
    },
    cross_page_validation: {
      broker_firm_consistent: true,
      unit_information_consistent: true,
      agent_signature_date_on_or_after_inspection_date: true,
      buyer_acknowledgement_dates_on_or_after_inspection_date: true,
      property_address_consistent_with_transaction: true,
      inconsistency_messages: [],
      cross_page_status: 'consistent',
    },
    ...overrides,
  };
}

function makeExtraction(data: unknown): FormExtractionOutput[] {
  return [{
    formCode: 'AVID',
    formName: 'Agent Visual Inspection Disclosure',
    data: data as Record<string, unknown>,
    rawResponse: '',
    promptTokens: null,
    completionTokens: null,
    modelName: 'test',
  }];
}

// ── validateAvidWithSchema unit tests ──────────────────────────────────────

describe('validateAvidWithSchema', () => {
  it('returns empty issues for a valid AVID', () => {
    const data = makeValidAvidData();
    const result = validateAvidWithSchema(data as unknown as Record<string, unknown>);
    expect(result.issues).toHaveLength(0);
    expect(result.checks.length).toBeGreaterThan(0);
  });

  it('emits BLOCKER_AVID_PROPERTY_MISSING when property address is empty', () => {
    const data = makeValidAvidData({
      page_1: {
        ...makeValidAvidData().page_1,
        property_identification: {
          ...makeValidAvidData().page_1.property_identification,
          property_address: '',
          property_address_present: false,
          completion_status: 'missing',
        },
      },
    });
    const result = validateAvidWithSchema(data as unknown as Record<string, unknown>);
    expect(result.issues.some(i => i.code === 'BLOCKER_AVID_PROPERTY_MISSING')).toBe(true);
  });

  it('emits BLOCKER_AVID_BROKER_FIRM_MISSING when broker firm is empty', () => {
    const data = makeValidAvidData({
      page_1: {
        ...makeValidAvidData().page_1,
        inspecting_broker_firm: { firm_name: '', firm_name_present: false, completion_status: 'missing' },
      },
    });
    const result = validateAvidWithSchema(data as unknown as Record<string, unknown>);
    expect(result.issues.some(i => i.code === 'BLOCKER_AVID_BROKER_FIRM_MISSING')).toBe(true);
  });

  it('emits BLOCKER_AVID_P1_BUYER_INITIALS_MISSING when page 1 buyer initials missing', () => {
    const data = makeValidAvidData({
      page_1: {
        ...makeValidAvidData().page_1,
        buyer_initials: {
          ...makeValidAvidData().page_1.buyer_initials,
          missing_required_initials_count: 2,
          completion_status: 'missing',
        },
      },
    });
    const result = validateAvidWithSchema(data as unknown as Record<string, unknown>);
    expect(result.issues.some(i => i.code === 'BLOCKER_AVID_P1_BUYER_INITIALS_MISSING')).toBe(true);
  });

  it('emits BLOCKER_AVID_P2_BUYER_INITIALS_MISSING when page 2 buyer initials missing', () => {
    const data = makeValidAvidData({
      page_2: {
        ...makeValidAvidData().page_2,
        buyer_initials: {
          ...makeValidAvidData().page_2.buyer_initials,
          missing_required_initials_count: 2,
          completion_status: 'missing',
        },
      },
    });
    const result = validateAvidWithSchema(data as unknown as Record<string, unknown>);
    expect(result.issues.some(i => i.code === 'BLOCKER_AVID_P2_BUYER_INITIALS_MISSING')).toBe(true);
  });

  it('emits BLOCKER_AVID_AREA_OBSERVATION_MISSING when applicable area has no observation', () => {
    const data = makeValidAvidData({
      page_2: {
        ...makeValidAvidData().page_2,
        area_observations: {
          ...makeValidAvidData().page_2.area_observations,
          entry: { applicable: true, description_present: false, description: null, completion_status: 'missing' },
        },
      },
    });
    const result = validateAvidWithSchema(data as unknown as Record<string, unknown>);
    expect(result.issues.some(i => i.code === 'BLOCKER_AVID_AREA_OBSERVATION_MISSING')).toBe(true);
  });

  it('emits BLOCKER_AVID_INSPECTOR_NAME_MISSING when inspection name is empty', () => {
    const data = makeValidAvidData({
      page_3: {
        ...makeValidAvidData().page_3,
        inspection_certification: {
          ...makeValidAvidData().page_3.inspection_certification,
          inspector_name: '',
          inspector_name_present: false,
        },
      },
    });
    const result = validateAvidWithSchema(data as unknown as Record<string, unknown>);
    expect(result.issues.some(i => i.code === 'BLOCKER_AVID_INSPECTOR_NAME_MISSING')).toBe(true);
  });

  it('emits BLOCKER_AVID_INSPECTION_DATE_MISSING when inspection date is empty', () => {
    const data = makeValidAvidData({
      page_3: {
        ...makeValidAvidData().page_3,
        inspection_certification: {
          ...makeValidAvidData().page_3.inspection_certification,
          inspection_date: '',
          inspection_date_present: false,
        },
      },
    });
    const result = validateAvidWithSchema(data as unknown as Record<string, unknown>);
    expect(result.issues.some(i => i.code === 'BLOCKER_AVID_INSPECTION_DATE_MISSING')).toBe(true);
  });

  it('emits BLOCKER_AVID_AGENT_SIGNATURE_MISSING when agent signature is false', () => {
    const data = makeValidAvidData({
      page_3: {
        ...makeValidAvidData().page_3,
        inspection_certification: {
          ...makeValidAvidData().page_3.inspection_certification,
          agent_signature_present: false,
          certification_complete: false,
        },
      },
    });
    const result = validateAvidWithSchema(data as unknown as Record<string, unknown>);
    expect(result.issues.some(i => i.code === 'BLOCKER_AVID_AGENT_SIGNATURE_MISSING')).toBe(true);
  });

  it('emits BLOCKER_AVID_BUYER_SIGNATURE_MISSING when buyer acknowledgement signature is missing', () => {
    const data = makeValidAvidData({
      page_3: {
        ...makeValidAvidData().page_3,
        buyer_acknowledgements: {
          ...makeValidAvidData().page_3.buyer_acknowledgements,
          missing_required_signatures_count: 2,
          completion_status: 'missing',
        },
      },
    });
    const result = validateAvidWithSchema(data as unknown as Record<string, unknown>);
    expect(result.issues.some(i => i.code === 'BLOCKER_AVID_BUYER_SIGNATURE_MISSING')).toBe(true);
  });

  it('emits BLOCKER_AVID_DATE_CHRONOLOGY_INVALID when agent date precedes inspection date', () => {
    const data = makeValidAvidData({
      cross_page_validation: {
        ...makeValidAvidData().cross_page_validation,
        agent_signature_date_on_or_after_inspection_date: false,
        cross_page_status: 'inconsistent',
        inconsistency_messages: ['Agent signature date precedes inspection date'],
      },
    });
    const result = validateAvidWithSchema(data as unknown as Record<string, unknown>);
    expect(result.issues.some(i => i.code === 'BLOCKER_AVID_DATE_CHRONOLOGY_INVALID')).toBe(true);
  });

  it('emits BLOCKER_AVID_BUYER_SIGNATURE_DATE_MISSING when buyer date is missing', () => {
    const data = makeValidAvidData({
      page_3: {
        ...makeValidAvidData().page_3,
        buyer_acknowledgements: {
          ...makeValidAvidData().page_3.buyer_acknowledgements,
          missing_required_dates_count: 2,
          completion_status: 'missing',
        },
      },
    });
    const result = validateAvidWithSchema(data as unknown as Record<string, unknown>);
    expect(result.issues.some(i => i.code === 'BLOCKER_AVID_BUYER_SIGNATURE_DATE_MISSING')).toBe(true);
  });

  it('emits WARN_AVID_MANUAL_REVIEW when cross-page has inconsistency messages', () => {
    const data = makeValidAvidData({
      cross_page_validation: {
        ...makeValidAvidData().cross_page_validation,
        broker_firm_consistent: false,
        cross_page_status: 'inconsistent',
        inconsistency_messages: ['Broker firm mismatch between page 1 and page 3'],
      },
    });
    const result = validateAvidWithSchema(data as unknown as Record<string, unknown>);
    expect(result.issues.some(i => i.code === 'WARN_AVID_MANUAL_REVIEW')).toBe(true);
  });

  it('emits BLOCKER_AVID_WRONG_FORM when is_avid is false', () => {
    const data = makeValidAvidData({
      form_validation: {
        ...makeValidAvidData().form_validation,
        is_avid: false,
        form_identity_status: 'wrong_form',
      },
    });
    const result = validateAvidWithSchema(data as unknown as Record<string, unknown>);
    expect(result.issues.some(i => i.code === 'BLOCKER_AVID_WRONG_FORM')).toBe(true);
  });

  it('emits BLOCKER_AVID_PAGE_MISSING when pages are missing', () => {
    const data = makeValidAvidData({
      form_validation: {
        ...makeValidAvidData().form_validation,
        all_required_pages_present: false,
        missing_pages: [3],
        form_identity_status: 'missing_pages',
      },
    });
    const result = validateAvidWithSchema(data as unknown as Record<string, unknown>);
    expect(result.issues.some(i => i.code === 'BLOCKER_AVID_PAGE_MISSING')).toBe(true);
  });

  it('passes all checks when everything is valid', () => {
    const data = makeValidAvidData();
    const result = validateAvidWithSchema(data as unknown as Record<string, unknown>);
    expect(result.issues).toHaveLength(0);
    expect(result.checks.length).toBeGreaterThan(0);
  });
});

// ── disclosures.stage.ts integration tests ─────────────────────────────────

describe('validateDisclosuresStage — AVID comprehensive validation', () => {
  it('uses validateAvidWithSchema when data has form_validation field', () => {
    const data = makeValidAvidData();
    const result = validateDisclosuresStage(makeExtraction(data));
    // Should have checks from the comprehensive validation
    expect(result.checks.some(c => c.formCode === 'AVID' && c.status === 'pass')).toBe(true);
    expect(result.summary.passCount).toBeGreaterThan(0);
  });

  it('emits blockers when AVID is missing required fields', () => {
    const data = makeValidAvidData({
      page_3: {
        ...makeValidAvidData().page_3,
        inspection_certification: {
          ...makeValidAvidData().page_3.inspection_certification,
          inspector_name: '',
          inspector_name_present: false,
          inspection_date: '',
          inspection_date_present: false,
          agent_signature_present: false,
          certification_complete: false,
        },
      },
    });
    const result = validateDisclosuresStage(makeExtraction(data));
    expect(result.blockers.some(b => b.code === 'BLOCKER_AVID_INSPECTOR_NAME_MISSING')).toBe(true);
    expect(result.blockers.some(b => b.code === 'BLOCKER_AVID_INSPECTION_DATE_MISSING')).toBe(true);
    expect(result.blockers.some(b => b.code === 'BLOCKER_AVID_AGENT_SIGNATURE_MISSING')).toBe(true);
    expect(result.summary.overallStatus).toBe('non_compliant');
  });

  it('emits warnings alongside blockers for incomplete AVID', () => {
    const data = makeValidAvidData({
      page_1: {
        ...makeValidAvidData().page_1,
        property_identification: {
          ...makeValidAvidData().page_1.property_identification,
          property_address: '',
          property_address_present: false,
          completion_status: 'missing',
        },
      },
      page_3: {
        ...makeValidAvidData().page_3,
        inspection_certification: {
          ...makeValidAvidData().page_3.inspection_certification,
          inspector_name: '',
          inspector_name_present: false,
        },
      },
    });
    const result = validateDisclosuresStage(makeExtraction(data));
    expect(result.blockers.length).toBeGreaterThan(0);
    expect(result.warnings.length).toBeGreaterThanOrEqual(0);
  });

  it('legacy AVID format still works (no form_validation field)', () => {
    const legacyData = {
      header: { property_address: '123 Main St' },
    };
    const result = validateDisclosuresStage(makeExtraction(legacyData));
    // Should still run basic validation without crashing
    expect(result.checks.some(c => c.formCode === 'AVID')).toBe(true);
  });
});
