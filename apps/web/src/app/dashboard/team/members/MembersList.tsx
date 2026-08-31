'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { approveMembershipAction, rejectMembershipAction, removeMemberAction } from '@/lib/auth-actions';
import type { OrgMember } from '@/lib/auth-actions';

const ROLE_LABELS: Record<string, string> = {
  broker_admin: 'Broker Admin',
  agent: 'Agent',
  transaction_coordinator: 'Coordinator',
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'text-amber-600 bg-amber-50',
  active: 'text-green-600 bg-green-50',
  rejected: 'text-red-600 bg-red-50',
};

interface Props {
  members: OrgMember[];
  currentAccountId: string;
  isBrokerAdmin: boolean;
}

export function MembersList({ members, currentAccountId, isBrokerAdmin }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const pendingMembers = members.filter((m) => m.status === 'pending');
  const activeMembers = members.filter((m) => m.status === 'active');
  const otherMembers = members.filter((m) => m.status !== 'pending' && m.status !== 'active');

  async function handleApprove(id: string) {
    setError(null);
    startTransition(async () => {
      const result = await approveMembershipAction(id);
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  async function handleReject(id: string) {
    setError(null);
    startTransition(async () => {
      const result = await rejectMembershipAction(id);
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  async function handleRemove(id: string) {
    if (!confirm('Remove this member from the brokerage?')) return;
    setError(null);
    startTransition(async () => {
      const result = await removeMemberAction(id);
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  function renderMember(m: OrgMember) {
    const name = m.account?.displayName ?? 'Unknown';
    const email = m.account?.user?.email ?? '';
    const initials = name.split(' ').map((s) => s[0]).join('').toUpperCase().slice(0, 2);

    return (
      <tr key={m.id}>
        <td>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
              <span className="text-xs font-semibold text-blue-700">{initials}</span>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">{name}</p>
              {email && <p className="text-xs text-gray-500">{email}</p>}
            </div>
          </div>
        </td>
        <td>
          <span className="text-sm text-gray-700">{ROLE_LABELS[m.role] ?? m.role}</span>
        </td>
        <td>
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[m.status] ?? 'text-gray-600 bg-gray-50'}`}>
            {m.status}
          </span>
        </td>
        <td>
          {m.isPrimary && <span className="text-xs text-gray-400 italic">Primary</span>}
        </td>
        <td className="text-right">
          {isBrokerAdmin && m.accountId !== currentAccountId && (
            <div className="flex gap-1 justify-end">
              {m.status === 'pending' && (
                <>
                  <button
                    onClick={() => handleApprove(m.id)}
                    disabled={isPending}
                    className="px-3 py-1 text-xs font-medium rounded-md bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => handleReject(m.id)}
                    disabled={isPending}
                    className="px-3 py-1 text-xs font-medium rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    Reject
                  </button>
                </>
              )}
              {m.status === 'active' && (
                <button
                  onClick={() => handleRemove(m.id)}
                  disabled={isPending}
                  className="px-3 py-1 text-xs font-medium rounded-md border border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  Remove
                </button>
              )}
            </div>
          )}
        </td>
      </tr>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      {error && (
        <div className="px-6 py-3 bg-red-50 border-b border-red-200 text-sm text-red-700">{error}</div>
      )}

      {pendingMembers.length > 0 && (
        <div className="p-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-amber-700 mb-2">Pending Approvals ({pendingMembers.length})</h3>
          <table className="w-full text-left">
            <thead>
              <tr className="text-xs text-gray-500 uppercase tracking-wider">
                <th className="pb-2 pr-4">Member</th>
                <th className="pb-2 pr-4">Role</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2 pr-4"></th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {pendingMembers.map(renderMember)}
            </tbody>
          </table>
        </div>
      )}

      <div className="p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Active Members ({activeMembers.length})</h3>
        <table className="w-full text-left">
          <thead>
            <tr className="text-xs text-gray-500 uppercase tracking-wider">
              <th className="pb-2 pr-4">Member</th>
              <th className="pb-2 pr-4">Role</th>
              <th className="pb-2 pr-4">Status</th>
              <th className="pb-2 pr-4"></th>
              <th className="pb-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {activeMembers.map(renderMember)}
          </tbody>
        </table>
      </div>

      {otherMembers.length > 0 && (
        <div className="p-4 border-t border-gray-100">
          <h3 className="text-sm font-semibold text-gray-500 mb-2">Other ({otherMembers.length})</h3>
          <table className="w-full text-left">
            <thead>
              <tr className="text-xs text-gray-500 uppercase tracking-wider">
                <th className="pb-2 pr-4">Member</th>
                <th className="pb-2 pr-4">Role</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2 pr-4"></th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {otherMembers.map(renderMember)}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}