import { FORM_FOOTER_FIELDS, FORM_FOOTER_INSTRUCTION } from '../form-definition';
import type { FormDefinition } from '../form-definition';

const SBSA_TEMPLATE = {
  header: {
    ...FORM_FOOTER_FIELDS,
    property_address: '<string | null>',
    date: '<date: YYYY-MM-DD | null>',
    buyer_names: ['<string>'],
    seller_names: ['<string>'],
  },

  advisory_topics_covered: {
    market_conditions: '<boolean>',
    property_condition: '<boolean>',
    inspections: '<boolean>',
    insurance: '<boolean>',
    title: '<boolean>',
    legal_and_tax: '<boolean>',
    environmental_hazards: '<boolean>',
    earthquake: '<boolean>',
    flood: '<boolean>',
    fire_hazard: '<boolean>',
    mello_roos: '<boolean>',
    hoa: '<boolean>',
    governmental_requirements: '<boolean>',
    disclosure_obligations: '<boolean>',
    financing: '<boolean>',
    technology_and_internet: '<boolean>',
    moving_day: '<boolean>',
  },

  signatures: {
    buyer_1_signed: '<boolean>',
    buyer_1_signature_date: '<date: YYYY-MM-DD | null>',
    buyer_2_signed: '<boolean>',
    buyer_2_signature_date: '<date: YYYY-MM-DD | null>',
    seller_1_signed: '<boolean>',
    seller_1_signature_date: '<date: YYYY-MM-DD | null>',
    seller_2_signed: '<boolean>',
    seller_2_signature_date: '<date: YYYY-MM-DD | null>',
  },

  extractionWarnings: ['<string>'],
};

export const sbsaStandardV1222: FormDefinition = {
  formCode: 'SBSA',
  formName: 'Statewide Buyer and Seller Advisory',
  variant: 'standard',
  version: 'v12-22',

  systemPrompt: `You are an expert California real estate transaction coordinator.
Extract all data from a C.A.R. Form SBSA — Statewide Buyer and Seller Advisory.

${FORM_FOOTER_INSTRUCTION}

CRITICAL GUIDELINES:
1. The SBSA is a comprehensive multi-page advisory covering California real estate law and best practices.
   It is primarily a signature form — both buyers AND sellers must sign it.
2. The advisory topics list shows which sections are covered in this version of the form.
   Mark a topic as present (true) if you see a section heading for it.
3. The most important data is the signature blocks at the end of the form.
   The SBSA is unique in requiring BOTH buyer and seller signatures.
4. There may be multiple pages before the signature page. Focus on the final signature block.
5. Dates are printed or handwritten next to each signature line.

EXPECTED OUTPUT FORMAT:
Return ONLY valid JSON matching this template exactly. No markdown, no explanation.

${JSON.stringify(SBSA_TEMPLATE, null, 2)}`,

  userPrompt: 'Extract all fields from this Statewide Buyer and Seller Advisory and return valid JSON matching the template. Output ONLY valid JSON.',
};
