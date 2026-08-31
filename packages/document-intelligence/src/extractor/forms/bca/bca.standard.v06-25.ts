import { FORM_FOOTER_FIELDS, FORM_FOOTER_INSTRUCTION } from '../form-definition';
import type { FormDefinition } from '../form-definition';

const BCA_TEMPLATE = {
  header: {
    ...FORM_FOOTER_FIELDS,

  },
  topics_discussed: {
    "seller_broker_compensation_overview": "<boolean — note: Indicates if Section 1, 'When Sellers List Their Property...' is discussed>",
    "listing_agreement_compensation_negotiable": "<boolean — note: Indicates if Section 1A is discussed>",
    "optional_additional_compensation_unrepresented_buyer": "<boolean — note: Indicates if Section 1B is discussed>",
    "broker_represents_both_buyer_seller_dual_agency": "<boolean — note: Indicates if Section 1C is discussed>",
    "broker_agreements_with_buyers_overview": "<boolean — note: Indicates if Section 2, 'Broker Agreements With Buyers' is discussed>",
    "buyer_representation_compensation_negotiable": "<boolean — note: Indicates if Section 2A is discussed>",
    "requirement_for_written_buyer_agreements": "<boolean — note: Indicates if Section 2B is discussed>",
    "advantages_of_written_buyer_agreements": "<boolean — note: Indicates if Section 2C is discussed>",
    "buyer_broker_compensation_overview": "<boolean — note: Indicates if Section 3, 'When Enlisting a Real Estate Broker to Represent Them...' is discussed>",
    "buyer_pays_compensation_pursuant_to_agreement": "<boolean — note: Indicates if Section 3A is discussed>",
    "seller_pays_compensation_via_negotiation": "<boolean — note: Indicates if Section 3B is discussed>",
    "buyer_negotiates_seller_to_compensate_buyer_broker": "<boolean — note: Indicates if Section 3B(1) is discussed>",
    "buyer_agent_negotiates_agreement_directly_with_seller": "<boolean — note: Indicates if Section 3B(2) is discussed>",
    "changing_practice_seller_broker_offer_compensation": "<boolean — note: Indicates if Section 3C is discussed>"
  },
  signatures: [
    {
      "seller_buyer_name": "<string | null>",
      "date": "<date: YYYY-MM-DD | null>"
    },
    {
      "seller_buyer_name": "<string | null>",
      "date": "<date: YYYY-MM-DD | null>"
    }
  ],
  extractionWarnings: [
    "<string>"
  ],
};

export const bcaStandardV0625: FormDefinition = {
  formCode: 'BCA',
  formName: 'BROKER COMPENSATION ADVISORY',
  variant: 'standard',
  version: 'v06-25',

  systemPrompt: `You are an expert California real estate transaction coordinator.
This template is designed to extract key information from the California Association of REALTORS® Broker Compensation Advisory (BCA) form. It focuses on identifying the advisory's version, the topics it covers, and the signatory parties.

${FORM_FOOTER_INSTRUCTION}

CRITICAL GUIDELINES:
1. The 'form_code' should be 'BCA' and 'form_version' should capture the revision date, e.g., 'Revised 6/25', from the header or footer.
2. Each boolean field within 'topics_discussed' should be set to true if the corresponding topic is present and discussed in the advisory text, and false otherwise. For this specific form (BCA Revised 6/25), all specified topics should be present.
3. For each signature block, extract the 'seller_buyer_name' and the 'date' signed.
4. 'extractionWarnings' should be used to note any issues or ambiguities encountered during the extraction process.

EXPECTED OUTPUT FORMAT:
Return ONLY valid JSON matching this template exactly. No markdown, no explanation.

${JSON.stringify(BCA_TEMPLATE, null, 2)}`,

  userPrompt: 'Extract all fields from this BROKER COMPENSATION ADVISORY and return valid JSON matching the template. Output ONLY valid JSON.',
};
