'use client';

import { useState, useRef, useCallback } from 'react';
import { Upload, FileText, CheckCircle, AlertCircle, X, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Types ────────────────────────────────────────────────────────────────────

type PipelineStage = 'splitting' | 'classifying' | 'grouping' | 'extracting' | 'complete' | 'error';

interface ProgressEvent {
  stage: PipelineStage;
  message: string;
  percent: number;
  detail?: {
    currentPage?: number;
    totalPages?: number;
    currentForm?: number;
    totalForms?: number;
    formCode?: string;
    formName?: string | null;
  };
}

interface FormGroup {
  formCode: string;
  pageIndices: number[];
}

interface ExtractionResult {
  formCode: string;
  formName: string | null;
  pageIndices: number[];
  extraction: Record<string, unknown> | null;
  error?: string;
}

interface PipelineResult {
  totalPages: number;
  formGroups: FormGroup[];
  extractions: ExtractionResult[];
}

type UIState = 'idle' | 'uploading' | 'processing' | 'complete' | 'error';

// ── Stage label ──────────────────────────────────────────────────────────────

const STAGE_LABELS: Record<PipelineStage, string> = {
  splitting:   'Splitting PDF',
  classifying: 'Classifying pages',
  grouping:    'Grouping by form',
  extracting:  'Extracting data',
  complete:    'Complete',
  error:       'Error',
};

// ── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({ percent, stage }: { percent: number; stage: PipelineStage }) {
  const isError = stage === 'error';
  const isDone  = stage === 'complete';

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className={cn(
          'font-medium',
          isError ? 'text-red-600' : isDone ? 'text-green-600' : 'text-blue-700',
        )}>
          {STAGE_LABELS[stage]}
        </span>
        <span className="text-gray-500 tabular-nums">{percent}%</span>
      </div>
      <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-300 ease-out',
            isError ? 'bg-red-500' : isDone ? 'bg-green-500' : 'bg-blue-600',
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

// ── Stage steps ──────────────────────────────────────────────────────────────

const STAGES: Array<{ id: PipelineStage; label: string; percent: [number, number] }> = [
  { id: 'splitting',   label: 'Split pages',    percent: [0,   5]  },
  { id: 'classifying', label: 'Classify pages', percent: [5,   55] },
  { id: 'grouping',    label: 'Group forms',    percent: [55,  60] },
  { id: 'extracting',  label: 'Extract data',   percent: [60,  100] },
];

function StageSteps({ currentStage, percent }: { currentStage: PipelineStage; percent: number }) {
  return (
    <div className="flex items-center gap-1">
      {STAGES.map((s, i) => {
        const done    = percent >= s.percent[1];
        const active  = currentStage === s.id || (percent > s.percent[0] && !done);
        return (
          <div key={s.id} className="flex items-center gap-1">
            <div className={cn(
              'flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full',
              done    ? 'bg-green-100 text-green-700' :
              active  ? 'bg-blue-100 text-blue-700' :
                        'bg-gray-100 text-gray-400',
            )}>
              {done && <CheckCircle size={10} />}
              {s.label}
            </div>
            {i < STAGES.length - 1 && (
              <div className={cn('w-4 h-px', done ? 'bg-green-300' : 'bg-gray-200')} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Form result card ─────────────────────────────────────────────────────────

function FormResultCard({ extraction }: { extraction: ExtractionResult }) {
  const [expanded, setExpanded] = useState(false);
  const pageCount = extraction.pageIndices.length;
  const pages = extraction.pageIndices.map((i) => i + 1);
  const pageRange = pages.length === 1
    ? `p. ${pages[0]}`
    : `p. ${pages[0]}–${pages[pages.length - 1]}`;

  const hasError = !!extraction.error;
  const property = extraction.extraction?.property as Record<string, string | null> | undefined;
  const address = property?.streetAddress
    ? [property.streetAddress, property.city, property.state].filter(Boolean).join(', ')
    : null;

  return (
    <div className={cn(
      'rounded-lg border text-sm overflow-hidden',
      hasError ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-white',
    )}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className={cn(
            'shrink-0 font-mono text-xs px-2 py-0.5 rounded font-semibold',
            hasError ? 'bg-red-100 text-red-700' : 'bg-blue-50 text-blue-700',
          )}>
            {extraction.formCode}
          </span>
          <span className="text-gray-700 font-medium truncate">
            {extraction.formName ?? extraction.formCode}
          </span>
          {address && (
            <span className="text-gray-400 text-xs truncate hidden sm:block">{address}</span>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0 ml-2">
          <span className="text-xs text-gray-400">{pageCount} {pageCount === 1 ? 'page' : 'pages'} · {pageRange}</span>
          {expanded ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-100 px-4 py-3 bg-gray-50/60">
          {hasError ? (
            <p className="text-xs text-red-600">{extraction.error}</p>
          ) : (
            <pre className="text-xs text-gray-600 overflow-auto max-h-64 whitespace-pre-wrap">
              {JSON.stringify(extraction.extraction, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ExtractPageClient() {
  const [uiState,      setUiState]      = useState<UIState>('idle');
  const [progress,     setProgress]     = useState<ProgressEvent | null>(null);
  const [result,       setResult]       = useState<PipelineResult | null>(null);
  const [errorMsg,     setErrorMsg]     = useState<string | null>(null);
  const [isDragOver,   setIsDragOver]   = useState(false);
  const [fileName,     setFileName]     = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const fileInputRef   = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    eventSourceRef.current?.close();
    setUiState('idle');
    setProgress(null);
    setResult(null);
    setErrorMsg(null);
    setFileName(null);
  }, []);

  const processFile = useCallback(async (file: File) => {
    setFileName(file.name);
    setUiState('uploading');
    setProgress(null);
    setResult(null);
    setErrorMsg(null);

    const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

    // ── Step 1: Upload PDF and get jobId ─────────────────────────────────────
    let jobId: string;
    try {
      const form = new FormData();
      form.append('files', file);
      const res = await fetch(`${apiBase}/api/v1/document-extraction/extract-routed`, {
        method: 'POST',
        body: form,
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json() as { jobId: string };
      jobId = data.jobId;
    } catch (err) {
      setUiState('error');
      setErrorMsg((err as Error).message);
      return;
    }

    // ── Step 2: Connect to SSE and stream progress ───────────────────────────
    setUiState('processing');
    const es = new EventSource(`${apiBase}/api/v1/document-extraction/extract-routed/${jobId}/progress`);
    eventSourceRef.current = es;

    es.onmessage = (e) => {
      const event = JSON.parse(e.data) as ProgressEvent;
      setProgress(event);

      if (event.stage === 'complete') {
        es.close();
        // Fetch the full result
        fetch(`${apiBase}/api/v1/document-extraction/extract-routed/${jobId}/result`)
          .then((r) => r.json())
          .then((r: PipelineResult) => {
            setResult(r);
            setUiState('complete');
          })
          .catch((err: Error) => {
            setUiState('error');
            setErrorMsg(err.message);
          });
      }

      if (event.stage === 'error') {
        es.close();
        setUiState('error');
        setErrorMsg(event.message);
      }
    };

    es.onerror = () => {
      es.close();
      setUiState('error');
      setErrorMsg('Connection to server lost');
    };
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file?.type === 'application/pdf') processFile(file);
  }, [processFile]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }, [processFile]);

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-gray-900">Document Extraction</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Upload a transaction PDF packet. Pages are classified individually then extracted per form.
        </p>
      </div>

      {/* Upload zone */}
      {(uiState === 'idle' || uiState === 'uploading') && (
        <div
          onDrop={handleDrop}
          onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
          onDragLeave={() => setIsDragOver(false)}
          onClick={() => fileInputRef.current?.click()}
          className={cn(
            'relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed cursor-pointer transition-colors p-12',
            isDragOver
              ? 'border-blue-400 bg-blue-50'
              : 'border-gray-200 bg-gray-50 hover:border-gray-300 hover:bg-gray-100',
          )}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={handleFileInput}
          />
          {uiState === 'uploading' ? (
            <div className="flex flex-col items-center gap-2">
              <div className="w-8 h-8 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
              <p className="text-sm text-gray-600">Uploading {fileName}…</p>
            </div>
          ) : (
            <>
              <div className="w-12 h-12 rounded-full bg-white border border-gray-200 flex items-center justify-center shadow-sm">
                <Upload size={20} className="text-gray-400" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-gray-700">Drop a PDF here or click to select</p>
                <p className="text-xs text-gray-400 mt-0.5">Multi-form packets supported · up to 50 MB</p>
              </div>
            </>
          )}
        </div>
      )}

      {/* Processing panel */}
      {uiState === 'processing' && progress && (
        <div className="rounded-xl border border-blue-200 bg-white p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText size={16} className="text-blue-600" />
              <span className="text-sm font-medium text-gray-800 truncate max-w-xs">{fileName}</span>
            </div>
            <button onClick={reset} className="text-gray-400 hover:text-gray-600 transition-colors">
              <X size={16} />
            </button>
          </div>

          <ProgressBar percent={progress.percent} stage={progress.stage} />
          <StageSteps currentStage={progress.stage} percent={progress.percent} />

          <p className="text-xs text-gray-500">{progress.message}</p>

          {progress.detail?.totalPages && (
            <div className="grid grid-cols-2 gap-3 text-xs">
              {progress.detail.currentPage !== undefined && (
                <div className="rounded-lg bg-gray-50 px-3 py-2">
                  <p className="text-gray-400">Pages classified</p>
                  <p className="font-semibold text-gray-800 tabular-nums mt-0.5">
                    {progress.detail.currentPage} / {progress.detail.totalPages}
                  </p>
                </div>
              )}
              {progress.detail.totalForms !== undefined && (
                <div className="rounded-lg bg-gray-50 px-3 py-2">
                  <p className="text-gray-400">Forms extracted</p>
                  <p className="font-semibold text-gray-800 tabular-nums mt-0.5">
                    {progress.detail.currentForm} / {progress.detail.totalForms}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {uiState === 'error' && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-5 space-y-3">
          <div className="flex items-center gap-2 text-red-700">
            <AlertCircle size={16} />
            <span className="text-sm font-medium">Processing failed</span>
          </div>
          <p className="text-xs text-red-600">{errorMsg}</p>
          <button
            onClick={reset}
            className="text-xs font-medium text-red-700 hover:text-red-900 underline underline-offset-2"
          >
            Try again
          </button>
        </div>
      )}

      {/* Results */}
      {uiState === 'complete' && result && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle size={16} className="text-green-500" />
              <span className="text-sm font-medium text-gray-800">
                {result.totalPages} pages · {result.formGroups.length} forms identified
              </span>
            </div>
            <button
              onClick={reset}
              className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
            >
              <Upload size={12} />
              Upload another
            </button>
          </div>

          {/* Form group summary pills */}
          <div className="flex flex-wrap gap-1.5">
            {result.formGroups.map((g) => (
              <span
                key={g.formCode}
                className="text-xs font-mono px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100"
              >
                {g.formCode} <span className="text-blue-400">({g.pageIndices.length}pp)</span>
              </span>
            ))}
          </div>

          {/* Per-form extraction cards */}
          <div className="space-y-2">
            {result.extractions.map((ext) => (
              <FormResultCard key={ext.formCode} extraction={ext} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
