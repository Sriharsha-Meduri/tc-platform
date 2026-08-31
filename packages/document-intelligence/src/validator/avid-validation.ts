/**
 * AVID Validation Logic
 *
 * Processes the LLM validation output (AvidValidationOutput) and produces
 * blockers and warnings for the compliance system.
 *
 * This module is called by disclosures.stage.ts after the LLM has validated
 * the AVID form against the schema defined in avid.validation.v12-22.ts.
 */

import type { RuleIssue, RuleResult, ComplianceCheck, ValidationUploadSource } from '../validator/validator.types';
import type { AvidValidationOutput, AreaObservation, RoomObservation } from '../extractor/forms/avid/avid.validation.v12-22';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function issue(code: string, fields?: string[], location?: string): RuleIssue {
  return { code, fields, location };
}

function pass(id: string, cat: ComplianceCheck['category'], form: string, label: string, detail?: string): ComplianceCheck {
  return { ruleId: id, category: cat, formCode: form, phase: 'disclosure', severity: 'info', status: 'pass', label, detail };
}

function warn(id: string, cat: ComplianceCheck['category'], form: string, label: string, detail?: string): ComplianceCheck {
  return { ruleId: id, category: cat, formCode: form, phase: 'disclosure', severity: 'warning', status: 'warning', label, detail };
}

// ─── Form-level validation ────────────────────────────────────────────────────

function validateFormIdentity(data: AvidValidationOutput): RuleResult {
  const issues: RuleIssue[] = [];
  const checks: ComplianceCheck[] = [];
  const fv = data.form_validation;

  if (!fv.is_avid) {
    issues.push(issue('BLOCKER_AVID_WRONG_FORM', ['form_validation.is_avid'], 'Document identity'));
    return { issues, checks };
  }

  checks.push(pass('avid_form_identified', 'forms_disclosures', 'AVID', 'Document identified as AVID'));

  if (!fv.all_required_pages_present) {
    issues.push(issue('BLOCKER_AVID_PAGE_MISSING', ['form_validation.missing_pages'], `Missing pages: ${fv.missing_pages.join(', ')}`));
  } else {
    checks.push(pass('avid_all_pages_present', 'forms_disclosures', 'AVID', 'All 3 AVID pages present'));
  }

  if (fv.duplicate_pages.length > 0) {
    issues.push(issue('BLOCKER_AVID_PAGE_DUPLICATE', ['form_validation.duplicate_pages'], `Duplicate pages: ${fv.duplicate_pages.join(', ')}`));
  }

  if (fv.mixed_form_revisions) {
    issues.push(issue('BLOCKER_AVID_MIXED_REVISION', ['form_validation.mixed_form_revisions'], 'Different AVID revisions detected across pages'));
  }

  if (!fv.page_order_valid) {
    issues.push(issue('WARN_AVID_MANUAL_REVIEW', ['form_validation.page_order_valid'], 'AVID pages are not in expected order'));
  }

  return { issues, checks };
}

// ─── Page 1 validation ────────────────────────────────────────────────────────

function validatePage1(data: AvidValidationOutput, uploadSource?: ValidationUploadSource): RuleResult {
  const issues: RuleIssue[] = [];
  const checks: ComplianceCheck[] = [];
  const p1 = data.page_1;

  if (!p1.page_present) {
    issues.push(issue('BLOCKER_AVID_PAGE_MISSING', ['page_1.page_present'], 'Page 1 missing'));
    return { issues, checks };
  }

  // Property identification
  const pi = p1.property_identification;
  if (!pi.property_address_present) {
    issues.push(issue('BLOCKER_AVID_PROPERTY_MISSING', ['page_1.property_identification.property_address'], 'Page 1 — Property address'));
  } else {
    checks.push(pass('avid_p1_property_address', 'property', 'AVID', 'Property address present on page 1'));
  }

  if (!pi.city_present) {
    issues.push(issue('BLOCKER_AVID_PROPERTY_MISSING', ['page_1.property_identification.city'], 'Page 1 — City'));
  }

  if (!pi.county_present) {
    issues.push(issue('BLOCKER_AVID_PROPERTY_MISSING', ['page_1.property_identification.county'], 'Page 1 — County'));
  }

  if (pi.completion_status === 'mismatch') {
    issues.push(issue('BLOCKER_AVID_PROPERTY_MISMATCH', ['page_1.property_identification.matches_transaction_address'], 'Page 1 — Property address does not match transaction'));
  }

  // Multi-unit
  const mu = p1.multi_unit_information;
  if (mu.duplex_triplex_fourplex_checked && mu.only_units_checked && !mu.unit_selection_valid) {
    issues.push(issue('BLOCKER_AVID_UNIT_NUMBER_MISSING', ['page_1.multi_unit_information.only_units_text'], 'Page 1 — "Only unit(s)" checked but no unit identifier entered'));
  }

  // Broker firm
  const broker = p1.inspecting_broker_firm;
  if (!broker.firm_name_present) {
    issues.push(issue('BLOCKER_AVID_BROKER_FIRM_MISSING', ['page_1.inspecting_broker_firm.firm_name'], 'Page 1 — Inspecting broker firm name'));
  } else {
    checks.push(pass('avid_p1_broker_firm', 'parties', 'AVID', 'Inspecting broker firm present on page 1'));
  }

  // Buyer initials — never required for a Seller Agent upload (AVID's only
  // seller-side execution requirement is the inspecting agent's own
  // signature on page 3, validated in validatePage3 unconditionally).
  if (uploadSource !== 'seller_agent') {
    const bi = p1.buyer_initials;
    if (bi.required_initials_count !== null && bi.missing_required_initials_count !== null && bi.missing_required_initials_count > 0) {
      issues.push(issue('BLOCKER_AVID_P1_BUYER_INITIALS_MISSING', ['page_1.buyer_initials'], `Page 1 — ${bi.missing_required_initials_count} required buyer initial(s) missing`));
    } else if (bi.completion_status === 'complete') {
      checks.push(pass('avid_p1_buyer_initials', 'signatures', 'AVID', 'Buyer initials present on page 1'));
    }
  }

  return { issues, checks };
}

// ─── Page 2 validation ────────────────────────────────────────────────────────

const REQUIRED_P2_AREAS: Array<{ key: string; label: string; path: string }> = [
  { key: 'entry', label: 'Entry', path: 'page_2.area_observations.entry' },
  { key: 'living_room', label: 'Living Room', path: 'page_2.area_observations.living_room' },
  { key: 'kitchen', label: 'Kitchen', path: 'page_2.area_observations.kitchen' },
];

function validatePage2(data: AvidValidationOutput, uploadSource?: ValidationUploadSource): RuleResult {
  const issues: RuleIssue[] = [];
  const checks: ComplianceCheck[] = [];
  const p2 = data.page_2;

  if (!p2.page_present) {
    issues.push(issue('BLOCKER_AVID_PAGE_MISSING', ['page_2.page_present'], 'Page 2 missing'));
    return { issues, checks };
  }

  // Multi-unit consistency
  const mu = p2.multi_unit_number;
  const p1mu = data.page_1.multi_unit_information;
  if (p1mu.duplex_triplex_fourplex_checked && p1mu.only_units_checked && mu.unit_number_required && !mu.unit_number) {
    issues.push(issue('BLOCKER_AVID_UNIT_NUMBER_MISSING', ['page_2.multi_unit_number.unit_number'], 'Page 2 — Unit number required but missing'));
  }

  // Area observations — check required areas
  const obs = p2.area_observations;
  for (const area of REQUIRED_P2_AREAS) {
    const areaData = obs[area.key as keyof typeof obs] as AreaObservation | undefined;
    if (areaData && areaData.applicable !== false && !areaData.description_present) {
      issues.push(issue('BLOCKER_AVID_AREA_OBSERVATION_MISSING', [area.path], `Page 2 — ${area.label} observation missing`));
    }
  }

  // Check bedroom/bath areas that are applicable
  const bedroomKeys = ['bedroom_1', 'bedroom_2', 'bedroom_3', 'bedroom_4'] as const;
  for (const key of bedroomKeys) {
    const room = obs[key] as RoomObservation;
    if (room.applicable === true && !room.description_present) {
      issues.push(issue('BLOCKER_AVID_AREA_OBSERVATION_MISSING', [`page_2.area_observations.${key}`], `Page 2 — ${key.replace('_', ' ')} observation missing`));
    }
  }

  const bathKeys = ['bath_1', 'bath_2', 'bath_3', 'bath_4'] as const;
  for (const key of bathKeys) {
    const room = obs[key] as RoomObservation;
    if (room.applicable === true && !room.description_present) {
      issues.push(issue('BLOCKER_AVID_AREA_OBSERVATION_MISSING', [`page_2.area_observations.${key}`], `Page 2 — ${key.replace('_', ' ')} observation missing`));
    }
  }

  // Warnings for unknown applicable areas
  if (obs.missing_applicable_areas.length > 0) {
    issues.push(issue('WARN_AVID_APPLICABLE_AREA_UNKNOWN', ['page_2.area_observations.missing_applicable_areas'], `Page 2 — Areas may need observations: ${obs.missing_applicable_areas.join(', ')}`));
  }

  if (obs.repeated_generic_language_detected) {
    issues.push(issue('WARN_AVID_GENERIC_OBSERVATIONS', ['page_2.area_observations.repeated_generic_language_detected'], 'Page 2 — Repeated generic language detected across observation areas'));
  }

  // Buyer initials — see validatePage1 for why this is skipped for a Seller
  // Agent upload.
  if (uploadSource !== 'seller_agent') {
    const bi = p2.buyer_initials;
    if (bi.required_initials_count !== null && bi.missing_required_initials_count !== null && bi.missing_required_initials_count > 0) {
      issues.push(issue('BLOCKER_AVID_P2_BUYER_INITIALS_MISSING', ['page_2.buyer_initials'], `Page 2 — ${bi.missing_required_initials_count} required buyer initial(s) missing`));
    } else if (bi.completion_status === 'complete') {
      checks.push(pass('avid_p2_buyer_initials', 'signatures', 'AVID', 'Buyer initials present on page 2'));
    }
  }

  // Quality messages
  for (const msg of obs.quality_review_messages) {
    issues.push(issue('WARN_AVID_MANUAL_REVIEW', ['page_2.area_observations.quality_review_messages'], `Page 2 — ${msg}`));
  }

  return { issues, checks };
}

// ─── Page 3 validation ────────────────────────────────────────────────────────

function validatePage3(data: AvidValidationOutput, uploadSource?: ValidationUploadSource): RuleResult {
  const issues: RuleIssue[] = [];
  const checks: ComplianceCheck[] = [];
  const p3 = data.page_3;

  if (!p3.page_present) {
    issues.push(issue('BLOCKER_AVID_PAGE_MISSING', ['page_3.page_present'], 'Page 3 missing'));
    return { issues, checks };
  }

  // Multi-unit consistency
  const mu = p3.multi_unit_number;
  const p1mu = data.page_1.multi_unit_information;
  if (p1mu.duplex_triplex_fourplex_checked && p1mu.only_units_checked && mu.unit_number_required && !mu.unit_number) {
    issues.push(issue('BLOCKER_AVID_UNIT_NUMBER_MISSING', ['page_3.multi_unit_number.unit_number'], 'Page 3 — Unit number required but missing'));
  }

  // Additional observations
  const addl = p3.additional_observations;
  if (addl.see_addendum_checked && !addl.referenced_addendum_present) {
    issues.push(issue('BLOCKER_AVID_ADDENDUM_MISSING', ['page_3.additional_observations.referenced_addendum_present'], 'Page 3 — "See Addendum" checked but addendum not present'));
  }

  // Garage/parking
  const garage = addl.garage_parking;
  if (data.transaction_context.has_garage_or_parking && garage.applicable !== false && !garage.description_present) {
    issues.push(issue('BLOCKER_AVID_AREA_OBSERVATION_MISSING', ['page_3.additional_observations.garage_parking'], 'Page 3 — Garage/Parking observation missing'));
  }

  // Exterior
  if (!addl.exterior_building_and_yard.description_present) {
    issues.push(issue('BLOCKER_AVID_AREA_OBSERVATION_MISSING', ['page_3.additional_observations.exterior_building_and_yard'], 'Page 3 — Exterior Building and Yard observation missing'));
  }

  // Inspection certification
  const cert = p3.inspection_certification;
  if (!cert.broker_firm_present) {
    issues.push(issue('BLOCKER_AVID_BROKER_FIRM_MISSING', ['page_3.inspection_certification.broker_firm_name'], 'Page 3 — Inspecting broker firm name'));
  }
  if (!cert.inspector_name_present) {
    issues.push(issue('BLOCKER_AVID_INSPECTOR_NAME_MISSING', ['page_3.inspection_certification.inspector_name'], 'Page 3 — Inspector name'));
  }
  if (!cert.inspection_date_present) {
    issues.push(issue('BLOCKER_AVID_INSPECTION_DATE_MISSING', ['page_3.inspection_certification.inspection_date'], 'Page 3 — Inspection date'));
  }
  if (!cert.inspection_time_present) {
    issues.push(issue('BLOCKER_AVID_INSPECTION_TIME_MISSING', ['page_3.inspection_certification.inspection_time'], 'Page 3 — Inspection time'));
  }
  if (!cert.weather_conditions_present) {
    issues.push(issue('BLOCKER_AVID_WEATHER_MISSING', ['page_3.inspection_certification.weather_conditions'], 'Page 3 — Weather conditions'));
  }
  if (!cert.agent_signature_present) {
    issues.push(issue('BLOCKER_AVID_AGENT_SIGNATURE_MISSING', ['page_3.inspection_certification.agent_signature_present'], 'Page 3 — Agent signature on inspection certification'));
  }
  if (!cert.agent_signature_date_present) {
    issues.push(issue('BLOCKER_AVID_AGENT_SIGNATURE_DATE_MISSING', ['page_3.inspection_certification.agent_signature_date'], 'Page 3 — Agent signature date'));
  }

  if (cert.certification_complete) {
    checks.push(pass('avid_p3_certification', 'signatures', 'AVID', 'Inspection certification complete'));
  }

  // Buyer acknowledgements — see validatePage1 for why this is skipped for a
  // Seller Agent upload.
  if (uploadSource !== 'seller_agent') {
    const ack = p3.buyer_acknowledgements;
    if (ack.required_signature_count !== null) {
      if (ack.missing_required_signatures_count !== null && ack.missing_required_signatures_count > 0) {
        issues.push(issue('BLOCKER_AVID_BUYER_SIGNATURE_MISSING', ['page_3.buyer_acknowledgements'], `Page 3 — ${ack.missing_required_signatures_count} required buyer signature(s) missing`));
      }
      if (ack.missing_required_dates_count !== null && ack.missing_required_dates_count > 0) {
        issues.push(issue('BLOCKER_AVID_BUYER_SIGNATURE_DATE_MISSING', ['page_3.buyer_acknowledgements'], `Page 3 — ${ack.missing_required_dates_count} required buyer signature date(s) missing`));
      }
    }

    if (ack.completion_status === 'complete') {
      checks.push(pass('avid_p3_buyer_ack', 'signatures', 'AVID', 'Buyer acknowledgements complete'));
    }
  }

  return { issues, checks };
}

// ─── Cross-page validation ────────────────────────────────────────────────────

function validateCrossPage(data: AvidValidationOutput, uploadSource?: ValidationUploadSource): RuleResult {
  const issues: RuleIssue[] = [];
  const checks: ComplianceCheck[] = [];
  const cp = data.cross_page_validation;

  if (cp.broker_firm_consistent === false) {
    issues.push(issue('BLOCKER_AVID_BROKER_FIRM_MISMATCH', ['cross_page_validation.broker_firm_consistent'], 'Cross-page — Broker firm mismatch between page 1 and page 3'));
  }

  if (cp.unit_information_consistent === false) {
    issues.push(issue('BLOCKER_AVID_UNIT_NUMBER_MISMATCH', ['cross_page_validation.unit_information_consistent'], 'Cross-page — Unit information mismatch'));
  }

  if (cp.agent_signature_date_on_or_after_inspection_date === false) {
    issues.push(issue('BLOCKER_AVID_DATE_CHRONOLOGY_INVALID', ['cross_page_validation.agent_signature_date_on_or_after_inspection_date'], 'Cross-page — Agent signature date precedes inspection date'));
  }

  if (uploadSource !== 'seller_agent' && cp.buyer_acknowledgement_dates_on_or_after_inspection_date === false) {
    issues.push(issue('BLOCKER_AVID_DATE_CHRONOLOGY_INVALID', ['cross_page_validation.buyer_acknowledgement_dates_on_or_after_inspection_date'], 'Cross-page — Buyer acknowledgement date precedes inspection date'));
  }

  if (cp.property_address_consistent_with_transaction === false) {
    issues.push(issue('BLOCKER_AVID_PROPERTY_MISMATCH', ['cross_page_validation.property_address_consistent_with_transaction'], 'Cross-page — Property address does not match transaction'));
  }

  // Inconsistency messages
  for (const msg of cp.inconsistency_messages) {
    issues.push(issue('WARN_AVID_MANUAL_REVIEW', ['cross_page_validation.inconsistency_messages'], `Cross-page — ${msg}`));
  }

  if (cp.cross_page_status === 'consistent') {
    checks.push(pass('avid_cross_page', 'forms_disclosures', 'AVID', 'Cross-page validation consistent'));
  }

  return { issues, checks };
}

// ─── Main validation function ─────────────────────────────────────────────────

/**
 * Validate AVID extraction data against the comprehensive validation schema.
 *
 * This function processes the LLM output (matching AvidValidationOutput)
 * and produces blockers and warnings for the compliance system.
 *
 * @param data - The LLM validation output (must match AvidValidationOutput schema)
 * @returns RuleResult with issues (blockers/warnings) and compliance checks
 */
export function validateAvidWithSchema(data: Record<string, unknown>, uploadSource?: ValidationUploadSource): RuleResult {
  const avid = data as unknown as AvidValidationOutput;

  // Quick sanity check
  if (!avid || avid.form_type !== 'AVID') {
    return {
      issues: [issue('BLOCKER_AVID_WRONG_FORM', ['form_type'], 'Document is not an AVID')],
      checks: [],
    };
  }

  const results: RuleResult[] = [];

  results.push(validateFormIdentity(avid));
  results.push(validatePage1(avid, uploadSource));
  results.push(validatePage2(avid, uploadSource));
  results.push(validatePage3(avid, uploadSource));
  results.push(validateCrossPage(avid, uploadSource));

  // Merge all results
  const issues: RuleIssue[] = [];
  const checks: ComplianceCheck[] = [];
  for (const r of results) {
    issues.push(...r.issues);
    checks.push(...r.checks);
  }

  return { issues, checks };
}
