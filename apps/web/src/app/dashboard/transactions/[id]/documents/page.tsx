import Link from 'next/link';
import { ArrowLeft, ExternalLink, FolderOpen } from 'lucide-react';
import { api, ApiDocument, ApiTransaction } from '@/lib/api';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

// ── Stage grouping ─────────────────────────────────────────────────────────────

const STAGE_ORDER = [
  'CONTRACT', 'DISCLOSURES', 'INSPECTION', 'APPRAISAL',
  'LOAN', 'ESCROW', 'CLOSING', 'POST_CLOSE', 'OTHER',
] as const;

type StageKey = typeof STAGE_ORDER[number];

const STAGE_LABELS: Record<StageKey, string> = {
  CONTRACT:    'Contract',
  DISCLOSURES: 'Disclosures',
  INSPECTION:  'Inspection',
  APPRAISAL:   'Appraisal',
  LOAN:        'Loan',
  ESCROW:      'Escrow',
  CLOSING:     'Closing',
  POST_CLOSE:  'Post-Close',
  OTHER:       'Other',
};

const STAGE_COLORS: Record<StageKey, string> = {
  CONTRACT:    'bg-blue-50 text-blue-700 border-blue-100',
  DISCLOSURES: 'bg-purple-50 text-purple-700 border-purple-100',
  INSPECTION:  'bg-orange-50 text-orange-700 border-orange-100',
  APPRAISAL:   'bg-teal-50 text-teal-700 border-teal-100',
  LOAN:        'bg-cyan-50 text-cyan-700 border-cyan-100',
  ESCROW:      'bg-indigo-50 text-indigo-700 border-indigo-100',
  CLOSING:     'bg-emerald-50 text-emerald-700 border-emerald-100',
  POST_CLOSE:  'bg-gray-100 text-gray-600 border-gray-200',
  OTHER:       'bg-gray-100 text-gray-500 border-gray-200',
};

// Normalize a documentType string to a stage key
const TYPE_TO_STAGE: Record<string, StageKey> = {
  purchase_agreement:              'CONTRACT',
  residential_purchase_agreement:  'CONTRACT',
  disclosure:                      'DISCLOSURES',
  inspection_report:               'INSPECTION',
  inspection_report_2:             'INSPECTION',
  appraisal:                       'APPRAISAL',
  loan:                            'LOAN',
  escrow:                          'ESCROW',
  closing:                         'CLOSING',
};

function normalize(s: string) {
  return s.toLowerCase().replace(/[\s_-]+/g, '_').replace(/[^a-z0-9_]/g, '');
}

function docStage(documentType: string): StageKey {
  return TYPE_TO_STAGE[normalize(documentType)] ?? 'OTHER';
}

// ── Status badge ───────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  uploaded:   'bg-green-50 text-green-700 border-green-200',
  pending:    'bg-amber-50 text-amber-700 border-amber-200',
  approved:   'bg-blue-50 text-blue-700 border-blue-200',
  rejected:   'bg-red-50 text-red-700 border-red-200',
  superseded: 'bg-gray-100 text-gray-500 border-gray-200',
  signed:     'bg-emerald-50 text-emerald-700 border-emerald-200',
};

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-500 border-gray-200';
  return (
    <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full border', cls)}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fileIcon(fileName: string | null) {
  const ext = (fileName ?? '').split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return '📄';
  if (['jpg', 'jpeg', 'png', 'webp'].includes(ext ?? '')) return '🖼️';
  if (['doc', 'docx'].includes(ext ?? '')) return '📝';
  return '📎';
}

function fmt(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function humanize(s: string) {
  return s.replace(/[_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function addressLine(tx: ApiTransaction) {
  const parts = [tx.propertyAddressLine1, tx.propertyCity, tx.propertyState].filter(Boolean);
  return parts.join(', ') || 'Address TBD';
}

// ── Document group ─────────────────────────────────────────────────────────────

function DocGroup({ stageKey, docs }: { stageKey: StageKey; docs: ApiDocument[] }) {
  const colors = STAGE_COLORS[stageKey];
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className={cn('text-xs font-semibold px-2.5 py-1 rounded-full border', colors)}>
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
              <th className="text-right text-xs font-medium text-gray-500 px-4 py-2.5">Action</th>
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
                  {doc.versionNo > 1 && (
                    <p className="text-xs text-gray-400 mt-0.5">v{doc.versionNo}</p>
                  )}
                </td>
                <td className="px-4 py-3 hidden sm:table-cell">
                  <span className="text-xs text-gray-500">{humanize(doc.documentType)}</span>
                </td>
                <td className="px-4 py-3 hidden md:table-cell">
                  <StatusBadge status={doc.status} />
                </td>
                <td className="px-4 py-3 hidden md:table-cell">
                  <span className="text-xs text-gray-500">{fmt(doc.createdAt)}</span>
                </td>
                <td className="px-4 py-3 text-right">
                  {doc.storageUrl ? (
                    <a
                      href={doc.storageUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
                    >
                      View <ExternalLink className="w-3 h-3" />
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
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default async function TransactionDocumentsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [tx, docs] = await Promise.all([
    api.transactions.get(id),
    api.documents.byTransaction(id),
  ]);

  // Group documents by stage, preserving STAGE_ORDER
  const groups = new Map<StageKey, ApiDocument[]>();
  for (const doc of docs ?? []) {
    const stage = docStage(doc.documentType);
    if (!groups.has(stage)) groups.set(stage, []);
    groups.get(stage)!.push(doc);
  }

  const orderedGroups = STAGE_ORDER
    .filter((s) => groups.has(s))
    .map((s) => ({ stageKey: s, docs: groups.get(s)! }));

  const totalDocs = docs?.length ?? 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 mb-3 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Dashboard
        </Link>

        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">All Documents</h1>
            {tx && (
              <p className="text-sm text-gray-500 mt-0.5">{addressLine(tx)}</p>
            )}
          </div>
          <span className="text-xs font-medium bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full shrink-0">
            {totalDocs} document{totalDocs !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Document groups */}
      {orderedGroups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center bg-white rounded-xl border border-gray-200">
          <FolderOpen className="w-10 h-10 text-gray-200 mb-3" />
          <p className="text-sm text-gray-500">No documents yet.</p>
          <p className="text-xs text-gray-400 mt-1">
            Documents are added as the transaction progresses through each stage.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {orderedGroups.map(({ stageKey, docs }) => (
            <DocGroup key={stageKey} stageKey={stageKey} docs={docs} />
          ))}
        </div>
      )}
    </div>
  );
}
