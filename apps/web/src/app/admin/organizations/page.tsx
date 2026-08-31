import Link from 'next/link';
import { getAdminOrganizationsAction, approveOrganizationAction, rejectOrganizationAction } from '@/lib/admin-actions';

export const metadata = { title: 'Admin Organizations — TC' };

function statusClass(status: string) {
  const map: Record<string, string> = {
    pending_approval: 'text-amber-600 font-semibold',
    active: 'text-emerald-600 font-semibold',
    inactive: 'text-red-600 font-semibold',
    suspended: 'text-red-600 font-semibold',
  };
  return map[status] ?? '';
}

function OrgRow({ org }: { org: { id: string; name: string; email: string; phone: string | null; status: string; city: string | null; state: string | null; createdAt: string } }) {
  return (
    <tr className="hover:bg-slate-50">
      <td className="px-4 py-3 font-medium text-slate-900">{org.name}</td>
      <td className="px-4 py-3 text-slate-500">{org.email}</td>
      <td className="px-4 py-3 text-slate-500">{org.phone ?? <span className="italic text-slate-300">&mdash;</span>}</td>
      <td className="px-4 py-3 text-slate-500">{org.city && org.state ? `${org.city}, ${org.state}` : <span className="italic text-slate-300">&mdash;</span>}</td>
      <td className={`px-4 py-3 ${statusClass(org.status)}`}>{org.status}</td>
      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{new Date(org.createdAt).toLocaleDateString()}</td>
      <td className="px-4 py-3 whitespace-nowrap">
        {org.status === 'pending_approval' ? (
          <div className="flex gap-1.5">
            <form action={async () => { 'use server'; await approveOrganizationAction(org.id); }}>
              <button type="submit" className="px-3 py-1.5 text-xs font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors">Approve</button>
            </form>
            <form action={async () => { 'use server'; await rejectOrganizationAction(org.id); }}>
              <button type="submit" className="px-3 py-1.5 text-xs font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors">Reject</button>
            </form>
          </div>
        ) : (
          <span className="text-xs text-slate-400 italic">{org.status === 'active' ? 'Approved' : 'Not active'}</span>
        )}
      </td>
    </tr>
  );
}

export default async function AdminOrganizationsPage() {
  const orgs = await getAdminOrganizationsAction() as Array<{
    id: string; name: string; email: string; phone: string | null; status: string;
    city: string | null; state: string | null; createdAt: string;
  }>;

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Organizations</h1>
        <Link
          href="/admin/organizations/create"
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-800 transition-colors"
        >
          + Create Organization
        </Link>
      </div>
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide">Name</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide">Email</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide">Phone</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide">Location</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide">Status</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide">Created</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {orgs.map((org) => <OrgRow key={org.id} org={org} />)}
          </tbody>
        </table>
        {orgs.length === 0 && (
          <p className="text-center py-8 text-slate-400 italic">No organizations found.</p>
        )}
      </div>
    </>
  );
}
