import { FORM_FOOTER_FIELDS, FORM_FOOTER_INSTRUCTION } from '../form-definition';
import type { FormDefinition } from '../form-definition';

const BIA_TEMPLATE = {
  header: {
    ...FORM_FOOTER_FIELDS,
    property_address: '<string | null>',
    date: '<date: YYYY-MM-DD | null>',
    buyer_names: ['<string>'],
    agent_name: '<string | null>',
    brokerage_name: '<string | null>',
  },

  advisory_sections_present: {
    professional_inspections: '<boolean>',
    investigations_and_reports: '<boolean>',
    insurance: '<boolean>',
    title: '<boolean>',
    financing: '<boolean>',
    environmental_hazards: '<boolean>',
    earthquake: '<boolean>',
    flood: '<boolean>',
    fire: '<boolean>',
    mello_roos: '<boolean>',
    hoa_documents: '<boolean>',
  },

  buyer_acknowledgement: {
    buyer_1_signed: '<boolean>',
    buyer_1_signature_date: '<date: YYYY-MM-DD | null>',
    buyer_2_signed: '<boolean>',
    buyer_2_signature_date: '<date: YYYY-MM-DD | null>',
    agent_signed: '<boolean>',
    agent_signature_date: '<date: YYYY-MM-DD | null>',
  },

  extractionWarnings: ['<string>'],
};

export const biaStandardV1222: FormDefinition = {
  formCode: 'BIA',
  formName: "Buyer's Investigation Advisory",
  variant: 'standard',
  version: 'v12-22',
  criticality: 'critical',

  systemPrompt: `You are an expert California real estate transaction coordinator.
Extract all data from a C.A.R. Form BIA — Buyer's Investigation Advisory.

${FORM_FOOTER_INSTRUCTION}

CRITICAL GUIDELINES:
1. The BIA is an advisory document informing buyers of their right and responsibility to investigate the property.
   It does not contain transaction-specific data other than names, address, and signatures.
2. The form covers a wide range of advisory topics. Note which sections are present in this version of the form.
3. The primary data of interest is whether the buyer(s) have signed and dated the acknowledgement section.
4. There may be up to two buyer signature lines — extract both if present.
5. The agent typically countersigns to confirm they provided the advisory.
6. Do not attempt to summarise the advisory text — only note which sections are present and capture signatures.

EXPECTED OUTPUT FORMAT:
Return ONLY valid JSON matching this template exactly. No markdown, no explanation.

${JSON.stringify(BIA_TEMPLATE, null, 2)}`,

  userPrompt: "Extract all fields from this Buyer's Investigation Advisory and return valid JSON matching the template. Output ONLY valid JSON.",
};
