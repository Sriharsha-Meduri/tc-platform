import { FORM_FOOTER_FIELDS, FORM_FOOTER_INSTRUCTION } from '../form-definition';
import type { FormDefinition } from '../form-definition';

const AD_TEMPLATE = {
  header: {
    ...FORM_FOOTER_FIELDS,
    property_address: '<string | null>',
    date: '<date: YYYY-MM-DD | null>',
  },

  listing_agent: {
    name: '<string | null>',
    dre_license: '<string | null>',
    brokerage_name: '<string | null>',
    brokerage_dre: '<string | null>',
    is_seller_agent: '<boolean>',
    is_dual_agent: '<boolean>',
  },

  selling_agent: {
    name: '<string | null>',
    dre_license: '<string | null>',
    brokerage_name: '<string | null>',
    brokerage_dre: '<string | null>',
    is_buyer_agent: '<boolean>',
    is_dual_agent: '<boolean>',
    is_same_as_listing_agent: '<boolean>',
  },

  agency_confirmation: {
    listing_agent_represents: "<'Seller exclusively' | 'Both buyer and seller' | null>",
    selling_agent_represents: "<'Buyer exclusively' | 'Seller exclusively' | 'Both buyer and seller' | null>",
  },

  signatures: {
    seller_signed: '<boolean>',
    seller_signature_date: '<date: YYYY-MM-DD | null>',
    buyer_signed: '<boolean>',
    buyer_signature_date: '<date: YYYY-MM-DD | null>',
    listing_agent_signed: '<boolean>',
    listing_agent_signature_date: '<date: YYYY-MM-DD | null>',
    selling_agent_signed: '<boolean>',
    selling_agent_signature_date: '<date: YYYY-MM-DD | null>',
  },

  extractionWarnings: ['<string>'],
};

export const adStandardV1223: FormDefinition = {
  formCode: 'AD',
  formName: 'Disclosure Regarding Real Estate Agency Relationships',
  variant: 'standard',
  version: 'v12-23',
  criticality: 'critical',

  systemPrompt: `You are an expert California real estate transaction coordinator.
Extract all data from a C.A.R. Form AD — Disclosure Regarding Real Estate Agency Relationships.

${FORM_FOOTER_INSTRUCTION}

CRITICAL GUIDELINES:
1. The AD form defines the agency relationship between each agent and the parties they represent.
   It appears multiple times in a transaction package — once per agent or once for both.
2. Identify whether each agent checked "Seller's Agent", "Buyer's Agent", or "Both" (dual agent).
3. The "selling agent" in CAR terminology is the BUYER's agent — do not confuse with the listing agent.
4. Agency Confirmation section (usually bottom of page 2 or end of form): look for checked boxes confirming
   whether the listing agent represents Seller exclusively or both, and whether the selling agent
   represents Buyer exclusively, Seller exclusively, or both.
5. Extract all four signature blocks: Seller, Buyer, Listing Agent, Selling Agent.
6. If a signature block is blank or the name is not printed, set signed = false.

EXPECTED OUTPUT FORMAT:
Return ONLY valid JSON matching this template exactly. No markdown, no explanation.

${JSON.stringify(AD_TEMPLATE, null, 2)}`,

  userPrompt: 'Extract all fields from this Agency Disclosure form and return valid JSON matching the template. Output ONLY valid JSON.',
};
