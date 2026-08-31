'use client';

import { useEffect, useRef, useState } from 'react';
import { Ban, ChevronDown, X, Send, AlertTriangle, FileWarning } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ExtractionResult, ComplianceResult } from '../../extraction-result.types';

// ── Types ─────────────────────────────────────────────────────────────────────

interface VoidControlsProps {
  transactionId: string | null;
  result: ExtractionResult | null;
  compliance: ComplianceResult | null;
  onVoided: () => void;       // called after a successful void (either kind)
}

// ── Void dropdown button ──────────────────────────────────────────────────────

export function VoidControls({ transactionId, result, compliance, onVoided }: VoidControlsProps) {
  const [open, setOpen] = useState(false);
  const [isVoiding, setIsVoiding] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  async function handleVoid() {
    if (!transactionId) return;
    if (!confirm('Void this transaction? It will be marked as cancelled.')) return;
    setIsVoiding(true);
    setOpen(false);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
      await fetch(`${apiUrl}/api/v1/transactions/${transactionId}/void`, { method: 'PATCH' });
      sessionStorage.removeItem('tc_draft_session');
      onVoided();
    } catch {
      setIsVoiding(false);
    }
  }

  function handleVoidNotify() {
    setOpen(false);
    setShowDialog(true);
  }

  return (
    <>
      <div ref={ref} className="relative">
        {/* Split button */}
        <div className="flex items-stretch">
          <button
            type="button"
            onClick={handleVoid}
            disabled={!transactionId || isVoiding}
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 hover:border-red-300 hover:bg-red-50 hover:text-red-700 text-gray-600 text-sm font-medium rounded-l-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed border-r-0"
          >
            <Ban size={13} />
            {isVoiding ? 'Voiding…' : 'Void'}
          </button>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            disabled={!transactionId || isVoiding}
            className="flex items-center px-1.5 border border-gray-300 hover:border-red-300 hover:bg-red-50 hover:text-red-700 text-gray-600 rounded-r-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronDown size={13} />
          </button>
        </div>

        {/* Dropdown menu */}
        {open && (
          <div className="absolute left-0 bottom-full mb-1.5 w-48 bg-white rounded-xl border border-gray-200 shadow-lg z-30 overflow-hidden">
            <button
              type="button"
              onClick={handleVoid}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-red-50 hover:text-red-700 transition-colors text-left"
            >
              <Ban size={13} className="shrink-0" />
              <div>
                <p className="font-medium">Void</p>
                <p className="text-xs text-gray-400">Cancel transaction only</p>
              </div>
            </button>
            <div className="border-t border-gray-100" />
            <button
              type="button"
              onClick={handleVoidNotify}
              disabled={!result}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-red-50 hover:text-red-700 transition-colors text-left disabled:opacity-40"
            >
              <Send size={13} className="shrink-0" />
              <div>
                <p className="font-medium">Void &amp; Notify</p>
                <p className="text-xs text-gray-400">Cancel and email the agent</p>
              </div>
            </button>
          </div>
        )}
      </div>

      {/* Void & Notify dialog */}
      {showDialog && result && (
        <VoidNotifyDialog
          transactionId={transactionId!}
          result={result}
          compliance={compliance}
          onClose={() => setShowDialog(false)}
          onVoided={onVoided}
        />
      )}
    </>
  );
}

// ── Void & Notify dialog ──────────────────────────────────────────────────────

function VoidNotifyDialog({ transactionId, result, compliance, onClose, onVoided }: {
  transactionId: string;
  result: ExtractionResult;
  compliance: ComplianceResult | null;
  onClose: () => void;
  onVoided: () => void;
}) {
  const sellerEmail = result.parties.listingAgents[0]?.email ?? '';
  const buyerEmail  = result.parties.buyerAgents[0]?.email  ?? '';
  const address     = result.property
    ? [result.property.streetAddress, result.property.city, result.property.state]
        .filter(Boolean).join(', ') || 'the property'
    : 'the property';

  const [fromEmail, setFromEmail] = useState(buyerEmail);
  const [toEmail,   setToEmail]   = useState(sellerEmail);
  const [subject,   setSubject]   = useState(`Contract voided — ${address}`);
  const [isSending, setIsSending] = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  // Compute issues summary for the preview panel
  const tx = result.transaction;
  const missingFields: string[] = [];
  if (!tx.acceptanceDate)        missingFields.push('Acceptance date');
  if (!tx.closingDate)           missingFields.push('Closing / close of escrow date');
  if (!tx.offerDate)             missingFields.push('Offer date');
  if (tx.purchasePrice == null)  missingFields.push('Purchase price');
  if (tx.earnestMoneyAmount == null) missingFields.push('Earnest money amount');
  if (result.parties.buyerAgents.length === 0)  missingFields.push('Buyer agent details');
  if (result.parties.listingAgents.length === 0) missingFields.push('Listing agent details');
  if (result.signatures.missingSignatures.length > 0)
    missingFields.push(`Missing signatures: ${result.signatures.missingSignatures.join(', ')}`);

  const complianceFailures = compliance?.checks.filter((c) => c.status === 'fail') ?? [];
  const missingForms = result.formsAndDisclosures.filter((f) => f.status === 'missing');
  const totalIssues = missingFields.length + complianceFailures.length + missingForms.length;

  async function handleSubmit() {
    if (!toEmail.trim()) { setError('Recipient (To) email is required.'); return; }
    setIsSending(true);
    setError(null);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
      const res = await fetch(`${apiUrl}/api/v1/transactions/${transactionId}/void-notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromEmail: fromEmail.trim() || null,
          toEmail: toEmail.trim(),
          subject: subject.trim() || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { message?: string };
        throw new Error(data.message ?? `Server error ${res.status}`);
      }
      sessionStorage.removeItem('tc_draft_session');
      onVoided();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed — please try again.');
      setIsSending(false);
    }
  }

  const inputCls = 'w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col">

        {/* Dialog header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center">
            <Ban size={15} className="text-red-600" />
          </div>
          <div className="flex-1">
            <h2 className="text-sm font-semibold text-gray-900">Void &amp; Notify</h2>
            <p className="text-xs text-gray-400">Transaction will be cancelled and a notification email will be sent.</p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Email fields */}
        <div className="px-6 py-4 border-b border-gray-100 space-y-3 shrink-0">
          <div className="flex items-center gap-3">
            <span className="w-14 text-xs font-medium text-gray-500 shrink-0">From</span>
            <input
              type="email"
              value={fromEmail}
              onChange={(e) => setFromEmail(e.target.value)}
              placeholder="buyer-agent@brokerage.com"
              className={inputCls}
            />
          </div>
          <div className="flex items-center gap-3">
            <span className="w-14 text-xs font-medium text-gray-500 shrink-0">To</span>
            <input
              type="email"
              value={toEmail}
              onChange={(e) => setToEmail(e.target.value)}
              placeholder="seller-agent@brokerage.com"
              className={cn(inputCls, !toEmail && 'border-red-300')}
            />
          </div>
          <div className="flex items-center gap-3">
            <span className="w-14 text-xs font-medium text-gray-500 shrink-0">Subject</span>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className={inputCls}
            />
          </div>
        </div>

        {/* Issues preview */}
        <div className="px-6 py-4 shrink-0">
          <div className="flex items-center gap-2 mb-3">
            <FileWarning size={13} className="text-gray-400" />
            <span className="text-xs font-medium text-gray-500">
              Email will include {totalIssues > 0 ? `${totalIssues} issue${totalIssues !== 1 ? 's' : ''}` : 'no detected issues'}
            </span>
          </div>
          {totalIssues > 0 && (
            <div className="space-y-1.5 text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2.5 border border-gray-100">
              {missingFields.length > 0 && (
                <p><span className="text-red-600 font-medium">{missingFields.length} missing field{missingFields.length !== 1 ? 's' : ''}</span> — {missingFields.slice(0, 2).join(', ')}{missingFields.length > 2 ? ` +${missingFields.length - 2} more` : ''}</p>
              )}
              {complianceFailures.length > 0 && (
                <p><span className="text-amber-600 font-medium">{complianceFailures.length} compliance failure{complianceFailures.length !== 1 ? 's' : ''}</span></p>
              )}
              {missingForms.length > 0 && (
                <p><span className="text-blue-600 font-medium">{missingForms.length} missing form{missingForms.length !== 1 ? 's' : ''}</span> — {missingForms.slice(0, 2).map(f => f.title).join(', ')}{missingForms.length > 2 ? ` +${missingForms.length - 2} more` : ''}</p>
              )}
              <p className="text-gray-400 pt-1">Email body is rendered from the <code className="bg-gray-200 px-1 rounded">contract-voided</code> template.</p>
            </div>
          )}
        </div>

        {/* Dialog footer */}
        <div className="px-6 py-4 border-t border-gray-100 shrink-0">
          {error && (
            <div className="flex items-start gap-2 p-2.5 mb-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
              <AlertTriangle size={13} className="shrink-0 mt-0.5" />
              {error}
            </div>
          )}
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-400 flex items-center gap-1.5">
              <Ban size={11} className="text-red-400" />
              Transaction will be cancelled on send
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isSending || !toEmail.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Send size={13} />
                {isSending ? 'Sending…' : 'Void & Send Email'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
