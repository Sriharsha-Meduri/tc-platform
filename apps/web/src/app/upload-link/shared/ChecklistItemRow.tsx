'use client';

import { useState } from 'react';
import { CheckCircle, XCircle, Clock, AlertTriangle, Circle, FileText, ChevronDown, ChevronRight, MinusCircle, Loader2 } from 'lucide-react';
import {
  ChecklistItemDto, UnmatchedDocumentDto, ChecklistItemStatus, UnmatchedDocumentStatus,
  DocumentValidationDto, SellerAgentDocumentDocusignDto,
  CHECKLIST_STATUS_LABELS, UNMATCHED_STATUS_LABELS, DOCUSIGN_ENVELOPE_STATUS_LABELS,
} from './checklist.types';

function ChecklistItemStatusBadge({ status, isOptional }: { status: ChecklistItemStatus; isOptional?: boolean }) {
  const styles: Record<ChecklistItemStatus, string> = {
    required: 'bg-gray-100 text-gray-600',
    analyzing: 'bg-blue-50 text-blue-600',
    submitted: 'bg-green-50 text-green-700',
    reupload_required: 'bg-red-50 text-red-700',
  };
  const label = status === 'required' && isOptional ? 'Optional' : CHECKLIST_STATUS_LABELS[status];
  return (
    <span className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${styles[status]}`}>
      {status === 'analyzing' && <Clock size={10} className="animate-pulse" />}
      {label}
    </span>
  );
}

/**
 * The form code tag shown next to every checklist item's name, e.g. "[TDS]",
 * "[AVID]" — always the code Document Intelligence identifies this item by.
 * Once a document is matched, `item.matchedDocument.formType` (the actual
 * identified document's own form code) is shown instead of the item's
 * static/expected `formCode`, so the tag always reflects the real uploaded
 * document once one exists — even though today the two are guaranteed equal
 * by construction (see matchDocumentsToChecklist), this keeps the tag
 * correct even if that guarantee ever loosens.
 */
function FormCodeTag({ code }: { code: string }) {
  return (
    <span className="shrink-0 font-mono text-[10px] font-medium text-gray-400" title={`Form code: ${code}`}>
      [{code}]
    </span>
  );
}

/**
 * Whenever Document Intelligence has identified a form code (formType) for
 * this document, that code — e.g. "RPA", "BCO", "BIA" — is always shown
 * instead of a generic status word, regardless of which underlying status
 * produced it (an unmatched-to-this-checklist identified form, a stray
 * fallback state, whatever): a known form code is always more specific and
 * more useful than "Uploaded". Only a document Document Intelligence
 * genuinely couldn't identify at all (formType null) falls back to its
 * plain status label.
 */
function UnmatchedDocumentStatusBadge({ status, formType }: { status: UnmatchedDocumentStatus; formType?: string | null }) {
  const styles: Record<UnmatchedDocumentStatus, string> = {
    uploaded: 'bg-gray-100 text-gray-600',
    analyzing: 'bg-blue-50 text-blue-600',
    analysis_failed: 'bg-red-50 text-red-700',
    unknown_form: 'bg-purple-50 text-purple-700',
    needs_review: 'bg-gray-100 text-gray-600',
    original: 'bg-gray-100 text-gray-500',
  };
  const label = formType ?? UNMATCHED_STATUS_LABELS[status];
  const styleKey = formType ? 'unknown_form' : status;
  return (
    <span className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${styles[styleKey]}`}>
      {status === 'analyzing' && <Clock size={10} className="animate-pulse" />}
      {label}
    </span>
  );
}

/**
 * Required-checklist items: any recorded check at all (passed, failed,
 * warning, or overridden) makes the "Validation Details" dropdown available
 * — a submitted required document's full pass/fail breakdown is always
 * visible, not just shown when something went wrong.
 */
function hasAnyChecks(validation?: DocumentValidationDto | null): boolean {
  return !!validation?.checks.length;
}

/**
 * Overall pass/fail verdict for a document's own validation checks — the
 * source of truth is always `validation.checks` (the same compliance
 * result every other consumer reads), never a separate computation. Any
 * `'failed'` check makes the whole document a fail, regardless of how many
 * others passed. A document with checks but none `'failed'` and at least
 * one `'passed'` is a pass. A document with no applicable checks at all
 * (nothing uploaded to validate yet, or every check is `'not_applicable'`/
 * `'pending'`) is neither — it must never render as a failure just because
 * nothing was checked.
 */
function validationVerdict(validation?: DocumentValidationDto | null): 'pass' | 'fail' | 'none' {
  const checks = validation?.checks ?? [];
  if (checks.some((c) => c.status === 'failed')) return 'fail';
  if (checks.some((c) => c.status === 'passed')) return 'pass';
  return 'none';
}

/** Leading status icon for an "Additionally Uploaded Document" row — checkmark/X per `validationVerdict`, or the plain file icon when there's nothing applicable to verdict on. */
function UnmatchedDocumentStatusIcon({ validation }: { validation?: DocumentValidationDto | null }) {
  const verdict = validationVerdict(validation);
  if (verdict === 'fail') return <XCircle size={12} className="text-red-500 shrink-0" />;
  if (verdict === 'pass') return <CheckCircle size={12} className="text-green-600 shrink-0" />;
  return <FileText size={12} className="text-gray-400 shrink-0" />;
}

/**
 * The expanded per-check validation breakdown, or the rejection-reason list
 * for a reupload-required item — never both, a document only ever has one
 * or the other. `heading` prepends a "Validation Details" label above the
 * check list — used by the "Additionally Uploaded Documents" rows so the
 * expanded dropdown is self-labeled, matching the required-checklist rows
 * that already have their own document name as a heading right above.
 */
function ValidationChecksList({ validation, lastRejectionReasons, heading }: { validation?: DocumentValidationDto | null; lastRejectionReasons?: string[] | null; heading?: boolean }) {
  if (lastRejectionReasons && lastRejectionReasons.length > 0) {
    return (
      <div className="pl-6 mt-2 space-y-1">
        <p className="text-xs font-semibold text-red-600">What needs to be corrected:</p>
        <ul className="list-disc list-inside space-y-0.5">
          {lastRejectionReasons.map((reason, i) => <li key={i} className="text-xs text-red-600">{reason}</li>)}
        </ul>
      </div>
    );
  }

  if (validation && validation.checks.length > 0) {
    return (
      <div className="pl-6 mt-2 space-y-1.5">
        {heading && <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Validation Details</p>}
        {validation.checks.map((check, i) => (
          <div key={`${check.id}-${i}`} className="flex items-start gap-1.5 text-xs">
            {check.status === 'passed' && <CheckCircle size={12} className="text-green-600 shrink-0 mt-0.5" />}
            {check.status === 'failed' && <XCircle size={12} className={`shrink-0 mt-0.5 ${check.severity === 'warning' ? 'text-amber-500' : 'text-red-500'}`} />}
            {check.status === 'not_applicable' && <MinusCircle size={12} className="text-gray-300 shrink-0 mt-0.5" />}
            {check.status === 'pending' && <Loader2 size={12} className="text-gray-400 shrink-0 mt-0.5 animate-spin" />}
            <span className="flex-1 min-w-0">
              <span className="text-gray-700">{check.label}</span>
              <span className={
                check.status === 'passed' ? 'ml-1 font-medium text-green-700'
                : check.status === 'failed' ? `ml-1 font-medium ${check.severity === 'warning' ? 'text-amber-600' : 'text-red-600'}`
                : 'ml-1 font-medium text-gray-400'
              }>
                {' — '}
                {check.status === 'passed' ? 'Passed' : check.status === 'failed' ? 'Failed' : check.status === 'not_applicable' ? 'Not Applicable' : 'Pending'}
              </span>
              {check.location && !check.label.includes(check.location) && (
                <span className="block text-gray-400">{check.location}</span>
              )}
              {check.detail && <span className="block text-gray-400">{check.detail}</span>}
              {check.id && <span className="block text-gray-300 font-mono text-[10px]">Code: {check.id}</span>}
            </span>
          </div>
        ))}
      </div>
    );
  }

  return <p className="pl-6 mt-2 text-xs text-gray-400">No validation details available yet.</p>;
}

/**
 * Passive DocuSign envelope status — a small badge once an envelope exists
 * for this document, otherwise nothing. No Send/Resend action lives here:
 * every document is now sent (or resent) through the checklist sidebar's
 * single centralized "Send via DocuSign" action (see SendDocumentsViaDocuSignModal),
 * which lets the Seller Agent select any combination of documents — including
 * one with a terminal-negative envelope here — rather than one button per row.
 */
function DocusignStatusBadge({ docusign }: { docusign: SellerAgentDocumentDocusignDto }) {
  if (!docusign.envelope) return null;
  return (
    <span className="shrink-0 inline-flex mt-1.5 text-xs font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
      {DOCUSIGN_ENVELOPE_STATUS_LABELS[docusign.envelope.status] ?? docusign.envelope.status}
    </span>
  );
}

/**
 * One checklist row — shared between the required-items list and the
 * optional-forms list, and across every upload-link purpose (Buyer Agent,
 * Seller Agent, Escrow, Broker) via the same enrichment pipeline
 * (SellerAgentDocumentDocusignService for Seller Agent,
 * BuyerAgentChecklistValidationService for everyone else) — so `validation`
 * is populated uniformly regardless of purpose. Expandable (chevron) to
 * reveal the document's full validation-check breakdown (or, for a
 * reupload-required item, the reasons behind the most recent rejection).
 * `docusign` is the one field that really is Seller-Agent-only (no other
 * purpose has a document-sending flow) — this row simply renders nothing
 * extra when it's absent.
 */
export default function ChecklistItemRow({ item, isOptional }: {
  item: ChecklistItemDto;
  isOptional?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasExpandableContent = hasAnyChecks(item.validation) || !!item.lastRejectionReasons?.length;

  return (
    <div className="px-5 py-3">
      <div className="flex items-center gap-2">
        {item.status === 'submitted' && <CheckCircle size={14} className="text-green-600 shrink-0" />}
        {item.status === 'analyzing' && <Clock size={14} className="text-blue-500 shrink-0 animate-pulse" />}
        {item.status === 'reupload_required' && <AlertTriangle size={14} className="text-red-500 shrink-0" />}
        {item.status === 'required' && <Circle size={14} className="text-gray-300 shrink-0" />}
        <span className="flex-1 min-w-0 truncate text-sm text-gray-700">{item.formName}</span>
        <FormCodeTag code={item.matchedDocument?.formType ?? item.formCode} />
        <ChecklistItemStatusBadge status={item.status} isOptional={isOptional} />
        {hasExpandableContent && (
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            aria-label={expanded ? 'Hide validation details' : 'Show validation details'}
            className="shrink-0 text-gray-400 hover:text-gray-600"
          >
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        )}
      </div>
      {item.matchedDocument && (
        <p className="pl-6 text-xs text-gray-500 mt-1 truncate">
          {item.matchedDocument.fileName}{item.matchedDocument.formType ? ` · ${item.matchedDocument.formType}` : ''}
        </p>
      )}
      {item.deadlineDisplay && (
        <p className="pl-6 text-xs text-gray-500 mt-1">
          {item.contractTimeframe}
          {' · Deadline: '}{item.deadlineDisplay}
          {item.status !== 'submitted' && item.daysRemaining != null && (
            <span className={item.isPastDue ? 'text-red-600 font-medium' : ''}>
              {' '}·{' '}
              {item.isPastDue
                ? `${Math.abs(item.daysRemaining)} day${Math.abs(item.daysRemaining) === 1 ? '' : 's'} past due`
                : `${item.daysRemaining} day${item.daysRemaining === 1 ? '' : 's'} remaining`}
            </span>
          )}
        </p>
      )}
      {item.status === 'reupload_required' && (
        <p className="pl-6 text-xs text-red-600 mt-1">A previous upload for this item failed validation. Please reupload a corrected document.</p>
      )}
      {item.requirementNote && item.status !== 'submitted' && (
        <p className="pl-6 text-xs text-amber-600 mt-1">{item.requirementNote}</p>
      )}
      {item.docusign && (
        <div className="pl-6">
          <DocusignStatusBadge docusign={item.docusign} />
        </div>
      )}
      {expanded && hasExpandableContent && (
        <ValidationChecksList validation={item.validation} lastRejectionReasons={item.lastRejectionReasons} />
      )}
    </div>
  );
}

/**
 * The "Additionally Uploaded Documents" (unmatched) row. Leads with a
 * checkmark/X/plain-file icon summarizing `doc.validation` (see
 * `validationVerdict`) — the SAME compliance result every other consumer of
 * this document reads, never a bespoke sidebar-only computation. Expandable
 * whenever there's any check at all (passed or failed), not just when
 * something's wrong, so a fully-compliant document's full breakdown is still
 * available on demand — matching the required-checklist rows above.
 */
export function UnmatchedDocumentRow({ doc }: {
  doc: UnmatchedDocumentDto;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasExpandableContent = hasAnyChecks(doc.validation);

  return (
    <div className="px-5 py-2.5">
      <div className="flex items-center gap-2" title={doc.isOriginalPackage ? 'This is the original file you uploaded — it was split into the individual forms shown on this checklist.' : undefined}>
        <UnmatchedDocumentStatusIcon validation={doc.validation} />
        <span className="flex-1 min-w-0 truncate text-xs text-gray-600">
          {doc.fileName}{doc.formType ? ` · ${doc.formType}` : ''}
        </span>
        <UnmatchedDocumentStatusBadge status={doc.status} formType={doc.formType} />
        {hasExpandableContent && (
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            aria-label={expanded ? 'Hide validation details' : 'Show validation details'}
            className="shrink-0 text-gray-400 hover:text-gray-600"
          >
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        )}
      </div>
      {doc.docusign && (
        <div className="pl-4">
          <DocusignStatusBadge docusign={doc.docusign} />
        </div>
      )}
      {expanded && hasExpandableContent && (
        <ValidationChecksList validation={doc.validation} lastRejectionReasons={null} heading />
      )}
    </div>
  );
}
