'use client';

import { useEffect, useState } from 'react';
import { CheckCircle, XCircle, Loader2, FileSignature, Home } from 'lucide-react';
import { loadSellerAgentTransactionInfo, saveSellerAgentInfo, getEscrowEmailStatus } from './sellerAgentUploadService';
import { validateSellerAgentInfo, hasSellerAgentValidationError } from './sellerAgentValidation';

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString();
}

/**
 * The Seller Agent's "Escrow Information" card — escrow contact + HOA
 * yes/no. Owns its own fields/validation/save state; fetches its prefill
 * data once on mount. Saving a valid escrow name + email auto-triggers the
 * Escrow Officer's welcome email server-side — the escrow-welcome-email
 * status is a readout only (no manual send/confirm step here).
 */
export default function SellerAgentEscrowInfoForm({ token }: { token: string }) {
  const [escrowContactName, setEscrowContactName] = useState('');
  const [escrowEmail, setEscrowEmail] = useState('');
  const [hasHoa, setHasHoa] = useState<boolean | null>(null);

  const [infoSaving, setInfoSaving] = useState(false);
  const [infoSaved, setInfoSaved] = useState(false);
  const [infoError, setInfoError] = useState<string | null>(null);
  const [escrowEmailError, setEscrowEmailError] = useState<string | null>(null);

  const [escrowEmailStatus, setEscrowEmailStatus] = useState<{ sentAt: string | null; sentTo: string | null } | null>(null);
  const [escrowEmailResult, setEscrowEmailResult] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    loadSellerAgentTransactionInfo(token)
      .then((data) => {
        setEscrowContactName(data.escrow.escrowContactName ?? '');
        setEscrowEmail(data.escrow.escrowEmail ?? '');
        setHasHoa(data.hoa.hasHoa);
      })
      .catch(() => { /* the page still functions if prefill fails to load */ });
    getEscrowEmailStatus(token).then(setEscrowEmailStatus).catch(() => { /* the page still functions if this status fails to load */ });
  }, [token]);

  async function handleSaveInfo() {
    setInfoError(null);
    setEscrowEmailError(null);
    setInfoSaved(false);

    const errors = validateSellerAgentInfo(escrowEmail);
    if (hasSellerAgentValidationError(errors)) {
      setEscrowEmailError(errors.escrowEmailError);
      return;
    }

    setInfoSaving(true);
    try {
      const body = await saveSellerAgentInfo(token, { escrowContactName, escrowEmail, hasHoa });
      setInfoSaved(true);

      if (body.escrowWelcomeEmail?.alreadySent) {
        setEscrowEmailResult(`Already sent to ${body.escrowWelcomeEmail.escrowEmail}.`);
      } else if (body.escrowWelcomeEmail?.sent) {
        setEscrowEmailResult(`Escrow welcome email sent to ${body.escrowWelcomeEmail.escrowEmail}.`);
      }
      getEscrowEmailStatus(token).then(setEscrowEmailStatus).catch(() => { /* the page still functions if this status fails to load */ });
    } catch (err) {
      setInfoError((err as Error).message);
    } finally {
      setInfoSaving(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-800">Escrow Information</h2>
        <p className="text-xs text-gray-500 mt-0.5">Add or update any information you have available. You can save partial information and come back later.</p>
      </div>
      <div className="px-6 py-5 space-y-5">
        {/* Escrow */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <FileSignature size={12} /> Escrow Information
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input
              type="text"
              placeholder="Escrow company or officer name"
              value={escrowContactName}
              onChange={(e) => setEscrowContactName(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm placeholder:text-gray-400"
            />
            <div>
              <input
                type="email"
                placeholder="Escrow officer email address"
                value={escrowEmail}
                onChange={(e) => { setEscrowEmail(e.target.value); setEscrowEmailError(null); }}
                className={`w-full px-3 py-2 border rounded-lg text-sm placeholder:text-gray-400 ${escrowEmailError ? 'border-red-300' : 'border-gray-200'}`}
              />
              {escrowEmailError && <p className="text-xs text-red-600 mt-1">{escrowEmailError}</p>}
            </div>
          </div>

          {escrowEmailStatus?.sentAt && (
            <p className="text-xs text-blue-600 mt-2">
              Welcome email sent to {escrowEmailStatus.sentTo} on {formatDateTime(escrowEmailStatus.sentAt)}.
            </p>
          )}
          {escrowEmailResult && (
            <p className="text-xs text-blue-600 mt-2">{escrowEmailResult}</p>
          )}
          <p className="text-xs text-blue-600 mt-2">
            Once you save a valid escrow officer name and email, the Escrow Welcome Email and secure upload link are sent automatically.
          </p>
        </div>

        {/* HOA */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <Home size={12} /> HOA
          </p>
          <p className="text-sm text-gray-700 mb-2">Are HOA documents required for this property?</p>
          <div className="flex gap-2 mb-3">
            <button
              type="button"
              onClick={() => setHasHoa(true)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium border transition-colors ${hasHoa === true ? 'bg-blue-700 border-blue-700 text-white' : 'border-gray-200 text-gray-600 hover:border-blue-300'}`}
            >
              Yes
            </button>
            <button
              type="button"
              onClick={() => setHasHoa(false)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium border transition-colors ${hasHoa === false ? 'bg-blue-700 border-blue-700 text-white' : 'border-gray-200 text-gray-600 hover:border-blue-300'}`}
            >
              No
            </button>
          </div>
          {hasHoa === true && (
            <p className="text-xs text-gray-500">
              The Escrow Officer will collect the HOA documents for this transaction — no upload is needed here.
            </p>
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
