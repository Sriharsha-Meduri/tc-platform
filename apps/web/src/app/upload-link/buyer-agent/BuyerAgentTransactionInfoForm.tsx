'use client';

import { useEffect, useState } from 'react';
import { CheckCircle, XCircle, Loader2, Landmark } from 'lucide-react';
import { loadBuyerAgentTransactionInfo, saveBuyerAgentInfo } from './buyerAgentUploadService';
import { validateBuyerAgentInfo, hasBuyerAgentValidationError } from './buyerAgentValidation';

/**
 * The Buyer Agent's "Transaction Information" card — Lender Information plus
 * the merged "Broker and Commission Information" section. Owns its own
 * fields/validation/save state; fetches its prefill data once on mount.
 * Saving a valid broker name + email auto-triggers the broker's welcome
 * email server-side (see BrokerOnboardingService) — the result is surfaced
 * here the same way the Seller Agent's escrow-email result is shown on
 * their own form.
 */
export default function BuyerAgentTransactionInfoForm({ token, onSaved }: { token: string; onSaved?: () => void }) {
  const [lenderName, setLenderName] = useState('');
  const [lenderEmail, setLenderEmail] = useState('');
  const [buyerSideBrokerageName, setBuyerSideBrokerageName] = useState('');
  const [buyerSideBrokerFullName, setBuyerSideBrokerFullName] = useState('');
  const [buyerSideBrokerEmail, setBuyerSideBrokerEmail] = useState('');
  const [buyerAgentPaymentAddress, setBuyerAgentPaymentAddress] = useState('');
  const [clientCredits, setClientCredits] = useState('');
  const [buyerCommissionType, setBuyerCommissionType] = useState<'percentage' | 'flat_amount' | ''>('');
  const [buyerCommissionValue, setBuyerCommissionValue] = useState('');
  const [grossCommission, setGrossCommission] = useState<number | null>(null);

  const [infoSaving, setInfoSaving] = useState(false);
  const [infoSaved, setInfoSaved] = useState(false);
  const [infoError, setInfoError] = useState<string | null>(null);
  const [lenderEmailError, setLenderEmailError] = useState<string | null>(null);
  const [buyerSideBrokerEmailError, setBuyerSideBrokerEmailError] = useState<string | null>(null);
  const [clientCreditsError, setClientCreditsError] = useState<string | null>(null);
  const [buyerCommissionValueError, setBuyerCommissionValueError] = useState<string | null>(null);
  const [brokerEmailResult, setBrokerEmailResult] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    loadBuyerAgentTransactionInfo(token)
      .then((data) => {
        setLenderName(data.lender.lenderName ?? '');
        setLenderEmail(data.lender.lenderEmail ?? '');
        setBuyerSideBrokerageName(data.buyerSide.brokerageName ?? '');
        setBuyerSideBrokerFullName(data.buyerSide.brokerFullName ?? '');
        setBuyerSideBrokerEmail(data.buyerSide.brokerEmail ?? '');
        setBuyerAgentPaymentAddress(data.buyerSide.buyerAgentPaymentAddress ?? '');
        setClientCredits(data.buyerSide.clientCredits !== null ? String(data.buyerSide.clientCredits) : '');
        setBuyerCommissionType(data.buyerSide.buyerCommissionType ?? '');
        setBuyerCommissionValue(data.buyerSide.buyerCommissionValue !== null ? String(data.buyerSide.buyerCommissionValue) : '');
        setGrossCommission(data.buyerSide.grossCommission);
      })
      .catch(() => { /* the page still functions if prefill fails to load */ });
  }, [token]);

  async function handleSaveInfo() {
    setInfoError(null);
    setLenderEmailError(null);
    setBuyerSideBrokerEmailError(null);
    setClientCreditsError(null);
    setBuyerCommissionValueError(null);
    setInfoSaved(false);

    const errors = validateBuyerAgentInfo({ lenderEmail, buyerSideBrokerEmail, clientCredits, buyerCommissionType, buyerCommissionValue });
    if (hasBuyerAgentValidationError(errors)) {
      setLenderEmailError(errors.lenderEmailError);
      setBuyerSideBrokerEmailError(errors.buyerSideBrokerEmailError);
      setClientCreditsError(errors.clientCreditsError);
      setBuyerCommissionValueError(errors.buyerCommissionValueError);
      return;
    }

    setInfoSaving(true);
    try {
      const body = await saveBuyerAgentInfo(token, {
        lenderName, lenderEmail, buyerSideBrokerageName, buyerSideBrokerFullName,
        buyerSideBrokerEmail, buyerAgentPaymentAddress, clientCredits,
        buyerCommissionType, buyerCommissionValue,
      });
      setInfoSaved(true);
      setGrossCommission(body.saved.buyerSide.grossCommission);
      onSaved?.();

      if (body.brokerWelcomeEmail?.alreadySent) {
        setBrokerEmailResult(`Already sent to ${body.brokerWelcomeEmail.brokerEmail}.`);
      } else if (body.brokerWelcomeEmail?.sent) {
        setBrokerEmailResult(`Broker welcome email sent to ${body.brokerWelcomeEmail.brokerEmail}.`);
      }
    } catch (err) {
      setInfoError((err as Error).message);
    } finally {
      setInfoSaving(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-800">Transaction Information</h2>
        <p className="text-xs text-gray-500 mt-0.5">Add or update any information you have available. You can save partial information and come back later.</p>
      </div>
      <div className="px-6 py-5 space-y-5">
        {/* Lender */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <Landmark size={12} /> Lender Information
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input
              type="text"
              placeholder="Lender or loan officer name"
              value={lenderName}
              onChange={(e) => setLenderName(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm placeholder:text-gray-400"
            />
            <div>
              <input
                type="email"
                placeholder="Lender email address"
                value={lenderEmail}
                onChange={(e) => { setLenderEmail(e.target.value); setLenderEmailError(null); }}
                className={`w-full px-3 py-2 border rounded-lg text-sm placeholder:text-gray-400 ${lenderEmailError ? 'border-red-300' : 'border-gray-200'}`}
              />
              {lenderEmailError && <p className="text-xs text-red-600 mt-1">{lenderEmailError}</p>}
            </div>
          </div>
        </div>

        {/* Buyer Broker Commission Information — a single merged section (previously two separate sections). */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <Landmark size={12} /> Broker and Commission Information
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
            <input
              type="text"
              placeholder="Brokerage Name"
              value={buyerSideBrokerageName}
              onChange={(e) => setBuyerSideBrokerageName(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm placeholder:text-gray-400"
            />
            <input
              type="text"
              placeholder="Broker Name"
              value={buyerSideBrokerFullName}
              onChange={(e) => setBuyerSideBrokerFullName(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm placeholder:text-gray-400"
            />
          </div>
          <div className="mb-2">
            <input
              type="email"
              placeholder="Broker Email Address"
              value={buyerSideBrokerEmail}
              onChange={(e) => { setBuyerSideBrokerEmail(e.target.value); setBuyerSideBrokerEmailError(null); }}
              className={`w-full px-3 py-2 border rounded-lg text-sm placeholder:text-gray-400 ${buyerSideBrokerEmailError ? 'border-red-300' : 'border-gray-200'}`}
            />
            {buyerSideBrokerEmailError && <p className="text-xs text-red-600 mt-1">{buyerSideBrokerEmailError}</p>}
          </div>
          <input
            type="text"
            placeholder="Buyer Agent Payment Address"
            value={buyerAgentPaymentAddress}
            onChange={(e) => setBuyerAgentPaymentAddress(e.target.value)}
            className="w-full mb-2 px-3 py-2 border border-gray-200 rounded-lg text-sm placeholder:text-gray-400"
          />
          <div>
            <input
              type="text"
              inputMode="decimal"
              placeholder="Buyer Credit(s) ($) — e.g. 0, 500, 500.00"
              value={clientCredits}
              onChange={(e) => { setClientCredits(e.target.value); setClientCreditsError(null); }}
              className={`w-full px-3 py-2 border rounded-lg text-sm placeholder:text-gray-400 ${clientCreditsError ? 'border-red-300' : 'border-gray-200'}`}
            />
            {clientCreditsError && <p className="text-xs text-red-600 mt-1">{clientCreditsError}</p>}
          </div>

          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
            <select
              value={buyerCommissionType}
              onChange={(e) => {
                setBuyerCommissionType(e.target.value as 'percentage' | 'flat_amount' | '');
                setBuyerCommissionValueError(null);
              }}
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
                placeholder={buyerCommissionType === 'flat_amount' ? 'Commission Amount ($) — e.g. 12000' : 'Commission Percentage — e.g. 3'}
                value={buyerCommissionValue}
                onChange={(e) => { setBuyerCommissionValue(e.target.value); setBuyerCommissionValueError(null); }}
                className={`w-full px-3 py-2 border rounded-lg text-sm placeholder:text-gray-400 ${buyerCommissionValueError ? 'border-red-300' : 'border-gray-200'}`}
              />
              {buyerCommissionValueError && <p className="text-xs text-red-600 mt-1">{buyerCommissionValueError}</p>}
            </div>
          </div>
          {grossCommission !== null && (
            <p className="text-sm text-gray-700 mt-2">
              Gross Commission: <span className="font-semibold">{grossCommission.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</span>
            </p>
          )}

          {brokerEmailResult && (
            <p className="text-xs text-gray-600 mt-2">{brokerEmailResult}</p>
          )}
          <p className="text-xs text-gray-400 mt-2">
            Once you save a valid broker name and email, a secure link is sent to the broker automatically.
          </p>
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
            Transaction information saved.
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
  );
}
