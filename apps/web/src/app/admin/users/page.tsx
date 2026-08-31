import { getAdminUsersAction } from '@/lib/admin-actions';
import type { AdminUser } from '@/lib/admin-actions';
import { UserActions } from './UserActions';

export const metadata = { title: 'Admin Users — TC' };

const ROLE_LABELS: Record<string, string> = {
  agent: 'Agent',
  transaction_coordinator: 'TC',
  broker_admin: 'Broker Admin',
  support_admin: 'Support Admin',
};

function displayRole(roles: string[]): string {
  const meaningful = roles.find((r) => r !== 'user');
  if (meaningful) return ROLE_LABELS[meaningful] ?? meaningful;
  return roles[0] ?? 'user';
}

function statusBadgeClass(status: string) {
  const map: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-700',
    active: 'bg-emerald-100 text-emerald-700',
    inactive: 'bg-red-100 text-red-700',
    suspended: 'bg-red-100 text-red-700',
  };
  return map[status] ?? 'bg-slate-100 text-slate-700';
}

export default async function AdminUsersPage() {
  const users = await getAdminUsersAction() as AdminUser[];

  return (
    <>
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Users</h1>
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide">Email</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide">Name</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide">Role</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide">Status</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide">Brokerage</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide">Verified</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((user) => {
                const primary = user.memberships.find((m) => m.isPrimary);
                const brokerage = primary?.organization?.name ?? user.account?.organizationName ?? null;
                const name = user.account?.displayName ?? null;

                return (
                  <tr key={user.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900 whitespace-nowrap">{user.email}</td>
                    <td className="px-4 py-3 text-slate-600">{name ?? <span className="italic text-slate-300">&mdash;</span>}</td>
                    <td className="px-4 py-3">
                      <code className="bg-slate-100 px-2 py-0.5 rounded text-xs">{displayRole(user.roles)}</code>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${statusBadgeClass(user.status)}`}>
                        {user.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600 max-w-40 truncate">
                      {brokerage ?? <span className="italic text-slate-300">&mdash;</span>}
                    </td>
                    <td className="px-4 py-3 text-xs whitespace-nowrap">
                      {user.emailVerifiedAt ? (
                        <span className="text-emerald-600 font-medium">Verified {new Date(user.emailVerifiedAt).toLocaleDateString()}</span>
                      ) : user.verificationToken ? (
                        <span className="text-amber-600 font-medium">Email sent</span>
                      ) : (
                        <span className="text-slate-400 italic">Not sent</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <UserActions user={user} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {users.length === 0 && (
          <p className="text-center py-8 text-slate-400 italic">No users found.</p>
        )}
      </div>
    </>
  );
}
