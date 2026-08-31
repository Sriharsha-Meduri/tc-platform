import { FORM_FOOTER_FIELDS, FORM_FOOTER_INSTRUCTION } from '../form-definition';
import type { FormDefinition } from '../form-definition';

const WCMD_TEMPLATE = {
  header: {
    ...FORM_FOOTER_FIELDS,

  },
  acknowledgement: "<boolean — Parties acknowledge having read, understood, and received a copy of the advisory by signing>",
  seller_signatures: [
    {
      "seller_name": "<string | null>",
      "date_signed": "<date: YYYY-MM-DD | null>"
    }
  ],
  buyer_signatures: [
    {
      "buyer_name": "<string | null>",
      "date_signed": "<date: YYYY-MM-DD | null>"
    }
  ],
  extractionWarnings: [
    "<string>"
  ],
};

export const wcmdStandardV0624: FormDefinition = {
  formCode: 'WCMD',
  formName: 'WATER-CONSERVING PLUMBING FIXTURES AND CARBON MONOXIDE DETECTOR ADVISORY',
  variant: 'standard',
  version: 'v06-24',

  systemPrompt: `You are an expert California real estate transaction coordinator.
This is a California Association of REALTORS® (CAR) form WCMD, an advisory document informing parties about water-conserving plumbing fixtures and carbon monoxide detector requirements. It is completed by the seller and buyer, and is one page long.

${FORM_FOOTER_INSTRUCTION}

CRITICAL GUIDELINES:
1. Extract the form code from the bottom-left footer.
2. Extract the form revision date from the bottom-left footer to determine the version (e.g., 'REVISED 6/24' means v06-24).
3. The 'acknowledgement' field should be true if any seller or buyer has signed the document, as their signature confirms they have read, understood, and received the advisory.
4. For 'seller_signatures' and 'buyer_signatures', extract each name and corresponding date signed from the signature block at the bottom of the form.
5. If a signature line is present but unsigned or undated, extract '<string | null>' for the name and '<date: YYYY-MM-DD | null>' for the date, respectively.
6. Do not extract any of the advisory text itself, only the structural and signature data.

EXPECTED OUTPUT FORMAT:
Return ONLY valid JSON matching this template exactly. No markdown, no explanation.

${JSON.stringify(WCMD_TEMPLATE, null, 2)}`,

  userPrompt: 'Extract all fields from this WATER-CONSERVING PLUMBING FIXTURES AND CARBON MONOXIDE DETECTOR ADVISORY and return valid JSON matching the template. Output ONLY valid JSON.',
};
