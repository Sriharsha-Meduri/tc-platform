import { FORM_FOOTER_FIELDS, FORM_FOOTER_INSTRUCTION } from '../form-definition';
import type { FormDefinition } from '../form-definition';

const RR_TEMPLATE = {
  header: {
    ...FORM_FOOTER_FIELDS,
    property_address: '<string | null>',
    total_pages: '<number | null>',
    request_date: '<date: YYYY-MM-DD | null>',
  },

  repair_items: [
    {
      item_number: '<number>',
      description: '<string>',
    },
  ],

  signatures: {
    buyer_signature_1: '<boolean>',
    buyer_signature_1_date: '<date: YYYY-MM-DD | null>',
    buyer_signature_2: '<boolean>',
    buyer_signature_2_date: '<date: YYYY-MM-DD | null>',
  },

  extractionWarnings: ['<string>'],
};

export const rrStandardV1224: FormDefinition = {
  formCode: 'RR',
  formName: 'Request for Repair',
  variant: 'standard',
  version: 'v12-24',
  criticality: 'routine',

  systemPrompt: `You are an expert California real estate transaction coordinator.
Extract all data from a C.A.R. Form RR — Request for Repair.

${FORM_FOOTER_INSTRUCTION}
Also read the page footer's "Page X of Y" text and set header.total_pages to Y (the total page count).

CRITICAL GUIDELINES:
1. RR is the Buyer's written request that the Seller make specific repairs or provide a credit
   in lieu of repairs, following inspection.
2. Extract every numbered repair item as a separate entry in repair_items — item_number is the
   line/item number printed on the form, description is the requested repair or credit in full.
3. Extract up to two Buyer signature blocks (some transactions have two Buyers). If a signature
   block is blank or the name is not printed, set the corresponding signed field to false and its
   date field to null.
4. If there is no second Buyer on the form at all, set buyer_signature_2 to false and its date to null.

EXPECTED OUTPUT FORMAT:
Return ONLY valid JSON matching this template exactly. No markdown, no explanation.

${JSON.stringify(RR_TEMPLATE, null, 2)}`,

  userPrompt: 'Extract all fields from this Request for Repair (RR) form and return valid JSON matching the template. Output ONLY valid JSON.',
};
