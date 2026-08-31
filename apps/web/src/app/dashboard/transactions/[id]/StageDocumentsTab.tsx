'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ExternalLink,
  Inbox,
  Loader2,
  AlertCircle,
  Upload,
  Mail,
  X,
  CheckCircle2,
  Plus,
  FileUp,
  FileText,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import BatchUploadProgress, { type BatchFileStatus } from './BatchUploadProgress';

const STAGE_DOCUMENT_TYPES: Record<string, string[]> = {
  INTAKE:      ['general', 'intake_document'],
  CONTRACT:    ['purchase_agreement', 'residential purchase agreement'],
  DISCLOSURES: ['disclosure'],
  INSPECTION:  ['inspection_report', 'inspection report'],
  APPRAISAL:   ['appraisal'],
  LOAN:        ['loan'],
  CONTINGENCIES: ['inspection_report', 'inspection report', 'appraisal', 'loan', 'inspection'],
  ESCROW:      ['escrow'],
  CLOSING:     ['closing', 'verification_of_property'],
  POST_CLOSE:  ['general'],
};

function normalize(s: string) {
  return s.toLowerCase().replace(/[\s_]+/g, '_');
}

function docBelongsToStage(doc: ApiDocument, stage: string): boolean {
  const types = STAGE_DOCUMENT_TYPES[stage.toUpperCase()] ?? [];
  const norm = normalize(doc.documentType);
  return types.some((t) => normalize(t) === norm);
}

interface ApiDocument {
  id: string;
  documentType: string;
  title: string;
  fileName: string | null;
  mimeType: string | null;
  storageUrl: string | null;
  status: string;
  stage: string | null;
  createdAt: string;
  metadataJson: Record<string, unknown> | null;
}

function fileIcon(fileName: string | null): string {
  const ext = (fileName ?? '').split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return '📄';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext ?? '')) return '🖼️';
  if (['doc', 'docx'].includes(ext ?? '')) return '📝';
  return '📎';
}

function fmt(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function humanize(s: string) {
  return s.replace(/[_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

type UploadMode = 'upload' | 'email';

interface Props {
  transactionId: string;
  stage: string;
  defaultOpen?: boolean;
}

export default function StageDocumentsTab({ transactionId, stage, defaultOpen }: Props) {
  const [docs, setDocs] = useState<ApiDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Upload panel state
  const [showPanel, setShowPanel] = useState(false);
  const [uploadMode, setUploadMode] = useState<UploadMode>('upload');

  // Multi-file upload state
  const [dragOver, setDragOver] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Batch progress state
  const [batchFileStatuses, setBatchFileStatuses] = useState<BatchFileStatus[]>([]);
  const [batchPercent, setBatchPercent] = useState(0);
  const [batchMessage, setBatchMessage] = useState('');
  const [confirmingIds, setConfirmingIds] = useState<Set<string>>(new Set());
  const eventSourceRef = useRef<EventSource | null>(null);

  // Email link state
  const [recipientEmail, setRecipientEmail] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [linkSent, setLinkSent] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    fetch(`/api/v1/transaction-documents/transaction/${transactionId}/active`)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load documents (${res.status})`);
        return res.json() as Promise<ApiDocument[]>;
      })
      .then((all) => {
        setDocs(all.filter((d) => d.status !== 'SUPERSEDED' && docBelongsToStage(d, stage)));
        setLoading(false);
      })
      .catch((err: Error) => {
        setError(err.message);
        setLoading(false);
      });
  }, [transactionId, stage]);

  useEffect(() => {
    if (defaultOpen) setShowPanel(true);
  }, [defaultOpen]);

  // Cleanup SSE on unmount
  useEffect(() => {
    return () => { eventSourceRef.current?.close(); };
  }, []);

  function openPanel() {
    setShowPanel(true);
    setUploadMode('upload');
    setSelectedFiles([]);
    setUploadError(null);
    setBatchFileStatuses([]);
    setBatchPercent(0);
    setBatchMessage('');
    setSendError(null);
    setLinkSent(null);
    setRecipientEmail('');
    setRecipientName('');
  }

  function closePanel() {
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
    setShowPanel(false);
    setSelectedFiles([]);
    setUploadError(null);
    setBatchFileStatuses([]);
    setSendError(null);
    setLinkSent(null);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const dropped = Array.from(e.dataTransfer.files);
    addFiles(dropped);
  }

  function addFiles(newFiles: File[]) {
    const pdfs = newFiles.filter((f) => f.type === 'application/pdf');
    const rejected = newFiles.filter((f) => f.type !== 'application/pdf');
    if (rejected.length > 0) {
      setUploadError(`${rejected.length} file${rejected.length !== 1 ? 's' : ''} skipped — only PDF files are supported.`);
    } else {
      setUploadError(null);
    }
    setSelectedFiles((prev) => [...prev, ...pdfs]);
  }

  function removeFile(index: number) {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  }

  function handleUpload() {
    if (selectedFiles.length === 0) return;
    setUploading(true);
    setUploadError(null);
    setBatchFileStatuses(
      selectedFiles.map((f, i) => ({
        index: i,
        fileName: f.name,
        status: 'queued' as const,
      })),
    );
    setBatchPercent(0);
    setBatchMessage('Starting upload…');

    const form = new FormData();
    for (const file of selectedFiles) form.append('files', file);
    form.append('transactionId', transactionId);
    form.append('stage', stage.toLowerCase());

    fetch(`/api/v1/document-extraction/upload-and-extract-batch`, { method: 'POST', body: form })
      .then(async (res) => {
        if (!res.ok) {
          const err = await res.json().catch(() => ({ message: 'Batch upload failed' }));
          throw new Error((err as { message?: string }).message ?? 'Batch upload failed');
        }
        return res.json() as Promise<{ jobId: string }>;
      })
      .then(({ jobId }) => {
        const es = new EventSource(
          `${window.location.origin}/api/v1/document-extraction/upload-and-extract-batch/${jobId}/progress`,
        );
        eventSourceRef.current = es;

        es.onmessage = (ev) => {
          try {
            const data = JSON.parse(ev.data) as {
              overall: { percent: number; message: string };
              files: BatchFileStatus[];
            };
            setBatchPercent(data.overall.percent);
            setBatchMessage(data.overall.message);
            if (data.files.length > 0) {
              setBatchFileStatuses((prev) => {
                const next = [...prev];
                for (const incoming of data.files) {
                  next[incoming.index] = { ...next[incoming.index], ...incoming };
                }
                return next;
              });
            }
          } catch { /* ignore parse errors */ }
        };

        es.onerror = () => {
          es.close();
          eventSourceRef.current = null;
          setUploading(false);
          setBatchFileStatuses([]);
          setSelectedFiles([]);
          setBatchPercent(0);
          setBatchMessage('');
          refreshDocs();
        };

        es.addEventListener('complete', () => {
          es.close();
          eventSourceRef.current = null;
          setUploading(false);
          setBatchFileStatuses([]);
          setSelectedFiles([]);
          setBatchPercent(0);
          setBatchMessage('');
          refreshDocs();
        });
      })
      .catch((err: Error) => {
        setUploadError(err.message);
        setUploading(false);
        setBatchFileStatuses([]);
        setSelectedFiles([]);
      });
  }

  function refreshDocs() {
    fetch(`/api/v1/transaction-documents/transaction/${transactionId}/active`)
      .then((res) => res.json())
      .then((all: ApiDocument[]) => {
        setDocs(all.filter((d) => d.status !== 'SUPERSEDED' && docBelongsToStage(d, stage)));
      })
      .catch(() => {});
  }

  async function handleConfirmUpload(pendingUploadId: string) {
    setConfirmingIds((prev) => new Set(prev).add(pendingUploadId));
    try {
      const res = await fetch(`/api/v1/document-extraction/confirm-upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pendingUploadId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Failed to confirm' }));
        throw new Error((err as { message?: string }).message ?? 'Failed to confirm');
      }
      setBatchFileStatuses((prev) =>
        prev.map((f) =>
          f.pendingUploadId === pendingUploadId
            ? { ...f, status: 'completed', pendingUploadId: undefined, existingDocInfo: undefined }
            : f,
        ),
      );
      refreshDocs();
    } catch {
      setBatchFileStatuses((prev) =>
        prev.map((f) =>
          f.pendingUploadId === pendingUploadId ? { ...f, status: 'error', error: 'Failed to confirm replace' } : f,
        ),
      );
    } finally {
      setConfirmingIds((prev) => {
        const next = new Set(prev);
        next.delete(pendingUploadId);
        return next;
      });
    }
  }

  async function handleCancelUpload(pendingUploadId: string) {
    try {
      await fetch(`/api/v1/document-extraction/cancel-upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pendingUploadId }),
      });
    } catch { /* best-effort */ }
    setBatchFileStatuses((prev) =>
      prev.map((f) =>
        f.pendingUploadId === pendingUploadId
          ? { ...f, status: 'completed', pendingUploadId: undefined, existingDocInfo: undefined, error: 'Skipped' }
          : f,
      ),
    );
  }

  async function handleSendLink() {
    if (!recipientEmail.trim()) return;
    setSending(true);
    setSendError(null);

    try {
      const res = await fetch(`/api/v1/document-extraction/send-upload-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transactionId,
          stage: stage.toLowerCase(),
          recipientEmail: recipientEmail.trim(),
          recipientName: recipientName.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Failed to send' }));
        throw new Error((err as { message?: string }).message ?? 'Failed to send');
      }
      const { uploadUrl } = await res.json() as { uploadUrl: string };
      setLinkSent(uploadUrl);
    } catch (err) {
      setSendError((err as Error).message);
    } finally {
      setSending(false);
    }
  }

  const isBatchActive = uploading || batchFileStatuses.length > 0;
  const stageLabel = stage.charAt(0).toUpperCase() + stage.slice(1).toLowerCase();

  return (
    <div className="py-2 space-y-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-400">
          {docs.length} {docs.length === 1 ? 'document' : 'documents'}
        </span>
        {!showPanel && (
          <button
            onClick={openPanel}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-700 text-white text-xs font-medium rounded-lg hover:bg-blue-800 transition-colors"
          >
            <Plus size={13} />
            Submit Additional Forms
          </button>
        )}
        {showPanel && (
          <button
            onClick={closePanel}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-gray-500 text-xs font-medium rounded-lg hover:bg-gray-100 transition-colors"
          >
            <X size={13} />
            Cancel
          </button>
        )}
      </div>

      {/* Upload panel */}
      {showPanel && (
        <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4 space-y-4">
          {/* Mode tabs */}
          <div className="flex gap-1 bg-white rounded-lg border border-gray-200 p-1 w-fit">
            <button
              onClick={() => { setUploadMode('upload'); setUploadError(null); }}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                uploadMode === 'upload' ? 'bg-blue-700 text-white' : 'text-gray-600 hover:bg-gray-100',
              )}
            >
              <FileUp size={12} />
              Upload Now
            </button>
            <button
              onClick={() => { setUploadMode('email'); setSendError(null); setLinkSent(null); }}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                uploadMode === 'email' ? 'bg-blue-700 text-white' : 'text-gray-600 hover:bg-gray-100',
              )}
            >
              <Mail size={12} />
              Send Upload Link
            </button>
          </div>

          {/* Upload Now */}
          {uploadMode === 'upload' && (
            <div className="space-y-3">
              {isBatchActive ? (
                /* Batch progress display */
                <BatchUploadProgress
                  files={batchFileStatuses}
                  overallPercent={batchPercent}
                  overallMessage={batchMessage}
                  onConfirm={handleConfirmUpload}
                  onCancel={handleCancelUpload}
                  confirmingIds={confirmingIds}
                />
              ) : (
                <>
                  {/* Drop zone */}
                  <div
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={handleDrop}
                    onClick={() => !uploading && fileInputRef.current?.click()}
                    className={cn(
                      'border-2 border-dashed rounded-xl p-8 text-center transition-colors',
                      uploading ? 'cursor-default opacity-60' : 'cursor-pointer',
                      dragOver
                        ? 'border-blue-400 bg-blue-50'
                        : selectedFiles.length > 0
                        ? 'border-blue-300 bg-blue-50/50'
                        : 'border-gray-300 bg-white hover:border-blue-300 hover:bg-blue-50/30',
                    )}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="application/pdf"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        const picked = Array.from(e.target.files ?? []);
                        addFiles(picked);
                        e.target.value = '';
                      }}
                    />
                    {selectedFiles.length > 0 ? (
                      <div className="space-y-3">
                        <div className="flex items-center justify-center gap-2">
                          <FileText size={18} className="text-blue-500" />
                          <p className="text-sm font-medium text-gray-900">
                            {selectedFiles.length} file{selectedFiles.length !== 1 ? 's' : ''} selected
                          </p>
                        </div>
                        <p className="text-xs text-gray-400">
                          {(selectedFiles.reduce((a, f) => a + f.size, 0) / 1024 / 1024).toFixed(1)} MB total — click to add more
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Upload className="w-8 h-8 text-gray-300 mx-auto" />
                        <p className="text-sm font-medium text-gray-700">
                          Drop PDFs here or <span className="text-blue-600">browse</span>
                        </p>
                        <p className="text-xs text-gray-400">Multiple PDFs accepted, up to 50 MB each</p>
                      </div>
                    )}
                  </div>

                  {/* Selected files list */}
                  {selectedFiles.length > 0 && (
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {selectedFiles.map((file, i) => (
                        <div
                          key={`${file.name}-${i}`}
                          className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-100 rounded-lg text-sm"
                        >
                          <FileText size={13} className="text-gray-400 shrink-0" />
                          <span className="flex-1 truncate text-gray-700 text-xs">{file.name}</span>
                          <span className="text-[10px] text-gray-400 shrink-0">
                            {(file.size / 1024 / 1024).toFixed(1)} MB
                          </span>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                            className="shrink-0 p-0.5 text-gray-400 hover:text-red-500 rounded transition-colors"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {uploadError && (
                    <div className="flex items-center gap-2 text-red-600 text-xs bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                      <AlertCircle size={14} />
                      {uploadError}
                    </div>
                  )}

                  <button
                    onClick={handleUpload}
                    disabled={selectedFiles.length === 0 || uploading}
                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-700 text-white text-sm font-medium rounded-lg hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {uploading ? (
                      <>
                        <Loader2 size={15} className="animate-spin" />
                        Uploading {selectedFiles.length} file{selectedFiles.length !== 1 ? 's' : ''}…
                      </>
                    ) : (
                      <>
                        <Upload size={15} />
                        Upload &amp; Analyze{selectedFiles.length > 1 ? ` (${selectedFiles.length})` : ''}
                      </>
                    )}
                  </button>

                  <p className="text-xs text-gray-400 text-center">
                    Documents are validated and key fields extracted automatically.
                  </p>
                </>
              )}
            </div>
          )}

          {/* Send Upload Link */}
          {uploadMode === 'email' && (
            <div className="space-y-3">
              {linkSent ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm">
                    <CheckCircle2 size={16} />
                    Link sent to <strong>{recipientEmail}</strong>
                  </div>
                  <div className="bg-white border border-gray-200 rounded-lg p-3 space-y-1">
                    <p className="text-xs text-gray-500 font-medium">Upload link (valid 7 days):</p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 text-xs text-gray-700 break-all">{linkSent}</code>
                      <button
                        onClick={() => navigator.clipboard.writeText(linkSent)}
                        className="text-xs text-blue-600 hover:text-blue-800 font-medium whitespace-nowrap"
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                  <button
                    onClick={() => { setLinkSent(null); setRecipientEmail(''); setRecipientName(''); }}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    Send another link
                  </button>
                </div>
              ) : (
                <>
                  <p className="text-xs text-gray-600">
                    Send a secure upload link to a party. They can upload their{' '}
                    <strong>{stageLabel}</strong> documents directly — no login required.
                    The link expires in 7 days.
                  </p>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="col-span-2 space-y-1">
                      <label className="text-xs font-medium text-gray-700">Recipient email *</label>
                      <input
                        type="email"
                        value={recipientEmail}
                        onChange={(e) => setRecipientEmail(e.target.value)}
                        placeholder="buyer@example.com"
                        className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div className="col-span-2 space-y-1">
                      <label className="text-xs font-medium text-gray-700">Recipient name (optional)</label>
                      <input
                        type="text"
                        value={recipientName}
                        onChange={(e) => setRecipientName(e.target.value)}
                        placeholder="Jane Doe"
                        className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                  </div>

                  {sendError && (
                    <div className="flex items-center gap-2 text-red-600 text-xs bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                      <AlertCircle size={14} />
                      {sendError}
                    </div>
                  )}

                  <button
                    onClick={handleSendLink}
                    disabled={!recipientEmail.trim() || sending}
                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-700 text-white text-sm font-medium rounded-lg hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {sending ? (
                      <>
                        <Loader2 size={15} className="animate-spin" />
                        Sending…
                      </>
                    ) : (
                      <>
                        <Mail size={15} />
                        Send Upload Link
                      </>
                    )}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Documents list */}
      {loading && (
        <div className="flex items-center justify-center py-12 gap-2 text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Loading documents…</span>
        </div>
      )}

      {!loading && error && (
        <div className="flex items-center justify-center py-12 gap-2 text-red-500">
          <AlertCircle className="w-4 h-4" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {!loading && !error && docs.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Inbox className="w-8 h-8 text-gray-300 mb-3" />
          <p className="text-sm text-gray-500">No documents yet.</p>
          <p className="text-xs text-gray-400 mt-1">
            Documents for the <span className="font-medium capitalize">{stage.toLowerCase()}</span> stage will appear here.
          </p>
        </div>
      )}

      {!loading && !error && docs.length > 0 && (
        <div className="rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3 w-8" />
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">File</th>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3 hidden md:table-cell">Type</th>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3 hidden md:table-cell">Uploaded</th>
                <th className="text-right text-xs font-medium text-gray-500 px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {docs.map((doc) => (
                <tr key={doc.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-base">{fileIcon(doc.fileName)}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900 text-sm">{doc.title}</p>
                    {doc.fileName && doc.fileName !== doc.title && (
                      <p className="text-xs text-gray-400 mt-0.5">{doc.fileName}</p>
                    )}
                    {!!doc.metadataJson?.extraction && (
                      <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5">
                        <CheckCircle2 size={10} />
                        Analyzed
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span className="text-xs text-gray-500">{humanize(doc.documentType)}</span>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span className="text-xs text-gray-500">{fmt(doc.createdAt)}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {doc.storageUrl ? (
                      <a
                        href={doc.storageUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
                      >
                        View
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    ) : (
                      <span className="text-xs text-gray-300">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
