import type { ComplianceCheck, ComplianceResult, BlockerOutput, WarningOutput, RuleIssue, RuleResult, ValidationUploadSource } from '../validator.types';
import type { FormExtractionOutput, ExtractionResult } from '../../extractor/extractor.types';
import { DISCLOSURES_BLOCKER_CATALOG, resolveDisclosuresBlocker, resolveDisclosuresWarning } from './disclosures.blocker-catalog';
import { validateDisclosureSignaturesPerForm } from '../signature-validation';
import { validateAvidWithSchema } from '../avid-validation';
import { validateBhiaWithSchema } from '../bhia-validation';
import { validateBiaWithSchema } from '../bia-validation';
import { validateWfaWithSchema } from '../wfa-validation';
import { validateFhdaWithSchema } from '../fhda-validation';
import { validateCcpaWithSchema } from '../ccpa-validation';
import { validateDisclosureExecution, type DisclosureExecutionExtraction, type DisclosureValidationContext, type DisclosureExecutionValidationResult } from '../disclosure-execution-validator';
import { BHIA_CONFIG, BIA_CONFIG, WFA_CONFIG, FHDA_CONFIG, CCPA_CONFIG } from '../disclosure-configs';
import { validateWfaSignatures } from '../wfa-signature-validator';
import { isWfaSignatureExtraction } from '../wfa-signature-extraction';
import type { WfaSignatureExtraction, WfaValidationContext } from '../disclosure-signature-extraction';
import { validateAvidExecution } from '../avid-execution-validator';
import { isAvidExecutionExtraction } from '../avid-execution-extraction-prompt';
import type { AvidExecutionExtraction, AvidValidationContext } from '../avid-execution-extraction';

// ─── Rule helper functions ────────────────────────────────────────────────────

function issue(code: string, fields?: string[], location?: string, message?: string): RuleIssue {
  return { code, fields, location, message };
}

function pass(id: string, cat: ComplianceCheck['category'], form: string, label: string, detail?: string): ComplianceCheck {
  return { ruleId: id, category: cat, formCode: form, phase: 'disclosure', severity: 'info', status: 'pass', label, detail };
}

function skip(id: string, cat: ComplianceCheck['category'], form: string, label: string, detail?: string): ComplianceCheck {
  return { ruleId: id, category: cat, formCode: form, phase: 'disclosure', severity: 'info', status: 'skipped', label, detail };
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

// ─── Shared execution validator adapter ────────────────────────────────────────

/**
 * Convert shared execution validator output to catalog-compatible RuleIssue codes.
 *
 * Shared codes like `BHIA-P1-BUYER-1-SIGNATURE-MISSING` are mapped to
 * existing catalog codes like `BLOCKER_BHIA_BUYER_1_SIGNATURE_MISSING`.
 */
function executionIssuesToRuleIssues(
  result: import('../disclosure-execution-validator').DisclosureExecutionValidationResult,
  uploadSource?: ValidationUploadSource,
): RuleResult {
  const issues: RuleIssue[] = [];
  const checks: ComplianceCheck[] = [];
  const form = result.formType;
  // A Seller Agent upload only carries the seller's own execution — a
  // buyer-role blocker/warning from the shared execution validator is
  // dropped entirely rather than surfaced and then discarded.
  const excludeBuyer = uploadSource === 'seller_agent';

  for (const b of result.blockers) {
    if (excludeBuyer && b.role === 'buyer') continue;
    const mapped = mapExecutionIssueToCatalogCode(form, b);
    if (mapped) issues.push(issue(mapped, b.fieldType === 'signature' || b.fieldType === 'signature_date' ? [`${b.role}_slot_${b.slotNumber}`] : undefined, b.pageNumber ? `Page ${b.pageNumber}` : undefined));
  }

  for (const w of result.warnings) {
    if (excludeBuyer && w.role === 'buyer') continue;
    const mapped = mapExecutionIssueToCatalogCode(form, w);
    if (mapped) issues.push(issue(mapped, w.fieldType === 'signature' || w.fieldType === 'signature_date' ? [`${w.role}_slot_${w.slotNumber}`] : undefined, w.pageNumber ? `Page ${w.pageNumber}` : undefined));
  }

  const remainingBlockers = excludeBuyer ? result.blockers.filter((b) => b.role !== 'buyer') : result.blockers;
  if (result.valid || (excludeBuyer && remainingBlockers.length === 0)) {
    checks.push(pass(`${form.toLowerCase()}_execution_valid`, 'signatures', form, `${form} execution validation passed`));
  }

  return { issues, checks };
}

function mapExecutionIssueToCatalogCode(
  form: string,
  b: import('../disclosure-execution-validator').ExecutionValidationIssue,
): string | null {
  const role = b.role;
  const slot = b.slotNumber;
  const code = b.code.toUpperCase();
  const isWarning = b.severity === 'warning';

  // Document-level
  if (b.fieldType === 'document' && code.includes('WRONG-FORM')) return `BLOCKER_${form}_WRONG_FORM`;
  if (b.fieldType === 'page' && code.includes('PAGE-MISSING')) return `BLOCKER_${form}_PAGE_MISSING`;
  if (b.fieldType === 'page' && code.includes('WRONG-PAGE')) return `BLOCKER_${form}_WRONG_PAGE`;

  // Signature missing
  if (b.fieldType === 'signature' && code.includes('SIGNATURE-MISSING')) {
    if (form === 'WFA' || form === 'FHDA') {
      const partyPrefix = role === 'buyer' ? 'BUYER_TENANT' : 'SELLER_HOUSING_PROVIDER';
      return `BLOCKER_${form}_${partyPrefix}_${slot}_SIGNATURE_MISSING`;
    }
    return `BLOCKER_${form}_BUYER_${slot}_SIGNATURE_MISSING`;
  }

  // Signature date missing
  if (b.fieldType === 'signature_date' && code.includes('SIGNATURE-DATE-MISSING')) {
    if (form === 'WFA' || form === 'FHDA') {
      const partyPrefix = role === 'buyer' ? 'BUYER_TENANT' : 'SELLER_HOUSING_PROVIDER';
      return `BLOCKER_${form}_${partyPrefix}_${slot}_DATE_MISSING`;
    }
    return `BLOCKER_${form}_BUYER_${slot}_DATE_MISSING`;
  }

  // Signature unreadable → always a warning from the shared validator
  if (b.fieldType === 'signature' && code.includes('SIGNATURE-UNREADABLE')) {
    if (form === 'BIA') return 'WARN_BIA_SIGNATURE_UNREADABLE';
    if (form === 'BHIA') return 'WARN_BHIA_SIGNATURE_UNREADABLE';
    if (form === 'WFA') return 'WARN_WFA_SIGNATURE_UNREADABLE';
    // FHDA and others: only return if there's a WARN_ catalog entry
    if (!isWarning) return `BLOCKER_${form}_SIGNATURE_UNREADABLE`;
    return null;
  }

  // Party count unknown → always a warning from the shared validator
  if (code.includes('PARTY-COUNT-UNKNOWN')) {
    if (role === 'buyer') {
      if (form === 'BIA') return 'WARN_BIA_BUYER_COUNT_UNKNOWN';
      if (form === 'BHIA') return 'WARN_BHIA_BUYER_COUNT_UNKNOWN';
      return null;
    }
    return null;
  }

  // Initials missing
  if (b.fieldType === 'initials' && code.includes('INITIALS-MISSING')) {
    return `BLOCKER_${form}_BUYER_${slot}_INITIALS_MISSING`;
  }

  // Fallback: use the shared code directly (will be a no-op if not in catalog)
  return null;
}

function resolveIssues(
  issues: RuleIssue[],
  checks: ComplianceCheck[],
): { blockers: BlockerOutput[]; warnings: WarningOutput[]; checks: ComplianceCheck[] } {
  const blockers: BlockerOutput[] = [];
  const warnings: WarningOutput[] = [];
  const seen = new Set<string>();

  for (const iss of issues) {
    // A composite issue code like "BLOCKER_SPQ_YES_ITEM_MISSING_EXPLANATION:7D" carries
    // a per-item suffix after ':' — its own distinct identity, so a TC override on one
    // item's blocker (e.g. 7D) never silently clears a sibling item's blocker (e.g. 12C)
    // on the same document, since blocker overrides are keyed on this exact code. The
    // catalog itself is still looked up by the shared base code before ':' for its
    // message/category/severity metadata — one catalog entry serves every item.
    const [baseCode] = iss.code.split(':');
    const dedupKey = `${iss.code}::${iss.location ?? ''}::${(iss.fields ?? []).join('|')}`;
    if (seen.has(dedupKey)) continue;

    const entry = DISCLOSURES_BLOCKER_CATALOG[baseCode];
    if (!entry || !entry.effective) continue;
    seen.add(dedupKey);

    if (entry.type === 'blocker') {
      const b = resolveDisclosuresBlocker(baseCode, iss.fields, iss.location, iss.message);
      if (b) blockers.push({ ...b, code: iss.code });
      checks.push({
        ruleId: iss.code,
        category: entry.category,
        formCode: entry.formCode,
        phase: entry.phase,
        severity: 'error',
        status: 'fail',
        label: iss.message ?? entry.message,
        detail: entry.description,
        fields: iss.fields,
        ...(iss.location ? { location: iss.location } : {}),
      });
    } else {
      const w = resolveDisclosuresWarning(baseCode, iss.fields, iss.location, iss.message);
      if (w) warnings.push({ ...w, code: iss.code });
      checks.push({
        ruleId: iss.code,
        category: entry.category,
        formCode: entry.formCode,
        phase: entry.phase,
        severity: 'warning',
        status: 'warning',
        label: iss.message ?? entry.message,
        detail: entry.description,
        fields: iss.fields,
        ...(iss.location ? { location: iss.location } : {}),
      });
    }
  }

  return { blockers, warnings, checks };
}

// ─── Phase 1: Per-form validators ────────────────────────────────────────────

function validateTdsExtraction(data: Record<string, unknown>, uploadSource?: ValidationUploadSource): RuleResult {
  const issues: RuleIssue[] = [];
  const checks: ComplianceCheck[] = [];
  const h = data['header'] as Record<string, unknown> ?? data;
  const secII = data['section_II_sellers_information'] as Record<string, unknown> ?? {};
  const secIIB = secII['B_defects_malfunctions'] as Record<string, unknown> ?? {};

  const propertyAddress = h['property_address'] as string | undefined;
  if (!propertyAddress) {
    issues.push(issue('WARN_TDS_PROPERTY_ADDRESS', ['header.property_address'], 'Header, Page 1'));
  } else {
    checks.push(pass('tds_property_address', 'property', 'TDS', 'TDS property address identified'));
  }

  const awareOfDefects = secIIB['aware_of_defects'] === true;
  if (awareOfDefects) {
    checks.push(pass('tds_defects_disclosed', 'property', 'TDS', 'TDS Section II-B: Seller disclosed defects'));
  }

  const sigResult = validateDisclosureSignaturesPerForm('TDS', data, uploadSource);
  issues.push(...sigResult.issues);
  checks.push(...sigResult.checks);

  const yesResult = validateTdsSectionCYesResponses(data);
  issues.push(...yesResult.issues);
  checks.push(...yesResult.checks);

  const completionResult = validateTdsYesNoCompletion(data);
  issues.push(...completionResult.issues);
  checks.push(...completionResult.checks);

  return { issues, checks };
}

function validateSpqExtraction(data: Record<string, unknown>, uploadSource?: ValidationUploadSource): RuleResult {
  const issues: RuleIssue[] = [];
  const checks: ComplianceCheck[] = [];
  const h = data['header'] as Record<string, unknown> ?? data;

  const propertyAddress = h['property_address'] as string | undefined;
  if (!propertyAddress) {
    issues.push(issue('WARN_SPQ_PROPERTY_ADDRESS', ['header.property_address'], 'Header, Page 1'));
  } else {
    checks.push(pass('spq_property_address', 'property', 'SPQ', 'SPQ property address identified'));
  }

  const sigResult = validateDisclosureSignaturesPerForm('SPQ', data, uploadSource);
  issues.push(...sigResult.issues);
  checks.push(...sigResult.checks);

  const yesResult = validateSpqYesResponses(data);
  issues.push(...yesResult.issues);
  checks.push(...yesResult.checks);

  const completionResult = validateSpqYesNoCompletion(data);
  issues.push(...completionResult.issues);
  checks.push(...completionResult.checks);

  return { issues, checks };
}

function validateNhdExtraction(data: Record<string, unknown>, uploadSource?: ValidationUploadSource): RuleResult {
  const issues: RuleIssue[] = [];
  const checks: ComplianceCheck[] = [];

  const addressCandidates = [
    data['property_address'],
    data['address'],
    (data as Record<string, unknown>)['property'],
    (data as Record<string, unknown>)['site'],
  ];
  const hasAddress = addressCandidates.some(c => c !== undefined && c !== null && c !== '');

  if (!hasAddress) {
    issues.push(issue('WARN_NHD_PROPERTY_ADDRESS', ['property_address'], 'Header, Page 1'));
  } else {
    checks.push(pass('nhd_property_address', 'property', 'NHD', 'NHD property address identified'));
  }

  const sigResult = validateDisclosureSignaturesPerForm('NHD', data, uploadSource);
  issues.push(...sigResult.issues);
  checks.push(...sigResult.checks);

  return { issues, checks };
}

// ─── RR / RRRR per-form validators ─────────────────────────────────────────────

function validateRrExtraction(data: Record<string, unknown>, uploadSource?: ValidationUploadSource): RuleResult {
  const issues: RuleIssue[] = [];
  const checks: ComplianceCheck[] = [];
  const h = data['header'] as Record<string, unknown> ?? data;

  const propertyAddress = h['property_address'] as string | undefined;
  if (!propertyAddress) {
    issues.push(issue('WARN_RR_PROPERTY_ADDRESS', ['header.property_address'], 'Header, Page 1'));
  } else {
    checks.push(pass('rr_property_address', 'property', 'RR', 'RR property address identified'));
  }

  const totalPages = h['total_pages'];
  if (typeof totalPages !== 'number' || !Number.isInteger(totalPages) || totalPages < 1) {
    issues.push(issue('BLOCKER_RR_PAGE_MISSING', ['header.total_pages'], 'Footer, every page'));
  } else {
    checks.push(pass('rr_page_count', 'forms_disclosures', 'RR', 'RR page count identified'));
  }

  const repairItems = data['repair_items'];
  if (!Array.isArray(repairItems) || repairItems.length === 0) {
    issues.push(issue('BLOCKER_RR_MISSING_ITEMS', ['repair_items'], 'Page 1'));
  } else {
    checks.push(pass('rr_repair_items', 'forms_disclosures', 'RR', 'RR lists at least one requested repair item'));
  }

  const sigResult = validateDisclosureSignaturesPerForm('RR', data, uploadSource);
  issues.push(...sigResult.issues);
  checks.push(...sigResult.checks);

  return { issues, checks };
}

function validateRrrrExtraction(data: Record<string, unknown>, uploadSource?: ValidationUploadSource): RuleResult {
  const issues: RuleIssue[] = [];
  const checks: ComplianceCheck[] = [];
  const h = data['header'] as Record<string, unknown> ?? data;

  const propertyAddress = h['property_address'] as string | undefined;
  if (!propertyAddress) {
    issues.push(issue('WARN_RRRR_PROPERTY_ADDRESS', ['header.property_address'], 'Header, Page 1'));
  } else {
    checks.push(pass('rrrr_property_address', 'property', 'RRRR', 'RRRR property address identified'));
  }

  const totalPages = h['total_pages'];
  if (typeof totalPages !== 'number' || !Number.isInteger(totalPages) || totalPages < 1) {
    issues.push(issue('BLOCKER_RRRR_PAGE_MISSING', ['header.total_pages'], 'Footer, every page'));
  } else {
    checks.push(pass('rrrr_page_count', 'forms_disclosures', 'RRRR', 'RRRR page count identified'));
  }

  const responseItems = data['response_items'];
  if (!Array.isArray(responseItems) || responseItems.length === 0) {
    issues.push(issue('BLOCKER_RRRR_MISSING_ITEMS', ['response_items'], 'Page 1'));
  } else {
    checks.push(pass('rrrr_response_items', 'forms_disclosures', 'RRRR', 'RRRR lists at least one response item'));
  }

  const sigResult = validateDisclosureSignaturesPerForm('RRRR', data, uploadSource);
  issues.push(...sigResult.issues);
  checks.push(...sigResult.checks);

  return { issues, checks };
}

// ─── CR-B (Contingency Removal, Buyer) per-form validator ──────────────────────

function validateCrBExtraction(data: Record<string, unknown>, uploadSource?: ValidationUploadSource): RuleResult {
  const issues: RuleIssue[] = [];
  const checks: ComplianceCheck[] = [];
  const h = data['header'] as Record<string, unknown> ?? data;

  const propertyAddress = h['property_address'] as string | undefined;
  if (!propertyAddress) {
    issues.push(issue('WARN_CRB_PROPERTY_ADDRESS', ['header.property_address'], 'Header, Page 1'));
  } else {
    checks.push(pass('crb_property_address', 'property', 'CR-B', 'CR-B property address identified'));
  }

  const totalPages = h['total_pages'];
  if (typeof totalPages !== 'number' || !Number.isInteger(totalPages) || totalPages < 1) {
    issues.push(issue('BLOCKER_CRB_PAGE_MISSING', ['header.total_pages'], 'Footer, every page'));
  } else {
    checks.push(pass('crb_page_count', 'forms_disclosures', 'CR-B', 'CR-B page count identified'));
  }

  const contingenciesRemoved = data['contingencies_removed'] as Record<string, unknown> | undefined;
  const anySelected = !!contingenciesRemoved && (
    contingenciesRemoved['inspection'] === true ||
    contingenciesRemoved['loan'] === true ||
    contingenciesRemoved['appraisal'] === true ||
    contingenciesRemoved['all_contingencies'] === true
  );
  if (!anySelected) {
    issues.push(issue('BLOCKER_CRB_NO_CONTINGENCY_SELECTED', ['contingencies_removed'], 'Page 1'));
  } else {
    checks.push(pass('crb_contingency_selected', 'forms_disclosures', 'CR-B', 'CR-B selects at least one contingency to remove'));
  }

  const sigResult = validateDisclosureSignaturesPerForm('CR-B', data, uploadSource);
  issues.push(...sigResult.issues);
  checks.push(...sigResult.checks);

  return { issues, checks };
}

// ─── VP (Verification of Property Condition) per-form validator ───────────────

function validateVpExtraction(data: Record<string, unknown>, uploadSource?: ValidationUploadSource): RuleResult {
  const issues: RuleIssue[] = [];
  const checks: ComplianceCheck[] = [];
  const h = data['header'] as Record<string, unknown> ?? data;

  const propertyAddress = h['property_address'] as string | undefined;
  if (!propertyAddress) {
    issues.push(issue('WARN_VP_PROPERTY_ADDRESS', ['header.property_address'], 'Header, Page 1'));
  } else {
    checks.push(pass('vp_property_address', 'property', 'VP', 'VP property address identified'));
  }

  const totalPages = h['total_pages'];
  if (typeof totalPages !== 'number' || !Number.isInteger(totalPages) || totalPages < 1) {
    issues.push(issue('BLOCKER_VP_PAGE_MISSING', ['header.total_pages'], 'Footer, every page'));
  } else {
    checks.push(pass('vp_page_count', 'forms_disclosures', 'VP', 'VP page count identified'));
  }

  const propertyVerified = data['property_verified'];
  if (propertyVerified !== true) {
    issues.push(issue('BLOCKER_VP_NOT_VERIFIED', ['property_verified'], 'Page 1'));
  } else {
    checks.push(pass('vp_property_verified', 'forms_disclosures', 'VP', 'VP confirms the property condition has been verified'));
  }

  const sigResult = validateDisclosureSignaturesPerForm('VP', data, uploadSource);
  issues.push(...sigResult.issues);
  checks.push(...sigResult.checks);

  return { issues, checks };
}

// ─── "Yes" item → numbered-explanation matching (shared by TDS/SPQ) ───────────

/**
 * The main disclosure-question number an item belongs to — sub-items
 * normalize to their parent, since a reference only needs to name the main
 * question, not the specific sub-item letter (7A/7B/7D all normalize to 7,
 * 12C normalizes to 12). SPQ codes are number-first (7D → leading digits);
 * TDS codes are letter-first (C5 → trailing digits) — the "C" is this
 * validator's own internal section-disambiguation prefix, never something a
 * real explanation would reference, so only the digits matter.
 */
function extractMainNumber(itemCode: string): string {
  const leading = itemCode.match(/^[0-9]+/);
  if (leading) return leading[0];
  const trailing = itemCode.match(/[0-9]+$/);
  return trailing ? trailing[0] : itemCode;
}

/**
 * The sub-item letter designator for a number-first (SPQ-style) item code —
 * "7D" → "D", "9A1" → "A1", "13B2" → "B2", "7F(1)" → "F1" (parentheses
 * stripped — see `buildSubLetterReferencePattern`, which re-inserts a
 * flexible separator when matching free text). Returns null for codes with
 * no letter designator at all (e.g. plain "5") and for letter-first
 * (TDS-style) codes like "C5", where the leading letter is this validator's
 * own section-disambiguation prefix, not a real per-item designator a real
 * explanation would ever reference on its own.
 */
function extractSubLetter(itemCode: string): string | null {
  const match = itemCode.match(/^[0-9]+([A-Za-z])\(?([0-9]*)\)?$/);
  if (!match) return null;
  return match[2] ? `${match[1]}${match[2]}` : match[1];
}

/**
 * Matches a reference to an item's main question number against free text.
 * A truly bare number with no letter at all (7, 7-, 7:, "Item 7") is treated
 * as maximally general and satisfies ANY item under that number — someone
 * who wrote just "7 -" wasn't trying to be specific. But the moment a letter
 * IS present, it must be THIS item's own letter (and, if this item has one,
 * its own trailing sub-number) — a reference to "6A" must never satisfy
 * "6L", and "7A" must never satisfy "7D", even though they share a section.
 * This is what makes cross-item leakage impossible: one item's explanation
 * can no longer be credited to a sibling item in the same section just
 * because both happen to start with the same section number.
 */
function buildItemReferencePattern(itemCode: string): RegExp {
  const mainNumber = extractMainNumber(itemCode);
  const sub = extractSubLetter(itemCode);
  const prefix = '(?:item\\s+|question\\s+)?';
  const delimiter = '(?:\\s*[-:])';
  let subPart = '';
  if (sub) {
    const parts = sub.match(/^([A-Za-z])([0-9]*)$/)!;
    const numberPart = parts[2] ? `[\\s.\\-]?\\(?${parts[2]}\\)?` : '';
    subPart = `(?:[\\s.\\-]?${parts[1]}${numberPart})?`;
  }
  return new RegExp(`\\b${prefix}${mainNumber}${subPart}${delimiter}`, 'i');
}

/**
 * Matches a bare sub-item letter reference (e.g. "D - ..." or "Item D - ...")
 * against free text — accepted alongside the full item code (see
 * `buildItemReferencePattern`) because a completed form's explanation area
 * is already scoped to one numbered section, so within that section a lone
 * letter unambiguously identifies the item without repeating the main
 * number. Same delimiter/prefix rules as the full-code pattern, and the same
 * `\b` anchor, so a letter embedded in an ordinary word (e.g. "Disclosed -")
 * never matches. When the sub-letter itself carries a trailing sub-number
 * (e.g. "F1" for item "7F(1)"), the number is required — a bare "F -" must
 * NOT satisfy "F1", since "7F" and "7F(1)" are different questions — but the
 * connector between letter and number accepts any common written form
 * ("F1", "F(1)", "F 1", "F-1"), not just the internal concatenated form.
 */
function buildSubLetterReferencePattern(subLetter: string): RegExp {
  const prefix = '(?:item\\s+|question\\s+)?';
  const delimiter = '(?:\\s*[-:])';
  const parts = subLetter.match(/^([A-Za-z])([0-9]*)$/);
  const pattern = parts && parts[2] ? `${parts[1]}[\\s.\\-]?\\(?${parts[2]}\\)?` : subLetter;
  return new RegExp(`\\b${prefix}${pattern}${delimiter}`, 'i');
}

function explanationReferencesItem(explanation: unknown, itemCode: string): boolean {
  if (typeof explanation !== 'string' || explanation.trim() === '') return false;
  if (buildItemReferencePattern(itemCode).test(explanation)) return true;
  const subLetter = extractSubLetter(itemCode);
  return subLetter !== null && buildSubLetterReferencePattern(subLetter).test(explanation);
}

function getByPath(data: Record<string, unknown>, path: string): Record<string, unknown> {
  let cur: unknown = data;
  for (const part of path.split('.')) {
    if (cur == null || typeof cur !== 'object') return {};
    cur = (cur as Record<string, unknown>)[part];
  }
  return (cur as Record<string, unknown>) ?? {};
}

export interface YesItemDef {
  /** Item code as it appears on the real CAR form, e.g. "7D", "9A1", "C16". */
  code: string;
  field: string;
}

export interface YesItemSection {
  /** Dot-path into the extraction data to this section's field object. */
  sectionKey: string;
  page: number;
  explanationField: string;
  items: YesItemDef[];
}

/**
 * Full per-item result for every "Yes"-marked question in the given
 * sections — both passes and blockers, unlike `validateYesItemExplanations`
 * below which only ever emits issues for the failures. Exists so a caller
 * (e.g. a debugging tool, or a richer API response) can see the complete
 * picture of what was checked and why, not just what went wrong.
 */
export interface YesExplanationItemResult {
  formCode: string;
  /** The item's main question number, e.g. "7", "8", or "C" for TDS Section II.C. */
  section: number | string;
  /** Full item code as it appears on the form, e.g. "7D", "C5". */
  item: string;
  markedYes: true;
  explanationFound: boolean;
  /** Verbatim text from this item's own section explanation field, or null when blank. */
  explanationText: string | null;
  /** Same as `section` — the section whose explanation area was actually checked (never a different section's). */
  explanationSection: number | string;
  page: number;
  status: 'pass' | 'blocker';
  /** Present only when status is 'blocker' — the exact composite blocker code (base catalog code + ":" + item). */
  blockerCode?: string;
}

/**
 * The section label to report alongside an item, e.g. "7D" → 7 (SPQ,
 * number-first codes), "C5" → "C" (TDS, letter-first codes — all C-items
 * share one "Section II.C" explanation area, so the letter prefix, not the
 * item's own digits, is the section identity). Deliberately not
 * `extractMainNumber`, which strips the "C" to disambiguate delimiter
 * matching (see `explanationReferencesItem`) — that would collapse "C5"
 * into a bare "5" here and misrepresent TDS's single-section grouping.
 */
function deriveSectionLabel(itemCode: string): number | string {
  const leadingDigits = itemCode.match(/^[0-9]+/);
  if (leadingDigits) return Number(leadingDigits[0]);
  const leadingLetters = itemCode.match(/^[A-Za-z]+/);
  return leadingLetters ? leadingLetters[0] : itemCode;
}

/**
 * Walks every configured item across all sections and reports one result
 * per Yes-marked item — independent from (but using the exact same
 * item-reference matching as) `validateYesItemExplanations`, which derives
 * its RuleIssue/ComplianceCheck output from the same underlying decision.
 * A No-marked item is never reported — the form itself requires no
 * explanation for it.
 */
export function buildYesExplanationResults(
  data: Record<string, unknown>,
  sections: YesItemSection[],
  formCode: string,
  blockerCode: string,
): YesExplanationItemResult[] {
  const results: YesExplanationItemResult[] = [];

  for (const sec of sections) {
    const secData = getByPath(data, sec.sectionKey);
    const explanation = secData[sec.explanationField];
    const explanationText = typeof explanation === 'string' && explanation.trim() !== '' ? explanation : null;

    for (const item of sec.items) {
      if (secData[item.field] !== true) continue;

      const section = deriveSectionLabel(item.code);
      const found = explanationReferencesItem(explanation, item.code);

      results.push({
        formCode,
        section,
        item: item.code,
        markedYes: true,
        explanationFound: found,
        explanationText,
        explanationSection: section,
        page: sec.page,
        status: found ? 'pass' : 'blocker',
        ...(found ? {} : { blockerCode: `${blockerCode}:${item.code}` }),
      });
    }
  }

  return results;
}

function validateYesItemExplanations(
  data: Record<string, unknown>,
  sections: YesItemSection[],
  formCode: string,
  blockerCode: string,
  passCheckId: string,
  passLabel: string,
): RuleResult {
  const issues: RuleIssue[] = [];
  const checks: ComplianceCheck[] = [];
  let sawYes = false;
  let allMatched = true;

  for (const sec of sections) {
    const secData = getByPath(data, sec.sectionKey);
    const explanation = secData[sec.explanationField];

    for (const item of sec.items) {
      if (secData[item.field] !== true) continue;
      sawYes = true;
      if (explanationReferencesItem(explanation, item.code)) continue;

      allMatched = false;
      issues.push(issue(
        `${blockerCode}:${item.code}`,
        [`${sec.sectionKey}.${item.field}`],
        `Page ${sec.page}`,
        `Item ${item.code} is marked Yes, but no corresponding ${item.code} explanation was found in the description section.`,
      ));
    }
  }

  if (sawYes && allMatched) {
    checks.push(pass(passCheckId, 'forms_disclosures', formCode, passLabel));
  }

  return { issues, checks };
}

// ─── Yes/No completion validation (every Yes/No question on TDS/SPQ) ──────────

/**
 * Vision-derived, per-item Yes/No checkbox state — written into the
 * extraction's own `data` object at extraction time (see
 * `applyDisclosureYesExplanationVisionVerification` in form-extractor.ts) as
 * a reserved side-channel, exactly like `extractionWarnings`, rather than as
 * one of the form's own schema fields. A plain boolean field (the form
 * schema's actual shape) cannot represent "neither box marked" or "both
 * boxes marked" — both collapse indistinguishably into `false`/`true` — so
 * this completion check is vision-only by construction: an item absent from
 * this map (vision never ran, or failed for that section) is simply not
 * checked, never guessed at from the collapsed boolean.
 */
export interface YesNoItemCompletionState {
  yesChecked: boolean;
  noChecked: boolean;
  bothMarked: boolean;
  neitherMarked: boolean;
}
export type YesNoCompletionDataState = Record<string, Record<string, YesNoItemCompletionState>>;

function getCompletionState(data: Record<string, unknown>, sectionKey: string, field: string): YesNoItemCompletionState | undefined {
  const state = data['yesNoCompletionState'] as YesNoCompletionDataState | undefined;
  return state?.[sectionKey]?.[field];
}

export interface YesNoCompletionItemResult {
  formCode: string;
  /** The item's main question number/letter, e.g. "7", "8", "A", "B", or "C" for TDS Section II.C. */
  section: number | string;
  /** Full item code as it appears on the form, e.g. "7D", "C5", "A". */
  item: string;
  page: number;
  status: 'pass' | 'blocker';
  issueType?: 'no_answer_selected' | 'both_selected';
  /** Present only when status is 'blocker' — the exact composite blocker code (base catalog code + ":" + item). */
  blockerCode?: string;
}

/**
 * Walks every configured Yes/No item and reports one result per item that
 * has vision-verified checkbox state available — an item vision never
 * covered (no API key configured, or that section's vision call failed) is
 * silently omitted, exactly like `buildYesExplanationResults` omits a
 * No-marked item: this function only ever speaks to what it can actually
 * verify.
 */
export function buildYesNoCompletionResults(
  data: Record<string, unknown>,
  sections: YesItemSection[],
  formCode: string,
  noAnswerBlockerCode: string,
  bothSelectedBlockerCode: string,
): YesNoCompletionItemResult[] {
  const results: YesNoCompletionItemResult[] = [];

  for (const sec of sections) {
    for (const item of sec.items) {
      const state = getCompletionState(data, sec.sectionKey, item.field);
      if (!state) continue;

      const section = deriveSectionLabel(item.code);
      if (state.neitherMarked) {
        results.push({
          formCode, section, item: item.code, page: sec.page, status: 'blocker',
          issueType: 'no_answer_selected', blockerCode: `${noAnswerBlockerCode}:${item.code}`,
        });
      } else if (state.bothMarked) {
        results.push({
          formCode, section, item: item.code, page: sec.page, status: 'blocker',
          issueType: 'both_selected', blockerCode: `${bothSelectedBlockerCode}:${item.code}`,
        });
      } else {
        results.push({ formCode, section, item: item.code, page: sec.page, status: 'pass' });
      }
    }
  }

  return results;
}

function validateYesNoCompletion(
  data: Record<string, unknown>,
  sections: YesItemSection[],
  formCode: string,
  noAnswerBlockerCode: string,
  bothSelectedBlockerCode: string,
  passCheckId: string,
  passLabel: string,
): RuleResult {
  const issues: RuleIssue[] = [];
  const checks: ComplianceCheck[] = [];
  let sawAny = false;
  let allComplete = true;

  const results = buildYesNoCompletionResults(data, sections, formCode, noAnswerBlockerCode, bothSelectedBlockerCode);
  for (const r of results) {
    sawAny = true;
    if (r.status === 'pass') continue;
    allComplete = false;
    const message = r.issueType === 'no_answer_selected'
      ? `Item ${r.item} has no answer selected — neither Yes nor No is marked.`
      : `Item ${r.item} has both Yes and No marked — exactly one answer is required.`;
    issues.push(issue(r.blockerCode!, undefined, `Page ${r.page}`, message));
  }

  if (sawAny && allComplete) {
    checks.push(pass(passCheckId, 'forms_disclosures', formCode, passLabel));
  }

  return { issues, checks };
}

// ─── SPQ Yes-response validation ──────────────────────────────────────────────

export const SPQ_YES_SECTIONS: YesItemSection[] = [
  { sectionKey: 'section_5_documents', page: 1, explanationField: 'explanation_5', items: [
    { code: '5A', field: 'aware_of_documents_prepared_before_ownership' },
    { code: '5B', field: 'aware_of_documents_prepared_during_ownership' },
    { code: '5C', field: 'aware_of_documents_provided_by_others_during_ownership' },
  ] },
  { sectionKey: 'section_6_statutorily_or_contractually_required_or_related', page: 1, explanationField: 'explanation_6', items: [
    { code: '6A', field: 'death_of_occupant_within_3_years' },
    { code: '6B', field: 'government_order_meth_contamination' },
    { code: '6C', field: 'release_of_illegal_controlled_substance' },
    { code: '6D', field: 'property_in_or_adjacent_to_industrial_use_zone' },
    { code: '6E', field: 'property_affected_by_industrial_use_nuisance' },
    { code: '6F', field: 'property_within_1_mile_of_ordnance_location' },
    { code: '6G', field: 'property_is_condominium_or_in_cid' },
    { code: '6H', field: 'insurance_claims_affecting_property_past_5_years' },
    { code: '6I', field: 'matters_affecting_title' },
    { code: '6J', field: 'plumbing_fixtures_non_compliant' },
    { code: '6K', field: 'inspection_reports_on_elevated_elements' },
    { code: '6L', field: 'material_facts_or_defects_not_otherwise_disclosed' },
  ] },
  { sectionKey: 'section_7_repairs_and_alterations', page: 2, explanationField: 'explanation_7', items: [
    { code: '7A', field: 'alterations_modifications_replacements_improvements_remodeling_or_material_repairs' },
    { code: '7B', field: 'alterations_for_energy_water_efficiency_or_renewable_energy' },
    { code: '7C', field: 'ongoing_or_recurring_maintenance' },
    { code: '7D', field: 'property_painted_within_past_12_months' },
    { code: '7E', field: 'property_built_before_1978' },
    { code: '7E1', field: 'renovations_of_lead_based_paint_surfaces_started_or_completed' },
    { code: '7E2', field: 'renovations_done_in_compliance_with_epa_lead_based_paint_rule' },
    { code: '7F', field: 'acquired_property_within_18_months_of_offer' },
    // Printed on the real form as its own sub-item "(1)" under F, not a bare
    // concatenated "F1" — stored with the parenthesis so blocker output and
    // the regression fixture match the form's own numbering exactly.
    { code: '7F(1)', field: 'room_additions_structural_modifications_or_other_alterations_or_repairs_by_contractor' },
  ] },
  { sectionKey: 'section_8_structural_systems_and_appliances', page: 2, explanationField: 'explanation_8', items: [
    { code: '8A', field: 'defects_in_heating_ac_electrical_plumbing_etc' },
    { code: '8B', field: 'existence_of_solar_power_system' },
    // 8C/8D fields were previously misnamed/swapped relative to the real form
    // text ("existence_of_septic..." was labeled 8D and the leasing-related
    // field was labeled 8C) — confirmed against a live fixture where the
    // mismatch caused a checked box to be attributed to the wrong item code.
    { code: '8C', field: 'existence_of_septic_system_well_or_propane_tank' },
    { code: '8D', field: 'leasing_of_water_softener_purifier_or_alarm_system' },
    { code: '8E', field: 'structure_other_than_main_improvement_used_as_dwelling' },
    { code: '8E1', field: 'separate_utilities_and_meters_for_dwelling' },
    { code: '8E2', field: 'dwelling_received_permit_or_government_approval_as_adu' },
  ] },
  { sectionKey: 'section_9_disaster_relief_insurance_or_civil_settlement', page: 2, explanationField: 'explanation_9', items: [
    { code: '9A', field: 'financial_relief_or_assistance_from_damage_or_defect' },
    { code: '9A1', field: 'federal_flood_disaster_assistance_conditioned_on_flood_insurance' },
    { code: '9B', field: 'received_domestic_water_storage_tank_assistance' },
  ] },
  { sectionKey: 'section_10_water_related_and_mold_issues', page: 2, explanationField: 'explanation_10', items: [
    { code: '10A', field: 'water_intrusion_leaks_standing_water_drainage_flooding_etc' },
    { code: '10B', field: 'problem_with_or_infestation_of_mold_mildew_fungus_or_spores' },
    { code: '10C', field: 'rivers_streams_flood_channels_underground_springs_high_watertable_etc' },
  ] },
  { sectionKey: 'section_11_pets_animals_and_pests', page: 3, explanationField: 'explanation_11', items: [
    { code: '11A', field: 'past_or_present_pets' },
    { code: '11B', field: 'past_or_present_problems_with_livestock_wildlife_insects_or_pests' },
    { code: '11C', field: 'past_or_present_odors_urine_feces_discoloration_stains_spots_or_damage' },
    { code: '11D', field: 'past_or_present_treatment_or_eradication_of_pests_or_odors_or_repair_of_damage' },
  ] },
  { sectionKey: 'section_12_boundaries_access_and_property_use_by_others', page: 3, explanationField: 'explanation_12', items: [
    { code: '12A', field: 'surveys_easements_encroachments_or_boundary_disputes' },
    { code: '12B', field: 'use_or_access_to_property_by_anyone_other_than_seller' },
    { code: '12C', field: 'use_of_neighboring_property_by_seller' },
  ] },
  { sectionKey: 'section_13_landscaping_pool_and_spa', page: 3, explanationField: 'explanation_13', items: [
    { code: '13A', field: 'diseases_or_infestations_affecting_trees_plants_or_vegetation' },
    { code: '13B', field: 'operational_sprinklers' },
    { code: '13B2', field: 'areas_with_trees_plants_or_vegetation_not_covered_by_sprinkler_system' },
    { code: '13C', field: 'pool_heater' },
    { code: '13C1', field: 'pool_heater_operational' },
    { code: '13D', field: 'spa_heater' },
    { code: '13D1', field: 'spa_heater_operational' },
    { code: '13E', field: 'past_or_present_defects_leaks_cracks_repairs_or_other_problems_with_sprinklers_pool_spa_etc' },
  ] },
  { sectionKey: 'section_14_condominiums_common_interest_developments_and_other_subdivisions', page: 3, explanationField: 'explanation_14', items: [
    { code: '14A', field: 'property_is_condominium_planned_unit_development_or_common_interest_subdivision' },
    { code: '14B', field: 'homeowners_association_with_authority_over_property' },
    { code: '14C', field: 'common_area_facilities_co_owned' },
    { code: '14D', field: 'ccrs_or_other_deed_restrictions_or_obligations' },
    { code: '14E', field: 'pending_or_proposed_dues_increases_special_assessments_etc' },
    { code: '14F', field: 'ccrs_or_hoa_committee_authority_over_improvements_on_or_to_property' },
    { code: '14F1', field: 'improvements_made_on_or_to_property_inconsistent_with_declaration_or_hoa_requirement' },
    { code: '14F2', field: 'improvements_made_on_or_to_property_without_required_approval_of_hoa_committee' },
  ] },
  { sectionKey: 'section_15_title_ownership_liens_and_legal_claims', page: 3, explanationField: 'explanation_15', items: [
    { code: '15A', field: 'other_person_or_entity_with_ownership_interest' },
    { code: '15B', field: 'leases_options_or_claims_affecting_title_or_use' },
    { code: '15C', field: 'past_present_pending_or_threatened_lawsuits_settlements_mediations_arbitrations_etc' },
    { code: '15D', field: 'features_of_property_shared_in_common_with_adjoining_landowners' },
    { code: '15E', field: 'encroachments_easements_boundary_disputes_or_similar_matters' },
    { code: '15F', field: 'private_transfer_fees_triggered_by_sale' },
    { code: '15G', field: 'pace_lien_or_other_lien_securing_loan_for_alteration_modification_etc' },
    { code: '15H', field: 'cost_of_alteration_modification_etc_paid_by_assessment_on_property_tax_bill' },
  ] },
  { sectionKey: 'section_16_neighbors_neighborhood', page: 4, explanationField: 'explanation_16', items: [
    { code: '16A', field: 'neighborhood_noise_nuisance_or_other_problems_from_sources' },
    { code: '16B', field: 'past_or_present_disputes_or_issues_with_neighbor' },
  ] },
  { sectionKey: 'section_17_governmental', page: 4, explanationField: 'explanation_17', items: [
    { code: '17A', field: 'ongoing_or_contemplated_eminent_domain_condemnation_annexation_or_zoning_change' },
    { code: '17B', field: 'existence_or_pendency_of_rent_control_occupancy_restrictions_improvement_restrictions_or_retrofit_requirements' },
    { code: '17C', field: 'existing_or_contemplated_building_or_use_moratoria' },
    { code: '17D', field: 'state_or_local_requirements_or_restrictions_relating_to_future_replacement_of_existing_gas_powered_appliances' },
    { code: '17E', field: 'current_or_proposed_bonds_assessments_or_fees_not_on_property_tax_bill' },
    { code: '17F', field: 'proposed_construction_reconfiguration_or_closure_of_nearby_government_facilities_or_amenities' },
    { code: '17G', field: 'existing_or_proposed_government_requirements_affecting_property_regarding_vegetation_or_flammable_materials' },
    { code: '17H', field: 'protected_habitat_for_plants_trees_animals_or_insects' },
    { code: '17I', field: 'property_historically_designated_or_within_existing_or_proposed_historic_district' },
    { code: '17J', field: 'water_surcharges_or_penalties_or_restrictions_or_prohibitions_on_wells' },
    { code: '17K', field: 'differences_between_city_name_in_postal_mailing_address_and_city_with_jurisdiction' },
  ] },
  { sectionKey: 'section_18_other', page: 4, explanationField: 'explanation_18', items: [
    { code: '18A', field: 'occupant_of_property_smoking_or_vaping_any_substance' },
    { code: '18B', field: 'residue_from_smoking_tobacco_or_nicotine_products' },
    { code: '18C', field: 'use_of_property_for_or_alterations_due_to_cannabis_cultivation_or_growth' },
    { code: '18D', field: 'property_originally_constructed_as_manufactured_or_mobile_home' },
    { code: '18E', field: 'property_is_tenant_occupied' },
    { code: '18F', field: 'property_was_previously_tenant_occupied_even_if_vacant_now' },
  ] },
  { sectionKey: 'section_19_material_facts', page: 4, explanationField: 'explanation_19', items: [
    { code: '19A', field: 'past_or_present_known_material_facts_or_other_significant_items_affecting_value_or_desirability' },
    { code: '19B', field: 'attached_addendum_contains_explanation_or_additional_comments' },
  ] },
];

function validateSpqYesResponses(data: Record<string, unknown>): RuleResult {
  return validateYesItemExplanations(
    data,
    SPQ_YES_SECTIONS,
    'SPQ',
    'BLOCKER_SPQ_YES_ITEM_MISSING_EXPLANATION',
    'spq_yes_explanations',
    'All SPQ "Yes" responses have corresponding item-numbered explanations',
  );
}

function validateSpqYesNoCompletion(data: Record<string, unknown>): RuleResult {
  return validateYesNoCompletion(
    data,
    SPQ_YES_SECTIONS,
    'SPQ',
    'BLOCKER_SPQ_YES_NO_NO_ANSWER_SELECTED',
    'BLOCKER_SPQ_YES_NO_BOTH_SELECTED',
    'spq_yes_no_completion',
    'Every SPQ Yes/No question has exactly one answer selected',
  );
}

// ─── TDS Section II.C Yes-response validation ─────────────────────────────────

export const TDS_SECTION_C_ITEMS: YesItemSection[] = [
  { sectionKey: 'section_II_sellers_information.C_environmental_and_legal', page: 2, explanationField: 'explanation', items: [
    { code: 'C1', field: '1_environmental_hazards' },
    { code: 'C2', field: '2_shared_features' },
    { code: 'C3', field: '3_encroachments_easements' },
    { code: 'C4', field: '4_room_additions_without_permits' },
    { code: 'C5', field: '5_room_additions_not_to_code' },
    { code: 'C6', field: '6_fill_compacted_otherwise' },
    { code: 'C7', field: '7_settling_slippage_soil_problems' },
    { code: 'C8', field: '8_flooding_drainage_grading' },
    { code: 'C9', field: '9_major_damage_from_disaster' },
    { code: 'C10', field: '10_zoning_violations_setbacks' },
    { code: 'C11', field: '11_neighborhood_noise_nuisances' },
    { code: 'C12', field: '12_ccrs_deed_restrictions' },
    { code: 'C13', field: '13_hoa_authority' },
    { code: 'C14', field: '14_common_areas' },
    { code: 'C15', field: '15_notices_of_abatement_citations' },
    { code: 'C16', field: '16_lawsuits_affecting_property' },
  ] },
];

function validateTdsSectionCYesResponses(data: Record<string, unknown>): RuleResult {
  return validateYesItemExplanations(
    data,
    TDS_SECTION_C_ITEMS,
    'TDS',
    'BLOCKER_TDS_YES_ITEM_MISSING_EXPLANATION',
    'tds_section_c_yes_explanations',
    'All TDS Section II.C "Yes" responses have corresponding item-numbered explanations',
  );
}

// ─── TDS Yes/No completion validation (every Yes/No question on the form) ─────

/**
 * The two standalone Yes/No questions on TDS outside Section II.C — neither
 * is numbered on the real form (Section II.C's items are the only ones with
 * printed numbers), so each is labeled with its own section letter (A/B),
 * mirroring how Section II.C's own items are labeled "C1".."C16". Confirmed
 * against the real rendered form: Section II.A's own concluding question
 * ("Are there... any of the above that are not in operating condition?") and
 * Section II.B's headline question ("Are you aware of any significant
 * defects/malfunctions...") are the ONLY other genuine Yes/No checkbox pairs
 * on TDS — Section I's two boxes and the II.A property-item checklist are
 * each a "check any that apply" multi-select with no paired No box at all,
 * and Section III/IV's Agent's Inspection Disclosure is a three-way single
 * select ("See attached AVID" / "no items" / "following items"), never a
 * Yes/No pair — none of those belong in this completion check.
 */
export const TDS_COMPLETION_ONLY_SECTIONS: YesItemSection[] = [
  { sectionKey: 'section_II_sellers_information.A_property_items', page: 1, explanationField: 'items_not_operating_description', items: [
    { code: 'A', field: 'items_not_operating' },
  ] },
  { sectionKey: 'section_II_sellers_information.B_defects_malfunctions', page: 2, explanationField: 'explanation', items: [
    { code: 'B', field: 'aware_of_defects' },
  ] },
];

/** Every genuine Yes/No question on the TDS form — used only by the completion check, never by the explanation check (Section A/B have their own, differently-shaped description requirements not covered by `explanationReferencesItem`). */
export const TDS_ALL_YES_NO_SECTIONS: YesItemSection[] = [
  ...TDS_COMPLETION_ONLY_SECTIONS,
  ...TDS_SECTION_C_ITEMS,
];

function validateTdsYesNoCompletion(data: Record<string, unknown>): RuleResult {
  return validateYesNoCompletion(
    data,
    TDS_ALL_YES_NO_SECTIONS,
    'TDS',
    'BLOCKER_TDS_YES_NO_NO_ANSWER_SELECTED',
    'BLOCKER_TDS_YES_NO_BOTH_SELECTED',
    'tds_yes_no_completion',
    'Every TDS Yes/No question has exactly one answer selected',
  );
}

// ─── AVID per-form validator ────────────────────────────────────────────────

function validateAvidExtraction(data: Record<string, unknown>, uploadSource?: ValidationUploadSource): RuleResult {
  // Tier 1: Comprehensive validation schema (has form_validation field)
  if (data['form_validation'] && data['form_type'] === 'AVID') {
    return validateAvidWithSchema(data, uploadSource);
  }

  // Tier 2: Enhanced execution extraction with field observations
  // This format provides detailed visual evidence for signature validation
  if (isAvidExecutionExtraction(data)) {
    return avidExecutionExtractionToRuleIssues(data, uploadSource);
  }

  // Tier 3: Fallback to basic validation for legacy extraction format
  const issues: RuleIssue[] = [];
  const checks: ComplianceCheck[] = [];
  const h = data['header'] as Record<string, unknown> ?? data;

  const propertyAddress = h['property_address'] as string | undefined;
  if (!propertyAddress) {
    issues.push(issue('WARN_AVID_PROPERTY_ADDRESS', ['header.property_address'], 'Header, Page 1'));
  } else {
    checks.push(pass('avid_property_address', 'property', 'AVID', 'AVID property address identified'));
  }

  const sigResult = validateDisclosureSignaturesPerForm('AVID', data, uploadSource);
  issues.push(...sigResult.issues);
  checks.push(...sigResult.checks);

  return { issues, checks };
}

/**
 * Convert enhanced AVID execution extraction to RuleResult.
 *
 * Uses the new confidence-based validation logic that avoids false positive
 * missing-signature blockers when electronic signature fields are misaligned.
 */
function avidExecutionExtractionToRuleIssues(extraction: AvidExecutionExtraction, uploadSource?: ValidationUploadSource): RuleResult {
  const issues: RuleIssue[] = [];
  const checks: ComplianceCheck[] = [];

  // Build validation context from extraction
  // Note: In a real implementation, these would come from the transaction
  // For now, we use reasonable defaults
  const context: AvidValidationContext = {
    expectedBuyerCount: null, // Unknown - will trigger count unknown warning
    expectedAgentName: null,
    expectedBuyerNames: null,
  };

  // Run the enhanced validation
  const result = validateAvidExecution(extraction, context, uploadSource);

  // Convert blockers to RuleIssue format
  for (const blocker of result.blockers) {
    issues.push(issue(blocker.code, blocker.fieldId ? [blocker.fieldId] : undefined));
  }

  // Convert warnings to RuleIssue format
  for (const warning of result.warnings) {
    issues.push(issue(warning.code, warning.fieldId ? [warning.fieldId] : undefined));
  }

  // Add compliance checks
  checks.push(pass('avid_form_present', 'forms_disclosures', 'AVID', 'AVID present in disclosure packet'));

  if (result.valid) {
    checks.push(pass('avid_execution_complete', 'signatures', 'AVID', 'AVID execution fields complete'));
  }

  return { issues, checks };
}

function validateBhiaExtraction(data: Record<string, unknown>, uploadSource?: ValidationUploadSource): RuleResult {
  // Check if this is the comprehensive validation schema (has form_validation field)
  if (data['form_validation'] && data['form_type'] === 'BHIA') {
    return validateBhiaWithSchema(data, uploadSource);
  }

  // Check if this is the new shared execution extraction format
  if (data['formType'] === 'BHIA' && Array.isArray(data['pages'])) {
    return executionIssuesToRuleIssues(
      validateDisclosureExecution(BHIA_CONFIG, data as unknown as import('../disclosure-execution-validator').DisclosureExecutionExtraction, {
        expectedBuyers: 1,
        expectedSellers: null,
      }),
      uploadSource,
    );
  }

  // Fallback: validate from standard extraction output via shared module
  const extraction: DisclosureExecutionExtraction = {
    formType: 'BHIA',
    formTitle: null,
    formRevision: null,
    isCorrectForm: true,
    pages: [{
      pageNumber: 1,
      detectedPageLabel: null,
      isCorrectPage: true,
      buyer: {
        signatures: buildBuyerSignatureSlots(data),
        initials: [],
      },
      seller: { signatures: [], initials: [] },
    }],
  };

  const context: DisclosureValidationContext = {
    expectedBuyers: 1,
    expectedSellers: null,
  };

  const execResult = validateDisclosureExecution(BHIA_CONFIG, extraction, context);
  const execIssues = executionIssuesToRuleIssues(execResult, uploadSource);

  // Content checks (not covered by execution validator)
  const contentChecks: ComplianceCheck[] = [];
  contentChecks.push(pass('bhia_form_present', 'forms_disclosures', 'BHIA', 'BHIA present in disclosure packet'));

  const acknowledgesAdvisory = data['acknowledges_advisory'];
  if (acknowledgesAdvisory === true) {
    contentChecks.push(pass('bhia_acknowledges_advisory', 'forms_disclosures', 'BHIA', 'Buyer acknowledges receipt and understanding of the advisory'));
  }

  return { issues: execIssues.issues, checks: [...execIssues.checks, ...contentChecks] };
}

function buildBuyerSignatureSlots(data: Record<string, unknown>): import('../disclosure-execution-validator').ExtractedExecutionSlot[] {
  const buyerSignatures = data['buyer_signatures'];
  if (!Array.isArray(buyerSignatures)) return [];

  return buyerSignatures.map((sig: unknown, idx: number) => {
    const s = sig as Record<string, unknown>;
    return {
      slotNumber: idx + 1,
      markPresent: s['buyer_name'] != null || s['date'] != null,
      markText: (s['buyer_name'] as string) ?? null,
      markType: s['buyer_name'] ? ('handwritten' as const) : ('blank' as const),
      datePresent: s['date'] != null,
      date: (s['date'] as string) ?? null,
      dateReadable: s['date'] != null,
    };
  });
}

function validateBiaExtraction(data: Record<string, unknown>, uploadSource?: ValidationUploadSource): RuleResult {
  // Check if this is the comprehensive validation schema (has form_validation field)
  if (data['form_validation'] && data['form_type'] === 'BIA') {
    return validateBiaWithSchema(data, uploadSource);
  }

  // Check if this is the new shared execution extraction format
  if (data['formType'] === 'BIA' && Array.isArray(data['pages'])) {
    return executionIssuesToRuleIssues(
      validateDisclosureExecution(BIA_CONFIG, data as unknown as import('../disclosure-execution-validator').DisclosureExecutionExtraction, {
        expectedBuyers: 1,
        expectedSellers: null,
      }),
      uploadSource,
    );
  }

  // Fallback: validate from standard extraction output via shared module
  const buyerAck = data['buyer_acknowledgement'] as Record<string, unknown> | undefined;
  const extraction: DisclosureExecutionExtraction = {
    formType: 'BIA',
    formTitle: null,
    formRevision: null,
    isCorrectForm: true,
    pages: [
      { pageNumber: 1, detectedPageLabel: null, isCorrectPage: true, buyer: { signatures: [], initials: [] }, seller: { signatures: [], initials: [] } },
      {
        pageNumber: 2,
        detectedPageLabel: null,
        isCorrectPage: true,
        buyer: {
          signatures: buyerAck ? [
            {
              slotNumber: 1,
              markPresent: buyerAck['buyer_1_signed'] === true,
              markText: null,
              markType: buyerAck['buyer_1_signed'] === true ? ('handwritten' as const) : ('blank' as const),
              datePresent: buyerAck['buyer_1_signature_date'] != null,
              date: (buyerAck['buyer_1_signature_date'] as string) ?? null,
              dateReadable: buyerAck['buyer_1_signature_date'] != null,
            },
            {
              slotNumber: 2,
              markPresent: buyerAck['buyer_2_signed'] === true,
              markText: null,
              markType: buyerAck['buyer_2_signed'] === true ? ('handwritten' as const) : ('blank' as const),
              datePresent: buyerAck['buyer_2_signature_date'] != null,
              date: (buyerAck['buyer_2_signature_date'] as string) ?? null,
              dateReadable: buyerAck['buyer_2_signature_date'] != null,
            },
          ] : [],
          initials: [],
        },
        seller: { signatures: [], initials: [] },
      },
    ],
  };

  const context: DisclosureValidationContext = {
    expectedBuyers: 1,
    expectedSellers: null,
  };

  const execResult = validateDisclosureExecution(BIA_CONFIG, extraction, context);
  const execIssues = executionIssuesToRuleIssues(execResult, uploadSource);

  // Content checks
  const contentChecks: ComplianceCheck[] = [];
  contentChecks.push(pass('bia_form_present', 'forms_disclosures', 'BIA', 'BIA present in disclosure packet'));

  return { issues: execIssues.issues, checks: [...execIssues.checks, ...contentChecks] };
}

function validateWfaExtraction(data: Record<string, unknown>, uploadSource?: ValidationUploadSource): RuleResult {
  // Tier 1: Comprehensive validation schema (has form_validation field)
  if (data['form_validation'] && data['form_type'] === 'WFA') {
    return validateWfaWithSchema(data, uploadSource);
  }

  // Tier 2: Enhanced signature extraction with field observations
  // This format provides detailed visual evidence for signature validation
  if (isWfaSignatureExtraction(data)) {
    return wfaSignatureExtractionToRuleIssues(data, uploadSource);
  }

  // Tier 3: Shared execution extraction format
  if (data['formType'] === 'WFA' && Array.isArray(data['pages'])) {
    return executionIssuesToRuleIssues(
      validateDisclosureExecution(WFA_CONFIG, data as unknown as import('../disclosure-execution-validator').DisclosureExecutionExtraction, {
        expectedBuyers: 1,
        expectedSellers: 1,
      }),
      uploadSource,
    );
  }

  // Tier 4: Fallback - validate from standard extraction output via shared module
  const extraction: DisclosureExecutionExtraction = {
    formType: 'WFA',
    formTitle: null,
    formRevision: null,
    isCorrectForm: true,
    pages: [{
      pageNumber: 1,
      detectedPageLabel: null,
      isCorrectPage: true,
      buyer: {
        signatures: buildWfaSignatureSlots(data, 'buyer_signatures', 'buyer_name'),
        initials: [],
      },
      seller: {
        signatures: buildWfaSignatureSlots(data, 'seller_signatures', 'seller_name'),
        initials: [],
      },
    }],
  };

  const context: DisclosureValidationContext = {
    expectedBuyers: 1,
    expectedSellers: 1,
  };

  const execResult = validateDisclosureExecution(WFA_CONFIG, extraction, context);
  const execIssues = executionIssuesToRuleIssues(execResult, uploadSource);

  // Content checks
  const contentChecks: ComplianceCheck[] = [];
  contentChecks.push(pass('wfa_form_present', 'forms_disclosures', 'WFA', 'WFA present in disclosure packet'));

  const acknowledgesAdvisory = data['acknowledges_advisory'];
  if (acknowledgesAdvisory === true) {
    contentChecks.push(pass('wfa_acknowledges_advisory', 'forms_disclosures', 'WFA', 'Parties acknowledge receipt of the Wire Fraud Advisory'));
  } else {
    contentChecks.push(pass('wfa_acknowledges_advisory', 'forms_disclosures', 'WFA', 'Wire Fraud Advisory present (acknowledgment not confirmed)'));
  }

  return { issues: execIssues.issues, checks: [...execIssues.checks, ...contentChecks] };
}

/**
 * Convert enhanced WFA signature extraction to RuleResult.
 *
 * Uses the new confidence-based validation logic that avoids false positive
 * missing-signature blockers when electronic signature fields are misaligned.
 */
function wfaSignatureExtractionToRuleIssues(extraction: WfaSignatureExtraction, uploadSource?: ValidationUploadSource): RuleResult {
  const issues: RuleIssue[] = [];
  const checks: ComplianceCheck[] = [];

  // Build validation context from extraction
  // Note: In a real implementation, these would come from the transaction
  // For now, we use reasonable defaults
  const context: WfaValidationContext = {
    expectedBuyerTenantCount: null, // Unknown - will trigger count unknown warning
    expectedSellerHousingProviderCount: null,
    expectedBuyerTenantNames: null,
    expectedSellerHousingProviderNames: null,
  };

  // Run the enhanced validation
  const result = validateWfaSignatures(extraction, context, uploadSource);

  // Convert blockers to RuleIssue format
  for (const blocker of result.blockers) {
    issues.push(issue(blocker.code, blocker.fieldId ? [blocker.fieldId] : undefined));
  }

  // Convert warnings to RuleIssue format
  for (const warning of result.warnings) {
    issues.push(issue(warning.code, warning.fieldId ? [warning.fieldId] : undefined));
  }

  // Add pass check if valid
  if (result.valid) {
    checks.push(pass('wfa_signature_validation_passed', 'signatures', 'WFA', 'WFA signature validation passed'));
  }

  // Add manual review check if needed
  if (result.manualReviewRequired) {
    checks.push(pass('wfa_manual_review_required', 'signatures', 'WFA', 'WFA requires manual review'));
  }

  return { issues, checks };
}

function buildWfaSignatureSlots(
  data: Record<string, unknown>,
  sigArrayKey: string,
  nameKey: string,
): import('../disclosure-execution-validator').ExtractedExecutionSlot[] {
  const sigs = data[sigArrayKey];
  if (!Array.isArray(sigs)) return [];

  return sigs.map((sig: unknown, idx: number) => {
    const s = sig as Record<string, unknown>;
    const name = (s[nameKey] as string | null) ?? null;
    const date = (s['date'] as string | null) ?? null;
    return {
      slotNumber: idx + 1,
      markPresent: name != null || date != null,
      markText: name,
      markType: name ? ('handwritten' as const) : ('blank' as const),
      datePresent: date != null,
      date,
      dateReadable: date != null,
    };
  });
}

function validateFhdaExtraction(data: Record<string, unknown>, uploadSource?: ValidationUploadSource): RuleResult {
  // Check if this is the comprehensive validation schema (has form_validation field)
  if (data['form_validation'] && data['form_type'] === 'FHDA') {
    return validateFhdaWithSchema(data, uploadSource);
  }

  // Check if this is the new shared execution extraction format
  if (data['formType'] === 'FHDA' && Array.isArray(data['pages'])) {
    return executionIssuesToRuleIssues(
      validateDisclosureExecution(FHDA_CONFIG, data as unknown as import('../disclosure-execution-validator').DisclosureExecutionExtraction, {
        expectedBuyers: 1,
        expectedSellers: 1,
      }),
      uploadSource,
    );
  }

  // Fallback: validate from standard extraction output via shared module
  // FHDA extraction produces flat date fields under signatures.*
  const sigs = data['signatures'] as Record<string, unknown> | undefined ?? {};

  const extraction: DisclosureExecutionExtraction = {
    formType: 'FHDA',
    formTitle: null,
    formRevision: null,
    isCorrectForm: true,
    pages: [
      { pageNumber: 1, detectedPageLabel: null, isCorrectPage: true, buyer: { signatures: [], initials: [] }, seller: { signatures: [], initials: [] } },
      {
        pageNumber: 2,
        detectedPageLabel: null,
        isCorrectPage: true,
        buyer: {
          signatures: buildFhdaFlatSignatureSlots(sigs, 'buyer_tenant'),
          initials: [],
        },
        seller: {
          signatures: buildFhdaFlatSignatureSlots(sigs, 'seller_housing_provider'),
          initials: [],
        },
      },
    ],
  };

  const context: DisclosureValidationContext = {
    expectedBuyers: 1,
    expectedSellers: 1,
  };

  const execResult = validateDisclosureExecution(FHDA_CONFIG, extraction, context);
  const execIssues = executionIssuesToRuleIssues(execResult, uploadSource);

  // Content checks
  const contentChecks: ComplianceCheck[] = [];
  contentChecks.push(pass('fhda_form_present', 'forms_disclosures', 'FHDA', 'FHDA present in disclosure packet'));

  const sections = data['sections'] as Record<string, unknown> | undefined;
  if (sections) {
    const sectionCount = Object.values(sections).filter((v) => v === true).length;
    if (sectionCount > 0) {
      contentChecks.push(pass('fhda_sections_present', 'forms_disclosures', 'FHDA', `${sectionCount} advisory section(s) present`));
    }
  }

  return { issues: execIssues.issues, checks: [...execIssues.checks, ...contentChecks] };
}

function buildFhdaFlatSignatureSlots(
  sigs: Record<string, unknown>,
  rolePrefix: string,
): import('../disclosure-execution-validator').ExtractedExecutionSlot[] {
  const slots: import('../disclosure-execution-validator').ExtractedExecutionSlot[] = [];

  for (let i = 1; i <= 2; i++) {
    const dateKey = `${rolePrefix}_${i}_date`;
    const date = (sigs[dateKey] as string | null) ?? null;
    // FHDA always has signature lines; the standard extraction only returns dates.
    // markPresent=true always so the shared validator checks datePresent, not signature.
    slots.push({
      slotNumber: i,
      markPresent: true,
      markText: null,
      markType: 'handwritten',
      datePresent: date != null,
      date,
      dateReadable: date != null,
    });
  }

  return slots;
}

// ─── CCPA helpers ─────────────────────────────────────────────────────────────

function readNullablePositiveInteger(value: unknown): number | null {
  if (typeof value === 'number' && value > 0) return value;
  return null;
}

function ccpaExecutionIssuesToRuleIssues(
  result: DisclosureExecutionValidationResult,
): RuleResult {
  const issues: RuleIssue[] = [];
  const checks: ComplianceCheck[] = [];

  for (const blocker of result.blockers) {
    if (blocker.fieldType === 'signature' && blocker.slotNumber === 1) {
      issues.push(issue('BLOCKER_CCPA_PARTY_1_SIGNATURE_MISSING', [], 'Page 1 — Acknowledgment'));
      continue;
    }
    if (blocker.fieldType === 'signature' && blocker.slotNumber === 2) {
      issues.push(issue('BLOCKER_CCPA_PARTY_2_SIGNATURE_MISSING', [], 'Page 1 — Acknowledgment'));
      continue;
    }
    if (blocker.fieldType === 'signature_date' && blocker.slotNumber === 1) {
      issues.push(issue('BLOCKER_CCPA_PARTY_1_DATE_MISSING', [], 'Page 1 — Acknowledgment'));
      continue;
    }
    if (blocker.fieldType === 'signature_date' && blocker.slotNumber === 2) {
      issues.push(issue('BLOCKER_CCPA_PARTY_2_DATE_MISSING', [], 'Page 1 — Acknowledgment'));
      continue;
    }
    if (blocker.fieldType === 'page') {
      issues.push(issue('BLOCKER_CCPA_PAGE_MISSING', [], 'Page 1 — Form identity'));
      continue;
    }
    if (blocker.fieldType === 'document') {
      issues.push(issue('BLOCKER_CCPA_WRONG_FORM', [], 'Form identity'));
    }
  }

  for (const warning of result.warnings) {
    if (warning.code.includes('PARTY-COUNT-UNKNOWN')) {
      issues.push(issue('WARN_CCPA_SIGNER_COUNT_UNKNOWN', [], 'Page 1 — Acknowledgment'));
    } else if (warning.fieldType === 'signature_date') {
      issues.push(issue('WARN_CCPA_DATE_UNREADABLE', [], 'Page 1 — Acknowledgment'));
    } else {
      issues.push(issue('WARN_CCPA_SIGNATURE_UNREADABLE', [], 'Page 1 — Acknowledgment'));
    }
  }

  if (result.valid) {
    checks.push(
      pass('ccpa_execution_complete', 'signatures', 'CCPA', 'Required CCPA acknowledgments are signed and dated'),
    );
  }

  return { issues, checks };
}

function buildCcpaExecutionExtractionFromFlatData(
  data: Record<string, unknown>,
): DisclosureExecutionExtraction {
  const sigs = data['signatures'] as Record<string, unknown> | undefined ?? {};
  const party1Sig = sigs['party_1_signature'];
  const party2Sig = sigs['party_2_signature'];
  const party1SigPresent = sigs['party_1_signature_present'];
  const party2SigPresent = sigs['party_2_signature_present'];
  const party1Date = (sigs['party_1_signature_date'] as string | null) ?? null;
  const party2Date = (sigs['party_2_signature_date'] as string | null) ?? null;

  return {
    formType: 'CCPA',
    formTitle: null,
    formRevision: null,
    isCorrectForm: true,
    pages: [{
      pageNumber: 1,
      detectedPageLabel: null,
      isCorrectPage: true,
      buyer: {
        signatures: [
          {
            slotNumber: 1,
            markPresent: party1SigPresent === true || (typeof party1Sig === 'string' && party1Sig.length > 0) || party1Date != null,
            markText: typeof party1Sig === 'string' ? party1Sig : null,
            markType: party1Sig != null ? ('handwritten' as const) : ('blank' as const),
            datePresent: party1Date != null,
            date: party1Date,
            dateReadable: party1Date != null,
          },
          {
            slotNumber: 2,
            markPresent: party2SigPresent === true || (typeof party2Sig === 'string' && party2Sig.length > 0) || party2Date != null,
            markText: typeof party2Sig === 'string' ? party2Sig : null,
            markType: party2Sig != null ? ('handwritten' as const) : ('blank' as const),
            datePresent: party2Date != null,
            date: party2Date,
            dateReadable: party2Date != null,
          },
        ],
        initials: [],
      },
      seller: { signatures: [], initials: [] },
    }],
  };
}

// ─── CCPA per-form validator ──────────────────────────────────────────────────

function validateCcpaExtraction(data: Record<string, unknown>): RuleResult {
  // Tier 1: Comprehensive CCPA schema.
  if (data['form_type'] === 'CCPA' && data['form_validation']) {
    return validateCcpaWithSchema(data);
  }

  // Tier 2: Shared execution format.
  // CCPA generic signer fields are placed in the buyer execution channel.
  if (data['formType'] === 'CCPA' && Array.isArray(data['pages'])) {
    const expectedSignerCount = readNullablePositiveInteger(
      data['expectedSignerCount'] ?? data['expected_signer_count'],
    );
    const result = validateDisclosureExecution(
      CCPA_CONFIG,
      data as unknown as DisclosureExecutionExtraction,
      {
        // Generic acknowledging-party count.
        expectedBuyers: expectedSignerCount,
        // Do not require a separate Seller section.
        expectedSellers: 0,
      },
    );
    return ccpaExecutionIssuesToRuleIssues(result);
  }

  // Tier 3: Flat signature-only fallback.
  const expectedSignerCount = readNullablePositiveInteger(data['expected_signer_count']);
  const extraction = buildCcpaExecutionExtractionFromFlatData(data);
  const result = validateDisclosureExecution(CCPA_CONFIG, extraction, {
    expectedBuyers: expectedSignerCount,
    expectedSellers: 0,
  });
  const executionResult = ccpaExecutionIssuesToRuleIssues(result);

  return {
    issues: executionResult.issues,
    checks: [
      ...executionResult.checks,
      pass('ccpa_form_present', 'forms_disclosures', 'CCPA', 'CCPA form is present'),
    ],
  };
}

function validatePerForm(extraction: FormExtractionOutput, uploadSource?: ValidationUploadSource): RuleResult {
  const code = extraction.formCode.toUpperCase();
  const data = extraction.data as Record<string, unknown>;

  switch (code) {
    case 'TDS':
      return validateTdsExtraction(data, uploadSource);
    case 'SPQ':
      return validateSpqExtraction(data, uploadSource);
    case 'NHD':
      return validateNhdExtraction(data, uploadSource);
    case 'RR':
      return validateRrExtraction(data, uploadSource);
    case 'RRRR':
      return validateRrrrExtraction(data, uploadSource);
    case 'CR-B':
      return validateCrBExtraction(data, uploadSource);
    case 'VP':
      return validateVpExtraction(data, uploadSource);
    case 'AVID':
      return validateAvidExtraction(data, uploadSource);
    case 'BHIA':
      return validateBhiaExtraction(data, uploadSource);
    case 'BIA':
      return validateBiaExtraction(data, uploadSource);
    case 'WFA':
      return validateWfaExtraction(data, uploadSource);
    case 'FHDA':
      return validateFhdaExtraction(data, uploadSource);
    case 'CCPA':
      // CCPA's two signer slots are a generic acknowledging-party channel,
      // not a real buyer/seller split (see disclosure-configs.ts) — never
      // suppressed by uploadSource.
      return validateCcpaExtraction(data);
    default: {
      const sigResult = validateDisclosureSignaturesPerForm(code, data, uploadSource);
      if (sigResult.issues.length > 0 || sigResult.checks.length > 0) {
        return sigResult;
      }
      return { issues: [], checks: [] };
    }
  }
}

// ─── Phase 2: Cross-form validators (RPA-TDS-SPQ-NHD) ──────────────────────

interface NormalizedDisclosureField {
  formCode: string;
  propertyAddress: string | null;
  city: string | null;
  county: string | null;
}

function normalizeToDisclosureField(extraction: FormExtractionOutput): NormalizedDisclosureField | null {
  const code = extraction.formCode.toUpperCase();
  const d = extraction.data as Record<string, unknown>;

  if (d['parties'] && d['property'] && d['transaction']) {
    const er = d as unknown as ExtractionResult;
    return {
      formCode: code,
      propertyAddress: er.property.streetAddress,
      city: er.property.city,
      county: er.property.county,
    };
  }

  const h = d['header'] as Record<string, unknown> ?? d;
  const p = d['property'] as Record<string, unknown> ?? d;

  return {
    formCode: code,
    propertyAddress: (h['property_address'] as string) ?? (p['streetAddress'] as string) ?? null,
    city: (h['city'] as string) ?? (p['city'] as string) ?? null,
    county: (h['county'] as string) ?? (p['county'] as string) ?? null,
  };
}

function validateCrossForm(extractions: FormExtractionOutput[]): RuleResult {
  const issues: RuleIssue[] = [];
  const checks: ComplianceCheck[] = [];
  const fields = extractions.map(normalizeToDisclosureField).filter((n): n is NormalizedDisclosureField => n !== null);

  if (fields.length < 2) return { issues, checks };

  const rpa = fields.find((f) => f.formCode === 'RPA');
  if (!rpa) return { issues, checks };

  for (const other of fields) {
    if (other.formCode === 'RPA') continue;

    const addressMatch = rpa.propertyAddress && other.propertyAddress && (
      rpa.propertyAddress.toLowerCase() === other.propertyAddress.toLowerCase() ||
      rpa.propertyAddress.toLowerCase().includes(other.propertyAddress.toLowerCase()) ||
      other.propertyAddress.toLowerCase().includes(rpa.propertyAddress.toLowerCase())
    );

    if (!addressMatch && other.propertyAddress && rpa.propertyAddress) {
      issues.push(issue('WARN_CROSS_PROPERTY_ADDRESS', [`RPA.property.streetAddress`, `${other.formCode}.header.property_address`], 'Cross-form: RPA vs ' + other.formCode));
    }

    const cityMatch = !rpa.city || !other.city ||
      rpa.city.toLowerCase() === other.city.toLowerCase();

    if (!cityMatch) {
      issues.push(issue('WARN_CROSS_PROPERTY_CITY', [`RPA.property.city`, `${other.formCode}.header.city`], 'Cross-form: RPA vs ' + other.formCode));
    }
  }

  return { issues, checks };
}

// ─── Phase 3: Stage-level rules ──────────────────────────────────────────────

function validateDisclosureDeadlines(extractions: FormExtractionOutput[]): RuleResult {
  const issues: RuleIssue[] = [];
  const checks: ComplianceCheck[] = [];

  const rpa = extractions.find((e) => e.formCode.toUpperCase() === 'RPA');
  if (!rpa) {
    checks.push(skip('stage_disclosures_deadlines', 'dates', 'STAGE', 'Disclosure deadline check skipped', 'RPA not available in extractions'));
    return { issues, checks };
  }

  const contractTerms = (rpa.data as Record<string, unknown>)['contractTerms'] as Record<string, unknown> | undefined;
  const disclosuresDueDays = (contractTerms?.['disclosuresDueDays'] as number) ?? null;

  if (disclosuresDueDays == null) {
    issues.push(issue('WARN_DISCLOSURES_DEADLINES', ['contractTerms.disclosuresDueDays'], 'RPA — Contract Terms'));
  } else {
    checks.push(pass('stage_disclosures_deadlines', 'dates', 'STAGE', 'Disclosure due period specified in RPA', `${disclosuresDueDays} days`));
  }

  return { issues, checks };
}

// ─── Public: run all disclosures-stage checks ────────────────────────────────

function buildSummary(
  checks: ComplianceCheck[],
  blockers: BlockerOutput[],
  warnings: WarningOutput[],
): ComplianceResult['summary'] {
  const overallStatus = blockers.length > 0 ? 'non_compliant' : warnings.length > 0 ? 'needs_review' : 'compliant';
  return {
    overallStatus,
    passCount: checks.filter((c) => c.status === 'pass').length,
    failCount: blockers.length,
    warningCount: warnings.length,
    skippedCount: checks.filter((c) => c.status === 'skipped').length,
  };
}

export function validateDisclosuresStage(extractions: FormExtractionOutput[], uploadSource?: ValidationUploadSource): ComplianceResult {
  const results: RuleResult[] = [];

  // Missing-document detection (e.g. "TDS not uploaded") is the checklist's job, not a
  // validation blocker — see TransactionFormTemplatesService. Only content defects on
  // documents that WERE uploaded are validated below.
  for (const extraction of extractions) {
    results.push(validatePerForm(extraction, uploadSource));
  }

  results.push(validateCrossForm(extractions));
  results.push(validateDisclosureDeadlines(extractions));

  const merged = merge(results);
  const { blockers, warnings, checks } = resolveIssues(merged.issues, merged.checks);

  return {
    sourceType: 'llm_extraction',
    hasAcroForm: false,
    acroFieldCount: 0,
    checks,
    blockers,
    warnings,
    summary: buildSummary(checks, blockers, warnings),
    signatureFields: [],
    emptyRequiredAcroFields: [],
  };
}
