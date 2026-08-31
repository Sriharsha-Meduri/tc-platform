/**
 * AVID Execution Validator — Deterministic Validation
 *
 * Validates AVID execution extraction results against transaction context.
 * Uses a confidence-based approach to avoid false positive missing-signature
 * blockers when electronic signature fields are misaligned.
 *
 * Key improvement over basic validation:
 * - Uses three-state outcome: present, missing, manual_review_required
 * - Considers confidence scores, field alignment, and unassigned marks
 * - Only creates missing-signature blockers when confident determination is possible
 * - Optional fields (receipt evidence) never generate blockers
 *
 * AVID execution zones:
 * - Page 1: Buyer initials (2 slots)
 * - Page 2: Buyer initials (2 slots)
 * - Page 3: Inspecting agent signature + date
 * - Page 3: Buyer acknowledgement signatures + dates (2 slots)
 * - Page 3: Optional receipt evidence (must NOT generate blockers)
 */

import type {
  AvidExecutionExtraction,
  AvidValidationContext,
  AvidExecutionFieldObservation,
  AvidExecutionValidationStatus,
  AvidValidationIssue,
  AvidExecutionValidationResult,
} from './avid-execution-extraction';
import type { ValidationUploadSource } from './validator.types';

/** AVID execution zones that belong to the buyer — excluded entirely when uploadSource is 'seller_agent'. Page 3's agent signature (the seller-side execution requirement) and the optional receipt-evidence field are never in this set. */
const BUYER_ZONES = new Set(['page_1_buyer_initials', 'page_2_buyer_initials', 'page_3_buyer_acknowledgement']);

import {
  P1_BUYER_INITIAL_FIELDS,
  P2_BUYER_INITIAL_FIELDS,
  P3_AGENT_SIGNATURE_FIELD,
  P3_BUYER_ACKNOWLEDGEMENT_FIELDS,
  P3_RECEIPT_EVIDENCE_FIELD,
} from './avid-execution-extraction';

// ─── Helper Functions ─────────────────────────────────────────────────────────

/**
 * Normalize a name for comparison by removing non-alphanumeric characters
 * and converting to lowercase.
 */
function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Check if an extracted name likely matches any of the expected names.
 * Uses substring matching to handle minor OCR errors and middle initials.
 */
function namesLikelyMatch(
  extractedName: string,
  expectedNames: string[],
): boolean {
  const extracted = normalizeName(extractedName);

  return expectedNames.some((name) => {
    const expected = normalizeName(name);

    return (
      extracted === expected ||
      extracted.includes(expected) ||
      expected.includes(extracted)
    );
  });
}

/**
 * Determine the validation status of an execution field using the enhanced
 * confidence-based approach.
 *
 * This is the key function that prevents false positive missing-signature
 * blockers by considering:
 * - Manual review flags
 * - Confidence thresholds
 * - Field alignment (between_fields indicates ambiguity)
 * - Unassigned execution marks near this field
 */
function determineSignatureStatus(
  field: AvidExecutionFieldObservation,
  extraction: AvidExecutionExtraction,
): AvidExecutionValidationStatus {
  // Optional fields (receipt evidence) are never required
  if (field.isOptional) {
    return field.markPresent ? 'present' : 'manual_review_required';
  }

  // If signature/initial mark is present and not just metadata, it's valid
  if (field.markPresent && !field.isPrintedMetadataOnly) {
    return field.requiresManualReview
      ? 'manual_review_required'
      : 'present';
  }

  // Check for unassigned marks that might belong to this field
  const relatedUnassignedMark = extraction.unassignedExecutionMarks.some(
    (mark) => mark.nearestFieldId === field.fieldId,
  );

  // Ambiguous cases require manual review
  if (
    field.requiresManualReview ||
    relatedUnassignedMark ||
    field.confidence < 0.7 ||
    field.fieldAlignment === 'between_fields'
  ) {
    return 'manual_review_required';
  }

  // Only confidently determine missing when all conditions are met
  return 'missing';
}

/**
 * Check if we can confidently determine that a signature/initial is missing.
 *
 * This function implements the critical logic improvement:
 * - Not just checking markPresent
 * - Also checking requiresManualReview, confidence, field alignment,
 *   and unassigned execution marks
 *
 * Returns true only when we're confident the signature/initial is truly missing
 * (not just ambiguously placed).
 */
function canConfidentlyDetermineMissing(
  field: AvidExecutionFieldObservation,
  extraction: AvidExecutionExtraction,
): boolean {
  // Optional fields (receipt evidence) are never "missing"
  if (field.isOptional) {
    return false;
  }

  // Must not have a signature/initial mark present
  if (field.markPresent) {
    return false;
  }

  // Must not require manual review
  if (field.requiresManualReview) {
    return false;
  }

  // Must have sufficient confidence
  if (field.confidence < 0.7) {
    return false;
  }

  // Must not be between fields (ambiguous alignment)
  if (field.fieldAlignment === 'between_fields') {
    return false;
  }

  // Must not have an unassigned mark that could belong to this field
  const hasRelatedUnassignedMark = extraction.unassignedExecutionMarks.some(
    (mark) => mark.nearestFieldId === field.fieldId,
  );

  if (hasRelatedUnassignedMark) {
    return false;
  }

  return true;
}

// ─── Field Validation ─────────────────────────────────────────────────────────

/**
 * Validate a single execution field and produce appropriate issues.
 */
function validateField(
  field: AvidExecutionFieldObservation,
  extraction: AvidExecutionExtraction,
  expectedAgentName: string | null | undefined,
  blockers: AvidValidationIssue[],
  warnings: AvidValidationIssue[],
): void {
  const status = determineSignatureStatus(field, extraction);

  switch (status) {
    case 'manual_review_required':
      // Ambiguous case — create warning, not blocker
      warnings.push({
        code: `WARN_AVID_${field.fieldId.toUpperCase().replace(/ /g, '_')}_AMBIGUOUS`,
        severity: 'warning',
        fieldId: field.fieldId,
        message:
          `${field.printedLabel} (${field.zone}) placement is ambiguous ` +
          'and requires manual review.',
      });
      break;

    case 'present':
      // Signature/initial present — check additional conditions

      // Check for overlap with adjacent field
      if (field.overlapsAdjacentField && field.confidence < 0.9) {
        warnings.push({
          code: `WARN_AVID_${field.fieldId.toUpperCase().replace(/ /g, '_')}_OVERLAP`,
          severity: 'warning',
          fieldId: field.fieldId,
          message:
            `${field.printedLabel} (${field.zone}) overlaps an adjacent field ` +
            'and should be manually confirmed.',
        });
      }

      // Check date association (not for initials)
      if (field.zone === 'page_3_agent_signature' || field.zone === 'page_3_buyer_acknowledgement') {
        if (!field.datePresent || !field.dateAssociatedWithThisField) {
          blockers.push({
            code: `BLOCKER_AVID_${field.fieldId.toUpperCase().replace(/ /g, '_')}_DATE_MISSING`,
            severity: 'blocker',
            fieldId: field.fieldId,
            message: `${field.printedLabel} (${field.zone}) date is missing on AVID.`,
          });
        }
      }

      // Check signer name matching for agent signature
      if (field.zone === 'page_3_agent_signature' && expectedAgentName && field.signerName) {
        if (!namesLikelyMatch(field.signerName, [expectedAgentName])) {
          blockers.push({
            code: `BLOCKER_AVID_${field.fieldId.toUpperCase().replace(/ /g, '_')}_SIGNER_MISMATCH`,
            severity: 'blocker',
            fieldId: field.fieldId,
            message:
              `${field.printedLabel} (${field.zone}) signer does not match the expected inspecting agent.`,
          });
        }
      }

      // Check for unreadable signature
      if (field.markPresent && !field.signerName) {
        warnings.push({
          code: `WARN_AVID_${field.fieldId.toUpperCase().replace(/ /g, '_')}_SIGNER_UNREADABLE`,
          severity: 'warning',
          fieldId: field.fieldId,
          message:
            `${field.printedLabel} (${field.zone}) is present, but the signer name is unreadable.`,
        });
      }
      break;

    case 'missing':
      // Only create blocker if we can confidently determine missing
      if (canConfidentlyDetermineMissing(field, extraction)) {
        blockers.push({
          code: `BLOCKER_AVID_${field.fieldId.toUpperCase().replace(/ /g, '_')}_MISSING`,
          severity: 'blocker',
          fieldId: field.fieldId,
          message: `${field.printedLabel} (${field.zone}) is missing on AVID.`,
        });

        // Don't also create missing-date blocker when signature/initial is missing
        // (avoids redundant blockers)
      } else {
        // Cannot confidently determine — treat as ambiguous
        warnings.push({
          code: `WARN_AVID_${field.fieldId.toUpperCase().replace(/ /g, '_')}_AMBIGUOUS`,
          severity: 'warning',
          fieldId: field.fieldId,
          message:
            `${field.printedLabel} (${field.zone}) status is uncertain ` +
            'and requires manual review.',
        });
      }
      break;
  }
}

// ─── Main Validation Function ─────────────────────────────────────────────────

/**
 * Validate AVID execution extraction results against transaction context.
 *
 * This is the main entry point for the enhanced AVID execution validation.
 * It uses the confidence-based approach to avoid false positive blockers.
 *
 * @param extraction - The enhanced execution extraction result from the LLM
 * @param context - Transaction context with expected party counts and names
 * @returns Validation result with blockers, warnings, and manual review flag
 */
export function validateAvidExecution(
  extraction: AvidExecutionExtraction,
  context: AvidValidationContext,
  uploadSource?: ValidationUploadSource,
): AvidExecutionValidationResult {
  const blockers: AvidValidationIssue[] = [];
  const warnings: AvidValidationIssue[] = [];

  // Form-level validation
  if (!extraction.formValidation.isAvid) {
    blockers.push({
      code: 'BLOCKER_AVID_WRONG_FORM',
      severity: 'blocker',
      fieldId: null,
      message: 'Uploaded document is not C.A.R. Form AVID.',
    });

    return {
      valid: false,
      manualReviewRequired: false,
      blockers,
      warnings,
    };
  }

  if (!extraction.formValidation.allPagesPresent) {
    blockers.push({
      code: 'BLOCKER_AVID_PAGE_INCOMPLETE',
      severity: 'blocker',
      fieldId: null,
      message: 'AVID is missing required pages.',
    });
  }

  // Must have exactly 8 fields (7 required + 1 optional receipt evidence)
  if (extraction.fields.length !== 8) {
    blockers.push({
      code: 'BLOCKER_AVID_EXECUTION_FIELDS_INCOMPLETE',
      severity: 'blocker',
      fieldId: null,
      message: 'The AVID extraction must contain exactly eight execution fields.',
    });
  }

  // Validate each field — a Seller Agent upload only carries the seller
  // side's own execution (page 3's agent signature), so buyer-only zones are
  // skipped entirely rather than validated and discarded.
  const fieldsToValidate = uploadSource === 'seller_agent'
    ? extraction.fields.filter((f) => !BUYER_ZONES.has(f.zone))
    : extraction.fields;

  for (const field of fieldsToValidate) {
    validateField(
      field,
      extraction,
      context.expectedAgentName,
      blockers,
      warnings,
    );
  }

  // Unassigned execution marks warning
  if (extraction.unassignedExecutionMarks.length > 0) {
    warnings.push({
      code: 'WARN_AVID_UNASSIGNED_EXECUTION_MARK',
      severity: 'warning',
      fieldId: null,
      message:
        'One or more signatures or dates could not be assigned reliably to an AVID field.',
    });
  }

  return {
    valid: blockers.length === 0,
    manualReviewRequired: warnings.length > 0,
    blockers,
    warnings,
  };
}
