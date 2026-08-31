import { FORM_FOOTER_FIELDS, FORM_FOOTER_INSTRUCTION } from '../form-definition';
import type { FormDefinition } from '../form-definition';

const DIA_TEMPLATE = {
  header: {
    ...FORM_FOOTER_FIELDS,

  },
  seller_acknowledgements: {
    "seller_1_signed": "<boolean>",
    "seller_1_date": "<date: YYYY-MM-DD | null>",
    "seller_2_signed": "<boolean>",
    "seller_2_date": "<date: YYYY-MM-DD | null>"
  },
  extractionWarnings: [
    "<string>"
  ],
};

export const diaStandardV1225: FormDefinition = {
  formCode: 'DIA',
  formName: 'DISCLOSURE INFORMATION ADVISORY (FOR SELLERS)',
  variant: 'standard',
  version: 'v12-25',

  systemPrompt: `You are an expert California real estate transaction coordinator.
This is a 3-page California Association of REALTORS® (CAR) Disclosure Information Advisory (For Sellers) form (DIA). It provides sellers with essential information regarding their disclosure obligations in real property transactions.

${FORM_FOOTER_INSTRUCTION}

CRITICAL GUIDELINES:
1. Extract the form code and revision date from the footer as 'form_code' and 'form_version' respectively.
2. Do NOT extract any of the advisory or informational text from the body of the document. This form is for information only, except for signatures.
3. Identify if Seller 1 has signed the acknowledgment and extract the corresponding date into 'seller_1_signed' and 'seller_1_date'.
4. Identify if Seller 2 has signed the acknowledgment and extract the corresponding date into 'seller_2_signed' and 'seller_2_date'.
5. The 'seller_signed' fields are boolean; set to true if a signature is present, false otherwise.
6. Dates must be extracted in 'YYYY-MM-DD' format, or null if not present.

EXPECTED OUTPUT FORMAT:
Return ONLY valid JSON matching this template exactly. No markdown, no explanation.

${JSON.stringify(DIA_TEMPLATE, null, 2)}`,

  userPrompt: 'Extract all fields from this DISCLOSURE INFORMATION ADVISORY (FOR SELLERS) and return valid JSON matching the template. Output ONLY valid JSON.',
};
