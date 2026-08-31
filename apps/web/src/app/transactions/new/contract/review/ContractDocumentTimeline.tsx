'use client';

import { useState, useMemo } from 'react';
import { FileText, ChevronDown, ChevronUp, ArrowRight, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fmtDate } from './review-shared';
import type { ContractDocumentExtraction, ContractDocumentExtractedTerms, OtherTermsOverrides, PackageValidationIssue } from '../../extraction-result.types';

const HIERARCHY_LABELS: Record<string, string> = {
  RPA: 'Purchase Agreement',
  SCO: 'Seller Counter Offer',
  SMCO: 'Seller Multiple Counter Offer',
  BCO: 'Buyer Counter Offer',
  BMCO: 'Buyer Multiple Counter Offer',
};

const DOC_COLORS: Record<string, { cardBorder: string; badge: string; badgeText: string; dot: string; arrow: string }> = {
  RPA:  { cardBorder: 'border-blue-400', badge: 'bg-blue-100', badgeText: 'text-blue-700', dot: 'bg-blue-500', arrow: 'text-blue-400' },
  SCO:  { cardBorder: 'border-amber-400', badge: 'bg-amber-100', badgeText: 'text-amber-700', dot: 'bg-amber-500', arrow: 'text-amber-400' },
  SMCO: { cardBorder: 'border-amber-400', badge: 'bg-amber-100', badgeText: 'text-amber-700', dot: 'bg-amber-500', arrow: 'text-amber-400' },
  BCO:  { cardBorder: 'border-purple-400', badge: 'bg-purple-100', badgeText: 'text-purple-700', dot: 'bg-purple-500', arrow: 'text-purple-400' },
  BMCO: { cardBorder: 'border-purple-400', badge: 'bg-purple-100', badgeText: 'text-purple-700', dot: 'bg-purple-500', arrow: 'text-purple-400' },
};

const FINAL_COLORS = { cardBorder: 'border-emerald-400', badge: 'bg-emerald-100', badgeText: 'text-emerald-700', dot: 'bg-emerald-500', arrow: 'text-emerald-400' };

interface ComparableField {
  key: string;
  label: string;
  fmt: (v: unknown) => string | null;
}

const COMPARABLE_FIELDS: ComparableField[] = [
  { key: 'purchasePrice', label: 'Purchase Price', fmt: (v) => v != null ? `$${(v as number).toLocaleString()}` : null },
  { key: 'acceptanceDate', label: 'Acceptance Date', fmt: (v) => fmtDate(v as string | null) },
  { key: 'closeOfEscrow', label: 'Close of Escrow', fmt: (v) => v as string | null },
  { key: 'initialDeposit', label: 'Initial Deposit', fmt: (v) => v != null ? `$${(v as number).toLocaleString()}` : null },
  { key: 'sellerCreditToBuyer', label: 'Seller Credit', fmt: (v) => v as string | null },
  { key: 'possession', label: 'Possession', fmt: (v) => v as string | null },
  { key: 'buyerBrokerCompensation', label: 'Buyer Broker Comp', fmt: (v) => v as string | null },
  { key: 'loanContingency', label: 'Loan Contingency', fmt: (v) => {
    if (!v) return null;
    const c = v as { status: string; deadline: string | null };
    return c.deadline ?? c.status;
  }},
  { key: 'appraisalContingency', label: 'Appraisal Contingency', fmt: (v) => {
    if (!v) return null;
    const c = v as { status: string; deadline: string | null };
    return c.deadline ?? c.status;
  }},
  { key: 'inspectionContingency', label: 'Inspection Contingency', fmt: (v) => {
    if (!v) return null;
    const c = v as { status: string; deadline: string | null };
    return c.deadline ?? c.status;
  }},
  { key: 'insuranceContingency', label: 'Insurance Contingency', fmt: (v) => {
    if (!v) return null;
    const c = v as { status: string; deadline: string | null };
    return c.deadline ?? c.status;
  }},
  { key: 'sellerDocumentReview', label: 'Seller Doc Review', fmt: (v) => {
    if (!v) return null;
    return (v as { deadline: string | null }).deadline;
  }},
  { key: 'titleReview', label: 'Title Review', fmt: (v) => {
    if (!v) return null;
    return (v as { deadline: string | null }).deadline;
  }},
  { key: 'hoaReview', label: 'HOA Review', fmt: (v) => {
    if (!v) return null;
    return (v as { deadline: string | null }).deadline;
  }},
];

function sortByHierarchy(docs: ContractDocumentExtraction[]): (ContractDocumentExtraction & { unlinked?: boolean })[] {
  // Deduplicate by fileName + normalized documentType.
  // Counter-offer variants form a family: SCO/SMCO and BCO/BMCO are
  // equivalent for dedup (same physical document, different LLM classification).
  // counterNumber is excluded from the key because two extraction results
  // from the same PDF can disagree on it (one reads form data, the other doesn't).
  function dedupType(t: string): string {
    if (t === 'SCO' || t === 'SMCO') return 'SCO';
    if (t === 'BCO' || t === 'BMCO') return 'BCO';
    return t;
  }
  const seen = new Set<string>();
  const unique = docs.filter((d) => {
    const key = `${d.fileName}::${dedupType(d.documentType)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (unique.length !== docs.length) {
    console.log(`[sortByHierarchy] Removed ${docs.length - unique.length} duplicates from input`);
  }

  const rpa = unique.filter((d) => d.documentType === 'RPA');
  const counters = unique.filter((d) => d.documentType !== 'RPA');

  console.log(`[sortByHierarchy] Input: ${docs.length} docs (unique: ${unique.length}, ${rpa.length} RPA, ${counters.length} counters)`);
  for (const d of unique) {
    console.log(`  ${d.documentType} #${d.counterNumber} seq=${d.sequenceOrder} ref=${d.referencedFormCode ?? 'none'}:${d.referencedCounterOfferNumber ?? 'none'}`);
  }

  const result: (ContractDocumentExtraction & { unlinked?: boolean })[] = [...rpa];
  if (counters.length === 0) return result;

  const allCountersHaveZero = counters.length > 1 && counters.every((d) => d.counterNumber === 0);
  if (allCountersHaveZero) {
    console.log(`[sortByHierarchy] All counters have number=0 — reassigning from sequence`);
    const isScoLike = (d: ContractDocumentExtraction) => d.documentType === 'SCO' || d.documentType === 'SMCO';
    let scoRound = 0;
    for (const doc of rpa) {
      // skip RPA — always 0
    }
    for (const doc of counters) {
      if (isScoLike(doc)) {
        scoRound++;
        (doc as { counterNumber: number }).counterNumber = scoRound;
      } else {
        (doc as { counterNumber: number }).counterNumber = scoRound > 0 ? scoRound : 1;
      }
      console.log(`  reassigned ${doc.documentType} → counterNumber=${doc.counterNumber}`);
    }
  }

  const placed = new Set<number>();
  let round = 0;
  const isScoLike = (d: ContractDocumentExtraction) => d.documentType === 'SCO' || d.documentType === 'SMCO';
  while (placed.size < counters.length && round < 100) {
    round++;
    let placedThisRound = false;
    console.log(`[sortByHierarchy] Round ${round} (${counters.length - placed.size} remaining)`);

    for (let i = 0; i < counters.length; i++) {
      if (placed.has(i)) continue;
      const doc = counters[i];

      let targetIndex: number | null = null;
      let reason = '';

      if (doc.referencedFormCode && doc.referencedFormCode !== doc.documentType) {
        const refCounterRaw = doc.referencedCounterOfferNumber != null
          ? parseInt(doc.referencedCounterOfferNumber, 10)
          : NaN;
        const refCounter = Number.isNaN(refCounterRaw) ? 0 : refCounterRaw;
        const refKey = `${doc.referencedFormCode}:${refCounter}`;

        for (let j = result.length - 1; j >= 0; j--) {
          const existing = result[j];
          const existingKey = `${existing.documentType}:${existing.counterNumber}`;
          if (existingKey === refKey) {
            targetIndex = j + 1;
            reason = `ref-exact(${refKey} at pos ${j})`;
            break;
          }
        }

        if (targetIndex == null) {
          console.log(`  [${doc.documentType}] ref=${refKey} → no exact match — falling to counter-number ordering`);
        }
      } else if (doc.referencedFormCode && doc.referencedFormCode === doc.documentType) {
        console.log(`  [${doc.documentType}] self-reference — using alternation fallback`);
      }

      if (targetIndex == null) {
        let insertAt = result.length;
        for (let j = result.length - 1; j >= 0; j--) {
          if (result[j].documentType === 'RPA') {
            insertAt = j + 1;
            reason = `counter-after-RPA(${doc.counterNumber})`;
            break;
          }
          const prevIsScoLike = isScoLike(result[j]);
          const currIsScoLike = isScoLike(doc);

          if (doc.counterNumber > result[j].counterNumber) {
            insertAt = j + 1;
            reason = `counter-num(${doc.counterNumber} > ${result[j].counterNumber} at ${result[j].documentType})`;
            break;
          }
          if (doc.counterNumber === result[j].counterNumber && prevIsScoLike && !currIsScoLike) {
            insertAt = j + 1;
            reason = `counter-intra(${doc.documentType} after ${result[j].documentType} in round ${doc.counterNumber})`;
            break;
          }
          if (doc.counterNumber < result[j].counterNumber) {
            insertAt = j;
          }
        }
        if (!reason) reason = 'counter-end';
        targetIndex = insertAt;
      }

      if (targetIndex != null && targetIndex <= result.length) {
        console.log(`  ✓ ${doc.documentType} #${doc.counterNumber} → pos ${targetIndex} (${reason})`);
        (doc as ContractDocumentExtraction & { unlinked?: boolean }).unlinked = false;
        result.splice(targetIndex, 0, doc);
        placed.add(i);
        placedThisRound = true;
      }
    }

    if (!placedThisRound) {
      console.log(`[sortByHierarchy] No docs placed in round ${round} — flagging ${counters.length - placed.size} remaining as unlinked`);
      for (let i = 0; i < counters.length; i++) {
        if (!placed.has(i)) {
          const unlinkedDoc = { ...counters[i], unlinked: true };
          result.push(unlinkedDoc);
          placed.add(i);
          console.log(`  ⚠ ${counters[i].documentType} #${counters[i].counterNumber} → UNLINKED`);
        }
      }
      break;
    }
  }

  console.log(`[sortByHierarchy] Final (${result.length}): ${result.map(r => `${r.documentType}#${r.counterNumber}${(r as {unlinked?:boolean}).unlinked ? '[U]' : ''}`).join(' → ')}`);
  return result;
}

interface FieldChange {
  key: string;
  label: string;
  from: string | null;
  to: string | null;
  fromOtherTerms: boolean;
}

function computeChanges(prev: (ContractDocumentExtraction & { unlinked?: boolean }) | null, curr: ContractDocumentExtraction & { unlinked?: boolean }): FieldChange[] {
  if (!prev) return [];
  const changes: FieldChange[] = [];
  const overrides = curr.extractedTerms.otherTermsOverrides;
  for (const f of COMPARABLE_FIELDS) {
    const prevVal = f.fmt((prev.extractedTerms as unknown as Record<string, unknown>)[f.key]);
    const currVal = f.fmt((curr.extractedTerms as unknown as Record<string, unknown>)[f.key]);
    // null in the current document means the field was not mentioned — keep prior value active
    if (currVal == null) continue;
    if (prevVal !== currVal) {
      const fromOtherTerms = overrides != null && isOverriddenByOtherTerms(f.key, overrides);
      changes.push({ key: f.key, label: f.label, from: prevVal, to: currVal, fromOtherTerms });
    }
  }
  return changes;
}

function isOverriddenByOtherTerms(key: string, overrides: OtherTermsOverrides): boolean {
  switch (key) {
    case 'purchasePrice': return overrides.purchasePrice != null;
    case 'closeOfEscrow': return overrides.closeOfEscrow != null;
    case 'initialDeposit': return overrides.initialDeposit != null;
    case 'sellerCreditToBuyer': return overrides.sellerCreditToBuyer != null;
    case 'possession': return overrides.possession != null;
    case 'buyerBrokerCompensation': return overrides.buyerBrokerCompensation != null;
    case 'loanContingency': return overrides.loanContingencyWaived != null || overrides.loanContingencyDays != null;
    case 'appraisalContingency': return overrides.appraisalContingencyWaived != null || overrides.appraisalContingencyDays != null;
    case 'inspectionContingency': return overrides.inspectionContingencyDays != null;
    case 'insuranceContingency': return overrides.insuranceContingencyDays != null;
    case 'sellerDocumentReview': return overrides.sellerDocumentReviewDays != null;
    case 'titleReview': return overrides.titleReviewDays != null;
    case 'hoaReview': return overrides.hoaReviewDays != null;
    default: return false;
  }
}

interface FinalTerms {
  acceptanceDate: string | null;
  purchasePrice: number | null;
  closeOfEscrow: string | null;
  initialDeposit: number | null;
  possession: string | null;
  sellerCreditToBuyer: string | null;
  buyerBrokerCompensation: string | null;
  loanContingency: { status: string; deadline: string | null } | null;
  appraisalContingency: { status: string; deadline: string | null } | null;
  inspectionContingency: { status: string; deadline: string | null } | null;
  insuranceContingency: { status: string; deadline: string | null } | null;
  sellerDocumentReview: { deadline: string | null } | null;
  titleReview: { deadline: string | null } | null;
  hoaReview: { deadline: string | null } | null;
  /**
   * Per-field source tracking — maps field name to the source doc's
   * otherTermsOverrides.contingencySource (if the value came from Other Terms),
   * e.g. "BCO Other Terms", "SCO Other Terms".
   */
  contingencySource: Record<string, string>;
}

function computeFinalTerms(docs: (ContractDocumentExtraction & { unlinked?: boolean })[]): FinalTerms {
  const reversed = [...docs].reverse();
  const t: FinalTerms = {
    acceptanceDate: null, purchasePrice: null, closeOfEscrow: null,
    initialDeposit: null, possession: null, sellerCreditToBuyer: null,
    buyerBrokerCompensation: null,
    loanContingency: null, appraisalContingency: null, inspectionContingency: null,
    insuranceContingency: null, sellerDocumentReview: null, titleReview: null, hoaReview: null,
    contingencySource: {},
  };
  for (const doc of reversed) {
    if ((doc as { unlinked?: boolean }).unlinked) continue;
    const et = doc.extractedTerms;
    const src = et.otherTermsOverrides?.contingencySource ?? {};
    if (t.acceptanceDate == null && et.acceptanceDate) t.acceptanceDate = et.acceptanceDate;
    if (t.purchasePrice == null && et.purchasePrice != null) t.purchasePrice = et.purchasePrice;
    if (t.closeOfEscrow == null && et.closeOfEscrow) t.closeOfEscrow = et.closeOfEscrow;
    if (t.initialDeposit == null && et.initialDeposit != null) t.initialDeposit = et.initialDeposit;
    if (t.possession == null && et.possession) t.possession = et.possession;
    if (t.sellerCreditToBuyer == null && et.sellerCreditToBuyer) t.sellerCreditToBuyer = et.sellerCreditToBuyer;
    if (t.buyerBrokerCompensation == null && et.buyerBrokerCompensation) t.buyerBrokerCompensation = et.buyerBrokerCompensation;
    if (t.loanContingency == null && et.loanContingency) {
      t.loanContingency = et.loanContingency;
      if (src.loanContingencyDays) t.contingencySource.loanContingency = src.loanContingencyDays;
    }
    if (t.appraisalContingency == null && et.appraisalContingency) {
      t.appraisalContingency = et.appraisalContingency;
      if (src.appraisalContingencyDays) t.contingencySource.appraisalContingency = src.appraisalContingencyDays;
    }
    if (t.inspectionContingency == null && et.inspectionContingency) {
      t.inspectionContingency = et.inspectionContingency;
      if (src.inspectionContingencyDays) t.contingencySource.inspectionContingency = src.inspectionContingencyDays;
    }
    if (t.insuranceContingency == null && et.insuranceContingency) {
      t.insuranceContingency = et.insuranceContingency;
      if (src.insuranceContingencyDays) t.contingencySource.insuranceContingency = src.insuranceContingencyDays;
    }
    if (t.sellerDocumentReview == null && et.sellerDocumentReview) {
      t.sellerDocumentReview = et.sellerDocumentReview;
      if (src.sellerDocumentReviewDays) t.contingencySource.sellerDocumentReview = src.sellerDocumentReviewDays;
    }
    if (t.titleReview == null && et.titleReview) {
      t.titleReview = et.titleReview;
      if (src.titleReviewDays) t.contingencySource.titleReview = src.titleReviewDays;
    }
    if (t.hoaReview == null && et.hoaReview) t.hoaReview = et.hoaReview;
  }
  if (t.possession == null && t.closeOfEscrow) t.possession = t.closeOfEscrow;
  return t;
}

function TimelineArrow({ color }: { color: string }) {
  return (
    <div className="flex items-center shrink-0 mx-1">
      <div className={cn('w-6 h-0.5', color)} />
      <ArrowRight size={14} className={cn('-ml-[3px]', color)} />
    </div>
  );
}

function TimelineCard({
  doc,
  isSelected,
  isLast,
  onClick,
}: {
  doc: ContractDocumentExtraction & { unlinked?: boolean };
  isSelected: boolean;
  isLast: boolean;
  onClick: () => void;
}) {
  const colors = doc.unlinked
    ? { cardBorder: 'border-red-300 border-dashed', badge: 'bg-red-100', badgeText: 'text-red-700', dot: 'bg-red-500', arrow: 'text-red-300' }
    : (DOC_COLORS[doc.documentType] ?? DOC_COLORS.RPA);
  return (
    <div className="flex items-center gap-0">
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'flex flex-col items-center gap-1.5 px-3 py-2.5 rounded-xl border-2 text-left transition-all shrink-0 w-32',
          doc.unlinked ? 'border-red-300 border-dashed bg-red-50/30' : colors.cardBorder,
          isSelected ? 'bg-white shadow-md ring-2 ring-blue-200' : 'bg-white hover:shadow-sm',
        )}
      >
        <span className={cn('text-[11px] font-bold px-2 py-0.5 rounded-full', colors.badge, colors.badgeText)}>
          {doc.documentType}{doc.counterNumber > 0 ? ` ${doc.counterNumber}` : ''}
          {doc.unlinked && (
            <span className="ml-1 text-[9px] font-medium text-red-500">⚠</span>
          )}
        </span>
        <span className="text-[10px] font-medium text-gray-600 text-center leading-tight">
          {HIERARCHY_LABELS[doc.documentType] ?? doc.documentType}
        </span>
        {doc.unlinked && (
          <span className="text-[9px] font-medium text-red-500 text-center leading-tight">
            Unlinked — review position
          </span>
        )}
        {doc.extractedTerms.purchasePrice != null && (
          <span className="text-[11px] font-semibold text-gray-900">
            ${doc.extractedTerms.purchasePrice.toLocaleString()}
          </span>
        )}
        <span className="text-[9px] text-gray-400 mt-1">More</span>
        <ChevronDown className="w-3 h-3 text-gray-400" />
      </button>
      {!isLast && <TimelineArrow color={colors.arrow} />}
    </div>
  );
}

function DetailGrid({ terms }: { terms: ContractDocumentExtractedTerms }) {
  const rows: { label: string; value: React.ReactNode }[] = [
    { label: 'Property Address', value: terms.propertyAddress },
    { label: 'Buyer', value: terms.buyerName },
    { label: 'Seller', value: terms.sellerName },
    { label: 'Date Prepared', value: fmtDate(terms.datePrepared) },
    { label: 'Acceptance Date', value: fmtDate(terms.acceptanceDate) },
    { label: 'Expiration Date', value: fmtDate(terms.expirationDate) },
    { label: 'Purchase Price', value: terms.purchasePrice != null ? `$${terms.purchasePrice.toLocaleString()}` : null },
    { label: 'Initial Deposit', value: terms.initialDeposit != null ? `$${terms.initialDeposit.toLocaleString()}` : null },
    { label: 'Close of Escrow', value: terms.closeOfEscrow },
    { label: 'Seller Credit', value: terms.sellerCreditToBuyer },
    { label: 'Buyer Broker Comp', value: terms.buyerBrokerCompensation },
    { label: 'Possession', value: terms.possession },
    { label: 'Seller Doc Review', value: terms.sellerDocumentReview?.deadline ?? null },
    { label: 'Title Review', value: terms.titleReview?.deadline ?? null },
    { label: 'HOA Review', value: terms.hoaReview?.deadline ?? null },
  ].filter((r) => r.value != null);

  if (rows.length === 0) return null;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3">
      {rows.map((r) => (
        <div key={r.label}>
          <dt className="text-[11px] font-medium text-gray-500 mb-0.5">{r.label}</dt>
          <dd className="text-sm text-gray-900">{r.value}</dd>
        </div>
      ))}
    </div>
  );
}

const CONTINGENCY_SOURCE_FIELDS: Record<string, string[]> = {
  Loan: ['loanContingencyDays', 'loanContingencyWaived'],
  Appraisal: ['appraisalContingencyDays', 'appraisalContingencyWaived'],
  Inspection: ['inspectionContingencyDays'],
  Insurance: ['insuranceContingencyDays'],
  'Seller Doc Review': ['sellerDocumentReviewDays'],
  'Title Review': ['titleReviewDays'],
};

function sourceForContingency(label: string, overrides: OtherTermsOverrides | null): string | null {
  if (!overrides?.contingencySource) return null;
  const fields = CONTINGENCY_SOURCE_FIELDS[label];
  if (!fields) return null;
  for (const f of fields) {
    const src = overrides.contingencySource[f];
    if (src) return src;
  }
  return null;
}

function ContingenciesBlock({ terms, overrides }: { terms: ContractDocumentExtractedTerms; overrides: OtherTermsOverrides | null }) {
  const items = [
    { label: 'Loan', value: terms.loanContingency },
    { label: 'Appraisal', value: terms.appraisalContingency },
    { label: 'Inspection', value: terms.inspectionContingency },
    { label: 'Insurance', value: terms.insuranceContingency },
  ].filter((x) => x.value != null);

  if (items.length === 0) return null;

  return (
    <div className="mt-3 pt-3 border-t border-gray-100">
      <dt className="text-[11px] font-medium text-gray-500 mb-1.5">Contingencies</dt>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {items.map((item) => {
          const src = sourceForContingency(item.label, overrides);
          return (
            <div key={item.label} className="bg-gray-50 rounded-lg px-2.5 py-2">
              <span className="text-[10px] font-medium text-gray-500">{item.label}</span>
              <div className="text-xs font-medium text-gray-800 mt-0.5">
                {item.value!.deadline ?? item.value!.status}
              </div>
              {src && (
                <div className="text-[9px] text-indigo-500 mt-0.5 font-medium">Source: {src}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const CHANGE_SOURCE_FIELDS: Record<string, string[]> = {
  loanContingency: ['loanContingencyDays', 'loanContingencyWaived'],
  appraisalContingency: ['appraisalContingencyDays', 'appraisalContingencyWaived'],
  inspectionContingency: ['inspectionContingencyDays'],
  insuranceContingency: ['insuranceContingencyDays'],
  sellerDocumentReview: ['sellerDocumentReviewDays'],
  titleReview: ['titleReviewDays'],
};

function sourceForChangeKey(key: string, overrides: OtherTermsOverrides | null): string | null {
  if (!overrides?.contingencySource) return null;
  const fields = CHANGE_SOURCE_FIELDS[key];
  if (!fields) return null;
  for (const f of fields) {
    const src = overrides.contingencySource[f];
    if (src) return src;
  }
  return null;
}

function ChangesBlock({ changes, prevDocType, overrides }: { changes: FieldChange[]; prevDocType: string; overrides: OtherTermsOverrides | null }) {
  if (changes.length === 0) return null;
  return (
    <div className="mt-3 pt-3 border-t border-gray-100">
      <dt className="text-[11px] font-medium text-amber-600 mb-1.5 flex items-center gap-1.5">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500" />
        Changes from {HIERARCHY_LABELS[prevDocType] ?? prevDocType}
      </dt>
      <div className="space-y-1.5">
        {changes.map((c) => {
          const src = c.fromOtherTerms ? sourceForChangeKey(c.key, overrides) : null;
          return (
            <div key={c.key} className="flex items-center gap-2 text-xs">
              <span className="text-gray-500 w-24 shrink-0">{c.label}</span>
              <span className="text-gray-400 line-through">{c.from ?? '—'}</span>
              <ArrowRight size={12} className="text-amber-500 shrink-0" />
              <span className="font-medium text-gray-900 flex items-center gap-1">
                {c.to ?? '—'}
                {src && (
                  <span className="text-[9px] text-indigo-500 font-normal">Source: {src}</span>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const OTHER_TERMS_OVERRIDE_LABELS: Record<keyof OtherTermsOverrides, string> = {
  purchasePrice: 'Purchase Price',
  closeOfEscrow: 'Close of Escrow',
  closeOfEscrowDays: 'Close of Escrow Days',
  possession: 'Possession',
  initialDeposit: 'Initial Deposit',
  increasedDeposit: 'Increased Deposit',
  sellerCreditToBuyer: 'Seller Credit',
  loanContingencyWaived: 'Loan Contingency Waived',
  loanContingencyDays: 'Loan Contingency Days',
  appraisalContingencyWaived: 'Appraisal Contingency Waived',
  appraisalContingencyDays: 'Appraisal Contingency Days',
  inspectionContingencyDays: 'Inspection Days',
  sellerDocumentReviewDays: 'Seller Doc Review Days',
  titleReviewDays: 'Title Review Days',
  insuranceContingencyDays: 'Insurance Days',
  hoaReviewDays: 'HOA Review Days',
  leasedLienedReviewDays: 'Leased/Liened Review Days',
  saleOfBuyersProperty: 'Sale of Buyer\'s Property',
  buyerBrokerCompensation: 'Buyer Broker Compensation',
  repairsOrCredits: 'Repairs / Credits',
  occupancyOrRentBack: 'Occupancy / Rent-Back',
  homeWarranty: 'Home Warranty',
  itemsIncludedOrExcluded: 'Items Included/Excluded',
  hoaTerms: 'HOA Terms',
  solarOrLeasedItems: 'Solar / Leased Items',
  otherDeadlinesOrObligations: 'Other Deadlines',
  contingencySource: 'Source',
};

function otherTermsOverrideFmt(key: keyof OtherTermsOverrides, value: unknown): string | null {
  if (value == null) return null;
  switch (key) {
    case 'purchasePrice':
    case 'initialDeposit':
    case 'increasedDeposit':
    case 'sellerCreditToBuyer':
      return `$${(value as number).toLocaleString()}`;
    case 'loanContingencyWaived':
    case 'appraisalContingencyWaived':
      return value ? 'No Contingency' : null;
    case 'saleOfBuyersProperty':
      return value ? 'Applies' : null;
    case 'closeOfEscrowDays':
    case 'loanContingencyDays':
    case 'appraisalContingencyDays':
    case 'inspectionContingencyDays':
    case 'sellerDocumentReviewDays':
    case 'titleReviewDays':
    case 'insuranceContingencyDays':
    case 'hoaReviewDays':
    case 'leasedLienedReviewDays':
      return `${value} days`;
    default:
      return String(value);
  }
}

function OtherTermsOverridesBlock({ overrides }: { overrides: OtherTermsOverrides }) {
  const items = (Object.keys(OTHER_TERMS_OVERRIDE_LABELS) as Array<keyof OtherTermsOverrides>)
    .filter((key) => key !== 'contingencySource')
    .map((key) => ({ key, label: OTHER_TERMS_OVERRIDE_LABELS[key], value: otherTermsOverrideFmt(key, overrides[key]) }))
    .filter((x) => x.value != null);

  if (items.length === 0) return null;

  return (
    <div className="mt-3 pt-3 border-t border-gray-100">
      <dt className="text-[11px] font-medium text-indigo-600 mb-1.5 flex items-center gap-1.5">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-indigo-500" />
        Modified via Other Terms
      </dt>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {items.map((item) => (
          <div key={item.key} className="bg-indigo-50/60 rounded-lg px-2.5 py-1.5">
            <span className="text-[10px] font-medium text-indigo-500">{item.label}</span>
            <div className="text-xs font-medium text-indigo-800 mt-0.5">{item.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SignaturesBlock({ signatures }: { signatures: ContractDocumentExtractedTerms['signatures'] }) {
  return (
    <div className="mt-3 pt-3 border-t border-gray-100">
      <dt className="text-[11px] font-medium text-gray-500 mb-1.5">Signatures</dt>
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="flex items-center gap-2">
          <span className={cn('w-2 h-2 rounded-full', signatures.buyerSigned ? 'bg-green-500' : 'bg-gray-300')} />
          <span className="text-gray-600">Buyer</span>
          {signatures.buyerSignedDate && <span className="text-gray-400">{fmtDate(signatures.buyerSignedDate)}</span>}
        </div>
        <div className="flex items-center gap-2">
          <span className={cn('w-2 h-2 rounded-full', signatures.sellerSigned ? 'bg-green-500' : 'bg-gray-300')} />
          <span className="text-gray-600">Seller</span>
          {signatures.sellerSignedDate && <span className="text-gray-400">{fmtDate(signatures.sellerSignedDate)}</span>}
        </div>
      </div>
    </div>
  );
}

function FinalAcceptedTerms({ terms }: { terms: FinalTerms }) {
  const rows: { label: string; value: React.ReactNode }[] = [
    { label: 'Acceptance Date', value: fmtDate(terms.acceptanceDate) },
    { label: 'Purchase Price', value: terms.purchasePrice != null ? `$${terms.purchasePrice.toLocaleString()}` : null },
    { label: 'Close of Escrow', value: terms.closeOfEscrow },
    { label: 'Deposit', value: terms.initialDeposit != null ? `$${terms.initialDeposit.toLocaleString()}` : null },
    { label: 'Possession', value: terms.possession },
    { label: 'Seller Credit', value: terms.sellerCreditToBuyer },
    { label: 'Buyer Broker Comp', value: terms.buyerBrokerCompensation },
  ];

  const contingencies = [
    { label: 'Loan', value: terms.loanContingency },
    { label: 'Appraisal', value: terms.appraisalContingency },
    { label: 'Inspection', value: terms.inspectionContingency },
    { label: 'Insurance', value: terms.insuranceContingency },
    { label: 'Seller Doc Review', value: terms.sellerDocumentReview },
    { label: 'Title Review', value: terms.titleReview },
    { label: 'HOA Review', value: terms.hoaReview },
  ].filter((x) => x.value != null);

  return (
    <div className={cn('rounded-xl border-2 border-emerald-400 bg-emerald-50/40 p-4')}>
      <div className="flex items-center gap-2 mb-3">
        <CheckCircle2 size={16} className="text-emerald-600" />
        <span className="text-sm font-semibold text-emerald-800">Final Accepted Terms</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3">
        {rows.map((r) => (
          <div key={r.label}>
            <dt className="text-[11px] font-medium text-emerald-600/70 mb-0.5">{r.label}</dt>
            <dd className={cn('text-sm font-medium', r.value != null ? 'text-emerald-900' : 'text-emerald-300')}>
              {r.value ?? '—'}
            </dd>
          </div>
        ))}
      </div>
      {contingencies.length > 0 && (
        <div className="mt-3 pt-3 border-t border-emerald-200">
          <dt className="text-[11px] font-medium text-emerald-600/70 mb-1.5">Contingencies</dt>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {contingencies.map((c) => {
              const v = c.value as { status?: string; deadline: string | null };
              const src = terms.contingencySource?.[{
                Loan: 'loanContingency',
                Appraisal: 'appraisalContingency',
                Inspection: 'inspectionContingency',
                Insurance: 'insuranceContingency',
                'Seller Doc Review': 'sellerDocumentReview',
                'Title Review': 'titleReview',
              }[c.label] ?? ''] ?? null;
              return (
                <div key={c.label} className="bg-white/70 rounded-lg px-2.5 py-1.5">
                  <span className="text-[10px] font-medium text-emerald-600/70">{c.label}</span>
                  <div className="text-xs font-medium text-emerald-800 mt-0.5">{v.deadline ?? v.status ?? '—'}</div>
                  {src && (
                    <div className="text-[9px] text-emerald-500 mt-0.5 font-medium">Source: {src}</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function BlockerPanel({ issues }: { issues: PackageValidationIssue[] }) {
  const blockers = issues.filter((i) => i.severity === 'blocker');
  if (blockers.length === 0) return null;

  return (
    <div className="mx-5 my-4 rounded-xl border-2 border-red-300 bg-red-50/60 p-4">
      <div className="flex items-center gap-2 mb-2">
        <XCircle size={16} className="text-red-500" />
        <span className="text-sm font-semibold text-red-800">Contract Package Blockers</span>
      </div>
      <div className="space-y-2">
        {blockers.map((issue, i) => (
          <div key={i} className="flex items-start gap-2.5 bg-white rounded-lg px-3 py-2 border border-red-200">
            <AlertTriangle size={14} className="text-red-400 mt-0.5 shrink-0" />
            <div>
              <div className="text-xs font-medium text-red-800">{issue.message}</div>
              {issue.detail && (
                <div className="text-[11px] text-red-600 mt-0.5">{issue.detail}</div>
              )}
              {issue.duplicateFiles && issue.duplicateFiles.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {issue.duplicateFiles.map((f: string, i: number) => (
                    <span key={`${f}-${i}`} className="text-[10px] font-mono bg-red-100 text-red-700 px-1.5 py-0.5 rounded">
                      {f}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ContractDocumentTimeline({
  contractDocuments,
  validationIssues,
  canCalculateFinalTerms = true,
}: {
  contractDocuments: ContractDocumentExtraction[];
  validationIssues?: PackageValidationIssue[];
  canCalculateFinalTerms?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(true);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const sorted = useMemo(() => sortByHierarchy(contractDocuments), [contractDocuments]);
  const selected = selectedIndex != null ? sorted[selectedIndex] ?? null : null;
  const changes = useMemo(() => {
    if (!selected || selectedIndex == null || selectedIndex === 0) return [];
    return computeChanges(sorted[selectedIndex - 1] ?? null, selected);
  }, [sorted, selected, selectedIndex]);
  const finalTerms = useMemo(() => computeFinalTerms(sorted), [sorted]);

  if (sorted.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      {/* ── Header ───────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <FileText size={15} className="text-blue-700 shrink-0" />
          <h2 className="text-sm font-semibold text-gray-900">Contract Documents</h2>
        </div>
        <button
          type="button"
          onClick={() => setIsOpen((v) => !v)}
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"
        >
          {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          {isOpen ? 'Hide' : `${sorted.length} documents`}
        </button>
      </div>

      {isOpen && (
        <>
          {/* ── Timeline: connected cards ───────────────────────────── */}
          <div className="flex items-center overflow-x-auto px-5 py-4 border-b border-gray-100 gap-0">
            {sorted.map((doc, i) => (
              <TimelineCard
                key={`${doc.documentType}-${doc.sequenceOrder}`}
                doc={doc}
                isSelected={i === selectedIndex}
                isLast={i === sorted.length - 1}
                onClick={() => setSelectedIndex(selectedIndex === i ? null : i)}
              />
            ))}
            {canCalculateFinalTerms && (
              <>
                <TimelineArrow color={FINAL_COLORS.arrow} />
                <div className="flex flex-col items-center gap-1 shrink-0 w-28">
                  <div className={cn('flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-full', FINAL_COLORS.badge, FINAL_COLORS.badgeText)}>
                    <CheckCircle2 size={12} />
                    Final
                  </div>
                  <span className="text-[10px] font-medium text-gray-500 text-center leading-tight">Accepted Terms</span>
                  {finalTerms.purchasePrice != null && (
                    <span className="text-[11px] font-semibold text-emerald-700">
                      ${finalTerms.purchasePrice.toLocaleString()}
                    </span>
                  )}
                </div>
              </>
            )}
          </div>

          {/* ── Selected document detail ─────────────────────────────── */}
          {selected && (
            <div className="px-5 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2 mb-3">
                <span className={cn('text-xs font-semibold tracking-wide', DOC_COLORS[selected.documentType]?.badgeText ?? 'text-gray-700')}>
                  {selected.documentType}{selected.counterNumber > 0 ? ` ${selected.counterNumber}` : ''} — {HIERARCHY_LABELS[selected.documentType] ?? selected.documentType}
                </span>
                <span className="text-[10px] text-gray-400 font-mono">{selected.fileName}</span>
              </div>

              <DetailGrid terms={selected.extractedTerms} />
              <ContingenciesBlock terms={selected.extractedTerms} overrides={selected.extractedTerms.otherTermsOverrides} />
              <ChangesBlock changes={changes} prevDocType={sorted[selectedIndex! - 1]?.documentType ?? ''} overrides={selected.extractedTerms.otherTermsOverrides} />

              {selected.extractedTerms.otherTermsOverrides && (
                <OtherTermsOverridesBlock overrides={selected.extractedTerms.otherTermsOverrides} />
              )}

              {selected.extractedTerms.otherTerms && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <dt className="text-[11px] font-medium text-gray-500 mb-1">Other Terms (Raw Text)</dt>
                  <dd className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed">
                    {selected.extractedTerms.otherTerms}
                  </dd>
                </div>
              )}

              <SignaturesBlock signatures={selected.extractedTerms.signatures} />
            </div>
          )}

          {/* ── Blocker panel ─────────────────────────────────────── */}
          {validationIssues && validationIssues.length > 0 && (
            <BlockerPanel issues={validationIssues} />
          )}

          {/* ── Final Accepted Terms panel ──────────────────────────── */}
          {canCalculateFinalTerms && (
            <div className="px-5 py-4">
              <FinalAcceptedTerms terms={finalTerms} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
