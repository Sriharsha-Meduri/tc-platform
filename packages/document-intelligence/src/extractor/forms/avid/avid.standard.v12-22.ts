import { FORM_FOOTER_FIELDS, FORM_FOOTER_INSTRUCTION } from '../form-definition';
import type { FormDefinition } from '../form-definition';

const AVID_TEMPLATE = {
  header: {
    ...FORM_FOOTER_FIELDS,
    property_address: '<string | null>',
    date: '<date: YYYY-MM-DD | null>',
    agent_name: '<string | null>',
    agent_dre_license: '<string | null>',
    brokerage_name: '<string | null>',
    agent_role: "<'Listing Agent' | 'Selling Agent' | 'Both' | null>",
  },

  items_inspected: {
    exterior: {
      roof_visible: '<boolean>',
      gutters: '<boolean>',
      siding_stucco_paint: '<boolean>',
      windows: '<boolean>',
      driveway_walkway: '<boolean>',
      garage_visible: '<boolean>',
      yard_landscaping: '<boolean>',
      pool_spa_visible: '<boolean>',
      visible_defects_noted: '<string | null>',
    },
    interior: {
      walls_ceilings: '<boolean>',
      floors: '<boolean>',
      windows_doors: '<boolean>',
      kitchen_visible: '<boolean>',
      bathrooms_visible: '<boolean>',
      garage_interior_visible: '<boolean>',
      attic_visible: '<boolean>',
      basement_visible: '<boolean>',
      visible_defects_noted: '<string | null>',
    },
    systems: {
      electrical_visible: '<boolean>',
      plumbing_visible: '<boolean>',
      hvac_visible: '<boolean>',
      water_heater_visible: '<boolean>',
      visible_defects_noted: '<string | null>',
    },
  },

  items_not_inspected: '<string | null>',
  additional_notes: '<string | null>',
  areas_recommended_for_further_inspection: '<string | null>',

  signatures: {
    agent_signed: '<boolean>',
    agent_signature_date: '<date: YYYY-MM-DD | null>',
    buyer_signed: '<boolean>',
    buyer_signature_date: '<date: YYYY-MM-DD | null>',
    buyer_acknowledged: '<boolean>',
  },

  extractionWarnings: ['<string>'],
};

export const avidStandardV1222: FormDefinition = {
  formCode: 'AVID',
  formName: 'Agent Visual Inspection Disclosure',
  variant: 'standard',
  version: 'v12-22',
  criticality: 'critical',

  systemPrompt: `You are an expert California real estate transaction coordinator.
Extract all data from a C.A.R. Form AVID — Agent Visual Inspection Disclosure.

${FORM_FOOTER_INSTRUCTION}

CRITICAL GUIDELINES:
1. The AVID documents what the agent personally observed during their visual inspection of the property.
   It is NOT a professional inspection report — it only covers what was visible to the agent.
2. For each inspection area (Exterior, Interior, Systems), note whether it was inspected and any defects seen.
3. "Items not inspected" typically lists areas that were inaccessible (locked rooms, covered surfaces, etc.).
4. The agent signs affirming these are their observations. The buyer signs acknowledging receipt.
5. There may be two AVID forms in a package — one from the listing agent and one from the selling (buyer's) agent.
   If so, extract both but return the one from the selling/buyer's agent if you must choose one.
6. Additional notes and recommendations for further inspection are important — capture verbatim if present.

EXPECTED OUTPUT FORMAT:
Return ONLY valid JSON matching this template exactly. No markdown, no explanation.

${JSON.stringify(AVID_TEMPLATE, null, 2)}`,

  userPrompt: 'Extract all fields from this Agent Visual Inspection Disclosure and return valid JSON matching the template. Output ONLY valid JSON.',
};
