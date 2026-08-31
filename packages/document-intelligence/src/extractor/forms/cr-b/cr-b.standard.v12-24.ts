import { FORM_FOOTER_FIELDS, FORM_FOOTER_INSTRUCTION } from '../form-definition';
import type { FormDefinition } from '../form-definition';

const CR_B_TEMPLATE = {
  header: {
    ...FORM_FOOTER_FIELDS,
    property_address: '<string | null>',
    total_pages: '<number | null>',
    removal_date: '<date: YYYY-MM-DD | null>',
  },

  contingencies_removed: {
    inspection: '<boolean>',
    loan: '<boolean>',
    appraisal: '<boolean>',
    all_contingencies: '<boolean>',
  },

  signatures: {
    buyer_signature_1: '<boolean>',
    buyer_signature_1_date: '<date: YYYY-MM-DD | null>',
    buyer_signature_2: '<boolean>',
    buyer_signature_2_date: '<date: YYYY-MM-DD | null>',
  },

  extractionWarnings: ['<string>'],
};

export const crBStandardV1224: FormDefinition = {
  formCode: 'CR-B',
  formName: 'Contingency Removal (Buyer)',
  variant: 'standard',
  version: 'v12-24',
  criticality: 'routine',

  systemPrompt: `You are an expert California real estate transaction coordinator.
Extract all data from a C.A.R. Form CR-B — Contingency Removal (Buyer).

${FORM_FOOTER_INSTRUCTION}
Also read the page footer's "Page X of Y" text and set header.total_pages to Y (the total page count).

CRITICAL GUIDELINES:
1. CR-B is the Buyer's written removal of one or more contingencies from the purchase agreement,
   making the purchase non-refundable as to those contingencies. The form has checkboxes for which
   contingency(ies) are being removed — a single CR-B may remove one, several, or all of them at once.
2. Set contingencies_removed.inspection to true only if the box for the inspection/investigation
   of property contingency is checked.
3. Set contingencies_removed.loan to true only if the box for the loan contingency is checked.
4. Set contingencies_removed.appraisal to true only if the box for the appraisal contingency is checked.
5. Set contingencies_removed.all_contingencies to true only if the form checks the box removing ALL
   contingencies (rather than checking each one individually).
6. Extract up to two Buyer signature blocks (some transactions have two Buyers). If a signature
   block is blank or the name is not printed, set the corresponding signed field to false and its
   date field to null.
7. If there is no second Buyer on the form at all, set buyer_signature_2 to false and its date to null.

EXPECTED OUTPUT FORMAT:
Return ONLY valid JSON matching this template exactly. No markdown, no explanation.

${JSON.stringify(CR_B_TEMPLATE, null, 2)}`,

  userPrompt: 'Extract all fields from this Contingency Removal (CR-B) form and return valid JSON matching the template. Output ONLY valid JSON.',
};
