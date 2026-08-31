'use client';

import { FolderOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ApiDocument } from '@/lib/api';

const STAGE_ORDER = ['CONTRACT', 'DISCLOSURES', 'INSPECTION', 'APPRAISAL', 'LOAN', 'ESCROW', 'CLOSING', 'POST_CLOSE', 'OTHER'] as const;
type StageKey = typeof STAGE_ORDER[number];

const STAGE_LABELS: Record<StageKey, string> = {
  CONTRACT: 'Contract', DISCLOSURES: 'Disclosures', INSPECTION: 'Inspection',
  APPRAISAL: 'Appraisal', LOAN: 'Loan', ESCROW: 'Escrow',
  CLOSING: 'Closing', POST_CLOSE: 'Post-Close', OTHER: 'Other',
};

const STAGE_COLORS: Record<StageKey, string> = {
  CONTRACT: 'bg-blue-50 text-blue-700 border-blue-100', DISCLOSURES: 'bg-purple-50 text-purple-700 border-purple-100',
  INSPECTION: 'bg-orange-50 text-orange-700 border-orange-100', APPRAISAL: 'bg-teal-50 text-teal-700 border-teal-100',
  LOAN: 'bg-cyan-50 text-cyan-700 border-cyan-100', ESCROW: 'bg-indigo-50 text-indigo-700 border-indigo-100',
  CLOSING: 'bg-emerald-50 text-emerald-700 border-emerald-100', POST_CLOSE: 'bg-gray-100 text-gray-600 border-gray-200',
  OTHER: 'bg-gray-100 text-gray-500 border-gray-200',
};

const TYPE_TO_STAGE: Record<string, StageKey> = {
  purchase_agreement: 'CONTRACT', residential_purchase_agreement: 'CONTRACT', counter_offer: 'CONTRACT',
  disclosure: 'DISCLOSURES', advisory: 'DISCLOSURES', federal_compliance: 'DISCLOSURES',
  inspection: 'INSPECTION', inspection_report: 'INSPECTION', contingency_performance: 'INSPECTION',
  appraisal: 'APPRAISAL', appraisal_report: 'APPRAISAL',
  loan: 'LOAN', finance: 'LOAN',
  escrow: 'ESCROW',
  closing: 'CLOSING', verification_of_property: 'CLOSING',
};

function normalize(s: string) { return s.toLowerCase().replace(/[\s_-]+/g, '_').replace(/[^a-z0-9_]/g, ''); }
function docStage(documentType: string): StageKey { return TYPE_TO_STAGE[normalize(documentType)] ?? 'OTHER'; }

const STATUS_COLORS: Record<string, string> = {
  uploaded: 'bg-green-50 text-green-700 border-green-200', pending: 'bg-amber-50 text-amber-700 border-amber-200',
  approved: 'bg-blue-50 text-blue-700 border-blue-200', rejected: 'bg-red-50 text-red-700 border-red-200',
  superseded: 'bg-gray-100 text-gray-500 border-gray-200', under_review: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  signed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

function fileIcon(fileName: string | null) {
  const ext = (fileName ?? '').split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return '📄';
  if (['jpg', 'jpeg', 'png', 'webp'].includes(ext ?? '')) return '🖼️';
  return '📎';
}

function fmt(dateStr: string) { return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
function humanize(s: string) { return s.replace(/[_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()); }

interface Props {
  documents: ApiDocument[];
}

export default function AllDocumentsView({ documents }: Props) {
  const groups = new Map<StageKey, ApiDocument[]>();
  for (const doc of documents) {
    const stage = docStage(doc.documentType);
    if (!groups.has(stage)) groups.set(stage, []);
    groups.get(stage)!.push(doc);
  }

  const orderedGroups = STAGE_ORDER.filter((s) => groups.has(s)).map((s) => ({ stageKey: s, docs: groups.get(s)! }));
  const totalDocs = documents.length;

  if (totalDocs === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <FolderOpen className="w-10 h-10 text-gray-200 mb-3" />
        <p className="text-sm text-gray-500">No documents yet.</p>
        <p className="text-xs text-gray-400 mt-1">Documents are added as the transaction progresses.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 px-4 py-4 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900">All Transaction Documents</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Original uploads, AI-split documents, and all categorized files organized by stage
          </p>
        </div>
        <span className="text-xs font-medium bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full shrink-0">
          {totalDocs} document{totalDocs !== 1 ? 's' : ''}
        </span>
      </div>

      {orderedGroups.map(({ stageKey, docs }) => (
        <div key={stageKey}>
          <div className="flex items-center gap-2 mb-3">
            <span className={cn('text-xs font-semibold px-2.5 py-1 rounded-full border', STAGE_COLORS[stageKey])}>
              {STAGE_LABELS[stageKey]}
            </span>
            <span className="text-xs text-gray-400">{docs.length} document{docs.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left text-xs font-medium text-gray-500 px-4 py-2.5 w-8" />
                  <th className="text-left text-xs font-medium text-gray-500 px-4 py-2.5">Document</th>
                  <th className="text-left text-xs font-medium text-gray-500 px-4 py-2.5 hidden sm:table-cell">Type</th>
                  <th className="text-left text-xs font-medium text-gray-500 px-4 py-2.5 hidden md:table-cell">Status</th>
                  <th className="text-left text-xs font-medium text-gray-500 px-4 py-2.5 hidden md:table-cell">Uploaded</th>
                  <th className="text-right text-xs font-medium text-gray-500 px-4 py-2.5">View</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {docs.map((doc) => (
                  <tr key={doc.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-base">{fileIcon(doc.fileName)}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900 text-sm">{doc.title}</p>
                      {doc.fileName && doc.fileName !== doc.title && (
                        <p className="text-xs text-gray-400 mt-0.5">{doc.fileName}</p>
                      )}
                      {doc.versionNo > 1 && <p className="text-xs text-gray-400 mt-0.5">v{doc.versionNo}</p>}
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <span className="text-xs text-gray-500">{humanize(doc.documentType)}</span>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full border', STATUS_COLORS[doc.status] ?? 'bg-gray-100 text-gray-500 border-gray-200')}>
                        {doc.status.charAt(0).toUpperCase() + doc.status.slice(1)}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className="text-xs text-gray-500">{fmt(doc.createdAt)}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {doc.storageUrl ? (
                        <a href={doc.storageUrl} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium">
                          View
                        </a>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
