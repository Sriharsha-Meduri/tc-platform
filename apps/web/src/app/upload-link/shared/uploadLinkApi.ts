import type { UploadPageContext, FileUploadResult, UploadedDocument, TransactionInfoDto, PublicCdaDto } from './uploadLinkTypes';
import type { DocumentChecklistStatus } from './checklist.types';

/** Every upload-link fetch shares this backend REST prefix — unrelated to (and never renamed alongside) this frontend directory's own route path. */
export const UPLOAD_LINK_API_BASE = '/api/v1/upload-links';

/**
 * Each uploaded file goes through the full synchronous document-intelligence
 * pipeline (extraction + compliance) before the server responds, so a
 * multi-file batch can legitimately take minutes. Comfortably under the
 * matching `experimental.proxyTimeout` in next.config.ts (600s) so a real
 * client-side timeout — not the dev-server proxy — is always what fires
 * first, with a message that says so.
 */
const UPLOAD_TIMEOUT_MS = 590_000;

/** A batch request's lifecycle, reported per-batch so the UI can show real per-file states instead of a single opaque progress bar. */
export type UploadBatchPhase = 'uploading' | 'processing';

/**
 * XHR (not fetch) — needed for real upload-progress events.
 *
 * Batches the selection so no single request exceeds the server's per-request
 * file cap: files are split into chunks of `maxFilesPerBatch` and uploaded
 * sequentially, aggregating every batch's results. Each batch derives its own
 * idempotency key from the caller's key, so a retry of the same selection
 * reuses the same keys (server-side dedup still works) while distinct batches
 * never collide with each other. Progress is reported across the whole
 * selection, not per batch.
 */
export function uploadFiles(
  token: string,
  files: File[],
  idempotencyKey: string,
  onProgress: (pct: number) => void,
  documentCategory?: string,
  maxFilesPerBatch = 10,
  onBatchPhase?: (phase: UploadBatchPhase, filesInBatch: File[]) => void,
): Promise<{ results: FileUploadResult[] }> {
  if (files.length === 0) return Promise.resolve({ results: [] });

  const batches: File[][] = [];
  for (let i = 0; i < files.length; i += maxFilesPerBatch) {
    batches.push(files.slice(i, i + maxFilesPerBatch));
  }

  const results: FileUploadResult[] = [];
  let completedBatches = 0;

  function uploadBatch(index: number): Promise<void> {
    const batchKey = index === 0 ? idempotencyKey : `${idempotencyKey}:${index}`;
    return uploadBatchRequest(token, batches[index], batchKey, (batchPct) => {
      const overallPct = ((completedBatches + batchPct / 100) / batches.length) * 100;
      onProgress(Math.round(overallPct));
      if (batchPct >= 100) onBatchPhase?.('processing', batches[index]);
      else onBatchPhase?.('uploading', batches[index]);
    }, documentCategory).then((res) => {
      results.push(...res.results);
      completedBatches += 1;
      if (index < batches.length - 1) return uploadBatch(index + 1);
    });
  }

  return uploadBatch(0).then(() => ({ results }));
}

function uploadBatchRequest(
  token: string,
  files: File[],
  idempotencyKey: string,
  onProgress: (pct: number) => void,
  documentCategory?: string,
): Promise<{ results: FileUploadResult[] }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const form = new FormData();
    for (const file of files) form.append('files', file);
    if (documentCategory) form.append('documentCategory', documentCategory);

    xhr.open('POST', `${UPLOAD_LINK_API_BASE}/token/${token}/documents`);
    xhr.setRequestHeader('Idempotency-Key', idempotencyKey);
    xhr.timeout = UPLOAD_TIMEOUT_MS;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as { results: FileUploadResult[] });
        } catch {
          // eslint-disable-next-line no-console
          console.error(`Upload response was not valid JSON (HTTP ${xhr.status}):`, xhr.responseText?.slice(0, 500));
          reject(new Error('The server returned an unexpected response. Your files may still have been processed — refresh to check before retrying.'));
        }
      } else {
        let message = `Upload failed (HTTP ${xhr.status}). Please try again.`;
        try {
          const body = JSON.parse(xhr.responseText) as { message?: string };
          if (body?.message) message = body.message;
        } catch {
          // eslint-disable-next-line no-console
          console.error(`Upload failed with a non-JSON error response (HTTP ${xhr.status}):`, xhr.responseText?.slice(0, 500));
        }
        reject(new Error(message));
      }
    };
    xhr.ontimeout = () => {
      // eslint-disable-next-line no-console
      console.error(`Upload timed out client-side after ${UPLOAD_TIMEOUT_MS}ms for ${files.length} file(s).`);
      reject(new Error('This is taking longer than expected. Your files may still be processing on the server — refresh the page in a moment to check before retrying.'));
    };
    xhr.onerror = () => {
      // eslint-disable-next-line no-console
      console.error('Network error during upload — request never reached the server or the connection was reset.');
      reject(new Error('Network error during upload.'));
    };
    xhr.send(form);
  });
}

/** Bootstraps the page — throws with the server's message (or the generic invalid-link message) on failure. Callers decide whether to surface or swallow. */
export async function getContext(token: string): Promise<UploadPageContext> {
  const res = await fetch(`${UPLOAD_LINK_API_BASE}/token/${token}/context`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { message?: string };
    throw new Error(body.message ?? 'This upload link is invalid or has expired.');
  }
  return res.json() as Promise<UploadPageContext>;
}

export async function getDocuments(token: string): Promise<UploadedDocument[]> {
  const res = await fetch(`${UPLOAD_LINK_API_BASE}/token/${token}/documents`);
  if (!res.ok) throw new Error('Failed to load uploaded documents.');
  const body = await res.json() as { documents: UploadedDocument[] };
  return body.documents;
}

export async function getChecklist(token: string): Promise<DocumentChecklistStatus> {
  const res = await fetch(`${UPLOAD_LINK_API_BASE}/token/${token}/checklist`);
  if (!res.ok) throw new Error('Failed to load checklist.');
  return res.json() as Promise<DocumentChecklistStatus>;
}

/** A minimal, cross-side read of the Seller Agent's own required-document status — see UploadLinkController.getSellerAgentStatus. */
export async function getSellerAgentStatus(token: string): Promise<{ allRequiredSubmitted: boolean }> {
  const res = await fetch(`${UPLOAD_LINK_API_BASE}/token/${token}/seller-status`);
  if (!res.ok) throw new Error('Failed to load seller status.');
  return res.json() as Promise<{ allRequiredSubmitted: boolean }>;
}

/** Returns null when there's no CDA yet, or none visible to this link — never throws for that case. */
export async function getCda(token: string): Promise<PublicCdaDto | null> {
  const res = await fetch(`${UPLOAD_LINK_API_BASE}/token/${token}/cda`);
  if (!res.ok) throw new Error('Failed to load the CDA.');
  const body = await res.json() as { cda: PublicCdaDto | null };
  return body.cda;
}

/** Returns null when the signed CDA hasn't been uploaded yet, or isn't visible to this link — never throws for that case. */
export async function getSignedCda(token: string): Promise<PublicCdaDto | null> {
  const res = await fetch(`${UPLOAD_LINK_API_BASE}/token/${token}/signed-cda`);
  if (!res.ok) throw new Error('Failed to load the signed CDA.');
  const body = await res.json() as { signedCda: PublicCdaDto | null };
  return body.signedCda;
}

/** The Broker's one upload capability — the signed CDA, and nothing else. Single-file, not routed through the general documents endpoint. */
export async function uploadSignedCda(token: string, file: File): Promise<{ documentId: string }> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${UPLOAD_LINK_API_BASE}/token/${token}/signed-cda`, { method: 'POST', body: form });
  const body = await res.json().catch(() => ({})) as { documentId?: string; message?: string };
  if (!res.ok) throw new Error(body.message ?? 'Failed to upload the signed CDA.');
  return body as { documentId: string };
}

export async function getTransactionInfo(token: string): Promise<TransactionInfoDto> {
  const res = await fetch(`${UPLOAD_LINK_API_BASE}/token/${token}/transaction-info`);
  if (!res.ok) throw new Error('Failed to load transaction information.');
  return res.json() as Promise<TransactionInfoDto>;
}

export interface SaveTransactionInfoResult {
  saved: TransactionInfoDto;
  escrowWelcomeEmail?: { sent: boolean; alreadySent: boolean; escrowEmail: string } | null;
  brokerWelcomeEmail?: { sent: boolean; alreadySent: boolean; brokerEmail: string } | null;
}

/** Shared by the Buyer Agent (lender/broker-commission) and Seller Agent (escrow/HOA) forms — each builds its own payload sub-object, both POST the same endpoint. */
export async function saveTransactionInfo(token: string, payload: Record<string, unknown>): Promise<SaveTransactionInfoResult> {
  const res = await fetch(`${UPLOAD_LINK_API_BASE}/token/${token}/transaction-info`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({})) as SaveTransactionInfoResult & { message?: string };
  if (!res.ok) throw new Error(body.message ?? 'Failed to save transaction information.');
  return body;
}
