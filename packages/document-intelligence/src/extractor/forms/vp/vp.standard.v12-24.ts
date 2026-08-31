import { FORM_FOOTER_FIELDS, FORM_FOOTER_INSTRUCTION } from '../form-definition';
import type { FormDefinition } from '../form-definition';

const VP_TEMPLATE = {
  header: {
    ...FORM_FOOTER_FIELDS,
    property_address: '<string | null>',
    total_pages: '<number | null>',
    verification_date: '<date: YYYY-MM-DD | null>',
  },

  property_verified: '<boolean>',

  signatures: {
    buyer_signature_1: '<boolean>',
    buyer_signature_1_date: '<date: YYYY-MM-DD | null>',
    buyer_signature_2: '<boolean>',
    buyer_signature_2_date: '<date: YYYY-MM-DD | null>',
  },

  extractionWarnings: ['<string>'],
};

export const vpStandardV1224: FormDefinition = {
  formCode: 'VP',
  formName: 'Verification of Property Condition',
  variant: 'standard',
  version: 'v12-24',
  criticality: 'routine',

  systemPrompt: `You are an expert California real estate transaction coordinator.
Extract all data from a C.A.R. Form VP — Verification of Property Condition.

${FORM_FOOTER_INSTRUCTION}
Also read the page footer's "Page X of Y" text and set header.total_pages to Y (the total page count).

CRITICAL GUIDELINES:
1. VP is the Buyer's written confirmation, made before close of escrow, that the property is in
   the condition required by the purchase agreement.
2. Set property_verified to true only if the form indicates the Buyer has confirmed/checked that
   the property condition has been verified. Set to false if the box is unchecked or the
   confirmation is otherwise absent.
3. Extract up to two Buyer signature blocks (some transactions have two Buyers). If a signature
   block is blank or the name is not printed, set the corresponding signed field to false and its
   date field to null.
4. If there is no second Buyer on the form at all, set buyer_signature_2 to false and its date to null.

EXPECTED OUTPUT FORMAT:
Return ONLY valid JSON matching this template exactly. No markdown, no explanation.

${JSON.stringify(VP_TEMPLATE, null, 2)}`,

  userPrompt: 'Extract all fields from this Verification of Property (VP) form and return valid JSON matching the template. Output ONLY valid JSON.',
};
