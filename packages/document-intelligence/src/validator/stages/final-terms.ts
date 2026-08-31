import type { ContractDocumentExtraction, ContractContingencyInfo, ExtractedContractField } from '../../extractor/extractor.types';
import type { FormExtractionResult } from '../../pipeline/pipeline.types';
import type { ComplianceCheck } from '../validator.types';
import { sortNegotiationChain, type NegotiationChainDocument } from './contract-chain';
import { addBusinessAdjustedDays, addBusinessDays } from './business-day.util';

// ─── Types ──────────────────────────────────────────────────────────────────

export type FinalTermKey =
  | 'loan'
  | 'appraisal'
  | 'inspection'
  | 'insurance'
  | 'sellerDocumentReview'
  | 'titleReview'
  | 'hoaReview'
  | 'disclosuresDue'
  | 'emdInitialDeposit';

export type FinalTermStatus = 'Contingent' | 'No contingency' | 'Removed' | 'N/A' | 'Needs Review';

export interface FinalTermSource {
  documentId: string;
  fileName: string;
  formCode: string;
  versionNo: number;
  pageNumber: number | null;
  section: string | null;
}

export interface FinalTerm {
  key: FinalTermKey;
  label: string;
  status: FinalTermStatus;
  days: number | null;
  dayType: 'calendar' | 'business' | null;
  deadline: string | null;
  source: FinalTermSource | null;
  conflict: boolean;
}

/**
 * Scalar (non-day-count) negotiated values — price, dates, credits — resolved
 * by the same later-document-wins chain walk as `terms`, consolidated into
 * this one resolver (decision C) instead of the three separate mergers that
 * used to compute these independently (`contract-chain.ts`'s
 * `resolveFinalTerms`, `contract-terms-merge.util.ts`'s `mergeContractTerms`).
 */
export type FinalValueKey =
  | 'purchasePrice'
  | 'offerDate'
  | 'closeOfEscrow'
  | 'possession'
  | 'sellerCreditToBuyer'
  | 'initialDeposit';

export interface FinalValueTerm<T = unknown> {
  key: FinalValueKey;
  label: string;
  value: T | null;
  source: FinalTermSource | null;
}

export interface FinalNegotiatedTerms {
  acceptanceDate: string | null;
  terms: FinalTerm[];
  valueTerms: FinalValueTerm[];
  resolvedFrom: string[];
}

/**
 * A term joined with its validation/compliance status for display or
 * debugging — a pure, read-only, OPTIONAL join. `resolveFinalNegotiatedTerms`
 * itself never accepts compliance/blocker input (extraction and validation
 * stay independent at the top level, per the package's core guarantee); call
 * this separately only where a UI needs to show both side by side. A failed
 * validation must never change `term.value` — callers should read `term`,
 * never a `defaultValue`, when reporting the resolved value alongside a
 * blocker.
 */
export interface ResolvedContractTerm<T> {
  term: FinalValueTerm<T>;
  validation: {
    status: 'pass' | 'blocker' | 'unknown';
    checks: ComplianceCheck[];
  };
}

/**
 * Pure join — attaches whatever ComplianceChecks are relevant to this term's
 * key to the already-resolved term, without ever touching `term.value`.
 */
export function attachValidation<T>(
  term: FinalValueTerm<T>,
  relevantChecks: ComplianceCheck[],
): ResolvedContractTerm<T> {
  if (relevantChecks.length === 0) {
    return { term, validation: { status: 'unknown', checks: [] } };
  }
  const status = relevantChecks.some((c) => c.status === 'fail') ? 'blocker' : 'pass';
  return { term, validation: { status, checks: relevantChecks } };
}

/**
 * Raw per-document fields with no equivalent on the normalized
 * `ContractDocumentExtraction.extractedTerms` shape — sourced from the same
 * `metadataJson.extraction.contractTerms` JSONB that
 * `contract-terms-merge.util.ts` reads on the API side, so the two can never
 * diverge on these two fields.
 */
export interface FinalTermsRawContractTerms {
  disclosuresDueDays: number | null;
  initialDepositBusinessDays: number | null;
}

export interface FinalTermsInputDocument {
  document: ContractDocumentExtraction;
  /** Row id of the TransactionDocumentEntity this normalized document was built from. */
  documentId: string;
  versionNo: number;
  rawContractTerms?: FinalTermsRawContractTerms | null;
}

/** A completed CR-B (Contingency Removal) affecting one specific contingency. */
export interface FinalTermsCrRemoval {
  key: 'loan' | 'appraisal' | 'inspection';
  documentId: string;
  fileName: string;
  versionNo: number;
}

export interface ResolveFinalNegotiatedTermsOptions {
  /** Completed CR-B removals — caller resolves the CR-B → contingency-key association (mirrors ContingenciesView.tsx's validateCrForm/document bucketing) since that logic depends on document classification that lives outside this package. */
  crRemovals?: FinalTermsCrRemoval[];
  /** Raw per-file pipeline extractions — passed straight through to sortNegotiationChain for counter-number detection from form data. */
  extractions?: FormExtractionResult[] | null;
}

// ─── Term metadata ──────────────────────────────────────────────────────────

const TERM_LABELS: Record<FinalTermKey, string> = {
  loan: 'Loan Contingency',
  appraisal: 'Appraisal Contingency',
  inspection: 'Inspection Contingency',
  insurance: 'Insurance Contingency',
  sellerDocumentReview: 'Review of Seller Documents',
  titleReview: 'Preliminary Title Report Review',
  hoaReview: 'Common Interest Disclosures (HOA) Review',
  disclosuresDue: 'Disclosures to Be Delivered',
  emdInitialDeposit: 'Initial Deposit (EMD)',
};

const CONTINGENCY_KEYS: readonly FinalTermKey[] = ['loan', 'appraisal', 'inspection', 'insurance'];
const REVIEW_KEYS: readonly FinalTermKey[] = ['sellerDocumentReview', 'titleReview', 'hoaReview'];

/** All contingency/review deadlines are calendar days per C.A.R. RPA §25; only the EMD/initial-deposit term is business days. */
function dayTypeFor(key: FinalTermKey): 'calendar' | 'business' {
  return key === 'emdInitialDeposit' ? 'business' : 'calendar';
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Parses a "N days" style deadline string (as produced by normalizeContractDocument) into a plain day count. */
function parseDaysString(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = /^\s*(\d+)\s*days?\s*$/i.exec(value);
  return match ? parseInt(match[1], 10) : null;
}

interface FieldContribution {
  status: FinalTermStatus | null;
  days: number | null;
  input: FinalTermsInputDocument;
}

function contingencyContribution(info: ContractContingencyInfo | null): { status: FinalTermStatus; days: number | null } | null {
  if (!info) return null;
  if (info.status === 'No contingency') return { status: 'No contingency', days: null };
  return { status: 'Contingent', days: parseDaysString(info.deadline) };
}

function reviewContribution(info: { deadline: string | null } | null): { status: FinalTermStatus; days: number | null } | null {
  if (!info || info.deadline == null) return null;
  return { status: 'Contingent', days: parseDaysString(info.deadline) };
}

function extractFieldValue(key: FinalTermKey, input: FinalTermsInputDocument): { status: FinalTermStatus; days: number | null } | null {
  const t = input.document.extractedTerms;
  switch (key) {
    case 'loan': return contingencyContribution(t.loanContingency);
    case 'appraisal': return contingencyContribution(t.appraisalContingency);
    case 'inspection': return contingencyContribution(t.inspectionContingency);
    case 'insurance': return contingencyContribution(t.insuranceContingency);
    case 'sellerDocumentReview': return reviewContribution(t.sellerDocumentReview);
    case 'titleReview': return reviewContribution(t.titleReview);
    case 'hoaReview': return reviewContribution(t.hoaReview);
    case 'disclosuresDue': {
      const days = input.rawContractTerms?.disclosuresDueDays ?? null;
      return days != null ? { status: 'Contingent', days } : null;
    }
    case 'emdInitialDeposit': {
      const days = input.rawContractTerms?.initialDepositBusinessDays ?? null;
      return days != null ? { status: 'Contingent', days } : null;
    }
    default: return null;
  }
}

function buildSource(input: FinalTermsInputDocument, section: string | null, pageNumber: number | null = null): FinalTermSource {
  return {
    documentId: input.documentId,
    fileName: input.document.fileName,
    formCode: `${input.document.documentType}${input.document.counterNumber > 0 ? `-${input.document.counterNumber}` : ''}`,
    versionNo: input.versionNo,
    pageNumber,
    section,
  };
}

// ─── Value-term (price/dates/credits) contributions ────────────────────────

const VALUE_TERM_LABELS: Record<FinalValueKey, string> = {
  purchasePrice: 'Purchase Price',
  offerDate: 'Offer Date',
  closeOfEscrow: 'Close of Escrow',
  possession: 'Possession',
  sellerCreditToBuyer: 'Seller Credit to Buyer',
  initialDeposit: 'Initial Deposit (EMD)',
};

interface ValueContribution<T> {
  value: T;
  input: FinalTermsInputDocument;
  page: number | null;
  section: string | null;
}

/**
 * Reads one value-term key off a document's extractedTerms — preferring the
 * richer `.fields` provenance (spec items 1-4) when present, falling back to
 * the legacy flat scalar permanently (not a temporary shim — pre-refactor
 * persisted `metadataJson` rows will never gain a `.fields` object).
 */
function extractValueContribution(key: FinalValueKey, input: FinalTermsInputDocument): ValueContribution<unknown> | null {
  const t = input.document.extractedTerms;
  const fields = t.fields;

  function fromField<T>(field: ExtractedContractField<T> | null | undefined, flatValue: T | null): ValueContribution<T> | null {
    if (field?.value != null) {
      return { value: field.value, input, page: field.source.page, section: null };
    }
    if (flatValue != null) return { value: flatValue, input, page: null, section: null };
    return null;
  }

  switch (key) {
    case 'purchasePrice': return fromField(fields?.purchasePrice, t.purchasePrice);
    case 'initialDeposit': return fromField(fields?.initialDeposit, t.initialDeposit);
    // sellerCreditToBuyer's `.fields` provenance is a raw number (spec item 3's
    // wrapped extraction field), while the flat scalar here is a formatted
    // "$X" display string — different shapes, so this key reads the flat
    // scalar directly rather than conflating the two.
    case 'sellerCreditToBuyer': return t.sellerCreditToBuyer != null ? { value: t.sellerCreditToBuyer, input, page: null, section: null } : null;
    case 'offerDate': return t.offerDate != null ? { value: t.offerDate, input, page: null, section: null } : null;
    case 'closeOfEscrow': return t.closeOfEscrow != null ? { value: t.closeOfEscrow, input, page: null, section: null } : null;
    case 'possession': return t.possession != null ? { value: t.possession, input, page: null, section: null } : null;
    default: return null;
  }
}

function sourceSectionFor(key: FinalTermKey, input: FinalTermsInputDocument): string | null {
  const overrides = input.document.extractedTerms.otherTermsOverrides;
  const contingencySource = overrides?.contingencySource;
  const overrideFieldByKey: Partial<Record<FinalTermKey, string>> = {
    loan: 'loanContingencyDays',
    appraisal: 'appraisalContingencyDays',
    inspection: 'inspectionContingencyDays',
    insurance: 'insuranceContingencyDays',
    sellerDocumentReview: 'sellerDocumentReviewDays',
    titleReview: 'titleReviewDays',
    hoaReview: 'hoaReviewDays',
  };
  const field = overrideFieldByKey[key];
  if (field && contingencySource?.[field]) return contingencySource[field];
  return input.document.documentType === 'RPA' ? null : 'Other Terms';
}

// ─── Resolver ───────────────────────────────────────────────────────────────

/**
 * Resolve the single, authoritative Final Negotiated Terms for a transaction
 * from its full set of contract-family documents (RPA plus any SCO/BCO/SMCO/
 * BMCO counter-offers and amendments).
 *
 * Walks the same negotiation chain used everywhere else in this package
 * (`sortNegotiationChain`) and applies later-document-wins precedence
 * PER FIELD (not per document) — a later document that only restates one
 * field changes just that field, leaving every other field's value from
 * whichever earlier document last set it. This mirrors
 * `contract-terms-merge.util.ts`'s `mergeContractTerms` semantics exactly so
 * the API's event/reminder scheduling and this resolver can never diverge.
 */
export function resolveFinalNegotiatedTerms(
  inputDocuments: FinalTermsInputDocument[],
  options: ResolveFinalNegotiatedTermsOptions = {},
): FinalNegotiatedTerms {
  const byExtractedTerms = new Map<ContractDocumentExtraction['extractedTerms'], FinalTermsInputDocument>(
    inputDocuments.map((d) => [d.document.extractedTerms, d]),
  );

  const chain: NegotiationChainDocument[] = sortNegotiationChain(
    inputDocuments.map((d) => d.document),
    options.extractions ?? null,
  );

  // Acceptance date is read once and is immutable thereafter — the first
  // non-null value encountered walking the chain in order (RPA first, unless
  // the RPA itself has none and a later document supplies it — but it is
  // NEVER overwritten once set, matching mergeContractTerms's rule).
  let acceptanceDate: string | null = null;
  for (const nd of chain) {
    if (acceptanceDate) break;
    if (nd.extractedTerms?.acceptanceDate) acceptanceDate = nd.extractedTerms.acceptanceDate;
    else if (nd.acceptanceDate) acceptanceDate = nd.acceptanceDate;
  }

  const resolvedFrom = new Set<string>();
  const crRemovalByKey = new Map((options.crRemovals ?? []).map((r) => [r.key, r]));

  const allKeys: FinalTermKey[] = [...CONTINGENCY_KEYS, ...REVIEW_KEYS, 'disclosuresDue', 'emdInitialDeposit'];
  const terms: FinalTerm[] = allKeys.map((key) => {
    const contributions: FieldContribution[] = [];
    for (const nd of chain) {
      if (!nd.extractedTerms) continue;
      const input = byExtractedTerms.get(nd.extractedTerms);
      if (!input) continue;
      const value = extractFieldValue(key, input);
      if (value) contributions.push({ ...value, input });
    }

    const crRemoval = (key === 'loan' || key === 'appraisal' || key === 'inspection') ? crRemovalByKey.get(key) : undefined;

    if (contributions.length === 0 && !crRemoval) {
      return {
        key, label: TERM_LABELS[key], status: 'N/A', days: null, dayType: null,
        deadline: null, source: null, conflict: false,
      };
    }

    const last = contributions[contributions.length - 1] ?? null;
    if (last) resolvedFrom.add(last.input.documentId);

    if (crRemoval) {
      resolvedFrom.add(crRemoval.documentId);
      return {
        key, label: TERM_LABELS[key], status: 'Removed', days: null, dayType: null, deadline: null,
        source: { documentId: crRemoval.documentId, fileName: crRemoval.fileName, formCode: 'CR-B', versionNo: crRemoval.versionNo, pageNumber: null, section: null },
        conflict: false,
      };
    }

    const lastNd = chain.find((nd) => nd.extractedTerms && byExtractedTerms.get(nd.extractedTerms) === last!.input)!;
    const conflict = lastNd.unlinked;

    if (last!.status === 'No contingency') {
      return {
        key, label: TERM_LABELS[key], status: conflict ? 'Needs Review' : 'No contingency',
        days: null, dayType: null, deadline: null,
        source: buildSource(last!.input, sourceSectionFor(key, last!.input)), conflict,
      };
    }

    const days = last!.days;
    const dayType = dayTypeFor(key);
    const deadline = (acceptanceDate && days != null && !conflict)
      ? isoDate(dayType === 'business'
          ? addBusinessDays(new Date(acceptanceDate), days)
          : addBusinessAdjustedDays(new Date(acceptanceDate), days))
      : null;

    return {
      key, label: TERM_LABELS[key],
      status: conflict ? 'Needs Review' : (days != null ? 'Contingent' : 'N/A'),
      days, dayType: days != null ? dayType : null, deadline,
      source: buildSource(last!.input, sourceSectionFor(key, last!.input)),
      conflict,
    };
  });

  const valueKeys: FinalValueKey[] = ['purchasePrice', 'offerDate', 'closeOfEscrow', 'possession', 'sellerCreditToBuyer', 'initialDeposit'];
  const valueTerms: FinalValueTerm[] = valueKeys.map((key) => {
    let last: ValueContribution<unknown> | null = null;
    for (const nd of chain) {
      if (!nd.extractedTerms) continue;
      const input = byExtractedTerms.get(nd.extractedTerms);
      if (!input) continue;
      const contribution = extractValueContribution(key, input);
      if (contribution) last = contribution;
    }

    if (!last) {
      return { key, label: VALUE_TERM_LABELS[key], value: null, source: null };
    }

    resolvedFrom.add(last.input.documentId);
    return {
      key,
      label: VALUE_TERM_LABELS[key],
      value: last.value,
      source: buildSource(last.input, last.section, last.page),
    };
  });

  return {
    acceptanceDate,
    terms,
    valueTerms,
    resolvedFrom: [...resolvedFrom],
  };
}

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
