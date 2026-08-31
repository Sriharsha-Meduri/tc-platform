'use client';

import { useCallback, useEffect, useState } from 'react';
import { MapPin, CheckCircle, XCircle, Loader2, Landmark } from 'lucide-react';
import UploadLinkLayout from '../shared/UploadLinkLayout';
import GeneratedCdaCard from '../shared/GeneratedCdaCard';
import ChecklistSidebar from '../shared/ChecklistSidebar';
import TransactionCompletedBanner from '../shared/TransactionCompletedBanner';
import { getCda, getSignedCda, getChecklist } from '../shared/uploadLinkApi';
import type { UploadPageContext, PublicCdaDto } from '../shared/uploadLinkTypes';
import type { DocumentChecklistStatus } from '../shared/checklist.types';
import { loadBrokerTransactionInfo, saveBrokerInfo } from './brokerUploadService';
import { validateBrokerInfo, hasBrokerValidationError } from './brokerValidation';
import SignCdaUploadCard from './SignCdaUploadCard';

function formatCurrency(value: number | null): string {
  if (value === null) return 'Not yet available';
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

/**
 * The Broker's own secure page — retrieves the read-only Final Sales Price
 * and Gross Commission (the Buyer Agent's own calculated commission), and
 * lets the broker enter their payment address plus their own commission
 * split (percentage of grossCommission, or a flat amount). Saving computes
 * and displays Broker Commission and Buyer Agent Commission.
 *
 * Once the CDA is generated, a "Sign CDA" checklist item appears (see
 * TransactionFormTemplatesService.getBrokerChecklistStatus) and the broker
 * can view/download the generated CDA, then upload the signed copy through
 * their one dedicated upload capability — see SignCdaUploadCard.
 */
export default function BrokerUploadPage({ token, context }: { token: string; context: UploadPageContext }) {
  const [finalSalesPrice, setFinalSalesPrice] = useState<number | null>(null);
  const [grossCommission, setGrossCommission] = useState<number | null>(null);
  const [brokerPaymentAddress, setBrokerPaymentAddress] = useState('');
  const [brokerCommissionType, setBrokerCommissionType] = useState<'percentage' | 'flat_amount' | ''>('');
  const [brokerCommissionValue, setBrokerCommissionValue] = useState('');
  const [brokerCommissionAmount, setBrokerCommissionAmount] = useState<number | null>(null);
  const [buyerAgentCommissionAmount, setBuyerAgentCommissionAmount] = useState<number | null>(null);

  const [infoSaving, setInfoSaving] = useState(false);
  const [infoSaved, setInfoSaved] = useState(false);
  const [infoError, setInfoError] = useState<string | null>(null);
  const [brokerCommissionValueError, setBrokerCommissionValueError] = useState<string | null>(null);
  const [cda, setCda] = useState<PublicCdaDto | null>(null);
  const [signedCda, setSignedCda] = useState<PublicCdaDto | null>(null);
  const [checklist, setChecklist] = useState<DocumentChecklistStatus | null>(null);

  const loadCda = useCallback(() => {
    if (!token) return;
    getCda(token).then(setCda).catch(() => { /* the page still functions if the CDA fails to load */ });
  }, [token]);

  const loadSignedCda = useCallback(() => {
    if (!token) return;
    getSignedCda(token).then(setSignedCda).catch(() => { /* the page still functions if this fails to load */ });
  }, [token]);

  const loadChecklist = useCallback(() => {
    if (!token) return;
    getChecklist(token).then(setChecklist).catch(() => { /* the page still functions if the checklist fails to load */ });
  }, [token]);

  useEffect(() => { loadCda(); loadSignedCda(); loadChecklist(); }, [loadCda, loadSignedCda, loadChecklist]);

  useEffect(() => {
    if (!token) return;
    loadBrokerTransactionInfo(token)
      .then((data) => {
        setFinalSalesPrice(data.broker?.finalSalesPrice ?? null);
        setGrossCommission(data.broker?.grossCommission ?? null);
        setBrokerPaymentAddress(data.broker?.brokerPaymentAddress ?? '');
        setBrokerCommissionType(data.broker?.brokerCommissionType ?? '');
        setBrokerCommissionValue(data.broker?.brokerCommissionValue !== null && data.broker?.brokerCommissionValue !== undefined ? String(data.broker.brokerCommissionValue) : '');
        setBrokerCommissionAmount(data.broker?.brokerCommissionAmount ?? null);
        setBuyerAgentCommissionAmount(data.broker?.buyerAgentCommissionAmount ?? null);
      })
      .catch(() => { /* the page still functions if prefill fails to load */ });
  }, [token]);

  async function handleSaveInfo() {
    setInfoError(null);
    setBrokerCommissionValueError(null);
    setInfoSaved(false);

    const errors = validateBrokerInfo({ brokerCommissionType, brokerCommissionValue });
    if (hasBrokerValidationError(errors)) {
      setBrokerCommissionValueError(errors.brokerCommissionValueError);
      return;
    }

    setInfoSaving(true);
    try {
      const body = await saveBrokerInfo(token, { brokerPaymentAddress, brokerCommissionType, brokerCommissionValue });
      setInfoSaved(true);
      setFinalSalesPrice(body.saved.broker.finalSalesPrice);
      setGrossCommission(body.saved.broker.grossCommission);
      setBrokerCommissionAmount(body.saved.broker.brokerCommissionAmount);
      setBuyerAgentCommissionAmount(body.saved.broker.buyerAgentCommissionAmount);
      loadCda();
    } catch (err) {
      setInfoError((err as Error).message);
    } finally {
      setInfoSaving(false);
    }
  }

  return (
    <UploadLinkLayout
      hasSidebar={checklist !== null && checklist.items.length > 0}
      sidebar={<ChecklistSidebar checklist={checklist} />}
      banner={checklist?.transactionCompleted ? <TransactionCompletedBanner /> : null}
    >
      <GeneratedCdaCard cda={cda} />

      {cda && (
        <SignCdaUploadCard
          token={token}
          submitted={checklist?.items.some((i) => i.formCode === 'signed_cda' && i.status === 'submitted') ?? false}
          onUploaded={() => { loadSignedCda(); loadChecklist(); }}
        />
      )}

      <GeneratedCdaCard cda={signedCda} title="Signed CDA" description="Your signed CDA has been received." />

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h1 className="text-base font-semibold text-gray-800">Hello {context.recipientName}</h1>
          <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
            <MapPin size={11} /> {context.propertyAddress}
          </p>
        </div>

        <div className="px-6 py-5 space-y-5">
          <div className="bg-gray-50 rounded-lg p-3 grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-gray-500">Final Sales Price</p>
              <p className="text-sm font-semibold text-gray-800">{formatCurrency(finalSalesPrice)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Gross Commission</p>
              <p className="text-sm font-semibold text-gray-800">{formatCurrency(grossCommission)}</p>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <Landmark size={12} /> Broker Commission
            </p>
            <input
              type="text"
              placeholder="Broker Payment Address"
              value={brokerPaymentAddress}
              onChange={(e) => setBrokerPaymentAddress(e.target.value)}
              className="w-full mb-2 px-3 py-2 border border-gray-200 rounded-lg text-sm placeholder:text-gray-400"
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <select
                value={brokerCommissionType}
                onChange={(e) => { setBrokerCommissionType(e.target.value as 'percentage' | 'flat_amount' | ''); setBrokerCommissionValueError(null); }}
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 bg-white"
              >
                <option value="">Commission Type — not set</option>
                <option value="percentage">Percentage</option>
                <option value="flat_amount">Flat Amount</option>
              </select>
              <div>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder={brokerCommissionType === 'flat_amount' ? 'Commission Amount ($) — e.g. 3000' : 'Commission Percentage — e.g. 10'}
                  value={brokerCommissionValue}
                  onChange={(e) => { setBrokerCommissionValue(e.target.value); setBrokerCommissionValueError(null); }}
                  className={`w-full px-3 py-2 border rounded-lg text-sm placeholder:text-gray-400 ${brokerCommissionValueError ? 'border-red-300' : 'border-gray-200'}`}
                />
                {brokerCommissionValueError && <p className="text-xs text-red-600 mt-1">{brokerCommissionValueError}</p>}
              </div>
            </div>

            {(brokerCommissionAmount !== null || buyerAgentCommissionAmount !== null) && (
              <div className="bg-gray-50 rounded-lg p-3 grid grid-cols-2 gap-3 mt-3">
                <div>
                  <p className="text-xs text-gray-500">Broker Commission</p>
                  <p className="text-sm font-semibold text-gray-800">{formatCurrency(brokerCommissionAmount)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Buyer Agent Commission</p>
                  <p className="text-sm font-semibold text-gray-800">{formatCurrency(buyerAgentCommissionAmount)}</p>
                </div>
              </div>
            )}
          </div>

          {infoError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2 text-sm text-red-700">
              <XCircle size={16} className="shrink-0" />
              {infoError}
            </div>
          )}

          {infoSaved && !infoError && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center gap-2 text-sm text-green-700">
              <CheckCircle size={16} className="shrink-0" />
              Broker information saved.
            </div>
          )}

          <button
            type="button"
            onClick={handleSaveInfo}
            disabled={infoSaving}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-700 hover:bg-blue-800 text-white text-sm font-medium rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {infoSaving ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : 'Save Information'}
          </button>
        </div>
      </div>
    </UploadLinkLayout>
  );
}
