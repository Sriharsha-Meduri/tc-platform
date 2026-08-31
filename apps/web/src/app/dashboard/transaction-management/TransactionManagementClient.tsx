'use client';

import { useState, useTransition } from 'react';
import { ShieldCheck, UserCheck, Users, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ApiTransaction, ApiAccessGrant, ApiAgentParty } from '@/lib/api';

const ACCESS_LEVELS = [
  { value: 'read',        label: 'Read',        description: 'View only' },
  { value: 'collaborate', label: 'Collaborate',  description: 'View + upload docs, add tasks, send messages' },
  { value: 'manage',      label: 'Manage',       description: 'Full access — same as an org member' },
];

const ROLE_LABELS: Record<string, string> = {
  buyer_agent:                    'Buyer Agent',
  buyer_agent_representative:     'Buyer Agent Rep',
  seller_agent:                   'Seller Agent',
  seller_agent_representative:    'Seller Agent Rep',
  buyer_transaction_coordinator:  'Buyer TC',
  seller_transaction_coordinator: 'Seller TC',
};

function Badge({ label, color }: { label: string; color: 'blue' | 'emerald' | 'amber' | 'gray' }) {
  return (
    <span className={cn(
      'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
      color === 'blue'    && 'bg-blue-100 text-blue-700',
      color === 'emerald' && 'bg-emerald-100 text-emerald-700',
      color === 'amber'   && 'bg-amber-100 text-amber-700',
      color === 'gray'    && 'bg-gray-100 text-gray-600',
    )}>
      {label}
    </span>
  );
}

function accessLevelColor(level: string): 'blue' | 'emerald' | 'amber' | 'gray' {
  if (level === 'manage')     return 'blue';
  if (level === 'collaborate') return 'emerald';
  return 'gray';
}

function txLabel(tx: { transactionNumber: string; propertyAddressLine1: string | null; propertyCity: string | null }) {
  const addr = [tx.propertyAddressLine1, tx.propertyCity].filter(Boolean).join(', ');
  return addr ? `#${tx.transactionNumber} — ${addr}` : `#${tx.transactionNumber}`;
}

interface Props {
  transactions: ApiTransaction[];
  grants: ApiAccessGrant[];
  agentParties: ApiAgentParty[];
}

export default function TransactionManagementClient({ transactions, grants: initialGrants, agentParties }: Props) {
  const [grants, setGrants] = useState<ApiAccessGrant[]>(initialGrants);
  const [isPending, startTransition] = useTransition();

  // Form state
  const [selectedTxId, setSelectedTxId]   = useState('');
  const [email, setEmail]                 = useState('');
  const [accessLevel, setAccessLevel]     = useState('collaborate');
  const [expiresAt, setExpiresAt]         = useState('');
  const [formError, setFormError]         = useState<string | null>(null);
  const [formSuccess, setFormSuccess]     = useState<string | null>(null);
  const [submitting, setSubmitting]       = useState(false);

  // Edit state (inline access level change)
  const [editingId, setEditingId]         = useState<string | null>(null);
  const [editLevel, setEditLevel]         = useState('');

  const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

  async function handleGrant(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);
    if (!selectedTxId) { setFormError('Please select a transaction'); return; }
    if (!email.trim()) { setFormError('Please enter a user email'); return; }

    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/transaction-access-grants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          transactionId: selectedTxId,
          accountEmail: email.trim(),
          accessLevel,
          grantedByAccountId: 'system', // TODO: replace with JWT session account id
          expiresAt: expiresAt || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data.message ?? 'Failed to grant access');
        return;
      }
      setFormSuccess(`Access granted to ${email.trim()}`);
      setEmail('');
      setExpiresAt('');
      // Refresh grants list
      const refreshed = await fetch(`${API_BASE}/api/v1/transaction-access-grants`, { credentials: 'include' });
      if (refreshed.ok) setGrants(await refreshed.json());
    } catch {
      setFormError('Network error — please try again');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRevoke(id: string) {
    const res = await fetch(`${API_BASE}/api/v1/transaction-access-grants/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (res.ok) {
      startTransition(() => setGrants((prev) => prev.filter((g) => g.id !== id)));
    }
  }

  async function handleUpdateLevel(id: string) {
    const res = await fetch(`${API_BASE}/api/v1/transaction-access-grants/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ accessLevel: editLevel }),
    });
    if (res.ok) {
      const updated: ApiAccessGrant = await res.json();
      setGrants((prev) => prev.map((g) => g.id === id ? { ...g, accessLevel: updated.accessLevel } : g));
      setEditingId(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-blue-700 flex items-center justify-center shrink-0">
          <ShieldCheck className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Transaction Management</h1>
          <p className="text-sm text-gray-500">Grant and manage access to transactions for agents and coordinators</p>
        </div>
      </div>

      {/* Grant Access Form */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4 flex items-center gap-2">
          <UserCheck className="w-4 h-4" />
          Grant Transaction Access
        </h2>

        <form onSubmit={handleGrant} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Transaction selector */}
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Transaction <span className="text-red-500">*</span>
              </label>
              <select
                value={selectedTxId}
                onChange={(e) => setSelectedTxId(e.target.value)}
                className="block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
              >
                <option value="">Select a transaction…</option>
                {transactions.map((tx) => (
                  <option key={tx.id} value={tx.id}>{txLabel(tx)}</option>
                ))}
              </select>
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                User Email <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="agent@example.com"
                className="block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm shadow-sm placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {/* Expiry */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Expires (optional)
              </label>
              <input
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className="block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Access Level */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Access Level</label>
            <div className="flex flex-wrap gap-3">
              {ACCESS_LEVELS.map(({ value, label, description }) => (
                <label
                  key={value}
                  className={cn(
                    'flex items-start gap-3 flex-1 min-w-[160px] cursor-pointer rounded-lg border p-3 transition-colors',
                    accessLevel === value
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300',
                  )}
                >
                  <input
                    type="radio"
                    name="accessLevel"
                    value={value}
                    checked={accessLevel === value}
                    onChange={() => setAccessLevel(value)}
                    className="mt-0.5 accent-blue-700"
                  />
                  <div>
                    <p className="text-sm font-medium text-gray-800">{label}</p>
                    <p className="text-xs text-gray-500">{description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {formError && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {formError}
            </div>
          )}
          {formSuccess && (
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700">
              {formSuccess}
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2.5 rounded-lg bg-blue-700 text-white text-sm font-semibold hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? 'Granting…' : 'Grant Access'}
            </button>
          </div>
        </form>
      </div>

      {/* Active Grants Table */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide flex items-center gap-2">
            <ShieldCheck className="w-4 h-4" />
            Active Access Grants
            <span className="ml-1 text-xs font-normal text-gray-400 normal-case">
              ({grants.length})
            </span>
          </h2>
          {isPending && <RefreshCw className="w-4 h-4 animate-spin text-gray-400" />}
        </div>

        {grants.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-gray-400">
            No active grants. Use the form above to grant access.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">User</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Transaction</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Access Level</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Granted</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Expires</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {grants.map((grant) => (
                  <tr key={grant.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{grant.account?.displayName ?? '—'}</p>
                      <p className="text-xs text-gray-400">{grant.account?.user?.email ?? ''}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">
                        #{grant.transaction?.transactionNumber}
                      </p>
                      <p className="text-xs text-gray-400">
                        {[grant.transaction?.propertyAddressLine1, grant.transaction?.propertyCity].filter(Boolean).join(', ')}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      {editingId === grant.id ? (
                        <div className="flex items-center gap-2">
                          <select
                            value={editLevel}
                            onChange={(e) => setEditLevel(e.target.value)}
                            className="text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          >
                            {ACCESS_LEVELS.map(({ value, label }) => (
                              <option key={value} value={value}>{label}</option>
                            ))}
                          </select>
                          <button
                            onClick={() => handleUpdateLevel(grant.id)}
                            className="text-xs text-blue-700 hover:text-blue-800 font-medium"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="text-xs text-gray-400 hover:text-gray-600"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setEditingId(grant.id); setEditLevel(grant.accessLevel); }}
                          className="text-left hover:opacity-80 transition-opacity"
                          title="Click to change"
                        >
                          <Badge
                            label={ACCESS_LEVELS.find((l) => l.value === grant.accessLevel)?.label ?? grant.accessLevel}
                            color={accessLevelColor(grant.accessLevel)}
                          />
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {new Date(grant.grantedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {grant.expiresAt
                        ? new Date(grant.expiresAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                        : <span className="text-gray-300">Never</span>
                      }
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleRevoke(grant.id)}
                        className="text-xs text-red-600 hover:text-red-700 font-medium"
                      >
                        Revoke
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Agents & Coordinators Table */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide flex items-center gap-2">
            <Users className="w-4 h-4" />
            Agents &amp; Coordinators on Transactions
            <span className="ml-1 text-xs font-normal text-gray-400 normal-case">
              ({agentParties.length})
            </span>
          </h2>
        </div>

        {agentParties.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-gray-400">
            No agents or coordinators found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Transaction</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Role</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Email</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Access Mode</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {agentParties.map((party) => {
                  const hasGrant = grants.some(
                    (g) => g.transactionId === party.transactionId && g.account?.id === party.accountId,
                  );
                  return (
                    <tr key={party.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">#{party.transaction.transactionNumber}</p>
                        <p className="text-xs text-gray-400">
                          {[party.transaction.propertyAddressLine1, party.transaction.propertyCity].filter(Boolean).join(', ')}
                        </p>
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900">{party.displayName}</td>
                      <td className="px-4 py-3">
                        <Badge
                          label={ROLE_LABELS[party.partyRole] ?? party.partyRole}
                          color={party.partyRole.includes('coordinator') ? 'amber' : 'blue'}
                        />
                      </td>
                      <td className="px-4 py-3 text-gray-500">{party.email ?? '—'}</td>
                      <td className="px-4 py-3">
                        {party.accountId ? (
                          hasGrant
                            ? <Badge label="Party + Grant" color="emerald" />
                            : <Badge label="Party-based" color="blue" />
                        ) : (
                          <Badge label="External" color="gray" />
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
    </div>
  );
}
