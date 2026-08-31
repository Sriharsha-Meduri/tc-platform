'use client';

import { useState } from 'react';
import { Mail, FileSignature, ChevronDown, ChevronUp, Loader2, AlertCircle } from 'lucide-react';

export interface EmailHistoryItem {
  id: string;
  type: 'email' | 'docusign';
  subject: string | null;
  recipients: string[];
  cc: string[];
  sentAt: string;
  status: string;
  bodyText: string | null;
  signers: { name: string; email: string; status?: string | null }[] | null;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString();
}

function StatusBadge({ status }: { status: string }) {
  const isGood = ['sent', 'delivered', 'read', 'completed'].includes(status);
  const isBad = ['failed', 'declined', 'voided'].includes(status);
  return (
    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${
      isBad ? 'bg-red-50 text-red-600' : isGood ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-500'
    }`}
    >
      {status.replace(/_/g, ' ')}
    </span>
  );
}

function HistoryRow({ item }: { item: EmailHistoryItem }) {
  const [expanded, setExpanded] = useState(false);
  const Icon = item.type === 'docusign' ? FileSignature : Mail;

  return (
    <div className="border-b border-gray-100 last:border-b-0">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
      >
        <Icon size={14} className="text-gray-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-gray-800 truncate">{item.subject ?? '(No subject)'}</span>
            <StatusBadge status={item.status} />
          </div>
          <p className="text-xs text-gray-500 mt-0.5 truncate">
            To: {item.recipients.join(', ') || '—'}
            {item.cc.length > 0 ? ` · Cc: ${item.cc.join(', ')}` : ''}
            {' · '}{formatDateTime(item.sentAt)}
          </p>
        </div>
        {expanded ? <ChevronUp size={14} className="text-gray-400 shrink-0" /> : <ChevronDown size={14} className="text-gray-400 shrink-0" />}
      </button>

      {expanded && (
        <div className="px-4 pb-4 pl-11">
          {item.type === 'docusign' && item.signers ? (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-1.5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Signers</p>
              {item.signers.map((signer, i) => (
                <div key={i} className="flex items-center justify-between text-xs text-gray-700">
                  <span>{signer.name} ({signer.email})</span>
                  {signer.status && <StatusBadge status={signer.status} />}
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs text-gray-700 whitespace-pre-wrap">
              {item.bodyText || 'No content available.'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Reusable email/DocuSign activity list — used identically by Seller Side / Buyer Side / Escrow Email History. */
export default function EmailHistoryList({
  items, loading, error,
}: {
  items: EmailHistoryItem[] | null;
  loading: boolean;
  error: string | null;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-gray-400">
        <Loader2 size={16} className="animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2.5">
        <AlertCircle size={14} className="shrink-0" /> {error}
      </div>
    );
  }

  if (!items || items.length === 0) {
    return <p className="text-sm text-gray-400 text-center py-8">No email or DocuSign activity yet.</p>;
  }

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {items.map((item) => <HistoryRow key={item.id} item={item} />)}
    </div>
  );
}
