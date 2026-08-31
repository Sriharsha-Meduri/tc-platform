import { FileText, Layers, Eye, Calendar } from 'lucide-react';
import type { ApiDocument } from '@/lib/api';
import { readToken } from '@/lib/client-api';

interface Props {
  documents: ApiDocument[];
  transactionNumber: string;
}

function fmt(dateStr: string | null | undefined) {
  if (!dateStr) return null;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function docLabel(doc: ApiDocument): string {
  const meta = doc.metadataJson as Record<string, unknown> | null;
  const formCode = meta?.detectedFormCode as string | undefined;
  const formName = meta?.detectedFormName as string | undefined;
  if (formName) return formName;
  if (formCode) return formCode;
  return doc.title || doc.fileName || 'Document';
}

function docSource(doc: ApiDocument): string {
  if (doc.isOriginalPackage) return 'Original Upload';
  if (doc.sourceDocumentId) return 'AI-Split';
  return doc.documentType?.replace(/_/g, ' ') || 'Upload';
}

const DOC_TYPE_LABELS: Record<string, string> = {
  purchase_agreement: 'Purchase Agreement',
  disclosure: 'Disclosure',
  counter_offer: 'Counter Offer',
  inspection: 'Inspection',
  inspection_report: 'Inspection Report',
  appraisal: 'Appraisal',
  appraisal_report: 'Appraisal Report',
  loan: 'Loan',
  finance: 'Finance',
  escrow: 'Escrow',
  closing: 'Closing',
  intake_document: 'Qualification',
  verification_of_property: 'Verification of Property',
};

async function viewDocument(url: string | null) {
  if (!url) return;
  const token = readToken();
  try {
    const res = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: 'include',
    });
    if (!res.ok) throw new Error('Failed to load document');
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    window.open(blobUrl, '_blank');
  } catch (err) {
    alert('Failed to open document: ' + (err instanceof Error ? err.message : 'Unknown error'));
  }
}

export default function BrokerDocumentView({ documents, transactionNumber }: Props) {
  const activeDocs = documents.filter(
    (d) => d.status !== 'superseded' && d.status !== 'rejected',
  );

  if (activeDocs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <FileText size={32} className="text-gray-300 mb-3" />
        <p className="text-sm text-gray-500">No documents have been uploaded yet.</p>
        <p className="text-xs text-gray-400 mt-1">Transaction #{transactionNumber}</p>
      </div>
    );
  }

  const originalDocs = activeDocs.filter((d) => d.isOriginalPackage);
  const aiSplitDocs = activeDocs.filter((d) => !d.isOriginalPackage);

  return (
    <div className="flex-1 min-h-0 overflow-auto">
      <div className="px-6 py-5 border-b border-gray-100">
        <h2 className="text-base font-semibold text-gray-800">Documents</h2>
        <p className="text-xs text-gray-500 mt-0.5">Transaction #{transactionNumber} · {activeDocs.length} document{activeDocs.length !== 1 ? 's' : ''}</p>
      </div>

      <div className="p-6 space-y-6">
        {/* Original Uploads */}
        {originalDocs.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-6 py-3 bg-gray-50 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Layers size={14} className="text-gray-400" />
                <span className="text-sm font-medium text-gray-700">Original Uploads</span>
                <span className="text-xs text-gray-400">({originalDocs.length})</span>
              </div>
            </div>
            <div className="divide-y divide-gray-100">
              {originalDocs.map((doc) => (
                <div key={doc.id} className="flex items-center gap-4 px-6 py-3.5 hover:bg-gray-50/50">
                  <FileText size={18} className="text-gray-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800 truncate">{doc.fileName || doc.title || 'Document'}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {DOC_TYPE_LABELS[doc.documentType] || doc.documentType}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-gray-400 shrink-0">
                    <Calendar size={12} />
                    <span>{fmt(doc.createdAt)}</span>
                  </div>
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 shrink-0">
                    Original
                  </span>
                  <button
                    onClick={() => viewDocument(doc.storageUrl ?? null)}
                    className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium shrink-0"
                  >
                    <Eye size={12} />
                    View
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* AI-Split Documents */}
        {aiSplitDocs.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-6 py-3 bg-gray-50 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Layers size={14} className="text-gray-400" />
                <span className="text-sm font-medium text-gray-700">AI-Extracted Documents</span>
                <span className="text-xs text-gray-400">({aiSplitDocs.length})</span>
              </div>
            </div>
            <div className="divide-y divide-gray-100">
              {aiSplitDocs.map((doc) => (
                <div key={doc.id} className="flex items-center gap-4 px-6 py-3.5 hover:bg-gray-50/50">
                  <FileText size={18} className="text-gray-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800 truncate">{docLabel(doc)}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{docSource(doc)}</p>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-gray-400 shrink-0">
                    <Calendar size={12} />
                    <span>{fmt(doc.createdAt)}</span>
                  </div>
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-purple-50 text-purple-600 shrink-0">
                    AI-Split
                  </span>
                  <button
                    onClick={() => viewDocument(doc.storageUrl ?? null)}
                    className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium shrink-0"
                  >
                    <Eye size={12} />
                    View
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
