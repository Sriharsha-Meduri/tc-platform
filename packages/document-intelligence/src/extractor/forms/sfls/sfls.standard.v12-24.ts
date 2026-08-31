import { FORM_FOOTER_FIELDS, FORM_FOOTER_INSTRUCTION } from '../form-definition';
import type { FormDefinition } from '../form-definition';

const SFLS_TEMPLATE = {
  header: {
    ...FORM_FOOTER_FIELDS,
    property_address: "<string | null>",
  },
  measurements_disclosure_table: {
    "measurement_sources": [
      {
        "source_of_information": "<string | null>",
        "sq_footage": "<number | null>",
        "lot_size": "<number | null>",
        "additional_information": "<string | null>",
        "report_attached": "<boolean>"
      }
    ],
    "measurement_comes_from_the_following_source_note": "<string | null>"
  },
  seller_acknowledgment: {
    "seller_not_aware_of_other_measurements": "<boolean>",
    "seller_read_understood_received_copy": "<boolean>",
    "seller_signatures": [
      {
        "seller_name": "<string | null>",
        "date": "<date: YYYY-MM-DD | null>"
      }
    ]
  },
  buyer_acknowledgment: {
    "buyer_read_understood_received_copy": "<boolean>",
    "buyer_signatures": [
      {
        "buyer_name": "<string | null>",
        "date": "<date: YYYY-MM-DD | null>"
      }
    ]
  },
  extractionWarnings: [
    "<string>"
  ],
};

export const sflsStandardV1224: FormDefinition = {
  formCode: 'SFLS',
  formName: 'SQUARE FOOTAGE AND LOT SIZE ADVISORY AND DISCLOSURE',
  variant: 'standard',
  version: 'v12-24',

  systemPrompt: `You are an expert California real estate transaction coordinator.
This template extracts information from the California Association of REALTORS® Square Footage and Lot Size Advisory and Disclosure form. It focuses on the property address, disclosed measurements and their sources, and the explicit acknowledgments and signatures of the parties involved.

${FORM_FOOTER_INSTRUCTION}

CRITICAL GUIDELINES:
1. For the 'header' section, extract 'form_code' and 'form_version' from the header/footer of the document, and 'property_address' from the top of the form.
2. In the 'measurements_disclosure_table' section, populate the 'measurement_sources' array based on the table provided in point 4. Each object in the array should correspond to a row in the table. Populate 'sq_footage', 'lot_size', and 'additional_information' if values are present. For 'report_attached', set to true if the 'if checked, report attached' checkbox is marked, otherwise false. Ensure 'source_of_information' matches the exact labels in the table (e.g., 'Public Record', 'Appraisal #1', 'Other').
3. Extract the text from the field 'Measurement comes from the following source:' into 'measurement_comes_from_the_following_source_note'.
4. For the 'seller_acknowledgment' section, 'seller_not_aware_of_other_measurements' and 'seller_read_understood_received_copy' should be set to true if the seller's signature is present, indicating their agreement to the statements preceding their signatures. If no signature is present, these should be false.
5. For the 'buyer_acknowledgment' section, 'buyer_read_understood_received_copy' should be set to true if the buyer's signature is present, indicating their agreement to the statement preceding their signature. If no signature is present, this should be false.
6. In the 'seller_signatures' and 'buyer_signatures' arrays, extract the name of the signatory and the date they signed. If multiple lines are present for signatures, include an object for each line that is filled out. If a line is blank, do not include an object for it. If a signature is present but the date is not, the 'date' field should be null.

EXPECTED OUTPUT FORMAT:
Return ONLY valid JSON matching this template exactly. No markdown, no explanation.

${JSON.stringify(SFLS_TEMPLATE, null, 2)}`,

  userPrompt: 'Extract all fields from this SQUARE FOOTAGE AND LOT SIZE ADVISORY AND DISCLOSURE and return valid JSON matching the template. Output ONLY valid JSON.',
};
