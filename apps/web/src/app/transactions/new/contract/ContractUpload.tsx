'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, FileText, FileUp, Loader2, X, AlertCircle, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiGet, apiPost } from '@/lib/client-api';
import {
  resolveTransactionSide,
  TRANSACTION_SIDE_SPECS,
  type TransactionSideValue,
} from '@/lib/transaction-side';

interface Props {
  accountId: string;
  organizationId: string | null;
}

interface RpaNotFoundError {
  documentType: string | null;
}

interface FormTemplate {
  id: string;
  name: string;
  description: string | null;
  side: string;
  transactionType: string;
  items?: Array<{ formCode: string; isRequired: boolean; stage: string }>;
}

interface ProgressState {
  percent: number;
  message: string;
  stage: string;
}

const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000') + '/api/v1';

export default function ContractUpload({ accountId, organizationId }: Props) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Which side of the transaction is being coordinated. Seeded by the selector
  // at /transactions/new; defaults to BUYER for backward compatibility.
  const [transactionSide] = useState<TransactionSideValue>(() => resolveTransactionSide());
  const sideSpec = TRANSACTION_SIDE_SPECS[transactionSide];
  const [files, setFiles] = useState<File[]>([]);
  const [isExtracting, setIsExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rpaNotFound, setRpaNotFound] = useState<RpaNotFoundError | null>(null);
  const [serviceUnavailable, setServiceUnavailable] = useState<string | null>(null);
  const [templates, setTemplates] = useState<FormTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [progress, setProgress] = useState<ProgressState | null>(null); 

  useEffect(() => {
    if (!organizationId) return;
    setLoadingTemplates(true);
    apiGet(`/form-templates?organizationId=${organizationId}`)
      .then((res) => res.json() as Promise<FormTemplate[]>)
      .then((list) => {
        setTemplates(list);
        if (list.length > 0) setSelectedTemplateId(list[0].id);
      })
      .catch(() => {
        // non-blocking — templates are optional
      })
      .finally(() => setLoadingTemplates(false));
  }, [organizationId]);

  function handleFiles(incoming: FileList | null) {
    if (!incoming || incoming.length === 0) return;
    const pdfs = Array.from(incoming).filter(
      (f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'),
    );
    if (pdfs.length === 0) {
      setError('Only PDF files are accepted. Please select a .pdf file.');
      return;
    }
    setFiles((prev) => [...prev, ...pdfs]);
    setError(null);
    setRpaNotFound(null);
    setServiceUnavailable(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  function handleDrop(e: React.DragEvent<HTMLElement>) {
    e.preventDefault();
    const dt = e.dataTransfer;
    if (dt) handleFiles(dt.files);
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const navigateToReview = useCallback((data: {
    transactionId: string;
    extractionResult: unknown;
    partiesCreated?: number;
    compliance: unknown;
    contractDocuments?: unknown[];
    isDuplicate?: boolean;
  }) => {
    sessionStorage.setItem('tc_draft_session', JSON.stringify({
      transactionId: data.transactionId,
      extractionResult: data.extractionResult,
      partiesCreated: data.partiesCreated ?? 0,
      compliance: data.compliance,
      contractDocuments: data.contractDocuments ?? [],
      transactionSide,
    }));
    const path = data.isDuplicate
      ? '/transactions/new/contract/review?duplicate=1'
      : '/transactions/new/contract/review';
    router.push(path);
  }, [router, transactionSide]);

  async function handleExtract() {
    if (files.length === 0 || !organizationId) return;
    setIsExtracting(true);
    setError(null);
    setRpaNotFound(null);
    setServiceUnavailable(null);
    setProgress({ percent: 0, message: 'Starting…', stage: 'starting' });

    try {
      const formData = new FormData();
      for (const file of files) formData.append('files', file);
      formData.append('organizationId', organizationId);
      formData.append('createdByAccountId', accountId);
      formData.append('transactionSide', transactionSide);
      if (selectedTemplateId) formData.append('formTemplateId', selectedTemplateId);

      // ── Step 1: start the routed extraction job ───────────────────────────
      const startRes = await apiPost('/document-extraction/extract-and-draft-routed', formData);
      if (!startRes.ok) {
        const body = await startRes.json().catch(() => ({}));
        throw new Error((body as { message?: string }).message ?? `Server error ${startRes.status}`);
      }
      const { jobId } = await startRes.json() as { jobId: string };

      // ── Step 2: subscribe to SSE progress stream ──────────────────────────
      const result = await new Promise<{
        transaction?: { id: string };
        extractionResult: unknown;
        partiesCreated?: number;
        compliance: unknown;
        duplicate?: boolean;
        existingTransactionId?: string;
        contractDocuments?: unknown[];
      }>((resolve, reject) => {
        const es = new EventSource(`${API_BASE}/document-extraction/extract-and-draft-routed/${jobId}/progress`, { withCredentials: true });
        let settled = false;
        let sseAlive = true;

        // Backup polling: if SSE never delivers 'complete' (connection drop,
        // browser quirk), or delivers it before the DB write propagates, poll
        // the result endpoint. No hard attempt limit — the server-side 30-min
        // timeout is the real safeguard.
        let pollAttempt = 0;
        let pollTimer: ReturnType<typeof setTimeout> | null = null;

        /** Fetch the result once. Returns true if resolved, false if still processing. */
        function fetchResultOnce(): Promise<boolean> {
          return apiGet(`/document-extraction/extract-and-draft-routed/${jobId}/result`)
            .then(async (r) => {
              if (r.ok) {
                const data = await r.json() as Promise<typeof result>;
                resolve(data);
                return true;
              }
              const body = await r.json().catch(() => ({} as Record<string, unknown>));
              const bodyMsg = (body as { message?: string }).message ?? `Server error ${r.status}`;
              if (body && typeof body === 'object' && (body as Record<string, unknown>).code === 'RPA_NOT_FOUND') {
                setRpaNotFound({ documentType: ((body as Record<string, unknown>).documentType as string) ?? null });
                setIsExtracting(false);
                setProgress(null);
                return true;
              }
              if (body && typeof body === 'object' && (body as Record<string, unknown>).code === 'EXTRACTION_SERVICE_UNAVAILABLE') {
                setServiceUnavailable(bodyMsg);
                setIsExtracting(false);
                setProgress(null);
                return true;
              }
              if (r.status === 400 && bodyMsg === 'Job is still processing') {
                return false;
              }
              throw new Error(bodyMsg);
            });
        }

        function startPolling() {
          settled = true;
          pollTimer = setTimeout(function poll() {
            fetchResultOnce()
              .then((done) => {
                if (!done) {
                  pollAttempt++;
                  if (!sseAlive) {
                    // Only show generic progress if SSE isn't delivering events
                    setProgress({ percent: Math.min(99, 50 + pollAttempt), message: 'Processing documents…', stage: 'processing' });
                  }
                  pollTimer = setTimeout(poll, 1000);
                }
              })
              .catch(reject);
          }, 1000);
        }

        es.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data) as ProgressState & { stage: string };
            sseAlive = true;
            setProgress({ percent: data.percent, message: data.message, stage: data.stage });

            if (data.stage === 'error') {
              es.close();
              if (!settled) {
                settled = true;
                const errMsg = data.message || 'Extraction failed';
                const details = (data as unknown as Record<string, unknown>).details as Record<string, unknown> | undefined;
                if (details?.code === 'RPA_NOT_FOUND' || errMsg.includes('RPA_NOT_FOUND')) {
                  setRpaNotFound({ documentType: (details?.documentType as string) ?? null });
                  setIsExtracting(false);
                  setProgress(null);
                  return;
                }
                if (details?.code === 'EXTRACTION_SERVICE_UNAVAILABLE' || errMsg.includes('EXTRACTION_SERVICE_UNAVAILABLE')) {
                  setServiceUnavailable(errMsg);
                  setIsExtracting(false);
                  setProgress(null);
                  return;
                }
                reject(new Error(errMsg));
              }
              return;
            }

            if (data.stage === 'complete') {
              es.close();
              sseAlive = false;
              if (!settled) {
                settled = true;
                // The DB write may not have fully propagated yet — retry a few
                // times with a short delay before falling into steady polling.
                let retries = 0;
                const MAX_IMMEDIATE_RETRIES = 5;
                function tryFetch() {
                  fetchResultOnce()
                    .then((done) => {
                      if (done) return;
                      retries++;
                      if (retries < MAX_IMMEDIATE_RETRIES) {
                        setTimeout(tryFetch, 500);
                      } else {
                        // Fall into steady 1s polling
                        startPolling();
                      }
                    })
                    .catch(reject);
                }
                tryFetch();
              }
            }
          } catch {
            // ignore parse errors on individual events
          }
        };

        es.onerror = () => {
          sseAlive = false;
          es.close();
          if (!settled) {
            startPolling();
          }
        };

        // Safety net: if SSE doesn't deliver 'complete' within 10s of opening,
        // start polling as backup (handles browsers that don't fire onerror
        // on graceful SSE close).
        const safetyTimer = setTimeout(() => {
          if (!settled) startPolling();
        }, 10_000);

        // Cleanup timer on settle
        const origResolve = resolve;
        const origReject = reject;
        resolve = (value) => { clearTimeout(safetyTimer); if (pollTimer) clearTimeout(pollTimer); origResolve(value); };
        reject = (reason) => { clearTimeout(safetyTimer); if (pollTimer) clearTimeout(pollTimer); origReject(reason); };
      });

      // ── Step 3: handle result ────────────────────────────────────────────
      if (!result.transaction && result.duplicate && result.existingTransactionId) {
        setProgress({ percent: 100, message: 'Duplicate detected — redirecting…', stage: 'complete' });
        navigateToReview({
          transactionId: result.existingTransactionId,
          extractionResult: result.extractionResult,
          compliance: result.compliance,
          contractDocuments: result.contractDocuments,
          isDuplicate: true,
        });
        return;
      }

      if (!result.transaction) {
        throw new Error(
          'No transaction data returned. The upload may have failed silently — try again or contact support.',
        );
      }

      setProgress({ percent: 100, message: 'Complete!', stage: 'complete' });
      navigateToReview({
        transactionId: result.transaction.id,
        extractionResult: result.extractionResult,
        partiesCreated: result.partiesCreated,
        compliance: result.compliance,
        contractDocuments: result.contractDocuments,
      });
    } catch (err) {
      console.error('[ContractUpload] handleExtract failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to analyze documents');
      setIsExtracting(false);
      setProgress(null);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 h-14 flex items-center px-6 gap-4">
        <Link
          href="/dashboard"
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          <ArrowLeft size={15} />
          Dashboard
        </Link>
        <div className="w-px h-5 bg-gray-200" />
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-700 flex items-center justify-center">
              <span className="text-white text-xs font-bold">TC</span>
            </div>
            <span className="text-sm font-semibold text-gray-900">New Transaction — Upload Contract</span>
            <span
              className={cn(
                'ml-2 inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold',
                transactionSide === 'SELLER'
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-blue-100 text-blue-700',
              )}
            >
              {sideSpec.shortLabel}
            </span>
          </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-10">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-gray-900">{sideSpec.uploadTitle}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {sideSpec.uploadDescription}
          </p>
        </div>

        {!organizationId && (
          <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl mb-5">
            <AlertCircle size={16} className="text-amber-600 shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800">
              Your account is not linked to an organization. Contact your broker admin to be added
              to an organization before creating transactions.
            </p>
          </div>
        )}

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-5">
          {/* Drop zone */}
          <label
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            className={cn(
              'relative block border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors group',
              isExtracting
                ? 'border-gray-200 bg-gray-50 cursor-not-allowed'
                : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50',
            )}
          >
            <FileUp size={36} className={cn(
              'mx-auto mb-3 transition-colors pointer-events-none',
              isExtracting ? 'text-gray-300' : 'text-gray-400 group-hover:text-blue-500',
            )} />
            <p className={cn(
              'text-sm font-medium pointer-events-none',
              isExtracting ? 'text-gray-400' : 'text-gray-700 group-hover:text-blue-700',
            )}>
              {isExtracting ? 'Extracting data…' : 'Click to browse or drag & drop PDF files'}
            </p>
            <p className="text-xs text-gray-400 mt-1 pointer-events-none">
              Purchase agreement, addendums, disclosures — up to 25 MB each
            </p>
            {!isExtracting && (
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,application/pdf"
                multiple
                onChange={(e) => handleFiles(e.target.files)}
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }}
              />
            )}
          </label>

          {/* File list */}
          {files.length > 0 && (
            <div className="space-y-2">
              <p className={cn(
                'text-xs font-semibold uppercase tracking-wide',
                isExtracting ? 'text-gray-400' : 'text-gray-500',
              )}>
                {files.length} file{files.length !== 1 ? 's' : ''} selected
              </p>
              {files.map((file, i) => (
                <div
                  key={`${file.name}-${i}`}
                  className="flex items-center gap-3 px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg"
                >
                  <FileText size={18} className="text-blue-600 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{file.name}</p>
                    <p className="text-xs text-gray-400">{formatSize(file.size)}</p>
                  </div>
                  {!isExtracting && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                      className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors"
                      aria-label="Remove file"
                    >
                      <X size={15} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Progress bar */}
          {progress && (
            <div className="space-y-2">
              <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
                <div
                  className={cn(
                    'h-2.5 rounded-full transition-all duration-500 ease-out',
                    progress.stage === 'complete' ? 'bg-green-500' : 'bg-blue-600',
                  )}
                  style={{ width: `${progress.percent}%` }}
                />
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-500 flex items-center gap-1.5">
                  {progress.stage !== 'complete' && (
                    <Loader2 size={11} className="animate-spin text-blue-500" />
                  )}
                  {progress.message}
                </p>
                <span className="text-xs font-mono text-gray-400">{progress.percent}%</span>
              </div>
            </div>
          )}
          {progress && progress.stage !== 'complete' && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-xs text-blue-700">
                Your transaction is being processed in the background. You may safely close this page or continue working. A confirmation email will be sent to your MyTC account email once processing is complete.
              </p>
            </div>
          )}

          {/* Template selector */}
          {organizationId && templates.length > 0 && !isExtracting && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                Form Template
                {loadingTemplates && <Loader2 size={11} className="animate-spin text-gray-400" />}
              </label>
              <div className="relative">
                <select
                  value={selectedTemplateId ?? ''}
                  onChange={(e) => setSelectedTemplateId(e.target.value || null)}
                  className="w-full appearance-none rounded-lg border border-gray-300 bg-white px-3 py-2 pr-8 text-sm text-gray-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                >
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}{t.description ? ` — ${t.description}` : ''}
                    </option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
              <p className="text-xs text-gray-400">
                Determines which forms are required and optional for each stage.
              </p>
            </div>
          )}

          {rpaNotFound && (
            <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-800">
              <AlertCircle size={15} className="shrink-0 mt-0.5 text-red-500" />
              <div className="flex-1">
                <p className="font-semibold">{sideSpec.rpaRequiredTitle}</p>
                <p className="mt-1 text-red-700">
                  {sideSpec.rpaRequiredBody}
                  {rpaNotFound.documentType
                    ? <> The uploaded document was identified as <span className="font-medium">&ldquo;{rpaNotFound.documentType}&rdquo;</span>.</>
                    : <> The uploaded document could not be identified as a purchase agreement.</>}
                </p>
                <p className="mt-2 text-red-600 text-xs">
                  Please upload the signed California Residential Purchase Agreement (CAR Form RPA-CA).
                  You can add any addendums or disclosures alongside it.
                </p>
              </div>
            </div>
          )}

          {serviceUnavailable && (
            <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
              <AlertCircle size={15} className="shrink-0 mt-0.5 text-amber-500" />
              <div className="flex-1">
                <p className="font-semibold">Document analysis temporarily unavailable</p>
                <p className="mt-1 text-amber-700">{serviceUnavailable}</p>
                <p className="mt-2 text-amber-600 text-xs">
                  This is not a problem with your document — please try uploading again in a few minutes.
                </p>
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-3 p-3.5 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
              <AlertCircle size={15} className="shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          <div className="flex items-center justify-between pt-1">
            <Link
              href="/transactions/new/manual"
              className={cn(
                'text-sm transition-colors',
                isExtracting ? 'text-gray-300 pointer-events-none' : 'text-gray-500 hover:text-gray-700',
              )}
            >
              Switch to manual entry
            </Link>
            <button
              type="button"
              onClick={handleExtract}
              disabled={files.length === 0 || isExtracting || !organizationId}
              className={cn(
                'flex items-center gap-2 px-5 py-2.5 text-white text-sm font-medium rounded-lg transition-colors',
                'disabled:opacity-40 disabled:cursor-not-allowed',
                isExtracting
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-blue-700 hover:bg-blue-800',
              )}
            >
              {isExtracting ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  {progress ? `${progress.percent}% — ${progress.message}` : 'Analyzing…'}
                </>
              ) : (
                'Extract & Create Draft'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
