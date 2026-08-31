'use client';

import React from 'react';
import { CheckCircle, XCircle, AlertTriangle, ChevronDown, ChevronRight, Minus, Send, Clock, FileSignature, Loader2, Upload, RefreshCw, ExternalLink } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import type { ApiDocument, ApiFormTemplateItem, ApiParty } from '@/lib/api';
import type { ComplianceResult, ComplianceCheck, BlockerOutput, WarningOutput } from '@/app/transactions/new/extraction-result.types';
import { renderFields } from '@/app/transactions/new/field-labels';
import SendViaDocuSignModal, { type TransactionContext } from './SendViaDocuSignModal';
import { DISCLOSURE_CATALOG } from './DisclosureCatalog';
import { computeDocumentAnalysisStatus } from './transaction-helpers';

type FormStatus =
  | 'complete' | 'missing' | 'blocked' | 'not_uploaded' | 'optional_complete' | 'optional_blocked'
  | 'analyzing' | 'analysis_failed' | 'needs_review';

interface FormEntry {
  formCode: string;
  formName: string;
  isRequired: boolean | 'conditional';
  document: ApiDocument | null;
  status: FormStatus;
  checks: ComplianceCheck[];
  blockers: BlockerOutput[];
  warnings: WarningOutput[];
  uploadedAt: string | null;
}

function getFormCode(doc: ApiDocument): string | null {
  const meta = doc.metadataJson as Record<string, unknown> | null;
  return (meta?.detectedFormCode as string | null) ?? null;
}

function fmt(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function StatusBadge({ status }: { status: FormStatus }) {
  const config: Record<FormStatus, { label: string; classes: string }> = {
    complete:         { label: 'Validation Passed', classes: 'bg-green-100 text-green-700 border-green-200' },
    missing:          { label: 'Missing',          classes: 'bg-red-100 text-red-700 border-red-200' },
    blocked:          { label: 'Blockers Found',   classes: 'bg-amber-100 text-amber-700 border-amber-200' },
    not_uploaded:     { label: 'Not Uploaded',     classes: 'bg-gray-100 text-gray-500 border-gray-200' },
    optional_complete:{ label: 'Optional — Validation Passed', classes: 'bg-green-100 text-green-700 border-green-200' },
    optional_blocked: { label: 'Optional — Blockers Found',    classes: 'bg-amber-100 text-amber-700 border-amber-200' },
    analyzing:        { label: 'Analyzing',        classes: 'bg-blue-100 text-blue-700 border-blue-200' },
    analysis_failed:  { label: 'Analysis Failed',  classes: 'bg-red-100 text-red-700 border-red-200' },
    needs_review:     { label: 'Needs Review',     classes: 'bg-amber-100 text-amber-700 border-amber-200' },
  };
  const c = config[status];
  return (
    <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide border', c.classes)}>
      {c.label}
    </span>
  );
}

function RequirementBadge({ required }: { required: boolean | 'conditional' }) {
  if (required === true) {
    return (
      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
        Required
      </span>
    );
  }
  if (required === 'conditional') {
    return (
      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
        Conditional
      </span>
    );
  }
  return (
    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-50 text-gray-500 border border-gray-200">
      Optional
    </span>
  );
}

// ── Validation checklist (individual rule results) ────────────────────────────

function statusIcon(status: ComplianceCheck['status'], size = 14) {
  switch (status) {
    case 'pass':
      return <CheckCircle size={size} className="text-green-500 shrink-0 mt-0.5" />;
    case 'fail':
      return <XCircle size={size} className="text-red-500 shrink-0 mt-0.5" />;
    case 'warning':
      return <AlertTriangle size={size} className="text-amber-500 shrink-0 mt-0.5" />;
    case 'skipped':
      return <Minus size={size} className="text-gray-300 shrink-0 mt-0.5" />;
  }
}

function ValidationChecklist({ checks }: { checks: ComplianceCheck[] }) {
  const sorted = [...checks].sort((a, b) => {
    const order = { fail: 0, warning: 1, pass: 2, skipped: 3 };
    return (order[a.status] ?? 9) - (order[b.status] ?? 9);
  });

  if (sorted.length === 0) {
    return (
      <div className="px-4 py-3 text-xs text-gray-400 italic bg-white border-t border-gray-100">
        No validation data yet. Upload and process this document to see results.
      </div>
    );
  }

  return (
    <div className="px-4 py-3 bg-white space-y-0.5 border-t border-gray-100">
      {sorted.map((check, i) => (
        <div key={`${check.ruleId}-${i}`} className="flex items-start gap-2.5 py-1">
          {statusIcon(check.status)}
          <div className="flex-1 min-w-0">
            <span className={cn(
              'text-sm',
              check.status === 'pass' ? 'text-green-700'
                : check.status === 'fail' ? 'font-medium text-red-800'
                : check.status === 'warning' ? 'font-medium text-amber-800'
                : 'text-gray-400',
            )}>
              {check.label}
            </span>
            {check.detail && (
              <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{check.detail}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Blocker / warning detail sections ─────────────────────────────────────────

function BlockerSection({ blockers }: { blockers: BlockerOutput[] }) {
  if (blockers.length === 0) return null;
  return (
    <div>
      <div className="px-4 py-1.5 bg-red-50/60 border-t border-red-100">
        <span className="text-[10px] font-semibold text-red-600 uppercase tracking-wide">
          Blockers ({blockers.length})
        </span>
      </div>
      {blockers.map((b, idx) => (
        <div key={`b-${b.compositeId}--${idx}`} className="flex items-start gap-3 px-4 py-2.5 text-sm bg-red-50/30 border-t border-red-50">
          <XCircle size={14} className="text-red-500 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <span className="font-medium text-red-800">{b.message}</span>
            {b.location && (
              <span className="text-[11px] text-red-500 ml-2 font-medium">{b.location}</span>
            )}
            <p className="text-[11px] text-red-400 mt-0.5 font-mono">{b.compositeId ?? b.code}</p>
            {b.fields && b.fields.length > 0 && (
              <p className="text-[11px] text-gray-500 mt-1">
                <span className="font-medium text-gray-600">Field{b.fields.length > 1 ? 's' : ''}:</span>{' '}
                {renderFields(b.fields)}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function WarningSection({ warnings }: { warnings: WarningOutput[] }) {
  if (warnings.length === 0) return null;
  return (
    <div>
      <div className="px-4 py-1.5 bg-amber-50/60 border-t border-amber-100">
        <span className="text-[10px] font-semibold text-amber-600 uppercase tracking-wide">
          Warnings ({warnings.length})
        </span>
      </div>
      {warnings.map((w, idx) => (
        <div key={`w-${w.compositeId}--${idx}`} className="flex items-start gap-3 px-4 py-2.5 text-sm bg-amber-50/30 border-t border-amber-50">
          <AlertTriangle size={14} className="text-amber-500 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <span className="font-medium text-amber-800">{w.message}</span>
            {w.location && (
              <span className="text-[11px] text-amber-500 ml-2 font-medium">{w.location}</span>
            )}
            <p className="text-[11px] text-amber-500 mt-0.5 font-mono">{w.compositeId ?? w.code}</p>
            {w.fields && w.fields.length > 0 && (
              <p className="text-[11px] text-gray-500 mt-1">
                <span className="font-medium text-gray-600">Field{w.fields.length > 1 ? 's' : ''}:</span>{' '}
                {renderFields(w.fields)}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Form summary card ──────────────────────────────────────────────────────────

function FormSummaryCard({ entry, defaultOpen }: { entry: FormEntry; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);

  const isBlocked = entry.status === 'blocked' || entry.status === 'optional_blocked' || entry.status === 'needs_review';
  const isComplete = entry.status === 'complete' || entry.status === 'optional_complete';
  const isMissing = entry.status === 'missing' || entry.status === 'analysis_failed';

  const borderColor = isBlocked ? 'border-amber-200'
    : isComplete ? 'border-green-200'
    : isMissing ? 'border-red-200'
    : 'border-gray-200';

  const headerBg = isBlocked ? 'bg-amber-50'
    : isComplete ? 'bg-green-50'
    : isMissing ? 'bg-red-50/50'
    : 'bg-gray-50';

  const blockerCount = entry.blockers.length;
  const warningCount = entry.warnings.length;

  return (
    <div className={cn('rounded-xl border overflow-hidden', borderColor)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn('w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:brightness-95', headerBg)}
      >
        <span className="font-mono text-xs font-bold text-gray-500 w-14 shrink-0">{entry.formCode}</span>
        <span className="flex-1 min-w-0">
          <span className="text-sm font-medium text-gray-800 truncate block">{entry.formName}</span>
          {entry.uploadedAt && (
            <span className="text-[11px] text-gray-400 flex items-center gap-1 mt-0.5">
              <Upload size={9} />
              {fmt(entry.uploadedAt)}
              {entry.document?.uploadedByAccount && ` · ${entry.document.uploadedByAccount.displayName}`}
            </span>
          )}
        </span>
        <span className="hidden sm:flex items-center gap-2 text-[10px] mr-1">
          {blockerCount > 0 && (
            <span className="flex items-center gap-0.5 text-red-600 font-semibold">
              <XCircle size={10} className="text-red-500" />{blockerCount}
            </span>
          )}
          {warningCount > 0 && (
            <span className="flex items-center gap-0.5 text-amber-600 font-semibold">
              <AlertTriangle size={10} className="text-amber-500" />{warningCount}
            </span>
          )}
          {blockerCount === 0 && warningCount === 0 && entry.document && (
            <span className="flex items-center gap-0.5 text-green-600">
              <CheckCircle size={10} className="text-green-500" />{entry.checks.filter((c) => c.status === 'pass').length} passed
            </span>
          )}
        </span>
        <RequirementBadge required={entry.isRequired} />
        <StatusBadge status={entry.status} />
        {entry.document?.storageUrl && (
          <a
            href={entry.document.storageUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="shrink-0 inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors"
          >
            <ExternalLink size={10} /> View
          </a>
        )}
        {open ? <ChevronDown size={15} className="text-gray-400 shrink-0" /> : <ChevronRight size={15} className="text-gray-400 shrink-0" />}
      </button>
      {open && (
        <div>
          {entry.status === 'missing' ? (
            <div className="px-4 py-3 bg-white border-t border-gray-100">
              <div className="flex items-start gap-2.5 py-1">
                <XCircle size={14} className="text-red-500 shrink-0 mt-0.5" />
                <span className="text-sm font-medium text-red-800">Required disclosure not uploaded</span>
              </div>
              <p className="text-xs text-gray-400 mt-1 ml-[22px]">Upload this required disclosure to begin validation.</p>
            </div>
          ) : entry.status === 'not_uploaded' ? (
            <div className="px-4 py-3 bg-white border-t border-gray-100">
              <div className="flex items-start gap-2.5 py-1">
                <Minus size={14} className="text-gray-300 shrink-0 mt-0.5" />
                <span className="text-sm text-gray-500">Optional — not uploaded</span>
              </div>
              <p className="text-xs text-gray-400 mt-1 ml-[22px]">This is an optional disclosure. Upload if applicable to your transaction.</p>
            </div>
          ) : entry.status === 'analyzing' ? (
            <div className="px-4 py-3 bg-white border-t border-gray-100">
              <div className="flex items-start gap-2.5 py-1">
                <Loader2 size={14} className="text-blue-500 shrink-0 mt-0.5 animate-spin" />
                <span className="text-sm font-medium text-blue-800">Analysis in progress</span>
              </div>
              <p className="text-xs text-gray-400 mt-1 ml-[22px]">This document is being identified, split, and validated.</p>
            </div>
          ) : entry.status === 'analysis_failed' ? (
            <div className="px-4 py-3 bg-white border-t border-gray-100">
              <div className="flex items-start gap-2.5 py-1">
                <XCircle size={14} className="text-red-500 shrink-0 mt-0.5" />
                <span className="text-sm font-medium text-red-800">Analysis failed</span>
              </div>
              <p className="text-xs text-gray-400 mt-1 ml-[22px]">
                {((entry.document?.metadataJson as Record<string, unknown> | null)?.analysisError as string | undefined)
                  ?? 'An error occurred while analyzing this document. Retry analysis to try again.'}
              </p>
            </div>
          ) : entry.document ? (
            <>
              <ValidationChecklist checks={entry.checks} />
              <BlockerSection blockers={entry.blockers} />
              <WarningSection warnings={entry.warnings} />
            </>
          ) : (
            <div className="px-4 py-3 text-xs text-gray-400 italic bg-white border-t border-gray-100">
              No validation data yet. Upload and process this document to see results.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main view ──────────────────────────────────────────────────────────────────

interface Props {
  documents: ApiDocument[];
  compliance: ComplianceResult | null;
  templateItems?: ApiFormTemplateItem[];
  transactionId: string;
  parties?: ApiParty[];
  txContext?: TransactionContext;
  userEmail?: string;
}

export default function DisclosuresDetailView({ documents, compliance, templateItems, transactionId, parties = [], txContext, userEmail }: Props) {
  const router = useRouter();
  const [showDocusignModal, setShowDocusignModal] = useState(false);
  const [envelopes, setEnvelopes] = useState<Record<string, unknown>[]>([]);
  const [envelopesLoading, setEnvelopesLoading] = useState(true);
  const [revalidating, setRevalidating] = useState(false);

  const fetchEnvelopes = useCallback(async () => {
    setEnvelopesLoading(true);
    try {
      const res = await fetch(`/api/v1/docusign/envelopes?transactionId=${encodeURIComponent(transactionId)}`, {
        credentials: 'include',
      });
      if (res.ok) {
        setEnvelopes(await res.json() as Record<string, unknown>[]);
      }
    } catch {
      // ignore
    }
    setEnvelopesLoading(false);
  }, [transactionId]);

  useEffect(() => {
    fetchEnvelopes();
  }, [fetchEnvelopes]);

  const handleRevalidate = useCallback(async () => {
    setRevalidating(true);
    try {
      const res = await fetch(`/api/v1/document-extraction/revalidate-disclosures/${encodeURIComponent(transactionId)}`, {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) {
        router.refresh();
      }
    } catch {
      // ignore
    }
    setRevalidating(false);
  }, [transactionId, router]);

  const ENVELOPE_STATUS_STYLES: Record<string, string> = {
    created: 'bg-gray-100 text-gray-600',
    sent: 'bg-blue-100 text-blue-700',
    delivered: 'bg-purple-100 text-purple-700',
    completed: 'bg-green-100 text-green-700',
    declined: 'bg-red-100 text-red-700',
    voided: 'bg-gray-100 text-gray-500',
  };

  const ENVELOPE_STATUS_ICONS: Record<string, React.ElementType> = {
    created: Clock,
    sent: Send,
    delivered: Clock,
    completed: CheckCircle,
    declined: XCircle,
    voided: XCircle,
  };

  // Build the form list from the catalog, with template overrides for required status
  const templateOverrideMap = new Map<string, boolean>();
  if (templateItems && templateItems.length > 0) {
    for (const item of templateItems) {
      templateOverrideMap.set(item.formCode.toUpperCase(), item.isRequired);
    }
  }

  const formCodes = DISCLOSURE_CATALOG.map((entry) => ({
    code: entry.formCode,
    name: entry.formName,
    required: templateOverrideMap.has(entry.formCode.toUpperCase())
      ? templateOverrideMap.get(entry.formCode.toUpperCase())!
      : entry.required,
  }));

  // Index documents by form code for fast lookup
  const docsByCode = new Map<string, ApiDocument>();
  for (const doc of documents) {
    const code = getFormCode(doc);
    if (code) {
      // If multiple docs match the same code, take the most recent non-superseded one
      const existing = docsByCode.get(code);
      if (!existing || new Date(doc.createdAt) > new Date(existing.createdAt)) {
        docsByCode.set(code, doc);
      }
    }
  }

  // Group compliance results by form code — these drive the entire UI
  const checksByCode = new Map<string, ComplianceCheck[]>();
  const blockersByCode = new Map<string, BlockerOutput[]>();
  const warningsByCode = new Map<string, WarningOutput[]>();
  if (compliance) {
    for (const c of compliance.checks ?? []) {
      const arr = checksByCode.get(c.formCode) ?? [];
      arr.push(c);
      checksByCode.set(c.formCode, arr);
    }
    for (const b of compliance.blockers ?? []) {
      const arr = blockersByCode.get(b.formCode) ?? [];
      arr.push(b);
      blockersByCode.set(b.formCode, arr);
    }
    for (const w of compliance.warnings ?? []) {
      const arr = warningsByCode.get(w.formCode) ?? [];
      arr.push(w);
      warningsByCode.set(w.formCode, arr);
    }
  }

  // Determine status per disclosure — driven entirely by engine results
  const entries: FormEntry[] = formCodes.map(({ code, name, required }) => {
    const doc = docsByCode.get(code.toUpperCase()) ?? null;
    const checks = checksByCode.get(code) ?? [];
    const blockers = blockersByCode.get(code) ?? [];
    const warnings = warningsByCode.get(code) ?? [];

    const analysis = computeDocumentAnalysisStatus(doc);

    let status: FormStatus;
    if (!doc) {
      status = required ? 'missing' : 'not_uploaded';
    } else if (analysis.status === 'analyzing') {
      status = 'analyzing';
    } else if (analysis.status === 'analysis_failed') {
      status = 'analysis_failed';
    } else if (blockers.length > 0) {
      // Has at least one blocker — warnings are irrelevant for status
      status = required ? 'blocked' : 'optional_blocked';
    } else if (warnings.length > 0) {
      // Zero blockers but at least one warning — needs a human look
      status = 'needs_review';
    } else {
      // Zero blockers, zero warnings
      status = required ? 'complete' : 'optional_complete';
    }

    return {
      formCode: code,
      formName: name,
      isRequired: required,
      document: doc,
      status,
      checks,
      blockers,
      warnings,
      uploadedAt: doc?.createdAt ?? null,
    };
  });

  // Sort: missing/blocked first (needs attention), then complete, then optional (no action needed)
  const sortOrder = DISCLOSURE_CATALOG.map((e) => e.formCode);
  const statusOrder: Record<FormStatus, number> = {
    analysis_failed: 0, missing: 1, blocked: 2, optional_blocked: 3, needs_review: 4,
    analyzing: 5, complete: 6, optional_complete: 7, not_uploaded: 8,
  };
  entries.sort((a, b) => {
    const sa = statusOrder[a.status];
    const sb = statusOrder[b.status];
    if (sa !== sb) return sa - sb;
    return sortOrder.indexOf(a.formCode) - sortOrder.indexOf(b.formCode);
  });

  // Summary counts — use engine blockers/warnings, not per-check statuses
  const totalBlockers = entries.reduce((s, e) => s + e.blockers.length, 0);
  const totalWarnings = entries.reduce((s, e) => s + e.warnings.length, 0);
  const summary = {
    complete: entries.filter((e) => e.status === 'complete').length,
    optionalComplete: entries.filter((e) => e.status === 'optional_complete').length,
    missing: entries.filter((e) => e.status === 'missing').length,
    blocked: entries.filter((e) => e.status === 'blocked').length,
    optionalBlocked: entries.filter((e) => e.status === 'optional_blocked').length,
    notUploaded: entries.filter((e) => e.status === 'not_uploaded').length,
    analyzing: entries.filter((e) => e.status === 'analyzing').length,
    analysisFailed: entries.filter((e) => e.status === 'analysis_failed').length,
    needsReview: entries.filter((e) => e.status === 'needs_review').length,
  };

  return (
    <div className="space-y-4 py-2">

      {/* Summary bar */}
      <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap">
        {summary.complete > 0 && (
          <span className="flex items-center gap-1">
            <CheckCircle size={12} className="text-green-500" />
            {summary.complete} complete
          </span>
        )}
        {summary.optionalComplete > 0 && (
          <span className="flex items-center gap-1">
            <CheckCircle size={12} className="text-green-400" />
            {summary.optionalComplete} optional
          </span>
        )}
        {summary.missing > 0 && (
          <span className="flex items-center gap-1">
            <XCircle size={12} className="text-red-500" />
            {summary.missing} missing
          </span>
        )}
        {summary.blocked > 0 && (
          <span className="flex items-center gap-1">
            <AlertTriangle size={12} className="text-amber-500" />
            {summary.blocked} blocked
          </span>
        )}
        {summary.optionalBlocked > 0 && (
          <span className="flex items-center gap-1">
            <AlertTriangle size={12} className="text-amber-400" />
            {summary.optionalBlocked} opt. blocked
          </span>
        )}
        {summary.notUploaded > 0 && (
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-gray-300 inline-block" />
            {summary.notUploaded} not uploaded
          </span>
        )}
        {summary.analyzing > 0 && (
          <span className="flex items-center gap-1">
            <Loader2 size={12} className="text-blue-500 animate-spin" />
            {summary.analyzing} analyzing
          </span>
        )}
        {summary.analysisFailed > 0 && (
          <span className="flex items-center gap-1">
            <XCircle size={12} className="text-red-500" />
            {summary.analysisFailed} analysis failed
          </span>
        )}
        {summary.needsReview > 0 && (
          <span className="flex items-center gap-1">
            <AlertTriangle size={12} className="text-amber-500" />
            {summary.needsReview} needs review
          </span>
        )}
        {totalBlockers + totalWarnings > 0 && (
          <span className="text-gray-400 ml-auto">
            {totalBlockers > 0 && <span className="text-red-600 font-semibold">{totalBlockers} blocker{totalBlockers !== 1 ? 's' : ''}</span>}
            {totalBlockers > 0 && totalWarnings > 0 && <span className="text-gray-300 mx-1">&middot;</span>}
            {totalWarnings > 0 && <span className="text-amber-600 font-semibold">{totalWarnings} warning{totalWarnings !== 1 ? 's' : ''}</span>}
          </span>
        )}

        {/* Re-validate button (dev only) */}
        {userEmail === 'alice.tc@sunsetrealty.com' && (
          <button
            type="button"
            onClick={handleRevalidate}
            disabled={revalidating}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 shadow-sm hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            {revalidating ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            {revalidating ? 'Re-validating...' : 'Re-validate'}
          </button>
        )}

        {/* Send via DocuSign button */}
        <button
          type="button"
          onClick={() => setShowDocusignModal(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-blue-800 transition-colors"
        >
          <Send size={12} />
          Send via DocuSign
        </button>
      </div>

      <SendViaDocuSignModal
        open={showDocusignModal}
        onClose={() => setShowDocusignModal(false)}
        transactionId={transactionId}
        disclosureDocuments={documents}
        parties={parties}
        txContext={txContext}
      />

      {/* Form cards */}
      <div className="space-y-2">
        {entries.map((entry) => (
          <FormSummaryCard
            key={entry.formCode}
            entry={entry}
            defaultOpen={
              entry.status === 'blocked' || entry.status === 'optional_blocked' || entry.status === 'missing'
              || entry.status === 'analysis_failed' || entry.status === 'needs_review'
            }
          />
        ))}
      </div>

      {/* DocuSign Envelope History */}
      {(envelopes.length > 0 || !envelopesLoading) && (
        <div className="pt-2">
          <div className="flex items-center gap-2 mb-3">
            <FileSignature size={14} className="text-gray-400" />
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">DocuSign Envelopes</span>
            {envelopesLoading && <Loader2 size={12} className="animate-spin text-gray-400" />}
          </div>
          {envelopes.length === 0 && !envelopesLoading && (
            <p className="text-xs text-gray-400 italic">No envelopes sent yet.</p>
          )}
          {envelopes.length > 0 && (
            <div className="space-y-1.5">
              {envelopes.map((env) => {
                const status = (env.status as string) ?? 'unknown';
                const statusStyle = ENVELOPE_STATUS_STYLES[status] ?? 'bg-gray-100 text-gray-600';
                const StatusIcon = ENVELOPE_STATUS_ICONS[status] ?? Clock;
                const signers = env.signers as Array<{ name: string; email: string }> | undefined;
                return (
                  <div key={env.id as string} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-gray-50 border border-gray-100 text-sm">
                    <StatusIcon size={14} className={cn('shrink-0', status === 'completed' ? 'text-green-600' : status === 'declined' ? 'text-red-600' : 'text-gray-400')} />
                    <span className="flex-1 text-gray-700 truncate">{signers?.map((s) => s.name).join(', ') ?? 'Unknown'}</span>
                    <span className={cn('text-[10px] font-medium px-2 py-0.5 rounded-full', statusStyle)}>
                      {status.charAt(0).toUpperCase() + status.slice(1)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
