'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  CheckCircle, XCircle, AlertTriangle, Clock, ChevronDown, ChevronRight,
  Eye, Download, FileText, Calendar, Bell,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ExtractionResult } from '@/app/transactions/new/extraction-result.types';
import type { ApiStageInstance, ApiDocument, ApiParty } from '@/lib/api';
import type { TransactionContext } from './SendViaDocuSignModal';
import SendViaDocuSignModal from './SendViaDocuSignModal';
import ApprovalWorkflow from './ApprovalWorkflow';
import type { FinalNegotiatedTerms, FinalTerm } from '@tc/shared';

type ContingencyKey = 'inspection' | 'appraisal' | 'loan';

interface CrValidation {
  doc: ApiDocument;
  isComplete: boolean;
  blockers: string[];
  warnings: string[];
}

interface ContingencySection {
  key: ContingencyKey;
  label: string;
  contingencyDays: number | null;
  deadline: string | null;
  deadlineDisplay: string | null;
  isOverdue: boolean;
  status: 'complete' | 'incomplete' | 'blocked' | 'overdue' | 'waived' | 'needs_review';
  /** Controlling document + page/section for the final value, from the resolver — never derived client-side. */
  sourceCaption: string | null;
  documents: ApiDocument[];
  crDocs: CrValidation[];
  allDocs: ApiDocument[];
}

function fmt(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtFull(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function isPast(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false;
  return new Date(dateStr).getTime() < Date.now();
}

function validateCrForm(doc: ApiDocument): CrValidation {
  const extraction = (doc.metadataJson?.extraction as Record<string, unknown> | null) ?? {};
  const signatures = extraction?.signatures as Record<string, unknown> | null;
  const contractTerms = extraction?.contractTerms as Record<string, unknown> | null;

  const blockers: string[] = [];
  const buyerSigned = (signatures?.buyerSigned as boolean) === true;
  const missingSigs = (signatures?.missingSignatures as string[]) ?? [];
  const missingDates = (signatures?.missingSignatureDates as string[]) ?? [];

  if (!buyerSigned && missingSigs.length > 0) blockers.push('Buyer signature is missing');
  if (missingDates.length > 0) blockers.push(`Signature date missing for: ${missingDates.join(', ')}`);

  return { doc, isComplete: blockers.length === 0, blockers, warnings: [] };
}

interface Props {
  extractionResult: ExtractionResult | null;
  /** The server-resolved Final Negotiated Terms — single source of truth for contingency days/deadlines. Never fall back to raw extractionResult.contractTerms values when present. */
  finalTerms?: FinalNegotiatedTerms | null;
  stageInstances: ApiStageInstance[];
  inspectionDocuments: ApiDocument[];
  inspectionCompliance: { blockers?: Array<{ compositeId: string }>; warnings?: Array<{ compositeId: string }> } | null;
  appraisalDocuments: ApiDocument[];
  loanDocuments: ApiDocument[];
  parties: ApiParty[];
  txContext?: { propertyAddress: string; coordinatorName: string; transactionType?: string; transactionNumber?: string };
  transactionId: string;
}

function sourceCaptionFor(term: FinalTerm | undefined): string | null {
  if (!term?.source) return null;
  return `${term.source.formCode} · v${term.source.versionNo}${term.source.section ? ` · ${term.source.section}` : ''}`;
}

function buildContingencySections(
  finalTerms: FinalNegotiatedTerms | null,
  inspectionDocuments: ApiDocument[],
  appraisalDocuments: ApiDocument[],
  loanDocuments: ApiDocument[],
): ContingencySection[] {
  const termByKey = new Map((finalTerms?.terms ?? []).map((t) => [t.key, t]));

  function build(key: ContingencyKey, label: string, docs: ApiDocument[]): ContingencySection {
    const term = termByKey.get(key);
    const days = term?.days ?? null;
    const deadlineStr = term?.deadline ? fmt(term.deadline) : null;
    const overdue = deadlineStr ? isPast(term!.deadline) : false;

    const crDocs = docs
      .filter((d) => {
        const meta = d.metadataJson as Record<string, unknown> | null;
        const code = (meta?.detectedFormCode as string ?? '').toUpperCase();
        return code === 'CR-B' || code === 'CR';
      })
      .map((d) => validateCrForm(d));

    const anyCrComplete = crDocs.some((c) => c.isComplete);
    const hasCrDocs = crDocs.length > 0;

    let status: ContingencySection['status'];
    if (term?.status === 'Needs Review') status = 'needs_review';
    else if (term?.status === 'Removed' || anyCrComplete) status = 'complete';
    else if (term?.status === 'No contingency') status = 'waived';
    else if (overdue && !anyCrComplete) status = 'overdue';
    else if (hasCrDocs) status = 'blocked';
    else status = 'incomplete';

    return {
      key, label,
      contingencyDays: days,
      deadline: term?.deadline ?? null,
      deadlineDisplay: deadlineStr,
      isOverdue: overdue,
      status,
      sourceCaption: sourceCaptionFor(term),
      documents: docs.filter((d) => {
        const meta = d.metadataJson as Record<string, unknown> | null;
        const code = (meta?.detectedFormCode as string ?? '').toUpperCase();
        return code !== 'CR-B' && code !== 'CR';
      }),
      crDocs,
      allDocs: docs,
    };
  }

  return [
    build('inspection', 'Inspection', inspectionDocuments),
    build('appraisal', 'Appraisal', appraisalDocuments),
    build('loan', 'Loan', loanDocuments),
  ];
}

function ContingencyHeader({
  section, defaultOpen, reminderConfig,
}: {
  section: ContingencySection;
  defaultOpen: boolean;
  reminderConfig: { inspection: boolean; appraisal: boolean; loan: boolean; startDays: number };
}) {
  const [open, setOpen] = useState(defaultOpen);
  const enabled = reminderConfig[section.key] ?? true;
  const startDays = reminderConfig.startDays ?? 3;

  // Compute when reminders begin
  const hasContingency = section.contingencyDays != null;
  const now = new Date();
  const acceptanceDate = section.deadline ? new Date(section.deadline) : null;
  let reminderStartLabel: string | null = null;

  if (hasContingency) {
    // Active contingency: reminders start (deadline - startDays)
    if (acceptanceDate && !isNaN(acceptanceDate.getTime())) {
      const reminderStart = new Date(acceptanceDate);
      reminderStart.setDate(reminderStart.getDate() - startDays);
      const diffDays = Math.ceil((reminderStart.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays <= 0) reminderStartLabel = 'Today';
      else if (diffDays === 1) reminderStartLabel = 'Tomorrow';
      else reminderStartLabel = `${diffDays} days`;
    }
  }

  const statusConfig = {
    complete:      { icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-200', label: 'Complete' },
    incomplete:    { icon: Clock,        color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200', label: 'Incomplete' },
    blocked:       { icon: XCircle,      color: 'text-red-600',   bg: 'bg-red-50',   border: 'border-red-200',   label: 'Blocked' },
    overdue:       { icon: AlertTriangle, color: 'text-red-700',  bg: 'bg-red-100',  border: 'border-red-300',   label: 'Overdue' },
    waived:        { icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-200', label: 'No Contingency' },
    needs_review:  { icon: AlertTriangle, color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-300', label: 'Needs Review' },
  }[section.status];
  const SIcon = statusConfig.icon;

  return (
    <div className={cn('rounded-xl border overflow-hidden', statusConfig.border)}>
      <button type="button" onClick={() => setOpen((v) => !v)}
        className={cn('w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:brightness-95', statusConfig.bg)}>
        <SIcon size={16} className={cn('shrink-0', statusConfig.color)} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-gray-800">{section.label} Contingency</span>
            <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded-full uppercase tracking-wide border', statusConfig.bg, statusConfig.color, statusConfig.border)}>
              {statusConfig.label}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-1 text-[11px] text-gray-500 flex-wrap">
            <span className="flex items-center gap-1">
              <Calendar size={10} />
              {section.contingencyDays != null
                ? `${section.contingencyDays} Days`
                : 'No Contingency'}
            </span>
            {section.deadlineDisplay && (
              <span className={section.isOverdue ? 'text-red-600 font-semibold' : ''}>
                Deadline: {section.deadlineDisplay}
              </span>
            )}
            {section.isOverdue && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200">Overdue</span>
            )}
            {section.crDocs.length > 0 && (
              <span className="flex items-center gap-0.5 font-semibold">
                {section.crDocs.some(c => c.isComplete)
                  ? <CheckCircle size={10} className="text-green-500" />
                  : <XCircle size={10} className="text-red-500" />}
                {' '}CR: {section.crDocs.find(c => c.isComplete) ? 'Complete' : section.crDocs.length > 0 ? `${section.crDocs.length} uploaded` : 'Missing'}
              </span>
            )}
          </div>
          {section.status === 'needs_review' && (
            <p className="text-[11px] text-amber-600 mt-1">
              Needs Review — Final term could not be determined.
            </p>
          )}
          {section.sourceCaption && (
            <p className="text-[10px] text-gray-400 mt-0.5">Source: {section.sourceCaption}</p>
          )}
          {/* Reminder schedule */}
          {enabled && (
            <div className="flex items-center gap-2 mt-1 text-[10px] text-gray-400">
              <Bell size={10} />
              {hasContingency ? (
                reminderStartLabel ? (
                  <span>Auto-reminder begins: <span className="text-gray-600 font-medium">{reminderStartLabel}</span></span>
                ) : (
                  <span>Auto-reminder: {startDays}d before deadline</span>
                )
              ) : (
                <span>CR reminder: {startDays}d after acceptance</span>
              )}
            </div>
          )}
        </div>
        {open ? <ChevronDown size={15} className="text-gray-400 shrink-0" /> : <ChevronRight size={15} className="text-gray-400 shrink-0" />}
      </button>

      {open && (
        <div className="bg-white">
          {/* CR-B Documents section */}
          <div className="px-4 py-2 border-t border-gray-100">
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Contingency Removal (CR-B)
              {section.crDocs.length === 0 && <span className="text-red-500 ml-1">&mdash; Required</span>}
            </p>

            {section.crDocs.length === 0 ? (
              <div className="text-center py-3">
                <FileText size={24} className="text-gray-200 mx-auto mb-1.5" />
                <p className="text-xs text-gray-500 font-medium">No CR-B form uploaded</p>
                <p className="text-[10px] text-gray-400 mt-0.5">
                  A Contingency Removal form is required to officially close this contingency.
                  {section.deadlineDisplay && (
                    <span className={section.isOverdue ? 'text-red-600 font-medium' : ''}>
                      {' '}Due by {section.deadlineDisplay}.
                    </span>
                  )}
                </p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {section.crDocs.map((cr) => (
                  <div key={cr.doc.id} className={cn('rounded-lg border overflow-hidden',
                    cr.isComplete ? 'border-green-200' : 'border-red-200',
                  )}>
                    <div className={cn('flex items-center gap-3 px-3 py-2', cr.isComplete ? 'bg-green-50/50' : 'bg-red-50/50')}>
                      {cr.isComplete
                        ? <CheckCircle size={14} className="text-green-500 shrink-0" />
                        : <XCircle size={14} className="text-red-500 shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-gray-800 truncate">{cr.doc.fileName ?? cr.doc.title}</span>
                          <span className={cn('text-[9px] font-semibold px-1.5 py-0.5 rounded-full uppercase',
                            cr.isComplete ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-red-100 text-red-700 border border-red-200',
                          )}>
                            {cr.isComplete ? 'Complete' : 'Blocked'}
                          </span>
                        </div>
                        <p className="text-[10px] text-gray-400">{fmt(cr.doc.createdAt)}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        {cr.doc.storageUrl && (
                          <>
                            <a href={cr.doc.storageUrl} target="_blank" rel="noopener noreferrer"
                              className="text-[10px] text-blue-600 hover:text-blue-800 px-1.5 py-0.5"><Eye size={10} /> View</a>
                            <a href={`/api/v1/transaction-documents/${cr.doc.id}/file`} target="_blank" rel="noopener noreferrer"
                              className="text-[10px] text-gray-400 hover:text-gray-600 px-1 py-0.5"><Download size={10} /></a>
                          </>
                        )}
                      </div>
                    </div>
                    {cr.blockers.length > 0 && (
                      <div className="px-3 py-1.5 border-t border-red-100 bg-red-50/30 space-y-1">
                        {cr.blockers.map((b, i) => (
                          <div key={i} className="flex items-start gap-1.5 text-[10px] text-red-700">
                            <XCircle size={9} className="text-red-500 shrink-0 mt-0.5" />
                            {b}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Other documents */}
          {section.documents.length > 0 && (
            <div className="px-4 py-2 border-t border-gray-100">
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Related Documents</p>
              <div className="space-y-1">
                {section.documents.map((doc) => {
                  const meta = doc.metadataJson as Record<string, unknown> | null;
                  const formCode = (meta?.detectedFormCode as string ?? '').toUpperCase();
                  return (
                    <div key={doc.id} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-50 border border-gray-100 text-xs">
                      <FileText size={12} className="text-gray-400 shrink-0" />
                      <span className="flex-1 truncate text-gray-700">{doc.fileName ?? doc.title}</span>
                      {formCode && <span className="text-[9px] font-mono bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded">{formCode}</span>}
                      <span className="text-gray-400">{fmt(doc.createdAt)}</span>
                      {doc.storageUrl && (
                        <a href={doc.storageUrl} target="_blank" rel="noopener noreferrer"
                          className="text-[10px] text-blue-600 hover:text-blue-800"><Eye size={10} /> View</a>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* DocuSign — removed, not part of contingency workflow */}
        </div>
      )}
    </div>
  );
}

export default function ContingenciesView({
  extractionResult, finalTerms, stageInstances: _si, inspectionDocuments, inspectionCompliance: _ic,
  appraisalDocuments, loanDocuments, parties, txContext, transactionId,
}: Props) {
  const sections = useMemo(
    () => buildContingencySections(finalTerms ?? null, inspectionDocuments, appraisalDocuments, loanDocuments),
    [finalTerms, inspectionDocuments, appraisalDocuments, loanDocuments],
  );
  
  const [reminderConfig, setReminderConfig] = useState({ inspection: true, appraisal: true, loan: true, startDays: 3 });
  useEffect(() => {
    fetch(`/api/v1/transactions/${encodeURIComponent(transactionId)}/reminder-config`, { credentials: 'include' })
      .then((r) => r.ok ? r.json() : null)
      .then((c) => { if (c) setReminderConfig(c); })
      .catch(() => {});
  }, [transactionId]);

  const [showDocusign, setShowDocusign] = useState(false);

  // Always pass all 3 contingencies for the approval request regardless of status
  const applicableContingencies = useMemo(() => {
    return ['inspection', 'appraisal', 'loan'];
  }, []);

  if (!extractionResult) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <FileText size={32} className="text-gray-300 mb-3" />
        <p className="text-sm text-gray-500">No contract data available.</p>
        <p className="text-xs text-gray-400 mt-1">
          Upload a Residential Purchase Agreement (RPA) to see contingency information.
        </p>
      </div>
    );
  }

  return (
    <div className="py-4 space-y-3">
      {/* Buyer Agent Approval + DocuSign send for contingency removal */}
      <div className="flex items-center justify-end">
        <ApprovalWorkflow
          transactionId={transactionId}
          approvalType="buyer_agent_contingency_removal"
          contingencies={applicableContingencies}
          onSendViaDocuSign={() => setShowDocusign(true)}
        />
      </div>

      <SendViaDocuSignModal
        open={showDocusign}
        onClose={() => setShowDocusign(false)}
        transactionId={transactionId}
        disclosureDocuments={inspectionDocuments}
        parties={parties ?? []}
        txContext={txContext}
      />

      {sections.map((section) => (
        <ContingencyHeader key={section.key} section={section} defaultOpen={section.status !== 'complete'} reminderConfig={reminderConfig} />
      ))}
    </div>
  );
}
