/**
 * Disclosure Execution Validator — shared, configuration-driven module
 *
 * Validates Buyer/Seller signatures, signature dates, and initials for all
 * disclosure forms. Each disclosure only defines which execution fields are
 * required via DisclosureExecutionConfig.
 *
 * Content checks (advisory text, property address, inspection details, etc.)
 * remain in form-specific validators. This module handles ONLY execution.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type RequirementLevel = 'required' | 'optional' | 'not_present';

export type ExecutionMarkType =
  | 'handwritten'
  | 'electronic'
  | 'typed_text'
  | 'blank'
  | 'unreadable';

export type PartyRole = 'buyer' | 'seller';

export interface RoleExecutionRule {
  /** Number of printed fields available on the form. */
  slots: number;
  signatures: RequirementLevel;
  signatureDates: RequirementLevel;
  initials: RequirementLevel;
}

export interface DisclosurePageRule {
  pageNumber: number;
  /** Example: "FHDA PAGE 2 OF 2" */
  expectedPageLabel: string;
  buyer: RoleExecutionRule;
  seller: RoleExecutionRule;
}

export interface DisclosureExecutionConfig {
  formType: string;
  formTitle: string;
  expectedPageCount: number;
  pages: DisclosurePageRule[];
}

export interface DisclosureValidationContext {
  expectedBuyers: number | null;
  expectedSellers: number | null;
  expectedBuyerNames?: string[] | null;
  expectedSellerNames?: string[] | null;
}

export interface ExtractedExecutionSlot {
  slotNumber: number;
  markPresent: boolean;
  markText: string | null;
  markType: ExecutionMarkType;
  /** Used for signatures. Null for initials. */
  datePresent: boolean | null;
  date: string | null;
  dateReadable: boolean | null;
}

export interface ExtractedPartyExecution {
  signatures: ExtractedExecutionSlot[];
  initials: ExtractedExecutionSlot[];
}

export interface ExtractedDisclosurePage {
  pageNumber: number;
  detectedPageLabel: string | null;
  isCorrectPage: boolean;
  buyer: ExtractedPartyExecution;
  seller: ExtractedPartyExecution;
}

export interface DisclosureExecutionExtraction {
  formType: string;
  formTitle: string | null;
  formRevision: string | null;
  isCorrectForm: boolean;
  pages: ExtractedDisclosurePage[];
}

export interface ExecutionValidationIssue {
  code: string;
  message: string;
  severity: 'blocker' | 'warning';
  formType: string;
  pageNumber: number | null;
  role: PartyRole | null;
  slotNumber: number | null;
  fieldType: 'document' | 'page' | 'signature' | 'signature_date' | 'initials';
}

export interface DisclosureExecutionValidationResult {
  formType: string;
  valid: boolean;
  manualReviewRequired: boolean;
  blockers: ExecutionValidationIssue[];
  warnings: ExecutionValidationIssue[];
  summary: {
    missingBuyerSignatures: number;
    missingSellerSignatures: number;
    missingBuyerSignatureDates: number;
    missingSellerSignatureDates: number;
    missingBuyerInitials: number;
    missingSellerInitials: number;
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const EMPTY_ROLE_RULE: RoleExecutionRule = {
  slots: 0,
  signatures: 'not_present',
  signatureDates: 'not_present',
  initials: 'not_present',
};

function normalizeCodePart(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function getExpectedPartyCount(role: PartyRole, context: DisclosureValidationContext): number | null {
  return role === 'buyer' ? context.expectedBuyers : context.expectedSellers;
}

function getRoleDisplayName(role: PartyRole): string {
  return role === 'buyer' ? 'Buyer' : 'Seller';
}

function getExtractedRole(page: ExtractedDisclosurePage, role: PartyRole): ExtractedPartyExecution {
  return role === 'buyer' ? page.buyer : page.seller;
}

function getPageRuleForRole(pageRule: DisclosurePageRule, role: PartyRole): RoleExecutionRule {
  return pageRule[role] ?? EMPTY_ROLE_RULE;
}

function findSlot(slots: ExtractedExecutionSlot[], slotNumber: number): ExtractedExecutionSlot | undefined {
  return slots.find((slot) => slot.slotNumber === slotNumber);
}

function createIssue(params: {
  config: DisclosureExecutionConfig;
  severity: 'blocker' | 'warning';
  pageNumber: number | null;
  role: PartyRole | null;
  slotNumber: number | null;
  fieldType: ExecutionValidationIssue['fieldType'];
  suffix: string;
  message: string;
}): ExecutionValidationIssue {
  const codeParts = [
    normalizeCodePart(params.config.formType),
    params.pageNumber === null ? null : `P${params.pageNumber}`,
    params.role === null ? null : params.role.toUpperCase(),
    params.slotNumber === null ? null : String(params.slotNumber),
    normalizeCodePart(params.suffix),
  ].filter(Boolean);

  return {
    code: codeParts.join('-'),
    message: params.message,
    severity: params.severity,
    formType: params.config.formType,
    pageNumber: params.pageNumber,
    role: params.role,
    slotNumber: params.slotNumber,
    fieldType: params.fieldType,
  };
}

// ─── Config validation ────────────────────────────────────────────────────────

function validateConfig(config: DisclosureExecutionConfig): void {
  if (!config.formType.trim()) throw new Error('Disclosure formType is required.');
  if (!config.formTitle.trim()) throw new Error(`Disclosure formTitle is required for ${config.formType}.`);
  if (config.expectedPageCount < 1) throw new Error(`expectedPageCount must be at least 1 for ${config.formType}.`);

  for (const page of config.pages) {
    for (const role of ['buyer', 'seller'] as const) {
      const rule = page[role];
      if (rule.slots < 0) throw new Error(`${config.formType} page ${page.pageNumber}: slots cannot be negative.`);
      if (rule.signatureDates === 'required' && rule.signatures !== 'required') {
        throw new Error(`${config.formType} page ${page.pageNumber}: ${role} signature dates cannot be required when signatures are not required.`);
      }
      if (rule.signatures === 'not_present' && rule.initials === 'not_present' && rule.slots !== 0) {
        throw new Error(`${config.formType} page ${page.pageNumber}: ${role} slots should be 0 when no execution fields are present.`);
      }
    }
  }
}

// ─── Signature validation ─────────────────────────────────────────────────────

function validateRequiredSignatures(params: {
  config: DisclosureExecutionConfig;
  pageRule: DisclosurePageRule;
  pageExtraction: ExtractedDisclosurePage;
  role: PartyRole;
  expectedCount: number;
  blockers: ExecutionValidationIssue[];
  warnings: ExecutionValidationIssue[];
}): void {
  const { config, pageRule, pageExtraction, role, expectedCount, blockers, warnings } = params;
  const rule = getPageRuleForRole(pageRule, role);
  const extractedRole = getExtractedRole(pageExtraction, role);
  const roleName = getRoleDisplayName(role);

  if (rule.signatures !== 'required') return;

  if (expectedCount > rule.slots) {
    blockers.push(createIssue({
      config, severity: 'blocker', pageNumber: pageRule.pageNumber, role,
      slotNumber: null, fieldType: 'signature', suffix: 'INSUFFICIENT-SIGNATURE-FIELDS',
      message: `${config.formType} page ${pageRule.pageNumber} contains ${rule.slots} ${roleName} signature field(s), but ${expectedCount} ${roleName}(s) are expected.`,
    }));
  }

  const requiredSlots = Math.min(expectedCount, rule.slots);

  for (let slotNumber = 1; slotNumber <= requiredSlots; slotNumber += 1) {
    const slot = findSlot(extractedRole.signatures, slotNumber);

    if (!slot?.markPresent) {
      blockers.push(createIssue({
        config, severity: 'blocker', pageNumber: pageRule.pageNumber, role,
        slotNumber, fieldType: 'signature', suffix: 'SIGNATURE-MISSING',
        message: `${roleName} ${slotNumber} signature missing on ${config.formType} page ${pageRule.pageNumber}.`,
      }));
      continue;
    }

    if (slot.markType === 'unreadable' || (slot.markPresent && slot.markText === null)) {
      warnings.push(createIssue({
        config, severity: 'warning', pageNumber: pageRule.pageNumber, role,
        slotNumber, fieldType: 'signature', suffix: 'SIGNATURE-UNREADABLE',
        message: `${roleName} ${slotNumber} signature is present but unreadable on ${config.formType} page ${pageRule.pageNumber}.`,
      }));
    }

    if (rule.signatureDates === 'required' && slot.datePresent !== true) {
      blockers.push(createIssue({
        config, severity: 'blocker', pageNumber: pageRule.pageNumber, role,
        slotNumber, fieldType: 'signature_date', suffix: 'SIGNATURE-DATE-MISSING',
        message: `${roleName} ${slotNumber} signature date missing on ${config.formType} page ${pageRule.pageNumber}.`,
      }));
    } else if (rule.signatureDates === 'required' && slot.datePresent === true && slot.dateReadable === false) {
      warnings.push(createIssue({
        config, severity: 'warning', pageNumber: pageRule.pageNumber, role,
        slotNumber, fieldType: 'signature_date', suffix: 'SIGNATURE-DATE-UNREADABLE',
        message: `${roleName} ${slotNumber} signature date is present but unreadable on ${config.formType} page ${pageRule.pageNumber}.`,
      }));
    }
  }
}

// ─── Initials validation ──────────────────────────────────────────────────────

function validateRequiredInitials(params: {
  config: DisclosureExecutionConfig;
  pageRule: DisclosurePageRule;
  pageExtraction: ExtractedDisclosurePage;
  role: PartyRole;
  expectedCount: number;
  blockers: ExecutionValidationIssue[];
  warnings: ExecutionValidationIssue[];
}): void {
  const { config, pageRule, pageExtraction, role, expectedCount, blockers, warnings } = params;
  const rule = getPageRuleForRole(pageRule, role);
  const extractedRole = getExtractedRole(pageExtraction, role);
  const roleName = getRoleDisplayName(role);

  if (rule.initials !== 'required') return;

  if (expectedCount > rule.slots) {
    blockers.push(createIssue({
      config, severity: 'blocker', pageNumber: pageRule.pageNumber, role,
      slotNumber: null, fieldType: 'initials', suffix: 'INSUFFICIENT-INITIALS-FIELDS',
      message: `${config.formType} page ${pageRule.pageNumber} contains ${rule.slots} ${roleName} initials field(s), but ${expectedCount} ${roleName}(s) are expected.`,
    }));
  }

  const requiredSlots = Math.min(expectedCount, rule.slots);

  for (let slotNumber = 1; slotNumber <= requiredSlots; slotNumber += 1) {
    const slot = findSlot(extractedRole.initials, slotNumber);

    if (!slot?.markPresent) {
      blockers.push(createIssue({
        config, severity: 'blocker', pageNumber: pageRule.pageNumber, role,
        slotNumber, fieldType: 'initials', suffix: 'INITIALS-MISSING',
        message: `${roleName} ${slotNumber} initials missing on ${config.formType} page ${pageRule.pageNumber}.`,
      }));
      continue;
    }

    if (slot.markType === 'unreadable' || (slot.markPresent && slot.markText === null)) {
      warnings.push(createIssue({
        config, severity: 'warning', pageNumber: pageRule.pageNumber, role,
        slotNumber, fieldType: 'initials', suffix: 'INITIALS-UNREADABLE',
        message: `${roleName} ${slotNumber} initials are present but unreadable on ${config.formType} page ${pageRule.pageNumber}.`,
      }));
    }
  }
}

// ─── Main validation function ─────────────────────────────────────────────────

export function validateDisclosureExecution(
  config: DisclosureExecutionConfig,
  extraction: DisclosureExecutionExtraction,
  context: DisclosureValidationContext,
): DisclosureExecutionValidationResult {
  validateConfig(config);

  const blockers: ExecutionValidationIssue[] = [];
  const warnings: ExecutionValidationIssue[] = [];

  if (!extraction.isCorrectForm) {
    blockers.push(createIssue({
      config, severity: 'blocker', pageNumber: null, role: null, slotNumber: null,
      fieldType: 'document', suffix: 'WRONG-FORM',
      message: `Uploaded document is not C.A.R. Form ${config.formType}.`,
    }));
  }

  for (const pageRule of config.pages) {
    const pageExtraction = extraction.pages.find((page) => page.pageNumber === pageRule.pageNumber);

    if (!pageExtraction) {
      blockers.push(createIssue({
        config, severity: 'blocker', pageNumber: pageRule.pageNumber, role: null, slotNumber: null,
        fieldType: 'page', suffix: 'PAGE-MISSING',
        message: `${config.formType} page ${pageRule.pageNumber} of ${config.expectedPageCount} is missing.`,
      }));
      continue;
    }

    if (!pageExtraction.isCorrectPage) {
      blockers.push(createIssue({
        config, severity: 'blocker', pageNumber: pageRule.pageNumber, role: null, slotNumber: null,
        fieldType: 'page', suffix: 'WRONG-PAGE',
        message: `Expected "${pageRule.expectedPageLabel}" but the supplied page could not be confirmed.`,
      }));
      continue;
    }

    for (const role of ['buyer', 'seller'] as const) {
      const expectedCount = getExpectedPartyCount(role, context);
      const roleRule = getPageRuleForRole(pageRule, role);
      const hasRequiredField = roleRule.signatures === 'required' || roleRule.initials === 'required';

      if (!hasRequiredField) continue;

      if (expectedCount === null) {
        warnings.push(createIssue({
          config, severity: 'warning', pageNumber: pageRule.pageNumber, role,
          slotNumber: null, fieldType: 'document', suffix: 'PARTY-COUNT-UNKNOWN',
          message: `Expected ${getRoleDisplayName(role)} count is unknown. ${config.formType} execution completion cannot be confirmed.`,
        }));
        continue;
      }

      validateRequiredSignatures({ config, pageRule, pageExtraction, role, expectedCount, blockers, warnings });
      validateRequiredInitials({ config, pageRule, pageExtraction, role, expectedCount, blockers, warnings });
    }
  }

  const countIssues = (role: PartyRole, fieldType: ExecutionValidationIssue['fieldType']): number =>
    blockers.filter((issue) => issue.role === role && issue.fieldType === fieldType).length;

  return {
    formType: config.formType,
    valid: blockers.length === 0,
    manualReviewRequired: warnings.length > 0,
    blockers,
    warnings,
    summary: {
      missingBuyerSignatures: countIssues('buyer', 'signature'),
      missingSellerSignatures: countIssues('seller', 'signature'),
      missingBuyerSignatureDates: countIssues('buyer', 'signature_date'),
      missingSellerSignatureDates: countIssues('seller', 'signature_date'),
      missingBuyerInitials: countIssues('buyer', 'initials'),
      missingSellerInitials: countIssues('seller', 'initials'),
    },
  };
}

// ─── LLM extraction prompt ────────────────────────────────────────────────────

const DISCLOSURE_EXECUTION_EXTRACTION_SCHEMA = {
  formType: '<string>',
  formTitle: '<string|null>',
  formRevision: '<string|null>',
  isCorrectForm: '<boolean>',
  pages: [{
    pageNumber: '<number>',
    detectedPageLabel: '<string|null>',
    isCorrectPage: '<boolean>',
    buyer: {
      signatures: [{
        slotNumber: '<number>',
        markPresent: '<boolean>',
        markText: '<string|null>',
        markType: '<"handwritten"|"electronic"|"typed_text"|"blank"|"unreadable">',
        datePresent: '<boolean|null>',
        date: '<string|null>',
        dateReadable: '<boolean|null>',
      }],
      initials: [{
        slotNumber: '<number>',
        markPresent: '<boolean>',
        markText: '<string|null>',
        markType: '<"handwritten"|"electronic"|"typed_text"|"blank"|"unreadable">',
        datePresent: null,
        date: null,
        dateReadable: null,
      }],
    },
    seller: {
      signatures: [{
        slotNumber: '<number>',
        markPresent: '<boolean>',
        markText: '<string|null>',
        markType: '<"handwritten"|"electronic"|"typed_text"|"blank"|"unreadable">',
        datePresent: '<boolean|null>',
        date: '<string|null>',
        dateReadable: '<boolean|null>',
      }],
      initials: [{
        slotNumber: '<number>',
        markPresent: '<boolean>',
        markText: '<string|null>',
        markType: '<"handwritten"|"electronic"|"typed_text"|"blank"|"unreadable">',
        datePresent: null,
        date: null,
        dateReadable: null,
      }],
    },
  }],
};

export function createDisclosureExecutionPrompt(config: DisclosureExecutionConfig): string {
  validateConfig(config);

  return `
ROLE:
You are a California real estate transaction coordinator and OCR/vision
document-execution extraction specialist.

TASK:
Analyze only C.A.R. Form ${config.formType},
"${config.formTitle}".

Extract Buyer and Seller:
- Signatures.
- Signature dates.
- Initials.

Do not decide whether the document passes validation.
Do not create blockers or warnings.
Only report what is visually present.

Return valid JSON only.

FORM CONFIGURATION:
${JSON.stringify(config, null, 2)}

PAGE RULES:
- Identify logical pages using the printed form footer.
- Do not use the absolute PDF page number.
- Return every page listed in the configuration.
- Return every configured signature or initials slot, even when blank.
- Use slot numbers from left to right or top to bottom as printed.
- Do not invent execution fields that are marked "not_present".

VALID SIGNATURES AND INITIALS:
Accept:
- Handwritten marks.
- Drawn marks.
- DocuSign signatures or initials.
- Authentisign signatures or initials.
- Electronic marks inside designated execution fields.
- Typed-looking names or initials when clearly inside an electronic-signature field.

Do not count:
- Printed labels.
- Printed party names outside execution fields.
- DocuSign or Authentisign envelope IDs.
- Completion checkmarks outside execution fields.
- Blank electronic field borders.
- Footer transaction metadata.
- Scan noise, form lines, borders, or shadows.

DATE RULE:
- Pair a date only with the signature on the same designated line.
- Do not use the form revision date.
- Do not use dates from footer metadata.
- Do not use one signer's date for another signer.
- Initials do not have signature dates; return null for initials date fields.

UNREADABLE MARK RULE:
When a deliberate execution mark is present but unreadable:
- markPresent = true
- markText = null
- markType = "unreadable"

GENERAL RULES:
- Match the schema exactly.
- Do not add fields.
- Do not guess party count.
- Do not guess signer identity.
- Return JSON only.

SCHEMA:
${JSON.stringify(DISCLOSURE_EXECUTION_EXTRACTION_SCHEMA, null, 2)}
  `.trim();
}
