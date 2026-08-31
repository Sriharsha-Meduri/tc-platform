'use client';

import { useState, useEffect } from 'react';
import { Search, Building2, Loader2, X, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import { joinBrokerageAction, browseOrganizationsAction } from '@/lib/auth-actions';

interface OrgResult {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
}

interface MembershipInfo {
  id: string;
  organizationId: string;
  role: string;
  status: string;
}

type BrokerageStatus = 'independent' | 'pending' | 'active' | 'rejected';

interface Props {
  memberships: MembershipInfo[];
  isAgent?: boolean;
}

export default function BrokerageSection({ memberships, isAgent }: Props) {
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<OrgResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const activeMembership = memberships.find((m) => m.status === 'active');
  const pendingMembership = memberships.find((m) => m.status === 'pending');
  const rejectedMembership = memberships.find((m) => m.status === 'rejected');

  const status: BrokerageStatus = activeMembership
    ? 'active'
    : pendingMembership
    ? 'pending'
    : rejectedMembership
    ? 'rejected'
    : 'independent';

  useEffect(() => {
    if (!searchQuery || searchQuery.length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setSearching(true);
      const data = await browseOrganizationsAction(1, 10, searchQuery);
      if (data.result) setResults(data.result.data || []);
      setSearching(false);
    }, 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  async function handleJoin(orgId: string) {
    setJoining(true);
    setError(null);
    const result = await joinBrokerageAction(orgId);
    if (result.error) {
      setError(result.error);
    } else {
      setSuccess('Join request submitted successfully!');
      setShowSearch(false);
      setSearchQuery('');
      setResults([]);
    }
    setJoining(false);
  }

  return (
    <div className="rounded-lg border border-gray-200 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-700">Brokerage Status</h3>
        </div>
        <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${
          status === 'independent' ? 'bg-gray-50 border-gray-200 text-gray-600' :
          status === 'pending' ? 'bg-amber-50 border-amber-200 text-amber-600' :
          status === 'active' ? 'bg-green-50 border-green-200 text-green-600' :
          'bg-red-50 border-red-200 text-red-600'
        }`}>
          {status === 'independent' ? <CheckCircle size={11} /> :
           status === 'pending' ? <Clock size={11} /> :
           status === 'rejected' ? <AlertCircle size={11} /> :
           <CheckCircle size={11} />}
          {status === 'independent' ? 'Independent Agent' :
           status === 'pending' ? 'Pending Approval' :
           status === 'active' ? 'Active Member' : 'Rejected'}
        </span>
      </div>

      {success && (
        <div className="text-xs text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2 flex items-center gap-1.5">
          <CheckCircle size={12} />{success}
        </div>
      )}

      {status === 'pending' && (
        <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-3 py-2">
          Your request to join a brokerage is pending approval. You can continue using MyTC as an independent agent.
        </div>
      )}

      {status === 'rejected' && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
          Your previous request was declined. You can search for another brokerage.
        </div>
      )}

      {status !== 'active' && !isAgent && (
        <>
          {!showSearch ? (
            <button
              type="button"
              onClick={() => setShowSearch(true)}
              className="w-full text-center text-xs font-medium text-blue-600 hover:text-blue-800 py-1.5 bg-blue-50 border border-blue-200 rounded-lg"
            >
              {status === 'independent' ? 'Request to Join Brokerage' : 'Search for Another Brokerage'}
            </button>
          ) : (
            <div className="space-y-2">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by name, city, or state..."
                  autoFocus
                  className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                />
                <button
                  type="button"
                  onClick={() => { setShowSearch(false); setSearchQuery(''); setResults([]); }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X size={14} />
                </button>
              </div>
              {searching && (
                <div className="flex items-center justify-center py-2">
                  <Loader2 size={14} className="animate-spin text-gray-400" />
                </div>
              )}

              {results.length > 0 && (
                <div className="border border-gray-200 rounded-lg max-h-48 overflow-y-auto divide-y divide-gray-100">
                  {results.map((org) => (
                    <div key={org.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50">
                      <Building2 size={14} className="text-gray-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{org.name}</p>
                        {(org.city || org.state) && (
                          <p className="text-xs text-gray-400">
                            {[org.city, org.state].filter(Boolean).join(', ')}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleJoin(org.id)}
                        disabled={joining}
                        className="text-xs font-medium text-blue-600 hover:text-blue-800 disabled:opacity-50 whitespace-nowrap px-2 py-1 bg-blue-50 border border-blue-200 rounded"
                      >
                        {joining ? 'Requesting...' : 'Join'}
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {error && (
                <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
