import { UPLOAD_LINK_API_BASE } from '../shared/uploadLinkApi';

export async function getEscrowNumber(token: string): Promise<string | null> {
  const res = await fetch(`${UPLOAD_LINK_API_BASE}/token/${token}/escrow-number`);
  if (!res.ok) throw new Error('Failed to load the escrow number.');
  const body = await res.json() as { escrowNumber: string | null };
  return body.escrowNumber;
}

export async function saveEscrowNumber(token: string, escrowNumber: string | null): Promise<string | null> {
  const res = await fetch(`${UPLOAD_LINK_API_BASE}/token/${token}/escrow-number`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ escrowNumber }),
  });
  const body = await res.json().catch(() => ({})) as { message?: string; escrowNumber?: string | null };
  if (!res.ok) throw new Error(body.message ?? 'Failed to save the escrow number.');
  return body.escrowNumber ?? null;
}

export async function getDeliveryPreference(token: string): Promise<boolean | null> {
  const res = await fetch(`${UPLOAD_LINK_API_BASE}/token/${token}/escrow-document-delivery`);
  if (!res.ok) throw new Error('Failed to load the delivery preference.');
  const body = await res.json() as { willSendDocumentsToBuyer: boolean | null };
  return body.willSendDocumentsToBuyer;
}

export async function saveDeliveryPreference(token: string, willSendDocumentsToBuyer: boolean): Promise<boolean | null> {
  const res = await fetch(`${UPLOAD_LINK_API_BASE}/token/${token}/escrow-document-delivery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ willSendDocumentsToBuyer }),
  });
  const body = await res.json().catch(() => ({})) as { message?: string; willSendDocumentsToBuyer?: boolean | null };
  if (!res.ok) throw new Error(body.message ?? 'Failed to save your answer.');
  return body.willSendDocumentsToBuyer ?? willSendDocumentsToBuyer;
}

export async function getEscrowHoaStatus(token: string): Promise<boolean | null> {
  const res = await fetch(`${UPLOAD_LINK_API_BASE}/token/${token}/escrow-hoa-status`);
  if (!res.ok) throw new Error('Failed to load the HOA status.');
  const body = await res.json() as { hasHoa: boolean | null };
  return body.hasHoa;
}
