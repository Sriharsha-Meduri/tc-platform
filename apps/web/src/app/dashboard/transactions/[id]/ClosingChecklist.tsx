'use client';

import { CheckCircle, XCircle, AlertTriangle, Clock, Upload, FileText, Send, Flag } from 'lucide-react';
import { CLOSING_CATALOG, type ClosingDocStatus } from './ClosingCatalog';

interface ApiDocument {
  id: string;
  documentType: string;
  title: string;
  fileName: string | null;
  storageUrl: string | null;
  status: string;
  createdAt: string;
  metadataJson: Record<string, unknown> | null;
}

function DocStatusBadge({ status }: { status: ClosingDocStatus }) {
  const config: Record<ClosingDocStatus, { label: string; classes: string; icon: React.ElementType }> = {
    missing:   { label: 'Missing',  classes: 'bg-red-50 text-red-700 border-red-200',     icon: XCircle },
    received:  { label: 'Received', classes: 'bg-amber-50 text-amber-700 border-amber-200', icon: Upload },
    validated: { label: 'Validated',classes: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle },
    signed:    { label: 'Signed',   classes: 'bg-green-50 text-green-700 border-green-200',   icon: Send },
    waived:    { label: 'Waived',   classes: 'bg-gray-50 text-gray-500 border-gray-200',   icon: Flag },
  };
  const c = config[status];
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full uppercase tracking-wide border flex items-center gap-1 ${c.classes}`}>
      <c.icon size={9} /> {c.label}
    </span>
  );
}

function computeDocStatus(doc: ApiDocument | undefined, vpDocId: string | null, vpStatus: string | null, formCode: string): ClosingDocStatus {
  // Special handling for VP — use the VP entity workflow status
  if (formCode === 'VP') {
    if (!vpDocId) return 'missing';
    if (vpStatus === 'validated' || vpStatus === 'ready_for_docusign') return 'validated';
    if (vpStatus === 'sent_via_docusign') return 'signed';
    if (vpStatus === 'fully_executed') return 'signed';
    if (vpStatus === 'form_received') return 'received';
    return 'received';
  }

  if (!doc) return 'missing';
  const meta = (doc.metadataJson as Record<string, unknown> | null) ?? {};
  const detectedFormCode = (meta?.detectedFormCode as string)?.toUpperCase();
  const formCodeMatches = detectedFormCode === formCode;

  // Check for signed status
  if (doc.status === 'signed' || doc.status === 'SIGNED') return 'signed';
  if (doc.status === 'approved' || doc.status === 'APPROVED') return 'validated';

  // Check compliance for validation
  const compliance = meta?.compliance as Record<string, unknown> | null;
  const blockers = (compliance?.blockers as Array<unknown>) ?? [];
  const checks = (compliance?.checks as Array<unknown>) ?? [];

  if (formCodeMatches) {
    if (blockers.length === 0 && checks.length > 0) return 'validated';
    return 'received';
  }

  return 'received';
}

function countByStatus(catalogDocs: Array<{ entry: (typeof CLOSING_CATALOG)[number]; status: ClosingDocStatus }>) {
  return {
    missing: catalogDocs.filter((d) => d.status === 'missing' && d.entry.required).length,
    total: catalogDocs.filter((d) => d.entry.required).length,
    received: catalogDocs.filter((d) => d.status !== 'missing').length,
  };
}

interface Props {
  closingDocuments: ApiDocument[];
  vpDocumentId?: string | null;
  vpStatus?: string | null;
}

export default function ClosingChecklist({ closingDocuments, vpDocumentId, vpStatus }: Props) {
  const catalogDocs = CLOSING_CATALOG.map((entry) => {
    const doc = closingDocuments.find((d) => {
      const meta = (d.metadataJson ?? {}) as Record<string, unknown>;
      return (meta?.detectedFormCode as string)?.toUpperCase() === entry.formCode;
    });
    return {
      entry,
      doc,
      status: computeDocStatus(doc, vpDocumentId ?? null, vpStatus ?? null, entry.formCode),
    };
  }).sort((a, b) => a.entry.sortOrder - b.entry.sortOrder);

  const counts = countByStatus(catalogDocs);

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <FileText size={14} className="text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-700">Required Closing Documents</h3>
          <span className="text-[10px] text-gray-400 ml-auto">
            {counts.received}/{counts.total} received
          </span>
        </div>
        {counts.missing > 0 && (
          <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
            <AlertTriangle size={10} />
            {counts.missing} required document{counts.missing !== 1 ? 's' : ''} outstanding
          </p>
        )}
      </div>
      <div className="divide-y divide-gray-100">
        {catalogDocs.map(({ entry, status }) => (
          <div key={entry.formCode} className="px-5 py-2.5 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-gray-800">{entry.formName}</span>
                <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                  {entry.required ? 'Required' : 'If Applicable'}
                </span>
                {entry.waivable && (
                  <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-50 text-gray-500 border border-gray-200">
                    Waivable
                  </span>
                )}
              </div>
              <p className="text-[10px] text-gray-400 mt-0.5">{entry.description}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <DocStatusBadge status={status} />
              {status === 'missing' && entry.required && (
                <AlertTriangle size={11} className="text-red-400" />
              )}
              {status === 'validated' && (
                <CheckCircle size={11} className="text-emerald-500" />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
