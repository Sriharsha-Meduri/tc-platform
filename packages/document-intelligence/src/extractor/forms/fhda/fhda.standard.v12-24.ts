import { FORM_FOOTER_FIELDS, FORM_FOOTER_INSTRUCTION } from '../form-definition';
import type { FormDefinition } from '../form-definition';

const FHDA_TEMPLATE = {
  header: {
    ...FORM_FOOTER_FIELDS,
    header_company_name: "<string | null>",
    header_company_address: "<string | null>",
    header_agent_name: "<string | null>",
    header_agent_phone: "<string | null>",
    header_agent_fax: "<string | null>",
    header_agent_address: "<string | null>",
  },
  sections: {
    "equal_access_to_housing_for_all": "<boolean>",
    "federal_and_state_laws_prohibiting_discrimination": "<boolean>",
    "potential_legal_remedies": "<boolean>",
    "protected_classes_characteristics": "<boolean>",
    "dre_training_and_supervision_requirements": "<boolean>",
    "realtor_organizations_prohibit_discrimination": "<boolean>",
    "who_is_required_to_comply": "<boolean>",
    "examples_of_conduct_not_motivated_by_intent_but_with_discriminatory_effect": "<boolean>",
    "examples_of_unlawful_improper_conduct": "<boolean>",
    "examples_of_positive_practices": "<boolean>",
    "fair_housing_resources": "<boolean>",
    "limited_exceptions_to_fair_housing_requirements": "<boolean>"
  },
  signatures: {
    "buyer_tenant_1_date": "<date: YYYY-MM-DD | null>",
    "buyer_tenant_2_date": "<date: YYYY-MM-DD | null>",
    "seller_housing_provider_1_date": "<date: YYYY-MM-DD | null>",
    "seller_housing_provider_2_date": "<date: YYYY-MM-DD | null>"
  },
  extractionWarnings: "<string | null>",
};

export const fhdaStandardV1224: FormDefinition = {
  formCode: 'FHDA',
  formName: 'FAIR HOUSING AND DISCRIMINATION ADVISORY',
  variant: 'standard',
  version: 'v12-24',

  systemPrompt: `You are an expert California real estate transaction coordinator.
This template is designed to extract key information from the FAIR HOUSING AND DISCRIMINATION ADVISORY form, including header details, the presence of specific advisory sections, and signature dates.

${FORM_FOOTER_INSTRUCTION}

CRITICAL GUIDELINES:
1. For the 'header' fields like 'header_company_name', 'header_company_address', 'header_agent_name', 'header_agent_phone', 'header_agent_fax', and 'header_agent_address', extract the values found in the footer information for 'Blue Lotus Realty' and 'Ashok Patil'.
2. For all fields under 'sections', determine if the corresponding numbered section (e.g., '1. EQUAL ACCESS TO HOUSING FOR ALL', '2. FEDERAL AND STATE LAWS...') is present on the form and set the boolean accordingly.
3. For 'signatures' fields, extract the date associated with each buyer/tenant or seller/housing provider line. If a date is not present, use null.

EXPECTED OUTPUT FORMAT:
Return ONLY valid JSON matching this template exactly. No markdown, no explanation.

${JSON.stringify(FHDA_TEMPLATE, null, 2)}`,

  userPrompt: 'Extract all fields from this FAIR HOUSING AND DISCRIMINATION ADVISORY and return valid JSON matching the template. Output ONLY valid JSON.',
};
