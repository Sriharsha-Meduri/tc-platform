'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { browseOrganizationsAction, joinBrokerageAction } from '@/lib/auth-actions';
import type { BrowseOrgResult } from '@/lib/auth-actions';
import { Search, ChevronLeft, ChevronRight } from 'lucide-react';

export default function JoinBrokerageForm() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [orgs, setOrgs] = useState<BrowseOrgResult[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [joinedIds, setJoinedIds] = useState<Set<string>>(new Set());
  const [joiningId, setJoiningId] = useState<string | null>(null);

  const PER_PAGE = 12;

  const load = useCallback(async (p: number, q: string) => {
    setLoading(true);
    setError(null);
    const res = await browseOrganizationsAction(p, PER_PAGE, q || undefined);
    if (res.error) {
      setError(res.error);
      setOrgs([]);
    } else if (res.result) {
      setOrgs(res.result.data);
      setPage(res.result.page);
      setTotalPages(res.result.totalPages);
      setTotal(res.result.total);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load(1, '');
  }, [load]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    load(1, query);
  }

  async function handleJoin(orgId: string) {
    setJoiningId(orgId);
    setError(null);
    const res = await joinBrokerageAction(orgId);
    if (res.error) {
      setError(res.error);
    } else {
      setJoinedIds((prev) => new Set(prev).add(orgId));
    }
    setJoiningId(null);
  }

  function goToPage(p: number) {
    if (p < 1 || p > totalPages) return;
    setPage(p);
    load(p, query);
  }

  return (
    <div className="space-y-5">
      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, city, or state…"
            className="block w-full rounded-lg border border-gray-300 pl-9 pr-3 py-2.5 text-sm shadow-sm placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 transition-colors"
        >
          Search
        </button>
      </form>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <div className="text-center py-12 text-sm text-gray-500">Loading brokerages…</div>
      ) : orgs.length === 0 ? (
        <div className="text-center py-12">
          <p className="font-medium text-gray-700">No brokerages found</p>
          <p className="mt-1 text-sm text-gray-500">Try a different search term or check the spelling.</p>
        </div>
      ) : (
        <>
          <p className="text-sm text-gray-500">
            Showing <span className="font-medium">{orgs.length}</span> of{' '}
            <span className="font-medium">{total}</span> brokerages
          </p>

          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
                  <th className="px-4 py-3 font-medium">Brokerage</th>
                  <th className="px-4 py-3 font-medium">City</th>
                  <th className="px-4 py-3 font-medium">State</th>
                  <th className="px-4 py-3 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {orgs.map((org) => {
                  const isJoined = joinedIds.has(org.id);
                  const isJoining = joiningId === org.id;
                  return (
                    <tr key={org.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{org.name}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{org.city || '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{org.state || '—'}</td>
                      <td className="px-4 py-3 text-right">
                        {isJoined ? (
                          <span className="inline-flex items-center rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
                            Request sent
                          </span>
                        ) : (
                          <button
                            onClick={() => handleJoin(org.id)}
                            disabled={isJoining}
                            className="rounded-lg bg-blue-700 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          >
                            {isJoining ? 'Sending…' : 'Request to Join'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                onClick={() => goToPage(page - 1)}
                disabled={page <= 1}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-gray-700 rounded-md border border-gray-300 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                Prev
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  onClick={() => goToPage(p)}
                  className={`w-8 h-8 text-sm font-medium rounded-md transition-colors ${
                    p === page
                      ? 'bg-blue-700 text-white'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  {p}
                </button>
              ))}
              <button
                onClick={() => goToPage(page + 1)}
                disabled={page >= totalPages}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-gray-700 rounded-md border border-gray-300 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </>
      )}

      {joinedIds.size > 0 && (
        <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-4 text-sm">
          <p className="font-medium text-green-800">Request{joinedIds.size > 1 ? 's' : ''} submitted</p>
          <p className="mt-1 text-green-700">
            Your request{joinedIds.size > 1 ? 's have' : ' has'} been submitted. A broker admin will review
            {joinedIds.size > 1 ? ' them' : ' it'}.
          </p>
          <button
            onClick={() => router.push('/dashboard')}
            className="mt-3 text-sm font-medium text-green-800 hover:text-green-900 underline"
          >
            Go to dashboard
          </button>
        </div>
      )}
    </div>
  );
}
