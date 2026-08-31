'use client';

import { FileText, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';

export type DocumentSource = 'document_upload' | 'seller_agent_document_upload' | 'escrow_officer_document_upload' | 'broker_document_upload' | 'internal';

export interface WorkspaceDocument {
  id: string;
  fileName: string | null;
  documentTag: string | null;
  uploadedByName: string | null;
  uploadedByRole: string | null;
  source: DocumentSource;
  uploadedAt: string;
  analysisStatus: string | null;
  viewUrl: string;
  status: string;
  signed: boolean;
  docusignEnvelopeId: string | null;
  signedAt: string | null;
  versionNo: number;
  /** This document's compliance outcome — additive, not yet rendered here. */
  validationStatus?: 'passed' | 'blocked' | 'overridden' | null;
}

const SOURCE_LABELS: Record<DocumentSource, string> = {
  document_upload: 'Buyer Agent Upload Link',
  seller_agent_document_upload: 'Seller Agent Upload Link',
  escrow_officer_document_upload: 'Escrow Officer Upload Link',
  broker_document_upload: 'Broker Upload Link',
  internal: 'Internal Upload',
};

const ROLE_LABELS: Record<string, string> = {
  buyer_agent: 'Buyer Agent',
  seller_agent: 'Seller Agent',
  buyer_transaction_coordinator: 'Buyer TC',
  seller_transaction_coordinator: 'Seller TC',
  escrow_officer: 'Escrow Officer',
  lender: 'Lender',
  loan_officer: 'Loan Officer',
};

function formatRole(role: string | null): string | null {
  if (!role) return null;
  return ROLE_LABELS[role] ?? role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString();
}

function SignedBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
      <CheckCircle2 size={9} /> Signed
    </span>
  );
}

function AnalysisStatusBadge({ status }: { status: string | null }) {
  if (status === 'analyzing') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600">
        <Loader2 size={9} className="animate-spin" /> Analyzing
      </span>
    );
  }
  if (status === 'failed') {
    return <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-red-50 text-red-600">Analysis Failed</span>;
  }
  if (status === 'completed') {
    return <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-green-50 text-green-600">Analyzed</span>;
  }
  return <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">Not Analyzed</span>;
}

/** Reusable document table — used by the Documents section directly, and by each side's Details tab for its own link-scoped subset. */
export default function DocumentList({
  documents, loading, error, emptyMessage,
}: {
  documents: WorkspaceDocument[] | null;
  loading: boolean;
  error: string | null;
  emptyMessage?: string;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 text-gray-400">
        <Loader2 size={18} className="animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2.5">
        <AlertCircle size={14} className="shrink-0" /> {error}
      </div>
    );
  }

  if (!documents || documents.length === 0) {
    return <p className="text-sm text-gray-400 text-center py-8">{emptyMessage ?? 'No documents yet.'}</p>;
  }

  return (
    <div className="divide-y divide-gray-100">
      {documents.map((doc) => (
        <div key={doc.id} className="flex items-center gap-3 py-3">
          <FileText size={16} className="text-gray-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-gray-800 truncate">{doc.fileName ?? 'Untitled document'}</span>
              {doc.documentTag && (
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-600">{doc.documentTag}</span>
              )}
              {doc.signed ? <SignedBadge /> : <AnalysisStatusBadge status={doc.analysisStatus} />}
            </div>
            <p className="text-xs text-gray-500 mt-0.5 truncate">
              {doc.uploadedByName ?? 'Unknown uploader'}
              {formatRole(doc.uploadedByRole) ? ` · ${formatRole(doc.uploadedByRole)}` : ''}
              {' · '}{SOURCE_LABELS[doc.source] ?? doc.source}
              {' · '}{formatDateTime(doc.uploadedAt)}
            </p>
          </div>
          <a
            href={doc.viewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 px-3 py-1.5 text-xs font-medium text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors"
          >
            View
          </a>
        </div>
      ))}
    </div>
  );
}
