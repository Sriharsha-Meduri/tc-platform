'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import {
  CheckCircle, XCircle, Loader2, Home, FileText, AlertTriangle, Paperclip, ExternalLink,
} from 'lucide-react';

interface ApprovalRequest {
  id: string;
  transactionId: string;
  status: 'pending' | 'approved' | 'rejected';
  contingencyStatus: Record<string, 'pending' | 'approved' | 'rejected'> | null;
}

interface TransactionInfo {
  propertyAddressLine1: string | null;
  propertyCity: string | null;
  propertyState: string | null;
  propertyPostalCode: string | null;
}

interface RrDocInfo {
  id: string;
  formCode: string | null;
  title: string;
  status: string;
}

const ALL_CONTINGENCIES = [
  { key: 'loan',       label: 'Loan Contingency',       desc: 'Buyer must obtain loan approval within the specified timeframe' },
  { key: 'inspection', label: 'Inspection Contingency',  desc: 'Buyer\'s right to inspect the property and request repairs' },
  { key: 'appraisal',  label: 'Appraisal Contingency',   desc: 'Property must appraise at or above the purchase price' },
];

type ContingencyAction = 'pending' | 'approved' | 'rejected';

export default function ApprovePage() {
  const params = useParams<{ id: string }>();
  const [request, setRequest] = useState<ApprovalRequest | null>(null);
  const [txInfo, setTxInfo] = useState<TransactionInfo | null>(null);
  const [rrDocs, setRrDocs] = useState<RrDocInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [comments, setComments] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Track per-contingency actions locally (initialize from server status)
  const [actions, setActions] = useState<Record<string, ContingencyAction>>({});

  useEffect(() => {
    if (!params?.id) return;
    setLoading(true);

    fetch(`/api/v1/approval-requests/${params.id}`)
      .then((r) => r.json())
      .then((data: ApprovalRequest) => {
        setRequest(data);
        // Initialize actions from server status, default to 'pending'
        const cs = data.contingencyStatus ?? {};
        const init: Record<string, ContingencyAction> = {};
        for (const c of ALL_CONTINGENCIES) {
          init[c.key] = (cs[c.key] as ContingencyAction) || 'pending';
        }
        setActions(init);

        if (data.transactionId) {
          return Promise.all([
            fetch(`/api/v1/transactions/${data.transactionId}`).then((r) => r.json() as Promise<TransactionInfo>),
            fetch(`/api/v1/transaction-documents/transaction/${data.transactionId}/active`).then((r) => r.json() as Promise<RrDocInfo[]>),
          ]);
        }
        return null;
      })
      .then((results) => {
        if (results) {
          const [tx, docs] = results;
          setTxInfo(tx);
          setRrDocs((docs || []).filter((d) => {
            const meta = (d as unknown as { metadataJson?: { detectedFormCode?: string } }).metadataJson;
            const code = meta?.detectedFormCode?.toUpperCase();
            return code === 'RR' || code === 'RRRR';
          }));
        }
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [params?.id]);

  function toggleContingency(key: string, action: ContingencyAction) {
    setActions((prev) => ({ ...prev, [key]: prev[key] === action ? 'pending' : action }));
  }

  async function handleSubmit() {
    if (!request) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/v1/approval-requests/${request.id}/approve-contingencies`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selected: Object.entries(actions).filter(([, v]) => v === 'approved').map(([k]) => k),
          rejected: Object.entries(actions).filter(([, v]) => v === 'rejected').map(([k]) => k),
          comments: comments.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error('Failed to submit approval');

      setDone(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  const hasChanges = Object.entries(actions).some(([k, v]) => {
    const orig = request?.contingencyStatus?.[k] || 'pending';
    return v !== orig;
  });

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 size={32} className="animate-spin text-blue-500 mx-auto mb-4" />
          <p className="text-gray-500 text-sm">Loading approval request...</p>
        </div>
      </div>
    );
  }

  if (error && !request) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center bg-white rounded-xl border border-gray-200 p-8 max-w-sm">
          <XCircle size={40} className="text-red-400 mx-auto mb-4" />
          <p className="text-gray-700 font-medium mb-2">Unable to load request</p>
          <p className="text-sm text-gray-500">{error}</p>
        </div>
      </div>
    );
  }

  if (request && request.status !== 'pending') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center bg-white rounded-xl border border-gray-200 p-8 max-w-sm">
          <CheckCircle size={40} className="text-green-400 mx-auto mb-4" />
          <p className="text-gray-700 font-medium mb-2">Already {request.status}</p>
          <p className="text-sm text-gray-500">This approval request has already been {request.status}.</p>
        </div>
      </div>
    );
  }

  if (done) {
    const approvedCount = Object.values(actions).filter((v) => v === 'approved').length;
    const hasRrDocs = rrDocs.length > 0;

    return (
      <div className="min-h-screen bg-gray-50 py-8 px-4">
        <div className="max-w-lg mx-auto space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle size={24} className="text-green-600" />
            </div>
            <h2 className="text-lg font-semibold text-gray-800 mb-2">Response Submitted</h2>
            <p className="text-sm text-gray-500 mb-1">
              {approvedCount} of {ALL_CONTINGENCIES.length} contingencies approved.
            </p>
            <p className="text-sm text-gray-500 mb-6">
              The transaction coordinator has been notified.
            </p>

            {/* RR Form Reminder */}
            {approvedCount > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-left mb-6">
                <div className="flex items-start gap-2">
                  <AlertTriangle size={14} className="text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-medium text-amber-700 mb-1">RR Form Reminder</p>
                    <p className="text-xs text-amber-600 mb-2">
                      If any approved contingency has been removed or waived, please upload the
                      corresponding Removal of Contingency (RR) form so it can be reviewed and included in the transaction record.
                    </p>
                    {hasRrDocs ? (
                      <div className="space-y-1">
                        <p className="text-[10px] text-green-700 font-medium">RR forms received:</p>
                        {rrDocs.map((d) => (
                          <div key={d.id} className="flex items-center gap-1.5 text-[10px] text-green-600">
                            <CheckCircle size={10} /> {d.title} ({d.formCode || 'RR'})
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[10px] text-red-600 font-medium">
                        No RR forms have been uploaded yet.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            <a href="/" className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 font-medium">
              <Home size={14} /> Return to Home
            </a>
          </div>
        </div>
      </div>
    );
  }

  const property = txInfo
    ? [txInfo.propertyAddressLine1, txInfo.propertyCity, txInfo.propertyState, txInfo.propertyPostalCode]
        .filter(Boolean).join(', ')
    : 'Loading...';

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-lg mx-auto space-y-4">
        {/* Header */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-5 bg-blue-50 border-b border-blue-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                <FileText size={18} className="text-blue-600" />
              </div>
              <div>
                <h1 className="text-base font-semibold text-gray-800">Contingency Removal Approval</h1>
                <p className="text-xs text-gray-500 mt-0.5">{property}</p>
              </div>
            </div>
          </div>

          <div className="px-6 py-4">
            <p className="text-sm text-gray-700 mb-4">
              Your transaction coordinator has requested your approval to remove the following
              contingencies. Review each one and confirm your decision individually.
            </p>

            {/* Contingency list — all 3 always shown */}
            <div className="space-y-3">
              {ALL_CONTINGENCIES.map(({ key, label, desc }) => {
                const action = actions[key] || 'pending';

                return (
                  <div
                    key={key}
                    className={`rounded-lg border p-3 ${
                      action === 'pending'  ? 'border-amber-200 bg-amber-50/30' :
                      action === 'approved' ? 'border-green-200 bg-green-50/30' :
                      'border-red-200 bg-red-50/30'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`w-5 h-5 rounded border-2 shrink-0 mt-0.5 ${
                        action === 'approved' ? 'border-green-400 bg-green-400 flex items-center justify-center' :
                        action === 'rejected' ? 'border-red-400 bg-red-400 flex items-center justify-center' :
                        'border-amber-300'
                      }`}>
                        {action === 'approved' && <CheckCircle size={12} className="text-white" />}
                        {action === 'rejected' && <XCircle size={12} className="text-white" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800">{label}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{desc}</p>

                        {/* Per-contingency actions */}
                        <div className="flex items-center gap-2 mt-2">
                          <button
                            type="button"
                            onClick={() => toggleContingency(key, 'approved')}
                            className={`text-[10px] font-medium px-2 py-1 rounded-full border transition-colors ${
                              action === 'approved'
                                ? 'bg-green-100 text-green-700 border-green-300'
                                : 'bg-white text-gray-500 border-gray-200 hover:border-green-300 hover:text-green-600'
                            }`}
                          >
                            ✓ Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleContingency(key, 'rejected')}
                            className={`text-[10px] font-medium px-2 py-1 rounded-full border transition-colors ${
                              action === 'rejected'
                                ? 'bg-red-100 text-red-700 border-red-300'
                                : 'bg-white text-gray-500 border-gray-200 hover:border-red-300 hover:text-red-600'
                            }`}
                          >
                            ✗ Reject
                          </button>
                          {action !== 'pending' && (
                            <button
                              type="button"
                              onClick={() => toggleContingency(key, 'pending')}
                              className="text-[10px] text-gray-400 hover:text-gray-600"
                            >
                              Reset
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* RR Form Status */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Paperclip size={14} className="text-gray-400" />
            <h3 className="text-sm font-semibold text-gray-700">RR Form Status</h3>
          </div>
          {rrDocs.length > 0 ? (
            <div className="space-y-2">
              {rrDocs.map((d) => (
                <div key={d.id} className="flex items-center gap-2 text-xs bg-green-50 border border-green-200 rounded px-3 py-2">
                  <CheckCircle size={11} className="text-green-500 shrink-0" />
                  <span className="text-green-700">{d.formCode || 'RR'} — {d.title}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-start gap-2 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-3 py-2">
              <AlertTriangle size={11} className="shrink-0 mt-0.5" />
              <span>No Removal of Contingency (RR) forms have been uploaded yet. If any contingencies are approved and have been removed or waived, please upload the corresponding RR form.</span>
            </div>
          )}
        </div>

        {/* Comments */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Comments (optional)
          </label>
          <textarea
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            rows={3}
            placeholder="Add any notes or instructions for the transaction coordinator..."
            className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 resize-none"
          />
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2 text-sm text-red-700">
            <XCircle size={16} className="shrink-0" />
            {error}
          </div>
        )}

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={submitting || !hasChanges}
          className="w-full flex items-center justify-center gap-2 py-3 bg-blue-700 text-white text-sm font-medium rounded-lg hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {submitting ? (
            <><Loader2 size={14} className="animate-spin" /> Submitting...</>
          ) : (
            <>Submit Decision</>
          )}
        </button>

        <p className="text-center text-xs text-gray-400">
          You can approve or reject each contingency individually.
        </p>
      </div>
    </div>
  );
}
