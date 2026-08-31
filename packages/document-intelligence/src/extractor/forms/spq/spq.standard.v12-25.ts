import { FORM_FOOTER_FIELDS, FORM_FOOTER_INSTRUCTION } from '../form-definition';
import type { FormDefinition } from '../form-definition';

const SPQ_TEMPLATE = {
  header: {
    ...FORM_FOOTER_FIELDS,
    property_address: "<string | null>",
    assessor_parcel_no: "<string | null>",
    county: "<string | null>",
    spq_for_only_unit_checked: "<boolean>",
    spq_only_unit_number: "<string | null>",
  },
  seller_awareness_general_note: "<string | null>",
  section_5_documents: {
    "aware_of_documents_prepared_before_ownership": "<boolean>",
    "aware_of_documents_prepared_during_ownership": "<boolean>",
    "aware_of_documents_provided_by_others_during_ownership": "<boolean>",
    "explanation_5": "<string | null>"
  },
  section_6_statutorily_or_contractually_required_or_related: {
    "death_of_occupant_within_3_years": "<boolean>",
    "government_order_meth_contamination": "<boolean>",
    "release_of_illegal_controlled_substance": "<boolean>",
    "property_in_or_adjacent_to_industrial_use_zone": "<boolean>",
    "property_affected_by_industrial_use_nuisance": "<boolean>",
    "property_within_1_mile_of_ordnance_location": "<boolean>",
    "property_is_condominium_or_in_cid": "<boolean>",
    "insurance_claims_affecting_property_past_5_years": "<boolean>",
    "matters_affecting_title": "<boolean>",
    "plumbing_fixtures_non_compliant": "<boolean>",
    "inspection_reports_on_elevated_elements": "<boolean>",
    "material_facts_or_defects_not_otherwise_disclosed": "<boolean>",
    "explanation_6": "<string | null>"
  },
  section_7_repairs_and_alterations: {
    "alterations_modifications_replacements_improvements_remodeling_or_material_repairs": "<boolean>",
    "alterations_for_energy_water_efficiency_or_renewable_energy": "<boolean>",
    "ongoing_or_recurring_maintenance": "<boolean>",
    "property_painted_within_past_12_months": "<boolean>",
    "property_built_before_1978": "<boolean>",
    "renovations_of_lead_based_paint_surfaces_started_or_completed": "<boolean>",
    "renovations_done_in_compliance_with_epa_lead_based_paint_rule": "<boolean>",
    "acquired_property_within_18_months_of_offer": "<boolean>",
    "room_additions_structural_modifications_or_other_alterations_or_repairs_by_contractor": "<boolean>",
    "explanation_7": "<string | null>"
  },
  section_8_structural_systems_and_appliances: {
    "defects_in_heating_ac_electrical_plumbing_etc": "<boolean>",
    "existence_of_solar_power_system": "<boolean>",
    "existence_of_septic_system_well_or_propane_tank": "<boolean>",
    "leasing_of_water_softener_purifier_or_alarm_system": "<boolean>",
    "structure_other_than_main_improvement_used_as_dwelling": "<boolean>",
    "separate_utilities_and_meters_for_dwelling": "<boolean>",
    "dwelling_received_permit_or_government_approval_as_adu": "<boolean>",
    "explanation_8": "<string | null>"
  },
  section_9_disaster_relief_insurance_or_civil_settlement: {
    "financial_relief_or_assistance_from_damage_or_defect": "<boolean>",
    "federal_flood_disaster_assistance_conditioned_on_flood_insurance": "<boolean>",
    "received_domestic_water_storage_tank_assistance": "<boolean>",
    "explanation_9": "<string | null>"
  },
  section_10_water_related_and_mold_issues: {
    "water_intrusion_leaks_standing_water_drainage_flooding_etc": "<boolean>",
    "problem_with_or_infestation_of_mold_mildew_fungus_or_spores": "<boolean>",
    "rivers_streams_flood_channels_underground_springs_high_watertable_etc": "<boolean>",
    "explanation_10": "<string | null>"
  },
  section_11_pets_animals_and_pests: {
    "past_or_present_pets": "<boolean>",
    "past_or_present_problems_with_livestock_wildlife_insects_or_pests": "<boolean>",
    "past_or_present_odors_urine_feces_discoloration_stains_spots_or_damage": "<boolean>",
    "past_or_present_treatment_or_eradication_of_pests_or_odors_or_repair_of_damage": "<boolean>",
    "when_and_by_whom_for_treatment_or_eradication": "<string | null>",
    "explanation_11": "<string | null>"
  },
  section_12_boundaries_access_and_property_use_by_others: {
    "surveys_easements_encroachments_or_boundary_disputes": "<boolean>",
    "use_or_access_to_property_by_anyone_other_than_seller": "<boolean>",
    "use_of_neighboring_property_by_seller": "<boolean>",
    "explanation_12": "<string | null>"
  },
  section_13_landscaping_pool_and_spa: {
    "diseases_or_infestations_affecting_trees_plants_or_vegetation": "<boolean>",
    "operational_sprinklers": "<boolean>",
    "sprinklers_automatic_or_manually_operated": "<'automatic' | 'manually operated' | null>",
    "areas_with_trees_plants_or_vegetation_not_covered_by_sprinkler_system": "<boolean>",
    "pool_heater": "<boolean>",
    "pool_heater_operational": "<boolean>",
    "spa_heater": "<boolean>",
    "spa_heater_operational": "<boolean>",
    "past_or_present_defects_leaks_cracks_repairs_or_other_problems_with_sprinklers_pool_spa_etc": "<boolean>",
    "explanation_13": "<string | null>"
  },
  section_14_condominiums_common_interest_developments_and_other_subdivisions: {
    "property_is_condominium_planned_unit_development_or_common_interest_subdivision": "<boolean>",
    "homeowners_association_with_authority_over_property": "<boolean>",
    "common_area_facilities_co_owned": "<boolean>",
    "ccrs_or_other_deed_restrictions_or_obligations": "<boolean>",
    "pending_or_proposed_dues_increases_special_assessments_etc": "<boolean>",
    "ccrs_or_hoa_committee_authority_over_improvements_on_or_to_property": "<boolean>",
    "improvements_made_on_or_to_property_inconsistent_with_declaration_or_hoa_requirement": "<boolean>",
    "improvements_made_on_or_to_property_without_required_approval_of_hoa_committee": "<boolean>",
    "explanation_14": "<string | null>"
  },
  section_15_title_ownership_liens_and_legal_claims: {
    "other_person_or_entity_with_ownership_interest": "<boolean>",
    "leases_options_or_claims_affecting_title_or_use": "<boolean>",
    "past_present_pending_or_threatened_lawsuits_settlements_mediations_arbitrations_etc": "<boolean>",
    "features_of_property_shared_in_common_with_adjoining_landowners": "<boolean>",
    "encroachments_easements_boundary_disputes_or_similar_matters": "<boolean>",
    "private_transfer_fees_triggered_by_sale": "<boolean>",
    "pace_lien_or_other_lien_securing_loan_for_alteration_modification_etc": "<boolean>",
    "cost_of_alteration_modification_etc_paid_by_assessment_on_property_tax_bill": "<boolean>",
    "explanation_15": "<string | null>"
  },
  section_16_neighbors_neighborhood: {
    "neighborhood_noise_nuisance_or_other_problems_from_sources": "<boolean>",
    "past_or_present_disputes_or_issues_with_neighbor": "<boolean>",
    "explanation_16": "<string | null>"
  },
  section_17_governmental: {
    "ongoing_or_contemplated_eminent_domain_condemnation_annexation_or_zoning_change": "<boolean>",
    "existence_or_pendency_of_rent_control_occupancy_restrictions_improvement_restrictions_or_retrofit_requirements": "<boolean>",
    "existing_or_contemplated_building_or_use_moratoria": "<boolean>",
    "state_or_local_requirements_or_restrictions_relating_to_future_replacement_of_existing_gas_powered_appliances": "<boolean>",
    "current_or_proposed_bonds_assessments_or_fees_not_on_property_tax_bill": "<boolean>",
    "proposed_construction_reconfiguration_or_closure_of_nearby_government_facilities_or_amenities": "<boolean>",
    "existing_or_proposed_government_requirements_affecting_property_regarding_vegetation_or_flammable_materials": "<boolean>",
    "protected_habitat_for_plants_trees_animals_or_insects": "<boolean>",
    "property_historically_designated_or_within_existing_or_proposed_historic_district": "<boolean>",
    "water_surcharges_or_penalties_or_restrictions_or_prohibitions_on_wells": "<boolean>",
    "differences_between_city_name_in_postal_mailing_address_and_city_with_jurisdiction": "<boolean>",
    "explanation_17": "<string | null>"
  },
  section_18_other: {
    "occupant_of_property_smoking_or_vaping_any_substance": "<boolean>",
    "residue_from_smoking_tobacco_or_nicotine_products": "<boolean>",
    "use_of_property_for_or_alterations_due_to_cannabis_cultivation_or_growth": "<boolean>",
    "property_originally_constructed_as_manufactured_or_mobile_home": "<boolean>",
    "property_is_tenant_occupied": "<boolean>",
    "property_was_previously_tenant_occupied_even_if_vacant_now": "<boolean>",
    "method_or_manner_of_tenancy_ended": "<string | null>",
    "explanation_18": "<string | null>"
  },
  section_19_material_facts: {
    "past_or_present_known_material_facts_or_other_significant_items_affecting_value_or_desirability": "<boolean>",
    "attached_addendum_contains_explanation_or_additional_comments": "<boolean>",
    "explanation_19": "<string | null>"
  },
  seller_acknowledgement_statement: "<string | null>",
  signatures: {
    "seller_signature_1": "<boolean>",
    "seller_date_1": "<date: YYYY-MM-DD | null>",
    "seller_signature_2": "<boolean>",
    "seller_date_2": "<date: YYYY-MM-DD | null>",
    "buyer_signature_1": "<boolean>",
    "buyer_date_1": "<date: YYYY-MM-DD | null>",
    "buyer_signature_2": "<boolean>",
    "buyer_date_2": "<date: YYYY-MM-DD | null>",
    "seller_initials_page1": "<boolean>",
    "buyer_initials_page1": "<boolean>",
    "seller_initials_page2": "<boolean>",
    "buyer_initials_page2": "<boolean>",
    "seller_initials_page3": "<boolean>",
    "buyer_initials_page3": "<boolean>",
    "seller_initials_page4": "<boolean>",
    "buyer_initials_page4": "<boolean>"
  },
  extractionWarnings: [
    "<string>"
  ],
};

export const spqStandardV1225: FormDefinition = {
  formCode: 'SPQ',
  formName: 'SELLER PROPERTY QUESTIONNAIRE',
  variant: 'standard',
  version: 'v12-25',
  criticality: 'critical',

  systemPrompt: `You are an expert California real estate transaction coordinator.
This is a Seller Property Questionnaire (SPQ) form, a four-page document used by the Seller to provide additional disclosures about the property's condition, history, and surrounding environment. It supplements the Real Estate Transfer Disclosure Statement (TDS) and is completed by the Seller.

${FORM_FOOTER_INSTRUCTION}

CRITICAL GUIDELINES:
1. Extract all 'Yes' or 'No' checkbox selections as booleans (true for 'Yes', false for 'No').
2. For any question that includes a blank line for an explanation, capture the text provided into the corresponding 'explanation_X' field. If no text is provided, the field should be null.
3. For section 7.F, if 'room_additions_structural_modifications_or_other_alterations_or_repairs_by_contractor' is true, look for a list of improvements, contractor names, and contact information in the explanation field, as well as permit details.
4. In section 9.A, if 'financial_relief_or_assistance_from_damage_or_defect' is true, check for the conditional question 'federal_flood_disaster_assistance_conditioned_on_flood_insurance'.
5. For section 13.B, if 'operational_sprinklers' is true, determine if they are 'automatic' or 'manually operated' and extract the specific choice.
6. For section 18.F, if 'property_was_previously_tenant_occupied_even_if_vacant_now' is true, extract details about 'method_or_manner_of_tenancy_ended' from the explanation field.
7. Ensure all Seller and Buyer initial fields on each page are captured as booleans if marked, and all signature fields with their corresponding dates are extracted.
8. Note the field 'spq_only_unit_number' is for any unit number written next to the 'only unit(s)' checkbox in the header, if checked.

EXPECTED OUTPUT FORMAT:
Return ONLY valid JSON matching this template exactly. No markdown, no explanation.

${JSON.stringify(SPQ_TEMPLATE, null, 2)}`,

  userPrompt: 'Extract all fields from this SELLER PROPERTY QUESTIONNAIRE and return valid JSON matching the template. Output ONLY valid JSON.',
};
