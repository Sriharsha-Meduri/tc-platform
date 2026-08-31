'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Save, Loader2, Mail, Phone } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ApiParty } from '@/lib/api';

interface Props {
  parties: ApiParty[];
  transactionId: string;
  /** Whether the current viewer is allowed to edit party contact info — not limited to the Draft stage. */
  canEdit: boolean;
}

const PARTY_ROLE_LABELS: Record<string, string> = {
  buyer: 'Buyer',
  seller: 'Seller',
  buyer_agent: 'Buyer Agent',
  seller_agent: 'Seller Agent',
  buyer_transaction_coordinator: 'Buyer TC',
  seller_transaction_coordinator: 'Seller TC',
  lender: 'Lender',
  escrow_officer: 'Escrow Officer',
  title_officer: 'Title Officer',
};

const AGENT_ROLES = ['buyer_agent', 'seller_agent'];
const BUYER_ROLES = ['buyer', 'buyer_agent', 'buyer_transaction_coordinator'];
const SELLER_ROLES = ['seller', 'seller_agent', 'seller_transaction_coordinator'];

function groupPartiesByRole(parties: ApiParty[]) {
  const groups: { role: string; label: string; parties: ApiParty[]; isAgentGroup?: boolean }[] = [];

  // Buyer principal group
  const buyerPrincipals = parties.filter((p) => p.partyRole === 'buyer');
  if (buyerPrincipals.length) {
    groups.push({ role: 'buyer', label: 'Buyers', parties: buyerPrincipals });
  }

  // Buyer agent group
  const buyerAgents = parties.filter((p) => p.partyRole === 'buyer_agent');
  if (buyerAgents.length) {
    groups.push({ role: 'buyer_agent', label: "Buyer's Agent", parties: buyerAgents, isAgentGroup: true });
  }

  // Seller principal group
  const sellerPrincipals = parties.filter((p) => p.partyRole === 'seller');
  if (sellerPrincipals.length) {
    groups.push({ role: 'seller', label: 'Sellers', parties: sellerPrincipals });
  }

  // Seller agent group
  const sellerAgents = parties.filter((p) => p.partyRole === 'seller_agent');
  if (sellerAgents.length) {
    groups.push({ role: 'seller_agent', label: "Seller's Agent", parties: sellerAgents, isAgentGroup: true });
  }

  // Other parties (TCs, lenders, escrow, etc.)
  const otherParties = parties.filter(
    (p) => !BUYER_ROLES.includes(p.partyRole) && !SELLER_ROLES.includes(p.partyRole),
  );
  for (const party of otherParties) {
    groups.push({
      role: party.partyRole,
      label: PARTY_ROLE_LABELS[party.partyRole] ?? party.partyRole,
      parties: [party],
    });
  }

  return groups;
}

function getRoleNumber(parties: ApiParty[], party: ApiParty): number {
  const sameRole = parties.filter((p) => p.partyRole === party.partyRole);
  return sameRole.indexOf(party) + 1;
}

export default function PartyManagement({ parties, transactionId: _transactionId, canEdit }: Props) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const groups = groupPartiesByRole(parties);

  function startEditing(party: ApiParty) {
    setEditingId(party.id);
    setEditEmail(party.email ?? '');
    setEditPhone(party.phone ?? '');
    setError(null);
  }

  function cancelEditing() {
    setEditingId(null);
    setEditEmail('');
    setEditPhone('');
    setError(null);
  }

  async function saveParty(partyId: string) {
    setSavingId(partyId);
    setError(null);

    try {
      const res = await fetch(`/api/v1/transaction-parties/${partyId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(editEmail && { email: editEmail }),
          ...(editPhone && { phone: editPhone }),
        }),
      });

      if (!res.ok) {
        throw new Error(`Error ${res.status}`);
      }

      cancelEditing();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSavingId(null);
    }
  }

  if (!parties.length) {
    return (
      <div className="text-center py-6 text-gray-500 text-sm">
        No parties added yet.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {groups.map((group) => (
        <div key={group.role} className="space-y-2">
          <div className="flex items-center gap-2">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              {group.label}
            </h4>
            {group.isAgentGroup && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">
                Agent
              </span>
            )}
          </div>

          {group.parties.map((party) => {
            const isEditing = editingId === party.id;
            const isSaving = savingId === party.id;
            const roleNum = getRoleNumber(parties, party);
            const isAgent = AGENT_ROLES.includes(party.partyRole);

            return (
              <div
                key={party.id}
                className={cn(
                  'flex items-center gap-3 rounded-lg border px-3 py-2.5',
                  isEditing
                    ? 'border-blue-200 bg-blue-50'
                    : isAgent
                      ? 'border-blue-200 bg-blue-50/50'
                      : 'border-gray-200 bg-white hover:bg-gray-50',
                )}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 truncate">
                    {party.displayName || (PARTY_ROLE_LABELS[party.partyRole] ?? party.partyRole)}
                    {roleNum > 1 && ` ${roleNum}`}
                    {isAgent && (
                      <span className="ml-2 text-[10px] font-medium px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">
                        {PARTY_ROLE_LABELS[party.partyRole]}
                      </span>
                    )}
                  </div>

                  {isEditing ? (
                    <div className="mt-1.5 flex flex-col gap-1.5">
                      <div className="flex items-center gap-1.5">
                        <Mail size={12} className="text-gray-400 shrink-0" />
                        <input
                          type="email"
                          value={editEmail}
                          onChange={(e) => setEditEmail(e.target.value)}
                          placeholder="Email"
                          className="flex-1 text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:border-blue-400"
                          autoFocus
                        />
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Phone size={12} className="text-gray-400 shrink-0" />
                        <input
                          type="tel"
                          value={editPhone}
                          onChange={(e) => setEditPhone(e.target.value)}
                          placeholder="Phone"
                          className="flex-1 text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:border-blue-400"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500">
                      {party.email && (
                        <span className="flex items-center gap-1 truncate">
                          <Mail size={11} className="text-gray-400" />
                          {party.email}
                        </span>
                      )}
                      {party.phone && (
                        <span className="flex items-center gap-1">
                          <Phone size={11} className="text-gray-400" />
                          {party.phone}
                        </span>
                      )}
                      {!party.email && !party.phone && (
                        <span className="text-gray-400 italic">No contact info</span>
                      )}
                    </div>
                  )}
                  {party.brokerage && (
                    <p className="text-xs text-gray-400 mt-0.5 truncate">{party.brokerage}</p>
                  )}
                </div>

                {canEdit && (
                  <div className="flex items-center gap-1 shrink-0">
                    {isEditing ? (
                      <>
                        <button
                          onClick={() => saveParty(party.id)}
                          disabled={isSaving}
                          className="p-1.5 text-green-600 hover:bg-green-50 rounded"
                          title="Save"
                        >
                          {isSaving ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <Save size={14} />
                          )}
                        </button>
                        <button
                          onClick={cancelEditing}
                          disabled={isSaving}
                          className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded text-xs"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => startEditing(party)}
                        className="text-xs text-blue-600 hover:text-blue-800 px-2 py-1 rounded hover:bg-blue-50"
                      >
                        Edit
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
