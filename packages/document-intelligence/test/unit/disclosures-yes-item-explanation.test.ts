import { describe, it, expect } from 'vitest';
import {
  validateDisclosuresStage, buildYesExplanationResults, SPQ_YES_SECTIONS, TDS_SECTION_C_ITEMS,
  buildYesNoCompletionResults, TDS_ALL_YES_NO_SECTIONS,
} from '../../src/validator/stages/disclosures.stage';
import type { FormExtractionOutput } from '../../src/extractor/extractor.types';

function makeExtraction(formCode: string, data: Record<string, unknown>): FormExtractionOutput[] {
  return [{
    formCode,
    formName: formCode,
    data,
    rawResponse: '',
    promptTokens: null,
    completionTokens: null,
    modelName: 'test',
  }];
}

function spqData(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    header: { property_address: '123 Main St' },
    ...overrides,
  };
}

describe('SPQ "Yes" item explanation validation', () => {
  it('passes when a single Yes item is referenced by its item number', () => {
    const data = spqData({
      section_7_repairs_and_alterations: {
        property_painted_within_past_12_months: true,
        explanation_7: '7D - Water damage near the kitchen sink was repainted.',
      },
    });
    const result = validateDisclosuresStage(makeExtraction('SPQ', data));
    expect(result.blockers.some((b) => b.code.startsWith('BLOCKER_SPQ_YES_ITEM_MISSING_EXPLANATION'))).toBe(false);
    expect(result.checks.some((c) => c.ruleId === 'spq_yes_explanations' && c.status === 'pass')).toBe(true);
  });

  it('blockers when a Yes item has no explanation at all', () => {
    const data = spqData({
      section_7_repairs_and_alterations: {
        property_painted_within_past_12_months: true,
        explanation_7: null,
      },
    });
    const result = validateDisclosuresStage(makeExtraction('SPQ', data));
    const blocker = result.blockers.find((b) => b.code === 'BLOCKER_SPQ_YES_ITEM_MISSING_EXPLANATION:7D');
    expect(blocker).toBeDefined();
    expect(blocker?.message).toBe('Item 7D is marked Yes, but no corresponding 7D explanation was found in the description section.');
    expect(blocker?.location).toBe('Page 2');
  });

  it('blockers when the explanation has generic text but never identifies the item', () => {
    const data = spqData({
      section_7_repairs_and_alterations: {
        property_painted_within_past_12_months: true,
        explanation_7: 'The property was recently repainted by the seller.',
      },
    });
    const result = validateDisclosuresStage(makeExtraction('SPQ', data));
    expect(result.blockers.some((b) => b.code === 'BLOCKER_SPQ_YES_ITEM_MISSING_EXPLANATION:7D')).toBe(true);
  });

  it('a No item never requires an explanation', () => {
    const data = spqData({
      section_7_repairs_and_alterations: {
        property_painted_within_past_12_months: false,
        explanation_7: null,
      },
    });
    const result = validateDisclosuresStage(makeExtraction('SPQ', data));
    expect(result.blockers.some((b) => b.code.startsWith('BLOCKER_SPQ_YES_ITEM_MISSING_EXPLANATION'))).toBe(false);
    // No Yes items at all → no pass check either, nothing to validate.
    expect(result.checks.some((c) => c.ruleId === 'spq_yes_explanations')).toBe(false);
  });

  it('multiple Yes items across sections: only the unmatched one blockers, independently', () => {
    const data = spqData({
      section_7_repairs_and_alterations: {
        property_painted_within_past_12_months: true,
        explanation_7: '7D - repainted last spring.',
      },
      section_8_structural_systems_and_appliances: {
        defects_in_heating_ac_electrical_plumbing_etc: true,
        explanation_8: 'Item 8A - HVAC unit replaced in 2024.',
      },
      section_12_boundaries_access_and_property_use_by_others: {
        use_of_neighboring_property_by_seller: true,
        explanation_12: null,
      },
    });
    const result = validateDisclosuresStage(makeExtraction('SPQ', data));
    expect(result.blockers.some((b) => b.code === 'BLOCKER_SPQ_YES_ITEM_MISSING_EXPLANATION:7D')).toBe(false);
    expect(result.blockers.some((b) => b.code === 'BLOCKER_SPQ_YES_ITEM_MISSING_EXPLANATION:8A')).toBe(false);
    const blocker12C = result.blockers.find((b) => b.code === 'BLOCKER_SPQ_YES_ITEM_MISSING_EXPLANATION:12C');
    expect(blocker12C).toBeDefined();
    // Distinct composite codes → each item's blocker is independently overridable.
    expect(result.blockers.filter((b) => b.code.startsWith('BLOCKER_SPQ_YES_ITEM_MISSING_EXPLANATION')).length).toBe(1);
  });

  it('the sub-item letter is never required — the main number alone, clearly delimited, is enough', () => {
    const variants = ['7D - Previous water leak near kitchen.', '7-D - Previous water leak near kitchen.', '7.D - Previous water leak near kitchen.', '7 - Previous water leak near kitchen.', '7- Previous water leak near kitchen.', '7: Previous water leak near kitchen.', 'Item 7 - Previous water leak near kitchen.', 'Question 7 - Previous water leak near kitchen.'];
    for (const explanation of variants) {
      const data = spqData({
        section_7_repairs_and_alterations: {
          property_painted_within_past_12_months: true,
          explanation_7: explanation,
        },
      });
      const result = validateDisclosuresStage(makeExtraction('SPQ', data));
      expect(result.blockers.some((b) => b.code === 'BLOCKER_SPQ_YES_ITEM_MISSING_EXPLANATION:7D'), `expected "${explanation}" to match 7D`).toBe(false);
    }
  });

  it('does not match the number when it is embedded in ordinary sentence text with no delimiter', () => {
    const data = spqData({
      section_7_repairs_and_alterations: {
        property_painted_within_past_12_months: true,
        explanation_7: 'Previous water leak near kitchen.',
      },
    });
    const result = validateDisclosuresStage(makeExtraction('SPQ', data));
    expect(result.blockers.some((b) => b.code === 'BLOCKER_SPQ_YES_ITEM_MISSING_EXPLANATION:7D')).toBe(true);
  });

  it('does not match a bare number floating in prose (e.g. "past 7 years") without a delimiter', () => {
    const data = spqData({
      section_7_repairs_and_alterations: {
        property_painted_within_past_12_months: true,
        explanation_7: 'This was addressed over the past 7 years by the seller.',
      },
    });
    const result = validateDisclosuresStage(makeExtraction('SPQ', data));
    expect(result.blockers.some((b) => b.code === 'BLOCKER_SPQ_YES_ITEM_MISSING_EXPLANATION:7D')).toBe(true);
  });

  it('a specific sub-item reference satisfies only that exact item, never a sibling sub-item under the same letter — "9A" does not satisfy "9A1"', () => {
    const data = spqData({
      section_9_disaster_relief_insurance_or_civil_settlement: {
        financial_relief_or_assistance_from_damage_or_defect: true,
        federal_flood_disaster_assistance_conditioned_on_flood_insurance: true,
        explanation_9: '9A - received FEMA assistance in 2019.',
      },
    });
    const result = validateDisclosuresStage(makeExtraction('SPQ', data));
    expect(result.blockers.some((b) => b.code === 'BLOCKER_SPQ_YES_ITEM_MISSING_EXPLANATION:9A')).toBe(false);
    expect(result.blockers.some((b) => b.code === 'BLOCKER_SPQ_YES_ITEM_MISSING_EXPLANATION:9A1')).toBe(true);
  });

  it('a genuinely bare main-number reference (no letter at all) satisfies every item under that number, since it is not specific to any one of them', () => {
    const data = spqData({
      section_9_disaster_relief_insurance_or_civil_settlement: {
        financial_relief_or_assistance_from_damage_or_defect: true,
        federal_flood_disaster_assistance_conditioned_on_flood_insurance: true,
        explanation_9: '9 - received FEMA assistance in 2019.',
      },
    });
    const result = validateDisclosuresStage(makeExtraction('SPQ', data));
    expect(result.blockers.some((b) => b.code === 'BLOCKER_SPQ_YES_ITEM_MISSING_EXPLANATION:9A')).toBe(false);
    expect(result.blockers.some((b) => b.code === 'BLOCKER_SPQ_YES_ITEM_MISSING_EXPLANATION:9A1')).toBe(false);
  });

  it('item 5C matches a bare main-number reference ("5 -"), since a bare number is not specific to any one sub-item', () => {
    const data = spqData({
      section_5_documents: {
        aware_of_documents_provided_by_others_during_ownership: true, // 5C
        explanation_5: '5 - see attached inspection reports.',
      },
    });
    const result = validateDisclosuresStage(makeExtraction('SPQ', data));
    expect(result.blockers.some((b) => b.code === 'BLOCKER_SPQ_YES_ITEM_MISSING_EXPLANATION:5C')).toBe(false);
  });

  it('a bare number with no delimiter still blockers item 5C, even mid-sentence', () => {
    const data = spqData({
      section_5_documents: {
        aware_of_documents_provided_by_others_during_ownership: true, // 5C
        explanation_5: 'See the 5 attached inspection reports.',
      },
    });
    const result = validateDisclosuresStage(makeExtraction('SPQ', data));
    expect(result.blockers.some((b) => b.code === 'BLOCKER_SPQ_YES_ITEM_MISSING_EXPLANATION:5C')).toBe(true);
  });

  it('the real form\'s own "5C-..." notation (no space before the hyphen) is matched', () => {
    const data = spqData({
      section_5_documents: {
        aware_of_documents_provided_by_others_during_ownership: true, // 5C
        explanation_5: '5C-Inspection document',
      },
    });
    const result = validateDisclosuresStage(makeExtraction('SPQ', data));
    expect(result.blockers.some((b) => b.code === 'BLOCKER_SPQ_YES_ITEM_MISSING_EXPLANATION:5C')).toBe(false);
  });

  it('a bare sub-item letter (e.g. "D -") satisfies the item without the main number, since the section already scopes it', () => {
    const data = spqData({
      section_7_repairs_and_alterations: {
        property_painted_within_past_12_months: true,
        explanation_7: 'D - Water damage near sink',
      },
    });
    const result = validateDisclosuresStage(makeExtraction('SPQ', data));
    expect(result.blockers.some((b) => b.code === 'BLOCKER_SPQ_YES_ITEM_MISSING_EXPLANATION:7D')).toBe(false);
  });

  it('"Item <letter> -" is also accepted for a bare sub-item letter reference', () => {
    const data = spqData({
      section_7_repairs_and_alterations: {
        property_painted_within_past_12_months: true,
        explanation_7: 'Item D - Water damage near sink',
      },
    });
    const result = validateDisclosuresStage(makeExtraction('SPQ', data));
    expect(result.blockers.some((b) => b.code === 'BLOCKER_SPQ_YES_ITEM_MISSING_EXPLANATION:7D')).toBe(false);
  });

  it('a bare multi-character sub-item letter (e.g. "A1 -") is accepted the same way', () => {
    const data = spqData({
      section_9_disaster_relief_insurance_or_civil_settlement: {
        federal_flood_disaster_assistance_conditioned_on_flood_insurance: true,
        explanation_9: 'A1 - received FEMA assistance in 2019.',
      },
    });
    const result = validateDisclosuresStage(makeExtraction('SPQ', data));
    expect(result.blockers.some((b) => b.code === 'BLOCKER_SPQ_YES_ITEM_MISSING_EXPLANATION:9A1')).toBe(false);
  });

  it('a bare letter that belongs to a different item in the same section does not satisfy this item', () => {
    const data = spqData({
      section_7_repairs_and_alterations: {
        property_painted_within_past_12_months: true, // 7D
        acquired_property_within_18_months_of_offer: true, // 7F
        explanation_7: 'F - purchased the home in 2024.',
      },
    });
    const result = validateDisclosuresStage(makeExtraction('SPQ', data));
    expect(result.blockers.some((b) => b.code === 'BLOCKER_SPQ_YES_ITEM_MISSING_EXPLANATION:7F')).toBe(false);
    expect(result.blockers.some((b) => b.code === 'BLOCKER_SPQ_YES_ITEM_MISSING_EXPLANATION:7D')).toBe(true);
  });

  it('a bare letter written in a different section\'s explanation area never satisfies this section\'s item', () => {
    const data = spqData({
      section_7_repairs_and_alterations: {
        property_painted_within_past_12_months: true,
        explanation_7: null,
      },
      section_8_structural_systems_and_appliances: {
        explanation_8: 'D - Water damage near sink',
      },
    });
    const result = validateDisclosuresStage(makeExtraction('SPQ', data));
    expect(result.blockers.some((b) => b.code === 'BLOCKER_SPQ_YES_ITEM_MISSING_EXPLANATION:7D')).toBe(true);
  });

  it('a bare letter does not match when embedded in an ordinary word with no delimiter', () => {
    const data = spqData({
      section_7_repairs_and_alterations: {
        property_painted_within_past_12_months: true,
        explanation_7: 'Disclosed previously by the seller.',
      },
    });
    const result = validateDisclosuresStage(makeExtraction('SPQ', data));
    expect(result.blockers.some((b) => b.code === 'BLOCKER_SPQ_YES_ITEM_MISSING_EXPLANATION:7D')).toBe(true);
  });

  it('item 5C is not satisfied by a bare letter reference that belongs to a sibling item in the same section (5A)', () => {
    const data = spqData({
      section_5_documents: {
        aware_of_documents_provided_by_others_during_ownership: true, // 5C
        explanation_5: 'A - see attached inspection reports.',
      },
    });
    const result = validateDisclosuresStage(makeExtraction('SPQ', data));
    expect(result.blockers.some((b) => b.code === 'BLOCKER_SPQ_YES_ITEM_MISSING_EXPLANATION:5C')).toBe(true);
  });

  it('item 6L (material facts/defects not otherwise disclosed) blockers when unexplained — a different item\'s explanation in the same section (6A) does not satisfy it', () => {
    const data = spqData({
      section_6_statutorily_or_contractually_required_or_related: {
        death_of_occupant_within_3_years: true, // 6A
        material_facts_or_defects_not_otherwise_disclosed: true, // 6L
        explanation_6: '6A - no death, previous tenant vacated peacefully.',
      },
    });
    const result = validateDisclosuresStage(makeExtraction('SPQ', data));
    expect(result.blockers.some((b) => b.code === 'BLOCKER_SPQ_YES_ITEM_MISSING_EXPLANATION:6A')).toBe(false);
    expect(result.blockers.some((b) => b.code === 'BLOCKER_SPQ_YES_ITEM_MISSING_EXPLANATION:6L')).toBe(true);
  });

  it('item 7F(1) is matched by the form\'s own parenthetical sub-item notation — full code, bare letter+number, and space/hyphen variants all accepted', () => {
    const variants = ['7F(1) - roof replaced by ABC Roofing, permit #12345.', 'F(1) - roof replaced by ABC Roofing.', 'F1 - roof replaced by ABC Roofing.', 'F 1 - roof replaced by ABC Roofing.', 'F-1: roof replaced by ABC Roofing.'];
    for (const explanation of variants) {
      const data = spqData({
        section_7_repairs_and_alterations: {
          acquired_property_within_18_months_of_offer: false, // 7F itself is No
          room_additions_structural_modifications_or_other_alterations_or_repairs_by_contractor: true, // 7F(1)
          explanation_7: explanation,
        },
      });
      const result = validateDisclosuresStage(makeExtraction('SPQ', data));
      expect(result.blockers.some((b) => b.code === 'BLOCKER_SPQ_YES_ITEM_MISSING_EXPLANATION:7F(1)'), `expected "${explanation}" to match 7F(1)`).toBe(false);
    }
  });

  it('a bare "F -" reference does NOT satisfy 7F(1) — that would wrongly conflate it with the separate item 7F', () => {
    const data = spqData({
      section_7_repairs_and_alterations: {
        room_additions_structural_modifications_or_other_alterations_or_repairs_by_contractor: true, // 7F(1)
        explanation_7: 'F - purchased the home in 2024.',
      },
    });
    const result = validateDisclosuresStage(makeExtraction('SPQ', data));
    expect(result.blockers.some((b) => b.code === 'BLOCKER_SPQ_YES_ITEM_MISSING_EXPLANATION:7F(1)')).toBe(true);
  });
});

describe('TDS Section II.C "Yes" item explanation validation', () => {
  function tdsData(cItems: Record<string, unknown>, explanation: string | null): Record<string, unknown> {
    return {
      header: { property_address: '123 Main St' },
      section_II_sellers_information: {
        C_environmental_and_legal: {
          ...cItems,
          explanation,
        },
      },
    };
  }

  it('passes when the explanation references the matching item\'s bare main number — TDS items have no letter on the real form', () => {
    const data = tdsData({ '1_environmental_hazards': true }, '1 - asbestos found in attic insulation.');
    const result = validateDisclosuresStage(makeExtraction('TDS', data));
    expect(result.blockers.some((b) => b.code.startsWith('BLOCKER_TDS_YES_ITEM_MISSING_EXPLANATION'))).toBe(false);
    expect(result.checks.some((c) => c.ruleId === 'tds_section_c_yes_explanations' && c.status === 'pass')).toBe(true);
  });

  it('blockers with form/item/page details when the explanation never identifies the item', () => {
    const data = tdsData({ '5_room_additions_not_to_code': true }, 'Some repairs were made previously.');
    const result = validateDisclosuresStage(makeExtraction('TDS', data));
    const blocker = result.blockers.find((b) => b.code === 'BLOCKER_TDS_YES_ITEM_MISSING_EXPLANATION:C5');
    expect(blocker).toBeDefined();
    expect(blocker?.formCode).toBe('TDS');
    expect(blocker?.location).toBe('Page 2');
    expect(blocker?.message).toBe('Item C5 is marked Yes, but no corresponding C5 explanation was found in the description section.');
  });

  it('multiple Yes items share one explanation field — only the unreferenced ones blocker', () => {
    const data = tdsData(
      { '1_environmental_hazards': true, '9_major_damage_from_disaster': true, '16_lawsuits_affecting_property': true },
      '1 - lead paint disclosed. 16 - pending HOA lawsuit disclosed.',
    );
    const result = validateDisclosuresStage(makeExtraction('TDS', data));
    expect(result.blockers.some((b) => b.code === 'BLOCKER_TDS_YES_ITEM_MISSING_EXPLANATION:C1')).toBe(false);
    expect(result.blockers.some((b) => b.code === 'BLOCKER_TDS_YES_ITEM_MISSING_EXPLANATION:C16')).toBe(false);
    expect(result.blockers.some((b) => b.code === 'BLOCKER_TDS_YES_ITEM_MISSING_EXPLANATION:C9')).toBe(true);
  });

  it('does not confuse item 1 with the leading digit of item 16, or item 9 with the leading digit of item 19', () => {
    const data = tdsData(
      { '1_environmental_hazards': true, '9_major_damage_from_disaster': true, '16_lawsuits_affecting_property': true },
      '16 - pending HOA lawsuit disclosed.',
    );
    const result = validateDisclosuresStage(makeExtraction('TDS', data));
    expect(result.blockers.some((b) => b.code === 'BLOCKER_TDS_YES_ITEM_MISSING_EXPLANATION:C1')).toBe(true);
    expect(result.blockers.some((b) => b.code === 'BLOCKER_TDS_YES_ITEM_MISSING_EXPLANATION:C9')).toBe(true);
    expect(result.blockers.some((b) => b.code === 'BLOCKER_TDS_YES_ITEM_MISSING_EXPLANATION:C16')).toBe(false);
  });

  it('TDS items have no real sub-item letter to loosen — a bare "C" is never accepted on its own', () => {
    const data = tdsData({ '5_room_additions_not_to_code': true }, 'C - some repairs were made previously.');
    const result = validateDisclosuresStage(makeExtraction('TDS', data));
    expect(result.blockers.some((b) => b.code === 'BLOCKER_TDS_YES_ITEM_MISSING_EXPLANATION:C5')).toBe(true);
  });
});

describe('buildYesExplanationResults — structured per-item results', () => {
  it('reports a correctly matched explanation as a pass with the exact structured shape (SPQ 7D regression case)', () => {
    const data = spqData({
      section_7_repairs_and_alterations: {
        property_painted_within_past_12_months: true,
        explanation_7: '7D-Yes painted 3 months back',
      },
    });
    const results = buildYesExplanationResults(data, SPQ_YES_SECTIONS, 'SPQ', 'BLOCKER_SPQ_YES_ITEM_MISSING_EXPLANATION');
    expect(results).toEqual([{
      formCode: 'SPQ',
      section: 7,
      item: '7D',
      markedYes: true,
      explanationFound: true,
      explanationText: '7D-Yes painted 3 months back',
      explanationSection: 7,
      page: 2,
      status: 'pass',
    }]);
  });

  it('reports a missing explanation as a blocker with a per-item composite blockerCode (SPQ regression case: section 8 items D/E blank)', () => {
    const data = spqData({
      section_8_structural_systems_and_appliances: {
        leasing_of_water_softener_purifier_or_alarm_system: true,
        structure_other_than_main_improvement_used_as_dwelling: true,
        explanation_8: null,
      },
    });
    const results = buildYesExplanationResults(data, SPQ_YES_SECTIONS, 'SPQ', 'BLOCKER_SPQ_YES_ITEM_MISSING_EXPLANATION');
    expect(results).toHaveLength(2);
    for (const r of results) {
      expect(r.explanationFound).toBe(false);
      expect(r.explanationText).toBeNull();
      expect(r.status).toBe('blocker');
      expect(r.section).toBe(8);
      expect(r.explanationSection).toBe(8);
    }
    expect(results.find((r) => r.item === '8D')?.blockerCode).toBe('BLOCKER_SPQ_YES_ITEM_MISSING_EXPLANATION:8D');
    expect(results.find((r) => r.item === '8E')?.blockerCode).toBe('BLOCKER_SPQ_YES_ITEM_MISSING_EXPLANATION:8E');
  });

  it('multiple Yes answers across sections each produce their own independent result', () => {
    const data = spqData({
      section_7_repairs_and_alterations: {
        property_painted_within_past_12_months: true,
        explanation_7: '7D - repainted last spring.',
      },
      section_9_disaster_relief_insurance_or_civil_settlement: {
        received_domestic_water_storage_tank_assistance: true,
        explanation_9: null,
      },
    });
    const results = buildYesExplanationResults(data, SPQ_YES_SECTIONS, 'SPQ', 'BLOCKER_SPQ_YES_ITEM_MISSING_EXPLANATION');
    expect(results).toHaveLength(2);
    expect(results.find((r) => r.item === '7D')?.status).toBe('pass');
    expect(results.find((r) => r.item === '9B')?.status).toBe('blocker');
  });

  it('an explanation placed in a different section never satisfies this section\'s Yes item — no cross-section credit', () => {
    // 7D is marked Yes but section 7's own explanation area is blank; the text that would
    // satisfy 7D was (incorrectly) written into section 8's explanation area instead.
    const data = spqData({
      section_7_repairs_and_alterations: {
        property_painted_within_past_12_months: true,
        explanation_7: null,
      },
      section_8_structural_systems_and_appliances: {
        explanation_8: '7D - painted 3 months back',
      },
    });
    const results = buildYesExplanationResults(data, SPQ_YES_SECTIONS, 'SPQ', 'BLOCKER_SPQ_YES_ITEM_MISSING_EXPLANATION');
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ item: '7D', status: 'blocker', explanationFound: false, explanationText: null });
  });

  it('TDS items report their letter-section ("C"), not a bare digit collapsed from the item code', () => {
    const data = {
      header: { property_address: '123 Main St' },
      section_II_sellers_information: {
        C_environmental_and_legal: {
          '1_environmental_hazards': true,
          '5_room_additions_not_to_code': true,
          explanation: '1 - lead paint disclosed.',
        },
      },
    };
    const results = buildYesExplanationResults(data, TDS_SECTION_C_ITEMS, 'TDS', 'BLOCKER_TDS_YES_ITEM_MISSING_EXPLANATION');
    expect(results).toHaveLength(2);
    const c1 = results.find((r) => r.item === 'C1');
    const c5 = results.find((r) => r.item === 'C5');
    expect(c1).toMatchObject({ section: 'C', explanationSection: 'C', status: 'pass', page: 2 });
    expect(c5).toMatchObject({ section: 'C', explanationSection: 'C', status: 'blocker', blockerCode: 'BLOCKER_TDS_YES_ITEM_MISSING_EXPLANATION:C5' });
  });

  it('a No-marked item never appears in the results', () => {
    const data = spqData({
      section_7_repairs_and_alterations: {
        property_painted_within_past_12_months: false,
        explanation_7: null,
      },
    });
    const results = buildYesExplanationResults(data, SPQ_YES_SECTIONS, 'SPQ', 'BLOCKER_SPQ_YES_ITEM_MISSING_EXPLANATION');
    expect(results).toHaveLength(0);
  });
});

// ─── Yes/No completion validation (every Yes/No question has exactly one answer) ───

function withCompletionState(
  data: Record<string, unknown>,
  entries: Record<string, Record<string, { yesChecked: boolean; noChecked: boolean; bothMarked?: boolean; neitherMarked?: boolean }>>,
): Record<string, unknown> {
  const state: Record<string, Record<string, unknown>> = {};
  for (const [sectionKey, fields] of Object.entries(entries)) {
    state[sectionKey] = {};
    for (const [field, s] of Object.entries(fields)) {
      state[sectionKey][field] = { bothMarked: false, neitherMarked: false, ...s };
    }
  }
  return { ...data, yesNoCompletionState: state };
}

describe('SPQ/TDS Yes/No completion validation', () => {
  it('PASS: exactly one of Yes/No marked produces no blocker', () => {
    const data = withCompletionState(
      spqData({ section_7_repairs_and_alterations: { property_painted_within_past_12_months: true, explanation_7: '7D - repainted.' } }),
      { section_7_repairs_and_alterations: { property_painted_within_past_12_months: { yesChecked: true, noChecked: false } } },
    );
    const result = validateDisclosuresStage(makeExtraction('SPQ', data));
    expect(result.blockers.some((b) => b.code.startsWith('BLOCKER_SPQ_YES_NO'))).toBe(false);
  });

  it('BLOCKER: neither Yes nor No marked reports "no answer selected"', () => {
    const data = withCompletionState(
      spqData({ section_7_repairs_and_alterations: { property_painted_within_past_12_months: false, explanation_7: null } }),
      { section_7_repairs_and_alterations: { property_painted_within_past_12_months: { yesChecked: false, noChecked: false, neitherMarked: true } } },
    );
    const result = validateDisclosuresStage(makeExtraction('SPQ', data));
    const blocker = result.blockers.find((b) => b.code === 'BLOCKER_SPQ_YES_NO_NO_ANSWER_SELECTED:7D');
    expect(blocker).toBeDefined();
    expect(blocker!.formCode).toBe('SPQ');
    expect(blocker!.location).toBe('Page 2');
    expect(blocker!.message).toMatch(/no answer selected/i);
  });

  it('BLOCKER: both Yes and No marked reports "both selected"', () => {
    const data = withCompletionState(
      spqData({ section_7_repairs_and_alterations: { property_painted_within_past_12_months: true, explanation_7: '7D - repainted.' } }),
      { section_7_repairs_and_alterations: { property_painted_within_past_12_months: { yesChecked: true, noChecked: true, bothMarked: true } } },
    );
    const result = validateDisclosuresStage(makeExtraction('SPQ', data));
    const blocker = result.blockers.find((b) => b.code === 'BLOCKER_SPQ_YES_NO_BOTH_SELECTED:7D');
    expect(blocker).toBeDefined();
    expect(blocker!.formCode).toBe('SPQ');
    expect(blocker!.location).toBe('Page 2');
    expect(blocker!.message).toMatch(/both yes and no/i);
  });

  it('an item with no vision-verified completion state is silently skipped (vision unavailable), never guessed at', () => {
    const data = spqData({ section_7_repairs_and_alterations: { property_painted_within_past_12_months: true, explanation_7: '7D - repainted.' } });
    const result = validateDisclosuresStage(makeExtraction('SPQ', data));
    expect(result.blockers.some((b) => b.code.startsWith('BLOCKER_SPQ_YES_NO'))).toBe(false);
  });

  it('this validation runs in addition to the existing Yes-needs-explanation rule, not instead of it', () => {
    // Marked Yes, no explanation (existing rule fails), AND neither checkbox marked per vision (new rule fails) — both fire independently.
    const data = withCompletionState(
      spqData({ section_7_repairs_and_alterations: { property_painted_within_past_12_months: true, explanation_7: null } }),
      { section_7_repairs_and_alterations: { property_painted_within_past_12_months: { yesChecked: false, noChecked: false, neitherMarked: true } } },
    );
    const result = validateDisclosuresStage(makeExtraction('SPQ', data));
    expect(result.blockers.some((b) => b.code === 'BLOCKER_SPQ_YES_ITEM_MISSING_EXPLANATION:7D')).toBe(true);
    expect(result.blockers.some((b) => b.code === 'BLOCKER_SPQ_YES_NO_NO_ANSWER_SELECTED:7D')).toBe(true);
  });

  it('TDS: the two standalone Yes/No questions outside Section II.C (items A and B) are checked with their own item codes and pages', () => {
    const data = withCompletionState(
      {
        header: { property_address: '123 Main St' },
        section_II_sellers_information: {
          A_property_items: { items_not_operating: true, items_not_operating_description: 'garage door not working' },
          B_defects_malfunctions: { aware_of_defects: true, explanation: null },
        },
      },
      {
        'section_II_sellers_information.A_property_items': { items_not_operating: { yesChecked: false, noChecked: false, neitherMarked: true } },
        'section_II_sellers_information.B_defects_malfunctions': { aware_of_defects: { yesChecked: true, noChecked: true, bothMarked: true } },
      },
    );
    const results = buildYesNoCompletionResults(data, TDS_ALL_YES_NO_SECTIONS, 'TDS', 'BLOCKER_TDS_YES_NO_NO_ANSWER_SELECTED', 'BLOCKER_TDS_YES_NO_BOTH_SELECTED');
    const itemA = results.find((r) => r.item === 'A');
    const itemB = results.find((r) => r.item === 'B');
    expect(itemA).toMatchObject({ page: 1, status: 'blocker', issueType: 'no_answer_selected', blockerCode: 'BLOCKER_TDS_YES_NO_NO_ANSWER_SELECTED:A' });
    expect(itemB).toMatchObject({ page: 2, status: 'blocker', issueType: 'both_selected', blockerCode: 'BLOCKER_TDS_YES_NO_BOTH_SELECTED:B' });
  });

  it('TDS: Section II.C completion blockers use the composite C-item codes, independent of the explanation check', () => {
    const data = withCompletionState(
      {
        header: { property_address: '123 Main St' },
        section_II_sellers_information: {
          C_environmental_and_legal: { '1_environmental_hazards': true, explanation: '1 - asbestos found.' },
        },
      },
      { 'section_II_sellers_information.C_environmental_and_legal': { '1_environmental_hazards': { yesChecked: true, noChecked: true, bothMarked: true } } },
    );
    const result = validateDisclosuresStage(makeExtraction('TDS', data));
    expect(result.blockers.some((b) => b.code === 'BLOCKER_TDS_YES_NO_BOTH_SELECTED:C1')).toBe(true);
    // The explanation check passes independently — C1 has a matching explanation.
    expect(result.blockers.some((b) => b.code === 'BLOCKER_TDS_YES_ITEM_MISSING_EXPLANATION:C1')).toBe(false);
  });
});
