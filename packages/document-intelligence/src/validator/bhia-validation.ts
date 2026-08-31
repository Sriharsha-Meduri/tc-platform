/**
 * BHIA Validation Logic
 *
 * Processes the LLM validation output (BhiaValidationOutput) and produces
 * issues and checks for the compliance system.
 *
 * This module is called by disclosures.stage.ts after the LLM has validated
 * the BHIA form against the schema defined in bhia.validation.v06-24.ts.
 */

import type { RuleIssue, RuleResult, ComplianceCheck, ValidationUploadSource } from '../validator/validator.types';
import type { BhiaValidationOutput } from '../extractor/forms/bhia/bhia.validation.v06-24';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function issue(code: string, fields?: string[], location?: string): RuleIssue {
  return { code, fields, location };
}

function pass(id: string, cat: ComplianceCheck['category'], form: string, label: string, detail?: string): ComplianceCheck {
  return { ruleId: id, category: cat, formCode: form, phase: 'disclosure', severity: 'info', status: 'pass', label, detail };
}

// ─── Form-level validation ────────────────────────────────────────────────────

function validateFormIdentity(data: BhiaValidationOutput): RuleResult {
  const issues: RuleIssue[] = [];
  const checks: ComplianceCheck[] = [];
  const fv = data.form_validation;

  if (fv.form_identity_status === 'wrong_form') {
    issues.push(issue('BLOCKER_BHIA_WRONG_FORM', ['form_validation.form_identity_status'], `Detected form: ${fv.form_title ?? 'Unknown'}`));
    return { issues, checks };
  }

  if (fv.form_identity_status === 'wrong_page') {
    issues.push(issue('BLOCKER_BHIA_WRONG_PAGE', ['form_validation.logical_page_number'], `Detected logical page ${fv.logical_page_number ?? 'Unknown'}`));
    return { issues, checks };
  }

  if (fv.form_identity_status === 'missing_page') {
    issues.push(issue('BLOCKER_BHIA_PAGE_MISSING', ['form_validation.form_identity_status'], 'BHIA page not found in document'));
    return { issues, checks };
  }

  checks.push(pass('bhia_form_identified', 'forms_disclosures', 'BHIA', 'Document identified as BHIA'));

  if (!fv.document_complete) {
    issues.push(issue('BLOCKER_BHIA_CONTENT_INCOMPLETE', ['form_validation.document_complete'], 'A material portion of the BHIA page is missing or cropped'));
  } else {
    checks.push(pass('bhia_document_complete', 'forms_disclosures', 'BHIA', 'BHIA document is complete'));
  }

  return { issues, checks };
}

// ─── Acknowledgment section validation ────────────────────────────────────────

function validateAcknowledgment(data: BhiaValidationOutput): RuleResult {
  const issues: RuleIssue[] = [];
  const checks: ComplianceCheck[] = [];
  const ack = data.advisory_content_validation;

  if (!ack.acknowledgement_text_present) {
    issues.push(issue('BLOCKER_BHIA_ACKNOWLEDGMENT_MISSING', ['advisory_content_validation.acknowledgement_text_present'], 'The acknowledgment text and signature area are not present on the BHIA'));
    return { issues, checks };
  }

  checks.push(pass('bhia_acknowledgment_present', 'forms_disclosures', 'BHIA', 'BHIA Buyer acknowledgment section present'));

  if (data.form_validation.document_complete && !ack.all_required_sections_present) {
    issues.push(issue('BLOCKER_BHIA_CONTENT_INCOMPLETE', ['advisory_content_validation.all_required_sections_present'], 'One or more required advisory sections are missing from the BHIA'));
  } else if (data.form_validation.document_complete) {
    checks.push(pass('bhia_all_sections_present', 'forms_disclosures', 'BHIA', 'All required advisory sections present'));
  }

  return { issues, checks };
}

// ─── Buyer signature validation ───────────────────────────────────────────────

function validateBuyerSignatures(data: BhiaValidationOutput): RuleResult {
  const issues: RuleIssue[] = [];
  const checks: ComplianceCheck[] = [];
  const ack = data.buyer_acknowledgements;
  const ctx = data.transaction_context;

  const requiredCount = ack.required_signature_count ?? 0;

  // Buyer count unknown
  if (ack.required_signature_count === null) {
    issues.push(issue('WARN_BHIA_BUYER_COUNT_UNKNOWN', ['buyer_acknowledgements.required_signature_count'], 'Transaction context did not provide a required Buyer count. Evaluate visually.'));
  }

  // Buyer 1 — required-slot blockers
  if (requiredCount >= 1) {
    const b1 = ack.buyer_1;
    if (!b1.signature_present) {
      issues.push(issue('BLOCKER_BHIA_BUYER_1_SIGNATURE_MISSING', ['buyer_acknowledgements.buyer_1.signature_present'], 'Buyer 1 must sign the BHIA acknowledgment'));
    } else if (!b1.date_present) {
      issues.push(issue('BLOCKER_BHIA_BUYER_1_DATE_MISSING', ['buyer_acknowledgements.buyer_1.date_present'], 'Buyer 1 must date their signature on the BHIA'));
    } else if (b1.completion_status === 'complete') {
      checks.push(pass('bhia_buyer_1_complete', 'signatures', 'BHIA', 'Buyer 1 signature and date complete'));
    }
  }

  // Buyer 1 — quality warnings (always check, even when not required)
  const b1 = ack.buyer_1;
  if (b1.signature_type === 'unreadable') {
    issues.push(issue('WARN_BHIA_SIGNATURE_UNREADABLE', ['buyer_acknowledgements.buyer_1.signature_type'], 'Buyer 1 signature is unreadable — manual review required'));
  }
  if (b1.signature_present && b1.signer_matches_expected_buyer === null && ctx.expected_buyer_names && ctx.expected_buyer_names.length > 0) {
    issues.push(issue('WARN_BHIA_SIGNER_IDENTITY_UNKNOWN', ['buyer_acknowledgements.buyer_1.signer_matches_expected_buyer'], 'Cannot determine if Buyer 1 signer matches expected Buyer'));
  }
  if (b1.signature_present && b1.signer_matches_expected_buyer === false) {
    issues.push(issue('BLOCKER_BHIA_BUYER_SIGNER_MISMATCH', ['buyer_acknowledgements.buyer_1.signature_text'], `Expected: ${ctx.expected_buyer_names?.[0] ?? 'Unknown'}, Actual: ${b1.signature_text ?? 'Unknown'}`));
  }

  // Buyer 2 — required-slot blockers
  if (requiredCount >= 2) {
    const b2 = ack.buyer_2;
    if (!b2.signature_present) {
      issues.push(issue('BLOCKER_BHIA_BUYER_2_SIGNATURE_MISSING', ['buyer_acknowledgements.buyer_2.signature_present'], 'Buyer 2 must sign the BHIA acknowledgment'));
    } else if (!b2.date_present) {
      issues.push(issue('BLOCKER_BHIA_BUYER_2_DATE_MISSING', ['buyer_acknowledgements.buyer_2.date_present'], 'Buyer 2 must date their signature on the BHIA'));
    } else if (b2.completion_status === 'complete') {
      checks.push(pass('bhia_buyer_2_complete', 'signatures', 'BHIA', 'Buyer 2 signature and date complete'));
    }
  }

  // Buyer 2 — quality warnings (always check, even when not required)
  const b2 = ack.buyer_2;
  if (b2.signature_type === 'unreadable') {
    issues.push(issue('WARN_BHIA_SIGNATURE_UNREADABLE', ['buyer_acknowledgements.buyer_2.signature_type'], 'Buyer 2 signature is unreadable — manual review required'));
  }
  if (b2.signature_present && b2.signer_matches_expected_buyer === null && ctx.expected_buyer_names && ctx.expected_buyer_names.length > 1) {
    issues.push(issue('WARN_BHIA_SIGNER_IDENTITY_UNKNOWN', ['buyer_acknowledgements.buyer_2.signer_matches_expected_buyer'], 'Cannot determine if Buyer 2 signer matches expected Buyer'));
  }
  if (b2.signature_present && b2.signer_matches_expected_buyer === false) {
    issues.push(issue('BLOCKER_BHIA_BUYER_SIGNER_MISMATCH', ['buyer_acknowledgements.buyer_2.signature_text'], `Expected: ${ctx.expected_buyer_names?.[1] ?? 'Unknown'}, Actual: ${b2.signature_text ?? 'Unknown'}`));
  }

  return { issues, checks };
}

// ─── Manual review check ──────────────────────────────────────────────────────

function validateManualReview(data: BhiaValidationOutput): RuleResult {
  const issues: RuleIssue[] = [];
  const checks: ComplianceCheck[] = [];

  if (data.validation_summary.overall_status === 'manual_review_required') {
    issues.push(issue('WARN_BHIA_MANUAL_REVIEW', ['validation_summary.overall_status'], 'The BHIA has conditions that require manual review by a transaction coordinator'));
  }

  return { issues, checks };
}

// ─── Main validation function ─────────────────────────────────────────────────

/**
 * Validate BHIA extraction data against the comprehensive validation schema.
 *
 * @param data - The LLM validation output (must match BhiaValidationOutput schema)
 * @returns RuleResult with issues (blockers/warnings) and compliance checks
 */
export function validateBhiaWithSchema(data: Record<string, unknown>, uploadSource?: ValidationUploadSource): RuleResult {
  const bhia = data as unknown as BhiaValidationOutput;

  // Quick sanity check
  if (!bhia || bhia.form_type !== 'BHIA') {
    return {
      issues: [issue('BLOCKER_BHIA_WRONG_FORM', ['form_type'], 'Document is not a BHIA')],
      checks: [],
    };
  }

  const results: RuleResult[] = [];

  results.push(validateFormIdentity(bhia));
  results.push(validateAcknowledgment(bhia));
  // BHIA has no seller-side content at all — a Seller Agent upload of this
  // buyer-only form must never fail on the buyer's own signature/date.
  if (uploadSource !== 'seller_agent') {
    results.push(validateBuyerSignatures(bhia));
  }
  results.push(validateManualReview(bhia));

  // Merge all results
  const issues: RuleIssue[] = [];
  const checks: ComplianceCheck[] = [];
  for (const r of results) {
    issues.push(...r.issues);
    checks.push(...r.checks);
  }

  return { issues, checks };
}
