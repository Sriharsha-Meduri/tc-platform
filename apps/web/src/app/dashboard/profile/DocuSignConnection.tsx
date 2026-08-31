'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { CheckCircle, XCircle, Loader2, Link, Unlink } from 'lucide-react';

interface ConnectionInfo {
  connected: boolean;
  docusignAccountName?: string;
  docusignEmail?: string;
  connectedAt?: string;
}

export default function DocuSignConnectionSection() {
  const [connection, setConnection] = useState<ConnectionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [showPopup, setShowPopup] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchConnection = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/docusign/connection', { credentials: 'include' });
      if (res.ok) setConnection(await res.json() as ConnectionInfo);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchConnection(); }, [fetchConnection]);

  // Listen for postMessage from the callback popup
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data === 'docusign_connected') {
        setShowPopup(false);
        fetchConnection();
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [fetchConnection]);

  const handleConnect = () => {
    setShowPopup(true);
  };

  const handleStartOAuth = async () => {
    setActionLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/docusign/connect', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to start');
      const { url } = await res.json() as { url: string };

      const width = 600;
      const height = 750;
      const left = (window.screen.width - width) / 2;
      const top = (window.screen.height - height) / 2;
      const popup = window.open(
        url,
        'docusign_oauth',
        `width=${width},height=${height},left=${left},top=${top}`,
      );

      const pollTimer = setInterval(() => {
        if (!popup || popup.closed) {
          clearInterval(pollTimer);
          setShowPopup(false);
          fetchConnection();
        }
      }, 1000);
    } catch (err) {
      setError((err as Error).message);
    }
    setActionLoading(false);
  };

  const handleDisconnect = async () => {
    if (!confirm('Disconnect your DocuSign account?')) return;
    setActionLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/docusign/connection', { method: 'DELETE', credentials: 'include' });
      if (res.ok) setConnection({ connected: false });
    } catch {
      setError('Failed to disconnect');
    }
    setActionLoading(false);
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex items-center justify-center py-4">
          <Loader2 size={16} className="animate-spin text-gray-400" />
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Link size={16} className="text-blue-600" />
          <h3 className="text-sm font-semibold text-gray-800">DocuSign Integration</h3>
        </div>

        {connection?.connected ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-green-700">
              <CheckCircle size={14} className="text-green-500" />
              <span className="font-medium">Connected</span>
            </div>
            <div className="space-y-1.5 text-xs text-gray-600">
              <div className="flex gap-2">
                <span className="text-gray-400 w-20 shrink-0">Account</span>
                <span className="font-medium">{connection.docusignAccountName}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-gray-400 w-20 shrink-0">Email</span>
                <span>{connection.docusignEmail}</span>
              </div>
              {connection.connectedAt && (
                <div className="flex gap-2">
                  <span className="text-gray-400 w-20 shrink-0">Connected</span>
                  <span>{new Date(connection.connectedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={handleConnect} disabled={actionLoading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 disabled:opacity-50">
                <Link size={12} /> Reconnect
              </button>
              <button type="button" onClick={handleDisconnect} disabled={actionLoading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 disabled:opacity-50">
                <Unlink size={12} /> Disconnect
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <XCircle size={14} className="text-gray-400" />
              <span>Not Connected</span>
            </div>
            <p className="text-xs text-gray-500">
              Connect your DocuSign account to send signature requests from your own account.
            </p>
            <button type="button" onClick={handleConnect}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-700 text-white text-xs font-medium rounded-lg hover:bg-blue-800 transition-colors">
              <Link size={12} /> Connect DocuSign
            </button>
          </div>
        )}

        {error && (
          <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
        )}
      </div>

      {/* Connection Popup */}
      {showPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center">
                  <Link size={17} className="text-blue-600" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-gray-800">Connect DocuSign</h2>
                  <p className="text-xs text-gray-500 mt-0.5">Link your personal DocuSign account</p>
                </div>
              </div>
            </div>
            <div className="px-6 py-4 space-y-3">
              <p className="text-xs text-gray-600 leading-relaxed">
                You are connecting your personal DocuSign account to MyTC. Once connected,
                all "Send via DocuSign" actions will automatically use your account
                to create and send signature requests.
              </p>
              <ul className="text-[11px] text-gray-500 space-y-1.5 list-disc pl-4">
                <li>You will be redirected to DocuSign&apos;s secure login page</li>
                <li>Sign in with your DocuSign email and password</li>
                <li>Grant MyTC permission to send envelopes on your behalf</li>
                <li>Your credentials are never stored by MyTC</li>
              </ul>
            </div>
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex gap-2 justify-end">
              <button type="button" onClick={() => setShowPopup(false)}
                className="px-4 py-2 text-xs font-medium text-gray-600 hover:text-gray-800 transition-colors">
                Cancel
              </button>
              <button type="button" onClick={handleStartOAuth} disabled={actionLoading}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-700 text-white text-xs font-medium rounded-lg hover:bg-blue-800 disabled:opacity-50 transition-colors">
                {actionLoading && <Loader2 size={12} className="animate-spin" />}
                Connect with DocuSign
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
