'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Play, Calendar, CheckSquare, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const OPTIONAL_STEPS = [
  { key: 'pest_inspection', label: 'Pest Inspection' },
  { key: 'request_for_repair', label: 'Request for Repair (RRR)' },
  { key: 'seller_rrr_response', label: 'Seller RRR Response' },
];

interface Props {
  transactionId: string;
  offerAcceptedAt: string | null;
}

export default function InitWorkflowPanel({ transactionId, offerAcceptedAt }: Props) {
  const router = useRouter();
  const [selectedSteps, setSelectedSteps] = useState<string[]>(['pest_inspection', 'request_for_repair', 'seller_rrr_response']);
  const [offerDate, setOfferDate] = useState(
    offerAcceptedAt ? offerAcceptedAt.slice(0, 10) : '',
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isVoiding, setIsVoiding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleStep(key: string) {
    setSelectedSteps((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  }

  async function handleVoid() {
    if (!confirm('Void this draft transaction? This cannot be undone.')) return;
    setIsVoiding(true);
    setError(null);

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
      const res = await fetch(`${apiUrl}/api/v1/transactions/${transactionId}/void`, {
        method: 'PATCH',
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { message?: string }).message ?? `Error ${res.status}`);
      }

      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to void transaction');
      setIsVoiding(false);
    }
  }

  async function handleInitWorkflow() {
    setIsSubmitting(true);
    setError(null);

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
      const body: Record<string, unknown> = { optionalStepKeys: selectedSteps };
      if (offerDate) body.offerAcceptedAt = offerDate;

      const res = await fetch(`${apiUrl}/api/v1/transactions/${transactionId}/init-workflow`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { message?: string }).message ?? `Error ${res.status}`);
      }

      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to initialize workflow');
      setIsSubmitting(false);
    }
  }

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-amber-900">Draft Transaction</h2>
        <p className="text-xs text-amber-700 mt-0.5">
          The transaction has been created from the uploaded contract. Initialize the workflow to
          activate it and begin communicating with all parties.
        </p>
      </div>

      {/* Offer accepted date */}
      <div className="space-y-1">
        <label className="flex items-center gap-1.5 text-xs font-medium text-amber-800">
          <Calendar size={13} />
          Offer accepted date
        </label>
        <input
          type="date"
          value={offerDate}
          onChange={(e) => setOfferDate(e.target.value)}
          className="block w-48 px-3 py-1.5 text-sm border border-amber-300 rounded-lg bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-amber-400"
        />
        <p className="text-xs text-amber-600">Used to calculate contingency due dates.</p>
      </div>

      {/* Optional steps */}
      <div className="space-y-1.5">
        <p className="flex items-center gap-1.5 text-xs font-medium text-amber-800">
          <CheckSquare size={13} />
          Optional workflow steps to include
        </p>
        <div className="space-y-1">
          {OPTIONAL_STEPS.map(({ key, label }) => (
            <label key={key} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={selectedSteps.includes(key)}
                onChange={() => toggleStep(key)}
                className="rounded border-amber-300 text-amber-600 focus:ring-amber-400"
              />
              <span className="text-sm text-amber-900">{label}</span>
            </label>
          ))}
        </div>
      </div>

      {error && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleInitWorkflow}
          disabled={isSubmitting || isVoiding}
          className={cn(
            'flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg transition-colors',
            'disabled:opacity-40 disabled:cursor-not-allowed',
          )}
        >
          {isSubmitting ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              Initializing workflow…
            </>
          ) : (
            <>
              <Play size={14} />
              Initialize Workflow
            </>
          )}
        </button>

        <button
          type="button"
          onClick={handleVoid}
          disabled={isSubmitting || isVoiding}
          className={cn(
            'flex items-center gap-2 px-4 py-2 bg-white hover:bg-red-50 text-red-600 border border-red-300 text-sm font-medium rounded-lg transition-colors',
            'disabled:opacity-40 disabled:cursor-not-allowed',
          )}
        >
          {isVoiding ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              Voiding…
            </>
          ) : (
            <>
              <Trash2 size={14} />
              Void Draft
            </>
          )}
        </button>
      </div>
    </div>
  );
}
