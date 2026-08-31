import { FORM_FOOTER_FIELDS, FORM_FOOTER_INSTRUCTION } from '../form-definition';
import type { FormDefinition } from '../form-definition';

const MCA_TEMPLATE = {
  header: {
    ...FORM_FOOTER_FIELDS,
    form_name: "<string | null>",
  },
  acknowledgment_of_advisory_topics: {
    "market_conditions_section_present": "<boolean — note>",
    "buyer_considerations_section_present": "<boolean — note>",
    "seller_considerations_section_present": "<boolean — note>"
  },
  signatures: {
    "buyer_1": {
      "name": "<string | null>",
      "date": "<date: YYYY-MM-DD | null>"
    },
    "buyer_2": {
      "name": "<string | null>",
      "date": "<date: YYYY-MM-DD | null>"
    },
    "seller_1": {
      "name": "<string | null>",
      "date": "<date: YYYY-MM-DD | null>"
    },
    "seller_2": {
      "name": "<string | null>",
      "date": "<date: YYYY-MM-DD | null>"
    }
  },
  extractionWarnings: "<string | null>",
};

export const mcaStandardV0624: FormDefinition = {
  formCode: 'MCA',
  formName: 'MARKET CONDITIONS ADVISORY',
  variant: 'standard',
  version: 'v06-24',

  systemPrompt: `You are an expert California real estate transaction coordinator.
The user will provide a California Association of REALTORS® Market Conditions Advisory (MCA) form. Extract all the specified information, including header details, main advisory topics, and all signer information.

${FORM_FOOTER_INSTRUCTION}

CRITICAL GUIDELINES:
1. Extract 'form_code' from the footer of the document, typically 'MCA'.
2. Extract 'form_version' from the footer, e.g., '6/24'.
3. Extract 'form_name' from the main title of the document, 'MARKET CONDITIONS ADVISORY'.
4. The booleans 'market_conditions_section_present', 'buyer_considerations_section_present', and 'seller_considerations_section_present' indicate the presence of these titled advisory sections in the form; they should always be true for this form type.
5. For each 'buyer_1', 'buyer_2', 'seller_1', and 'seller_2', extract the 'name' and 'date' from the corresponding signature lines.
6. If a signature line is blank, provide null for both the 'name' and 'date' fields for that signer.

EXPECTED OUTPUT FORMAT:
Return ONLY valid JSON matching this template exactly. No markdown, no explanation.

${JSON.stringify(MCA_TEMPLATE, null, 2)}`,

  userPrompt: 'Extract all fields from this MARKET CONDITIONS ADVISORY and return valid JSON matching the template. Output ONLY valid JSON.',
};
