import { FORM_FOOTER_FIELDS, FORM_FOOTER_INSTRUCTION } from '../form-definition';
import type { FormDefinition } from '../form-definition';

const SA_TEMPLATE = {
  header: {
    ...FORM_FOOTER_FIELDS,
    broker_firm_name: "<string | null>",
    broker_firm_address: "<string | null>",
    broker_firm_phone: "<string | null>",
    broker_firm_fax: "<string | null>",
    agent_name: "<string | null>",
    agent_phone: "<string | null>",
    transaction_id: "<string | null>",
    produced_by_system: "<string | null>",
    system_vendor: "<string | null>",
    system_vendor_address: "<string | null>",
    system_vendor_website: "<string | null>",
  },
  advisory_topics: {
    "introduction_present": "<boolean>",
    "disclosures_present": "<boolean>",
    "general_disclosure_duties_present": "<boolean>",
    "statutory_duties_present": "<boolean>",
    "death_and_other_disclosures_present": "<boolean>",
    "condominiums_and_other_common_interest_subdivisions_present": "<boolean>",
    "contract_terms_and_legal_requirements_present": "<boolean>",
    "contract_terms_and_conditions_present": "<boolean>",
    "withholding_taxes_present": "<boolean>",
    "prohibition_against_discrimination_present": "<boolean>",
    "government_required_repairs_replacements_and_alterations_present": "<boolean>",
    "epa_lead_based_paint_renovation_repair_and_painting_rule_program_rrp_present": "<boolean>",
    "legal_tax_and_other_implications_present": "<boolean>",
    "marketing_considerations_present": "<boolean>",
    "pre_sale_inspections_and_considerations_present": "<boolean>",
    "post_sale_protections_present": "<boolean>",
    "safety_precautions_present": "<boolean>",
    "expenses_present": "<boolean>",
    "other_items_present": "<boolean>"
  },
  signatures: [
    {
      "signer_role": "<string | null>",
      "signature_date": "<date: YYYY-MM-DD | null>"
    },
    {
      "signer_role": "<string | null>",
      "signature_date": "<date: YYYY-MM-DD | null>"
    }
  ],
  extraction_warnings: [
    "<string>"
  ],
  extractionWarnings: [
    "<string>"
  ],
};

export const saStandardV0625: FormDefinition = {
  formCode: 'SA',
  formName: 'SELLER\'S ADVISORY',
  variant: 'standard',
  version: 'v06-25',

  systemPrompt: `You are an expert California real estate transaction coordinator.
This template is designed to extract information from the CAR SELLER'S ADVISORY (SA) form. It focuses on identifying the presence of various advisory topics and signature details, without extracting the advisory text itself.

${FORM_FOOTER_INSTRUCTION}

CRITICAL GUIDELINES:
1. For header fields, extract the text content if available. If a field is not present or empty, use '<string | null>'.
2. For advisory_topics, mark the boolean as 'true' if the corresponding section or subsection is present in the document. Otherwise, use '<boolean>'.
3. For signatures, extract the 'signature_date' in 'YYYY-MM-DD' format if present. If the date is missing, use '<date: YYYY-MM-DD | null>'. The 'signer_role' is always 'Seller' for this form.
4. If any data seems inconsistent or missing from the document but expected by the template, add a descriptive warning to the 'extraction_warnings' array.

EXPECTED OUTPUT FORMAT:
Return ONLY valid JSON matching this template exactly. No markdown, no explanation.

${JSON.stringify(SA_TEMPLATE, null, 2)}`,

  userPrompt: 'Extract all fields from this SELLER\'S ADVISORY and return valid JSON matching the template. Output ONLY valid JSON.',
};
