import { Clock } from 'lucide-react';

/**
 * Shown at the top of the Buyer Agent upload-link page whenever the Seller
 * Agent's own required-document checklist isn't fully submitted yet — the
 * cross-side counterpart to the Seller Agent page's own DocusignPendingBanner.
 * Backed by the Seller Agent's own `allRequiredSubmitted` (see
 * ChecklistCompositionService.getSellerAgentStatusSummary), the exact same
 * value the Seller Agent Upload Link and the transaction swimlane compute —
 * a document merely being uploaded is never enough on its own, only a
 * matched, analyzed, blocker-free 'submitted' item counts.
 */
export default function SellerStatusPendingBanner() {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
      <Clock className="h-5 w-5 shrink-0 text-amber-600" />
      Documents will be sent via DocuSign by the Seller Agent once all required seller documents have been submitted.
    </div>
  );
}
