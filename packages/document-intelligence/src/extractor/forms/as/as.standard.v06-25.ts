import { FORM_FOOTER_FIELDS, FORM_FOOTER_INSTRUCTION } from '../form-definition';
import type { FormDefinition } from '../form-definition';

const AS_TEMPLATE = {
  header: {
    ...FORM_FOOTER_FIELDS,
    property_address: "<string | null>",
    transferor_name: "<string | null>",
  },
  exemption_claimed: {
    "is_individual_nonresident_alien_exempt": "<boolean>",
    "is_entity_not_foreign": "<boolean>"
  },
  qualified_substitute_or_direct_delivery: {
    "use_qualified_substitute_to_satisfy_firpta": "<boolean>",
    "provide_additional_information_direct_to_buyer": "<boolean>"
  },
  seller_information: {
    "tin": "<string | null>",
    "address": "<string | null>",
    "telephone_number": "<string | null>"
  },
  acknowledgements_and_signatures: {
    "transferor_signature_date": "<date: YYYY-MM-DD | null>",
    "transferor_signing_as_grantor_of_revocable_trust": "<boolean — whether the transferor is signing as grantor of a revocable/grantor trust>",
    "transferor_typed_printed_name": "<string | null>",
    "transferor_title": "<string | null>",
    "buyer_acknowledges_receipt_copy_1_date": "<date: YYYY-MM-DD | null>",
    "buyer_acknowledges_receipt_copy_2_date": "<date: YYYY-MM-DD | null>"
  },
  extractionWarnings: [
    "<string>"
  ],
};

export const asStandardV0625: FormDefinition = {
  formCode: 'AS',
  formName: 'SELLER\'S AFFIDAVIT OF NONFOREIGN STATUS (FIRPTA)',
  variant: 'standard',
  version: 'v06-25',

  systemPrompt: `You are an expert California real estate transaction coordinator.
This form, the Seller's Affidavit of Nonforeign Status (FIRPTA), is completed by the seller(s) of a property to declare their non-foreign status, which affects federal and California withholding requirements. It is a 2-page document.

${FORM_FOOTER_INSTRUCTION}

CRITICAL GUIDELINES:
1. Extract the property address and transferor's name from Section 2.
2. For Section 3, extract whether the individual (3.A) or entity (3.B) exemption is claimed as boolean values.
3. For Section 4, extract whether the transferor will use a qualified substitute (4.A) or provide additional information directly to the buyer (4.B) as boolean values.
4. Only extract the fields within Section 5 (TIN, Address, Telephone Number) if checkbox 4.B 'TRANSFEROR ADDITIONAL INFORMATION DIRECT TO BUYER' is explicitly checked. Otherwise, these fields should remain null.
5. Capture the transferor's signature date, typed/printed name, and title. Also, identify if the transferor indicates they are signing as the grantor of a revocable/grantor trust.
6. Extract the dates for each instance of the buyer acknowledging receipt of a copy of the affidavit.
7. Ignore all general information, advisory text, and federal guidelines provided on page 1 and the entirety of page 2; these sections do not contain extractable data unique to this transaction.
8. Ensure all leaf values strictly adhere to the specified typed sentinel formats.

EXPECTED OUTPUT FORMAT:
Return ONLY valid JSON matching this template exactly. No markdown, no explanation.

${JSON.stringify(AS_TEMPLATE, null, 2)}`,

  userPrompt: 'Extract all fields from this SELLER\'S AFFIDAVIT OF NONFOREIGN STATUS (FIRPTA) and return valid JSON matching the template. Output ONLY valid JSON.',
};
