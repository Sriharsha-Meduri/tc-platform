'use client';

import { Loader2, CheckCircle2, AlertCircle, AlertTriangle, Clock, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface BatchFileStatus {
  index: number;
  fileName: string;
  status: 'queued' | 'processing' | 'completed' | 'error' | 'requires_confirmation';
  formCode?: string | null;
  reclassified?: boolean;
  resolvedStage?: string;
  detectedFormName?: string | null;
  error?: string;
  pendingUploadId?: string;
  existingDocInfo?: {
    id: string;
    formCode: string | null;
    formName: string | null;
    versionNo: number;
    uploadedAt: string;
  };
  extractionProgress?: {
    currentPage: number;
    totalPages: number;
    message: string;
  };
}

interface Props {
  files: BatchFileStatus[];
  overallPercent: number;
  overallMessage: string;
  onConfirm?: (pendingUploadId: string) => void;
  onCancel?: (pendingUploadId: string) => void;
  confirmingIds?: Set<string>;
}

function StatusIcon({ status }: { status: BatchFileStatus['status'] }) {
  switch (status) {
    case 'queued':
      return <Clock size={14} className="text-gray-400 shrink-0" />;
    case 'processing':
      return <Loader2 size={14} className="text-blue-500 shrink-0 animate-spin" />;
    case 'completed':
      return <CheckCircle2 size={14} className="text-green-500 shrink-0" />;
    case 'error':
      return <AlertCircle size={14} className="text-red-500 shrink-0" />;
    case 'requires_confirmation':
      return <AlertTriangle size={14} className="text-amber-500 shrink-0" />;
  }
}

function StatusBadge({ status }: { status: BatchFileStatus['status'] }) {
  const config: Record<BatchFileStatus['status'], { label: string; classes: string }> = {
    queued:                 { label: 'Queued',      classes: 'bg-gray-100 text-gray-500' },
    processing:             { label: 'Processing',  classes: 'bg-blue-100 text-blue-700' },
    completed:              { label: 'Complete',    classes: 'bg-green-100 text-green-700' },
    error:                  { label: 'Failed',      classes: 'bg-red-100 text-red-700' },
    requires_confirmation:  { label: 'Duplicate',   classes: 'bg-amber-100 text-amber-700' },
  };
  const c = config[status];
  return (
    <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded-full', c.classes)}>
      {c.label}
    </span>
  );
}

function fmt(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function stageLabel(stage: string | undefined): string {
  if (!stage) return '';
  return stage.charAt(0).toUpperCase() + stage.slice(1).toLowerCase();
}

export default function BatchUploadProgress({
  files,
  overallPercent,
  overallMessage,
  onConfirm,
  onCancel,
  confirmingIds,
}: Props) {
  const completedCount = files.filter((f) => f.status === 'completed').length;
  const errorCount = files.filter((f) => f.status === 'error').length;
  const duplicateCount = files.filter((f) => f.status === 'requires_confirmation').length;
  const isDone = overallPercent >= 100;

  return (
    <div className="space-y-3">
      {/* Overall progress bar */}
      <div className="space-y-1.5">
        <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
          <div
            className={cn(
              'h-2 rounded-full transition-all duration-500 ease-out',
              isDone ? 'bg-green-500' : 'bg-blue-600',
            )}
            style={{ width: `${overallPercent}%` }}
          />
        </div>
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-500 flex items-center gap-1.5">
            {!isDone && <Loader2 size={11} className="animate-spin text-blue-500" />}
            {overallMessage}
          </p>
          <span className="text-xs font-mono text-gray-400">{overallPercent}%</span>
        </div>
      </div>

      {/* Per-file list */}
      <div className="space-y-1 max-h-60 overflow-y-auto">
        {files.map((file) => (
          <div key={file.index}>
            <div
              className={cn(
                'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm',
                file.status === 'processing' && 'bg-blue-50 border border-blue-100',
                file.status === 'completed' && 'bg-green-50/50 border border-green-100',
                file.status === 'error' && 'bg-red-50 border border-red-100',
                file.status === 'requires_confirmation' && 'bg-amber-50 border border-amber-100',
                file.status === 'queued' && 'bg-gray-50 border border-gray-100',
              )}
            >
              <StatusIcon status={file.status} />
              <FileText size={13} className="text-gray-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-800 truncate">{file.fileName}</span>
                  {file.formCode && (
                    <span className="text-[10px] font-mono text-gray-500 bg-gray-100 px-1 py-0.5 rounded shrink-0">
                      {file.formCode}
                    </span>
                  )}
                </div>
                {file.status === 'completed' && file.reclassified && (
                  <p className="text-[11px] text-amber-600 mt-0.5">
                    Moved to {stageLabel(file.resolvedStage)} tab
                    {file.detectedFormName ? ` (${file.detectedFormName})` : ''}
                  </p>
                )}
                {file.status === 'processing' && file.extractionProgress && (
                  <p className="text-[11px] text-blue-600 mt-0.5">
                    {file.extractionProgress.message}
                  </p>
                )}
                {file.status === 'error' && file.error && (
                  <p className="text-[11px] text-red-600 mt-0.5 truncate">{file.error}</p>
                )}
              </div>
              <StatusBadge status={file.status} />
            </div>

            {/* Inline confirmation for duplicates */}
            {file.status === 'requires_confirmation' && file.pendingUploadId && file.existingDocInfo && onConfirm && onCancel && (
              <div className="ml-7 mt-1 mb-1 flex items-center gap-2">
                <span className="text-[11px] text-amber-700">
                  Existing {file.existingDocInfo.formName ?? file.existingDocInfo.formCode ?? 'document'} (v{file.existingDocInfo.versionNo}, {fmt(file.existingDocInfo.uploadedAt)})
                </span>
                <div className="flex gap-1 ml-auto shrink-0">
                  <button
                    type="button"
                    disabled={confirmingIds?.has(file.pendingUploadId)}
                    onClick={() => onCancel(file.pendingUploadId!)}
                    className="px-2 py-0.5 text-[10px] font-medium text-gray-600 bg-white border border-gray-300 rounded hover:bg-gray-50 transition-colors"
                  >
                    Skip
                  </button>
                  <button
                    type="button"
                    disabled={confirmingIds?.has(file.pendingUploadId)}
                    onClick={() => onConfirm(file.pendingUploadId!)}
                    className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium text-white bg-amber-600 rounded hover:bg-amber-700 disabled:opacity-50 transition-colors"
                  >
                    {confirmingIds?.has(file.pendingUploadId) ? (
                      <Loader2 size={10} className="animate-spin" />
                    ) : null}
                    Replace
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Summary */}
      {isDone && files.length > 0 && (
        <div className="flex items-center gap-3 text-xs text-gray-500 pt-1 border-t border-gray-100">
          {completedCount > 0 && (
            <span className="flex items-center gap-1">
              <CheckCircle2 size={11} className="text-green-500" />
              {completedCount} uploaded
            </span>
          )}
          {duplicateCount > 0 && (
            <span className="flex items-center gap-1">
              <AlertTriangle size={11} className="text-amber-500" />
              {duplicateCount} duplicate{duplicateCount !== 1 ? 's' : ''}
            </span>
          )}
          {errorCount > 0 && (
            <span className="flex items-center gap-1">
              <AlertCircle size={11} className="text-red-500" />
              {errorCount} failed
            </span>
          )}
        </div>
      )}
    </div>
  );
}
