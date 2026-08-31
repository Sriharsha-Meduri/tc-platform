import type { TransactionDocumentEntity } from '../transaction-documents/entities/transaction-document.entity';
import type { ExtractionResult } from './extraction-result.types';
import type { ComplianceResult } from './compliance-result.types';

export interface BatchFileProgress {
  index: number;
  fileName: string;
  status: 'queued' | 'processing' | 'completed' | 'error' | 'requires_confirmation';
  document?: TransactionDocumentEntity;
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
    uploadedAt: Date;
  };
  /** Extraction-level page progress — shown during LLM analysis */
  extractionProgress?: {
    currentPage: number;
    totalPages: number;
    message: string;
  };
}

export interface BatchProgressJson {
  overall: { percent: number; message: string };
  files: BatchFileProgress[];
}

export interface BatchUploadResult {
  jobId: string;
  status: 'complete' | 'error';
  files: BatchFileProgress[];
}
