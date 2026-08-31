import { FORM_FOOTER_FIELDS, FORM_FOOTER_INSTRUCTION } from '../form-definition';
import type { FormDefinition } from '../form-definition';

const CCPA_TEMPLATE = {
  header: {
    ...FORM_FOOTER_FIELDS,

  },
  acknowledgement_signatures: {
    "party_1_name": "<string | null>",
    "party_1_date": "<date: YYYY-MM-DD | null>",
    "party_2_name": "<string | null>",
    "party_2_date": "<date: YYYY-MM-DD | null>"
  },
  extractionWarnings: [
    "<string>"
  ],
};

export const ccpaStandardV1222: FormDefinition = {
  formCode: 'CCPA',
  formName: 'CALIFORNIA CONSUMER PRIVACY ACT ADVISORY, DISCLOSURE AND NOTICE',
  variant: 'standard',
  version: 'v12-22',

  systemPrompt: `You are an expert California real estate transaction coordinator.
This is the California Consumer Privacy Act Advisory, Disclosure and Notice (CCPA) form, a 1-page document from the California Association of REALTORS®. It provides information about consumer rights under the CCPA in real estate transactions. The form is completed by parties (Buyer/Seller/Landlord/Tenant) to acknowledge receipt of the advisory.

${FORM_FOOTER_INSTRUCTION}

CRITICAL GUIDELINES:
1. Extract the form code from the bottom-left footer (e.g., 'CCPA').
2. Extract the form version from the 'REVISED MM/YY' in the footer (e.g., '12/22' becomes 'v12-22').
3. Locate the section 'I/we acknowledge receipt of a copy of this California Consumer Privacy Act Advisory, Disclosure and Notice.'
4. For the first acknowledgement line, extract the name provided next to 'Buyer/Seller/Landlord/Tenant' into 'party_1_name' and the corresponding date into 'party_1_date'.
5. For the second acknowledgement line (if present), extract the name into 'party_2_name' and the date into 'party_2_date'.
6. If a party line is blank, its corresponding name and date fields should be null.
7. Do not extract any of the advisory text, explanations, or section titles from the main body of the form; only extract the specific acknowledgement fields.

EXPECTED OUTPUT FORMAT:
Return ONLY valid JSON matching this template exactly. No markdown, no explanation.

${JSON.stringify(CCPA_TEMPLATE, null, 2)}`,

  userPrompt: 'Extract all fields from this CALIFORNIA CONSUMER PRIVACY ACT ADVISORY, DISCLOSURE AND NOTICE and return valid JSON matching the template. Output ONLY valid JSON.',
};
