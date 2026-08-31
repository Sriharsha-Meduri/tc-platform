import { AlertTriangle } from 'lucide-react';

/**
 * Shown at the top of the Seller Agent upload-link page whenever the
 * checklist's own `allRequiredSubmitted` is false — the single source of
 * truth for "required" also used to gate the checklist sidebar and the
 * per-document DocuSign eligibility (see SellerAgentDocumentDocusignService).
 * A document merely being uploaded is never enough on its own: a required
 * item only counts once it's matched, analyzed, and free of blocking
 * validation failures (status 'submitted', not 'required'/'analyzing'/
 * 'reupload_required') — exactly what `allRequiredSubmitted` already
 * encodes, so this banner never needs its own separate readiness check.
 */
export default function DocusignPendingBanner() {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
      <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
      Documents will not be sent via DocuSign until all required documents have been submitted.
    </div>
  );
}
