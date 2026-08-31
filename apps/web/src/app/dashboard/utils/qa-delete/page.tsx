'use client';

import { useEffect, useState } from 'react';
import { Trash2, Loader2, AlertCircle, RefreshCw, Copy, Check, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiGet, apiDelete } from '@/lib/client-api';

interface TxRow {
  id: string;
  transactionNumber: string;
  propertyAddressLine1: string | null;
  propertyCity: string | null;
  propertyState: string | null;
  status: string;
  stage: string;
  createdAt: string;
}

function fmt(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function address(tx: TxRow) {
  const parts = [tx.propertyAddressLine1, tx.propertyCity, tx.propertyState].filter(Boolean);
  return parts.join(', ') || '—';
}

export default function QaDeletePage() {
  const [transactions, setTransactions] = useState<TxRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Set<string>>(new Set());
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  function copyId(id: string) {
    navigator.clipboard.writeText(id);
    setCopied(id);
    setTimeout(() => setCopied(null), 1500);
  }

  async function load() {
    setLoading(true);
    setError(null);
    try {
      // Scoped to the caller: brokers see their brokerage, agents/TCs see only
      // their assigned transactions, everyone sees what they created.
      const res = await apiGet('/transactions/qa-deletable');
      if (!res.ok) throw new Error(`Failed to load transactions (${res.status})`);
      const data = await res.json() as TxRow[];
      setTransactions(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function confirmDelete(id: string) {
    setConfirmingId(null);
    setDeleting((prev) => new Set(prev).add(id));
    try {
      const res = await apiDelete(`/transactions/${id}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { message?: string };
        throw new Error(body.message ?? `Delete failed (${res.status})`);
      }
      setTransactions((prev) => prev.filter((tx) => tx.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeleting((prev) => { const s = new Set(prev); s.delete(id); return s; });
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Delete for QA</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {process.env.NEXT_PUBLIC_APP_ENV === 'production'
              ? <>Only transactions associated with you are shown — your brokerage (if you&apos;re a broker),
                  transactions you&apos;re assigned to as agent or TC, or transactions you created.</>
              : <>Outside production, every transaction is shown regardless of who created it or which
                  seeded login you&apos;re using — local QA testing routinely switches accounts across
                  sessions, so this list isn&apos;t scoped to your current login.</>
            } Deleting a
            transaction voids it for everyone associated with it; this cannot be undone from here.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 px-2.5 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          <RefreshCw size={13} className={cn(loading && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertCircle size={15} className="shrink-0" />
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16 gap-2 text-gray-400">
          <Loader2 size={16} className="animate-spin" />
          <span className="text-sm">Loading transactions…</span>
        </div>
      ) : transactions.length === 0 ? (
        <div className="text-center py-16 text-sm text-gray-400">No transactions found.</div>
      ) : (
        <div className="rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-2.5">#</th>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-2.5">Address</th>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-2.5 hidden lg:table-cell">Transaction ID</th>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-2.5 hidden sm:table-cell">Status</th>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-2.5 hidden md:table-cell">Stage</th>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-2.5 hidden md:table-cell">Created</th>
                <th className="text-right text-xs font-medium text-gray-500 px-4 py-2.5">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {transactions.map((tx) => {
                const isConfirming = confirmingId === tx.id;
                const isDeleting = deleting.has(tx.id);
                return (
                  <tr key={tx.id} className={cn('transition-colors', isConfirming ? 'bg-red-50/50' : 'hover:bg-gray-50')}>
                    <td className="px-4 py-3 text-xs text-gray-400 font-mono">{tx.transactionNumber}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{address(tx)}</p>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <button
                        onClick={() => copyId(tx.id)}
                        className="flex items-center gap-1.5 text-xs text-gray-400 font-mono hover:text-gray-700 transition-colors group"
                        title="Click to copy"
                      >
                        <span>{tx.id}</span>
                        {copied === tx.id
                          ? <Check size={11} className="text-green-500 shrink-0" />
                          : <Copy size={11} className="opacity-0 group-hover:opacity-100 shrink-0 transition-opacity" />
                        }
                      </button>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <span className="text-xs text-gray-500 capitalize">{tx.status}</span>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className="text-xs text-gray-500 capitalize">{tx.stage}</span>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className="text-xs text-gray-500">{fmt(tx.createdAt)}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {isConfirming ? (
                        <div className="flex items-center justify-end gap-2">
                          <span className="flex items-center gap-1 text-xs text-red-700 font-medium">
                            <AlertTriangle size={12} />
                            Delete permanently?
                          </span>
                          <button
                            onClick={() => confirmDelete(tx.id)}
                            disabled={isDeleting}
                            className="inline-flex items-center gap-1.5 text-xs text-white bg-red-600 hover:bg-red-700 font-medium disabled:opacity-50 px-2.5 py-1.5 rounded-lg transition-colors"
                          >
                            {isDeleting ? <Loader2 size={13} className="animate-spin" /> : 'Confirm'}
                          </button>
                          <button
                            onClick={() => setConfirmingId(null)}
                            disabled={isDeleting}
                            className="text-xs text-gray-500 hover:text-gray-700 font-medium disabled:opacity-50 px-2.5 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmingId(tx.id)}
                          disabled={isDeleting}
                          className="inline-flex items-center gap-1.5 text-xs text-red-600 hover:text-red-800 font-medium disabled:opacity-50 disabled:cursor-not-allowed px-2.5 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
                        >
                          <Trash2 size={13} />
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
