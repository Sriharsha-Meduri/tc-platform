import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { PaginatedAuditLogs } from '@/lib/admin-actions';

export const metadata = { title: 'Admin Audit Logs — TC' };

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000') + '/admin/api';

const TABS = [
  { label: 'All',              category: '' },
  { label: 'User Management',  category: 'user' },
  { label: 'Transaction Management', category: 'transaction' },
];

async function fetchAuditLogs(page: number, limit: number, category?: string): Promise<PaginatedAuditLogs> {
  const token = (await cookies()).get('tc_token')?.value;
  if (!token) redirect('/admin-login');

  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('limit', String(limit));
  if (category) params.set('category', category);

  const res = await fetch(`${API_URL}/audit-logs?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401 || res.status === 403) redirect('/admin-login');
  if (!res.ok) throw new Error(`Admin API error: ${res.status}`);
  return res.json();
}

export default async function AdminAuditLogsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; category?: string }>;
}) {
  const params = await searchParams;
  const page = parseInt(params.page ?? '1', 10);
  const category = params.category ?? '';
  const result = await fetchAuditLogs(page, 50, category || undefined);

  function href(c: string, p: number) {
    const sp = new URLSearchParams();
    if (c) sp.set('category', c);
    if (p > 1) sp.set('page', String(p));
    const q = sp.toString();
    return `/admin/audit-logs${q ? `?${q}` : ''}`;
  }

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Audit Logs</h1>
      </div>

      <div className="flex gap-1 mb-4 border-b border-slate-200">
        {TABS.map((tab) => (
          <Link
            key={tab.category}
            href={href(tab.category, 1)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              category === tab.category
                ? 'bg-white text-blue-600 border border-b-white border-slate-200 -mb-px'
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide">Action</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide">Target</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide">Description</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide">Account</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {result.data.map((log) => (
              <tr key={log.id} className="hover:bg-slate-50">
                <td className="px-4 py-3"><code className="bg-slate-100 px-2 py-0.5 rounded text-xs font-mono">{log.action}</code></td>
                <td className="px-4 py-3">
                  <div className="text-xs text-slate-500">{log.targetType}</div>
                  <div className="text-slate-900">{log.targetDisplayName ?? log.targetId?.slice(0, 8)}</div>
                </td>
                <td className="px-4 py-3 text-slate-600 max-w-xs truncate">{log.description ?? <span className="italic text-slate-300">&mdash;</span>}</td>
                <td className="px-4 py-3 text-slate-500 text-xs">{log.accountId ? log.accountId.slice(0, 8) : <span className="italic text-slate-300">&mdash;</span>}</td>
                <td className="px-4 py-3 text-slate-500 whitespace-nowrap text-xs">{new Date(log.createdAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {result.data.length === 0 && (
          <p className="text-center py-8 text-slate-400 italic">No audit logs found.</p>
        )}
      </div>

      {result.totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm">
          <p className="text-slate-500">
            Page {result.page} of {result.totalPages} ({result.total} total)
          </p>
          <div className="flex gap-2">
            {result.page > 1 ? (
              <Link
                href={href(category, page - 1)}
                className="px-3 py-1.5 rounded border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Previous
              </Link>
            ) : (
              <span className="px-3 py-1.5 rounded border border-slate-100 text-slate-300 cursor-default">Previous</span>
            )}
            {result.page < result.totalPages ? (
              <Link
                href={href(category, page + 1)}
                className="px-3 py-1.5 rounded border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Next
              </Link>
            ) : (
              <span className="px-3 py-1.5 rounded border border-slate-100 text-slate-300 cursor-default">Next</span>
            )}
          </div>
        </div>
      )}
    </>
  );
}
