import type { ComplianceCheck, ComplianceSummary, ComplianceResult, BlockerOutput, WarningOutput, RuleIssue, RuleResult, ValidationUploadSource } from '../validator.types';
import type { ExtractionResult, FormExtractionOutput, ContractDocumentExtraction, OtherTermsOverrides, ContractContingencyInfo, ContractDocumentExtractedTermsFields, ExtractedContractField, FieldSource, FieldSourceType } from '../../extractor/extractor.types';
import type { FormExtractionResult } from '../../pipeline/pipeline.types';
import { CONTRACT_BLOCKER_CATALOG, resolveContractBlocker, resolveContractWarning, REQUIRED_FORM_REVISIONS } from './contract.blocker-catalog';
import { validateContractChain, detectCounterNumber } from './contract-chain';
import { validateDuplicateDocuments } from './contract-duplicate';

// ─── Rule helper functions ────────────────────────────────────────────────────

function issue(code: string, fields?: string[], location?: string): RuleIssue {
  return { code, fields, location };
}

function pass(id: string, cat: ComplianceCheck['category'], form: string, label: string, detail?: string): ComplianceCheck {
  return { ruleId: id, category: cat, formCode: form, phase: 'contract', severity: 'info', status: 'pass', label, detail };
}

function skip(id: string, cat: ComplianceCheck['category'], form: string, label: string, detail?: string): ComplianceCheck {
  return { ruleId: id, category: cat, formCode: form, phase: 'contract', severity: 'info', status: 'skipped', label, detail };
}

function parseDate(val: string | null | undefined): Date | null {
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

function addDaysToDate(dateStr: string | null, days: number | null): string | null {
  if (!dateStr || !days) return null;
  const d = parseDate(dateStr);
  if (!d) return null;
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Combine multiple RuleResults into one. */
function merge(results: RuleResult[]): RuleResult {
  const issues: RuleIssue[] = [];
  const checks: ComplianceCheck[] = [];
  for (const r of results) {
    issues.push(...r.issues);
    checks.push(...r.checks);
  }
  return { issues, checks };
}
/**
 * Resolve all issues through the catalog.
 *
 * Returns separate `blockers[]` / `warnings[]` for the new clean interface,
 * AND pushes backward-compatible fail/warning entries into `checks[]`
 * so old consumers (web UI formStatus, VoidControls) still work.
 */
function resolveIssues(
  issues: RuleIssue[],
  checks: ComplianceCheck[],
): { blockers: BlockerOutput[]; warnings: WarningOutput[]; checks: ComplianceCheck[] } {
  const blockers: BlockerOutput[] = [];
  const warnings: WarningOutput[] = [];
  const seenBlockers = new Set<string>();
  const seenWarnings = new Set<string>();

  for (const iss of issues) {
    const key = `${iss.code}::${iss.location ?? ''}::${(iss.fields ?? []).join('|')}`;
    if (seenBlockers.has(key) || seenWarnings.has(key)) continue;

    const entry = CONTRACT_BLOCKER_CATALOG[iss.code];
    if (!entry || !entry.effective) continue;

    if (entry.type === 'blocker') {
      seenBlockers.add(key);
      const b = resolveContractBlocker(iss.code, iss.fields, iss.location);
      if (b) blockers.push(b);
      checks.push({
        ruleId: entry.id,
        category: entry.category,
        formCode: entry.formCode,
        phase: entry.phase,
        severity: 'error',
        status: 'fail',
        label: entry.message,
        detail: entry.description,
        fields: iss.fields,
        ...(iss.location ? { location: iss.location } : {}),
      });
    } else {
      seenWarnings.add(key);
      const w = resolveContractWarning(iss.code, iss.fields, iss.location);
      if (w) warnings.push(w);
      checks.push({
        ruleId: entry.id,
        category: entry.category,
        formCode: entry.formCode,
        phase: entry.phase,
        severity: 'warning',
        status: 'warning',
        label: entry.message,
        detail: entry.description,
        fields: iss.fields,
        ...(iss.location ? { location: iss.location } : {}),
      });
    }
  }

  return { blockers, warnings, checks };
}

// ─── Normalization: RPA form-specific → generic ExtractionResult ──────────────

// ── RPA schema adapter ──────────────────────────────────────────────────────

type UnknownRecord = Record<string, unknown>;

const FIELD_SOURCE_TYPES = new Set<FieldSourceType>([
  'typed', 'handwritten', 'checkbox', 'radio', 'pdf_form_field',
  'pdf_text', 'vision', 'printed_default', 'derived', 'unknown',
]);

/**
 * Build an ExtractedContractField from a raw field-schema.util-shaped LLM
 * output object plus the already-computed effective value for that field
 * (the same value that also lands in the legacy flat scalar). `value` is
 * always the effective value — this is what guarantees the flat scalar and
 * `field.value` can never drift (decision D): the flat scalar is later
 * assigned directly from this same `value`, not computed independently.
 * `defaultValue`/`enteredValue`/`sourceType`/`evidence` are purely additive
 * provenance sourced from the raw per-field schema output — they never
 * influence `value`, and `value` never depends on validation/compliance
 * state (only entered/default/override sources feed it, upstream of this
 * function).
 */
function buildField<T>(
  value: T | null,
  raw: UnknownRecord | null | undefined,
  source: FieldSource,
): ExtractedContractField<T> | null {
  if (value == null && !raw) return null;

  const enteredValuePresent = raw?.['entered_value_present'] === true;
  const rawDefault = raw?.['default_value'];
  const rawEntered = raw?.['entered_value'];
  const defaultValue = rawDefault !== undefined && rawDefault !== null ? (rawDefault as T) : null;
  const enteredValue = enteredValuePresent && rawEntered !== undefined && rawEntered !== null ? (rawEntered as T) : null;

  const sourceTypeRaw = raw?.['source_type'];
  const sourceType: FieldSourceType =
    typeof sourceTypeRaw === 'string' && FIELD_SOURCE_TYPES.has(sourceTypeRaw as FieldSourceType)
      ? (sourceTypeRaw as FieldSourceType)
      : 'unknown';

  const evidenceText = typeof raw?.['evidence_text'] === 'string' ? (raw['evidence_text'] as string) : undefined;
  const confidence = typeof raw?.['confidence'] === 'number' ? (raw['confidence'] as number) : undefined;

  return {
    value,
    defaultValue,
    enteredValue,
    sourceType,
    source,
    evidence: evidenceText !== undefined || confidence !== undefined ? { text: evidenceText, confidence } : undefined,
  };
}

/**
 * Build an ExtractedContractField from a triad-style contingency-days row
 * (default_days_after_acceptance / override_days_after_acceptance /
 * days_after_acceptance, plus the 4 sibling provenance keys spliced in by
 * fieldProvenanceKeys()) — the pattern used by RPA page 2's H/J/K/L/N rows,
 * which is deliberately NOT wrapped in fieldSchema() (see
 * field-schema.util.ts's doc comment), so it needs its own reader.
 */
function buildDaysField(
  value: number | null,
  raw: UnknownRecord | null | undefined,
  source: FieldSource,
): ExtractedContractField<number> | null {
  if (value == null && !raw) return null;

  const defaultValue = asNumber(raw?.['default_days_after_acceptance']);
  const enteredValuePresent = raw?.['entered_value_present'] === true;
  const enteredValue = enteredValuePresent ? asNumber(raw?.['override_days_after_acceptance']) : null;

  const sourceTypeRaw = raw?.['source_type'];
  const sourceType: FieldSourceType =
    typeof sourceTypeRaw === 'string' && FIELD_SOURCE_TYPES.has(sourceTypeRaw as FieldSourceType)
      ? (sourceTypeRaw as FieldSourceType)
      : 'unknown';

  const evidenceText = typeof raw?.['evidence_text'] === 'string' ? (raw['evidence_text'] as string) : undefined;
  const confidence = typeof raw?.['confidence'] === 'number' ? (raw['confidence'] as number) : undefined;

  return {
    value,
    defaultValue,
    enteredValue,
    sourceType,
    source,
    evidence: evidenceText !== undefined || confidence !== undefined ? { text: evidenceText, confidence } : undefined,
  };
}

interface RpaExecutionSlot {
  signaturePresent: boolean;
  signatureDate: string | null;
  printedName: string | null;
  authorizedSignerName: string | null;
  authorizedSignerTitle: string | null;
}

interface RpaSchemaView {
  formRevision: string | null;
  formRevisionLabel: string | null;
  datePrepared: string | null;

  buyerNames: string[];
  sellerNames: string[];

  property: {
    streetAddress: string | null;
    city: string | null;
    county: string | null;
    state: string;
    postalCode: string | null;
    apn: string | null;
  };

  agency: {
    sellerBrokerage: string | null;
    sellerBrokerageDre: string | null;
    sellerAgent: string | null;
    sellerAgentDre: string | null;

    buyerBrokerage: string | null;
    buyerBrokerageDre: string | null;
    buyerAgent: string | null;
    buyerAgentDre: string | null;
  };

  purchasePrice: number | null;
  initialDeposit: number | null;
  /** Business days after acceptance the initial deposit must be delivered — RPA §D1. */
  initialDepositBusinessDays: number | null;
  loanAmount: number | null;
  financingType: string | null;
  occupancyType: string | null;

  closeOfEscrowDate: string | null;
  closeOfEscrowDays: number | null;
  expirationDate: string | null;

  buyerSignatureSlots: RpaExecutionSlot[];
  sellerSignatureSlots: RpaExecutionSlot[];

  buyerOfferDate: string | null;
  sellerExecutionDate: string | null;

  sellerCounterOfferAttached: boolean;
  backupOfferAddendumAttached: boolean;
}

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : {};
}

/**
 * Fields built with field-schema.util's fieldSchema()/fieldProvenanceKeys()
 * come back from the LLM as an object ({default_value, entered_value,
 * resolved_value, entered_value_present, ...}) rather than a plain scalar.
 * Every place in this file that reads a raw field value (asString/asNumber/
 * asBoolean below, plus a handful of direct casts) unwraps through here
 * first, so a field gaining provenance never breaks the callers that only
 * want its plain value. Values that are already plain scalars pass through
 * unchanged.
 */
function unwrapFieldValue(value: unknown): unknown {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const r = value as UnknownRecord;
    if ('entered_value_present' in r || 'resolved_value' in r) {
      if (r['entered_value_present'] === true && r['entered_value'] != null) return r['entered_value'];
      if (r['resolved_value'] != null) return r['resolved_value'];
      if (r['default_value'] != null) return r['default_value'];
      return null;
    }
  }
  return value;
}

function asString(value: unknown): string | null {
  const v = unwrapFieldValue(value);
  return typeof v === 'string' && v.trim()
    ? v.trim()
    : null;
}

function asNumber(value: unknown): number | null {
  const v = unwrapFieldValue(value);
  return typeof v === 'number' && Number.isFinite(v)
    ? v
    : null;
}

function asBoolean(value: unknown): boolean | null {
  const v = unwrapFieldValue(value);
  return v === true ? true : v === false ? false : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim());
}

function partyObjectNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => asString(asRecord(item)['fullName']))
    .filter((name): name is string => name !== null);
}

function deduplicateNames(names: Array<string | null>): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const name of names) {
    if (!name) continue;
    const normalized = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(name);
  }
  return result;
}

function latestValidDate(values: Array<string | null>): string | null {
  const valid = values
    .map((value) => ({ value, parsed: parseDate(value) }))
    .filter((entry): entry is { value: string; parsed: Date } => entry.value !== null && entry.parsed !== null)
    .sort((a, b) => b.parsed.getTime() - a.parsed.getTime());
  return valid[0]?.value ?? null;
}

function readExecutionSlot(
  value: unknown,
  printedNameKey: string,
): RpaExecutionSlot {
  const slot = asRecord(value);
  return {
    signaturePresent: slot['signature_present'] === true,
    signatureDate: asString(slot['signature_date']),
    printedName: asString(slot[printedNameKey]),
    authorizedSignerName: asString(slot['legally_authorized_signer_name']),
    authorizedSignerTitle: asString(slot['legally_authorized_signer_title']),
  };
}

function readRpaSchema(data: UnknownRecord): RpaSchemaView {
  const metadata = asRecord(data['form_metadata']);
  const section1 = asRecord(data['section_1_offer']);
  const offerFrom = asRecord(section1['A_offer_from']);
  const property = asRecord(section1['B_property']);
  const section2 = asRecord(data['section_2_agency']);
  const agencyConfirmation = asRecord(section2['B_confirmation']);
  const section3 = asRecord(data['section_3_terms_and_allocation_of_costs_page_1']);
  const purchase = asRecord(section3['A_purchase_price']);
  const closeOfEscrow = asRecord(section3['B_close_of_escrow']);
  const expiration = asRecord(section3['C_expiration_of_offer']);
  const initialDeposit = asRecord(section3['D1_initial_deposit_amount']);
  const firstLoan = asRecord(section3['E1_first_loan']);
  const occupancy = asRecord(section3['E3_occupancy_type']);
  const section32 = asRecord(data['section_32_offer']);
  const buyerSignatureGroup = asRecord(section32['buyer_signatures']);
  const section33 = asRecord(data['section_33_acceptance'] ?? data['seller_acceptance']);
  const acceptanceTerms = asRecord(section33['acceptance_terms']);
  const sellerSignatureGroup = asRecord(section33['seller_signatures']);

  const buyerSignatureSlots: RpaExecutionSlot[] = [
    readExecutionSlot(buyerSignatureGroup['buyer_1'], 'printed_buyer_name'),
    readExecutionSlot(buyerSignatureGroup['buyer_2'], 'printed_buyer_name'),
  ];

  const sellerSignatureSlots: RpaExecutionSlot[] = [
    readExecutionSlot(sellerSignatureGroup['seller_1'], 'printed_seller_name'),
    readExecutionSlot(sellerSignatureGroup['seller_2'], 'printed_seller_name'),
  ];

  // Backward compatibility for the old flat page-16 schema.
  // Only skip fallback when a slot has actual signature evidence (present or dated).
  // A printedName alone is not enough — the per-page extractor may populate the
  // name without detecting the signature, causing false BLOCKER_BUYER_SIGNATURE.
  if (!buyerSignatureSlots.some((slot) => slot.signaturePresent || slot.signatureDate)) {
    const legacy = asRecord(data['seller_acceptance']);
    buyerSignatureSlots[0] = {
      signaturePresent: legacy['buyer_signature_present'] === true,
      signatureDate: asString(legacy['buyer_signature_date']),
      printedName: asString(legacy['buyer_name_signed']),
      authorizedSignerName: null,
      authorizedSignerTitle: null,
    };
  }

  if (!sellerSignatureSlots.some((slot) => slot.signaturePresent || slot.signatureDate)) {
    const legacy = asRecord(data['seller_acceptance']);
    sellerSignatureSlots[0] = {
      signaturePresent: legacy['seller_signature_present'] === true,
      signatureDate: asString(legacy['seller_signature_date']),
      printedName: asString(legacy['seller_name_signed']),
      authorizedSignerName: null,
      authorizedSignerTitle: null,
    };
  }

  const genericParties = asRecord(data['parties']);
  const normalizedParties = asRecord(data['parties']);

  let buyerNames = asStringArray(offerFrom['buyer_names']);
  if (buyerNames.length === 0) buyerNames = asStringArray(genericParties['buyer_names']);
  if (buyerNames.length === 0) buyerNames = partyObjectNames(normalizedParties['buyers']);

  const entityBuyer = asRecord(section32['entity_buyer']);
  if (buyerNames.length === 0 && entityBuyer['entity_buyer_selected'] === true) {
    const entityName = asString(entityBuyer['full_entity_name']);
    if (entityName) buyerNames.push(entityName);
  }

  let sellerNames = deduplicateNames(sellerSignatureSlots.map((slot) => slot.printedName));
  if (sellerNames.length === 0) sellerNames = asStringArray(genericParties['seller_names']);
  if (sellerNames.length === 0) sellerNames = partyObjectNames(normalizedParties['sellers']);

  const entitySeller = asRecord(section33['entity_seller']);
  if (sellerNames.length === 0 && entitySeller['entity_seller_selected'] === true) {
    const entityName = asString(entitySeller['full_entity_name']);
    if (entityName) sellerNames.push(entityName);
  }

  const buyerOfferDate =
    asString(buyerSignatureGroup['latest_buyer_signature_date']) ??
    latestValidDate(buyerSignatureSlots.map((slot) => slot.signatureDate)) ??
    asString(section32['buyer_offer_date']);

  const sellerExecutionDate =
    asString(sellerSignatureGroup['latest_seller_signature_date']) ??
    latestValidDate(sellerSignatureSlots.map((slot) => slot.signatureDate)) ??
    asString(section33['seller_signature_date']);

  let financingType: string | null = null;
  if (purchase['all_cash_checked'] === true) {
    financingType = 'Cash';
  } else if (firstLoan['fha_checked'] === true) {
    financingType = 'FHA';
  } else if (firstLoan['va_checked'] === true) {
    financingType = 'VA';
  } else if (firstLoan['seller_financing_checked'] === true) {
    financingType = 'Seller Financing';
  } else if (firstLoan['conventional_checked'] === true) {
    financingType = 'Conventional';
  } else if (asNumber(firstLoan['loan_amount']) !== null) {
    financingType = 'Conventional';
  }

  let occupancyType: string | null = null;
  if (occupancy['primary_checked'] === true) {
    occupancyType = 'Primary';
  } else if (occupancy['secondary_checked'] === true) {
    occupancyType = 'Secondary';
  } else if (occupancy['investment_checked'] === true) {
    occupancyType = 'Investment';
  }

  const legacyHeader = asRecord(data['header']);
  const legacyAgency = asRecord(data['agency']);

  return {
    formRevision: asString(metadata['form_revision']),
    formRevisionLabel: asString(metadata['form_revision_label']),
    datePrepared: asString(section1['date_prepared']) ?? asString(legacyHeader['date_prepared']),
    buyerNames: deduplicateNames(buyerNames),
    sellerNames: deduplicateNames(sellerNames),
    property: {
      streetAddress: asString(property['street_address']) ?? asString(legacyHeader['property_address']),
      city: asString(property['city']) ?? asString(legacyHeader['city']),
      county: asString(property['county']) ?? asString(legacyHeader['county']),
      state: asString(property['state']) ?? 'California',
      postalCode: asString(property['zip_code']) ?? asString(legacyHeader['zip_code']),
      apn: asString(property['assessor_parcel_number']) ?? asString(legacyHeader['assessor_parcel_number']),
    },
    agency: {
      sellerBrokerage: asString(agencyConfirmation['seller_brokerage_firm']) ?? asString(legacyAgency['seller_brokerage']),
      sellerBrokerageDre: asString(agencyConfirmation['seller_brokerage_license_number']),
      sellerAgent: asString(agencyConfirmation['seller_agent']) ?? asString(legacyAgency['seller_agent']),
      sellerAgentDre: asString(agencyConfirmation['seller_agent_license_number']) ?? asString(legacyAgency['seller_agent_dre']),
      buyerBrokerage: asString(agencyConfirmation['buyer_brokerage_firm']) ?? asString(legacyAgency['buyer_brokerage']),
      buyerBrokerageDre: asString(agencyConfirmation['buyer_brokerage_license_number']),
      buyerAgent: asString(agencyConfirmation['buyer_agent']) ?? asString(legacyAgency['buyer_agent']),
      buyerAgentDre: asString(agencyConfirmation['buyer_agent_license_number']) ?? asString(legacyAgency['buyer_agent_dre']),
    },
    purchasePrice: asNumber(purchase['purchase_price']),
    initialDeposit: asNumber(initialDeposit['deposit_amount']),
    initialDepositBusinessDays: asNumber(initialDeposit['business_days_after_acceptance']),
    loanAmount: asNumber(firstLoan['loan_amount']),
    financingType,
    occupancyType,
    closeOfEscrowDate: asString(closeOfEscrow['close_of_escrow_date']),
    closeOfEscrowDays: asNumber(closeOfEscrow['days_after_acceptance']),
    expirationDate: asString(expiration['expiration_date']),
    buyerSignatureSlots,
    sellerSignatureSlots,
    buyerOfferDate,
    sellerExecutionDate,
    sellerCounterOfferAttached:
      acceptanceTerms['seller_counter_offer_attached'] === true ||
      section33['accepted_subject_to_counter_offer'] === true,
    backupOfferAddendumAttached: acceptanceTerms['backup_offer_addendum_attached'] === true,
  };
}

// ── Signature summary from all parties ───────────────────────────────────────

function normalizePartyName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function namesLikelyMatch(left: string, right: string): boolean {
  const a = normalizePartyName(left);
  const b = normalizePartyName(right);
  return a === b || a.includes(b) || b.includes(a);
}

function findSignatureSlotForParty(
  partyName: string,
  partyIndex: number,
  slots: RpaExecutionSlot[],
): RpaExecutionSlot | undefined {
  const nameMatched = slots.find(
    (slot) => slot.printedName && namesLikelyMatch(partyName, slot.printedName),
  );
  return nameMatched ?? slots[partyIndex];
}

function summarizePartyExecution(
  expectedNames: string[],
  slots: RpaExecutionSlot[],
): {
  allSigned: boolean;
  signedParties: string[];
  missingSignatures: string[];
  missingSignatureDates: string[];
} {
  const signedParties: string[] = [];
  const missingSignatures: string[] = [];
  const missingSignatureDates: string[] = [];

  if (expectedNames.length === 0) {
    const visibleSlots = slots.filter(
      (slot) => slot.signaturePresent || slot.signatureDate || slot.printedName,
    );
    return {
      allSigned: visibleSlots.length > 0 && visibleSlots.every((slot) => slot.signaturePresent && Boolean(slot.signatureDate)),
      signedParties: visibleSlots.filter((slot) => slot.signaturePresent).map((slot, index) => slot.printedName ?? `Signer ${index + 1}`),
      missingSignatures: visibleSlots.filter((slot) => !slot.signaturePresent).map((slot, index) => slot.printedName ?? `Signer ${index + 1}`),
      missingSignatureDates: visibleSlots.filter((slot) => slot.signaturePresent && !slot.signatureDate).map((slot, index) => slot.printedName ?? `Signer ${index + 1}`),
    };
  }

  for (let index = 0; index < expectedNames.length; index += 1) {
    const partyName = expectedNames[index];
    const slot = index < slots.length ? findSignatureSlotForParty(partyName, index, slots) : undefined;

    if (!slot?.signaturePresent) {
      missingSignatures.push(partyName);
      continue;
    }

    signedParties.push(partyName);

    if (!slot.signatureDate) {
      missingSignatureDates.push(partyName);
    }
  }

  return {
    allSigned: missingSignatures.length === 0 && missingSignatureDates.length === 0,
    signedParties,
    missingSignatures,
    missingSignatureDates,
  };
}

/**
 * Resolve the acceptance date from pipeline extractions following the
 * contract negotiation chain: BCO/BMCO > SCO/SMCO > RPA.
 *
 * Walks backward so the latest accepted counter in pipeline order wins.
 * Falls back to RPA seller execution date when no counter offer is found.
 */
export function resolveAcceptanceDate(
  extractions: FormExtractionResult[],
): { date: string; sourceFormCode: string } | null {
  for (let index = extractions.length - 1; index >= 0; index -= 1) {
    const extraction = extractions[index];
    const code = extraction.formCode.toUpperCase();

    if (!['BCO', 'BMCO', 'SCO', 'SMCO'].includes(code)) continue;

    const data = extraction.output?.data;
    if (!data) continue;

    const acceptance = asRecord(data['section_5_acceptance']);
    const date = latestValidDate([
      asString(acceptance['acceptor_1_signature_date']),
      asString(acceptance['acceptor_2_signature_date']),
    ]);

    if (date) {
      return { date, sourceFormCode: code };
    }
  }

  const rpaExtraction = [...extractions]
    .reverse()
    .find((extraction) => extraction.formCode.toUpperCase() === 'RPA');

  if (rpaExtraction?.output?.data) {
    const rpa = readRpaSchema(rpaExtraction.output.data);
    if (rpa.sellerExecutionDate) {
      return { date: rpa.sellerExecutionDate, sourceFormCode: 'RPA' };
    }
  }

  return null;
}

/**
 * Extract a numeric price from free-form text using common price patterns.
 */
function extractPriceFromText(text: string | null | undefined): number | null {
  if (!text) return null;
  const patterns = [
    /purchase\s*price\s*shall\s*be\s*\$?\s*([\d,]+)/i,
    /(?:sales?\s*)?price\s*(?:increased|reduced|changed?|modified?)\s*to\s*\$?\s*([\d,]+)/i,
    /final\s*purchase\s*price[:\s]*\$?\s*([\d,]+)/i,
    /counter\s*price[:\s]*\$?\s*([\d,]+)/i,
    /(?:buyer\s*)?offers?\s*\$?\s*([\d,]+)/i,
    /price\s*to\s*be\s*\$?\s*([\d,]+)/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return parseFloat(m[1].replace(/,/g, ''));
  }
  return null;
}

/**
 * Extract contingency modifications from free-form Other Terms text.
 *
 * The LLM frequently transcribes the raw Other Terms text correctly but
 * does NOT populate the structured other_terms_modifications block.
 * This function provides a robust text-parsing fallback so we don't
 * depend on the LLM doing the secondary analysis step.
 *
 * Only fills fields that are still null in the provided overrides —
 * structured LLM output always wins.
 */
function extractContingencyFromText(
  text: string | null | undefined,
  existing: OtherTermsOverrides,
): void {
  if (!text) return;

  const lower = text.toLowerCase();

  // ── Helper: extract an integer after a contingency label ────
  function dayCount(trigger: string): number | null {
    // Matches phrases like "loan contingency 10 days", "loan contingency to be 10 days",
    // "inspection period of 7 days", "appraisal contingency period 14 days"
    const re = new RegExp(
      `(?:${trigger})[^.]*?\\b(\\d+)\\s*days?\\b`,
      'i',
    );
    const m = lower.match(re);
    return m ? parseInt(m[1], 10) : null;
  }

  // ── Loan contingency ──────────────────────────────────────
  if (existing.loanContingencyDays == null && existing.loanContingencyWaived == null) {
    const days = dayCount('loan\\s*contingency');
    if (days != null) {
      existing.loanContingencyDays = days;
      existing.loanContingencyWaived = false;
    } else if (
      /\bno\s+loan\s+contingency\b/i.test(lower) ||
      /\bloan\s+contingency\s+(?:waived|removed|cancelled)\b/i.test(lower) ||
      /\bloan\s+waived\b/i.test(lower) ||
      /\bbuyer\s+waives\s+loan\s+contingency\b/i.test(lower)
    ) {
      existing.loanContingencyDays = null;
      existing.loanContingencyWaived = true;
    }
  }

  // ── Appraisal contingency ─────────────────────────────────
  if (existing.appraisalContingencyDays == null && existing.appraisalContingencyWaived == null) {
    const days = dayCount('appraisal\\s*contingency');
    if (days != null) {
      existing.appraisalContingencyDays = days;
      existing.appraisalContingencyWaived = false;
    } else if (
      /\bno\s+appraisal\s+contingency\b/i.test(lower) ||
      /\bappraisal\s+contingency\s+(?:waived|removed|cancelled)\b/i.test(lower) ||
      /\bappraisal\s+waived\b/i.test(lower) ||
      /\bbuyer\s+waives\s+appraisal\s+contingency\b/i.test(lower)
    ) {
      existing.appraisalContingencyDays = null;
      existing.appraisalContingencyWaived = true;
    }
  }

  // ── Inspection / investigation contingency ────────────────
  if (existing.inspectionContingencyDays == null) {
    const trigger = 'inspection|investigation|property\\s*investigation|buyer\\s*inspection|due\\s*diligence';
    const days = dayCount(trigger);
    if (days != null) {
      existing.inspectionContingencyDays = days;
    }
  }

  // ── Insurance contingency ─────────────────────────────────
  if (existing.insuranceContingencyDays == null) {
    const days = dayCount('insurance\\s*contingency');
    if (days != null) {
      existing.insuranceContingencyDays = days;
    }
  }

  // ── "All contingencies" ───────────────────────────────────
  const allExcInspection = /\ball\s+contingencies\s+(?:removed|waived|eliminated)\s+except\s+(?:inspection|investigation)\b/i.test(lower);
  if (allExcInspection && existing.loanContingencyWaived == null && existing.loanContingencyDays == null) {
    existing.loanContingencyDays = null;
    existing.loanContingencyWaived = true;
  }
  if (allExcInspection && existing.appraisalContingencyWaived == null && existing.appraisalContingencyDays == null) {
    existing.appraisalContingencyDays = null;
    existing.appraisalContingencyWaived = true;
  }

  // ── General "remove all contingencies" (not except-specific) ──
  const allRemoved = /\ball\s+contingencies\s+(?:removed|waived|eliminated)\b/i.test(lower)
    && !/\bexcept\b/i.test(lower);
  if (allRemoved) {
    if (existing.loanContingencyWaived == null && existing.loanContingencyDays == null) {
      existing.loanContingencyDays = null;
      existing.loanContingencyWaived = true;
    }
    if (existing.appraisalContingencyWaived == null && existing.appraisalContingencyDays == null) {
      existing.appraisalContingencyDays = null;
      existing.appraisalContingencyWaived = true;
    }
  }

  // ── Close of escrow days ────────────────────────────────────────
  if (existing.closeOfEscrowDays == null && existing.closeOfEscrow == null) {
    const m = lower.match(/(?:close\s*of\s*escrow|coe)[^.]*?within\s+(\d+)\s*days?/i);
    if (m) {
      existing.closeOfEscrowDays = parseInt(m[1], 10);
    }
  }
}

/**
 * Extract structured Other Terms overrides from LLM output data.
 *
 * Reads from terms_of_purchase.other_terms_modifications (RPA) or
 * counter_offer_terms.other_terms_modifications (SCO/BCO), and also
 * falls back to the per-page extraction's R_other_terms.modifications.
 */
function extractOtherTermsOverrides(
  data: Record<string, unknown>,
  perPageData?: Record<string, unknown> | null,
): OtherTermsOverrides {
  // Try top-level other_terms_modifications (RPA direct template field)
  let mods = (data['other_terms_modifications'] ?? {}) as Record<string, unknown>;
  // Fallback: terms_of_purchase.other_terms_modifications (RPA nested)
  if (Object.keys(mods).length === 0) {
    const top = (data['terms_of_purchase'] ?? {}) as Record<string, unknown>;
    mods = (top['other_terms_modifications'] ?? {}) as Record<string, unknown>;
  }

  const overrides: OtherTermsOverrides = {
    purchasePrice: asNumber(mods['purchase_price']),
    closeOfEscrow: asString(mods['close_of_escrow_date']),
    closeOfEscrowDays: asNumber(mods['close_of_escrow_days']),
    possession: asString(mods['possession_date']),
    initialDeposit: asNumber(mods['initial_deposit_amount']),
    increasedDeposit: asNumber(mods['increased_deposit_amount']),
    sellerCreditToBuyer: asNumber(mods['seller_credit_amount']),
    loanContingencyWaived: asBoolean(mods['loan_contingency_waived']),
    loanContingencyDays: asNumber(mods['loan_contingency_days']),
    appraisalContingencyWaived: asBoolean(mods['appraisal_contingency_waived']),
    appraisalContingencyDays: asNumber(mods['appraisal_contingency_days']),
    inspectionContingencyDays: asNumber(mods['inspection_contingency_days']),
    sellerDocumentReviewDays: asNumber(mods['seller_document_review_days']),
    titleReviewDays: asNumber(mods['title_review_days']),
    insuranceContingencyDays: asNumber(mods['insurance_contingency_days']),
    hoaReviewDays: asNumber(mods['hoa_review_days']),
    leasedLienedReviewDays: asNumber(mods['leased_liened_review_days']),
    saleOfBuyersProperty: asBoolean(mods['sale_of_buyers_property']),
    buyerBrokerCompensation: asString(mods['buyer_broker_compensation']),
    repairsOrCredits: asString(mods['repairs_or_credits']),
    occupancyOrRentBack: asString(mods['occupancy_or_rent_back']),
    homeWarranty: asString(mods['home_warranty']),
    itemsIncludedOrExcluded: asString(mods['items_included_or_excluded']),
    hoaTerms: asString(mods['hoa_terms']),
    solarOrLeasedItems: asString(mods['solar_or_leased_items']),
    otherDeadlinesOrObligations: asString(mods['other_deadlines_or_obligations']),
    contingencySource: null,
  };

  // Fallback to per-page R_other_terms.modifications for any null fields
  if (perPageData) {
    const r = (perPageData['R_other_terms'] as Record<string, unknown>) ?? {};
    const pageMods = (r['modifications'] as Record<string, unknown>) ?? {};
    if (overrides.purchasePrice == null) overrides.purchasePrice = asNumber(pageMods['purchase_price']);
    if (overrides.closeOfEscrow == null) overrides.closeOfEscrow = asString(pageMods['close_of_escrow_date']);
    if (overrides.possession == null) overrides.possession = asString(pageMods['possession_date']);
    if (overrides.initialDeposit == null) overrides.initialDeposit = asNumber(pageMods['initial_deposit_amount']);
    if (overrides.increasedDeposit == null) overrides.increasedDeposit = asNumber(pageMods['increased_deposit_amount']);
    if (overrides.sellerCreditToBuyer == null) overrides.sellerCreditToBuyer = asNumber(pageMods['seller_credit_amount']);
    if (overrides.loanContingencyWaived == null) overrides.loanContingencyWaived = asBoolean(pageMods['loan_contingency_waived']);
    if (overrides.loanContingencyDays == null) overrides.loanContingencyDays = asNumber(pageMods['loan_contingency_days']);
    if (overrides.appraisalContingencyWaived == null) overrides.appraisalContingencyWaived = asBoolean(pageMods['appraisal_contingency_waived']);
    if (overrides.appraisalContingencyDays == null) overrides.appraisalContingencyDays = asNumber(pageMods['appraisal_contingency_days']);
    if (overrides.inspectionContingencyDays == null) overrides.inspectionContingencyDays = asNumber(pageMods['inspection_contingency_days']);
    if (overrides.sellerDocumentReviewDays == null) overrides.sellerDocumentReviewDays = asNumber(pageMods['seller_document_review_days']);
    if (overrides.titleReviewDays == null) overrides.titleReviewDays = asNumber(pageMods['title_review_days']);
    if (overrides.insuranceContingencyDays == null) overrides.insuranceContingencyDays = asNumber(pageMods['insurance_contingency_days']);
    if (overrides.hoaReviewDays == null) overrides.hoaReviewDays = asNumber(pageMods['hoa_review_days']);
    if (overrides.leasedLienedReviewDays == null) overrides.leasedLienedReviewDays = asNumber(pageMods['leased_liened_review_days']);
    if (overrides.saleOfBuyersProperty == null) overrides.saleOfBuyersProperty = asBoolean(pageMods['sale_of_buyers_property']);
  }

  return overrides;
}

/**
 * Check whether the OtherTermsOverrides contain any non-null/non-false values.
 */
function hasOtherTermsOverrides(overrides: OtherTermsOverrides): boolean {
  const entries: Array<Exclude<keyof OtherTermsOverrides, 'contingencySource'>> = [
    'purchasePrice', 'closeOfEscrow', 'possession', 'initialDeposit', 'increasedDeposit',
    'sellerCreditToBuyer', 'inspectionContingencyDays', 'sellerDocumentReviewDays',
    'titleReviewDays', 'loanContingencyDays', 'appraisalContingencyDays',
    'insuranceContingencyDays', 'hoaReviewDays', 'leasedLienedReviewDays',
    'buyerBrokerCompensation', 'repairsOrCredits', 'occupancyOrRentBack',
    'homeWarranty', 'itemsIncludedOrExcluded', 'hoaTerms', 'solarOrLeasedItems',
    'otherDeadlinesOrObligations',
  ];
  for (const key of entries) {
    if (overrides[key] != null) return true;
  }
  return overrides.loanContingencyWaived === true
    || overrides.appraisalContingencyWaived === true
    || overrides.saleOfBuyersProperty === true;
}

/**
 * Resolve the purchase price from pipeline extractions following the
 * contract negotiation chain: BCO/BMCO > SCO/SMCO > RPA.
 *
 * The last accepted counter offer that specifies a price determines the
 * final purchase price. If no counter offer modifies the price, the
 * original RPA purchase price is returned.
 * Returns the price and the form code it came from, or null if not found.
 */
export function resolvePurchasePrice(
  extractions: FormExtractionResult[],
  rpaPurchasePrice: number | null
): { price: number; sourceFormCode: string } | null {
  // Check counter offers in reverse-acceptance order (last accepted wins)
  const priority = ['BCO', 'BMCO', 'SCO', 'SMCO'];
  for (const code of priority) {
    const ext = extractions.find((e) => e.formCode === code);
    if (!ext?.output?.data) continue;
    const co = (ext.output.data['counter_offer_terms'] ?? {}) as Record<string, unknown>;

    // Check explicit purchase price field
    const explicitPrice = co['purchase_price'] as number | undefined;
    if (explicitPrice != null && !isNaN(explicitPrice) && explicitPrice > 0) {
      return { price: explicitPrice, sourceFormCode: code };
    }

    // Fallback: scan Other Terms text for price language
    const otherText = co['other_terms_text'] as string | undefined;
    const fromText = extractPriceFromText(otherText);
    if (fromText != null && !isNaN(fromText) && fromText > 0) {
      return { price: fromText, sourceFormCode: code };
    }
  }

  // Fall back to RPA purchase price
  if (rpaPurchasePrice != null && !isNaN(rpaPurchasePrice) && rpaPurchasePrice > 0) {
    return { price: rpaPurchasePrice, sourceFormCode: 'RPA' };
  }

  return null;
}

/**
 * Normalize a single contract-form extraction (RPA, SCO, BCO, SMCO) into a
 * unified ContractDocumentExtraction for the document-level review feature.
 *
 * RPA extraction outputs are re-normalized from the existing
 * normalizeToExtractionResult path. SCO/BCO/SMCO are mapped from the shared
 * sco.standard.v12-24 schema, which differs from the RPA schema.
 */
export function normalizeContractDocument(
  formExtraction: FormExtractionResult,
  fileName: string,
  sequenceOrder: number,
): ContractDocumentExtraction | null {
  const { formCode, output } = formExtraction;
  if (!output?.data) {
    // Return a skeleton document when LLM extraction fails so the document
    // still appears in the timeline (with minimal data) rather than being
    // silently dropped.
    const isScoLike = formCode === 'SCO' || formCode === 'SMCO';
    const isBcoLike = formCode === 'BCO' || formCode === 'BMCO';
    const docType = (isScoLike ? formCode : isBcoLike ? formCode : 'BCO') as 'RPA' | 'SCO' | 'BCO' | 'SMCO' | 'BMCO';
    return {
      documentId: null,
      fileName,
      documentType: docType,
      counterNumber: detectCounterNumber(docType, fileName, {}),
      sequenceOrder,
      referencedFormCode: null,
      referencedCounterOfferNumber: null,
      extractedTerms: {
        formRevision: null,
        formRevisionLabel: null,
        datePrepared: null,
        offerDate: null,
        acceptanceDate: null,
        expirationDate: null,
        buyerName: null,
        sellerName: null,
        propertyAddress: null,
        purchasePrice: null,
        initialDeposit: null,
        closeOfEscrow: null,
        sellerCreditToBuyer: null,
        buyerBrokerCompensation: null,
        loanContingency: null,
        appraisalContingency: null,
        inspectionContingency: null,
        insuranceContingency: null,
        sellerDocumentReview: null,
        titleReview: null,
        hoaReview: null,
        possession: null,
        otherTerms: null,
        otherTermsOverrides: null,
        signatures: { buyerSigned: false, sellerSigned: false, buyerSignedDate: null, sellerSignedDate: null },
      },
    };
  }
  const d = output.data;

  if (formCode === 'RPA') {
    const normalized = normalizeToExtractionResult(d);
    if (!normalized) return null;
    const t = normalized.transaction;
    const ct = normalized.contractTerms;
    const sig = normalized.signatures;
    const rpaSchema = readRpaSchema(d);
    const tx = (d['terms_of_purchase'] ?? {}) as Record<string, unknown>;
    const ctRaw = (d['contingencies_and_time_periods'] ?? {}) as Record<string, unknown>;
    const s3 = (d['section_3_terms_and_allocation_of_costs_page_3'] ?? {}) as Record<string, unknown>;
    const r = (s3['R_other_terms'] as Record<string, unknown>) ?? {};
    const otOverrides = extractOtherTermsOverrides(d, s3);
    // Text fallback: parse raw Other Terms for contingency changes
    extractContingencyFromText(ct.otherTermsText, otOverrides);

    // Per-page extraction data (page 2) — Gemini 2.5 Pro reads hand-written
    // override values that the template-level Claude extraction may miss
    // (e.g. pre-printed "17" returned instead of hand-written "2").
    const page2 = (d['section_3_terms_and_allocation_of_costs_page_2'] ?? {}) as Record<string, unknown>;
    const l = (page2['L_contingencies'] ?? {}) as Record<string, unknown>;
    const l1 = (l['L1_loan'] ?? {}) as Record<string, unknown>;
    const l2 = (l['L2_appraisal'] ?? {}) as Record<string, unknown>;
    const l3 = (l['L3_investigation_of_property'] ?? {}) as Record<string, unknown>;
    const l4 = (l['L4_insurance'] ?? {}) as Record<string, unknown>;
    const l5 = (l['L5_review_of_seller_documents'] ?? {}) as Record<string, unknown>;
    const l6 = (l['L6_preliminary_title_report'] ?? {}) as Record<string, unknown>;
    const l7 = (l['L7_common_interest_disclosures'] ?? {}) as Record<string, unknown>;
    const l8 = (l['L8_review_of_leased_or_liened_items'] ?? {}) as Record<string, unknown>;
    // Per-page values: override_days_after_acceptance captures the hand-written
    // override; if null (blank override), days_after_acceptance = default.
    const ppLoanDays: number | null = (l1['override_days_after_acceptance'] as number) ?? (l1['days_after_acceptance'] as number) ?? null;
    const ppApprDays: number | null = (l2['override_days_after_acceptance'] as number) ?? (l2['days_after_acceptance'] as number) ?? null;
    const ppInspectionDays: number | null = ((l3['investigation'] as Record<string, unknown>)?.['override_days_after_acceptance'] as number) ?? ((l3['investigation'] as Record<string, unknown>)?.['days_after_acceptance'] as number) ?? null;
    const ppInsuranceDays: number | null = (l4['override_days_after_acceptance'] as number) ?? (l4['days_after_acceptance'] as number) ?? null;
    const ppSellerDocDays: number | null = (l5['override_days_after_acceptance'] as number) ?? (l5['days_after_acceptance'] as number) ?? null;
    const ppTitleDays: number | null = (l6['override_days_after_acceptance'] as number) ?? (l6['days_after_acceptance'] as number) ?? null;
    const ppHoaDays: number | null = (l7['override_days_after_acceptance'] as number) ?? (l7['days_after_acceptance'] as number) ?? null;
    const ppLeasedDays: number | null = (l8['override_days_after_acceptance'] as number) ?? (l8['days_after_acceptance'] as number) ?? null;
    const ppLoanNoContingency = l1['no_loan_contingency_checked'] === true;
    const ppApprNoContingency = l2['no_appraisal_contingency_checked'] === true;

    // Standard values (pre-override) — per-page data wins over template-level
    // Fallback: per-page extraction path (Gemini 2.5 Pro on page 1) produces
    // section_3_terms_and_allocation_of_costs_page_1.A_purchase_price.purchase_price
    // which the generic batch LLM may not replicate in terms_of_purchase.purchase_price
    const s1 = (d['section_3_terms_and_allocation_of_costs_page_1'] ?? {}) as Record<string, unknown>;
    const pp = (s1['A_purchase_price'] ?? {}) as Record<string, unknown>;
    const perPagePurchasePrice = asNumber(pp['purchase_price']);
    const stdPurchasePrice = t.purchasePrice ?? perPagePurchasePrice;
    const stdCloseOfEscrow = t.closingDate ?? (tx['close_of_escrow_days'] ? `${tx['close_of_escrow_days']} days after acceptance` : null);
    const stdInitialDeposit = t.earnestMoneyAmount;
    const stdSellerCredit = tx['seller_credit_amount'] != null ? `$${tx['seller_credit_amount']}` : null;
    const stdBrokerComp = tx['seller_credit_percentage'] != null ? `${tx['seller_credit_percentage']}%` : null;
    const stdLoanStatus = (ppLoanNoContingency || ctRaw['loan_contingency_no_contingency'] === true) ? 'No contingency' : 'Contingent';
    const stdLoanDeadline = (ppLoanNoContingency || ctRaw['loan_contingency_no_contingency'] === true) ? null : (ppLoanDays ?? ct.loanContingencyDays) != null ? `${ppLoanDays ?? ct.loanContingencyDays} days` : null;
    const stdApprStatus = (ppApprNoContingency || ctRaw['appraisal_contingency_no_contingency'] === true) ? 'No contingency' : 'Contingent';
    const stdApprDeadline = (ppApprNoContingency || ctRaw['appraisal_contingency_no_contingency'] === true) ? null : (ppApprDays ?? ct.appraisalContingencyDays) != null ? `${ppApprDays ?? ct.appraisalContingencyDays} days` : null;
    const stdInspectionDeadline = (ppInspectionDays ?? ct.inspectionContingencyDays) != null ? `${ppInspectionDays ?? ct.inspectionContingencyDays} days` : null;
    const stdSellerDocDeadline = (ppSellerDocDays ?? ct.disclosuresDueDays) != null ? `${ppSellerDocDays ?? ct.disclosuresDueDays} days` : null;
    const stdTitleDeadline = (ppTitleDays ?? (ctRaw['preliminary_title_report_days'] as number)) != null ? `${ppTitleDays ?? ctRaw['preliminary_title_report_days']} days` : null;
    const stdInsuranceDeadline = (ppInsuranceDays ?? (ctRaw['insurance_contingency_days'] as number)) != null ? `${ppInsuranceDays ?? ctRaw['insurance_contingency_days']} days` : null;
    const stdHoaDeadline = (ppHoaDays ?? (ctRaw['common_interest_disclosures_days'] as number)) != null ? `${ppHoaDays ?? ctRaw['common_interest_disclosures_days']} days` : null;
    const stdLeasedDeadline = (ppLeasedDays ?? (ctRaw['review_leased_liened_items_days'] as number)) != null ? `${ppLeasedDays ?? ctRaw['review_leased_liened_items_days']} days` : null;
    const stdPossession = tx['possession_and_occupancy'] ? `${(tx['possession_and_occupancy'] as Record<string, unknown>)['possession_delivered'] ?? ''}` : null;

    // Apply Other Terms overrides
    const effPurchasePrice: number | null = otOverrides.purchasePrice ?? stdPurchasePrice;
    const effCloseOfEscrow: string | null = otOverrides.closeOfEscrow ?? stdCloseOfEscrow;
    const effInitialDeposit: number | null = otOverrides.initialDeposit ?? stdInitialDeposit;
    const effSellerCredit: string | null = otOverrides.sellerCreditToBuyer != null ? `$${otOverrides.sellerCreditToBuyer}` : stdSellerCredit;
    const effPossession: string | null = otOverrides.possession ?? stdPossession;

    const effLoanStatus = otOverrides.loanContingencyWaived === true ? 'No contingency' : stdLoanStatus;
    const effLoanDeadline = otOverrides.loanContingencyWaived === true ? null
      : otOverrides.loanContingencyDays != null ? `${otOverrides.loanContingencyDays} days`
      : stdLoanDeadline;
    const effApprStatus = otOverrides.appraisalContingencyWaived === true ? 'No contingency' : stdApprStatus;
    const effApprDeadline = otOverrides.appraisalContingencyWaived === true ? null
      : otOverrides.appraisalContingencyDays != null ? `${otOverrides.appraisalContingencyDays} days`
      : stdApprDeadline;
    const effInspectionDeadline = otOverrides.inspectionContingencyDays != null ? `${otOverrides.inspectionContingencyDays} days` : stdInspectionDeadline;
    const effSellerDocDeadline = otOverrides.sellerDocumentReviewDays != null ? `${otOverrides.sellerDocumentReviewDays} days` : stdSellerDocDeadline;
    const effTitleDeadline = otOverrides.titleReviewDays != null ? `${otOverrides.titleReviewDays} days` : stdTitleDeadline;
    const effInsuranceDeadline = otOverrides.insuranceContingencyDays != null ? `${otOverrides.insuranceContingencyDays} days`
      : stdInsuranceDeadline;
    const effHoaDeadline = otOverrides.hoaReviewDays != null ? `${otOverrides.hoaReviewDays} days`
      : stdHoaDeadline;
    const effLeasedDeadline = otOverrides.leasedLienedReviewDays != null ? `${otOverrides.leasedLienedReviewDays} days`
      : stdLeasedDeadline;
    const effSaleOfBuyersProperty = otOverrides.saleOfBuyersProperty ?? (ctRaw['sale_of_buyers_property_attached'] === true);

    // Raw numeric (unformatted) counterparts of the eff*Deadline strings above,
    // for `.fields` provenance — same override precedence, no "X days" suffix.
    const effLoanDays: number | null = otOverrides.loanContingencyWaived === true ? null : otOverrides.loanContingencyDays ?? ppLoanDays ?? ct.loanContingencyDays ?? null;
    const effApprDays: number | null = otOverrides.appraisalContingencyWaived === true ? null : otOverrides.appraisalContingencyDays ?? ppApprDays ?? ct.appraisalContingencyDays ?? null;
    const effInspectionDays: number | null = otOverrides.inspectionContingencyDays ?? ppInspectionDays ?? ct.inspectionContingencyDays ?? null;
    const effSellerDocDays: number | null = otOverrides.sellerDocumentReviewDays ?? ppSellerDocDays ?? ct.disclosuresDueDays ?? null;
    const effTitleDays: number | null = otOverrides.titleReviewDays ?? ppTitleDays ?? asNumber(ctRaw['preliminary_title_report_days']);
    const effInsuranceDays: number | null = otOverrides.insuranceContingencyDays ?? ppInsuranceDays ?? asNumber(ctRaw['insurance_contingency_days']);
    const effHoaDays: number | null = otOverrides.hoaReviewDays ?? ppHoaDays ?? asNumber(ctRaw['common_interest_disclosures_days']);
    const effLeasedDays: number | null = otOverrides.leasedLienedReviewDays ?? ppLeasedDays ?? asNumber(ctRaw['review_leased_liened_items_days']);

    // ── Additive per-field provenance (spec items 3/4) ────────────────────
    const bCoe = asRecord(s1['B_close_of_escrow']);
    const d1 = asRecord(s1['D1_initial_deposit_amount']);
    const e1 = asRecord(s1['E1_first_loan']);
    const gSection = asRecord(page2['G_seller_payment_to_cover_buyer_expenses_and_costs']);
    const g1 = asRecord(gSection['G1_seller_credit_to_buyer']);
    const g3 = asRecord(gSection['G3_seller_payment_to_compensate_buyers_broker']);
    const qSection = asRecord(s3['Q_allocation_of_costs']);
    const q7 = asRecord(qSection['Q7_escrow_fee']);
    const q8 = asRecord(qSection['Q8_owners_title_insurance_policy']);
    const rMods = asRecord(r['modifications']);

    const page1Source: FieldSource = { documentId: null, formCode: 'RPA', page: 1 };
    const page2Source: FieldSource = { documentId: null, formCode: 'RPA', page: 2 };
    const page3Source: FieldSource = { documentId: null, formCode: 'RPA', page: 3 };

    const fields: ContractDocumentExtractedTermsFields = {
      purchasePrice: otOverrides.purchasePrice != null
        ? buildField(effPurchasePrice, rMods['purchase_price'] as UnknownRecord, page3Source)
        : buildField(effPurchasePrice, pp['purchase_price'] as UnknownRecord, page1Source),
      initialDeposit: otOverrides.initialDeposit != null
        ? buildField(effInitialDeposit, rMods['initial_deposit_amount'] as UnknownRecord, page3Source)
        : buildField(effInitialDeposit, d1['deposit_amount'] as UnknownRecord, page1Source),
      initialDepositBusinessDays: buildField(rpaSchema.initialDepositBusinessDays, d1['business_days_after_acceptance'] as UnknownRecord, page1Source),
      loanAmount: buildField(rpaSchema.loanAmount, e1['loan_amount'] as UnknownRecord, page1Source),
      sellerCreditToBuyer: otOverrides.sellerCreditToBuyer != null
        ? buildField(otOverrides.sellerCreditToBuyer, rMods['seller_credit_amount'] as UnknownRecord, page3Source)
        : buildField(asNumber(g1['amount']), g1['amount'] as UnknownRecord, page2Source),
      buyerBrokerCompensation: buildField(otOverrides.buyerBrokerCompensation ?? stdBrokerComp, rMods['buyer_broker_compensation'] as UnknownRecord, page3Source),
      possession: otOverrides.possession != null
        ? buildField(effPossession, rMods['possession_date'] as UnknownRecord, page3Source)
        : buildField(effPossession, null, page3Source),
      loanContingencyDays: buildDaysField(effLoanDays, l1, page2Source),
      loanContingencyWaived: buildField(effLoanStatus === 'No contingency', rMods['loan_contingency_waived'] as UnknownRecord, page3Source),
      appraisalContingencyDays: buildDaysField(effApprDays, l2, page2Source),
      appraisalContingencyWaived: buildField(effApprStatus === 'No contingency', rMods['appraisal_contingency_waived'] as UnknownRecord, page3Source),
      inspectionContingencyDays: buildDaysField(effInspectionDays, asRecord(l3['investigation']), page2Source),
      insuranceContingencyDays: buildDaysField(effInsuranceDays, l4, page2Source),
      sellerDocumentReviewDays: buildDaysField(effSellerDocDays, l5, page2Source),
      titleReviewDays: buildDaysField(effTitleDays, l6, page2Source),
      hoaReviewDays: buildDaysField(effHoaDays, l7, page2Source),
      leasedLienedReviewDays: buildDaysField(effLeasedDays, l8, page2Source),
      itemsIncludedOrExcluded: buildField(otOverrides.itemsIncludedOrExcluded, rMods['items_included_or_excluded'] as UnknownRecord, page3Source),
      homeWarranty: buildField(otOverrides.homeWarranty, rMods['home_warranty'] as UnknownRecord, page3Source),
      escrowHolder: buildField(asString(q7['escrow_holder']), q7['escrow_holder'] as UnknownRecord, page3Source),
      titleCompany: buildField(asString(q8['title_company']), q8['title_company'] as UnknownRecord, page3Source),
      hoaTerms: buildField(otOverrides.hoaTerms, rMods['hoa_terms'] as UnknownRecord, page3Source),
      solarOrLeasedItems: buildField(otOverrides.solarOrLeasedItems, rMods['solar_or_leased_items'] as UnknownRecord, page3Source),
    };

    return {
      documentId: null,
      fileName,
      documentType: 'RPA',
      counterNumber: 0,
      sequenceOrder,
      referencedFormCode: null,
      referencedCounterOfferNumber: null,
      extractedTerms: {
        formRevision: rpaSchema.formRevision,
        formRevisionLabel: rpaSchema.formRevisionLabel,
        datePrepared: rpaSchema.datePrepared,
        offerDate: rpaSchema.buyerOfferDate,
        acceptanceDate: rpaSchema.sellerExecutionDate,
        expirationDate: rpaSchema.expirationDate,
        buyerName: normalized.parties.buyers[0]?.fullName ?? null,
        sellerName: normalized.parties.sellers[0]?.fullName ?? null,
        propertyAddress: normalized.property.streetAddress ?? null,
        purchasePrice: effPurchasePrice,
        initialDeposit: effInitialDeposit,
        closeOfEscrow: effCloseOfEscrow,
        sellerCreditToBuyer: effSellerCredit,
        buyerBrokerCompensation: stdBrokerComp,
        loanContingency: {
          status: effLoanStatus,
          deadline: effLoanDeadline,
        },
        appraisalContingency: {
          status: effApprStatus,
          deadline: effApprDeadline,
        },
        inspectionContingency: {
          status: 'Contingent',
          deadline: effInspectionDeadline,
        },
        insuranceContingency: {
          status: 'Contingent',
          deadline: effInsuranceDeadline,
        },
        sellerDocumentReview: {
          deadline: effSellerDocDeadline,
        },
        titleReview: {
          deadline: effTitleDeadline,
        },
        hoaReview: {
          deadline: effHoaDeadline,
        },
        possession: effPossession,
        otherTerms: ct.otherTermsText ?? (r['text'] as string) ?? null,
        otherTermsOverrides: hasOtherTermsOverrides(otOverrides) ? otOverrides : null,
        signatures: {
          buyerSigned: sig.buyerSigned,
          sellerSigned: sig.sellerSigned,
          buyerSignedDate: rpaSchema.buyerOfferDate,
          sellerSignedDate: rpaSchema.sellerExecutionDate,
        },
        fields,
      },
    };
  }

  // ── SCO / BCO / SMCO (shared counter-offer schema) ────────────────────────
  const h = (d['header'] ?? {}) as Record<string, unknown>;
  const p = (d['parties'] ?? {}) as Record<string, unknown>;
  const exp = (d['expiration'] ?? {}) as Record<string, unknown>;
  const c4 = (d['section_4_offer'] ?? {}) as Record<string, unknown>;
  const c5 = (d['section_5_acceptance'] ?? {}) as Record<string, unknown>;
  const co = (d['counter_offer_terms'] ?? {}) as Record<string, unknown>;
  const or = (d['offer_reference'] ?? {}) as Record<string, unknown>;

  const buyerNames: string[] = Array.isArray(p['buyer_names']) ? p['buyer_names'] as string[] : [];
  const sellerNames: string[] = Array.isArray(p['seller_names']) ? p['seller_names'] as string[] : [];

  // On SCO the offeror is the seller, acceptor is the buyer
  // On BCO the offeror is the buyer, acceptor is the seller
  const isSco = formCode === 'SCO' || formCode === 'SMCO';
  const offeror1Present = c4['offeror_1_signature_present'] === true;
  const offeror2Present = c4['offeror_2_signature_present'] === true;
  const acceptor1Present = c5['acceptor_1_signature_present'] === true;
  const acceptor2Present = c5['acceptor_2_signature_present'] === true;
  const hasOfferorSig = offeror1Present || offeror2Present;
  const hasAcceptorSig = acceptor1Present || acceptor2Present;
  const offerorSignedDate = c4['offeror_1_signature_date'] as string | null;
  const acceptorSignedDate = c5['acceptor_1_signature_date'] as string | null;

  // Resolve purchase price from counter offer terms (explicit field or Other Terms text)
  // LLMs frequently flatten the nested counter_offer_terms block — check multiple paths
  const txLike = (d['transaction'] ?? {}) as Record<string, unknown>;
  const topLike = (d['terms_of_purchase'] ?? {}) as Record<string, unknown>;
  const coPurchasePrice = asNumber(co['purchase_price'])
    ?? (d['purchase_price'] as number | undefined)
    ?? (txLike['purchasePrice'] as number | undefined)
    ?? (topLike['purchase_price'] as number | undefined);
  const coOtherTerms: string | undefined =
    (co['other_terms_text'] as string | undefined)
    ?? (d['other_terms_text'] as string | undefined)
    ?? (co['other_terms'] as string | undefined)
    ?? (d['other_terms'] as string | undefined);
  const ownPurchasePrice: number | null =
    (coPurchasePrice != null && !isNaN(coPurchasePrice) && coPurchasePrice > 0)
      ? coPurchasePrice
      : extractPriceFromText(coOtherTerms);

  const isScoLike = formCode === 'SCO' || formCode === 'SMCO';
  const isBcoLike = formCode === 'BCO' || formCode === 'BMCO';
  const docType = (isScoLike ? formCode : isBcoLike ? formCode : 'BCO') as 'RPA' | 'SCO' | 'BCO' | 'SMCO' | 'BMCO';

  const otOverrides = extractOtherTermsOverrides(co);
  // Fallback: check top-level other_terms_modifications (LLM may put it at doc root)
  if (!hasOtherTermsOverrides(otOverrides)) {
    const topOverrides = extractOtherTermsOverrides(d);
    const src = topOverrides as unknown as Record<string, unknown>;
    const dest = otOverrides as unknown as Record<string, unknown>;
    for (const k of Object.keys(dest)) {
      if (dest[k] == null && src[k] != null) {
        dest[k] = src[k];
      }
    }
  }
  // Text fallback: parse raw Other Terms for contingency changes
  extractContingencyFromText(coOtherTerms, otOverrides);

  // Apply Other Terms overrides (SCO/BCO starts with mostly nulls, so overrides become primary values)
  const effPurchasePriceSco: number | null = otOverrides.purchasePrice ?? ownPurchasePrice;
  const effCloseOfEscrowSco: string | null = otOverrides.closeOfEscrow ?? (otOverrides.closeOfEscrowDays != null ? (acceptorSignedDate ? addDaysToDate(acceptorSignedDate, otOverrides.closeOfEscrowDays) : `${otOverrides.closeOfEscrowDays} days after acceptance`) : null);
  const effInitialDepositSco: number | null = otOverrides.initialDeposit ?? null;
  const effSellerCreditSco: string | null = otOverrides.sellerCreditToBuyer != null ? `$${otOverrides.sellerCreditToBuyer}` : null;
  const effPossessionSco: string | null = otOverrides.possession ?? effCloseOfEscrowSco;

  const effLoanContingencySco: ContractContingencyInfo | null = otOverrides.loanContingencyWaived === true
    ? { status: 'No contingency', deadline: null }
    : otOverrides.loanContingencyDays != null
    ? { status: 'Contingent', deadline: `${otOverrides.loanContingencyDays} days` }
    : null;
  const effApprContingencySco: ContractContingencyInfo | null = otOverrides.appraisalContingencyWaived === true
    ? { status: 'No contingency', deadline: null }
    : otOverrides.appraisalContingencyDays != null
    ? { status: 'Contingent', deadline: `${otOverrides.appraisalContingencyDays} days` }
    : null;
  const effInspectionSco: ContractContingencyInfo | null = otOverrides.inspectionContingencyDays != null
    ? { status: 'Contingent', deadline: `${otOverrides.inspectionContingencyDays} days` }
    : null;
  const effInsuranceSco: ContractContingencyInfo | null = otOverrides.insuranceContingencyDays != null
    ? { status: 'Contingent', deadline: `${otOverrides.insuranceContingencyDays} days` }
    : null;
  const effSellerDocSco = otOverrides.sellerDocumentReviewDays != null
    ? { deadline: `${otOverrides.sellerDocumentReviewDays} days` }
    : null;
  const effTitleSco = otOverrides.titleReviewDays != null
    ? { deadline: `${otOverrides.titleReviewDays} days` }
    : null;
  const effHoaSco = otOverrides.hoaReviewDays != null
    ? { deadline: `${otOverrides.hoaReviewDays} days` }
    : null;
  const effLeasedSco = otOverrides.leasedLienedReviewDays != null
    ? { deadline: `${otOverrides.leasedLienedReviewDays} days` }
    : null;

  // ── Additive per-field provenance (spec items 3/4) ────────────────────
  // SCO/BCO/SMCO/BMCO extract in a single extractBatch() call (no
  // page-specific buckets like RPA), so page is fixed at 1 — the physical
  // page where Section 1D "Other Terms" and virtually all negotiated
  // modifications live on the real form (see extractor/forms/sco/regions).
  const coMods = asRecord(co['other_terms_modifications']);
  const scoSource: FieldSource = { documentId: null, formCode: docType, page: 1 };

  const fields: ContractDocumentExtractedTermsFields = {
    purchasePrice: buildField(effPurchasePriceSco, coMods['purchase_price'] as UnknownRecord, scoSource),
    closeOfEscrowDate: buildField(otOverrides.closeOfEscrow, coMods['close_of_escrow_date'] as UnknownRecord, scoSource),
    closeOfEscrowDays: buildField(otOverrides.closeOfEscrowDays, coMods['close_of_escrow_days'] as UnknownRecord, scoSource),
    initialDeposit: buildField(effInitialDepositSco, coMods['initial_deposit_amount'] as UnknownRecord, scoSource),
    increasedDeposit: buildField(otOverrides.increasedDeposit, coMods['increased_deposit_amount'] as UnknownRecord, scoSource),
    sellerCreditToBuyer: buildField(otOverrides.sellerCreditToBuyer, coMods['seller_credit_amount'] as UnknownRecord, scoSource),
    buyerBrokerCompensation: buildField(otOverrides.buyerBrokerCompensation, coMods['buyer_broker_compensation'] as UnknownRecord, scoSource),
    possession: buildField(effPossessionSco, coMods['possession_date'] as UnknownRecord, scoSource),
    loanContingencyDays: buildField(otOverrides.loanContingencyDays, coMods['loan_contingency_days'] as UnknownRecord, scoSource),
    loanContingencyWaived: buildField(otOverrides.loanContingencyWaived, coMods['loan_contingency_waived'] as UnknownRecord, scoSource),
    appraisalContingencyDays: buildField(otOverrides.appraisalContingencyDays, coMods['appraisal_contingency_days'] as UnknownRecord, scoSource),
    appraisalContingencyWaived: buildField(otOverrides.appraisalContingencyWaived, coMods['appraisal_contingency_waived'] as UnknownRecord, scoSource),
    inspectionContingencyDays: buildField(otOverrides.inspectionContingencyDays, coMods['inspection_contingency_days'] as UnknownRecord, scoSource),
    insuranceContingencyDays: buildField(otOverrides.insuranceContingencyDays, coMods['insurance_contingency_days'] as UnknownRecord, scoSource),
    sellerDocumentReviewDays: buildField(otOverrides.sellerDocumentReviewDays, coMods['seller_document_review_days'] as UnknownRecord, scoSource),
    titleReviewDays: buildField(otOverrides.titleReviewDays, coMods['title_review_days'] as UnknownRecord, scoSource),
    hoaReviewDays: buildField(otOverrides.hoaReviewDays, coMods['hoa_review_days'] as UnknownRecord, scoSource),
    leasedLienedReviewDays: buildField(otOverrides.leasedLienedReviewDays, coMods['leased_liened_review_days'] as UnknownRecord, scoSource),
    itemsIncludedOrExcluded: buildField(otOverrides.itemsIncludedOrExcluded, coMods['items_included_or_excluded'] as UnknownRecord, scoSource),
    homeWarranty: buildField(otOverrides.homeWarranty, coMods['home_warranty'] as UnknownRecord, scoSource),
    hoaTerms: buildField(otOverrides.hoaTerms, coMods['hoa_terms'] as UnknownRecord, scoSource),
    solarOrLeasedItems: buildField(otOverrides.solarOrLeasedItems, coMods['solar_or_leased_items'] as UnknownRecord, scoSource),
  };

  return {
    documentId: null,
    fileName,
    documentType: docType,
    counterNumber: detectCounterNumber(docType, fileName, d),
    sequenceOrder,
    referencedFormCode: typeof or['referenced_form_code'] === 'string' ? (or['referenced_form_code'] as string).toUpperCase() : null,
    referencedCounterOfferNumber: or['referenced_counter_offer_number'] != null ? String(or['referenced_counter_offer_number']) : null,
    extractedTerms: {
      formRevision: null,
      formRevisionLabel: null,
      datePrepared: (h['date'] as string) ?? (c4['offeror_1_signature_date'] as string) ?? (or['referenced_offer_date'] as string) ?? null,
      offerDate: (or['referenced_offer_date'] as string) ?? null,
      acceptanceDate: acceptorSignedDate ?? null,
      expirationDate: (exp['expiration_date'] as string) ?? null,
      buyerName: buyerNames[0] ?? null,
      sellerName: sellerNames[0] ?? null,
      propertyAddress: (h['property_address'] as string) ?? null,
      purchasePrice: effPurchasePriceSco,
      initialDeposit: effInitialDepositSco,
      closeOfEscrow: effCloseOfEscrowSco,
      sellerCreditToBuyer: effSellerCreditSco,
      buyerBrokerCompensation: otOverrides.buyerBrokerCompensation ?? null,
      loanContingency: effLoanContingencySco,
      appraisalContingency: effApprContingencySco,
      inspectionContingency: effInspectionSco,
      insuranceContingency: effInsuranceSco,
      sellerDocumentReview: effSellerDocSco,
      titleReview: effTitleSco,
      hoaReview: effHoaSco,
      possession: effPossessionSco,
      otherTerms: (co['other_terms_text'] as string) ?? null,
      otherTermsOverrides: hasOtherTermsOverrides(otOverrides) ? otOverrides : null,
      signatures: {
        buyerSigned: isSco ? hasAcceptorSig : hasOfferorSig,
        sellerSigned: isSco ? hasOfferorSig : hasAcceptorSig,
        buyerSignedDate: isSco ? acceptorSignedDate : offerorSignedDate,
        sellerSignedDate: isSco ? offerorSignedDate : acceptorSignedDate,
      },
      fields,
    },
  };
}

function normalizeRpaPageSchema(data: UnknownRecord): ExtractionResult {
  const rpa = readRpaSchema(data);

  const buyerExecution = summarizePartyExecution(rpa.buyerNames, rpa.buyerSignatureSlots);
  const sellerExecution = summarizePartyExecution(rpa.sellerNames, rpa.sellerSignatureSlots);

  const page2 = asRecord(data['section_3_terms_and_allocation_of_costs_page_2']);
  const contingencies = asRecord(page2['L_contingencies']);
  const loan = asRecord(contingencies['L1_loan']);
  const appraisal = asRecord(contingencies['L2_appraisal']);
  const investigation = asRecord(asRecord(contingencies['L3_investigation_of_property'])['investigation']);
  const insurance = asRecord(contingencies['L4_insurance']);
  const commonInterest = asRecord(contingencies['L7_common_interest_disclosures']);

  function effectiveDays(row: UnknownRecord): number | null {
    return asNumber(row['override_days_after_acceptance']) ?? asNumber(row['days_after_acceptance']);
  }

  const closingDate = rpa.closeOfEscrowDate ?? addDaysToDate(rpa.sellerExecutionDate, rpa.closeOfEscrowDays);

  const hasBuyerAgent = Boolean(rpa.agency.buyerAgent || rpa.agency.buyerAgentDre || rpa.agency.buyerBrokerage);
  const hasSellerAgent = Boolean(rpa.agency.sellerAgent || rpa.agency.sellerAgentDre || rpa.agency.sellerBrokerage);

  const page3 = asRecord(data['section_3_terms_and_allocation_of_costs_page_3']);
  const otherTerms = asRecord(page3['R_other_terms']);
  const oldOtherTerms = asString(data['other_terms_text']);

  const lda = asRecord(data['liquidated_damages_and_arbitration']);

  return {
    documentType: 'Residential Purchase Agreement',
    documentSubtypes: ['Purchase Agreement'],
    sourceLanguage: 'en',
    property: {
      streetAddress: rpa.property.streetAddress,
      city: rpa.property.city,
      state: rpa.property.state === 'California' ? 'CA' : rpa.property.state,
      postalCode: rpa.property.postalCode,
      county: rpa.property.county,
      apn: rpa.property.apn,
      mlsNumber: null,
      legalDescription: null,
    },
    transaction: {
      purchasePrice: rpa.purchasePrice,
      earnestMoneyAmount: rpa.initialDeposit,
      offerDate: rpa.buyerOfferDate,
      acceptanceDate: rpa.sellerExecutionDate,
      closingDate,
      possessionDate: closingDate,
      financingType: rpa.financingType,
      loanAmount: rpa.loanAmount,
      occupancyType: rpa.occupancyType,
    },
    parties: {
      buyers: rpa.buyerNames.map((name, index) => {
        const slot = findSignatureSlotForParty(name, index, rpa.buyerSignatureSlots);
        return {
          fullName: name,
          email: null,
          phone: null,
          mailingAddress: null,
          signaturePresent: slot?.signaturePresent ?? false,
          confidence: null,
        };
      }),
      sellers: rpa.sellerNames.map((name, index) => {
        const slot = findSignatureSlotForParty(name, index, rpa.sellerSignatureSlots);
        return {
          fullName: name,
          email: null,
          phone: null,
          mailingAddress: null,
          signaturePresent: slot?.signaturePresent ?? false,
          confidence: null,
        };
      }),
      buyerAgents: hasBuyerAgent ? [{
        fullName: rpa.agency.buyerAgent,
        email: null,
        phone: null,
        licenseNumber: rpa.agency.buyerAgentDre,
        companyName: rpa.agency.buyerBrokerage,
        confidence: null,
      }] : [],
      listingAgents: hasSellerAgent ? [{
        fullName: rpa.agency.sellerAgent,
        email: null,
        phone: null,
        licenseNumber: rpa.agency.sellerAgentDre,
        companyName: rpa.agency.sellerBrokerage,
        confidence: null,
      }] : [],
      brokers: [],
      escrowCompanies: [],
      lenders: [],
      attorneys: [],
      otherParties: [],
    },
    contractTerms: {
      inspectionContingencyDays: effectiveDays(investigation),
      loanContingencyDays: effectiveDays(loan),
      loanContingencyWaived: loan['no_loan_contingency_checked'] === true,
      appraisalContingencyDays: effectiveDays(appraisal),
      appraisalContingencyWaived: appraisal['no_appraisal_contingency_checked'] === true,
      disclosuresDueDays: effectiveDays(commonInterest),
      initialDepositBusinessDays: rpa.initialDepositBusinessDays,
      otherDeadlines: [],
      otherTermsText: asString(otherTerms['text']) ?? oldOtherTerms,
    },
    formsAndDisclosures: [],
    signatures: {
      buyerSigned: buyerExecution.allSigned,
      sellerSigned: sellerExecution.allSigned,
      signedParties: [...buyerExecution.signedParties, ...sellerExecution.signedParties],
      missingSignatures: [...buyerExecution.missingSignatures, ...sellerExecution.missingSignatures],
      missingSignatureDates: [...buyerExecution.missingSignatureDates, ...sellerExecution.missingSignatureDates],
    },
    initials: {
      liquidatedDamagesBuyer: lda['liquidated_damages_initialed_buyer'] === true ? true : lda['liquidated_damages_initialed_buyer'] != null ? false : null,
      liquidatedDamagesSeller: lda['liquidated_damages_initialed_seller'] === true ? true : lda['liquidated_damages_initialed_seller'] != null ? false : null,
      arbitrationBuyer: lda['arbitration_initialed_buyer'] === true ? true : lda['arbitration_initialed_buyer'] != null ? false : null,
      arbitrationSeller: lda['arbitration_initialed_seller'] === true ? true : lda['arbitration_initialed_seller'] != null ? false : null,
    },
    extractionWarnings: [],
    confidenceSummary: { overall: 0, property: null, transaction: null, parties: null, formsAndDisclosures: null },
  };
}

export function normalizeToExtractionResult(data: Record<string, unknown>): ExtractionResult | null {
  // New page-specific RPA schema must be handled before the generic already-normalized branch.
  const usesPageSpecificRpaSchema =
    Boolean(data['section_1_offer']) &&
    Boolean(data['section_32_offer']) &&
    Boolean(data['section_33_acceptance'] ?? data['seller_acceptance']);

  if (usesPageSpecificRpaSchema) {
    return normalizeRpaPageSchema(data);
  }

  // When data already has parties/property/transaction (e.g. from direct LLM extraction),
  // still fill in offerDate from per-page sources if missing.
  if (data['parties'] && data['property'] && data['transaction']) {
    if (!data['documentType'] || String(data['documentType']).toLowerCase() === 'unknown') {
      data['documentType'] = 'Residential Purchase Agreement';
    }
    if (!data['documentSubtypes']) {
      data['documentSubtypes'] = ['Purchase Agreement'];
    }
    if (!data['formsAndDisclosures']) {
      data['formsAndDisclosures'] = [{ title: 'Residential Purchase Agreement', formCode: 'RPA' }];
    }
    const tx = data['transaction'] as Record<string, unknown>;
    if (!tx['offerDate']) {
      const s32 = (data['section_32_offer'] ?? {}) as Record<string, unknown>;
      const oe = (data['offer_expiration'] ?? {}) as Record<string, unknown>;
      tx['offerDate'] = (s32['buyer_offer_date'] as string) ?? (oe['buyer_offer_date'] as string) ?? null;
    }
    const t = (data['terms_of_purchase'] ?? {}) as Record<string, unknown>;
    if (!tx['closingDate'] && t['other_terms_close_of_escrow_date']) {
      tx['closingDate'] = t['other_terms_close_of_escrow_date'];
    }
    if (!tx['possessionDate'] && t['other_terms_possession_date']) {
      tx['possessionDate'] = t['other_terms_possession_date'];
    }
    if (!tx['possessionDate'] && tx['closingDate']) {
      tx['possessionDate'] = tx['closingDate'];
    }
    const sig = (data['signatures'] ?? {}) as Record<string, unknown>;
    if (!Array.isArray(sig['missingSignatureDates'])) {
      sig['missingSignatureDates'] = [];
    }
    return data as unknown as ExtractionResult;
  }

  const h = (data['header'] ?? {}) as Record<string, unknown>;
  const p = (data['parties'] ?? {}) as Record<string, unknown>;
  const a = (data['agency'] ?? {}) as Record<string, unknown>;
  const t = (data['terms_of_purchase'] ?? {}) as Record<string, unknown>;
  const ct = (data['contingencies_and_time_periods'] ?? {}) as Record<string, unknown>;
  const sa = (data['seller_acceptance'] ?? {}) as Record<string, unknown>;
  const s32 = (data['section_32_offer'] ?? {}) as Record<string, unknown>;
  const s3 = (data['section_3_terms_and_allocation_of_costs_page_3'] ?? {}) as Record<string, unknown>;
  const oa = (data['other_addenda_and_advisories'] ?? {}) as Record<string, unknown>;
  const oe = (data['offer_expiration'] ?? {}) as Record<string, unknown>;
  const rawTx = (data['transaction'] ?? {}) as Record<string, unknown>;
  const lda = (data['liquidated_damages_and_arbitration'] ?? {}) as Record<string, unknown>;

  const buyerNames: string[] = Array.isArray(p['buyer_names']) ? p['buyer_names'] as string[] : [];
  const sellerNames: string[] = Array.isArray(p['seller_names']) ? p['seller_names'] as string[] : [];
  const purchasePrice = typeof t['purchase_price'] === 'number' ? t['purchase_price'] as number : null;
  const isAllCash = t['is_all_cash'] === true;
  const earnestMoney = typeof t['initial_deposit_amount'] === 'number' ? t['initial_deposit_amount'] as number : null;
  const loanAmount = typeof t['loan_amount_1'] === 'number' ? t['loan_amount_1'] as number : null;

  const acceptanceDate: string | null = (sa['seller_signature_date'] as string) ?? (sa['buyer_signature_date'] as string) ?? (sa['acceptance_date'] as string) ?? (sa['date_of_acceptance'] as string) ?? (rawTx['acceptanceDate'] as string) ?? (data['acceptanceDate'] as string) ?? null;

  const closeOfEscrowDays = t['close_of_escrow_days'] as number | null;
  // Other Terms overrides — prefer new structured block, fall back to old field names
  const otm = (t['other_terms_modifications'] ?? {}) as Record<string, unknown>;
  const otherTermsCoe = (otm['close_of_escrow_date'] as string) ?? (t['other_terms_close_of_escrow_date'] as string) ?? null;
  const otherTermsPoss = (otm['possession_date'] as string) ?? (t['other_terms_possession_date'] as string) ?? null;
  const closingDate: string | null = otherTermsCoe ?? (t['close_of_escrow_date'] as string) ?? addDaysToDate(acceptanceDate, closeOfEscrowDays) ?? null;

  return {
    documentType: 'Residential Purchase Agreement',
    documentSubtypes: ['Purchase Agreement'],
    sourceLanguage: 'en',
    property: {
      streetAddress: (h['property_address'] as string) ?? null,
      city: (h['city'] as string) ?? null,
      state: 'CA',
      postalCode: (h['zip_code'] as string) ?? null,
      county: (h['county'] as string) ?? null,
      apn: (h['assessor_parcel_number'] as string) ?? null,
      mlsNumber: null,
      legalDescription: null,
    },
    transaction: {
      purchasePrice,
      earnestMoneyAmount: earnestMoney,
      offerDate: (s32['buyer_offer_date'] as string) ?? (oe['buyer_offer_date'] as string) ?? (data['offer_date'] as string) ?? (h['date_prepared'] as string) ?? null,
      acceptanceDate,
      closingDate,
      possessionDate: otherTermsPoss ?? closingDate ?? null,
      financingType: isAllCash ? 'Cash' : (loanAmount ? 'Conventional' : null),
      loanAmount,
      occupancyType: null,
    },
    parties: {
      buyers: buyerNames.map((name) => ({
        fullName: name, email: null, phone: null, mailingAddress: null, signaturePresent: !!sa['buyer_signature_date'], confidence: null,
      })),
      sellers: sellerNames.map((name) => ({
        fullName: name, email: null, phone: null, mailingAddress: null, signaturePresent: !!sa['seller_signature_date'], confidence: null,
      })),
      buyerAgents: [{
        fullName: (a['buyer_agent'] as string) ?? null,
        email: null, phone: null,
        licenseNumber: (a['buyer_agent_dre'] as string) ?? null,
        companyName: (a['buyer_brokerage'] as string) ?? null,
        confidence: null,
      }],
      listingAgents: [{
        fullName: (a['seller_agent'] as string) ?? null,
        email: null, phone: null,
        licenseNumber: (a['seller_agent_dre'] as string) ?? null,
        companyName: (a['seller_brokerage'] as string) ?? null,
        confidence: null,
      }],
      brokers: [],
      escrowCompanies: [{
        companyName: null, contactName: null, email: null, phone: null, confidence: null,
      }],
      lenders: [],
      attorneys: [],
      otherParties: [],
    },
    contractTerms: {
      inspectionContingencyDays: (ct['investigation_of_property_days'] as number) ?? null,
      loanContingencyDays: (ct['loan_contingency_days'] as number) ?? null,
      loanContingencyWaived: ct['loan_contingency_no_contingency'] === true,
      appraisalContingencyDays: (ct['appraisal_contingency_days'] as number) ?? null,
      appraisalContingencyWaived: ct['appraisal_contingency_no_contingency'] === true,
      disclosuresDueDays: (ct['common_interest_disclosures_days'] as number) ?? null,
      initialDepositBusinessDays: (t['initial_deposit_days'] as number) ?? null,
      otherDeadlines: [],
      otherTermsText: (data['other_terms_text'] as string) ?? ((s3 as Record<string, unknown>)?.['R_other_terms'] as Record<string, unknown>)?.['text'] as string ?? null,
    },
    formsAndDisclosures: [
      ...(oa['probate_advisory_attached'] === true ? [{ title: 'Probate Advisory', formCode: 'PA', status: 'attached' as const, confidence: 0.9 }] : []),
      ...(oa['trust_advisory_attached'] === true ? [{ title: 'Trust Advisory', formCode: 'TA', status: 'attached' as const, confidence: 0.9 }] : []),
      ...(oa['short_sale_addendum_attached'] === true ? [{ title: 'Short Sale Addendum', formCode: 'SSA', status: 'attached' as const, confidence: 0.9 }] : []),
      ...(oa['manufactured_home_addendum_attached'] === true ? [{ title: 'Manufactured Home Addendum', formCode: 'MHA', status: 'attached' as const, confidence: 0.9 }] : []),
    ],
    signatures: {
      buyerSigned: !!sa['buyer_signature_date'],
      sellerSigned: !!sa['seller_signature_date'],
      signedParties: [
        ...(sa['buyer_signature_present'] === true ? buyerNames : []),
        ...(sa['seller_signature_present'] === true ? sellerNames : []),
      ],
      missingSignatures: [
        ...(sa['buyer_signature_present'] !== true ? buyerNames : []),
        ...(sa['seller_signature_present'] !== true ? sellerNames : []),
      ],
      missingSignatureDates: [
        ...(sa['buyer_signature_present'] === true && !sa['buyer_signature_date'] ? buyerNames : []),
        ...(sa['seller_signature_present'] === true && !sa['seller_signature_date'] ? sellerNames : []),
      ],
    },
    initials: {
      liquidatedDamagesBuyer: lda.liquidated_damages_initialed_buyer === true ? true : (lda.liquidated_damages_initialed_buyer != null ? false : null),
      liquidatedDamagesSeller: lda.liquidated_damages_initialed_seller === true ? true : (lda.liquidated_damages_initialed_seller != null ? false : null),
      arbitrationBuyer: lda.arbitration_initialed_buyer === true ? true : (lda.arbitration_initialed_buyer != null ? false : null),
      arbitrationSeller: lda.arbitration_initialed_seller === true ? true : (lda.arbitration_initialed_seller != null ? false : null),
    },
    extractionWarnings: [],
    confidenceSummary: { overall: 0, property: null, transaction: null, parties: null, formsAndDisclosures: null },
  };
}

// ─── Existing RPA stage-level rule groups ─────────────────────────────────────

function validateParties(e: ExtractionResult): RuleResult {
  const issues: RuleIssue[] = [];
  const checks: ComplianceCheck[] = [];

  if (e.parties.buyers.length === 0) {
    issues.push(issue('BLOCKER_BUYER_MISSING', ['parties.buyers']));
  } else {
    const unnamed = e.parties.buyers.filter((b) => !b.fullName);
    checks.push(unnamed.length > 0
      ? pass('buyer_name', 'parties', 'RPA', 'All buyers have a full name', `${unnamed.length} buyer(s) missing name`)
      : pass('buyer_name', 'parties', 'RPA', 'All buyers have a full name'));
    if (unnamed.length > 0) {
      issues.push(issue('WARN_BUYER_NAME', ['parties.buyers']));
    }
    checks.push(pass('buyer_present', 'parties', 'RPA', 'At least one buyer identified', `${e.parties.buyers.length} buyer(s) found`));
  }

  if (e.parties.sellers.length === 0) {
    issues.push(issue('BLOCKER_SELLER_MISSING', ['parties.sellers']));
  } else {
    const unnamed = e.parties.sellers.filter((s) => !s.fullName);
    checks.push(unnamed.length > 0
      ? pass('seller_name', 'parties', 'RPA', 'All sellers have a full name', `${unnamed.length} seller(s) missing name`)
      : pass('seller_name', 'parties', 'RPA', 'All sellers have a full name'));
    if (unnamed.length > 0) {
      issues.push(issue('WARN_SELLER_NAME', ['parties.sellers']));
    }
    checks.push(pass('seller_present', 'parties', 'RPA', 'At least one seller identified', `${e.parties.sellers.length} seller(s) found`));
  }

  if (e.parties.buyerAgents.length === 0) {
    issues.push(issue('WARN_BUYER_AGENT_PRESENT', ['parties.buyerAgents']));
  } else {
    const noLicense = e.parties.buyerAgents.filter((a) => !a.licenseNumber);
    if (noLicense.length > 0) {
      issues.push(issue('WARN_BUYER_AGENT_LICENSE', noLicense.map((_, i) => `parties.buyerAgents[${i}].licenseNumber`)));
    }
    checks.push(noLicense.length > 0
      ? pass('buyer_agent_license', 'parties', 'AD', 'Buyer agent(s) have DRE license number', `${noLicense.length} agent(s) missing DRE license number`)
      : pass('buyer_agent_license', 'parties', 'AD', 'Buyer agent(s) have DRE license number'));
  }

  if (e.parties.listingAgents.length === 0) {
    issues.push(issue('WARN_LISTING_AGENT_PRESENT', ['parties.listingAgents']));
  } else {
    const noLicense = e.parties.listingAgents.filter((a) => !a.licenseNumber);
    if (noLicense.length > 0) {
      issues.push(issue('WARN_LISTING_AGENT_LICENSE', noLicense.map((_, i) => `parties.listingAgents[${i}].licenseNumber`)));
    }
    checks.push(noLicense.length > 0
      ? pass('listing_agent_license', 'parties', 'AD', 'Listing agent(s) have DRE license number', `${noLicense.length} agent(s) missing DRE license number`)
      : pass('listing_agent_license', 'parties', 'AD', 'Listing agent(s) have DRE license number'));
  }

  if (e.parties.escrowCompanies.length === 0) {
    issues.push(issue('WARN_ESCROW_IDENTIFIED', ['parties.escrowCompanies']));
  } else {
    checks.push(pass('escrow_identified', 'parties', 'RPA', 'Escrow company identified'));
  }

  return { issues, checks };
}

function validateProperty(e: ExtractionResult): RuleResult {
  const issues: RuleIssue[] = [];
  const checks: ComplianceCheck[] = [];
  const pr = e.property;

  if (!pr.streetAddress) {
    issues.push(issue('BLOCKER_PROPERTY_STREET', ['property.streetAddress']));
  } else {
    checks.push(pass('property_street', 'property', 'RPA', 'Property street address present', pr.streetAddress));
  }

  if (!pr.city) {
    issues.push(issue('BLOCKER_PROPERTY_CITY', ['property.city']));
  } else {
    checks.push(pass('property_city', 'property', 'RPA', 'Property city present', pr.city));
  }

  if (!pr.state) {
    issues.push(issue('BLOCKER_PROPERTY_STATE', ['property.state']));
  } else {
    checks.push(pass('property_state', 'property', 'RPA', 'Property state present', pr.state));
  }

  if (!pr.postalCode) {
    issues.push(issue('WARN_PROPERTY_ZIP', ['property.postalCode']));
  } else {
    checks.push(pass('property_zip', 'property', 'RPA', 'Property postal code present', pr.postalCode));
  }

  if (!pr.apn) {
    issues.push(issue('WARN_PROPERTY_APN', ['property.apn']));
  } else {
    checks.push(pass('property_apn', 'property', 'RPA', 'APN present', pr.apn));
  }

  return { issues, checks };
}

function validateFinancial(e: ExtractionResult): RuleResult {
  const issues: RuleIssue[] = [];
  const checks: ComplianceCheck[] = [];
  const tr = e.transaction;

  if (!tr.purchasePrice || tr.purchasePrice <= 0) {
    issues.push(issue('BLOCKER_PURCHASE_PRICE', ['transaction.purchasePrice']));
  } else {
    checks.push(pass('purchase_price', 'financial', 'RPA', 'Purchase price present and positive', `$${tr.purchasePrice.toLocaleString()}`));
  }

  if (!tr.earnestMoneyAmount || tr.earnestMoneyAmount <= 0) {
    issues.push(issue('WARN_EARNEST_MONEY', ['transaction.earnestMoneyAmount']));
  } else if (tr.purchasePrice && tr.earnestMoneyAmount > tr.purchasePrice) {
    issues.push(issue('BLOCKER_EARNEST_MONEY_RATIO', ['transaction.earnestMoneyAmount', 'transaction.purchasePrice']));
  } else {
    checks.push(pass('earnest_money', 'financial', 'RPA', 'Initial deposit / earnest money specified', `$${tr.earnestMoneyAmount.toLocaleString()}`));
  }

  if (!tr.financingType) {
    issues.push(issue('WARN_FINANCING_TYPE', ['transaction.financingType']));
  } else {
    checks.push(pass('financing_type', 'financial', 'RPA', 'Financing type specified', tr.financingType));
    const isCash = /cash/i.test(tr.financingType);
    if (!isCash) {
      if (!tr.loanAmount || tr.loanAmount <= 0) {
        issues.push(issue('BLOCKER_LOAN_AMOUNT', ['transaction.loanAmount']));
      } else if (tr.purchasePrice && tr.loanAmount > tr.purchasePrice) {
        issues.push(issue('BLOCKER_LOAN_AMOUNT_RATIO', ['transaction.loanAmount', 'transaction.purchasePrice']));
      } else {
        const ltv = tr.purchasePrice ? Math.round((tr.loanAmount / tr.purchasePrice) * 100) : null;
        checks.push(pass('loan_amount', 'financial', 'RPA', 'Loan amount present for financed purchase',
          `$${tr.loanAmount.toLocaleString()}${ltv ? ` (${ltv}% LTV)` : ''}`));
      }
    } else {
      checks.push(skip('loan_amount', 'financial', 'RPA', 'Loan amount present for financed purchase', 'Cash transaction'));
    }
  }

  return { issues, checks };
}

function validateDates(e: ExtractionResult): RuleResult {
  const issues: RuleIssue[] = [];
  const checks: ComplianceCheck[] = [];
  const tr = e.transaction;

  const offerDate      = parseDate(tr.offerDate);
  const acceptanceDate = parseDate(tr.acceptanceDate);
  const closingDate    = parseDate(tr.closingDate);

  if (!offerDate) {
    issues.push(issue('BLOCKER_OFFER_DATE', ['transaction.offerDate']));
  } else {
    checks.push(pass('offer_date', 'dates', 'RPA', 'Offer date present and valid', tr.offerDate!));
  }

  if (!acceptanceDate) {
    issues.push(issue('WARN_ACCEPTANCE_DATE', ['transaction.acceptanceDate']));
  } else if (offerDate && acceptanceDate < offerDate) {
    issues.push(issue('BLOCKER_ACCEPTANCE_BEFORE_OFFER', ['transaction.acceptanceDate', 'transaction.offerDate']));
  } else {
    checks.push(pass('acceptance_date', 'dates', 'RPA', 'Acceptance date present and valid', tr.acceptanceDate!));
  }

  if (!closingDate) {
    issues.push(issue('BLOCKER_CLOSING_DATE', ['transaction.closingDate']));
  } else {
    const refDate = acceptanceDate ?? offerDate;
    if (refDate && closingDate <= refDate) {
      issues.push(issue('BLOCKER_CLOSING_BEFORE_ACCEPTANCE', ['transaction.closingDate', 'transaction.acceptanceDate']));
    } else {
      checks.push(pass('closing_date', 'dates', 'RPA', 'Close of escrow date present and valid', tr.closingDate!));
    }
  }

  return { issues, checks };
}

function resolveSignerRole(e: ExtractionResult, name: string): string {
  const buyerMatch = e.parties.buyers.some((b) => b.fullName === name);
  const sellerMatch = e.parties.sellers.some((s) => s.fullName === name);
  if (buyerMatch) return 'Buyer';
  if (sellerMatch) return 'Seller';
  return 'Signer';
}

function validateSignatures(e: ExtractionResult, uploadSource?: ValidationUploadSource): RuleResult {
  const issues: RuleIssue[] = [];
  const checks: ComplianceCheck[] = [];
  const s = e.signatures;
  // A Seller Agent upload only carries the seller's own execution — buyer
  // offer-signature requirements (Section 32D) are never enforced for it.
  const skipBuyer = uploadSource === 'seller_agent';

  // ── Rule 1: Signature exists but date is missing ────────────────────────
  for (const name of s.missingSignatureDates) {
    const role = resolveSignerRole(e, name);
    if (skipBuyer && role === 'Buyer') continue;
    const code = role === 'Buyer'
      ? 'BLOCKER_BUYER_SIGNATURE_DATE'
      : role === 'Seller'
        ? 'BLOCKER_SELLER_SIGNATURE_DATE'
        : 'WARN_SIGNATURE_DATE_MISSING';
    const section = role === 'Buyer' ? 'Buyer Offer Signature(s) (Section 32D)' : 'Seller Acceptance Signature(s) (Section 33D)';
    issues.push(issue(code, [
      `signatures.missingSignatureDates[${name}]`,
      `${role}: ${name}`,
    ], `${section}, Page 16`));
  }
  if (s.missingSignatureDates.length === 0) {
    const buyers = e.parties.buyers.map((b) => b.fullName).filter(Boolean) as string[];
    const sellers = e.parties.sellers.map((s2) => s2.fullName).filter(Boolean) as string[];
    if (s.buyerSigned && !buyers.some((n) => s.missingSignatureDates.includes(n))) {
      checks.push(pass('buyer_signature_date', 'signatures', 'RPA', 'Buyer signature date present'));
    }
    if (s.sellerSigned && !sellers.some((n) => s.missingSignatureDates.includes(n))) {
      checks.push(pass('seller_signature_date', 'signatures', 'RPA', 'Seller signature date present'));
    }
  }

  // ── Rule 2: Signature is missing entirely (BLOCKER) ─────────────────────
  for (const name of s.missingSignatures) {
    const role = resolveSignerRole(e, name);
    if (skipBuyer && role === 'Buyer') continue;
    const code = role === 'Buyer'
      ? 'BLOCKER_BUYER_SIGNATURE'
      : role === 'Seller'
        ? 'BLOCKER_SELLER_SIGNATURE'
        : 'WARN_SIGNATURE_MISSING';
    const section = role === 'Buyer' ? 'Buyer Offer Signature(s) (Section 32D)' : 'Seller Acceptance Signature(s) (Section 33D)';
    issues.push(issue(code, [
      `signatures.missingSignatures[${name}]`,
      `${role}: ${name}`,
    ], `${section}, Page 16`));
  }

  // Also check the top-level buyerSigned/sellerSigned booleans when
  // no individual names are tracked (backward compat)
  if (s.missingSignatures.length === 0) {
    if (!skipBuyer && !s.buyerSigned) {
      issues.push(issue('BLOCKER_BUYER_SIGNATURE', [
        'signatures.buyerSigned',
        'Buyer',
      ], 'Buyer Offer Signature(s) (Section 32D), Page 16'));
    }
    if (!s.sellerSigned) {
      issues.push(issue('BLOCKER_SELLER_SIGNATURE', [
        'signatures.sellerSigned',
        'Seller',
      ], 'Seller Acceptance Signature(s) (Section 33D), Page 16'));
    }
  }

  // ── Overall status ──────────────────────────────────────────────────────
  const buyerRequirementMet = skipBuyer || s.buyerSigned;
  if (s.missingSignatures.length === 0 && s.missingSignatureDates.length === 0
      && buyerRequirementMet && s.sellerSigned) {
    checks.push(pass('signatures_complete', 'signatures', 'RPA', 'All signatures and dates present'));
  }

  return { issues, checks };
}

function validateContingencies(e: ExtractionResult): RuleResult {
  const issues: RuleIssue[] = [];
  const checks: ComplianceCheck[] = [];
  const c = e.contractTerms;

  if (c.inspectionContingencyDays == null) {
    issues.push(issue('WARN_INSPECTION_CONTINGENCY', ['contractTerms.inspectionContingencyDays']));
  } else {
    checks.push(pass('inspection_contingency', 'contingencies', 'RPA', 'Inspection contingency period specified', `${c.inspectionContingencyDays} days`));
  }

  if (c.loanContingencyWaived) {
    checks.push(pass('loan_contingency', 'contingencies', 'RPA', 'Loan contingency period specified', 'No Contingency'));
  } else if (c.loanContingencyDays == null) {
    const isCash = e.transaction.financingType && /cash/i.test(e.transaction.financingType);
    if (isCash) {
      checks.push(skip('loan_contingency', 'contingencies', 'RPA', 'Loan contingency period specified or waived', 'Cash transaction'));
    } else {
      issues.push(issue('WARN_LOAN_CONTINGENCY', ['contractTerms.loanContingencyDays']));
    }
  } else {
    checks.push(pass('loan_contingency', 'contingencies', 'RPA', 'Loan contingency period specified', `${c.loanContingencyDays} days`));
  }

  if (c.appraisalContingencyWaived) {
    checks.push(pass('appraisal_contingency', 'contingencies', 'RPA', 'Appraisal contingency period specified', 'No Contingency'));
  } else if (c.appraisalContingencyDays == null) {
    issues.push(issue('WARN_APPRAISAL_CONTINGENCY', ['contractTerms.appraisalContingencyDays']));
  } else {
    checks.push(pass('appraisal_contingency', 'contingencies', 'RPA', 'Appraisal contingency period specified', `${c.appraisalContingencyDays} days`));
  }

  if (c.disclosuresDueDays == null) {
    issues.push(issue('WARN_DISCLOSURES_DUE', ['contractTerms.disclosuresDueDays']));
  } else {
    checks.push(pass('disclosures_due', 'contingencies', 'RPA', 'Disclosures due period specified', `${c.disclosuresDueDays} days`));
  }

  return { issues, checks };
}

function validateForms(e: ExtractionResult): RuleResult {
  const issues: RuleIssue[] = [];
  const checks: ComplianceCheck[] = [];
  const missing    = e.formsAndDisclosures.filter((f) => f.status === 'missing');
  const attached   = e.formsAndDisclosures.filter((f) => f.status === 'attached');
  const referenced = e.formsAndDisclosures.filter((f) => f.status === 'referenced');

  if (e.formsAndDisclosures.length === 0) {
    issues.push(issue('WARN_FORMS_FOUND', ['formsAndDisclosures']));
  } else {
    checks.push(pass('forms_found', 'forms_disclosures', 'RPA', 'Forms and disclosures identified',
      `${attached.length} attached, ${referenced.length} referenced, ${missing.length} missing`));
  }

  // Which referenced forms haven't been uploaded yet is a checklist concern
  // (TransactionFormTemplatesService), never a validation blocker/warning.

  return { issues, checks };
}

// ─── Phase 1: Per-form validators (AD, AVID, BIA, etc.) ──────────────────────

function validateAdExtraction(data: Record<string, unknown>): RuleResult {
  const issues: RuleIssue[] = [];
  const checks: ComplianceCheck[] = [];
  const confirmation = data['confirmation'] as Record<string, unknown> ?? data;

  const sellerAgent = (confirmation['listing_agent'] ?? confirmation['seller_agent']) as string | undefined;
  const buyerAgent = (confirmation['buyer_agent']) as string | undefined;

  if (!buyerAgent && !sellerAgent) {
    issues.push(issue('WARN_AD_AGENTS', ['confirmation.buyer_agent', 'confirmation.listing_agent']));
  } else {
    checks.push(pass('ad_agents', 'parties', 'AD', 'At least one agent identified in Agency Disclosure'));
  }

  return { issues, checks };
}

function validateAvidExtraction(data: Record<string, unknown>): RuleResult {
  const issues: RuleIssue[] = [];
  const checks: ComplianceCheck[] = [];
  const items = data['items_inspected'] as Record<string, unknown> ?? data;

  const hasDefects = items['visible_defects_noted'] === true;

  if (hasDefects) {
    issues.push(issue('WARN_AVID_DEFECTS', ['items_inspected.visible_defects_noted']));
  } else {
    checks.push(pass('avid_defects', 'property', 'AVID', 'Visible defects noted in AVID', 'No defects noted or AVID not yet reviewed'));
  }

  return { issues, checks };
}

function validateBiaExtraction(data: Record<string, unknown>): RuleResult {
  const issues: RuleIssue[] = [];
  const checks: ComplianceCheck[] = [];
  const signed = data['buyer_acknowledgement'] as Record<string, unknown> ?? data;

  const buyerInitials = (signed['buyer_initials'] ?? signed['buyer_signed']) as boolean | string | undefined;

  if (!buyerInitials) {
    issues.push(issue('WARN_BIA_ACKNOWLEDGMENT', ['buyer_acknowledgement.buyer_initials']));
  } else {
    checks.push(pass('bia_acknowledgment', 'signatures', 'BIA', 'Buyer acknowledged BIA'));
  }

  return { issues, checks };
}

function validateScoExtraction(data: Record<string, unknown>, formCode: string): RuleResult {
  const issues: RuleIssue[] = [];
  const checks: ComplianceCheck[] = [];
  const h = data['header'] as Record<string, unknown> ?? data;
  const p = data['parties'] as Record<string, unknown> ?? data;

  const propertyAddress = h['property_address'] as string | undefined;
  const buyerNames = p['buyer_names'] as string[] | undefined;
  const sellerNames = p['seller_names'] as string[] | undefined;
  const offerRef = data['offer_reference'] as Record<string, unknown> | undefined;
  const expiration = data['expiration'] as Record<string, unknown> | undefined;
  const sec4 = data['section_4_offer'] as Record<string, unknown> | undefined;
  const sec5 = data['section_5_acceptance'] as Record<string, unknown> | undefined;

  if (!propertyAddress) {
    issues.push(issue('WARN_SCO_PROPERTY_ADDRESS', ['header.property_address']));
  } else {
    checks.push(pass('sco_property_address', 'property', 'SCO', 'Property address identified on counter offer'));
  }

  if (!buyerNames || buyerNames.length === 0) {
    issues.push(issue('WARN_SCO_BUYER_NAMES', ['parties.buyer_names']));
  } else {
    checks.push(pass('sco_buyer_names', 'parties', 'SCO', 'Buyer name(s) identified on counter offer'));
  }

  if (!sellerNames || sellerNames.length === 0) {
    issues.push(issue('WARN_SCO_SELLER_NAMES', ['parties.seller_names']));
  } else {
    checks.push(pass('sco_seller_names', 'parties', 'SCO', 'Seller name(s) identified on counter offer'));
  }

  if (!offerRef || !offerRef['referenced_form_code']) {
    issues.push(issue('WARN_SCO_OFFER_REFERENCE', ['offer_reference.referenced_form_code']));
  } else {
    checks.push(pass('sco_offer_reference', 'forms_disclosures', 'SCO', 'Referenced offer identified on counter offer'));
  }

  const offerorDate1 = sec4?.['offeror_1_signature_date'] as string | undefined;
  const offerorDate2 = sec4?.['offeror_2_signature_date'] as string | undefined;
  if (!offerorDate1 && !offerorDate2) {
    issues.push(issue('WARN_SCO_OFFEROR_SIGNATURE', ['section_4_offer.offeror_1_signature_date', 'section_4_offer.offeror_2_signature_date']));
  } else {
    checks.push(pass('sco_offeror_signature', 'signatures', 'SCO', 'Offeror signed counter offer'));
  }

  const acceptorDate1 = sec5?.['acceptor_1_signature_date'] as string | undefined;
  const acceptorDate2 = sec5?.['acceptor_2_signature_date'] as string | undefined;
  if (!acceptorDate1 && !acceptorDate2) {
    issues.push(issue('WARN_SCO_ACCEPTOR_SIGNATURE', ['section_5_acceptance.acceptor_1_signature_date', 'section_5_acceptance.acceptor_2_signature_date']));
  } else {
    checks.push(pass('sco_acceptor_signature', 'signatures', 'SCO', 'Acceptor signed counter offer'));
  }

  if (!expiration || !expiration['expiration_date']) {
    issues.push(issue('WARN_SCO_EXPIRATION', ['expiration.expiration_date']));
  } else {
    checks.push(pass('sco_expiration', 'forms_disclosures', 'SCO', 'Counter offer expiration date identified'));
  }

  // Revision check applies to whichever form codes have a configured
  // requirement in REQUIRED_FORM_REVISIONS (currently SCO, BCO, SMCO — not
  // BMCO, which shares this same extraction shape but has no configured
  // revision requirement, so checkRequiredRevision no-ops for it).
  const revision = (h['form_version'] as string | null | undefined) ?? null;
  const revisionResult = checkRequiredRevision(
    formCode,
    revision,
    'header.form_version',
    `BLOCKER_${formCode}_INVALID_REVISION`,
    `${formCode.toLowerCase()}_form_revision`,
  );
  issues.push(...revisionResult.issues);
  checks.push(...revisionResult.checks);

  return { issues, checks };
}

function validatePerForm(extraction: FormExtractionOutput): RuleResult {
  const code = extraction.formCode.toUpperCase();
  const data = extraction.data as Record<string, unknown>;

  switch (code) {
    case 'AD':
      return validateAdExtraction(data);
    case 'AVID':
      return validateAvidExtraction(data);
    case 'BIA':
      return validateBiaExtraction(data);
    case 'SCO':
    case 'BCO':
    case 'SMCO':
    case 'BMCO':
      return validateScoExtraction(data, code);
    default:
      return { issues: [], checks: [] };
  }
}

// ─── Phase 2: Cross-form validators ──────────────────────────────────────────

interface NormalizedPartyField {
  formCode: string;
  buyerNames: string[];
  sellerNames: string[];
  buyerAgentNames: string[];
  listingAgentNames: string[];
  streetAddress: string | null;
  city: string | null;
}

function normalizePartyField(extraction: FormExtractionOutput): NormalizedPartyField | null {
  const code = extraction.formCode.toUpperCase();
  const d = extraction.data as Record<string, unknown>;

  if (d['parties'] && d['property'] && d['transaction']) {
    const er = d as unknown as ExtractionResult;
    return {
      formCode: code,
      buyerNames: er.parties.buyers.map((b) => b.fullName).filter(Boolean) as string[],
      sellerNames: er.parties.sellers.map((s) => s.fullName).filter(Boolean) as string[],
      buyerAgentNames: er.parties.buyerAgents.map((a) => a.fullName).filter(Boolean) as string[],
      listingAgentNames: er.parties.listingAgents.map((a) => a.fullName).filter(Boolean) as string[],
      streetAddress: er.property.streetAddress,
      city: er.property.city,
    };
  }

  const p = (d['parties'] ?? {}) as Record<string, unknown>;
  const a = (d['agency'] ?? {}) as Record<string, unknown>;
  const h = (d['header'] ?? {}) as Record<string, unknown>;
  const c = (d['confirmation'] ?? {}) as Record<string, unknown>;

  const buyerAgent = (a['buyer_agent'] as string) ?? (c['buyer_agent'] as string) ?? null;
  const listingAgent = (a['seller_agent'] as string) ?? (c['listing_agent'] as string) ?? (c['seller_agent'] as string) ?? null;

  return {
    formCode: code,
    buyerNames: Array.isArray(p['buyer_names']) ? p['buyer_names'] as string[] : [],
    sellerNames: Array.isArray(p['seller_names']) ? p['seller_names'] as string[] : [],
    buyerAgentNames: [buyerAgent].filter(Boolean),
    listingAgentNames: [listingAgent].filter(Boolean),
    streetAddress: (h['property_address'] as string) ?? null,
    city: (h['city'] as string) ?? null,
  };
}

function normalizePartyFields(extractions: FormExtractionOutput[]): NormalizedPartyField[] {
  return extractions.map(normalizePartyField).filter((n): n is NormalizedPartyField => n !== null);
}

function validateCrossForm(extractions: FormExtractionOutput[]): RuleResult {
  const issues: RuleIssue[] = [];
  const checks: ComplianceCheck[] = [];
  const fields = normalizePartyFields(extractions);

  if (fields.length < 2) return { issues, checks };

  const rpa = fields.find((f) => f.formCode === 'RPA');
  if (!rpa) return { issues, checks };

  for (const other of fields) {
    if (other.formCode === 'RPA') continue;

    const buyerOverlap = rpa.buyerNames.some((n) =>
      other.buyerNames.some((on) => n.toLowerCase().includes(on.toLowerCase()) || on.toLowerCase().includes(n.toLowerCase())),
    );
    if (!buyerOverlap && other.buyerNames.length > 0) {
      issues.push(issue('WARN_CROSS_BUYER_NAMES', [`RPA.buyerNames`, `${other.formCode}.buyerNames`]));
    }

    const sellerOverlap = rpa.sellerNames.some((n) =>
      other.sellerNames.some((on) => n.toLowerCase().includes(on.toLowerCase()) || on.toLowerCase().includes(n.toLowerCase())),
    );
    if (!sellerOverlap && other.sellerNames.length > 0) {
      issues.push(issue('WARN_CROSS_SELLER_NAMES', [`RPA.sellerNames`, `${other.formCode}.sellerNames`]));
    }

    const agentOverlap = rpa.buyerAgentNames.some((n) =>
      other.buyerAgentNames.some((on) => n.toLowerCase().includes(on.toLowerCase()) || on.toLowerCase().includes(n.toLowerCase())),
    );
    if (!agentOverlap && other.buyerAgentNames.length > 0) {
      issues.push(issue('WARN_CROSS_BUYER_AGENT', [`RPA.buyerAgentNames`, `${other.formCode}.buyerAgentNames`]));
    }
  }

  return { issues, checks };
}

// ─── Form revision validation (configuration-driven) ──────────────────────────

/**
 * Compare an extracted form revision against the required revision for that
 * form code (from REQUIRED_FORM_REVISIONS — the only place the required
 * value lives). Blocks when the revision is missing/unreadable or doesn't
 * match; passes when it matches; no-ops entirely when the form code has no
 * configured requirement (e.g. BMCO today).
 *
 * `blockerCode` is the catalog code to raise — callers supply it because it
 * varies per form (BLOCKER_RPA_INVALID_REVISION, BLOCKER_SCO_INVALID_REVISION,
 * etc.), each with its own formCode-specific message in the catalog.
 * `missingDetail`, when supplied, replaces the default "revision unreadable"
 * detail text — used by RPA to report a header/footer conflict instead.
 */
function checkRequiredRevision(
  formCode: string,
  revision: string | null,
  fieldPath: string,
  blockerCode: string,
  passRuleId: string,
  missingDetail?: string,
): RuleResult {
  const issues: RuleIssue[] = [];
  const checks: ComplianceCheck[] = [];

  const required = REQUIRED_FORM_REVISIONS[formCode];
  if (!required) return { issues, checks };

  if (!revision) {
    issues.push(issue(
      blockerCode,
      [fieldPath, `required_revision=${required}`],
      missingDetail ?? `Form footer — revision unreadable (required ${required})`,
    ));
    return { issues, checks };
  }

  if (revision === required) {
    checks.push(pass(passRuleId, 'forms_disclosures', formCode, `${formCode} is the required Revised ${required} version`));
  } else {
    issues.push(issue(
      blockerCode,
      [fieldPath, `detected_revision=${revision}`, `required_revision=${required}`],
      `Form footer — detected ${revision} (required ${required})`,
    ));
  }

  return { issues, checks };
}

function validateRpaFormRevision(
  extractions: FormExtractionOutput[],
  pipelineExtractions?: FormExtractionResult[],
): RuleResult {
  const issues: RuleIssue[] = [];
  const checks: ComplianceCheck[] = [];

  // First try: find form_metadata in the normalized extractions data
  let rawData: UnknownRecord | null = null;
  const rpaExtraction = extractions.find((e) => e.formCode.toUpperCase() === 'RPA');
  if (rpaExtraction) {
    const d = rpaExtraction.data as UnknownRecord;
    if (d['form_metadata']) rawData = d;
  }

  // Second try: find form_metadata in the raw pipeline extractions (not normalized)
  if (!rawData && pipelineExtractions) {
    const rawRpa = pipelineExtractions.find(
      (e) => e.formCode.toUpperCase() === 'RPA' && e.output?.data,
    );
    if (rawRpa?.output?.data) {
      const d = rawRpa.output.data as UnknownRecord;
      if (d['form_metadata']) rawData = d;
    }
  }

  if (!rawData) {
    checks.push(skip('rpa_form_revision', 'forms_disclosures', 'RPA', 'Form revision check skipped — form_metadata not available'));
    return { issues, checks };
  }

  const metadata = asRecord(rawData['form_metadata']);
  const revision = asString(metadata['form_revision']);
  const revisionLabel = asString(metadata['form_revision_label']);
  const required = REQUIRED_FORM_REVISIONS.RPA;

  // Form metadata present but revision is missing/unreadable — includes
  // header/footer conflict (LLM sets form_revision to null on conflict).
  const missingDetail = revisionLabel
    ? `Form header — conflicting revisions: ${revisionLabel} (required ${required})`
    : undefined;

  const result = checkRequiredRevision('RPA', revision, 'form_metadata.form_revision', 'BLOCKER_RPA_INVALID_REVISION', 'rpa_form_revision', missingDetail);
  issues.push(...result.issues);
  checks.push(...result.checks);
  return { issues, checks };
}

/**
 * Validates RPA logical Page 17's Escrow Holder Acknowledgment section — the
 * section the escrow company itself fills in and signs after acceptance.
 *
 * Page 17 is located purely via the upstream RPA page-routing pipeline
 * (FormIdentifier reads each physical page's OWN printed footer, e.g.
 * "...RPA PAGE 17 OF 17", via a deterministic regex — see
 * DETERMINISTIC_FORM_PATTERNS in form-identifier.ts) — never a physical PDF
 * page index. `escrow_holder_acknowledgment` only appears in the merged RPA
 * extraction data when a page whose own footer identified it as logical
 * page 17 was actually found in the submitted RPA and routed to
 * rpaPage17's extraction schema; its absence here IS "Page 17 is missing".
 *
 * Pushes a single `rpa_page17_escrow_completed` check ('pass' only when both
 * the escrow/company info AND the escrow holder's own signature are present,
 * 'skipped' otherwise) — this is the one signal the "Signed RPA" checklist
 * item on the Escrow Upload Link reads to decide completion (see
 * isRpaEscrowPage17Completed in apps/api). This section is routinely still
 * blank early in a transaction, so every incomplete case here is only ever a
 * warning, never a blocker — an incomplete Page 17 must never block the
 * transaction workflow, only leave the checklist item outstanding.
 */
function validateRpaPage17EscrowAcknowledgment(
  extractions: FormExtractionOutput[],
  pipelineExtractions?: FormExtractionResult[],
): RuleResult {
  const issues: RuleIssue[] = [];
  const checks: ComplianceCheck[] = [];

  // Page 17's escrow_holder_acknowledgment is merged onto the top-level RPA
  // extraction data (it isn't nested under execution_review like the
  // footer-initials pages).
  let rawData: UnknownRecord | null = null;
  const rpaExtraction = extractions.find((e) => e.formCode.toUpperCase() === 'RPA');
  if (rpaExtraction) {
    const d = rpaExtraction.data as UnknownRecord;
    if (d['escrow_holder_acknowledgment']) rawData = d;
  }

  if (!rawData && pipelineExtractions) {
    const rawRpa = pipelineExtractions.find(
      (e) => e.formCode.toUpperCase() === 'RPA' && e.output?.data,
    );
    if (rawRpa?.output?.data) {
      const d = rawRpa.output.data as UnknownRecord;
      if (d['escrow_holder_acknowledgment']) rawData = d;
    }
  }

  if (!rawData) {
    checks.push(skip('rpa_page17_escrow_completed', 'parties', 'RPA', 'RPA logical Page 17 (Escrow Holder Acknowledgment) was not found in the submitted RPA'));
    return { issues, checks };
  }

  const escrow = asRecord(rawData['escrow_holder_acknowledgment']);
  const escrowHolderName = asString(escrow['escrow_holder_name']);
  const escrowNumber = asString(escrow['escrow_number']);
  const escrowSignerName = asString(escrow['by_name']);
  const hasEscrowInfo = !!(escrowHolderName || escrowNumber);
  const hasEscrowSignature = !!escrowSignerName;

  if (!hasEscrowInfo) {
    issues.push(issue(
      'WARN_RPA_MISSING_ESCROW_INFO',
      ['escrow_holder_acknowledgment.escrow_holder_name', 'escrow_holder_acknowledgment.escrow_number'],
      'RPA page 17, Escrow Holder Acknowledgment',
    ));
  } else if (!hasEscrowSignature) {
    issues.push(issue(
      'WARN_RPA_PAGE17_ESCROW_SIGNATURE_MISSING',
      ['escrow_holder_acknowledgment.by_name'],
      'RPA page 17, Escrow Holder Acknowledgment',
    ));
  }

  if (hasEscrowInfo && hasEscrowSignature) {
    checks.push(pass('rpa_page17_escrow_completed', 'parties', 'RPA', 'RPA page 17 Escrow Holder Acknowledgment completed and signed'));
  } else {
    checks.push(skip(
      'rpa_page17_escrow_completed',
      'parties',
      'RPA',
      !hasEscrowInfo
        ? 'RPA page 17 Escrow Holder Acknowledgment is blank — no escrow company information found'
        : 'RPA page 17 Escrow Holder Acknowledgment is missing the escrow holder signature',
    ));
  }

  return { issues, checks };
}

// ─── Public: run all contract-stage checks across all extractions ────────────

/**
 * Validates required initials on the RPA — Liquidated Damages and Arbitration
 * clauses require handwritten initials from both buyer and seller.
 */
function validateInitials(e: ExtractionResult, uploadSource?: ValidationUploadSource): RuleResult {
  const issues: RuleIssue[] = [];
  const checks: ComplianceCheck[] = [];

  const init = e.initials;
  if (!init) {
    return { issues, checks };
  }

  // A Seller Agent upload only carries the seller's own execution.
  const skipBuyer = uploadSource === 'seller_agent';

  if (init.liquidatedDamagesBuyer === true) {
    checks.push(pass('init_buyer_ld', 'initials', 'RPA', 'Buyer initialed Liquidated Damages'));
  } else if (init.liquidatedDamagesBuyer === false && !skipBuyer) {
    issues.push(issue('BLOCKER_INITIAL_BUYER_LD', [
      'initials.liquidatedDamagesBuyer',
      'Buyer',
    ], 'Paragraph 29, RPA Page 15'));
  }

  if (init.liquidatedDamagesSeller === true) {
    checks.push(pass('init_seller_ld', 'initials', 'RPA', 'Seller initialed Liquidated Damages'));
  } else if (init.liquidatedDamagesSeller === false) {
    issues.push(issue('BLOCKER_INITIAL_SELLER_LD', [
      'initials.liquidatedDamagesSeller',
      'Seller',
    ], 'Paragraph 29, RPA Page 15'));
  }

  if (init.arbitrationBuyer === true) {
    checks.push(pass('init_buyer_ar', 'initials', 'RPA', 'Buyer initialed Arbitration'));
  } else if (init.arbitrationBuyer === false && !skipBuyer) {
    issues.push(issue('BLOCKER_INITIAL_BUYER_AR', [
      'initials.arbitrationBuyer',
      'Buyer',
    ], 'Paragraph 31, RPA Page 15'));
  }

  if (init.arbitrationSeller === true) {
    checks.push(pass('init_seller_ar', 'initials', 'RPA', 'Seller initialed Arbitration'));
  } else if (init.arbitrationSeller === false) {
    issues.push(issue('BLOCKER_INITIAL_SELLER_AR', [
      'initials.arbitrationSeller',
      'Seller',
    ], 'Paragraph 31, RPA Page 15'));
  }

  return { issues, checks };
}

// ─── Page-level initials validation ───────────────────────────────────────

interface InitialsCheckResult {
  issues: RuleIssue[];
  checks: ComplianceCheck[];
}

function checkInitialsGroup(
  parent: UnknownRecord,
  role: 'buyer' | 'seller',
  expectedCount: number | null,
  pageNumber: number,
  location: string,
  /**
   * Distinguishes the zone this initials group belongs to on the page — page 15
   * alone has three independent initials requirements (paragraph 29, paragraph
   * 31, and the page footer), each of which can be present at once. Without this
   * in the check id, two zones on the same page/role/slot would collide on the
   * exact same id (React key collision downstream, and one check silently
   * clobbering the other in any id-keyed lookup).
   */
  zoneKey: string,
): InitialsCheckResult {
  const issues: RuleIssue[] = [];
  const checks: ComplianceCheck[] = [];

  const initialsGroup = asRecord(parent[`${role}_initials`]);
  if (!initialsGroup || Object.keys(initialsGroup).length === 0) {
    return { issues, checks };
  }

  for (let i = 1; i <= 2; i++) {
    const slot = asRecord(initialsGroup[`slot_${i}`]);
    if (!slot || Object.keys(slot).length === 0) continue;

    // If expected count is known and this slot is beyond what's needed, skip
    if (expectedCount !== null && i > expectedCount) continue;

    const initialsPresent = slot['initials_present'] === true;
    const partyNumber = i;
    const roleLabel = role === 'buyer' ? 'Buyer' : 'Seller';
    const fieldPath = `${role}_initials.slot_${i}.initials_present`;
    const evidence = [fieldPath, `${roleLabel} ${partyNumber}`, `RPA page ${pageNumber}`];
    if (typeof slot['mark_type'] === 'string') evidence.push(`mark_type: ${slot['mark_type']}`);
    if (typeof slot['visual_evidence'] === 'string' && slot['visual_evidence']) {
      evidence.push(`visual_evidence: ${slot['visual_evidence']}`);
    }

    if (initialsPresent) {
      checks.push(pass(
        `rpa_pg${pageNumber}_${zoneKey}_${role}_${partyNumber}_initials`,
        'initials',
        'RPA',
        `${roleLabel} ${partyNumber} initialed RPA page ${pageNumber}`,
      ));
      continue;
    }

    // initials_present is false: the extraction reported this slot as
    // clearly, visibly blank. Classification is strictly binary — a required
    // slot is either present or it produces a missing-initials blocker.
    const blockerCode = role === 'buyer'
      ? 'BLOCKER_RPA_BUYER_INITIALS_MISSING'
      : 'BLOCKER_RPA_SELLER_INITIALS_MISSING';
    issues.push(issue(blockerCode, evidence, location));
  }

  return { issues, checks };
}

function validateRpaPageInitials(
  data: UnknownRecord,
  expectedBuyerCount: number | null,
  expectedSellerCount: number | null,
  pipelineExtractions?: FormExtractionResult[],
  uploadSource?: ValidationUploadSource,
): RuleResult {
  const issues: RuleIssue[] = [];
  const checks: ComplianceCheck[] = [];
  // A Seller Agent upload only carries the seller's own execution — the
  // buyer footer-initials groups are never checked for it.
  const skipBuyer = uploadSource === 'seller_agent';
  const buyerCount = skipBuyer ? null : expectedBuyerCount;

  // Need at least one expected count to validate
  if (buyerCount === null && expectedSellerCount === null) {
    checks.push(skip('rpa_page_initials', 'initials', 'RPA', 'Party counts unknown — page-level initials validation skipped'));
    return { issues, checks };
  }

  // Try to find execution_review in the provided data (normalized).
  // Fall back to raw pipeline extraction data when normalized data lacks it.
  let rawData: UnknownRecord = data;
  const hasExecReview = Boolean(data['execution_review']);
  if (!hasExecReview && pipelineExtractions) {
    const rawRpa = pipelineExtractions.find(
      (e) => e.formCode.toUpperCase() === 'RPA' && e.output?.data,
    );
    if (rawRpa?.output?.data) {
      const d = rawRpa.output.data as UnknownRecord;
      if (d['execution_review']) rawData = d;
    }
  }

  const er = asRecord(rawData['execution_review']);
  if (!er || Object.keys(er).length === 0) {
    checks.push(skip('rpa_page_initials', 'initials', 'RPA', 'No execution_review data — page-level initials validation skipped'));
    return { issues, checks };
  }

  // ── Pages 4–14: Per-page footer initials under unique page_X_footer_initials keys ──
  // The page definitions were updated so each page stores its footer initials
  // under a unique top-level key (page_4_footer_initials, page_5_footer_initials, etc.)
  // to avoid deep-merge collision. Iterate all matching keys.
  for (let p = 4; p <= 14; p++) {
    const footerKey = `page_${p}_footer_initials`;
    const pageFooter = asRecord(rawData[footerKey]);
    if (!pageFooter || Object.keys(pageFooter).length === 0) continue;

    if (buyerCount !== null) {
      const r = checkInitialsGroup(pageFooter, 'buyer', buyerCount, p, `RPA page ${p} footer`, 'footer');
      issues.push(...r.issues);
      checks.push(...r.checks);
    }
    if (expectedSellerCount !== null) {
      const r = checkInitialsGroup(pageFooter, 'seller', expectedSellerCount, p, `RPA page ${p} footer`, 'footer');
      issues.push(...r.issues);
      checks.push(...r.checks);
    }
  }

  // ── Legacy fallback: flat initials under execution_review (before page-definition update) ──
  const legacyBuyer = asRecord(er['buyer_initials']);
  const legacySeller = asRecord(er['seller_initials']);
  if (legacyBuyer && Object.keys(legacyBuyer).length > 0 && buyerCount !== null) {
    const r = checkInitialsGroup(er, 'buyer', buyerCount, 14, 'RPA page 14 footer (legacy)', 'legacy');
    issues.push(...r.issues);
    checks.push(...r.checks);
  }
  if (legacySeller && Object.keys(legacySeller).length > 0 && expectedSellerCount !== null) {
    const r = checkInitialsGroup(er, 'seller', expectedSellerCount, 14, 'RPA page 14 footer (legacy)', 'legacy');
    issues.push(...r.issues);
    checks.push(...r.checks);
  }

  // ── Zone: Page 15 paragraph 29 (Liquidated Damages) ───────────────────
  const s29 = asRecord(er['section_29_liquidated_damages']);
  if (s29 && Object.keys(s29).length > 0) {
    if (buyerCount !== null) {
      const r = checkInitialsGroup(s29, 'buyer', buyerCount, 15, 'Paragraph 29 (Liquidated Damages), RPA Page 15', 'section29');
      issues.push(...r.issues);
      checks.push(...r.checks);
    }
    if (expectedSellerCount !== null) {
      const r = checkInitialsGroup(s29, 'seller', expectedSellerCount, 15, 'Paragraph 29 (Liquidated Damages), RPA Page 15', 'section29');
      issues.push(...r.issues);
      checks.push(...r.checks);
    }
  }

  // ── Zone: Page 15 paragraph 31 (Arbitration of Disputes) ─────────────
  const s31 = asRecord(er['section_31_arbitration_of_disputes']);
  if (s31 && Object.keys(s31).length > 0) {
    if (buyerCount !== null) {
      const r = checkInitialsGroup(s31, 'buyer', buyerCount, 15, 'Paragraph 31 (Arbitration of Disputes), RPA Page 15', 'section31');
      issues.push(...r.issues);
      checks.push(...r.checks);
    }
    if (expectedSellerCount !== null) {
      const r = checkInitialsGroup(s31, 'seller', expectedSellerCount, 15, 'Paragraph 31 (Arbitration of Disputes), RPA Page 15', 'section31');
      issues.push(...r.issues);
      checks.push(...r.checks);
    }
  }

  // ── Zone: Page 15 footer initials ─────────────────────────────────────
  const pf = asRecord(er['page_footer_initials']);
  if (pf && Object.keys(pf).length > 0) {
    if (buyerCount !== null) {
      const r = checkInitialsGroup(pf, 'buyer', buyerCount, 15, 'RPA page 15, footer initials', 'footer');
      issues.push(...r.issues);
      checks.push(...r.checks);
    }
    if (expectedSellerCount !== null) {
      const r = checkInitialsGroup(pf, 'seller', expectedSellerCount, 15, 'RPA page 15, footer initials', 'footer');
      issues.push(...r.issues);
      checks.push(...r.checks);
    }
  }

  return { issues, checks };
}

/**
 *
 * `failCount` = number of blockers (things that prevent stage advancement)
 * `warningCount` = number of warnings (things needing attention)
 */
export function buildSummary(
  checks: ComplianceCheck[],
  blockers: BlockerOutput[],
  warnings: WarningOutput[],
): ComplianceSummary {
  const overallStatus = blockers.length > 0 ? 'non_compliant' : warnings.length > 0 ? 'needs_review' : 'compliant';
  return {
    overallStatus,
    passCount: checks.filter((c) => c.status === 'pass').length,
    failCount: blockers.length,
    warningCount: warnings.length,
    skippedCount: checks.filter((c) => c.status === 'skipped').length,
  };
}

export function validateContractStage(
  extractions: FormExtractionOutput[],
  contractDocuments?: ContractDocumentExtraction[],
  pipelineExtractions?: FormExtractionResult[],
  uploadSource?: ValidationUploadSource,
): ComplianceResult {
  const rpa = extractions.find((e) => e.formCode.toUpperCase() === 'RPA');
  const normalized = rpa ? normalizeToExtractionResult(rpa.data as Record<string, unknown>) : null;

  const results: RuleResult[] = [];

  // Phase 1: Per-form validation — each form type's internal data quality
  for (const extraction of extractions) {
    results.push(validatePerForm(extraction));
  }

  // Phase 2: Cross-form validation — consistency across forms
  results.push(validateCrossForm(extractions));

  // Phase 3: Stage-level RPA validation against normalized data
  if (normalized) {
    results.push(validateParties(normalized));
    results.push(validateProperty(normalized));
    results.push(validateFinancial(normalized));
    results.push(validateDates(normalized));
    results.push(validateSignatures(normalized, uploadSource));
    results.push(validateInitials(normalized, uploadSource));
    results.push(validateRpaPageInitials(
      rpa!.data as UnknownRecord,
      normalized.parties.buyers.length,
      normalized.parties.sellers.length,
      pipelineExtractions,
      uploadSource,
    ));
    results.push(validateContingencies(normalized));
    results.push(validateForms(normalized));
  }

  // Phase 3a: RPA form revision check against raw extraction data
  results.push(validateRpaFormRevision(extractions, pipelineExtractions));

  // Phase 3a2: RPA page 17 escrow holder acknowledgment check
  results.push(validateRpaPage17EscrowAcknowledgment(extractions, pipelineExtractions));

  // Whether an expected companion form (Seller Counter Offer, Back-Up Offer
  // Addendum, etc.) has actually been uploaded is a checklist concern
  // (TransactionFormTemplatesService), never a validation blocker/warning.

  const merged = merge(results);
  const { blockers, warnings, checks } = resolveIssues(merged.issues, merged.checks);

  // Phase 4: Contract negotiation chain validation
  const chainWarnings: WarningOutput[] = [];
  if (contractDocuments && contractDocuments.length > 0) {
    const chainResult = validateContractChain(contractDocuments, pipelineExtractions ?? null);
    for (const msg of chainResult.warnings) {
      // Map chain warning messages to catalog codes
      let code: string;
      if (msg.startsWith('Final accepted document not found')) {
        code = 'WARN_CHAIN_FINAL_NOT_FOUND';
      } else if (msg.startsWith('Later Seller Counter Offer')) {
        code = 'WARN_CHAIN_LATER_SCO_NOT_ACCEPTED';
      } else if (msg.startsWith('Counteroffer uploaded but not fully accepted')) {
        code = 'WARN_CHAIN_COUNTER_NOT_ACCEPTED';
      } else if (msg.startsWith('Multiple counters found')) {
        code = 'WARN_CHAIN_MULTIPLE_SCO_AMBIGUOUS';
      } else {
        code = 'WARN_CHAIN_FINAL_NOT_FOUND';
      }
      const w = resolveContractWarning(code, [msg]);
      if (w) {
        chainWarnings.push(w);
        checks.push({
          ruleId: w.code,
          category: 'forms_disclosures',
          formCode: 'RPA',
          phase: 'contract',
          severity: 'warning',
          status: 'warning',
          label: w.message,
          detail: msg,
          fields: [msg],
        });
      }
    }
  }

  // Phase 5: Package-level duplicate document detection
  if (contractDocuments && contractDocuments.length > 1) {
    const duplicateRuleResult = validateDuplicateDocuments(contractDocuments);
    const duplicateResolved = resolveIssues(duplicateRuleResult.issues, duplicateRuleResult.checks);
    blockers.push(...duplicateResolved.blockers);
    warnings.push(...duplicateResolved.warnings);
    checks.push(...duplicateResolved.checks);
  }

  const allWarnings = [...warnings, ...chainWarnings];

  return {
    sourceType: 'llm_extraction',
    hasAcroForm: false,
    acroFieldCount: 0,
    checks,
    blockers,
    warnings: allWarnings,
    summary: buildSummary(checks, blockers, allWarnings),
    signatureFields: [],
    emptyRequiredAcroFields: [],
  };
}
