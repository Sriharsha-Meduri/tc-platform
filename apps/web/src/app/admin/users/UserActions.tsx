'use client';

import { useActionState, useState } from 'react';
import {
  updateUserStatusAction,
  updateUserAction,
  resendVerificationAction,
  assignBrokerageAction,
  searchOrganizationsAction,
  deleteUserAction,
} from '@/lib/admin-actions';
import type { AdminUser } from '@/lib/admin-actions';

function StatusForm({ id, status, label }: { id: string; status: string; label: string }) {
  const [, formAction] = useActionState(
    async () => { await updateUserStatusAction(id, status); },
    null,
  );
  return (
    <form action={formAction}>
      <button type="submit" className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-100">{label}</button>
    </form>
  );
}

function ResendVerificationModal({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  const [email, setEmail] = useState(user.email);
  const [state, formAction, isPending] = useActionState(
    async (_prev: unknown, formData: FormData) => {
      const newEmail = formData.get('email') as string;
      try {
        const result = await resendVerificationAction(user.id, newEmail !== user.email ? newEmail : undefined);
        const url = (result as { verificationUrl: string }).verificationUrl;
        return { success: true, message: url };
      } catch {
        return { error: 'Failed to resend verification' };
      }
    },
    null as { success?: boolean; error?: string; message?: string } | null,
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 mx-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-slate-900 mb-4">Resend Verification Email</h3>
        <form action={formAction} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Current Email</label>
            <p className="text-sm text-slate-800">{user.email}</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              New Email <span className="text-slate-400 font-normal">(optional &mdash; changes the user&apos;s email)</span>
            </label>
            <input
              name="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={user.email}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          {state && 'success' in state && state.success && (
            <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
              Verification sent. URL: <span className="break-all font-mono text-[10px]">{state.message}</span>
            </div>
          )}
          {state && 'error' in state && state.error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{state.error}</div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={isPending} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50">
              {isPending ? 'Sending\u2026' : 'Send'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const ROLE_OPTIONS = [
  { value: 'agent', label: 'Agent' },
  { value: 'transaction_coordinator', label: 'Transaction Coordinator' },
  { value: 'broker_admin', label: 'Broker Admin' },
  { value: 'support_admin', label: 'Support Admin' },
];

function currentRole(roles: string[]): string {
  return roles.find((r) => r !== 'user') ?? roles[0] ?? 'user';
}

function EditProfileModal({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  const [state, formAction, isPending] = useActionState(
    async (_prev: unknown, formData: FormData) => {
      try {
        await updateUserAction(user.id, {
          email: formData.get('email') as string || undefined,
          phone: formData.get('phone') as string || null,
          role: formData.get('role') as string || undefined,
          status: formData.get('status') as string || undefined,
          displayName: formData.get('displayName') as string || undefined,
          firstName: formData.get('firstName') as string || null,
          lastName: formData.get('lastName') as string || null,
        });
        onClose();
        return { success: true };
      } catch {
        return { error: 'Failed to update user' };
      }
    },
    null as { success?: boolean; error?: string } | null,
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6 mx-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-slate-900 mb-4">Edit User</h3>
        <form action={formAction} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Email</label>
              <input name="email" defaultValue={user.email} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Phone</label>
              <input name="phone" defaultValue={user.phone ?? ''} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Display Name</label>
              <input name="displayName" defaultValue={user.account?.displayName ?? ''} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">First Name</label>
              <input name="firstName" defaultValue={user.account?.firstName ?? ''} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Last Name</label>
              <input name="lastName" defaultValue={user.account?.lastName ?? ''} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Role</label>
              <select name="role" defaultValue={currentRole(user.roles)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white">
                {ROLE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Status</label>
              <select name="status" defaultValue={user.status} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white">
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="suspended">Suspended</option>
                <option value="pending">Pending</option>
              </select>
            </div>
          </div>

          {state && 'error' in state && state.error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{state.error}</div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={isPending} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50">
              {isPending ? 'Saving\u2026' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AssignBrokerageModal({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Array<{ id: string; name: string; city: string | null; state: string | null }>>([]);
  const [selectedOrg, setSelectedOrg] = useState<{ id: string; name: string } | null>(null);
  const [role, setRole] = useState('agent');

  const [state, formAction, isPending] = useActionState(
    async () => {
      if (!selectedOrg) return { error: 'Select an organization' };
      try {
        await assignBrokerageAction(user.id, selectedOrg.id, role);
        onClose();
        return { success: true };
      } catch {
        return { error: 'Failed to assign brokerage' };
      }
    },
    null as { success?: boolean; error?: string } | null,
  );

  const handleSearch = async (val: string) => {
    setQuery(val);
    if (val.length < 2) { setResults([]); return; }
    const data = await searchOrganizationsAction(val);
    setResults(data as Array<{ id: string; name: string; city: string | null; state: string | null }>);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 mx-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-slate-900 mb-4">Assign Brokerage</h3>
        <p className="text-sm text-slate-500 mb-4">{user.email}</p>
        <form action={formAction} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Search Organization</label>
            <input
              value={query}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Type at least 2 characters\u2026"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            {results.length > 0 && (
              <ul className="mt-1 border border-slate-200 rounded-lg max-h-40 overflow-y-auto">
                {results.map((org) => (
                  <li key={org.id}>
                    <button
                      type="button"
                      onClick={() => { setSelectedOrg(org); setQuery(org.name); setResults([]); }}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-50 ${selectedOrg?.id === org.id ? 'bg-blue-50' : ''}`}
                    >
                      {org.name}
                      {org.city && <span className="text-slate-400 text-xs ml-2">{org.city}, {org.state}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Role</label>
            <select value={role} onChange={(e) => setRole(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white">
              <option value="agent">Agent</option>
              <option value="broker_admin">Broker Admin</option>
              <option value="transaction_coordinator">Transaction Coordinator</option>
              <option value="manager">Manager</option>
              <option value="assistant">Assistant</option>
              <option value="viewer">Viewer</option>
            </select>
          </div>

          {state && 'error' in state && state.error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{state.error}</div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={isPending || !selectedOrg} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50">
              {isPending ? 'Assigning\u2026' : 'Assign'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function UserActions({ user }: { user: AdminUser }) {
  const [showMenu, setShowMenu] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showAssign, setShowAssign] = useState(false);
  const [showResend, setShowResend] = useState(false);

  return (
    <>
      <div className="relative">
        <button
          onClick={() => setShowMenu(!showMenu)}
          className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
        >
          Actions
        </button>
        {showMenu && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
            <div className="absolute right-0 top-full mt-1 z-20 w-44 bg-white border border-slate-200 rounded-lg shadow-lg py-1">
              {user.status !== 'active' ? (
                <StatusForm id={user.id} status="active" label="Enable user" />
              ) : (
                <StatusForm id={user.id} status="inactive" label="Disable user" />
              )}
              <button
                onClick={async () => {
                  setShowMenu(false);
                  if (!confirm('Delete this user? This cannot be undone.')) return;
                  await deleteUserAction(user.id);
                }}
                className="w-full text-left px-3 py-1.5 text-xs text-red-600 hover:bg-slate-100"
              >
                Delete user
              </button>
              {!user.emailVerifiedAt && (
                <button
                  onClick={() => { setShowMenu(false); setShowResend(true); }}
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-100"
                >
                  Resend verification
                </button>
              )}
              <button
                onClick={() => { setShowMenu(false); setShowEdit(true); }}
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-100"
              >
                Edit profile
              </button>
              <button
                onClick={() => { setShowMenu(false); setShowAssign(true); }}
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-100"
              >
                Assign to brokerage
              </button>
            </div>
          </>
        )}
      </div>

      {showEdit && <EditProfileModal user={user} onClose={() => setShowEdit(false)} />}
      {showAssign && <AssignBrokerageModal user={user} onClose={() => setShowAssign(false)} />}
      {showResend && <ResendVerificationModal user={user} onClose={() => setShowResend(false)} />}
    </>
  );
}
