/**
 * WFA Signature Validator — Deterministic Validation
 *
 * Validates WFA signature extraction results against transaction context.
 * Uses a confidence-based approach to avoid false positive missing-signature
 * blockers when electronic signature fields are misaligned between rows.
 *
 * Key improvement over basic validation:
 * - Uses three-state outcome: present, missing, manual_review_required
 * - Considers confidence scores, field alignment, and unassigned marks
 * - Only creates missing-signature blockers when confident determination is possible
 */

import type {
  WfaSignatureExtraction,
  WfaValidationContext,
  SignatureFieldObservation,
  SignatureValidationStatus,
  ValidationIssue,
  WfaValidationResult,
} from './disclosure-signature-extraction';

import { ROLE_FIELDS, ROLE_LABELS } from './disclosure-signature-extraction';
import type { ValidationUploadSource } from './validator.types';

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
 * Determine the validation status of a signature field using the enhanced
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
  field: SignatureFieldObservation,
  extraction: WfaSignatureExtraction,
): SignatureValidationStatus {
  // If signature mark is present and not just metadata, it's valid
  if (field.signatureMarkPresent && !field.isPrintedMetadataOnly) {
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
 * Check if we can confidently determine that a signature is missing.
 *
 * This function implements the critical logic improvement:
 * - Not just checking signatureMarkPresent
 * - Also checking requiresManualReview, confidence, field alignment,
 *   and unassigned execution marks
 *
 * Returns true only when we're confident the signature is truly missing
 * (not just ambiguously placed).
 */
function canConfidentlyDetermineMissing(
  field: SignatureFieldObservation,
  extraction: WfaSignatureExtraction,
): boolean {
  // Must not have a signature mark present
  if (field.signatureMarkPresent) {
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

// ─── Role Validation ──────────────────────────────────────────────────────────

/**
 * Validate signature fields for a specific role (buyer_tenant or seller_housing_provider).
 *
 * For each required slot:
 * 1. Determine signature status (present, missing, manual_review_required)
 * 2. Create appropriate issues based on status
 * 3. Check date association
 * 4. Check signer name matching
 */
function validateRole(params: {
  extraction: WfaSignatureExtraction;
  role: 'buyer_tenant' | 'seller_housing_provider';
  expectedCount: number | null;
  expectedNames: string[] | null | undefined;
  blockers: ValidationIssue[];
  warnings: ValidationIssue[];
}): void {
  const {
    extraction,
    role,
    expectedCount,
    expectedNames,
    blockers,
    warnings,
  } = params;

  const roleLabel = ROLE_LABELS[role];

  // Unknown count warning
  if (expectedCount === null) {
    warnings.push({
      code: `WARN_WFA_${role.toUpperCase()}_COUNT_UNKNOWN`,
      severity: 'warning',
      fieldId: null,
      message:
        `Expected ${roleLabel} count is unknown. ` +
        'Signature completion cannot be confirmed.',
    });

    return;
  }

  // Check if form has enough fields for expected count
  if (expectedCount > 2) {
    blockers.push({
      code: `BLOCKER_WFA_${role.toUpperCase()}_INSUFFICIENT_FIELDS`,
      severity: 'blocker',
      fieldId: null,
      message:
        `WFA contains two ${roleLabel} signature fields, ` +
        `but ${expectedCount} parties are expected.`,
    });
  }

  // Determine required field count (max 2)
  const requiredCount = Math.min(expectedCount, 2);
  const requiredFieldIds = ROLE_FIELDS[role].slice(0, requiredCount);

  // Validate each required field
  for (const fieldId of requiredFieldIds) {
    const field = extraction.fields.find(
      (candidate) => candidate.fieldId === fieldId,
    );

    const slotNumber: 1 | 2 = fieldId.endsWith('_1') ? 1 : 2;

    // Field not extracted at all
    if (!field) {
      blockers.push({
        code: `BLOCKER_WFA_${role.toUpperCase()}_${slotNumber}_FIELD_NOT_EXTRACTED`,
        severity: 'blocker',
        fieldId,
        message: `${roleLabel} ${slotNumber} signature field was not extracted from WFA.`,
      });
      continue;
    }

    // Determine signature status using enhanced logic
    const status = determineSignatureStatus(field, extraction);

    switch (status) {
      case 'manual_review_required':
        // Ambiguous case - create warning, not blocker
        warnings.push({
          code: `WARN_WFA_${role.toUpperCase()}_${slotNumber}_SIGNATURE_AMBIGUOUS`,
          severity: 'warning',
          fieldId,
          message:
            `${roleLabel} ${slotNumber} signature placement is ambiguous ` +
            'and requires manual review.',
        });
        break;

      case 'present':
        // Signature present - check additional conditions

        // Check for overlap with adjacent field
        if (field.overlapsAdjacentField && field.confidence < 0.9) {
          warnings.push({
            code: `WARN_WFA_${role.toUpperCase()}_${slotNumber}_SIGNATURE_OVERLAP`,
            severity: 'warning',
            fieldId,
            message:
              `${roleLabel} ${slotNumber} signature overlaps an adjacent field ` +
              'and should be manually confirmed.',
          });
        }

        // Check date association
        if (!field.datePresent || !field.dateAssociatedWithThisField) {
          blockers.push({
            code: `BLOCKER_WFA_${role.toUpperCase()}_${slotNumber}_DATE_MISSING`,
            severity: 'blocker',
            fieldId,
            message: `${roleLabel} ${slotNumber} signature date is missing on WFA.`,
          });
        }

        // Check signer name matching
        if (expectedNames?.length && field.signerName && !namesLikelyMatch(field.signerName, expectedNames)) {
          blockers.push({
            code: `BLOCKER_WFA_${role.toUpperCase()}_${slotNumber}_SIGNER_MISMATCH`,
            severity: 'blocker',
            fieldId,
            message:
              `${roleLabel} ${slotNumber} signer does not match an expected transaction party.`,
          });
        }

        // Check for unreadable signature
        if (field.signatureMarkPresent && !field.signerName) {
          warnings.push({
            code: `WARN_WFA_${role.toUpperCase()}_${slotNumber}_SIGNER_UNREADABLE`,
            severity: 'warning',
            fieldId,
            message:
              `${roleLabel} ${slotNumber} signature is present, but the signer name is unreadable.`,
          });
        }
        break;

      case 'missing':
        // Only create blocker if we can confidently determine missing
        if (canConfidentlyDetermineMissing(field, extraction)) {
          blockers.push({
            code: `BLOCKER_WFA_${role.toUpperCase()}_${slotNumber}_SIGNATURE_MISSING`,
            severity: 'blocker',
            fieldId,
            message: `${roleLabel} ${slotNumber} signature is missing on WFA.`,
          });

          // Don't also create missing-date blocker when signature is missing
          // (avoids redundant blockers)
        } else {
          // Cannot confidently determine - treat as ambiguous
          warnings.push({
            code: `WARN_WFA_${role.toUpperCase()}_${slotNumber}_SIGNATURE_AMBIGUOUS`,
            severity: 'warning',
            fieldId,
            message:
              `${roleLabel} ${slotNumber} signature status is uncertain ` +
              'and requires manual review.',
          });
        }
        break;
    }
  }
}

// ─── Main Validation Function ─────────────────────────────────────────────────

/**
 * Validate WFA signature extraction results against transaction context.
 *
 * This is the main entry point for the enhanced WFA signature validation.
 * It uses the confidence-based approach to avoid false positive blockers.
 *
 * @param extraction - The enhanced signature extraction result from the LLM
 * @param context - Transaction context with expected party counts and names
 * @returns Validation result with blockers, warnings, and manual review flag
 */
export function validateWfaSignatures(
  extraction: WfaSignatureExtraction,
  context: WfaValidationContext,
  uploadSource?: ValidationUploadSource,
): WfaValidationResult {
  const blockers: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  // Form-level validation
  if (!extraction.formValidation.isWfa) {
    blockers.push({
      code: 'BLOCKER_WFA_WRONG_FORM',
      severity: 'blocker',
      fieldId: null,
      message: 'Uploaded document is not C.A.R. Form WFA.',
    });

    return {
      valid: false,
      manualReviewRequired: false,
      blockers,
      warnings,
    };
  }

  if (!extraction.formValidation.correctPageLabel || !extraction.formValidation.pageComplete) {
    blockers.push({
      code: 'BLOCKER_WFA_PAGE_INCOMPLETE',
      severity: 'blocker',
      fieldId: null,
      message: 'WFA page 1 of 1 is missing or incomplete.',
    });
  }

  // Must have exactly 4 signature fields
  if (extraction.fields.length !== 4) {
    blockers.push({
      code: 'BLOCKER_WFA_EXECUTION_FIELDS_INCOMPLETE',
      severity: 'blocker',
      fieldId: null,
      message: 'The WFA extraction must contain exactly four signature fields.',
    });
  }

  // Validate buyer/tenant signatures — never required for a Seller Agent
  // upload, which only carries the seller/housing-provider side's own
  // execution.
  if (uploadSource !== 'seller_agent') {
    validateRole({
      extraction,
      role: 'buyer_tenant',
      expectedCount: context.expectedBuyerTenantCount,
      expectedNames: context.expectedBuyerTenantNames,
      blockers,
      warnings,
    });
  }

  // Validate seller/housing provider signatures
  validateRole({
    extraction,
    role: 'seller_housing_provider',
    expectedCount: context.expectedSellerHousingProviderCount,
    expectedNames: context.expectedSellerHousingProviderNames,
    blockers,
    warnings,
  });

  // Unassigned execution marks warning
  if (extraction.unassignedExecutionMarks.length > 0) {
    warnings.push({
      code: 'WARN_WFA_UNASSIGNED_EXECUTION_MARK',
      severity: 'warning',
      fieldId: null,
      message:
        'One or more signatures or dates could not be assigned reliably to a WFA field.',
    });
  }

  return {
    valid: blockers.length === 0,
    manualReviewRequired: warnings.length > 0,
    blockers,
    warnings,
  };
}
