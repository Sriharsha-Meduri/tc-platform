import Link from 'next/link';
import { api, ApiTransactionSummary } from '@/lib/api';
import {
  MapPin, Calendar, ChevronRight, FileEdit, Layers, FolderOpen,
  AlertTriangle, AlertCircle, CheckCircle2, Plus,
} from 'lucide-react';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Dashboard — TC' };

// ── Status badge colours ──────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  draft:                    'bg-amber-100 text-amber-700',
  active:                   'bg-green-100 text-green-700',
  under_contract:           'bg-blue-100 text-blue-700',
  pending_close:            'bg-indigo-100 text-indigo-700',
  closed:                   'bg-gray-100 text-gray-600',
  cancelled:                'bg-red-100 text-red-600',
  archived:                 'bg-gray-100 text-gray-400',
};

function badge(map: Record<string, string>, key: string | null | undefined) {
  return map[key ?? ''] ?? 'bg-gray-100 text-gray-500';
}

function fmt(dateStr: string | null | undefined) {
  if (!dateStr) return null;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function humanize(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function addressLine(tx: ApiTransactionSummary) {
  if (!tx.propertyAddressLine1) return 'Address TBD';
  const parts = [tx.propertyAddressLine1, tx.propertyCity, tx.propertyState].filter(Boolean);
  return parts.join(', ');
}

function formatPrice(value: number | null | undefined) {
  if (!value) return null;
  return '$' + value.toLocaleString();
}

// ── Expected forms per stage (for progressive upload display) ─────────────────

const STAGE_FORMS: Record<string, { code: string; label: string }[]> = {
  Contract:    [{ code: 'RPA', label: 'RPA' }, { code: 'AD', label: 'AD' }, { code: 'AVID', label: 'AVID' }, { code: 'BIA', label: 'BIA' }],
  Disclosures: [{ code: 'TDS', label: 'TDS' }, { code: 'SPQ', label: 'SPQ' }, { code: 'NHD', label: 'NHD' }],
  Inspection:  [{ code: 'RPA', label: 'Inspection Report' }],
  Appraisal:   [{ code: 'RPA', label: 'Appraisal Report' }],
  Loan:        [{ code: 'RPA', label: 'Loan Estimate' }, { code: 'RPA', label: 'Initial Disclosure' }],
  Escrow:      [{ code: 'RPA', label: 'Escrow Instructions' }, { code: 'RPA', label: 'Prelim Title Report' }],
  Closing:     [{ code: 'RPA', label: 'Closing Statement' }],
  'Post Close': [],
};

interface FormStatus {
  code: string;
  label: string;
  submitted: boolean;
}

function getForms(stage: string | null, formCodes: string[]): FormStatus[] {
  const expected = stage ? STAGE_FORMS[stage] ?? [] : [];
  return expected.map((f) => ({
    ...f,
    submitted: formCodes.includes(f.code),
  }));
}

// ── Transaction card ──────────────────────────────────────────────────────────

function TransactionCard({ tx }: { tx: ApiTransactionSummary }) {
  const isDraft   = tx.status === 'draft';
  const closeDate = fmt(tx.closeOfEscrowAt);
  const offerDate = fmt(tx.offerAcceptedAt);
  const price     = formatPrice(tx.contractPrice ?? tx.listPrice);
  const mainHref  = isDraft ? `/transactions/draft/${tx.id}` : `/dashboard/transactions/${tx.id}`;

  const daysUntilClose = tx.closeOfEscrowAt
    ? Math.round((new Date(tx.closeOfEscrowAt).getTime() - Date.now()) / 86400000)
    : null;

  const daysStr = daysUntilClose !== null
    ? daysUntilClose <= 0 ? 'Overdue'
      : `${daysUntilClose} days`
    : null;

  const daysColor = daysUntilClose !== null
    ? daysUntilClose <= 0  ? 'text-red-600 font-semibold'
      : daysUntilClose <= 7 ? 'text-orange-600 font-semibold'
      : daysUntilClose <= 30 ? 'text-amber-600'
      : 'text-gray-500'
    : '';

  const hasBlockers = tx.blockerCount > 0;
  const hasWarnings = tx.warningCount > 0;
  const forms = getForms(tx.activeStage, tx.formCodes);
  const activeStageLabel = tx.activeStage
    ? humanize(tx.activeStage)
    : null;

  return (
    <div className="group relative flex items-start gap-4 bg-white rounded-xl border border-gray-200 p-5
                    hover:border-blue-300 hover:shadow-sm transition-all">
      <Link href={mainHref} className="absolute inset-0 rounded-xl z-10" aria-label="Open transaction" />

      {/* Left icon */}
      <div className={`relative mt-0.5 shrink-0 rounded-lg p-2 ${isDraft ? 'bg-amber-50 text-amber-500' : 'bg-blue-50 text-blue-500'}`}>
        {isDraft ? <FileEdit className="w-4 h-4" /> : <Layers className="w-4 h-4" />}
      </div>

      <div className="relative flex-1 min-w-0">
        {/* Address */}
        <div className="flex items-start gap-1.5 mb-1.5">
          <MapPin className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" />
          <span className="text-sm font-medium text-gray-900 truncate">{addressLine(tx)}</span>
        </div>

        {/* Badges: status · tx# · stage · compliance */}
        <div className="flex flex-wrap items-center gap-1.5 mb-2">
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${badge(STATUS_COLORS, tx.status)}`}>
            {humanize(tx.status)}
          </span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-400">
            #{tx.transactionNumber}
          </span>
          {activeStageLabel && (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600">
              {activeStageLabel}
            </span>
          )}
          {hasBlockers && (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-50 text-red-600 inline-flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              {tx.blockerCount} blocker{tx.blockerCount > 1 ? 's' : ''}
            </span>
          )}
          {!hasBlockers && hasWarnings && (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 inline-flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              {tx.warningCount} warning{tx.warningCount > 1 ? 's' : ''}
            </span>
          )}
          {!hasBlockers && !hasWarnings && (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-50 text-green-600 inline-flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" />
              Compliant
            </span>
          )}
        </div>

        {/* Forms submitted — compact */}
        {forms.length > 0 && (
          <div className="text-xs text-gray-500 mb-1.5">
            <span className="font-medium text-gray-400 mr-1">Forms:</span>
            {forms.map((f) => (
              <span key={f.code + f.label} className="mr-2">
                <span className={f.submitted ? 'text-green-600' : 'text-gray-300'}>{f.submitted ? '✓' : '○'}</span>
                {' '}
                <span className={f.submitted ? 'text-gray-700' : 'text-gray-400'}>{f.label}</span>
              </span>
            ))}
          </div>
        )}

        {/* Dates */}
        <div className="flex flex-wrap gap-3 text-xs text-gray-500">
          {offerDate && (
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              Offer: {offerDate}
            </span>
          )}
          {closeDate && (
            <span className={`flex items-center gap-1 ${daysColor}`}>
              <Calendar className="w-3 h-3" />
              Close: {closeDate}
              {daysStr && ` (${daysStr})`}
            </span>
          )}
        </div>

        <div className="mt-2">
          <Link
            href={`/dashboard/transactions/${tx.id}/documents`}
            className="relative z-20 inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
          >
            <FolderOpen className="w-3 h-3" />
            Documents
          </Link>
        </div>
      </div>

      {/* Price + chevron */}
      <div className="relative text-right shrink-0">
        {price && <p className="text-sm font-semibold text-gray-900">{price}</p>}
        <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-blue-400 ml-auto mt-1 transition-colors" />
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const summaries = await api.transactions.summary();

  const draft   = summaries?.filter((t) => t.status === 'draft')   ?? [];
  const active  = summaries?.filter((t) => t.status === 'active')  ?? [];
  const total   = summaries?.length ?? 0;

  const needsAttention = (summaries ?? []).filter((t) => {
    if (t.status === 'draft' || t.status === 'closed' || t.status === 'cancelled' || t.status === 'archived') return false;
    return t.blockerCount > 0;
  }).length;

  const STATS = [
    { label: 'Draft',          value: String(draft.length),        color: 'amber' },
    { label: 'Active',         value: String(active.length),       color: 'green' },
    { label: 'Needs attention', value: String(needsAttention),     color: 'red'   },
    { label: 'Total',          value: String(total),               color: 'blue'  },
  ] as const;

  const STAT_COLORS: Record<string, string> = {
    amber: 'bg-amber-50 text-amber-700',
    green: 'bg-green-50 text-green-700',
    red:   'bg-red-50 text-red-600',
    blue:  'bg-blue-50 text-blue-700',
  };

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-gray-900">Dashboard</h1>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {STATS.map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-5">
            <div className={`inline-flex rounded-lg px-2.5 py-1 text-xs font-medium mb-3 ${STAT_COLORS[s.color]}`}>
              {s.label}
            </div>
            <p className="text-3xl font-bold text-gray-900">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Transactions list */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-900">Transactions</h2>
          <Link
            href="/transactions/new"
            className="inline-flex items-center gap-1 rounded-lg bg-blue-700 px-2.5 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> New
          </Link>
        </div>

        {!summaries || summaries.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="rounded-full bg-blue-50 p-3">
              <Layers className="w-6 h-6 text-blue-500" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">No transactions yet</p>
              <p className="mt-0.5 text-sm text-gray-400">Create your first transaction to get started.</p>
            </div>
            <Link
              href="/transactions/new"
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-3.5 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
            >
              <Plus className="w-4 h-4" /> New transaction
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {summaries.map((tx) => (
              <TransactionCard key={tx.id} tx={tx} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
