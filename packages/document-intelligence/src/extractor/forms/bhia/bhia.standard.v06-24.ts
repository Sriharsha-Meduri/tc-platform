import { FORM_FOOTER_FIELDS, FORM_FOOTER_INSTRUCTION } from '../form-definition';
import type { FormDefinition } from '../form-definition';

const BHIA_TEMPLATE = {
  header: {
    ...FORM_FOOTER_FIELDS,

  },
  acknowledges_advisory: "<boolean — true if any buyer signature is present>",
  buyer_signatures: [
    {
      "buyer_name": "<string | null>",
      "date": "<date: YYYY-MM-DD | null>"
    }
  ],
  transaction_agent_info: {
    "brokerage_name": "<string | null>",
    "brokerage_address": "<string | null>",
    "agent_name": "<string | null>",
    "agent_phone": "<string | null>",
    "agent_fax": "<string | null>"
  },
  footer_form_info: {
    "form_code_in_footer": "<string | null>",
    "form_version_in_footer": "<string | null>"
  },
  extractionWarnings: [
    "<string>"
  ],
};

export const bhiaStandardV0624: FormDefinition = {
  formCode: 'BHIA',
  formName: 'BUYER HOMEOWNERS\' INSURANCE ADVISORY',
  variant: 'standard',
  version: 'v06-24',

  systemPrompt: `You are an expert California real estate transaction coordinator.
You are an AI assistant tasked with extracting information from a California Association of REALTORS® BUYER HOMEOWNERS' INSURANCE ADVISORY form. Focus on accurately capturing the details as per the provided JSON template.

${FORM_FOOTER_INSTRUCTION}

CRITICAL GUIDELINES:
1. Extract 'form_code' and 'form_version' from the advisory title section, typically found in parentheses next to the form name.
2. The 'acknowledges_advisory' field should be set to true if any buyer signature is present; otherwise, it should be false. This indicates acknowledgment of the entire advisory.
3. The 'buyer_signatures' field is an array of objects. Each object in the array represents a buyer's signature, containing their 'buyer_name' and the 'date' they signed. Include an object for each buyer signature line that is filled.
4. For 'transaction_agent_info', extract 'brokerage_name', 'brokerage_address', 'agent_name', 'agent_phone', and 'agent_fax' from the agent-specific contact details provided in the footer section.
5. Extract 'form_code_in_footer' and 'form_version_in_footer' from the footer line, typically formatted as 'BHIA 6/24 (PAGE 1 OF 1)'.

EXPECTED OUTPUT FORMAT:
Return ONLY valid JSON matching this template exactly. No markdown, no explanation.

${JSON.stringify(BHIA_TEMPLATE, null, 2)}`,

  userPrompt: 'Extract all fields from this BUYER HOMEOWNERS\' INSURANCE ADVISORY and return valid JSON matching the template. Output ONLY valid JSON.',
};
