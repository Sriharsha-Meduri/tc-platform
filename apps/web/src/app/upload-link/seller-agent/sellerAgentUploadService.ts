import { getTransactionInfo, saveTransactionInfo, SaveTransactionInfoResult, UPLOAD_LINK_API_BASE } from '../shared/uploadLinkApi';
import type { TransactionInfoDto } from '../shared/uploadLinkTypes';

export interface SellerAgentInfoFormFields {
  escrowContactName: string;
  escrowEmail: string;
  hasHoa: boolean | null;
}

function buildSellerAgentInfoPayload(fields: SellerAgentInfoFormFields): Record<string, unknown> {
  return {
    escrow: { escrowContactName: fields.escrowContactName.trim() || null, escrowEmail: fields.escrowEmail.trim() || null },
    hoa: { hasHoa: fields.hasHoa },
  };
}

export function loadSellerAgentTransactionInfo(token: string): Promise<TransactionInfoDto> {
  return getTransactionInfo(token);
}

export function saveSellerAgentInfo(token: string, fields: SellerAgentInfoFormFields): Promise<SaveTransactionInfoResult> {
  return saveTransactionInfo(token, buildSellerAgentInfoPayload(fields));
}

export async function getEscrowEmailStatus(token: string): Promise<{ sentAt: string | null; sentTo: string | null }> {
  const res = await fetch(`${UPLOAD_LINK_API_BASE}/token/${token}/escrow-welcome-email-status`);
  if (!res.ok) throw new Error('Failed to load escrow welcome-email status.');
  return res.json() as Promise<{ sentAt: string | null; sentTo: string | null }>;
}

/** Sends every selected document as one combined DocuSign envelope — backs the checklist sidebar's single centralized "Send via DocuSign" action (see SendDocumentsViaDocuSignModal). */
export async function sendDocumentsDocusign(token: string, documentIds: string[]): Promise<void> {
  const res = await fetch(`${UPLOAD_LINK_API_BASE}/token/${token}/documents/docusign/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ documentIds }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { message?: string };
    throw new Error(body.message ?? 'Failed to send the selected documents.');
  }
}
