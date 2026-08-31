'use client';

import { useRef, useState } from 'react';
import { uploadFiles } from './uploadLinkApi';
import type { UploadedDocument, UploadedDocumentCategory, UploadedDocumentStatus } from './uploadLinkTypes';

const STATUS_LABELS: Record<UploadedDocumentStatus, string> = {
  uploaded: 'Uploaded',
  analyzing: 'Analyzing',
  saved: 'Saved',
  analysis_failed: 'Analysis Failed',
};

function StatusBadge({ status }: { status: UploadedDocumentStatus }) {
  const styles: Record<UploadedDocumentStatus, string> = {
    uploaded: 'bg-gray-100 text-gray-600',
    analyzing: 'bg-blue-50 text-blue-600',
    saved: 'bg-green-50 text-green-700',
    analysis_failed: 'bg-amber-50 text-amber-700',
  };
  return (
    <span className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${styles[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

/**
 * One dedicated required-document field with its own upload button — used
 * for the Buyer Agent's Lender Prequalification/Proof of Funds fields and
 * the Escrow Officer's Escrow Instructions/Title Report/Closing Statement
 * (+ conditional HOA) fields. Tags the upload with `category` so the backend
 * stores it as a dedicated document type rather than a general upload.
 */
export default function RequiredDocumentUploadField({
  token, category, label, documents, onUploaded,
}: {
  token: string;
  category: UploadedDocumentCategory;
  label: string;
  documents: UploadedDocument[];
  onUploaded: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const idempotencyKeyRef = useRef<string>('');

  const uploaded = documents
    .filter((d) => d.category === category)
    .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())[0];

  function handleSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !token) return;
    idempotencyKeyRef.current = crypto.randomUUID();
    setError(null);
    setUploading(true);
    uploadFiles(token, [file], idempotencyKeyRef.current, () => {}, category)
      .then(({ results }) => {
        const failed = results.find((r) => r.status === 'failed');
        if (failed) throw new Error(failed.error ?? 'Upload failed. Please try again.');
        onUploaded();
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setUploading(false));
  }

  return (
    <div className="border border-gray-200 rounded-lg p-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-800">{label} <span className="text-red-500">*</span></p>
          {uploaded ? (
            <p className="text-xs text-gray-500 truncate mt-0.5">{uploaded.fileName}</p>
          ) : (
            <p className="text-xs text-amber-600 mt-0.5">Required — not yet uploaded</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {uploaded && <StatusBadge status={uploaded.status} />}
          <label className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-600 cursor-pointer hover:border-blue-300">
            {uploading ? 'Uploading…' : uploaded ? 'Replace' : 'Upload'}
            <input type="file" className="hidden" onChange={handleSelect} disabled={uploading} />
          </label>
        </div>
      </div>
      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
    </div>
  );
}
