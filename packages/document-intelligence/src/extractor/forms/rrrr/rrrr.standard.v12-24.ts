import { FORM_FOOTER_FIELDS, FORM_FOOTER_INSTRUCTION } from '../form-definition';
import type { FormDefinition } from '../form-definition';

const RRRR_TEMPLATE = {
  header: {
    ...FORM_FOOTER_FIELDS,
    property_address: '<string | null>',
    total_pages: '<number | null>',
    response_date: '<date: YYYY-MM-DD | null>',
  },

  response_items: [
    {
      item_number: '<number>',
      response: "<'agree' | 'partially_agree' | 'decline' | null>",
      notes: '<string | null>',
    },
  ],

  signatures: {
    seller_signature_1: '<boolean>',
    seller_signature_1_date: '<date: YYYY-MM-DD | null>',
    seller_signature_2: '<boolean>',
    seller_signature_2_date: '<date: YYYY-MM-DD | null>',
  },

  extractionWarnings: ['<string>'],
};

export const rrrrStandardV1224: FormDefinition = {
  formCode: 'RRRR',
  formName: "Seller's Response to Buyer's Request for Repair",
  variant: 'standard',
  version: 'v12-24',
  criticality: 'routine',

  systemPrompt: `You are an expert California real estate transaction coordinator.
Extract all data from a C.A.R. Form RRRR — Seller's Response to Buyer's Request for Repair.

${FORM_FOOTER_INSTRUCTION}
Also read the page footer's "Page X of Y" text and set header.total_pages to Y (the total page count).

CRITICAL GUIDELINES:
1. RRRR is the Seller's written response to the Buyer's Request for Repair (RR) — agreeing,
   partially agreeing, or declining each requested item.
2. Extract every numbered response item as a separate entry in response_items — item_number
   matches the corresponding RR item number, response is the Seller's checked decision, notes is
   any explanation or counter-terms written for that item.
3. Extract up to two Seller signature blocks (some transactions have two Sellers). If a signature
   block is blank or the name is not printed, set the corresponding signed field to false and its
   date field to null.
4. If there is no second Seller on the form at all, set seller_signature_2 to false and its date to null.

EXPECTED OUTPUT FORMAT:
Return ONLY valid JSON matching this template exactly. No markdown, no explanation.

${JSON.stringify(RRRR_TEMPLATE, null, 2)}`,

  userPrompt: "Extract all fields from this Seller's Response to Buyer's Request for Repair (RRRR) form and return valid JSON matching the template. Output ONLY valid JSON.",
};
