import type {
  ComplianceCheck,
  RuleIssue,
  RuleResult,
} from '../validator/validator.types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function issue(code: string, fields?: string[], location?: string): RuleIssue {
  return { code, fields, location };
}

function pass(
  id: string,
  cat: ComplianceCheck['category'],
  form: string,
  label: string,
  detail?: string,
): ComplianceCheck {
  return {
    ruleId: id,
    category: cat,
    formCode: form,
    phase: 'disclosure',
    severity: 'info',
    status: 'pass',
    label,
    detail,
  };
}

function merge(results: RuleResult[]): RuleResult {
  const issues: RuleIssue[] = [];
  const checks: ComplianceCheck[] = [];
  for (const r of results) {
    issues.push(...r.issues);
    checks.push(...r.checks);
  }
  return { issues, checks };
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type CcpaApplicablePartyRole =
  | 'buyer'
  | 'seller'
  | 'landlord'
  | 'tenant'
  | 'mixed'
  | 'unknown';

interface CcpaSignatureSlot {
  signature_present: boolean;
  signature_text: string | null;
  signature_type:
    | 'handwritten'
    | 'electronic'
    | 'typed_text'
    | 'blank'
    | 'unreadable';
  date: string | null;
  date_present: boolean;
  date_readable: boolean | null;
  signer_matches_expected_party: boolean | null;
}

export interface CcpaValidationOutput {
  form_type: 'CCPA' | string;
  form_validation: {
    is_ccpa: boolean;
    form_title: string | null;
    form_revision: string | null;
    expected_page_count: 1;
    logical_page_number: number | null;
    correct_page_label: boolean;
    document_complete: boolean;
    acknowledgement_text_present: boolean;
    advisory_content_present: boolean;
    applicable_party_role: CcpaApplicablePartyRole;
    expected_signer_count: number | null;
    expected_signer_names: string[] | null;
    acknowledgements: {
      party_1: CcpaSignatureSlot;
      party_2: CcpaSignatureSlot;
      valid_required_signature_count: number | null;
      missing_required_signature_count: number | null;
      missing_required_date_count: number | null;
      completion_status:
        | 'complete'
        | 'missing_signature'
        | 'missing_date'
        | 'missing_signature_and_date'
        | 'unknown';
    };
  };
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SIGNATURE_BLOCKERS = {
  1: 'BLOCKER_CCPA_PARTY_1_SIGNATURE_MISSING',
  2: 'BLOCKER_CCPA_PARTY_2_SIGNATURE_MISSING',
} as const;

const DATE_BLOCKERS = {
  1: 'BLOCKER_CCPA_PARTY_1_DATE_MISSING',
  2: 'BLOCKER_CCPA_PARTY_2_DATE_MISSING',
} as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getRoleLabel(role: CcpaApplicablePartyRole): string {
  switch (role) {
    case 'buyer':
      return 'Buyer';
    case 'seller':
      return 'Seller';
    case 'landlord':
      return 'Landlord';
    case 'tenant':
      return 'Tenant';
    case 'mixed':
    case 'unknown':
    default:
      return 'Acknowledging party';
  }
}

// ─── Public validator ─────────────────────────────────────────────────────────

export function validateCcpaWithSchema(
  data: Record<string, unknown>,
): RuleResult {
  const ccpa = data as unknown as CcpaValidationOutput;

  if (!ccpa || ccpa.form_type !== 'CCPA') {
    return {
      issues: [issue('BLOCKER_CCPA_WRONG_FORM', [], 'Form identity')],
      checks: [],
    };
  }

  return merge([
    validateCcpaIdentity(ccpa),
    validateCcpaContent(ccpa),
    validateCcpaAcknowledgements(ccpa),
  ]);
}

// ─── Identity ─────────────────────────────────────────────────────────────────

function validateCcpaIdentity(data: CcpaValidationOutput): RuleResult {
  const issues: RuleIssue[] = [];
  const checks: ComplianceCheck[] = [];
  const validation = data.form_validation;

  if (!validation?.is_ccpa) {
    issues.push(issue('BLOCKER_CCPA_WRONG_FORM', [], 'Form identity'));
    return { issues, checks };
  }

  checks.push(
    pass(
      'ccpa_form_identity',
      'forms_disclosures',
      'CCPA',
      'Form identified as C.A.R. Form CCPA',
    ),
  );

  if (
    validation.logical_page_number !== 1 ||
    !validation.correct_page_label ||
    !validation.document_complete
  ) {
    issues.push(
      issue('BLOCKER_CCPA_PAGE_MISSING', [], 'Page 1 — Form identity'),
    );
  } else {
  checks.push(
    pass(
      'ccpa_page_1_present',
      'forms_disclosures',
      'CCPA',
      'CCPA page 1 of 1 is present',
    ),
  );
  }

  return { issues, checks };
}

// ─── Content ──────────────────────────────────────────────────────────────────

function validateCcpaContent(data: CcpaValidationOutput): RuleResult {
  const issues: RuleIssue[] = [];
  const checks: ComplianceCheck[] = [];
  const validation = data.form_validation;

  if (!validation?.advisory_content_present) {
    issues.push(
      issue('BLOCKER_CCPA_CONTENT_INCOMPLETE', [], 'Page 1 — Advisory content'),
    );
  } else {
    checks.push(
      pass(
        'ccpa_advisory_content',
        'forms_disclosures',
        'CCPA',
        'CCPA advisory content is present',
      ),
    );
  }

  if (!validation?.acknowledgement_text_present) {
    issues.push(
      issue('BLOCKER_CCPA_ACKNOWLEDGMENT_MISSING', [], 'Page 1 — Acknowledgment'),
    );
  } else {
    checks.push(
      pass(
        'ccpa_acknowledgment_present',
        'forms_disclosures',
        'CCPA',
        'CCPA acknowledgment section is present',
      ),
    );
  }

  return { issues, checks };
}

// ─── Acknowledgements ─────────────────────────────────────────────────────────

function validateCcpaAcknowledgements(data: CcpaValidationOutput): RuleResult {
  const issues: RuleIssue[] = [];
  const checks: ComplianceCheck[] = [];
  const validation = data.form_validation;
  const acknowledgements = validation?.acknowledgements;

  if (!acknowledgements) {
    return {
      issues: [
        issue('BLOCKER_CCPA_ACKNOWLEDGMENT_MISSING', [], 'Page 1 — Acknowledgment'),
      ],
      checks,
    };
  }

  const expectedCount = validation.expected_signer_count;
  const roleLabel = getRoleLabel(validation.applicable_party_role);

  if (validation.applicable_party_role === 'unknown') {
    issues.push(issue('WARN_CCPA_ROLE_UNKNOWN', [], 'Page 1 — Acknowledgment'));
  }

  if (expectedCount === null) {
    issues.push(
      issue('WARN_CCPA_SIGNER_COUNT_UNKNOWN', [], 'Page 1 — Acknowledgment'),
    );
    return { issues, checks };
  }

  if (expectedCount > 2) {
    issues.push(
      issue('BLOCKER_CCPA_INSUFFICIENT_SIGNATURE_FIELDS', [], 'Page 1 — Acknowledgment'),
    );
  }

  const requiredSlots = Math.min(expectedCount, 2);

  for (let slotNumber = 1; slotNumber <= requiredSlots; slotNumber += 1) {
    const slot =
      slotNumber === 1
        ? acknowledgements.party_1
        : acknowledgements.party_2;

    const location = `Page 1 — ${roleLabel} ${slotNumber} acknowledgment`;

    if (!slot?.signature_present) {
      issues.push(
        issue(SIGNATURE_BLOCKERS[slotNumber as 1 | 2], [], location),
      );
    } else {
      checks.push(
        pass(
          `ccpa_party_${slotNumber}_signature`,
          'signatures',
          'CCPA',
          `${roleLabel} ${slotNumber} signed the CCPA`,
        ),
      );

      if (slot.signature_type === 'unreadable' || slot.signature_text === null) {
        issues.push(issue('WARN_CCPA_SIGNATURE_UNREADABLE', [], location));
      }

      if (slot.signer_matches_expected_party === false) {
        issues.push(issue('BLOCKER_CCPA_SIGNER_MISMATCH', [], location));
      }
    }

    if (!slot?.date_present) {
      issues.push(
        issue(DATE_BLOCKERS[slotNumber as 1 | 2], [], location),
      );
    } else {
      checks.push(
        pass(
          `ccpa_party_${slotNumber}_date`,
          'signatures',
          'CCPA',
          `${roleLabel} ${slotNumber} signature date is present`,
        ),
      );

      if (slot.date_readable === false) {
        issues.push(issue('WARN_CCPA_DATE_UNREADABLE', [], location));
      }
    }
  }

  return { issues, checks };
}
