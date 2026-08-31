import { FORM_FOOTER_FIELDS, FORM_FOOTER_INSTRUCTION } from '../form-definition';
import type { FormDefinition } from '../form-definition';

const PRBS_TEMPLATE = {
  header: {
    ...FORM_FOOTER_FIELDS,
    property_address: '<string | null>',
    date: '<date: YYYY-MM-DD | null>',
  },

  parties: {
    buyer_names: ['<string>'],
    seller_names: ['<string>'],
  },

  agent: {
    name: '<string | null>',
    dre_license: '<string | null>',
    brokerage_name: '<string | null>',
    brokerage_dre: '<string | null>',
    role: "<'Listing Agent' | 'Selling Agent' | 'Both' | null>",
  },

  disclosure: {
    agent_represents_more_than_one_buyer: '<boolean>',
    agent_represents_more_than_one_seller: '<boolean>',
    description_of_other_parties: '<string | null>',
  },

  consent: {
    buyer_consents: '<boolean>',
    seller_consents: '<boolean>',
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

export const prbsStandardV1222: FormDefinition = {
  formCode: 'PRBS',
  formName: 'Possible Representation of More Than One Buyer or Seller — Disclosure and Consent',
  variant: 'standard',
  version: 'v12-22',

  systemPrompt: `You are an expert California real estate transaction coordinator.
Extract all data from a C.A.R. Form PRBS — Possible Representation of More Than One Buyer or Seller.

${FORM_FOOTER_INSTRUCTION}

CRITICAL GUIDELINES:
1. The PRBS form discloses that the agent may be representing other buyers (or sellers) interested in the same
   or similar property, and obtains consent from all parties for this arrangement.
2. The form has two sections — one for representing multiple buyers and one for multiple sellers.
   Identify which section(s) apply by checking which boxes are marked.
3. Consent boxes: each party must check a box indicating they consent (or do not consent) to the arrangement.
   Extract whether the consent box is checked (true) or not (false).
4. This form typically requires signatures from both buyers and sellers.
5. The agent's information appears at the top or in a separate section.

EXPECTED OUTPUT FORMAT:
Return ONLY valid JSON matching this template exactly. No markdown, no explanation.

${JSON.stringify(PRBS_TEMPLATE, null, 2)}`,

  userPrompt: 'Extract all fields from this Possible Representation disclosure form and return valid JSON matching the template. Output ONLY valid JSON.',
};
