'use client';

import { CheckCircle, XCircle, AlertTriangle, Info, ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import type {
  ExtractionBuyer,
  ExtractionSeller,
  ExtractionAgent,
  ExtractionCompany,
  ComplianceResult,
  ComplianceCheck,
  BlockerOutput,
  WarningOutput,
} from '../../extraction-result.types';
import type { FinalTerm } from '@tc/shared';
import { formatFieldLabel } from '../../field-labels';

// ── Date helpers ──────────────────────────────────────────────────────────────

export function fmtDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = typeof value === 'string' && value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const [, y, m, d] = match;
    return new Date(parseInt(y), parseInt(m) - 1, parseInt(d))
      .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function addDays(base: string | null | undefined, days: number | null | undefined): string | null {
  if (!base || days == null) return null;
  const match = typeof base === 'string' && base.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const d = match
    ? new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]))
    : new Date(base);
  if (isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Layout primitives ─────────────────────────────────────────────────────────

export function StepCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      {children}
    </div>
  );
}

export function StepCardHeader({ title, description, badge }: {
  title: string;
  description?: string;
  badge?: React.ReactNode;
}) {
  return (
    <div className="px-5 pt-3.5 pb-3 border-b border-gray-100">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
        {badge}
      </div>
      {description && (
        <p className="text-xs text-gray-400 mt-0.5">{description}</p>
      )}
    </div>
  );
}

export function StepCardBody({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('px-5 py-3.5', className)}>{children}</div>;
}

export function SectionDivider({ title, icon: Icon }: { title: string; icon: React.ElementType }) {
  return (
    <div className="flex items-center gap-2 px-5 py-2 bg-gray-50 border-y border-gray-100">
      <Icon size={13} className="text-blue-700 shrink-0" />
      <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{title}</span>
    </div>
  );
}

// ── Field / display primitives ────────────────────────────────────────────────

export function Field({ label, value, span }: { label: string; value: string | null | undefined; span?: boolean }) {
  return (
    <div className={cn(span && 'col-span-2')}>
      <dt className="text-xs font-medium text-gray-500 mb-0.5">{label}</dt>
      <dd className={cn('text-sm', value ? 'text-gray-900' : 'text-gray-300')}>{value ?? '—'}</dd>
    </div>
  );
}

export function DeadlineRow({ label, days, date, waived }: {
  label: string;
  days: number | null | undefined;
  date: string | null;
  waived?: boolean;
}) {
  const isWaived = waived ?? days === 0;
  return (
    <div className="flex items-center justify-between py-2 px-3 bg-gray-50 border border-gray-200 rounded-lg">
      <span className="text-sm text-gray-700">{label}</span>
      <div className="flex items-center gap-3 text-right">
        {isWaived && (
          <span className="text-xs text-green-600 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
            No contingency
          </span>
        )}
        {days != null && !isWaived && (
          <span className="text-xs text-gray-400 bg-white border border-gray-200 px-2 py-0.5 rounded-full">
            {days} days
          </span>
        )}
        {!isWaived && (
          <span className={cn('text-sm font-medium', date ? 'text-gray-900' : 'text-gray-300')}>
            {date ?? '—'}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Renders one row of the server-resolved Final Negotiated Terms (contingencies
 * & disclosures) — the single source of truth also used by event seeding and
 * the welcome/timeline email. Never computes a deadline client-side.
 */
export function FinalTermRow({ term, docViewUrl }: {
  term: FinalTerm;
  /** Resolves a document id to a URL for the "view this document" source link. */
  docViewUrl?: (documentId: string) => string | null;
}) {
  const sourceCaption = term.source
    ? `${term.source.formCode} · v${term.source.versionNo}${term.source.section ? ` · ${term.source.section}` : ''}`
    : null;
  const sourceHref = term.source && docViewUrl ? docViewUrl(term.source.documentId) : null;

  return (
    <div className="py-2 px-3 bg-gray-50 border border-gray-200 rounded-lg">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-gray-700">{term.label}</span>
        <div className="flex items-center gap-2 text-right shrink-0">
          {term.status === 'No contingency' && (
            <span className="text-xs text-green-600 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
              No contingency
            </span>
          )}
          {term.status === 'Removed' && (
            <span className="text-xs text-green-600 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
              Removed via CR-B
            </span>
          )}
          {term.status === 'Needs Review' && (
            <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
              Needs Review
            </span>
          )}
          {term.status === 'N/A' && (
            <span className="text-sm text-gray-300">—</span>
          )}
          {term.status === 'Contingent' && (
            <>
              {term.days != null && (
                <span className="text-xs text-gray-400 bg-white border border-gray-200 px-2 py-0.5 rounded-full">
                  {term.days} days
                </span>
              )}
              <span className={cn('text-sm font-medium', term.deadline ? 'text-gray-900' : 'text-gray-300')}>
                {fmtDate(term.deadline) ?? '—'}
              </span>
            </>
          )}
        </div>
      </div>
      {term.status === 'Needs Review' && (
        <p className="text-xs text-amber-600 mt-1">
          Needs Review — Final term could not be determined.
        </p>
      )}
      {sourceCaption && (
        <p className="text-[11px] text-gray-400 mt-1">
          Source:{' '}
          {sourceHref ? (
            <a href={sourceHref} target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-600">
              {sourceCaption}
            </a>
          ) : sourceCaption}
        </p>
      )}
    </div>
  );
}

export function ConfidenceBar({ label, score }: { label: string; score: number | null | undefined }) {
  if (score == null) return null;
  const pct = Math.round(score * 100);
  const color = pct >= 90 ? 'bg-green-500' : pct >= 70 ? 'bg-amber-400' : 'bg-red-400';
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full', color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-400 shrink-0">{label}: {pct}%</span>
    </div>
  );
}

export function SignaturePill({ label, signed }: { label: string; signed: boolean }) {
  return (
    <span className={cn(
      'flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full border',
      signed ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700',
    )}>
      {signed ? <CheckCircle size={12} /> : <XCircle size={12} />}
      {label}
    </span>
  );
}

// ── Party group ───────────────────────────────────────────────────────────────

type PartyPerson = ExtractionBuyer | ExtractionSeller | ExtractionAgent | ExtractionCompany;

export function PartyGroup({ label, people, showConfidence = true }: {
  label: string;
  people: PartyPerson[];
  showConfidence?: boolean;
}) {
  if (people.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{label}</p>
      <div className="space-y-2">
        {people.map((p, i) => {
          const name = 'fullName' in p ? p.fullName : ('companyName' in p ? p.companyName : null);
          const sub = 'licenseNumber' in p && p.licenseNumber
            ? `License: ${p.licenseNumber}`
            : ('companyName' in p && 'contactName' in p && (p as ExtractionCompany).contactName
              ? `Contact: ${(p as ExtractionCompany).contactName}`
              : null);
          return (
            <div key={i} className="flex items-start justify-between px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl">
              <div className="space-y-0.5">
                <p className="text-sm font-medium text-gray-800">{name ?? '—'}</p>
                {sub && <p className="text-xs text-gray-400">{sub}</p>}
                <div className="flex gap-3 mt-1">
                  {p.email && <a href={`mailto:${p.email}`} className="text-xs text-blue-600 hover:underline">{p.email}</a>}
                  {p.phone && <span className="text-xs text-gray-500">{p.phone}</span>}
                </div>
              </div>
              {showConfidence && 'confidence' in p && p.confidence != null && (
                <span className="text-xs text-gray-400 shrink-0">{Math.round(p.confidence * 100)}%</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Compliance components ─────────────────────────────────────────────────────

const CONTRACT_FORM_ORDER = ['RPA', 'AD', 'SCO', 'BCO', 'SMCO', 'BMCO'];
const FORM_NAMES: Record<string, string> = {
  RPA: 'Residential Purchase Agreement', AD: 'Agency Disclosure',
  SCO: 'Seller Counter Offer', BCO: 'Buyer Counter Offer',
  SMCO: 'Seller Multiple Counter Offer', BMCO: 'Buyer Multiple Counter Offer Selection',
  TDS: 'Transfer Disclosure Statement', SPQ: 'Seller Property Questionnaire',
  NHD: 'Natural Hazard Disclosure', AVID: 'Agent Visual Inspection Disclosure',
};

function formStatus(checks: ComplianceCheck[]): 'pass' | 'warning' | 'fail' {
  if (checks.some((c) => c.status === 'fail')) return 'fail';
  if (checks.some((c) => c.status === 'warning')) return 'warning';
  return 'pass';
}

export function ComplianceBadge({ summary }: { summary: ComplianceResult['summary'] }) {
  const styles = {
    compliant:     'bg-green-50 text-green-700 border-green-200',
    needs_review:  'bg-amber-50 text-amber-700 border-amber-200',
    non_compliant: 'bg-red-50 text-red-700 border-red-200',
  };
  const labels = {
    compliant:     'Compliant',
    needs_review:  `${summary.warningCount} warning${summary.warningCount !== 1 ? 's' : ''}`,
    non_compliant: `${summary.failCount} issue${summary.failCount !== 1 ? 's' : ''}`,
  };
  return (
    <span className={cn('text-xs font-semibold px-2.5 py-0.5 rounded-full border', styles[summary.overallStatus])}>
      {labels[summary.overallStatus]}
    </span>
  );
}

export function FormAccordion({ formCode, checks }: { formCode: string; checks: ComplianceCheck[] }) {
  const status = formStatus(checks);
  const [open, setOpen] = useState(status !== 'pass');
  const borderColor = status === 'fail' ? 'border-red-200' : status === 'warning' ? 'border-amber-200' : 'border-gray-200';
  const headerBg = status === 'fail' ? 'bg-red-50' : status === 'warning' ? 'bg-amber-50' : 'bg-gray-50';

  return (
    <div className={cn('rounded-xl border overflow-hidden', borderColor)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn('w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:brightness-95', headerBg)}
      >
        <span className="font-mono text-xs font-bold text-gray-500 w-10 shrink-0">{formCode}</span>
        <span className="flex-1 text-sm font-medium text-gray-800">{FORM_NAMES[formCode] ?? formCode}</span>
        {status === 'pass'    && <span className="flex items-center gap-1 text-xs font-semibold text-green-700"><CheckCircle size={13} />Complete</span>}
        {status === 'fail'    && <span className="flex items-center gap-1 text-xs font-semibold text-red-700"><XCircle size={13} />Incomplete</span>}
        {status === 'warning' && <span className="flex items-center gap-1 text-xs font-semibold text-amber-700"><AlertTriangle size={13} />Warning</span>}
        {open ? <ChevronDown size={15} className="text-gray-400 shrink-0" /> : <ChevronRight size={15} className="text-gray-400 shrink-0" />}
      </button>
      {open && (
        <div className="divide-y divide-gray-100 bg-white">
          {checks.map((c, idx) => (
            <div key={`${c.ruleId}--${idx}`} className={cn('flex items-start gap-3 px-4 py-2.5 text-sm',
              c.status === 'fail' ? 'bg-red-50/40' : c.status === 'warning' ? 'bg-amber-50/40' : '',
            )}>
              <span className="shrink-0 mt-0.5">
                {c.status === 'pass'    && <CheckCircle   size={14} className="text-green-500" />}
                {c.status === 'fail'    && <XCircle       size={14} className="text-red-500" />}
                {c.status === 'warning' && <AlertTriangle size={14} className="text-amber-500" />}
                {c.status === 'skipped' && <Info          size={14} className="text-gray-300" />}
              </span>
              <div className="flex-1 min-w-0">
                <span className={cn('font-medium',
                  c.status === 'fail' ? 'text-red-800' : c.status === 'warning' ? 'text-amber-800' : 'text-gray-700',
                )}>{c.label}</span>
                {c.detail && <p className="text-xs text-gray-500 mt-0.5">{c.detail}</p>}
                {c.fields && c.fields.length > 0 && (
                  <p className="text-xs text-gray-400 mt-0.5 font-mono">{c.fields.join(', ')}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BlockerWarningGroup({ formCode, items, isBlocker, borderColor, headerBg, textColor, mutedColor, iconColor }: {
  formCode: string;
  items: (BlockerOutput | WarningOutput)[];
  isBlocker: boolean;
  borderColor: string;
  headerBg: string;
  textColor: string;
  mutedColor: string;
  iconColor: string;
}) {
  const [open, setOpen] = useState(isBlocker);
  return (
    <div className={cn('rounded-xl border overflow-hidden', borderColor)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn('w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:brightness-95', headerBg)}
      >
        <span className="font-mono text-xs font-bold text-gray-500 w-10 shrink-0">{formCode}</span>
        <span className="flex-1 text-sm font-medium text-gray-800">{FORM_NAMES[formCode] ?? formCode}</span>
        <span className={cn('text-xs font-semibold', textColor)}>
          {items.length} {isBlocker ? 'blocker' : 'warning'}{items.length !== 1 ? 's' : ''}
        </span>
        {open ? <ChevronDown size={15} className="text-gray-400 shrink-0" /> : <ChevronRight size={15} className="text-gray-400 shrink-0" />}
      </button>
      {open && (
        <div className="divide-y divide-gray-100 bg-white">
          {items.map((item, idx) => (
            <div key={`${item.compositeId}--${idx}`} className={cn('flex items-start gap-3 px-4 py-2.5 text-sm', isBlocker ? 'bg-red-50/40' : 'bg-amber-50/40')}>
              <span className="shrink-0 mt-0.5">
                {isBlocker ? <XCircle size={14} className={iconColor} /> : <AlertTriangle size={14} className={iconColor} />}
              </span>
              <div className="flex-1 min-w-0">
                <span className={cn('font-mono text-xs font-semibold', textColor)}>{item.compositeId ?? item.code}</span>
                <span className={cn('font-medium ml-2', textColor)}>{item.message}</span>
                {item.location && (
                  <span className={cn('text-[11px] ml-2 font-medium', mutedColor)}>{item.location}</span>
                )}
                {item.fields && item.fields.length > 0 && (
                  <p className="text-[11px] text-gray-500 mt-1">
                    <span className="font-medium text-gray-600">Field{item.fields.length > 1 ? 's' : ''}:</span>{' '}
                    {item.fields.map((f) => formatFieldLabel(f)).join(', ')}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function BlockerWarningAccordion({ items, type }: {
  items: BlockerOutput[] | WarningOutput[];
  type: 'blocker' | 'warning';
}) {
  const isBlocker = type === 'blocker';
  const borderColor = isBlocker ? 'border-red-200' : 'border-amber-200';
  const headerBg = isBlocker ? 'bg-red-50' : 'bg-amber-50';
  const textColor = isBlocker ? 'text-red-800' : 'text-amber-800';
  const mutedColor = isBlocker ? 'text-red-500' : 'text-amber-600';
  const iconColor = isBlocker ? 'text-red-500' : 'text-amber-500';

  const grouped = items.reduce<Record<string, (BlockerOutput | WarningOutput)[]>>((acc, item) => {
    (acc[item.formCode] ??= []).push(item);
    return acc;
  }, {});

  const formCodes = Object.keys(grouped).sort((a, b) => {
    const ai = CONTRACT_FORM_ORDER.indexOf(a);
    const bi = CONTRACT_FORM_ORDER.indexOf(b);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.localeCompare(b);
  });

  if (formCodes.length === 0) return null;

  return (
    <div className="space-y-2">
      {formCodes.map((code) => (
        <BlockerWarningGroup
          key={code}
          formCode={code}
          items={grouped[code]}
          isBlocker={isBlocker}
          borderColor={borderColor}
          headerBg={headerBg}
          textColor={textColor}
          mutedColor={mutedColor}
          iconColor={iconColor}
        />
      ))}
    </div>
  );
}

export function RpaComplianceSection({ compliance }: { compliance: ComplianceResult }) {
  const hasBlockers = (compliance.blockers?.length ?? 0) > 0;
  const hasWarnings = (compliance.warnings?.length ?? 0) > 0;
  const hasChecks = compliance.checks.length > 0;

  return (
    <div className="space-y-4">
      {hasBlockers && <BlockerWarningAccordion items={compliance.blockers!} type="blocker" />}
      {hasWarnings && <BlockerWarningAccordion items={compliance.warnings!} type="warning" />}
      {hasChecks && (
        <details className="group text-xs">
          <summary className="cursor-pointer text-gray-400 hover:text-gray-600 font-medium transition-colors select-none">
            All Checks ({compliance.checks.length})
          </summary>
          <div className="mt-2 space-y-2">
            {renderFormAccordions(compliance.checks)}
          </div>
        </details>
      )}
    </div>
  );
}

function renderFormAccordions(checks: ComplianceCheck[]) {
  const contractChecks = checks.filter((c) => c.phase === 'contract');
  const grouped = contractChecks.reduce<Record<string, ComplianceCheck[]>>((acc, c) => {
    (acc[c.formCode] ??= []).push(c);
    return acc;
  }, {});
  const formCodes = Object.keys(grouped).sort((a, b) => {
    const ai = CONTRACT_FORM_ORDER.indexOf(a);
    const bi = CONTRACT_FORM_ORDER.indexOf(b);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.localeCompare(b);
  });
  return formCodes.map((code) => (
    <FormAccordion key={code} formCode={code} checks={grouped[code]} />
  ));
}

// ── Form status badge (for formsAndDisclosures list) ──────────────────────────

export function FormStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    attached:   'bg-green-50 text-green-700 border-green-200',
    referenced: 'bg-blue-50 text-blue-700 border-blue-200',
    missing:    'bg-red-50 text-red-700 border-red-200',
  };
  return (
    <span className={cn('text-xs font-medium px-2.5 py-1 rounded-full border capitalize',
      styles[status] ?? 'bg-gray-50 text-gray-600 border-gray-200',
    )}>
      {status}
    </span>
  );
}
