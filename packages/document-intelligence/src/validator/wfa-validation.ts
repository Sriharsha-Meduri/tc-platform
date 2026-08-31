/**
 * WFA Validation Logic
 *
 * Processes the LLM validation output (WfaValidationOutput) and produces
 * issues and checks for the compliance system.
 *
 * This module is called by disclosures.stage.ts after the LLM has validated
 * the WFA form against the schema defined in wfa.validation.v06-25.ts.
 */

import type { RuleIssue, RuleResult, ComplianceCheck, ValidationUploadSource } from '../validator/validator.types';
import type { WfaValidationOutput, TransactionType } from '../extractor/forms/wfa/wfa.validation.v06-25';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function issue(code: string, fields?: string[], location?: string): RuleIssue {
  return { code, fields, location };
}

function pass(id: string, cat: ComplianceCheck['category'], form: string, label: string, detail?: string): ComplianceCheck {
  return { ruleId: id, category: cat, formCode: form, phase: 'disclosure', severity: 'info', status: 'pass', label, detail };
}

/** Map transaction type to role label for messages */
function roleLabel(txnType: TransactionType, party: 'buyer' | 'seller'): string {
  if (party === 'buyer') {
    if (txnType === 'purchase') return 'Buyer';
    if (txnType === 'rental') return 'Tenant';
  } else {
    if (txnType === 'purchase') return 'Seller';
    if (txnType === 'rental') return 'Housing Provider';
  }
  return party === 'buyer' ? 'Buyer/Tenant' : 'Seller/Housing Provider';
}

// ─── Form-level validation ────────────────────────────────────────────────────

function validateFormIdentity(data: WfaValidationOutput): RuleResult {
  const issues: RuleIssue[] = [];
  const checks: ComplianceCheck[] = [];
  const fv = data.form_validation;

  if (fv.form_identity_status === 'wrong_form') {
    issues.push(issue('BLOCKER_WFA_WRONG_FORM', ['form_validation.form_identity_status'], `Detected form: ${fv.form_title ?? 'Unknown'}`));
    return { issues, checks };
  }

  if (fv.form_identity_status === 'wrong_page') {
    issues.push(issue('BLOCKER_WFA_WRONG_PAGE', ['form_validation.logical_page_number'], `Detected logical page ${fv.logical_page_number ?? 'Unknown'}`));
    return { issues, checks };
  }

  if (fv.form_identity_status === 'missing_page') {
    issues.push(issue('BLOCKER_WFA_PAGE_MISSING', ['form_validation.form_identity_status'], 'WFA page not found in document'));
    return { issues, checks };
  }

  checks.push(pass('wfa_form_identified', 'forms_disclosures', 'WFA', 'Document identified as WFA'));

  if (!fv.document_complete) {
    issues.push(issue('BLOCKER_WFA_CONTENT_INCOMPLETE', ['form_validation.document_complete'], 'A material portion of the WFA page is missing or cropped'));
  } else {
    checks.push(pass('wfa_document_complete', 'forms_disclosures', 'WFA', 'WFA document is complete'));
  }

  return { issues, checks };
}

// ─── Advisory content validation ──────────────────────────────────────────────

function validateAdvisoryContent(data: WfaValidationOutput): RuleResult {
  const issues: RuleIssue[] = [];
  const checks: ComplianceCheck[] = [];
  const acv = data.advisory_content_validation;

  if (!acv.acknowledgement_text_present) {
    issues.push(issue('BLOCKER_WFA_ACKNOWLEDGMENT_MISSING', ['advisory_content_validation.acknowledgement_text_present'], 'The acknowledgment text and signature area are not present on the WFA'));
    return { issues, checks };
  }

  checks.push(pass('wfa_acknowledgment_present', 'forms_disclosures', 'WFA', 'WFA acknowledgment section present'));

  if (data.form_validation.document_complete && !acv.all_required_content_present) {
    issues.push(issue('BLOCKER_WFA_CONTENT_INCOMPLETE', ['advisory_content_validation.all_required_content_present'], 'One or more required advisory sections or recommendations are missing from the WFA'));
  } else if (data.form_validation.document_complete) {
    checks.push(pass('wfa_all_content_present', 'forms_disclosures', 'WFA', 'All required advisory content present'));
  }

  return { issues, checks };
}

// ─── Party signature validation (shared for buyer/seller) ────────────────────

function validateBuyerSignatures(data: WfaValidationOutput): RuleResult {
  const issues: RuleIssue[] = [];
  const checks: ComplianceCheck[] = [];
  const ack = data.buyer_tenant_acknowledgements;
  const ctx = data.transaction_context;
  const txnType = ctx.transaction_type;
  const partyLabel = roleLabel(txnType, 'buyer');
  const requiredCount = ack.required_signature_count ?? 0;

  // Buyer count unknown
  if (ack.required_signature_count === null) {
    issues.push(issue('WARN_WFA_BUYER_TENANT_COUNT_UNKNOWN', ['buyer_tenant_acknowledgements.required_signature_count'], `Transaction context did not provide a required ${partyLabel} count. Evaluate visually.`));
  }

  // Slot 1 — required-slot blockers
  if (requiredCount >= 1) {
    const s1 = ack.slot_1;
    if (!s1.signature_present) {
      issues.push(issue('BLOCKER_WFA_BUYER_TENANT_1_SIGNATURE_MISSING', ['buyer_tenant_acknowledgements.slot_1.signature_present'], `${partyLabel} 1 must sign the WFA acknowledgment`));
    } else if (!s1.date_present) {
      issues.push(issue('BLOCKER_WFA_BUYER_TENANT_1_DATE_MISSING', ['buyer_tenant_acknowledgements.slot_1.date_present'], `${partyLabel} 1 must date their signature on the WFA`));
    } else if (s1.completion_status === 'complete') {
      checks.push(pass('wfa_buyer_tenant_1_complete', 'signatures', 'WFA', `${partyLabel} 1 signature and date complete`));
    }
  }

  // Slot 1 — quality warnings (always check, even when not required)
  const s1 = ack.slot_1;
  if (s1.signature_type === 'unreadable') {
    issues.push(issue('WARN_WFA_SIGNATURE_UNREADABLE', ['buyer_tenant_acknowledgements.slot_1.signature_type'], `${partyLabel} 1 signature is unreadable — manual review required`));
  }
  if (s1.signature_present && s1.signer_matches_expected_party === null && ctx.expected_buyer_tenant_names && ctx.expected_buyer_tenant_names.length > 0) {
    issues.push(issue('WARN_WFA_SIGNER_IDENTITY_UNKNOWN', ['buyer_tenant_acknowledgements.slot_1.signer_matches_expected_party'], `Cannot determine if ${partyLabel} 1 signer matches expected party`));
  }
  if (s1.signature_present && s1.signer_matches_expected_party === false) {
    issues.push(issue('BLOCKER_WFA_BUYER_TENANT_SIGNER_MISMATCH', ['buyer_tenant_acknowledgements.slot_1.signature_text'], `Expected: ${ctx.expected_buyer_tenant_names?.[0] ?? 'Unknown'}, Actual: ${s1.signature_text ?? 'Unknown'}`));
  }

  // Slot 2 — required-slot blockers
  if (requiredCount >= 2) {
    const s2 = ack.slot_2;
    if (!s2.signature_present) {
      issues.push(issue('BLOCKER_WFA_BUYER_TENANT_2_SIGNATURE_MISSING', ['buyer_tenant_acknowledgements.slot_2.signature_present'], `${partyLabel} 2 must sign the WFA acknowledgment`));
    } else if (!s2.date_present) {
      issues.push(issue('BLOCKER_WFA_BUYER_TENANT_2_DATE_MISSING', ['buyer_tenant_acknowledgements.slot_2.date_present'], `${partyLabel} 2 must date their signature on the WFA`));
    } else if (s2.completion_status === 'complete') {
      checks.push(pass('wfa_buyer_tenant_2_complete', 'signatures', 'WFA', `${partyLabel} 2 signature and date complete`));
    }
  }

  // Slot 2 — quality warnings (always check, even when not required)
  const s2 = ack.slot_2;
  if (s2.signature_type === 'unreadable') {
    issues.push(issue('WARN_WFA_SIGNATURE_UNREADABLE', ['buyer_tenant_acknowledgements.slot_2.signature_type'], `${partyLabel} 2 signature is unreadable — manual review required`));
  }
  if (s2.signature_present && s2.signer_matches_expected_party === null && ctx.expected_buyer_tenant_names && ctx.expected_buyer_tenant_names.length > 1) {
    issues.push(issue('WARN_WFA_SIGNER_IDENTITY_UNKNOWN', ['buyer_tenant_acknowledgements.slot_2.signer_matches_expected_party'], `Cannot determine if ${partyLabel} 2 signer matches expected party`));
  }
  if (s2.signature_present && s2.signer_matches_expected_party === false) {
    issues.push(issue('BLOCKER_WFA_BUYER_TENANT_SIGNER_MISMATCH', ['buyer_tenant_acknowledgements.slot_2.signature_text'], `Expected: ${ctx.expected_buyer_tenant_names?.[1] ?? 'Unknown'}, Actual: ${s2.signature_text ?? 'Unknown'}`));
  }

  return { issues, checks };
}

function validateSellerSignatures(data: WfaValidationOutput): RuleResult {
  const issues: RuleIssue[] = [];
  const checks: ComplianceCheck[] = [];
  const ack = data.seller_housing_provider_acknowledgements;
  const ctx = data.transaction_context;
  const txnType = ctx.transaction_type;
  const partyLabel = roleLabel(txnType, 'seller');
  const requiredCount = ack.required_signature_count ?? 0;

  // Seller count unknown
  if (ack.required_signature_count === null) {
    issues.push(issue('WARN_WFA_SELLER_HOUSING_PROVIDER_COUNT_UNKNOWN', ['seller_housing_provider_acknowledgements.required_signature_count'], `Transaction context did not provide a required ${partyLabel} count. Evaluate visually.`));
  }

  // Slot 1 — required-slot blockers
  if (requiredCount >= 1) {
    const s1 = ack.slot_1;
    if (!s1.signature_present) {
      issues.push(issue('BLOCKER_WFA_SELLER_HOUSING_PROVIDER_1_SIGNATURE_MISSING', ['seller_housing_provider_acknowledgements.slot_1.signature_present'], `${partyLabel} 1 must sign the WFA acknowledgment`));
    } else if (!s1.date_present) {
      issues.push(issue('BLOCKER_WFA_SELLER_HOUSING_PROVIDER_1_DATE_MISSING', ['seller_housing_provider_acknowledgements.slot_1.date_present'], `${partyLabel} 1 must date their signature on the WFA`));
    } else if (s1.completion_status === 'complete') {
      checks.push(pass('wfa_seller_1_complete', 'signatures', 'WFA', `${partyLabel} 1 signature and date complete`));
    }
  }

  // Slot 1 — quality warnings (always check, even when not required)
  const s1 = ack.slot_1;
  if (s1.signature_type === 'unreadable') {
    issues.push(issue('WARN_WFA_SIGNATURE_UNREADABLE', ['seller_housing_provider_acknowledgements.slot_1.signature_type'], `${partyLabel} 1 signature is unreadable — manual review required`));
  }
  if (s1.signature_present && s1.signer_matches_expected_party === null && ctx.expected_seller_housing_provider_names && ctx.expected_seller_housing_provider_names.length > 0) {
    issues.push(issue('WARN_WFA_SIGNER_IDENTITY_UNKNOWN', ['seller_housing_provider_acknowledgements.slot_1.signer_matches_expected_party'], `Cannot determine if ${partyLabel} 1 signer matches expected party`));
  }
  if (s1.signature_present && s1.signer_matches_expected_party === false) {
    issues.push(issue('BLOCKER_WFA_SELLER_HOUSING_PROVIDER_SIGNER_MISMATCH', ['seller_housing_provider_acknowledgements.slot_1.signature_text'], `Expected: ${ctx.expected_seller_housing_provider_names?.[0] ?? 'Unknown'}, Actual: ${s1.signature_text ?? 'Unknown'}`));
  }

  // Slot 2 — required-slot blockers
  if (requiredCount >= 2) {
    const s2 = ack.slot_2;
    if (!s2.signature_present) {
      issues.push(issue('BLOCKER_WFA_SELLER_HOUSING_PROVIDER_2_SIGNATURE_MISSING', ['seller_housing_provider_acknowledgements.slot_2.signature_present'], `${partyLabel} 2 must sign the WFA acknowledgment`));
    } else if (!s2.date_present) {
      issues.push(issue('BLOCKER_WFA_SELLER_HOUSING_PROVIDER_2_DATE_MISSING', ['seller_housing_provider_acknowledgements.slot_2.date_present'], `${partyLabel} 2 must date their signature on the WFA`));
    } else if (s2.completion_status === 'complete') {
      checks.push(pass('wfa_seller_2_complete', 'signatures', 'WFA', `${partyLabel} 2 signature and date complete`));
    }
  }

  // Slot 2 — quality warnings (always check, even when not required)
  const s2 = ack.slot_2;
  if (s2.signature_type === 'unreadable') {
    issues.push(issue('WARN_WFA_SIGNATURE_UNREADABLE', ['seller_housing_provider_acknowledgements.slot_2.signature_type'], `${partyLabel} 2 signature is unreadable — manual review required`));
  }
  if (s2.signature_present && s2.signer_matches_expected_party === null && ctx.expected_seller_housing_provider_names && ctx.expected_seller_housing_provider_names.length > 1) {
    issues.push(issue('WARN_WFA_SIGNER_IDENTITY_UNKNOWN', ['seller_housing_provider_acknowledgements.slot_2.signer_matches_expected_party'], `Cannot determine if ${partyLabel} 2 signer matches expected party`));
  }
  if (s2.signature_present && s2.signer_matches_expected_party === false) {
    issues.push(issue('BLOCKER_WFA_SELLER_HOUSING_PROVIDER_SIGNER_MISMATCH', ['seller_housing_provider_acknowledgements.slot_2.signature_text'], `Expected: ${ctx.expected_seller_housing_provider_names?.[1] ?? 'Unknown'}, Actual: ${s2.signature_text ?? 'Unknown'}`));
  }

  return { issues, checks };
}

// ─── Manual review check ──────────────────────────────────────────────────────

function validateManualReview(data: WfaValidationOutput): RuleResult {
  const issues: RuleIssue[] = [];
  const checks: ComplianceCheck[] = [];

  if (data.validation_summary.overall_status === 'manual_review_required') {
    issues.push(issue('WARN_WFA_MANUAL_REVIEW', ['validation_summary.overall_status'], 'The WFA has conditions that require manual review by a transaction coordinator'));
  }

  return { issues, checks };
}

// ─── Main validation function ─────────────────────────────────────────────────

/**
 * Validate WFA extraction data against the comprehensive validation schema.
 *
 * @param data - The LLM validation output (must match WfaValidationOutput schema)
 * @returns RuleResult with issues (blockers/warnings) and compliance checks
 */
export function validateWfaWithSchema(data: Record<string, unknown>, uploadSource?: ValidationUploadSource): RuleResult {
  const wfa = data as unknown as WfaValidationOutput;

  // Quick sanity check
  if (!wfa || wfa.form_type !== 'WFA') {
    return {
      issues: [issue('BLOCKER_WFA_WRONG_FORM', ['form_type'], 'Document is not a WFA')],
      checks: [],
    };
  }

  const txnType = wfa.transaction_context.transaction_type;
  const results: RuleResult[] = [];

  results.push(validateFormIdentity(wfa));
  results.push(validateAdvisoryContent(wfa));
  // A Seller Agent upload only carries the seller's own execution.
  if (uploadSource !== 'seller_agent') {
    results.push(validateBuyerSignatures(wfa));
  }
  results.push(validateSellerSignatures(wfa));
  results.push(validateManualReview(wfa));

  // Merge all results
  const issues: RuleIssue[] = [];
  const checks: ComplianceCheck[] = [];
  for (const r of results) {
    issues.push(...r.issues);
    checks.push(...r.checks);
  }

  return { issues, checks };
}
