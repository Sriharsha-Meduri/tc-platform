'use client';

import { useRef, useState } from 'react';
import { CheckCircle, XCircle, Loader2, MapPin, Upload, FileText, Trash2, UploadCloud, Cpu } from 'lucide-react';
import { uploadFiles } from './uploadLinkApi';
import type { FileUploadResult } from './uploadLinkTypes';

type FileStatus = 'uploading' | 'processing' | 'completed' | 'failed';

const STATUS_LABEL: Record<FileStatus, string> = {
  uploading: 'Uploading',
  processing: 'Processing',
  completed: 'Completed',
  failed: 'Failed',
};

/**
 * The general file-upload card — identical across Buyer Agent, Seller Agent,
 * and Escrow Officer pages (only the header title differs). Owns its own
 * upload state; calls `onUploaded` after a successful upload so the parent
 * page can refresh its documents list and checklist.
 */
export default function UploadDropzoneCard({
  token, title, recipientName, propertyAddress, maxFiles = 10, onUploaded,
}: {
  token: string;
  title: string;
  recipientName: string;
  propertyAddress: string;
  /** Per-request batch size from the server's file limits — larger selections are split into sequential batches. */
  maxFiles?: number;
  onUploaded: () => void;
}) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<FileUploadResult[] | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  /** Per-file live status for the batch currently uploading (or the one that just finished/failed) — snapshotted from selectedFiles at the start of handleUpload, since selectedFiles itself is cleared on success. */
  const [uploadingFiles, setUploadingFiles] = useState<{ file: File; status: FileStatus }[]>([]);
  const idempotencyKeyRef = useRef<string>('');

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    setSelectedFiles(files);
    setResults(null);
    setUploadError(null);
    setUploadingFiles([]);
    // A fresh key per newly-selected batch; re-clicking "Upload" on this same
    // batch (e.g. after a failed attempt) reuses it so a retry is idempotent.
    idempotencyKeyRef.current = crypto.randomUUID();
    e.target.value = '';
  }

  function removeFile(index: number) {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleUpload() {
    if (selectedFiles.length === 0 || !token) return;
    const filesToUpload = selectedFiles;
    setUploading(true);
    setProgress(0);
    setUploadError(null);
    setResults(null);
    setUploadingFiles(filesToUpload.map((file) => ({ file, status: 'uploading' })));

    try {
      const { results: uploadResults } = await uploadFiles(
        token, filesToUpload, idempotencyKeyRef.current, setProgress, undefined, maxFiles,
        (phase, filesInBatch) => {
          setUploadingFiles((prev) => prev.map((entry) =>
            filesInBatch.includes(entry.file) ? { ...entry, status: phase } : entry));
        },
      );
      // uploadResults is ordered identically to filesToUpload — batches are built as
      // consecutive slices and results are concatenated in the same order.
      setUploadingFiles((prev) => prev.map((entry, i) => {
        const result = uploadResults[i];
        return result ? { ...entry, status: result.status === 'success' ? 'completed' : 'failed' } : entry;
      }));
      setResults(uploadResults);
      setSelectedFiles([]);
      onUploaded();
    } catch (err) {
      setUploadingFiles((prev) => prev.map((entry) => (entry.status === 'completed' ? entry : { ...entry, status: 'failed' })));
      setUploadError((err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-6 py-5 bg-blue-50 border-b border-blue-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
            <UploadCloud size={18} className="text-blue-600" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-gray-800">{title}</h1>
            <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
              <MapPin size={11} /> {propertyAddress}
            </p>
          </div>
        </div>
      </div>

      <div className="px-6 py-5">
        <p className="text-sm text-gray-700 mb-5">
          Hi {recipientName}, you may use this page to upload additional documents for this transaction. No login is required.
        </p>

        {/* File picker */}
        <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-gray-300 rounded-xl py-8 mb-4 cursor-pointer hover:border-blue-400 hover:bg-blue-50/40 transition-colors">
          <Upload size={22} className="text-gray-400" />
          <span className="text-sm text-gray-600 font-medium">Choose files to upload</span>
          <span className="text-xs text-gray-400">Select one or multiple files</span>
          <input type="file" multiple className="hidden" onChange={handleFileSelect} disabled={uploading} />
        </label>

        {/* Selected files — shown before an upload attempt starts */}
        {selectedFiles.length > 0 && uploadingFiles.length === 0 && (
          <div className="mb-4 space-y-1.5">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Selected Files ({selectedFiles.length})
            </p>
            {selectedFiles.map((file, i) => (
              <div key={`${file.name}-${i}`} className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs">
                <FileText size={12} className="text-gray-400 shrink-0" />
                <span className="flex-1 min-w-0 truncate text-gray-700">{file.name}</span>
                <span className="text-gray-400 shrink-0">{(file.size / 1024).toFixed(0)} KB</span>
                {!uploading && (
                  <button
                    type="button"
                    onClick={() => removeFile(i)}
                    className="shrink-0 text-red-500 hover:text-red-700"
                    aria-label={`Remove ${file.name}`}
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Per-file live status — Uploading → Processing → Completed/Failed, one row per file, kept visible through the whole lifecycle (not just while in flight) so a settled result still shows its own status, error, and validation detail. */}
        {uploadingFiles.length > 0 && (
          <div className="mb-4 space-y-1.5">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              {uploading ? `Uploading ${uploadingFiles.length} File${uploadingFiles.length === 1 ? '' : 's'}…` : 'Upload Results'}
            </p>
            {uploadingFiles.map(({ file, status }, i) => {
              const result = results?.[i];
              return (
                <div
                  key={`${file.name}-${i}`}
                  className={`px-3 py-2 border rounded-lg text-xs ${
                    status === 'completed' ? 'bg-green-50 border-green-200'
                      : status === 'failed' ? 'bg-red-50 border-red-200'
                      : 'bg-gray-50 border-gray-200'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <FileText size={12} className="text-gray-400 shrink-0" />
                    <span className="flex-1 min-w-0 truncate text-gray-700">{file.name}</span>
                    <FileStatusBadge status={status} />
                  </div>
                  {status === 'failed' && result?.error && !result.validationFailures?.length && (
                    <p className="mt-1 pl-5 text-red-600">{result.error}</p>
                  )}
                  {result?.validationFailures && result.validationFailures.length > 0 && (
                    <div className="mt-1.5 pl-5">
                      <p className="text-red-700 font-medium mb-1">
                        {result.formCode ? `${result.formCode} — Re-upload Required` : 'Failed validation — this document was not saved:'}
                      </p>
                      <ul className="list-disc list-inside text-red-600 space-y-0.5">
                        {result.validationFailures.map((f, fi) => (
                          <li key={fi}>{f}</li>
                        ))}
                      </ul>
                      <p className="text-red-500 italic mt-1">Please correct the issue(s) above and reupload this document.</p>
                    </div>
                  )}
                </div>
              );
            })}
            {uploading && (
              <div className="pt-1">
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-600 transition-all" style={{ width: `${progress}%` }} />
                </div>
                <p className="text-xs text-gray-500 mt-1.5 text-center">
                  {progress}%{uploadingFiles.length > maxFiles ? ` (${uploadingFiles.length} files in batches of ${maxFiles})` : ''}
                </p>
              </div>
            )}
            {results && (
              <p className="text-xs text-gray-400 pt-1">
                You can upload more documents any time this link remains valid.
              </p>
            )}
          </div>
        )}

        {uploadError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2 text-sm text-red-700 mb-4">
            <XCircle size={16} className="shrink-0" />
            {uploadError}
          </div>
        )}

        <button
          type="button"
          onClick={handleUpload}
          disabled={selectedFiles.length === 0 || uploading}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-700 hover:bg-blue-800 text-white text-sm font-medium rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {uploading
            ? <><Loader2 size={14} className="animate-spin" /> Uploading…</>
            : <>Upload {selectedFiles.length > 0 ? `${selectedFiles.length} File${selectedFiles.length === 1 ? '' : 's'}` : ''}</>}
        </button>
      </div>
    </div>
  );
}

const STATUS_STYLE: Record<FileStatus, string> = {
  uploading: 'text-blue-600',
  processing: 'text-amber-600',
  completed: 'text-green-600',
  failed: 'text-red-600',
};

function FileStatusBadge({ status }: { status: FileStatus }) {
  const Icon = status === 'completed' ? CheckCircle : status === 'failed' ? XCircle : status === 'processing' ? Cpu : Loader2;
  return (
    <span className={`flex items-center gap-1 shrink-0 font-medium ${STATUS_STYLE[status]}`}>
      <Icon size={12} className={status === 'uploading' ? 'animate-spin' : ''} />
      {STATUS_LABEL[status]}
    </span>
  );
}
