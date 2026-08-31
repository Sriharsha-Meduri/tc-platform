'use client';

import { useState, useEffect } from 'react';
import { Loader2, Clock, CheckCircle, XCircle, Send, AlertCircle, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';

type ApprovalStatus = 'pending' | 'approved' | 'rejected' | null;

interface ApprovalRequest {
  id: string;
  type: string;
  status: 'pending' | 'approved' | 'rejected';
  requestedAt: string;
  respondedAt: string | null;
  comments: string | null;
  contingencyStatus: Record<string, 'pending' | 'approved' | 'rejected'> | null;
}

interface Props {
  transactionId: string;
  approvalType: string;
  contingencies?: string[];
  onSendViaDocuSign?: (contingency?: string) => void;
  sending?: boolean;
  sendError?: string | null;
  className?: string;
}

const STATUS_CONFIG: Record<string, { icon: typeof Clock; color: string; label: string; bg: string }> = {
  pending:  { icon: Clock,       color: 'text-amber-600', label: 'Pending',  bg: 'bg-amber-50 border-amber-200' },
  approved: { icon: CheckCircle, color: 'text-green-600', label: 'Approved', bg: 'bg-green-50 border-green-200' },
  rejected: { icon: XCircle,     color: 'text-red-600',   label: 'Rejected', bg: 'bg-red-50 border-red-200' },
};

const CONTINGENCY_LABELS: Record<string, string> = {
  inspection: 'Inspection',
  appraisal: 'Appraisal',
  loan: 'Loan',
};

export default function ApprovalWorkflow({
  transactionId,
  approvalType,
  contingencies = ['inspection', 'appraisal', 'loan'],
  onSendViaDocuSign,
  sending = false,
  sendError = null,
  className,
}: Props) {
  const [request, setRequest] = useState<ApprovalRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [requestingApproval, setRequestingApproval] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!transactionId) return;
    setLoading(true);
    fetch(`/api/v1/approval-requests/transaction/${transactionId}`, { credentials: 'include' })
      .then((r) => r.json())
      .then((data: ApprovalRequest[]) => {
        const match = data.find((r) => r.type === approvalType);
        setRequest(match || null);
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [transactionId, approvalType]);

  const handleRequestApproval = async () => {
    setRequestingApproval(true);
    setError(null);
    try {
      // If a request already exists, resend instead of creating new
      if (request) {
        const res = await fetch(`/api/v1/approval-requests/${request.id}/resend`, {
          method: 'POST',
          credentials: 'include',
        });
        if (!res.ok) throw new Error('Failed to resend');
        return;
      }

      const res = await fetch('/api/v1/approval-requests', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionId, type: approvalType, contingencies }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || 'Failed to request approval');
      }
      const newRequest = await res.json() as ApprovalRequest;
      setRequest(newRequest);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRequestingApproval(false);
    }
  };

  const status = request?.status ?? null;
  const config = status ? STATUS_CONFIG[status] : null;
  const contingencyEntries = request?.contingencyStatus
    ? Object.entries(request.contingencyStatus).filter(([k]) => contingencies.includes(k))
    : [];
  const allApproved = contingencyEntries.length > 0 && contingencyEntries.every(([, v]) => v === 'approved');
  const someApproved = contingencyEntries.some(([, v]) => v === 'approved');
  const canSend = allApproved;

  if (loading) {
    return (
      <div className={cn('flex items-center gap-2 py-2 text-gray-400 text-xs', className)}>
        <Loader2 size={12} className="animate-spin" /> Checking...
      </div>
    );
  }

  return (
    <div className={cn('space-y-2', className)}>
      {/* Per-contingency status */}
      {contingencyEntries.length > 0 && (
        <div className="space-y-1">
          {contingencyEntries.map(([key, val]) => {
            const sc = STATUS_CONFIG[val];
            if (!sc) return null;
            return (
              <div key={key} className={cn('flex items-center gap-1.5 px-2 py-1 rounded text-[11px]', sc.color)}>
                <sc.icon size={12} />
                <span>{CONTINGENCY_LABELS[key] || key}: {sc.label}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Overall status */}
      {config && (
        <div className={cn('flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs', config.bg, config.color)}>
          <config.icon size={14} />
          <span className="font-semibold">{config.label}</span>
          {request?.respondedAt && (
            <span className="text-gray-400 ml-auto">{new Date(request.respondedAt).toLocaleDateString()}</span>
          )}
          {request?.comments && (
            <span className="text-gray-500 ml-1" title={request.comments}>
              <MessageSquare size={12} />
            </span>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2">
        {!request && (
          <button
            onClick={handleRequestApproval}
            disabled={requestingApproval}
            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 border border-amber-200 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50"
          >
            {requestingApproval ? <><Loader2 size={12} className="animate-spin" /> Requesting...</> : <><Send size={12} /> Request Buyer Agent Approval</>}
          </button>
        )}

        {request && onSendViaDocuSign && (
          <>
            {request.status === 'pending' && !someApproved && (
              <button
                onClick={handleRequestApproval}
                disabled={requestingApproval}
                className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 border border-amber-200 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50"
              >
                {requestingApproval ? <><Loader2 size={12} className="animate-spin" /> Sending...</> : <><Send size={12} /> Resend</>}
              </button>
            )}
            <button
              onClick={() => onSendViaDocuSign()}
              disabled={!canSend || sending}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                canSend
                  ? 'bg-blue-700 text-white hover:bg-blue-800 shadow-sm'
                  : 'bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed',
              )}
              title={!canSend ? 'Waiting for all contingencies to be approved' : undefined}
            >
              {sending ? <><Loader2 size={12} className="animate-spin" />Sending...</> : <><Send size={12} />Send via DocuSign</>}
            </button>
          </>
        )}
      </div>

      {sendError && <div className="flex items-center gap-1.5 text-xs text-red-600"><AlertCircle size={12} />{sendError}</div>}
      {error && <div className="flex items-center gap-1.5 text-xs text-red-600"><AlertCircle size={12} />{error}</div>}
    </div>
  );
}
