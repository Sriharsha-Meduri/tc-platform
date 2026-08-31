'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Mail, Info, Loader2, AlertCircle, Landmark, Home as HomeIcon, Percent, Bell, Check } from 'lucide-react';
import DocumentList, { type WorkspaceDocument } from './DocumentList';
import EmailHistoryList, { type EmailHistoryItem } from './EmailHistoryList';
import UploadLinkStatusButton, { type UploadLinkStatus } from './UploadLinkStatusButton';
import ChecklistSidebar from '@/app/upload-link/shared/ChecklistSidebar';
import type { DocumentChecklistStatus } from '@/app/upload-link/shared/checklist.types';
import type { PublicCdaDto } from '@/app/upload-link/shared/uploadLinkTypes';
import GeneratedCdaCard from '@/app/upload-link/shared/GeneratedCdaCard';
import type { ApiParty } from '@/lib/api';

export type WorkspaceSide = 'buyer' | 'seller' | 'escrow' | 'broker';

const SIDE_CONFIG: Record<WorkspaceSide, { roleLabel: string; detailsPath: string; basePath?: string }> = {
  buyer: { roleLabel: 'Buyer Agent', detailsPath: 'buyer-side' },
  seller: { roleLabel: 'Seller Agent', detailsPath: 'seller-side' },
  escrow: { roleLabel: 'Escrow Officer', detailsPath: 'escrow' },
  broker: { roleLabel: 'Broker', detailsPath: 'broker', basePath: '/upload-link/broker' },
};

interface SideContacts {
  agent: ApiParty | null;
  coordinator: ApiParty | null;
}

/**
 * `checklist`/`documents`/`transactionInfo`/`cda` are sourced server-side from
 * the exact same data the corresponding upload-link page itself reads (see
 * TransactionWorkspaceService's own doc comment) — this component renders
 * whatever comes back, it never computes checklist status itself.
 */
interface BuyerSideDetails {
  contacts: SideContacts;
  documents: WorkspaceDocument[];
  checklist: DocumentChecklistStatus;
  linkStatus: UploadLinkStatus;
  transactionInfo: {
    lender: { lenderName: string | null; lenderEmail: string | null };
    buyerSide: {
      brokerageName: string | null; brokerFullName: string | null; brokerEmail: string | null;
      buyerAgentPaymentAddress: string | null; clientCredits: number | null;
      buyerCommissionType: string | null; buyerCommissionValue: number | null; grossCommission: number | null;
    };
  } | null;
  cda: PublicCdaDto | null;
  buyerSideReminderLeadDays: number;
}

interface SellerSideDetails {
  contacts: SideContacts;
  documents: WorkspaceDocument[];
  checklist: DocumentChecklistStatus;
  linkStatus: UploadLinkStatus;
  transactionInfo: {
    escrow: { escrowContactName: string | null; escrowEmail: string | null };
    hoa: { hasHoa: boolean | null };
  } | null;
  sellerSideReminderLeadDays: number;
}

interface EscrowSideDetails {
  escrowContactName: string | null;
  escrowEmail: string | null;
  escrowNumber: string | null;
  willSendDocumentsToBuyer: boolean | null;
  hasHoa: boolean | null;
  ccContactName: string | null;
  ccContactEmail: string | null;
  documents: WorkspaceDocument[];
  checklist: DocumentChecklistStatus;
  linkStatus: UploadLinkStatus;
  signedCda: PublicCdaDto | null;
}

/** No `documents` field — the Broker upload link has no general document list of its own, see BrokerSideDetailsDto's own comment. */
interface BrokerSideDetails {
  recipientName: string | null;
  recipientEmail: string | null;
  checklist: DocumentChecklistStatus;
  linkStatus: UploadLinkStatus;
  transactionInfo: {
    finalSalesPrice: number | null; grossCommission: number | null; brokerPaymentAddress: string | null;
    brokerCommissionType: string | null; brokerCommissionValue: number | null;
    brokerCommissionAmount: number | null; buyerAgentCommissionAmount: number | null;
  } | null;
  cda: PublicCdaDto | null;
  signedCda: PublicCdaDto | null;
}

function formatCurrency(value: number | null): string {
  if (value === null) return '—';
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function ContactCard({ label, party }: { label: string; party: ApiParty | null }) {
  return (
    <div className="border border-gray-200 rounded-lg p-3">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{label}</p>
      {party ? (
        <>
          <p className="text-sm font-medium text-gray-800">{party.displayName}</p>
          <p className="text-xs text-gray-500 mt-0.5">{party.email ?? 'No email'}{party.phone ? ` · ${party.phone}` : ''}</p>
        </>
      ) : (
        <p className="text-sm text-gray-400">Not assigned</p>
      )}
    </div>
  );
}

function EmailHistoryTab({ transactionId, side }: { transactionId: string; side: WorkspaceSide }) {
  const [items, setItems] = useState<EmailHistoryItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/v1/transactions/${transactionId}/workspace/email-history?side=${side}`, { credentials: 'include' })
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load email history (${res.status})`);
        return res.json() as Promise<EmailHistoryItem[]>;
      })
      .then((data) => { if (!cancelled) setItems(data); })
      .catch((err: Error) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [transactionId, side]);

  return (
    <div className="p-4">
      <EmailHistoryList items={items} loading={loading} error={error} />
    </div>
  );
}

/**
 * Shared between Buyer Side and Seller Side — lets an authorized user
 * override the default 3-day reminder lead time. Saving PATCHes the
 * transaction-level setting at `settingsPath`; the backend diff-guards the
 * audit write and reschedules any pending (not yet sent) reminders against
 * the new value. Only the wording (`itemLabel`/`deadlineLabel`) and the
 * endpoint path differ between sides — the fetch/save/error state is
 * otherwise identical, so this is one component, not two.
 */
function ReminderLeadTimeSettings({ transactionId, leadDays, settingsPath, itemLabel, deadlineLabel, onSaved }: {
  transactionId: string;
  leadDays: number;
  settingsPath: string;
  itemLabel: string;
  deadlineLabel: string;
  onSaved: (leadDays: number) => void;
}) {
  const [value, setValue] = useState(String(leadDays));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => { setValue(String(leadDays)); }, [leadDays]);

  const handleSave = useCallback(async () => {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 0) {
      setError('Enter a whole number of days (0 or more).');
      return;
    }
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch(`/api/v1/transactions/${transactionId}/${settingsPath}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadDays: parsed }),
      });
      if (!res.ok) throw new Error(`Failed to save (${res.status})`);
      // Both settings endpoints return a single-key object (buyerSideReminderLeadDays or
      // sellerSideReminderLeadDays) — reading the sole value keeps this component side-agnostic.
      const data = await res.json() as Record<string, number>;
      const savedLeadDays = Object.values(data)[0];
      onSaved(savedLeadDays);
      setSaved(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }, [transactionId, settingsPath, value, onSaved]);

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-800 mb-2 flex items-center gap-1.5"><Bell size={13} /> Reminder Settings</h3>
      <div className="border border-gray-200 rounded-lg p-3">
        <p className="text-xs text-gray-500 mb-3">Reminder emails are sent 3 days before deadlines by default.</p>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-600">Send {itemLabel}</label>
          <input
            type="number"
            min={0}
            step={1}
            value={value}
            onChange={(e) => { setValue(e.target.value); setSaved(false); }}
            className="w-16 border border-gray-300 rounded px-2 py-1 text-xs"
          />
          <label className="text-xs text-gray-600">day(s) before {deadlineLabel}</label>
          <button
            onClick={handleSave}
            disabled={saving}
            className="ml-auto text-xs font-medium px-3 py-1 rounded bg-blue-700 text-white hover:bg-blue-800 disabled:opacity-50 flex items-center gap-1"
          >
            {saving ? <Loader2 size={12} className="animate-spin" /> : saved ? <Check size={12} /> : null}
            {saving ? 'Saving…' : saved ? 'Saved' : 'Save'}
          </button>
        </div>
        {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
      </div>
    </div>
  );
}

function LoadingOrError({ loading, error }: { loading: boolean; error: string | null }) {
  if (loading) {
    return <div className="flex items-center justify-center py-10 text-gray-400"><Loader2 size={18} className="animate-spin" /></div>;
  }
  if (error) {
    return (
      <div className="p-4 flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2.5 mx-4 mt-4">
        <AlertCircle size={14} className="shrink-0" /> {error}
      </div>
    );
  }
  return null;
}

function useSideDetails<T>(transactionId: string, path: string) {
  const [details, setDetails] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/v1/transactions/${transactionId}/workspace/${path}`, { credentials: 'include' })
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load details (${res.status})`);
        return res.json() as Promise<T>;
      })
      .then((data) => { if (!cancelled) setDetails(data); })
      .catch((err: Error) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [transactionId, path]);

  return { details, setDetails, loading, error };
}

function BuyerOrSellerDetailsTab({ transactionId, side }: { transactionId: string; side: 'buyer' | 'seller' }) {
  const config = SIDE_CONFIG[side];
  const isBuyer = side === 'buyer';
  const { details, setDetails, loading, error } = useSideDetails<BuyerSideDetails | SellerSideDetails>(transactionId, config.detailsPath);

  if (loading || error) return <LoadingOrError loading={loading} error={error} />;
  if (!details) return null;

  const buyerDetails = isBuyer ? (details as BuyerSideDetails) : null;
  const sellerDetails = !isBuyer ? (details as SellerSideDetails) : null;

  return (
    <div className="p-4 flex flex-col lg:flex-row gap-4 items-start">
      <div className="flex-1 min-w-0 w-full space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <ContactCard label={isBuyer ? 'Buyer Agent' : 'Seller Agent'} party={details.contacts.agent} />
          <ContactCard label={isBuyer ? 'Buyer TC' : 'Seller TC'} party={details.contacts.coordinator} />
        </div>

        <div>
          <h3 className="text-sm font-semibold text-gray-800 mb-2">Upload Link</h3>
          <UploadLinkStatusButton status={details.linkStatus} roleLabel={config.roleLabel} basePath={config.basePath} />
        </div>

        {isBuyer && buyerDetails?.cda && <GeneratedCdaCard cda={buyerDetails.cda} />}

        <div>
          <h3 className="text-sm font-semibold text-gray-800 mb-2">Uploaded Documents</h3>
          <DocumentList documents={details.documents} loading={false} error={null} emptyMessage="No documents visible on this side yet." />
        </div>

        {isBuyer && typeof buyerDetails?.buyerSideReminderLeadDays === 'number' && (
          <ReminderLeadTimeSettings
            transactionId={transactionId}
            leadDays={buyerDetails.buyerSideReminderLeadDays}
            settingsPath="buyer-side-reminder-settings"
            itemLabel="Verification of Property reminder"
            deadlineLabel="Close of Escrow"
            onSaved={(leadDays) => setDetails((prev) => (prev ? { ...prev, buyerSideReminderLeadDays: leadDays } : prev))}
          />
        )}

        {!isBuyer && typeof sellerDetails?.sellerSideReminderLeadDays === 'number' && (
          <ReminderLeadTimeSettings
            transactionId={transactionId}
            leadDays={sellerDetails.sellerSideReminderLeadDays}
            settingsPath="seller-side-reminder-settings"
            itemLabel="required document reminders"
            deadlineLabel="Seller Disclosures"
            onSaved={(leadDays) => setDetails((prev) => (prev ? { ...prev, sellerSideReminderLeadDays: leadDays } : prev))}
          />
        )}

        {isBuyer && buyerDetails?.transactionInfo && (
          <div>
            <h3 className="text-sm font-semibold text-gray-800 mb-2">Transaction Information</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="border border-gray-200 rounded-lg p-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 flex items-center gap-1"><Landmark size={11} /> Lender</p>
                <p className="text-xs text-gray-600">{buyerDetails.transactionInfo.lender.lenderName ?? '—'}</p>
                <p className="text-xs text-gray-500">{buyerDetails.transactionInfo.lender.lenderEmail ?? ''}</p>
              </div>
              <div className="border border-gray-200 rounded-lg p-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 flex items-center gap-1"><Percent size={11} /> Broker &amp; Commission</p>
                <p className="text-xs text-gray-600">{buyerDetails.transactionInfo.buyerSide.brokerageName ?? '—'}{buyerDetails.transactionInfo.buyerSide.brokerFullName ? ` · ${buyerDetails.transactionInfo.buyerSide.brokerFullName}` : ''}</p>
                <p className="text-xs text-gray-500">{buyerDetails.transactionInfo.buyerSide.brokerEmail ?? ''}</p>
                <p className="text-xs text-gray-600 mt-1">Gross Commission: {formatCurrency(buyerDetails.transactionInfo.buyerSide.grossCommission)}</p>
              </div>
            </div>
          </div>
        )}

        {!isBuyer && sellerDetails?.transactionInfo && (
          <div>
            <h3 className="text-sm font-semibold text-gray-800 mb-2">Transaction Information</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="border border-gray-200 rounded-lg p-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 flex items-center gap-1"><Info size={11} /> Escrow Contact</p>
                <p className="text-xs text-gray-600">{sellerDetails.transactionInfo.escrow.escrowContactName ?? '—'}</p>
                <p className="text-xs text-gray-500">{sellerDetails.transactionInfo.escrow.escrowEmail ?? ''}</p>
              </div>
              <div className="border border-gray-200 rounded-lg p-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 flex items-center gap-1"><HomeIcon size={11} /> HOA</p>
                <p className="text-xs text-gray-600">
                  {sellerDetails.transactionInfo.hoa.hasHoa === true ? 'Yes' : sellerDetails.transactionInfo.hoa.hasHoa === false ? 'No' : 'Not answered'}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="w-full lg:w-80 shrink-0">
        <ChecklistSidebar checklist={details.checklist} />
      </div>
    </div>
  );
}

function EscrowDetailsTab({ transactionId }: { transactionId: string }) {
  const { details, loading, error } = useSideDetails<EscrowSideDetails>(transactionId, 'escrow');

  if (loading || error) return <LoadingOrError loading={loading} error={error} />;
  if (!details) return null;

  return (
    <div className="p-4 flex flex-col lg:flex-row gap-4 items-start">
      <div className="flex-1 min-w-0 w-full space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="border border-gray-200 rounded-lg p-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Escrow Officer</p>
            {details.escrowContactName ? (
              <>
                <p className="text-sm font-medium text-gray-800">{details.escrowContactName}</p>
                <p className="text-xs text-gray-500 mt-0.5">{details.escrowEmail ?? 'No email'}</p>
              </>
            ) : (
              <p className="text-sm text-gray-400">Not saved yet</p>
            )}
          </div>
          <div className="border border-gray-200 rounded-lg p-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">CC'd on Welcome Email</p>
            <p className="text-sm text-gray-700">{details.ccContactName ?? '—'}</p>
            <p className="text-xs text-gray-500">{details.ccContactEmail ?? ''}</p>
          </div>
          <div className="border border-gray-200 rounded-lg p-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Escrow Number</p>
            <p className="text-sm text-gray-700">{details.escrowNumber ?? 'Not provided yet'}</p>
          </div>
          <div className="border border-gray-200 rounded-lg p-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Sending Documents to Buyer?</p>
            <p className="text-sm text-gray-700">
              {details.willSendDocumentsToBuyer === true ? 'Yes' : details.willSendDocumentsToBuyer === false ? 'No' : 'Not answered'}
            </p>
          </div>
          <div className="border border-gray-200 rounded-lg p-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 flex items-center gap-1"><HomeIcon size={11} /> HOA</p>
            <p className="text-sm text-gray-700">{details.hasHoa === true ? 'Yes' : details.hasHoa === false ? 'No' : 'Not answered'}</p>
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-gray-800 mb-2">Upload Link</h3>
          <UploadLinkStatusButton status={details.linkStatus} roleLabel="Escrow Officer" />
        </div>

        {details.signedCda && <GeneratedCdaCard cda={details.signedCda} title="Signed CDA" description="The signed Commission Disbursement Authorization has been received." />}

        <div>
          <h3 className="text-sm font-semibold text-gray-800 mb-2">Uploaded Documents</h3>
          <DocumentList documents={details.documents} loading={false} error={null} emptyMessage="No documents visible to Escrow yet." />
        </div>
      </div>

      <div className="w-full lg:w-80 shrink-0">
        <ChecklistSidebar checklist={details.checklist} />
      </div>
    </div>
  );
}

function BrokerDetailsTab({ transactionId }: { transactionId: string }) {
  const { details, loading, error } = useSideDetails<BrokerSideDetails>(transactionId, 'broker');

  if (loading || error) return <LoadingOrError loading={loading} error={error} />;
  if (!details) return null;

  const info = details.transactionInfo;

  return (
    <div className="p-4 flex flex-col lg:flex-row gap-4 items-start">
      <div className="flex-1 min-w-0 w-full space-y-4">
        <div className="border border-gray-200 rounded-lg p-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Broker</p>
          {details.recipientName ? (
            <>
              <p className="text-sm font-medium text-gray-800">{details.recipientName}</p>
              <p className="text-xs text-gray-500 mt-0.5">{details.recipientEmail ?? 'No email'}</p>
            </>
          ) : (
            <p className="text-sm text-gray-400">Not saved yet — the Buyer Agent hasn&apos;t entered the broker&apos;s name/email.</p>
          )}
        </div>

        <div>
          <h3 className="text-sm font-semibold text-gray-800 mb-2">Upload Link</h3>
          <UploadLinkStatusButton status={details.linkStatus} roleLabel="Broker" basePath="/upload-link/broker" />
        </div>

        {details.cda && <GeneratedCdaCard cda={details.cda} />}
        {details.signedCda && <GeneratedCdaCard cda={details.signedCda} title="Signed CDA" description="The broker's signed CDA has been received." />}

        {info && (
          <div>
            <h3 className="text-sm font-semibold text-gray-800 mb-2 flex items-center gap-1.5"><Landmark size={13} /> Broker Commission</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="border border-gray-200 rounded-lg p-3">
                <p className="text-xs text-gray-500">Final Sales Price</p>
                <p className="text-sm font-semibold text-gray-800">{formatCurrency(info.finalSalesPrice)}</p>
              </div>
              <div className="border border-gray-200 rounded-lg p-3">
                <p className="text-xs text-gray-500">Gross Commission</p>
                <p className="text-sm font-semibold text-gray-800">{formatCurrency(info.grossCommission)}</p>
              </div>
              <div className="border border-gray-200 rounded-lg p-3">
                <p className="text-xs text-gray-500">Broker Payment Address</p>
                <p className="text-sm text-gray-700">{info.brokerPaymentAddress ?? '—'}</p>
              </div>
              <div className="border border-gray-200 rounded-lg p-3">
                <p className="text-xs text-gray-500">Commission Type / Value</p>
                <p className="text-sm text-gray-700">
                  {info.brokerCommissionType
                    ? `${info.brokerCommissionValue}${info.brokerCommissionType === 'percentage' ? '%' : ' (flat)'}`
                    : '—'}
                </p>
              </div>
              <div className="border border-gray-200 rounded-lg p-3">
                <p className="text-xs text-gray-500">Broker Commission</p>
                <p className="text-sm font-semibold text-gray-800">{formatCurrency(info.brokerCommissionAmount)}</p>
              </div>
              <div className="border border-gray-200 rounded-lg p-3">
                <p className="text-xs text-gray-500">Buyer Agent Commission</p>
                <p className="text-sm font-semibold text-gray-800">{formatCurrency(info.buyerAgentCommissionAmount)}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="w-full lg:w-80 shrink-0">
        <ChecklistSidebar checklist={details.checklist} />
      </div>
    </div>
  );
}

/**
 * Shared shell for Seller Side / Buyer Side / Escrow / Broker — two sub-tabs
 * (Email History, Details), each fetched lazily. checklist/documents/
 * transactionInfo/cda for every side are the exact same data the
 * corresponding upload-link page reads (see TransactionWorkspaceService and
 * ChecklistCompositionService) — this component never computes any of that
 * itself, it just renders whatever its own scoped fetch returns.
 */
export default function SideWorkspace({ transactionId, side }: { transactionId: string; side: WorkspaceSide }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');
  const activeTab: 'email' | 'details' = tabParam === 'details' ? 'details' : 'email';

  const setActiveTab = useCallback((tab: 'email' | 'details') => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', tab);
    router.replace(`?${params.toString()}`, { scroll: false });
  }, [router, searchParams]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex border-b border-gray-100 bg-gray-50/60 shrink-0">
        <button
          onClick={() => setActiveTab('email')}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
            activeTab === 'email' ? 'border-blue-700 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Mail size={12} /> Email History
        </button>
        <button
          onClick={() => setActiveTab('details')}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
            activeTab === 'details' ? 'border-blue-700 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Info size={12} /> Details
        </button>
      </div>

      {activeTab === 'email' && <EmailHistoryTab transactionId={transactionId} side={side} />}
      {activeTab === 'details' && (
        side === 'escrow' ? <EscrowDetailsTab transactionId={transactionId} />
        : side === 'broker' ? <BrokerDetailsTab transactionId={transactionId} />
        : <BuyerOrSellerDetailsTab transactionId={transactionId} side={side} />
      )}
    </div>
  );
}
