/**
 * FHDA Validation Logic
 *
 * Processes the LLM validation output (FhdaValidationOutput) and produces
 * issues and checks for the compliance system.
 *
 * This module is called by disclosures.stage.ts after the LLM has validated
 * the FHDA form against the schema defined in fhda.validation.v12-24.ts.
 */

import type { RuleIssue, RuleResult, ComplianceCheck, ValidationUploadSource } from '../validator/validator.types';
import type { FhdaValidationOutput, TransactionType, SignatureSlot, PartyAcknowledgements } from '../extractor/forms/fhda/fhda.validation.v12-24';

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

function validateFormIdentity(data: FhdaValidationOutput): RuleResult {
  const issues: RuleIssue[] = [];
  const checks: ComplianceCheck[] = [];
  const fv = data.form_validation;

  if (fv.form_identity_status === 'wrong_form') {
    issues.push(issue('BLOCKER_FHDA_WRONG_FORM', ['form_validation.form_identity_status'], `Detected form: ${fv.form_title ?? 'Unknown'}`));
    return { issues, checks };
  }

  if (fv.form_identity_status === 'wrong_page') {
    issues.push(issue('BLOCKER_FHDA_WRONG_PAGE', ['form_validation.logical_page_numbers'], `Detected logical pages: ${fv.logical_page_numbers.join(', ')}`));
    return { issues, checks };
  }

  if (fv.form_identity_status === 'missing_page') {
    issues.push(issue('BLOCKER_FHDA_PAGE_MISSING', ['form_validation.form_identity_status'], 'FHDA page not found in document'));
    return { issues, checks };
  }

  checks.push(pass('fhda_form_identified', 'forms_disclosures', 'FHDA', 'Document identified as FHDA'));

  if (!fv.document_complete) {
    issues.push(issue('BLOCKER_FHDA_CONTENT_INCOMPLETE', ['form_validation.document_complete'], 'A material portion of the FHDA page is missing or cropped'));
  } else {
    checks.push(pass('fhda_document_complete', 'forms_disclosures', 'FHDA', 'FHDA document is complete'));
  }

  return { issues, checks };
}

// ─── Cross-page validation ────────────────────────────────────────────────────

function validateCrossPage(data: FhdaValidationOutput): RuleResult {
  const issues: RuleIssue[] = [];
  const checks: ComplianceCheck[] = [];
  const xp = data.cross_page_validation;

  if (!xp.correct_total_pages) {
    issues.push(issue('BLOCKER_FHDA_PAGE_MISSING', ['cross_page_validation.page_count'], `Expected 2 pages, found ${xp.page_count}`));
  }

  if (data.form_validation.document_complete) {
    if (!xp.consistent_form_title) {
      issues.push(issue('BLOCKER_FHDA_MIXED_REVISION', ['cross_page_validation.consistent_form_title'], 'Form title is inconsistent across pages'));
    } else {
      checks.push(pass('fhda_title_consistent', 'forms_disclosures', 'FHDA', 'Form title consistent across pages'));
    }
  }

  return { issues, checks };
}

// ─── Page 1 content validation ────────────────────────────────────────────────

function validatePage1Content(data: FhdaValidationOutput): RuleResult {
  const issues: RuleIssue[] = [];
  const checks: ComplianceCheck[] = [];
  const p1 = data.page_1;

  if (!p1.all_page_1_sections_present) {
    issues.push(issue('BLOCKER_FHDA_CONTENT_INCOMPLETE', ['page_1.all_page_1_sections_present'], 'One or more required advisory sections on page 1 are missing'));
  } else {
    checks.push(pass('fhda_page_1_complete', 'forms_disclosures', 'FHDA', 'All page 1 advisory sections present'));
  }

  return { issues, checks };
}

// ─── Page 2 content validation ────────────────────────────────────────────────

function validatePage2Content(data: FhdaValidationOutput): RuleResult {
  const issues: RuleIssue[] = [];
  const checks: ComplianceCheck[] = [];
  const p2 = data.page_2;

  if (!p2.protected_classes_table_present) {
    issues.push(issue('BLOCKER_FHDA_PROTECTED_CLASSES_TABLE_MISSING', ['page_2.protected_classes_table_present'], 'The protected classes table is missing from FHDA page 2'));
  } else {
    checks.push(pass('fhda_protected_classes_table', 'forms_disclosures', 'FHDA', 'Protected classes table present on page 2'));
  }

  if (!p2.all_page_2_sections_present) {
    issues.push(issue('BLOCKER_FHDA_CONTENT_INCOMPLETE', ['page_2.all_page_2_sections_present'], 'One or more required advisory sections on page 2 are missing'));
  } else {
    checks.push(pass('fhda_page_2_complete', 'forms_disclosures', 'FHDA', 'All page 2 advisory sections present'));
  }

  if (!p2.who_is_required_to_comply) {
    issues.push(issue('BLOCKER_FHDA_CONTENT_INCOMPLETE', ['page_2.who_is_required_to_comply'], 'Section 9A (who is required to comply) is missing'));
  }

  if (!p2.examples_of_unlawful_improper_conduct) {
    issues.push(issue('BLOCKER_FHDA_CONTENT_INCOMPLETE', ['page_2.examples_of_unlawful_improper_conduct'], 'Section 9C (unlawful/improper conduct examples) is missing'));
  }

  if (!p2.fair_housing_resources) {
    issues.push(issue('BLOCKER_FHDA_CONTENT_INCOMPLETE', ['page_2.fair_housing_resources'], 'Section 10 (fair housing resources) is missing'));
  }

  return { issues, checks };
}

// ─── Acknowledgment validation ────────────────────────────────────────────────

function validateAcknowledgment(data: FhdaValidationOutput): RuleResult {
  const issues: RuleIssue[] = [];
  const checks: ComplianceCheck[] = [];

  const buyerComplete = data.buyer_tenant_acknowledgements.all_required_parties_signed;
  const sellerComplete = data.seller_housing_provider_acknowledgements.all_required_parties_signed;

  if (buyerComplete === false || sellerComplete === false) {
    issues.push(issue('BLOCKER_FHDA_ACKNOWLEDGMENT_MISSING', [], 'FHDA acknowledgment and signature section is incomplete'));
  } else if (buyerComplete === true && sellerComplete === true) {
    checks.push(pass('fhda_acknowledgment_complete', 'forms_disclosures', 'FHDA', 'FHDA acknowledgment section is complete'));
  }

  return { issues, checks };
}

// ─── Party signature validation (shared for buyer/seller) ────────────────────

function validatePartySignatures(
  data: FhdaValidationOutput,
  party: 'buyer' | 'seller',
): RuleResult {
  const issues: RuleIssue[] = [];
  const checks: ComplianceCheck[] = [];
  const ack: PartyAcknowledgements = party === 'buyer'
    ? data.buyer_tenant_acknowledgements
    : data.seller_housing_provider_acknowledgements;
  const ctx = data.transaction_context;
  const txnType = ctx.transaction_type;
  const label = roleLabel(txnType, party);
  const fieldPrefix = party === 'buyer' ? 'buyer_tenant' : 'seller_housing_provider';
  const requiredCount = ack.required_signature_count ?? 0;

  // Party count unknown
  if (ack.required_signature_count === null) {
    const warnCode = party === 'buyer' ? 'BLOCKER_FHDA_BUYER_TENANT_COUNT_UNKNOWN' : 'BLOCKER_FHDA_SELLER_HOUSING_PROVIDER_COUNT_UNKNOWN';
    issues.push(issue(warnCode, [`${fieldPrefix}_acknowledgements.required_signature_count`], `Transaction context did not provide a required ${label} count. Evaluate visually.`));
  }

  // Helper to validate a single slot
  function validateSlot(
    slot: SignatureSlot,
    slotIndex: number,
    isRequired: boolean,
  ): void {
    const slotLabel = `${label} ${slotIndex}`;

    // Required-slot blockers
    if (isRequired) {
      if (!slot.signature_present) {
        const code = party === 'buyer'
          ? `BLOCKER_FHDA_BUYER_TENANT_${slotIndex}_SIGNATURE_MISSING`
          : `BLOCKER_FHDA_SELLER_HOUSING_PROVIDER_${slotIndex}_SIGNATURE_MISSING`;
        issues.push(issue(code, [`${fieldPrefix}_acknowledgements.slot_${slotIndex}.signature_present`], `${slotLabel} must sign the FHDA acknowledgment`));
      } else if (!slot.date_present) {
        const code = party === 'buyer'
          ? `BLOCKER_FHDA_BUYER_TENANT_${slotIndex}_DATE_MISSING`
          : `BLOCKER_FHDA_SELLER_HOUSING_PROVIDER_${slotIndex}_DATE_MISSING`;
        issues.push(issue(code, [`${fieldPrefix}_acknowledgements.slot_${slotIndex}.date_present`], `${slotLabel} must date their signature on the FHDA`));
      } else if (slot.completion_status === 'complete') {
        const passId = party === 'buyer' ? `fhda_buyer_${slotIndex}_complete` : `fhda_seller_${slotIndex}_complete`;
        checks.push(pass(passId, 'signatures', 'FHDA', `${slotLabel} signature and date complete`));
      }
    }

    // Quality warnings (always check, even when not required)
    if (slot.signature_type === 'unreadable') {
      issues.push(issue('BLOCKER_FHDA_SIGNATURE_UNREADABLE', [`${fieldPrefix}_acknowledgements.slot_${slotIndex}.signature_type`], `${slotLabel} signature is unreadable — manual review required`));
    }
    if (slot.signature_present && slot.signer_matches_expected_party === null) {
      const expectedNames = party === 'buyer' ? ctx.expected_buyer_tenant_names : ctx.expected_seller_housing_provider_names;
      if (expectedNames && expectedNames.length >= slotIndex) {
        issues.push(issue('BLOCKER_FHDA_SIGNER_IDENTITY_UNKNOWN', [`${fieldPrefix}_acknowledgements.slot_${slotIndex}.signer_matches_expected_party`], `Cannot determine if ${slotLabel} signer matches expected party`));
      }
    }
    if (slot.signature_present && slot.signer_matches_expected_party === false) {
      const expectedNames = party === 'buyer' ? ctx.expected_buyer_tenant_names : ctx.expected_seller_housing_provider_names;
      const code = party === 'buyer' ? 'BLOCKER_FHDA_BUYER_TENANT_SIGNER_MISMATCH' : 'BLOCKER_FHDA_SELLER_HOUSING_PROVIDER_SIGNER_MISMATCH';
      issues.push(issue(code, [`${fieldPrefix}_acknowledgements.slot_${slotIndex}.signature_text`], `Expected: ${expectedNames?.[slotIndex - 1] ?? 'Unknown'}, Actual: ${slot.signature_text ?? 'Unknown'}`));
    }
  }

  // Slot 1
  if (requiredCount >= 1) {
    validateSlot(ack.slot_1, 1, true);
  } else {
    validateSlot(ack.slot_1, 1, false);
  }

  // Slot 2
  if (requiredCount >= 2) {
    validateSlot(ack.slot_2, 2, true);
  } else {
    validateSlot(ack.slot_2, 2, false);
  }

  return { issues, checks };
}

// ─── Manual review check ──────────────────────────────────────────────────────

function validateManualReview(data: FhdaValidationOutput): RuleResult {
  const issues: RuleIssue[] = [];
  const checks: ComplianceCheck[] = [];

  if (data.validation_summary.overall_status === 'manual_review_required') {
    issues.push(issue('BLOCKER_FHDA_MANUAL_REVIEW', ['validation_summary.overall_status'], 'The FHDA has conditions that require manual review by a transaction coordinator'));
  }

  return { issues, checks };
}

// ─── Main validation function ─────────────────────────────────────────────────

/**
 * Validate FHDA extraction data against the comprehensive validation schema.
 *
 * @param data - The LLM validation output (must match FhdaValidationOutput schema)
 * @returns RuleResult with issues (blockers/warnings) and compliance checks
 */
export function validateFhdaWithSchema(data: Record<string, unknown>, uploadSource?: ValidationUploadSource): RuleResult {
  const fhda = data as unknown as FhdaValidationOutput;

  // Quick sanity check
  if (!fhda || fhda.form_type !== 'FHDA') {
    return {
      issues: [issue('BLOCKER_FHDA_WRONG_FORM', ['form_type'], 'Document is not an FHDA')],
      checks: [],
    };
  }

  const results: RuleResult[] = [];

  results.push(validateFormIdentity(fhda));
  results.push(validateCrossPage(fhda));
  results.push(validatePage1Content(fhda));
  results.push(validatePage2Content(fhda));
  results.push(validateAcknowledgment(fhda));
  // A Seller Agent upload only carries the seller's own execution.
  if (uploadSource !== 'seller_agent') {
    results.push(validatePartySignatures(fhda, 'buyer'));
  }
  results.push(validatePartySignatures(fhda, 'seller'));
  results.push(validateManualReview(fhda));

  // Merge all results
  const issues: RuleIssue[] = [];
  const checks: ComplianceCheck[] = [];
  for (const r of results) {
    issues.push(...r.issues);
    checks.push(...r.checks);
  }

  return { issues, checks };
}
