'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FileText, Users, Home as HomeIcon, Landmark, Building2 } from 'lucide-react';
import PartyManagement from './PartyManagement';
import DocumentList, { type WorkspaceDocument } from './DocumentList';
import SideWorkspace from './SideWorkspace';
import type { ApiParty } from '@/lib/api';

const SECTIONS = [
  { key: 'documents',   label: 'Documents',    icon: FileText },
  { key: 'parties',     label: 'Parties',      icon: Users },
  { key: 'seller-side', label: 'Seller Side',  icon: HomeIcon },
  { key: 'buyer-side',  label: 'Buyer Side',   icon: HomeIcon },
  { key: 'escrow',      label: 'Escrow',       icon: Landmark },
  { key: 'lender',      label: 'Lender',       icon: Landmark },
  { key: 'broker',      label: 'Broker',       icon: Building2 },
] as const;

type SectionKey = typeof SECTIONS[number]['key'];
const SECTION_KEYS = SECTIONS.map((s) => s.key) as readonly string[];

function isSectionKey(v: string | null): v is SectionKey {
  return !!v && SECTION_KEYS.includes(v);
}

function PlaceholderSection() {
  return (
    <div className="text-center py-12 text-sm text-gray-400">
      No workflow has been configured for this section.
    </div>
  );
}

function DocumentsSection({ transactionId }: { transactionId: string }) {
  const [documents, setDocuments] = useState<WorkspaceDocument[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/v1/transactions/${transactionId}/workspace/documents`, { credentials: 'include' })
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load documents (${res.status})`);
        return res.json() as Promise<WorkspaceDocument[]>;
      })
      .then((data) => { if (!cancelled) setDocuments(data); })
      .catch((err: Error) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [transactionId]);

  return (
    <div className="p-4">
      <DocumentList documents={documents} loading={loading} error={error} emptyMessage="No documents have been uploaded yet." />
    </div>
  );
}

function PartiesSection({ transactionId }: { transactionId: string }) {
  const [parties, setParties] = useState<ApiParty[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/v1/transactions/${transactionId}/workspace/parties`, { credentials: 'include' })
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load parties (${res.status})`);
        return res.json() as Promise<ApiParty[]>;
      })
      .then((data) => { if (!cancelled) setParties(data); })
      .catch((err: Error) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [transactionId]);

  if (loading) return <div className="p-4 text-sm text-gray-400 text-center py-8">Loading parties…</div>;
  if (error) return <div className="p-4 text-sm text-red-600 bg-red-50 mx-4 mt-4 rounded-lg px-3 py-2.5">{error}</div>;

  return (
    <div className="p-4">
      <PartyManagement parties={parties ?? []} transactionId={transactionId} canEdit />
    </div>
  );
}

/**
 * The simplified post-Draft swimlane — replaces the old multi-stage
 * StagedSwimlane for any transaction not in Draft status. Each section
 * fetches its own data lazily (only when selected), so one section's
 * failure never blocks the others. The active section (and, for the
 * Seller/Buyer/Escrow sides, the active sub-tab) is kept in the URL query
 * string so it survives a refresh.
 */
export default function SimplifiedSwimlane({ transactionId }: { transactionId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sectionParam = searchParams.get('section');
  const activeSection: SectionKey = isSectionKey(sectionParam) ? sectionParam : 'documents';

  const setActiveSection = useCallback((key: SectionKey) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('section', key);
    router.replace(`?${params.toString()}`, { scroll: false });
  }, [router, searchParams]);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex border-b border-gray-200 bg-white overflow-x-auto shrink-0">
        {SECTIONS.map(({ key, label, icon: Icon }) => {
          const isSelected = activeSection === key;
          return (
            <button
              key={key}
              onClick={() => setActiveSection(key)}
              className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors focus:outline-none shrink-0 ${
                isSelected ? 'border-blue-700 text-blue-700 bg-blue-50/50' : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              <Icon size={14} />
              {label}
            </button>
          );
        })}
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        {activeSection === 'documents' && <DocumentsSection transactionId={transactionId} />}
        {activeSection === 'parties' && <PartiesSection transactionId={transactionId} />}
        {activeSection === 'seller-side' && <SideWorkspace transactionId={transactionId} side="seller" />}
        {activeSection === 'buyer-side' && <SideWorkspace transactionId={transactionId} side="buyer" />}
        {activeSection === 'escrow' && <SideWorkspace transactionId={transactionId} side="escrow" />}
        {activeSection === 'lender' && <div className="p-4"><PlaceholderSection /></div>}
        {activeSection === 'broker' && <SideWorkspace transactionId={transactionId} side="broker" />}
      </div>
    </div>
  );
}
