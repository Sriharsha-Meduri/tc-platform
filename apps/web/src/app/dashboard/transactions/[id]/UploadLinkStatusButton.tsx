'use client';

import { useState } from 'react';
import { Loader2, ExternalLink, AlertCircle } from 'lucide-react';

export interface UploadLinkStatus {
  uploadLinkId: string | null;
  emailSentAt: string | null;
  expiresAt: string | null;
  linkStatus: 'active' | 'revoked' | 'replaced' | null;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString();
}

/**
 * Reusable link-status display + "Open Upload Page" action — used identically
 * by Seller Side / Buyer Side / Escrow / Broker Details. Regenerating is the
 * only way to get a usable URL for an already-sent link (raw tokens are never
 * persisted, only their hash), so it always invalidates the previous one —
 * the confirm step exists specifically to surface that tradeoff. `basePath`
 * defaults to the shared `/upload-link` route; the Broker section passes
 * `/upload-link/broker`, its own dedicated route (see upload-link/broker/[token]/page.tsx).
 */
export default function UploadLinkStatusButton({ status, roleLabel, basePath = '/upload-link' }: { status: UploadLinkStatus | null; roleLabel: string; basePath?: string }) {
  const [confirming, setConfirming] = useState(false);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleOpen() {
    if (!status?.uploadLinkId) return;
    setOpening(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/upload-links/${status.uploadLinkId}/regenerate`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`Failed to open the upload page (${res.status})`);
      const body = await res.json() as { token: string | null };
      if (!body.token) throw new Error('No link token was returned.');
      window.open(`${window.location.origin}${basePath}/${body.token}`, '_blank', 'noopener,noreferrer');
      setConfirming(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setOpening(false);
    }
  }

  if (!status?.uploadLinkId) {
    return <p className="text-xs text-gray-400">No {roleLabel} upload link has been sent yet.</p>;
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-500">
        {status.emailSentAt ? `Welcome email sent ${formatDateTime(status.emailSentAt)}` : 'Not yet sent'}
        {status.expiresAt ? ` · expires ${formatDateTime(status.expiresAt)}` : ''}
        {status.linkStatus && status.linkStatus !== 'active' ? ` · ${status.linkStatus}` : ''}
      </p>

      {confirming ? (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
          <p className="text-xs text-amber-800 mb-2">
            Opening the {roleLabel} upload page mints a fresh link and invalidates the one currently in use. Continue?
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleOpen}
              disabled={opening}
              className="px-3 py-1.5 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-xs font-medium disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              {opening ? <Loader2 size={12} className="animate-spin" /> : <ExternalLink size={12} />}
              {opening ? 'Opening…' : 'Open Upload Page'}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={opening}
              className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-600"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-medium text-gray-700 hover:border-blue-300 inline-flex items-center gap-1.5"
        >
          <ExternalLink size={12} /> Open {roleLabel} Upload Page
        </button>
      )}

      {error && (
        <p className="flex items-center gap-1.5 text-xs text-red-600">
          <AlertCircle size={12} /> {error}
        </p>
      )}
    </div>
  );
}
