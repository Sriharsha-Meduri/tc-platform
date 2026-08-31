import { CheckCircle2 } from 'lucide-react';

/**
 * Shown at the top of every upload-link page once TransactionCompletionService
 * reports the transaction as fully done — every purpose's checklist submitted,
 * every DocuSign signature resolved, and (buyer-side) the signed CDA on file.
 * Same `transactionCompleted` source for every audience, so this renders
 * identically everywhere it appears.
 */
export default function TransactionCompletedBanner() {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-800">
      <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" />
      Transaction has finished.
    </div>
  );
}
