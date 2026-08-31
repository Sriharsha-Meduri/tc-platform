'use client';

import { FileText, Eye, Clock } from 'lucide-react';
import type { UploadedDocument, UploadedDocumentStatus } from './uploadLinkTypes';

const ROLE_LABELS: Record<string, string> = {
  buyer_agent: 'Buyer Agent',
  seller_agent: 'Seller Agent',
  buyer_transaction_coordinator: 'Buyer Transaction Coordinator',
  seller_transaction_coordinator: 'Seller Transaction Coordinator',
  escrow_officer: 'Escrow Officer',
  /** A document with no uploadLink — uploaded internally by the myTC/TC team, not through any secure upload link. */
  internal: 'Transaction Coordinator',
};

const STATUS_LABELS: Record<UploadedDocumentStatus, string> = {
  /** The document is fully stored (viewUrl works) whenever it isn't still analyzing or failed — 'uploaded' is just the case where analysisStatus wasn't 'completed' in the strict sense (e.g. a dedicated-category upload that skips analysis). Both read as "Saved" to the uploader; there's nothing further for them to do either way. */
  uploaded: 'Saved',
  analyzing: 'Analyzing',
  saved: 'Saved',
  analysis_failed: 'Analysis Failed',
};

function formatRole(role: string): string {
  return ROLE_LABELS[role] ?? role;
}

function formatFileSize(bytes: number | null): string {
  if (bytes === null) return '—';
  return `${(bytes / 1024).toFixed(0)} KB`;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString();
}

function StatusBadge({ status }: { status: UploadedDocumentStatus }) {
  const styles: Record<UploadedDocumentStatus, string> = {
    uploaded: 'bg-green-50 text-green-700',
    analyzing: 'bg-blue-50 text-blue-600',
    saved: 'bg-green-50 text-green-700',
    analysis_failed: 'bg-amber-50 text-amber-700',
  };
  return (
    <span className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${styles[status]}`}>
      {status === 'analyzing' && <Clock size={10} className="animate-pulse" />}
      {STATUS_LABELS[status]}
    </span>
  );
}

/** The document's identified form code (RPA, TDS, SPQ, …) as returned by Document Intelligence — the source of truth for this tag, never guessed from the filename. */
function FormCodeTag({ formCode }: { formCode: string }) {
  return (
    <span className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded border border-indigo-200 bg-indigo-50 text-indigo-700 text-[10px] font-bold uppercase tracking-wide">
      {formCode}
    </span>
  );
}

/** Marks the original file the user uploaded before Document Intelligence split it into per-form documents — driven by `isOriginalPackage` metadata, not filename guessing. */
function OriginalTag() {
  return (
    <span className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded border border-purple-200 bg-purple-50 text-purple-700 text-[10px] font-bold uppercase tracking-wide">
      Original
    </span>
  );
}

function DocumentRow({ doc }: { doc: UploadedDocument }) {
  return (
    <div className="px-6 py-3 flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <FileText size={12} className="text-gray-400 shrink-0" />
        <span className="flex-1 min-w-0 truncate text-sm text-gray-700">{doc.fileName}</span>
        {doc.formType && <FormCodeTag formCode={doc.formType} />}
        {doc.isOriginalPackage && <OriginalTag />}
        {doc.viewUrl && (
          <a
            href={doc.viewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium shrink-0"
          >
            <Eye size={12} /> View
          </a>
        )}
        <StatusBadge status={doc.status} />
      </div>
      <div className="flex items-center gap-3 pl-5 text-xs text-gray-400 flex-wrap">
        {!doc.formType && (
          <>
            <span>{doc.status === 'analyzing' ? 'Detecting form type…' : doc.category === 'hoa_document' ? 'HOA document' : 'Form type not identified'}</span>
            <span>·</span>
          </>
        )}
        <span>{formatRole(doc.recipientRole)}</span>
        <span>·</span>
        <span>{formatDateTime(doc.uploadedAt)}</span>
        <span>·</span>
        <span>{formatFileSize(doc.fileSizeBytes)}</span>
      </div>
      {doc.message && (
        <p className="pl-5 text-xs text-amber-600">{doc.message}</p>
      )}
    </div>
  );
}

/**
 * "Uploaded Documents" (persists across refresh) + a separate "HOA
 * Documents" grouping — used identically by the Buyer Agent, Seller Agent,
 * and Escrow Officer pages.
 */
export default function UploadedDocumentsSection({ documents }: { documents: UploadedDocument[] }) {
  return (
    <>
      {documents.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-800">Uploaded Documents</h2>
          </div>
          <div className="divide-y divide-gray-100">
            {documents.filter((d) => d.category !== 'hoa_document').map((doc) => (
              <DocumentRow key={doc.id} doc={doc} />
            ))}
          </div>
        </div>
      )}

      {documents.some((d) => d.category === 'hoa_document') && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-800">HOA Documents</h2>
          </div>
          <div className="divide-y divide-gray-100">
            {documents.filter((d) => d.category === 'hoa_document').map((doc) => (
              <DocumentRow key={doc.id} doc={doc} />
            ))}
          </div>
        </div>
      )}
    </>
  );
}
