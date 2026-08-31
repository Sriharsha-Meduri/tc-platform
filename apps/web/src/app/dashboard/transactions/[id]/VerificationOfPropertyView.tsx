'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Calendar, Mail, Send, CheckCircle, XCircle, AlertTriangle,
  Clock, Loader2, FileText, Upload, Eye, Download,
} from 'lucide-react';
import ClosingChecklist from './ClosingChecklist';

interface VpData {
  id: string;
  transactionId: string;
  status: VpStatus;
  scheduledDate: string | null;
  reminderSentAt: string | null;
  documentReceivedAt: string | null;
  validatedAt: string | null;
  sentForSignatureAt: string | null;
  fullyExecutedAt: string | null;
  docusignEnvelopeId: string | null;
  vopDocumentId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

type VpStatus =
  | 'scheduled'
  | 'reminder_sent'
  | 'waiting_for_form'
  | 'form_received'
  | 'validated'
  | 'ready_for_docusign'
  | 'sent_via_docusign'
  | 'fully_executed';

const VP_STATUS_ORDER: VpStatus[] = [
  'scheduled',
  'reminder_sent',
  'waiting_for_form',
  'form_received',
  'validated',
  'ready_for_docusign',
  'sent_via_docusign',
  'fully_executed',
];

const VP_STATUS_LABELS: Record<VpStatus, string> = {
  scheduled:          'Verification Date Scheduled',
  reminder_sent:      'Reminder Email Sent',
  waiting_for_form:   'Waiting for VP Form',
  form_received:       'VP Form Received',
  validated:          'Document Validated',
  ready_for_docusign: 'Ready to Send via DocuSign',
  sent_via_docusign:  'Sent via DocuSign',
  fully_executed:     'Fully Executed',
};

const DOC_STATUS_LABELS: Record<string, string> = {
  missing:    'Missing',
  requested:  'Requested',
  received:   'Received',
  validated:  'Validated',
  sent_for_signature: 'Sent for Signature',
  fully_executed: 'Fully Executed',
};

function mapVpStatusToDocStatus(status: VpStatus): string {
  switch (status) {
    case 'scheduled':         return 'requested';
    case 'reminder_sent':     return 'requested';
    case 'waiting_for_form':  return 'requested';
    case 'form_received':     return 'received';
    case 'validated':         return 'validated';
    case 'ready_for_docusign':return 'validated';
    case 'sent_via_docusign': return 'sent_for_signature';
    case 'fully_executed':    return 'fully_executed';
    default:                  return 'missing';
  }
}

function fmt(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function fmtDateTime(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

function toISODate(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

interface DocStatusBadgeProps {
  docStatus: string;
}

function DocStatusBadge({ docStatus }: DocStatusBadgeProps) {
  const config: Record<string, { classes: string; icon: React.ElementType }> = {
    missing:     { classes: 'bg-red-100 text-red-700 border-red-200',     icon: XCircle },
    requested:   { classes: 'bg-blue-100 text-blue-700 border-blue-200',   icon: Clock },
    received:    { classes: 'bg-amber-100 text-amber-700 border-amber-200', icon: Upload },
    validated:   { classes: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: CheckCircle },
    sent_for_signature: { classes: 'bg-purple-100 text-purple-700 border-purple-200', icon: Send },
    fully_executed:     { classes: 'bg-green-100 text-green-700 border-green-200', icon: CheckCircle },
  };
  const c = config[docStatus] ?? config.missing;
  const label = DOC_STATUS_LABELS[docStatus] ?? docStatus;
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide border flex items-center gap-1 ${c.classes}`}>
      <c.icon size={9} /> {label}
    </span>
  );
}

interface Props {
  transactionId: string;
  closingDocuments?: Array<{
    id: string;
    documentType: string;
    title: string;
    fileName: string | null;
    storageUrl: string | null;
    status: string;
    createdAt: string;
    metadataJson: Record<string, unknown> | null;
  }>;
}

export default function VerificationOfPropertyView({ transactionId, closingDocuments = [] }: Props) {
  const [vp, setVp] = useState<VpData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [sendingReminder, setSendingReminder] = useState(false);
  const [sendingDocuSign, setSendingDocuSign] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Date picker state
  const [scheduleDate, setScheduleDate] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);

  const fetchVp = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/v1/verification-of-property?transactionId=${encodeURIComponent(transactionId)}`, { credentials: 'include' })
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load VP (${res.status})`);
        return res.json() as Promise<{ vp: VpData | null }>;
      })
      .then((data) => {
        setVp(data.vp);
        if (data.vp?.scheduledDate) {
          setScheduleDate(toISODate(data.vp.scheduledDate));
        }
        setLoading(false);
      })
      .catch((err: Error) => {
        setError(err.message);
        setLoading(false);
      });
  }, [transactionId]);

  useEffect(() => {
    fetchVp();
  }, [fetchVp]);

  // Clear success message after a few seconds
  useEffect(() => {
    if (actionSuccess) {
      const t = setTimeout(() => setActionSuccess(null), 3000);
      return () => clearTimeout(t);
    }
  }, [actionSuccess]);

  async function handleSchedule() {
    if (!scheduleDate) return;
    setSaving(true);
    setActionError(null);
    try {
      const res = await fetch('/api/v1/verification-of-property', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transactionId,
          scheduledDate: scheduleDate,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Failed to schedule' }));
        throw new Error((err as { message?: string }).message ?? 'Failed to schedule');
      }
      const saved = await res.json() as { vp?: VpData } | VpData;
      const vpData = saved && 'vp' in saved ? saved.vp : (saved as VpData);
      if (vpData) {
        setVp(vpData);
        if (vpData.scheduledDate) {
          setScheduleDate(toISODate(vpData.scheduledDate));
        }
      }
      setActionSuccess('VP date scheduled');
      setShowDatePicker(false);
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleSendReminder() {
    setSendingReminder(true);
    setActionError(null);
    try {
      const res = await fetch(
        `/api/v1/verification-of-property/transaction/${encodeURIComponent(transactionId)}/reminder`,
        { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' } },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Failed to send reminder' }));
        throw new Error((err as { message?: string }).message ?? 'Failed to send reminder');
      }
      setActionSuccess('Reminder email sent to buyer agent');
      fetchVp();
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setSendingReminder(false);
    }
  }

  async function handleValidate() {
    if (!vp?.id) return;
    setSaving(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/v1/verification-of-property/${vp.id}/validate`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Failed to validate' }));
        throw new Error((err as { message?: string }).message ?? 'Failed to validate');
      }
      setActionSuccess('VP document validated');
      fetchVp();
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleReadyForDocuSign() {
    if (!vp?.id) return;
    setSaving(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/v1/verification-of-property/${vp.id}/ready-for-docusign`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Failed' }));
        throw new Error((err as { message?: string }).message ?? 'Failed');
      }
      setActionSuccess('VP marked ready for DocuSign');
      fetchVp();
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleSendForSignature() {
    if (!vp?.id) return;
    setSendingDocuSign(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/v1/verification-of-property/${vp.id}/send-for-signature`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Failed to send via DocuSign' }));
        throw new Error((err as { message?: string }).message ?? 'Failed to send via DocuSign');
      }
      setActionSuccess('VP sent via DocuSign for electronic signatures');
      fetchVp();
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setSendingDocuSign(false);
    }
  }

  async function handleMarkExecuted() {
    if (!vp?.id) return;
    setSaving(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/v1/verification-of-property/${vp.id}/fully-executed`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Failed' }));
        throw new Error((err as { message?: string }).message ?? 'Failed');
      }
      setActionSuccess('VP marked as fully executed');
      fetchVp();
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  // Find VP document from closing documents
  const vopDoc = closingDocuments.find(
    (d) => d.documentType === 'verification_of_property' ||
           (d.metadataJson && (d.metadataJson as Record<string, unknown>).documentType === 'verification_of_property'),
  ) ?? (vp?.vopDocumentId ? closingDocuments.find((d) => d.id === vp.vopDocumentId) : null);

  const statusIndex = vp ? VP_STATUS_ORDER.indexOf(vp.status) : -1;
  const docStatus = vp ? mapVpStatusToDocStatus(vp.status) : 'missing';

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={20} className="animate-spin text-gray-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-12 gap-2 text-red-500">
        <AlertTriangle className="w-4 h-4" />
        <span className="text-sm">{error}</span>
      </div>
    );
  }

  return (
    <div className="py-4 space-y-4">
      {/* Header */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="px-5 py-4 bg-blue-50 border-b border-blue-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
              <FileText size={16} className="text-blue-600" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-800">Verification of Property (VP)</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Required closing document — schedule, track, and execute the buyer&apos;s final property inspection.
              </p>
            </div>
            {vp && (
              <span className="ml-auto flex items-center gap-1.5 text-[10px] font-semibold text-blue-700 bg-blue-100 border border-blue-200 px-2 py-1 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                {VP_STATUS_LABELS[vp.status] ?? vp.status}
              </span>
            )}
          </div>
        </div>

        <div className="divide-y divide-gray-100">
          {/* Inspection Date */}
          <div className="px-5 py-3">
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Verification of Property Date
            </label>
            {showDatePicker || !vp?.scheduledDate ? (
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="date"
                    value={scheduleDate}
                    onChange={(e) => setScheduleDate(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                  />
                </div>
                <button
                  onClick={handleSchedule}
                  disabled={!scheduleDate || saving}
                  className="px-4 py-2 bg-blue-700 text-white text-xs font-medium rounded-lg hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                >
                  {saving ? <Loader2 size={12} className="animate-spin" /> : 'Save'}
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-800">
                  {fmt(vp.scheduledDate)}
                </span>
                <button
                  onClick={() => setShowDatePicker(true)}
                  className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                >
                  Change
                </button>
              </div>
            )}
            <p className="text-xs text-gray-400 mt-1">
              Schedule the buyer&apos;s final Verification of Property inspection. A reminder will be sent to the buyer agent on this date.
            </p>
          </div>

          {/* Workflow Progress */}
          <div className="px-5 py-3">
            <label className="block text-xs font-medium text-gray-700 mb-2">Current Status</label>
            {vp ? (
              <div className="flex items-center gap-2.5">
                <div className="w-6 h-6 rounded-full bg-blue-500 ring-2 ring-blue-200 flex items-center justify-center shrink-0">
                  <Clock size={10} className="text-white" />
                </div>
                <div>
                  <span className="text-sm font-semibold text-blue-700">
                    {VP_STATUS_LABELS[vp.status] ?? vp.status}
                  </span>
                  {statusIndex > 0 && (
                    <span className="text-xs text-gray-400 ml-2">
                      Step {statusIndex + 1} of {VP_STATUS_ORDER.length}
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2.5">
                <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                </div>
                <span className="text-sm text-gray-400">Not yet scheduled</span>
              </div>
            )}
          </div>

          {/* Document Status */}
          <div className="px-5 py-3">
            <label className="block text-xs font-medium text-gray-700 mb-1">Document Status</label>
            <div className="flex items-center gap-2">
              <DocStatusBadge docStatus={docStatus} />
              {vp?.vopDocumentId && vopDoc && (
                <span className="text-xs text-gray-500">{vopDoc.title}</span>
              )}
            </div>
            {!vp?.vopDocumentId && (
              <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                <AlertTriangle size={10} />
                VP document has not been received. This is required before closing.
              </p>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/50">
          <div className="flex flex-wrap gap-2">
            {/* Send Reminder */}
            {vp && vp.status === 'scheduled' && (
              <button
                onClick={handleSendReminder}
                disabled={sendingReminder}
                className="flex items-center gap-1.5 px-3 py-2 bg-blue-700 text-white text-xs font-medium rounded-lg hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {sendingReminder ? <Loader2 size={12} className="animate-spin" /> : <Mail size={12} />}
                Send Reminder to Buyer Agent
              </button>
            )}

            {/* Validate */}
            {vp && vp.vopDocumentId && (vp.status === 'form_received' || vp.status === 'reminder_sent' || vp.status === 'scheduled') && (
              <button
                onClick={handleValidate}
                disabled={saving}
                className="flex items-center gap-1.5 px-3 py-2 bg-emerald-700 text-white text-xs font-medium rounded-lg hover:bg-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {saving ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />}
                Validate Document
              </button>
            )}

            {/* Ready for DocuSign */}
            {vp && vp.status === 'validated' && (
              <button
                onClick={handleReadyForDocuSign}
                disabled={saving}
                className="flex items-center gap-1.5 px-3 py-2 bg-purple-700 text-white text-xs font-medium rounded-lg hover:bg-purple-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {saving ? <Loader2 size={12} className="animate-spin" /> : <FileText size={12} />}
                Mark Ready for DocuSign
              </button>
            )}

            {/* Send via DocuSign */}
            {vp && (vp.status === 'validated' || vp.status === 'ready_for_docusign') && (
              <button
                onClick={handleSendForSignature}
                disabled={sendingDocuSign}
                className="flex items-center gap-1.5 px-3 py-2 bg-indigo-700 text-white text-xs font-medium rounded-lg hover:bg-indigo-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {sendingDocuSign ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                Send via DocuSign
              </button>
            )}

            {/* Mark Fully Executed */}
            {vp && vp.status === 'sent_via_docusign' && (
              <button
                onClick={handleMarkExecuted}
                disabled={saving}
                className="flex items-center gap-1.5 px-3 py-2 bg-green-700 text-white text-xs font-medium rounded-lg hover:bg-green-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {saving ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />}
                Mark Fully Executed
              </button>
            )}
          </div>
        </div>

        {/* Error / Success messages */}
        {actionError && (
          <div className="px-5 pb-3">
            <div className="flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <XCircle size={12} className="shrink-0 mt-0.5" />
              {actionError}
            </div>
          </div>
        )}
        {actionSuccess && (
          <div className="px-5 pb-3">
            <div className="flex items-start gap-2 text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
              <CheckCircle size={12} className="shrink-0 mt-0.5" />
              {actionSuccess}
            </div>
          </div>
        )}
      </div>

      {/* VP Document */}
      {vopDoc && (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <FileText size={14} className="text-gray-500" />
              <h3 className="text-sm font-semibold text-gray-700">VP Document</h3>
            </div>
          </div>
          <div className="px-5 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-xl">📄</span>
                <div>
                  <p className="text-sm font-medium text-gray-800">{vopDoc.fileName ?? vopDoc.title}</p>
                  <p className="text-xs text-gray-400">{fmt(vopDoc.createdAt)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {vopDoc.storageUrl && (
                  <a
                    href={vopDoc.storageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
                  >
                    <Eye size={12} /> View
                  </a>
                )}
                {vopDoc.storageUrl && (
                  <a
                    href={`/api/v1/transaction-documents/${vopDoc.id}/file`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600"
                  >
                    <Download size={12} />
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <ClosingChecklist
        closingDocuments={closingDocuments}
        vpDocumentId={vp?.vopDocumentId}
        vpStatus={vp?.status}
      />

    </div>
  );
}
