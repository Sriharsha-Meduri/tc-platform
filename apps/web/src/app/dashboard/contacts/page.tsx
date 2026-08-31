import { getSession } from '@/lib/auth-actions';
import { api, ApiOrgMember } from '@/lib/api';
import { User } from 'lucide-react';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Contacts — TC' };

// ── Role display ───────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  broker_admin:            'Broker Admin',
  agent:                   'Agent',
  transaction_coordinator: 'Transaction Coordinator',
  manager:                 'Manager',
  assistant:               'Assistant',
  viewer:                  'Viewer',
};

const ROLE_COLORS: Record<string, string> = {
  broker_admin:            'bg-purple-100 text-purple-700',
  agent:                   'bg-blue-100 text-blue-700',
  transaction_coordinator: 'bg-teal-100 text-teal-700',
  manager:                 'bg-indigo-100 text-indigo-700',
  assistant:               'bg-amber-100 text-amber-700',
  viewer:                  'bg-gray-100 text-gray-500',
};

const ROLE_ORDER = [
  'broker_admin', 'manager', 'agent', 'transaction_coordinator', 'assistant', 'viewer',
];

function roleLabel(role: string) {
  return ROLE_LABELS[role] ?? role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function roleBadge(role: string) {
  return ROLE_COLORS[role] ?? 'bg-gray-100 text-gray-500';
}

function initials(member: ApiOrgMember) {
  const { firstName, lastName } = member.account;
  if (firstName && lastName) return `${firstName[0]}${lastName[0]}`.toUpperCase();
  return member.account.displayName.slice(0, 2).toUpperCase();
}

function sortByRole(members: ApiOrgMember[]): ApiOrgMember[] {
  return [...members].sort((a, b) => {
    const ai = ROLE_ORDER.indexOf(a.role);
    const bi = ROLE_ORDER.indexOf(b.role);
    const roleSort = (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    if (roleSort !== 0) return roleSort;
    return a.account.displayName.localeCompare(b.account.displayName);
  });
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default async function ContactsPage() {
  const session = await getSession();
  if (!session?.account) redirect('/login');

  const members = await api.members.myOrgMembers(session.account.id);
  const sorted = sortByRole(members ?? []);
  const total = sorted.length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Contacts</h1>
          <p className="text-sm text-gray-500 mt-0.5">Members of your organization</p>
        </div>
        <span className="text-xs font-medium bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full">
          {total} member{total !== 1 ? 's' : ''}
        </span>
      </div>

      {total === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-xl border border-gray-200 text-center">
          <User className="w-10 h-10 text-gray-200 mb-3" />
          <p className="text-sm text-gray-500">No organization members found.</p>
          <p className="text-xs text-gray-400 mt-1">
            Members are added when they register and join your brokerage.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Name</th>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Role</th>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3 hidden sm:table-cell">Email</th>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3 hidden md:table-cell">Phone</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sorted.map((m) => {
                const phone = m.account.cellPhone ?? m.account.officePhone;
                return (
                  <tr key={m.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-blue-700 flex items-center justify-center shrink-0">
                          <span className="text-white text-xs font-semibold">{initials(m)}</span>
                        </div>
                        <span className="font-medium text-gray-900">{m.account.displayName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${roleBadge(m.role)}`}>
                        {roleLabel(m.role)}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <span className="text-xs text-gray-600">{m.account.user?.email ?? '—'}</span>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className="text-xs text-gray-600">{phone ?? '—'}</span>
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
