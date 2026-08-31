'use client';

import { useEffect, useState } from 'react';
import { getEscrowNumber, saveEscrowNumber, getDeliveryPreference, saveDeliveryPreference } from './escrowUploadService';

/** The Escrow Officer's own escrow number field + "will you send documents to the Buyer?" yes/no — both persisted independently, each with its own save state. */
export default function EscrowForm({ token }: { token: string }) {
  const [escrowNumber, setEscrowNumber] = useState('');
  const [escrowNumberSaving, setEscrowNumberSaving] = useState(false);
  const [escrowNumberError, setEscrowNumberError] = useState<string | null>(null);

  const [willSendDocumentsToBuyer, setWillSendDocumentsToBuyer] = useState<boolean | null>(null);
  const [deliveryPrefSaving, setDeliveryPrefSaving] = useState(false);
  const [deliveryPrefError, setDeliveryPrefError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    getEscrowNumber(token).then((n) => setEscrowNumber(n ?? '')).catch(() => { /* the page still functions if this fails to load */ });
    getDeliveryPreference(token).then(setWillSendDocumentsToBuyer).catch(() => { /* the page still functions if this fails to load */ });
  }, [token]);

  async function handleSaveEscrowNumber() {
    setEscrowNumberSaving(true);
    setEscrowNumberError(null);
    try {
      const saved = await saveEscrowNumber(token, escrowNumber.trim() || null);
      setEscrowNumber(saved ?? '');
    } catch (err) {
      setEscrowNumberError((err as Error).message);
    } finally {
      setEscrowNumberSaving(false);
    }
  }

  async function handleSetWillSendDocumentsToBuyer(value: boolean) {
    setDeliveryPrefSaving(true);
    setDeliveryPrefError(null);
    try {
      const saved = await saveDeliveryPreference(token, value);
      setWillSendDocumentsToBuyer(saved);
    } catch (err) {
      setDeliveryPrefError((err as Error).message);
    } finally {
      setDeliveryPrefSaving(false);
    }
  }

  return (
    <>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4">
          <label htmlFor="escrow-number-input" className="text-sm text-gray-700 mb-1 block">Escrow Number</label>
          <p className="text-xs text-gray-500 mb-2">Enter the escrow/file number assigned to this transaction.</p>
          <div className="flex gap-2">
            <input
              id="escrow-number-input"
              type="text"
              value={escrowNumber}
              onChange={(e) => setEscrowNumber(e.target.value)}
              disabled={escrowNumberSaving}
              placeholder="e.g. 24-123456"
              className="flex-1 min-w-0 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            />
            <button
              type="button"
              onClick={handleSaveEscrowNumber}
              disabled={escrowNumberSaving || escrowNumber.trim() === ''}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-700 hover:bg-blue-800 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {escrowNumberSaving ? 'Saving…' : 'Save'}
            </button>
          </div>
          {escrowNumberError && <p className="text-xs text-red-600 mt-2">{escrowNumberError}</p>}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4">
          <p className="text-sm text-gray-700 mb-2">Is the Escrow Officer going to send documents to the Buyer?</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => handleSetWillSendDocumentsToBuyer(true)}
              disabled={deliveryPrefSaving}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium border transition-colors disabled:opacity-50 ${willSendDocumentsToBuyer === true ? 'bg-blue-700 border-blue-700 text-white' : 'border-gray-200 text-gray-600 hover:border-blue-300'}`}
            >
              Yes
            </button>
            <button
              type="button"
              onClick={() => handleSetWillSendDocumentsToBuyer(false)}
              disabled={deliveryPrefSaving}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium border transition-colors disabled:opacity-50 ${willSendDocumentsToBuyer === false ? 'bg-blue-700 border-blue-700 text-white' : 'border-gray-200 text-gray-600 hover:border-blue-300'}`}
            >
              No
            </button>
          </div>
          {deliveryPrefError && <p className="text-xs text-red-600 mt-2">{deliveryPrefError}</p>}
        </div>
      </div>
    </>
  );
}
