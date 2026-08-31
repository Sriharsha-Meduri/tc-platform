'use client';

import { Clock } from 'lucide-react';
import { StepCard, StepCardHeader, StepCardBody, FinalTermRow } from '../review-shared';
import type { ExtractionResult } from '../../../extraction-result.types';
import type { FinalNegotiatedTerms, FinalTermKey } from '@tc/shared';

function formatSchedule(items: string[]): string {
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

/** Always shown, even when N/A, so the section never silently omits a primary contingency. */
const PRIMARY_KEYS: FinalTermKey[] = ['disclosuresDue', 'inspection', 'appraisal', 'loan'];
/** Shown only when the resolver actually found a value for the transaction — avoids a wall of "—" rows. */
const SECONDARY_KEYS: FinalTermKey[] = ['insurance', 'sellerDocumentReview', 'titleReview', 'hoaReview', 'emdInitialDeposit'];

export function Step3Contingencies({
  result,
  reminderSchedule,
  finalTerms,
  docViewUrl,
}: {
  result: ExtractionResult;
  reminderSchedule: string[] | null;
  /** The server-resolved Final Negotiated Terms — the single source of truth for every contingency/disclosures/EMD deadline shown anywhere. Never fall back to raw extracted values when this is present. */
  finalTerms?: FinalNegotiatedTerms | null;
  docViewUrl?: (documentId: string) => string | null;
}) {
  const contractTerms = result.contractTerms;
  const termsByKey = new Map((finalTerms?.terms ?? []).map((t) => [t.key, t]));
  const secondaryTerms = SECONDARY_KEYS.map((k) => termsByKey.get(k)).filter((t) => t && t.status !== 'N/A');

  return (
    <StepCard>
      <StepCardHeader
        title="Contingencies & Deadlines"
        description="Deadlines reflect the final negotiated terms (including any counter-offers) and are calculated from the acceptance date. These dates are stored as transaction events and used to send reminder emails."
      />

      <StepCardBody>
        {!finalTerms?.acceptanceDate && (
          <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
            Acceptance date not found — deadline dates cannot be calculated. Verify the contract and re-upload if needed.
          </p>
        )}

        <div className="space-y-2">
          {finalTerms
            ? PRIMARY_KEYS.map((key) => {
                const term = termsByKey.get(key);
                return term ? <FinalTermRow key={key} term={term} docViewUrl={docViewUrl} /> : null;
              })
            : (
              <p className="text-xs text-gray-400 italic py-2">
                Final negotiated terms are still being resolved…
              </p>
            )}
          {secondaryTerms.map((term) => (
            <FinalTermRow key={term!.key} term={term!} docViewUrl={docViewUrl} />
          ))}
        </div>

        {contractTerms?.otherDeadlines && contractTerms.otherDeadlines.length > 0 && (
          <div className="mt-6 space-y-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Other deadlines</p>
            {contractTerms.otherDeadlines.map((d, i) => (
              <div key={i} className="flex items-center justify-between py-2.5 px-3 bg-gray-50 border border-gray-200 rounded-lg">
                <span className="text-sm text-gray-700">{d.label}</span>
                <span className="text-sm font-medium text-gray-900">{d.value ?? '—'}</span>
              </div>
            ))}
          </div>
        )}

        {contractTerms?.otherTermsText && (
          <div className="mt-6">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Other Terms</p>
            <div className="py-2.5 px-3 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700 whitespace-pre-wrap">
              {contractTerms.otherTermsText}
            </div>
          </div>
        )}

        <div className="mt-5 flex items-start gap-2 p-3 bg-blue-50 border border-blue-100 rounded-lg">
          <Clock size={13} className="text-blue-500 mt-0.5 shrink-0" />
          <p className="text-xs text-blue-700">
            After you submit on the final step, reminder emails will be automatically scheduled{' '}
            {reminderSchedule
              ? formatSchedule(reminderSchedule)
              : '7 days, 3 days, and day-of'}{' '}
            before each deadline.
          </p>
        </div>
      </StepCardBody>
    </StepCard>
  );
}
