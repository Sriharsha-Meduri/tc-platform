'use client';

import { useState } from 'react';
import { XCircle, Loader2, Send } from 'lucide-react';
import type { ChecklistItemDto, DocumentChecklistStatus, SellerAgentDocumentDocusignDto } from '../shared/checklist.types';

/** Envelope statuses that block re-selecting a document — anything other than a prior declined/voided/failed attempt means it's already in flight or done. */
const BLOCKING_ENVELOPE_STATUSES = new Set(['created', 'sent', 'delivered', 'completed']);

export interface SelectableDocusignDocument {
  documentId: string;
  label: string;
  formCode: string | null;
  group: 'required' | 'optional' | 'additional';
  docusign: SellerAgentDocumentDocusignDto;
}

/** Whether a document can be selected at all — ineligible per Document Intelligence, or already has a blocking (non-terminal-negative) envelope. */
function isSelectable(docusign: SellerAgentDocumentDocusignDto): boolean {
  if (!docusign.eligible) return false;
  if (docusign.envelope && BLOCKING_ENVELOPE_STATUSES.has(docusign.envelope.status)) return false;
  return true;
}

/**
 * Flattens the checklist's three document sources (required items, optional
 * items, additionally-uploaded/unmatched documents) into one list for the
 * multi-select panel — only documents that actually carry a `docusign` field
 * (Seller Agent-enriched, i.e. matched to a real uploaded document) are
 * candidates at all; a still-empty required slot has nothing to send yet.
 */
export function buildSelectableDocuments(checklist: DocumentChecklistStatus): SelectableDocusignDocument[] {
  const fromItems = (items: ChecklistItemDto[], group: 'required' | 'optional'): SelectableDocusignDocument[] =>
    items
      .filter((item) => item.matchedDocument && item.docusign)
      .map((item) => ({
        documentId: item.matchedDocument!.id,
        label: item.formName,
        formCode: item.matchedDocument!.formType ?? item.formCode,
        group,
        docusign: item.docusign!,
      }));

  const fromUnmatched: SelectableDocusignDocument[] = checklist.unmatchedDocuments
    .filter((doc) => doc.docusign)
    .map((doc) => ({
      documentId: doc.id,
      label: doc.fileName ?? 'Document',
      formCode: doc.formType,
      group: 'additional' as const,
      docusign: doc.docusign!,
    }));

  return [...fromItems(checklist.items, 'required'), ...fromItems(checklist.optionalItems, 'optional'), ...fromUnmatched];
}

/** A document is preselected only when it's selectable AND has never been sent before — a prior declined/voided/failed attempt is selectable but requires the Seller Agent to opt back in deliberately. */
function defaultSelection(docs: SelectableDocusignDocument[]): Set<string> {
  return new Set(docs.filter((d) => isSelectable(d.docusign) && !d.docusign.envelope).map((d) => d.documentId));
}

const GROUP_LABELS: Record<SelectableDocusignDocument['group'], string> = {
  required: 'Required',
  optional: 'Optional',
  additional: 'Additional',
};

function statusLabel(docusign: SellerAgentDocumentDocusignDto): string | null {
  if (docusign.envelope) {
    return docusign.envelope.status.charAt(0).toUpperCase() + docusign.envelope.status.slice(1).replace('_', ' ');
  }
  if (!docusign.eligible) return docusign.ineligibleReason ?? 'Not eligible';
  return null;
}

/**
 * The centralized "Send via DocuSign" panel — replaces the old one-button-
 * per-document UI. Lists every document Document Intelligence has attached
 * DocuSign eligibility info to, preselects required-and-ready-to-sign ones,
 * and lets the Seller Agent adjust the selection (including opting a
 * previously-declined document back in) before sending everything in one
 * combined envelope.
 */
export default function SendDocumentsViaDocuSignModal({ checklist, sending, error, onConfirm, onCancel }: {
  checklist: DocumentChecklistStatus;
  sending: boolean;
  error: string | null;
  onConfirm: (documentIds: string[]) => void;
  onCancel: () => void;
}) {
  const documents = buildSelectableDocuments(checklist);
  const [selected, setSelected] = useState<Set<string>>(() => defaultSelection(documents));

  function toggle(documentId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(documentId)) next.delete(documentId);
      else next.add(documentId);
      return next;
    });
  }

  const selectedCount = selected.size;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
          <Send size={14} className="text-gray-400" />
          <h2 className="text-sm font-semibold text-gray-800">Send via DocuSign</h2>
        </div>

        <div className="px-6 py-5 space-y-3 max-h-[60vh] overflow-y-auto">
          {documents.length === 0 ? (
            <p className="text-xs text-gray-400">No documents are available to send yet.</p>
          ) : (
            documents.map((doc) => {
              const selectable = isSelectable(doc.docusign);
              const status = statusLabel(doc.docusign);
              return (
                <label
                  key={doc.documentId}
                  className={`flex items-start gap-2.5 px-3 py-2 rounded-lg border ${selectable ? 'border-gray-200 cursor-pointer hover:bg-gray-50' : 'border-gray-100 bg-gray-50 opacity-60 cursor-not-allowed'}`}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(doc.documentId)}
                    disabled={!selectable}
                    onChange={() => toggle(doc.documentId)}
                    className="mt-0.5 shrink-0"
                  />
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm text-gray-700 truncate">{doc.label}</span>
                      {doc.formCode && <span className="shrink-0 font-mono text-[10px] font-medium text-gray-400">[{doc.formCode}]</span>}
                      <span className="shrink-0 text-[11px] font-medium text-gray-400">{GROUP_LABELS[doc.group]}</span>
                    </span>
                    {status && <span className="block text-xs text-gray-500 mt-0.5">{status}</span>}
                  </span>
                </label>
              );
            })
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 space-y-3">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2 text-sm text-red-700">
              <XCircle size={16} className="shrink-0" />
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={sending}
              className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-800 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => onConfirm(Array.from(selected))}
              disabled={sending || selectedCount === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-700 hover:bg-blue-800 text-white text-xs font-medium rounded-lg disabled:opacity-50"
            >
              {sending && <Loader2 size={12} className="animate-spin" />}
              {sending ? 'Sending…' : `Send Selected via DocuSign (${selectedCount})`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
