'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { CheckCircle, XCircle, AlertTriangle, Mail, Loader2, Building2, Hash, Eye, Download, FileText, Upload } from 'lucide-react';
import type { ApiDocument } from '@/lib/api';
import { renderFields } from '@/app/transactions/new/field-labels';
import { ESCROW_CATALOG, getEscrowEntry, type EscrowDocAction } from './EscrowCatalog';

function fmt(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

interface Props {
  transactionId: string;
  extractionResult?: { escrowCompanies?: Array<{ companyName: string | null; email: string | null; phone: string | null }> } | null;
  documents: ApiDocument[];
}

type DocStatus = 'missing' | 'uploaded' | 'complete' | 'blocked';

function computeDocStatus(doc: ApiDocument | undefined, action: EscrowDocAction): DocStatus {
  if (!doc) return 'missing';
  const meta = (doc.metadataJson as Record<string, unknown> | null) ?? {};
  const compliance = meta?.compliance as Record<string, unknown> | null;
  const blockers = (compliance?.blockers as Array<unknown>) ?? [];
  const warnings = (compliance?.warnings as Array<unknown>) ?? [];
  const hasChecks = (compliance?.checks as Array<unknown>) ?? [];

  if (action === 'save') {
    // Save documents: just need to be uploaded
    return 'complete';
  }

  // Sign documents: need signatures validated
  if (blockers.length > 0) return 'blocked';
  if (hasChecks.length > 0 || warnings.length > 0) return 'complete';
  return 'uploaded';
}

function DocStatusBadge({ status }: { status: DocStatus }) {
  const config: Record<DocStatus, { label: string; classes: string; icon: React.ElementType }> = {
    missing:  { label: 'Missing',  classes: 'bg-red-100 text-red-700 border-red-200',     icon: XCircle },
    uploaded: { label: 'Uploaded', classes: 'bg-blue-100 text-blue-700 border-blue-200',   icon: Upload },
    complete: { label: 'Complete', classes: 'bg-green-100 text-green-700 border-green-200', icon: CheckCircle },
    blocked:  { label: 'Blocked',  classes: 'bg-amber-100 text-amber-700 border-amber-200', icon: AlertTriangle },
  };
  const c = config[status];
  return (
    <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full uppercase tracking-wide border flex items-center gap-1 ${c.classes}`}>
      <c.icon size={9} /> {c.label}
    </span>
  );
}

export default function EscrowDetailsView({ transactionId, extractionResult, documents }: Props) {
  const [email, setEmail] = useState('');
  const [escrowNumber, setEscrowNumber] = useState('');
  const [saving, setSaving] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const escrowCompany = extractionResult?.escrowCompanies?.[0];
  const hasAnyData = !!email || !!escrowNumber;

  useEffect(() => {
    Promise.all([
      fetch(`/api/v1/transactions/${encodeURIComponent(transactionId)}/escrow-email`, { credentials: 'include' })
        .then((r) => r.ok ? r.json() : null),
      fetch(`/api/v1/transactions/${encodeURIComponent(transactionId)}/escrow-number`, { credentials: 'include' })
        .then((r) => r.ok ? r.json() : null),
    ]).then(([emailData, numData]) => {
      if (emailData?.escrowEmail) setEmail(emailData.escrowEmail);
      if (numData?.escrowNumber) setEscrowNumber(numData.escrowNumber);
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, [transactionId]);

  useEffect(() => {
    if (!email && escrowCompany?.email) setEmail(escrowCompany.email);
  }, [escrowCompany, email]);

  const saveField = async (field: 'escrow-email' | 'escrow-number', value: string) => {
    setSaving(field);
    setError(null);
    try {
      const body = field === 'escrow-email' ? { email: value || null } : { number: value || null };
      const res = await fetch(`/api/v1/transactions/${encodeURIComponent(transactionId)}/${field}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        credentials: 'include', body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Failed to save');
      setSuccess('Saved');
      setTimeout(() => setSuccess(null), 2000);
    } catch (err) {
      setError((err as Error).message);
    }
    setSaving(null);
  };

  if (!loaded) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={20} className="animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="py-4 space-y-4">
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="px-5 py-4 bg-blue-50 border-b border-blue-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
              <Building2 size={16} className="text-blue-600" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-800">Escrow Information</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Escrow company details are entered below to begin the escrow process.
              </p>
            </div>
            {hasAnyData && (
              <span className="ml-auto flex items-center gap-1.5 text-[10px] font-semibold text-green-700 bg-green-100 border border-green-200 px-2 py-1 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500" /> Active
              </span>
            )}
          </div>
        </div>

        <div className="divide-y divide-gray-100">
          {/* Escrow Company */}
          <div className="px-5 py-3">
            <label className="block text-xs font-medium text-gray-700 mb-0.5">Escrow Company</label>
            {escrowCompany?.companyName ? (
              <p className="text-sm text-gray-800 font-medium">{escrowCompany.companyName}</p>
            ) : (
              <p className="text-sm text-gray-400 italic">Not yet identified</p>
            )}
            {escrowCompany?.phone && (
              <p className="text-xs text-gray-500 mt-0.5">{escrowCompany.phone}</p>
            )}
          </div>

          {/* Escrow Number */}
          <div className="px-5 py-3">
            <label className="block text-xs font-medium text-gray-700 mb-1">Escrow Number</label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Hash size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={escrowNumber}
                  onChange={(e) => setEscrowNumber(e.target.value)}
                  onBlur={() => escrowNumber && saveField('escrow-number', escrowNumber)}
                  onKeyDown={(e) => { if (e.key === 'Enter') saveField('escrow-number', escrowNumber); }}
                  placeholder="e.g. 2024-12345-ESC"
                  className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                />
              </div>
              {saving === 'escrow-number' && <Loader2 size={14} className="animate-spin text-gray-400" />}
            </div>
          </div>

          {/* Escrow Email */}
          <div className="px-5 py-3">
            <label className="block text-xs font-medium text-gray-700 mb-1">Escrow Officer Email</label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={() => email && emailValid && saveField('escrow-email', email)}
                  onKeyDown={(e) => { if (e.key === 'Enter') saveField('escrow-email', email); }}
                  placeholder="escrow@example.com"
                  className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                />
              </div>
              {saving === 'escrow-email' && <Loader2 size={14} className="animate-spin text-gray-400" />}
            </div>
            {email && !emailValid && (
              <p className="text-[10px] text-red-600 mt-1 flex items-center gap-1">
                <XCircle size={10} /> Invalid email format
              </p>
            )}
          </div>

          {/* Escrow Status */}
          <div className="px-5 py-3">
            <label className="block text-xs font-medium text-gray-700 mb-0.5">Escrow Status</label>
            <div className="flex items-center gap-2">
              {hasAnyData ? (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                  <span className="text-sm text-green-700 font-medium">Active</span>
                  <span className="text-xs text-gray-400">— escrow information entered</span>
                </>
              ) : (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
                  <span className="text-sm text-gray-500">Inactive</span>
                  <span className="text-xs text-gray-400">— waiting for escrow details</span>
                </>
              )}
            </div>
          </div>
        </div>

        {error && (
          <div className="px-5 pb-3">
            <div className="flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <XCircle size={12} className="shrink-0 mt-0.5" />
              {error}
            </div>
          </div>
        )}

        {success && (
          <div className="px-5 pb-3">
            <div className="flex items-start gap-2 text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
              <CheckCircle size={12} className="shrink-0 mt-0.5" />
              {success}
            </div>
          </div>
        )}
      </div>

      {/* Escrow Document Catalog */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <FileText size={14} className="text-gray-500" />
            <h3 className="text-sm font-semibold text-gray-700">Escrow Documents</h3>
            <span className="text-[10px] text-gray-400 ml-auto">{documents.length} uploaded</span>
          </div>
        </div>
        <div className="divide-y divide-gray-100">
          {ESCROW_CATALOG.map((entry) => {
            const doc = documents.find((d) => {
              const meta = d.metadataJson as Record<string, unknown> | null;
              return (meta?.detectedFormCode as string ?? '').toUpperCase() === entry.formCode;
            });
            const status = computeDocStatus(doc, entry.action);
            const meta = (doc?.metadataJson as Record<string, unknown> | null) ?? {};
            const compliance = meta?.compliance as Record<string, unknown> | null;
            const blockers = (compliance?.blockers as Array<{ compositeId: string; message: string; location?: string; fields?: string[] }>) ?? [];
            const warnings = (compliance?.warnings as Array<{ compositeId: string; message: string; location?: string; fields?: string[] }>) ?? [];

            return (
              <div key={entry.formCode} className="px-5 py-2.5 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-gray-800">{entry.formName}</span>
                    <span className={entry.required
                      ? 'text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200'
                      : 'text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-50 text-gray-500 border border-gray-200'}>
                      {entry.required ? 'Required' : 'If Applicable'}
                    </span>
                    <span className={entry.action === 'sign'
                      ? 'text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200'
                      : 'text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-50 text-gray-500 border border-gray-200'}>
                      {entry.action === 'sign' ? 'Sign & Save' : 'Save'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <DocStatusBadge status={status} />
                    {blockers.length > 0 && (
                      <span className="text-[10px] text-red-600 font-medium">{blockers.length} blocker{blockers.length !== 1 ? 's' : ''}</span>
                    )}
                    {warnings.length > 0 && (
                      <span className="text-[10px] text-amber-600 font-medium">{warnings.length} warning{warnings.length !== 1 ? 's' : ''}</span>
                    )}
                    {doc && <span className="text-[10px] text-gray-400">{fmt(doc.createdAt)}</span>}
                  </div>
                  {/* Blockers/Warnings details */}
                  {blockers.length > 0 && (
                    <div className="mt-1.5 space-y-0.5">
                      {blockers.map((b, i) => (
                        <div key={i} className="flex items-start gap-1.5 text-[10px] text-red-700 bg-red-50 border border-red-100 rounded px-2 py-1">
                          <XCircle size={9} className="text-red-500 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-medium">{entry.formName}</span>
                            {b.location && <span className="text-red-400"> — {b.location}</span>}
                            {b.fields && <span className="text-red-500"> — {renderFields(b.fields)}</span>}
                            <p className="text-red-700">{b.message}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {warnings.length > 0 && (
                    <div className="mt-1.5 space-y-0.5">
                      {warnings.map((w, i) => (
                        <div key={i} className="flex items-start gap-1.5 text-[10px] text-amber-700 bg-amber-50 border border-amber-100 rounded px-2 py-1">
                          <AlertTriangle size={9} className="text-amber-500 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-medium">{entry.formName}</span>
                            {w.location && <span className="text-amber-400"> — {w.location}</span>}
                            {w.fields && <span className="text-amber-500"> — {renderFields(w.fields)}</span>}
                            <p className="text-amber-700">{w.message}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {/* Actions */}
                {doc && (
                  <div className="flex items-center gap-1 shrink-0">
                    {doc.storageUrl && (
                      <a href={doc.storageUrl} target="_blank" rel="noopener noreferrer"
                        className="text-[10px] text-blue-600 hover:text-blue-800 px-1.5 py-0.5 flex items-center gap-0.5">
                        <Eye size={10} /> View
                      </a>
                    )}
                    <a href={`/api/v1/transaction-documents/${doc.id}/file`} target="_blank" rel="noopener noreferrer"
                      className="text-[10px] text-gray-400 hover:text-gray-600 px-1 py-0.5">
                      <Download size={10} />
                    </a>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
