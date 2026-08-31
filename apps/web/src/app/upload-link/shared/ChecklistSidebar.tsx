'use client';

import { Send } from 'lucide-react';
import ChecklistItemRow, { UnmatchedDocumentRow } from './ChecklistItemRow';
import type { DocumentChecklistStatus } from './checklist.types';

/**
 * The document checklist sidebar — Buyer Agent, Seller Agent, and Escrow
 * Officer links. Required transaction documents on top — CAR-forms items
 * matched by detected form code (generated from whichever CAR-form template
 * resolves for the transaction, and — for the Seller Agent — scoped strictly
 * to that one link's own uploads), Escrow's dedicated document types matched
 * by document type — with a checkmark once a matching document is on file;
 * anything else uploaded but unmatched below. `onOpenDocusignSend` is only
 * ever wired up by the Seller Agent page (the one centralized "Send via
 * DocuSign" action, opening a multi-select panel — see
 * SendDocumentsViaDocuSignModal) — every other purpose renders this with it
 * omitted, which is behaviorally identical since their checklist items never
 * carry a `docusign` field.
 */
export default function ChecklistSidebar({ checklist, onOpenDocusignSend }: {
  checklist: DocumentChecklistStatus | null;
  onOpenDocusignSend?: () => void;
}) {
  if (!checklist) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-800">Document Checklist</h2>
        {checklist.requiredCount > 0 && (
          <span className="text-xs font-medium text-gray-500 shrink-0">{checklist.submittedCount}/{checklist.requiredCount} submitted</span>
        )}
      </div>

      {onOpenDocusignSend && (
        <div className="px-5 py-2.5 border-b border-gray-100 flex justify-end">
          <button
            type="button"
            onClick={onOpenDocusignSend}
            className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg bg-blue-700 text-white hover:bg-blue-800"
          >
            <Send size={12} />
            Send via DocuSign
          </button>
        </div>
      )}

      {checklist.items.length === 0 ? (
        <p className="px-5 py-4 text-xs text-gray-400">No document checklist is configured for this transaction.</p>
      ) : (
        <div className="divide-y divide-gray-100">
          {checklist.items.map((item) => (
            <ChecklistItemRow key={item.contingencyType ?? item.formCode} item={item} />
          ))}
        </div>
      )}

      {checklist.optionalItems.length > 0 && (
        <div className="border-t border-gray-100">
          <p className="px-5 pt-3 pb-1 text-xs font-semibold text-gray-500 uppercase tracking-wide">Optional Forms</p>
          <div className="divide-y divide-gray-100">
            {checklist.optionalItems.map((item) => (
              <ChecklistItemRow key={item.formCode} item={item} isOptional />
            ))}
          </div>
        </div>
      )}

      {checklist.unmatchedDocuments.length > 0 && (
        <div className="border-t border-gray-100">
          <p className="px-5 pt-3 pb-1 text-xs font-semibold text-gray-500 uppercase tracking-wide">Additionally Uploaded Documents</p>
          <div className="divide-y divide-gray-100">
            {checklist.unmatchedDocuments.map((doc) => (
              <UnmatchedDocumentRow key={doc.id} doc={doc} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
