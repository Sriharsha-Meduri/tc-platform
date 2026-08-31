import { FORM_FOOTER_FIELDS, FORM_FOOTER_INSTRUCTION } from '../form-definition';
import type { FormDefinition } from '../form-definition';

const WFDA_TEMPLATE = {
  header: {
    ...FORM_FOOTER_FIELDS,

  },
  advisory_content: {
    "section_1_wildfire_disasters_introduction_is_present": "<boolean>",
    "section_2_wildfire_disaster_concerns_and_issues_is_present": "<boolean>",
    "concern_A_insurance_related_issues_is_present": "<boolean>",
    "concern_B_lot_clearing_costs_debris_removal_is_present": "<boolean>",
    "concern_C_fire_hardening_is_present": "<boolean>",
    "concern_D_local_state_federal_cleanup_building_approvals_is_present": "<boolean>",
    "concern_E_air_soil_quality_environmental_personal_health_concerns_is_present": "<boolean>",
    "concern_F_timelines_costs_requirements_permits_building_utilities_is_present": "<boolean>",
    "concern_G_availability_access_electricity_gas_sewer_public_private_utilities_is_present": "<boolean>",
    "concern_H_water_delivery_potability_septic_sewer_design_construction_costs_is_present": "<boolean>",
    "concern_I_potential_redesign_streets_infrastructure_eminent_domain_is_present": "<boolean>",
    "concern_J_inconvenience_delays_road_construction_unavailability_services_is_present": "<boolean>",
    "concern_K_impact_federal_state_local_disaster_declarations_is_present": "<boolean>",
    "section_3_buyer_tenant_advisories_is_present": "<boolean>",
    "advisory_A_check_insurance_early_is_present": "<boolean>",
    "advisory_B_investigate_intended_use_is_present": "<boolean>",
    "advisory_C_wildfire_disaster_area_under_construction_inconvenience_is_present": "<boolean>",
    "advisory_D_changes_variations_local_state_federal_laws_codes_requirements_is_present": "<boolean>",
    "advisory_E_insurers_reduced_cancelled_offerings_increased_costs_is_present": "<boolean>",
    "advisory_F_unable_to_obtain_fire_insurance_breach_of_agreement_is_present": "<boolean>",
    "section_4_resources_provided_is_present": "<boolean>",
    "section_5_fire_hardening_and_defensible_space_advisory_is_present": "<boolean>",
    "fire_hardening_A_disclosure_and_compliance_is_present": "<boolean>",
    "fire_hardening_B_where_to_locate_information_is_present": "<boolean>",
    "fire_hardening_C_post_closing_issues_is_present": "<boolean>",
    "fire_hardening_D_optional_disclosure_and_reports_is_present": "<boolean>"
  },
  acknowledgement: {
    "buyer_tenant_acknowledges_receipt_and_understanding": "<boolean>",
    "buyer_tenant_signature_1": "<boolean>",
    "buyer_tenant_date_1": "<date: YYYY-MM-DD | null>",
    "buyer_tenant_signature_2": "<boolean>",
    "buyer_tenant_date_2": "<date: YYYY-MM-DD | null>"
  },
  extractionWarnings: [
    "<string>"
  ],
};

export const wfdaStandardV1225: FormDefinition = {
  formCode: 'WFDA',
  formName: 'WILDFIRE DISASTER ADVISORY',
  variant: 'standard',
  version: 'v12-25',

  systemPrompt: `You are an expert California real estate transaction coordinator.
This is the California Association of REALTORS® Wildfire Disaster Advisory form, used to inform buyers and tenants about potential concerns and issues related to wildfire disasters. It is completed by buyers and tenants to acknowledge receipt and understanding of the advisory. The form is 2 pages long.

${FORM_FOOTER_INSTRUCTION}

CRITICAL GUIDELINES:
1. Extract the form code and version from the footer on the first page.
2. For all fields within the 'advisory_content' object, mark them as '<boolean>' (true) since these advisories are standard content for this form and are always present.
3. The 'buyer_tenant_acknowledges_receipt_and_understanding' field should be marked as '<boolean>' (true) if any buyer/tenant signature is present on the form.
4. Extract the presence of a signature for 'buyer_tenant_signature_1' and 'buyer_tenant_signature_2'. If a signature is visible on the corresponding line, mark as true; otherwise, false.
5. Extract the date associated with each buyer/tenant signature. If no date is present but a signature is, leave the date field as null.
6. The form does not provide specific fields for buyer/tenant names at the signature lines, so no name fields should be extracted for signatures.
7. Ensure all boolean fields are extracted as '<boolean>' (true/false) and date fields as '<date: YYYY-MM-DD | null>'.

EXPECTED OUTPUT FORMAT:
Return ONLY valid JSON matching this template exactly. No markdown, no explanation.

${JSON.stringify(WFDA_TEMPLATE, null, 2)}`,

  userPrompt: 'Extract all fields from this WILDFIRE DISASTER ADVISORY and return valid JSON matching the template. Output ONLY valid JSON.',
};
