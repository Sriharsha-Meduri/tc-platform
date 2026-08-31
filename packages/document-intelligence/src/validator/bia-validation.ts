/**
 * BIA Validation Logic
 *
 * Processes the LLM validation output (BiaValidationOutput) and produces
 * issues and checks for the compliance system.
 *
 * This module is called by disclosures.stage.ts after the LLM has validated
 * the BIA form against the schema defined in bia.validation.v06-25.ts.
 */

import type { RuleIssue, RuleResult, ComplianceCheck, ValidationUploadSource } from '../validator/validator.types';
import type { BiaValidationOutput } from '../extractor/forms/bia/bia.validation.v06-25';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function issue(code: string, fields?: string[], location?: string): RuleIssue {
  return { code, fields, location };
}

function pass(id: string, cat: ComplianceCheck['category'], form: string, label: string, detail?: string): ComplianceCheck {
  return { ruleId: id, category: cat, formCode: form, phase: 'disclosure', severity: 'info', status: 'pass', label, detail };
}

// ─── Form-level validation ────────────────────────────────────────────────────

function validateFormIdentity(data: BiaValidationOutput): RuleResult {
  const issues: RuleIssue[] = [];
  const checks: ComplianceCheck[] = [];
  const fv = data.form_validation;

  if (fv.form_identity_status === 'wrong_form') {
    issues.push(issue('BLOCKER_BIA_WRONG_FORM', ['form_validation.form_identity_status'], `Detected form: ${fv.form_title ?? 'Unknown'}`));
    return { issues, checks };
  }

  if (fv.form_identity_status === 'missing_pages') {
    issues.push(issue('BLOCKER_BIA_PAGE_MISSING', ['form_validation.missing_pages'], `Missing BIA pages: ${fv.missing_pages.join(', ')}`));
    return { issues, checks };
  }

  if (fv.form_identity_status === 'duplicate_pages') {
    issues.push(issue('BLOCKER_BIA_PAGE_DUPLICATE', ['form_validation.duplicate_pages'], `Duplicate BIA pages: ${fv.duplicate_pages.join(', ')}`));
    return { issues, checks };
  }

  if (fv.form_identity_status === 'wrong_page_order') {
    issues.push(issue('BLOCKER_BIA_WRONG_PAGE_ORDER', ['form_validation.page_order_valid'], 'BIA page 1 does not appear before page 2'));
    return { issues, checks };
  }

  if (fv.form_identity_status === 'mixed_revision') {
    issues.push(issue('BLOCKER_BIA_MIXED_REVISION', ['form_validation.mixed_form_revisions'], 'Different BIA revision dates detected across pages'));
    return { issues, checks };
  }

  checks.push(pass('bia_form_identified', 'forms_disclosures', 'BIA', 'Document identified as BIA'));

  if (!fv.document_complete) {
    issues.push(issue('BLOCKER_BIA_CONTENT_INCOMPLETE', ['form_validation.document_complete'], 'A material portion of the BIA is missing or cropped'));
  } else {
    checks.push(pass('bia_document_complete', 'forms_disclosures', 'BIA', 'BIA document is complete'));
  }

  // Cross-page consistency
  const cpv = data.cross_page_validation;
  if (cpv.cross_page_status === 'inconsistent') {
    for (const msg of cpv.inconsistency_messages) {
      issues.push(issue('BLOCKER_BIA_CONTENT_INCOMPLETE', ['cross_page_validation.inconsistency_messages'], msg));
    }
  }

  return { issues, checks };
}

// ─── Page 1 content validation ────────────────────────────────────────────────

function validatePage1(data: BiaValidationOutput): RuleResult {
  const issues: RuleIssue[] = [];
  const checks: ComplianceCheck[] = [];
  const p1 = data.page_1;

  if (!p1.page_present) {
    issues.push(issue('BLOCKER_BIA_PAGE_MISSING', ['page_1.page_present'], 'BIA page 1 of 2 is missing'));
    return { issues, checks };
  }

  if (p1.page_completion_status === 'content_incomplete') {
    issues.push(issue('BLOCKER_BIA_CONTENT_INCOMPLETE', ['page_1.page_completion_status'], 'Material advisory content is missing from BIA page 1'));
    return { issues, checks };
  }

  // Advisory sections present
  const cats = p1.investigation_categories;
  const sectionsPresent = [
    p1.section_1_importance_of_property_investigation_present,
    p1.section_2_broker_obligations_present,
    p1.section_3_investigation_advice_heading_present,
    cats.all_page_1_categories_present,
  ];
  const missingSections = sectionsPresent.filter(s => !s);
  if (missingSections.length > 0) {
    issues.push(issue('BLOCKER_BIA_CONTENT_INCOMPLETE', ['page_1.section_*'], 'One or more required advisory sections are missing from BIA page 1'));
  } else {
    checks.push(pass('bia_page_1_content', 'forms_disclosures', 'BIA', 'BIA page 1 advisory content present'));
  }

  return { issues, checks };
}

// ─── Page 2 content validation ─────────────────────────────────────────────────

/**
 * Page 2's non-signature content — page presence, completion, the
 * acknowledgment section's own text, and Section 3N. Kept separate from
 * `validateBuyerSignatures` below (unlike the original single function) so a
 * Seller Agent upload can skip only the buyer's own signature/date without
 * also skipping these genuinely form-specific checks.
 */
function validatePage2Content(data: BiaValidationOutput): RuleResult {
  const issues: RuleIssue[] = [];
  const checks: ComplianceCheck[] = [];
  const p2 = data.page_2;

  if (!p2.page_present) {
    issues.push(issue('BLOCKER_BIA_PAGE_MISSING', ['page_2.page_present'], 'BIA page 2 of 2 is missing'));
    return { issues, checks };
  }

  if (p2.page_completion_status === 'content_incomplete') {
    issues.push(issue('BLOCKER_BIA_CONTENT_INCOMPLETE', ['page_2.page_completion_status'], 'Material content is missing from BIA page 2'));
    return { issues, checks };
  }

  // Acknowledgment section
  if (!p2.acknowledgement_text_present) {
    issues.push(issue('BLOCKER_BIA_ACKNOWLEDGMENT_MISSING', ['page_2.acknowledgement_text_present'], 'BIA Buyer acknowledgment section is missing'));
    return { issues, checks };
  }
  checks.push(pass('bia_acknowledgment_present', 'forms_disclosures', 'BIA', 'BIA Buyer acknowledgment section present'));

  // Section 3N
  if (!p2.section_3n_neighborhood_area_subdivision_conditions_present) {
    issues.push(issue('BLOCKER_BIA_CONTENT_INCOMPLETE', ['page_2.section_3n_neighborhood_area_subdivision_conditions_present'], 'Section 3N (Neighborhood, Area, Subdivision Conditions) is missing from BIA page 2'));
  }

  return { issues, checks };
}

// ─── Buyer signature validation ────────────────────────────────────────────────

/**
 * Only runs when the page is present, complete, and the acknowledgment
 * section itself is present — mirrors `validatePage2Content`'s own early
 * returns so the buyer-signature checks below never run against content
 * that's already been reported missing.
 */
function canValidateBuyerSignatures(p2: BiaValidationOutput['page_2']): boolean {
  return p2.page_present && p2.page_completion_status !== 'content_incomplete' && p2.acknowledgement_text_present;
}

function validateBuyerSignatures(data: BiaValidationOutput): RuleResult {
  const issues: RuleIssue[] = [];
  const checks: ComplianceCheck[] = [];
  const p2 = data.page_2;
  if (!canValidateBuyerSignatures(p2)) return { issues, checks };

  const ack = p2.buyer_acknowledgements;
  const ctx = data.transaction_context;
  const requiredCount = ack.required_signature_count ?? 0;

  if (ack.required_signature_count === null) {
    issues.push(issue('WARN_BIA_BUYER_COUNT_UNKNOWN', ['page_2.buyer_acknowledgements.required_signature_count'], 'Transaction context did not provide a required Buyer count. Evaluate visually.'));
  }

  // Slot 1 — required-slot blockers
  if (requiredCount >= 1) {
    const b1 = ack.buyer_1;
    if (!b1.signature_present) {
      issues.push(issue('BLOCKER_BIA_BUYER_1_SIGNATURE_MISSING', ['page_2.buyer_acknowledgements.buyer_1.signature_present'], 'Buyer 1 must sign the BIA acknowledgment'));
    } else if (!b1.date_present) {
      issues.push(issue('BLOCKER_BIA_BUYER_1_DATE_MISSING', ['page_2.buyer_acknowledgements.buyer_1.date_present'], 'Buyer 1 must date their signature on the BIA'));
    } else if (b1.completion_status === 'complete') {
      checks.push(pass('bia_buyer_1_complete', 'signatures', 'BIA', 'Buyer 1 signature and date complete'));
    }
  }

  // Slot 1 — quality warnings
  const b1 = ack.buyer_1;
  if (b1.signature_type === 'unreadable') {
    issues.push(issue('WARN_BIA_SIGNATURE_UNREADABLE', ['page_2.buyer_acknowledgements.buyer_1.signature_type'], 'Buyer 1 signature is unreadable — manual review required'));
  }
  if (b1.signature_present && b1.signer_matches_expected_buyer === null && ctx.expected_buyer_names && ctx.expected_buyer_names.length > 0) {
    issues.push(issue('WARN_BIA_SIGNER_IDENTITY_UNKNOWN', ['page_2.buyer_acknowledgements.buyer_1.signer_matches_expected_buyer'], 'Cannot determine if Buyer 1 signer matches expected Buyer'));
  }
  if (b1.signature_present && b1.signer_matches_expected_buyer === false) {
    issues.push(issue('BLOCKER_BIA_BUYER_SIGNER_MISMATCH', ['page_2.buyer_acknowledgements.buyer_1.signature_text'], `Expected: ${ctx.expected_buyer_names?.[0] ?? 'Unknown'}, Actual: ${b1.signature_text ?? 'Unknown'}`));
  }

  // Slot 2 — required-slot blockers
  if (requiredCount >= 2) {
    const b2 = ack.buyer_2;
    if (!b2.signature_present) {
      issues.push(issue('BLOCKER_BIA_BUYER_2_SIGNATURE_MISSING', ['page_2.buyer_acknowledgements.buyer_2.signature_present'], 'Buyer 2 must sign the BIA acknowledgment'));
    } else if (!b2.date_present) {
      issues.push(issue('BLOCKER_BIA_BUYER_2_DATE_MISSING', ['page_2.buyer_acknowledgements.buyer_2.date_present'], 'Buyer 2 must date their signature on the BIA'));
    } else if (b2.completion_status === 'complete') {
      checks.push(pass('bia_buyer_2_complete', 'signatures', 'BIA', 'Buyer 2 signature and date complete'));
    }
  }

  // Slot 2 — quality warnings
  const b2 = ack.buyer_2;
  if (b2.signature_type === 'unreadable') {
    issues.push(issue('WARN_BIA_SIGNATURE_UNREADABLE', ['page_2.buyer_acknowledgements.buyer_2.signature_type'], 'Buyer 2 signature is unreadable — manual review required'));
  }
  if (b2.signature_present && b2.signer_matches_expected_buyer === null && ctx.expected_buyer_names && ctx.expected_buyer_names.length > 1) {
    issues.push(issue('WARN_BIA_SIGNER_IDENTITY_UNKNOWN', ['page_2.buyer_acknowledgements.buyer_2.signer_matches_expected_buyer'], 'Cannot determine if Buyer 2 signer matches expected Buyer'));
  }
  if (b2.signature_present && b2.signer_matches_expected_buyer === false) {
    issues.push(issue('BLOCKER_BIA_BUYER_SIGNER_MISMATCH', ['page_2.buyer_acknowledgements.buyer_2.signature_text'], `Expected: ${ctx.expected_buyer_names?.[1] ?? 'Unknown'}, Actual: ${b2.signature_text ?? 'Unknown'}`));
  }

  return { issues, checks };
}

// ─── Manual review check ──────────────────────────────────────────────────────

function validateManualReview(data: BiaValidationOutput): RuleResult {
  const issues: RuleIssue[] = [];
  const checks: ComplianceCheck[] = [];

  if (data.validation_summary.overall_status === 'manual_review_required') {
    issues.push(issue('WARN_BIA_MANUAL_REVIEW', ['validation_summary.overall_status'], 'The BIA has conditions that require manual review by a transaction coordinator'));
  }

  return { issues, checks };
}

// ─── Main validation function ─────────────────────────────────────────────────

/**
 * Validate BIA extraction data against the comprehensive validation schema.
 *
 * @param data - The LLM validation output (must match BiaValidationOutput schema)
 * @returns RuleResult with issues (blockers/warnings) and compliance checks
 */
export function validateBiaWithSchema(data: Record<string, unknown>, uploadSource?: ValidationUploadSource): RuleResult {
  const bia = data as unknown as BiaValidationOutput;

  // Quick sanity check
  if (!bia || bia.form_type !== 'BIA') {
    return {
      issues: [issue('BLOCKER_BIA_WRONG_FORM', ['form_type'], 'Document is not a BIA')],
      checks: [],
    };
  }

  const results: RuleResult[] = [];

  results.push(validateFormIdentity(bia));
  results.push(validatePage1(bia));
  results.push(validatePage2Content(bia));
  // BIA has no seller-side content at all — a Seller Agent upload of this
  // buyer-only form must never fail on the buyer's own signature/date.
  if (uploadSource !== 'seller_agent') {
    results.push(validateBuyerSignatures(bia));
  }
  results.push(validateManualReview(bia));

  // Merge all results
  const issues: RuleIssue[] = [];
  const checks: ComplianceCheck[] = [];
  for (const r of results) {
    issues.push(...r.issues);
    checks.push(...r.checks);
  }

  return { issues, checks };
}
