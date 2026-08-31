'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  CheckCircle, XCircle, AlertTriangle, FileText, Building2, DollarSign,
  Phone, Mail, User, Upload, Loader2, FileUp, Pencil,
} from 'lucide-react';
import { INTAKE_CATALOG, type IntakeDocStatus } from './IntakeCatalog';
import type { ExtractionResult } from '@/app/transactions/new/extraction-result.types';

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

function DocStatusBadge({ status }: { status: IntakeDocStatus }) {
  const config: Record<IntakeDocStatus, { label: string; classes: string; icon: React.ElementType }> = {
    missing:  { label: 'Missing',  classes: 'bg-red-50 text-red-700 border-red-200',     icon: XCircle },
    received: { label: 'Received', classes: 'bg-amber-50 text-amber-700 border-amber-200', icon: Upload },
    verified: { label: 'Verified', classes: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle },
  };
  const c = config[status];
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full uppercase tracking-wide border flex items-center gap-1 ${c.classes}`}>
      <c.icon size={9} /> {c.label}
    </span>
  );
}

function computeDocStatus(doc: ApiDocument | undefined): IntakeDocStatus {
  if (!doc) return 'missing';
  const meta = (doc.metadataJson ?? {}) as Record<string, unknown>;
  const hasExtraction = !!(meta?.extraction);
  return hasExtraction ? 'verified' : 'received';
}

interface EditableFieldProps {
  label: string;
  value: string | null;
  onChange: (v: string) => void;
  icon: React.ElementType;
  placeholder?: string;
}

function EditableField({ label, value, onChange, icon: Icon, placeholder }: EditableFieldProps) {
  const [editing, setEditing] = useState(false);
  return (
    <div className="flex items-center gap-2 py-1.5 group">
      <Icon size={12} className="text-gray-400 shrink-0" />
      <span className="text-[10px] text-gray-500 w-28 shrink-0">{label}</span>
      {editing ? (
        <input
          type="text"
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => setEditing(false)}
          onKeyDown={(e) => { if (e.key === 'Enter') setEditing(false); }}
          autoFocus
          placeholder={placeholder}
          className="flex-1 text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
      ) : (
        <>
          <span className={`text-xs flex-1 ${value ? 'text-gray-800 font-medium' : 'text-gray-300 italic'}`}>
            {value || placeholder || 'Not provided'}
          </span>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-gray-600 shrink-0"
          >
            <Pencil size={11} />
          </button>
        </>
      )}
    </div>
  );
}

type UploadState = 'idle' | 'uploading' | 'analyzing' | 'done' | 'error';

interface Props {
  transactionId: string;
  extractionResult: ExtractionResult | null;
  intakeDocuments: ApiDocument[];
}

export default function IntakeDetailsView({ transactionId, extractionResult, intakeDocuments }: Props) {
  const router = useRouter();
  const prequalFileRef = useRef<HTMLInputElement>(null);
  const pofFileRef = useRef<HTMLInputElement>(null);

  // Upload states per document type
  const [uploadStates, setUploadStates] = useState<Record<string, UploadState>>({});
  const [uploadErrors, setUploadErrors] = useState<Record<string, string | null>>({});

  // Local copy of documents for immediate UI updates after upload
  const [localDocs, setLocalDocs] = useState<ApiDocument[]>(intakeDocuments);

  // Sync local docs when props update (e.g. after router.refresh)
  useEffect(() => {
    setLocalDocs(intakeDocuments);
  }, [intakeDocuments]);

  // Find PREQUAL document and read its extraction data
  const prequalDoc = localDocs.find((d) => {
    const meta = (d.metadataJson ?? {}) as Record<string, unknown>;
    return (meta?.detectedFormCode as string)?.toUpperCase() === 'PREQUAL';
  });
  const prequalMeta = (prequalDoc?.metadataJson ?? {}) as Record<string, unknown>;
  const prequalExtraction = (prequalMeta?.extraction ?? null) as ExtractionResult | null;

  // Lender info from PREQUAL document first, fallback to RPA extraction
  const prequalLender = prequalExtraction?.parties?.lenders?.[0];
  const rpaLender = extractionResult?.parties?.lenders?.[0];
  const lender = prequalLender ?? rpaLender;

  // Editable lender fields — only basic contact info
  const [lenderName, setLenderName] = useState<string | null>(null);
  const [loanOfficer, setLoanOfficer] = useState<string | null>(null);
  const [officerEmail, setOfficerEmail] = useState<string | null>(null);
  const [officerPhone, setOfficerPhone] = useState<string | null>(null);

  // Auto-populate editable fields from extraction data on load
  useEffect(() => {
    if (lender?.companyName) setLenderName((p) => p ?? lender.companyName);
    if (lender?.contactName) setLoanOfficer((p) => p ?? lender.contactName);
    if (lender?.email) setOfficerEmail((p) => p ?? lender.email);
    if (lender?.phone) setOfficerPhone((p) => p ?? lender.phone);
  }, [lender?.companyName, lender?.contactName, lender?.email, lender?.phone]);

  // Financial data from PREQUAL first, fallback to RPA
  const prequalTx = prequalExtraction?.transaction;
  const rpaTx = extractionResult?.transaction;
  const financingType = prequalTx?.financingType ?? rpaTx?.financingType;
  const loanAmount = prequalTx?.loanAmount ?? rpaTx?.loanAmount;

  const catalogDocs = INTAKE_CATALOG.map((entry) => {
    const doc = localDocs.find((d) => {
      const meta = (d.metadataJson ?? {}) as Record<string, unknown>;
      const detectedCode = (meta?.detectedFormCode as string)?.toUpperCase();
      if (detectedCode === entry.formCode) return true;
      // Fallback: match by title (for docs where LLM didn't detect form code)
      if (entry.formCode === 'PREQUAL' && d.title?.toLowerCase().includes('prequal')) return true;
      if (entry.formCode === 'POF' && (d.title?.toLowerCase().includes('proof') || d.title?.toLowerCase().includes('funds'))) return true;
      return false;
    });
    return { entry, doc, status: computeDocStatus(doc ?? undefined) };
  }).sort((a, b) => a.entry.sortOrder - b.entry.sortOrder);

  const missingCount = catalogDocs.filter((d) => d.entry.required && d.status === 'missing').length;

  // Find POF document and read its extraction
  const pofDoc = localDocs.find((d) => {
    const meta = (d.metadataJson ?? {}) as Record<string, unknown>;
    return (meta?.detectedFormCode as string)?.toUpperCase() === 'POF';
  });
  const pofMeta = (pofDoc?.metadataJson ?? {}) as Record<string, unknown>;
  const pofExtraction = (pofMeta?.extraction ?? null) as ExtractionResult | null;
  const pofTransaction = pofExtraction?.transaction;
  const pofParties = pofExtraction?.parties;

  // Editable POF fields
  const [pofInstitution, setPofInstitution] = useState<string | null>(null);
  const [pofAccountHolder, setPofAccountHolder] = useState<string | null>(null);
  const [pofAvailableFunds, setPofAvailableFunds] = useState<string | null>(null);
  const [pofStatementDate, setPofStatementDate] = useState<string | null>(null);
  const [pofAccountType, setPofAccountType] = useState<string | null>(null);

  const hasLenderInfo = !!(lender || financingType || loanAmount);
  const hasPofInfo = !!(pofDoc && (pofTransaction?.loanAmount || pofExtraction));

  async function handleUpload(file: File, formCode: string, title: string) {
    setUploadStates((prev) => ({ ...prev, [formCode]: 'uploading' }));
    setUploadErrors((prev) => ({ ...prev, [formCode]: null }));

    const form = new FormData();
    form.append('file', file);
    form.append('transactionId', transactionId);
    form.append('stage', 'intake');
    form.append('documentType', 'intake_document');
    form.append('title', title);

    try {
      const res = await fetch('/api/v1/document-extraction/upload-and-extract', {
        method: 'POST',
        credentials: 'include',
        body: form,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Upload failed' }));
        throw new Error((err as { message?: string }).message ?? 'Upload failed');
      }

      const result = await res.json() as {
        document?: ApiDocument;
        detectedFormCode?: string | null;
      };

      // Optimistically add document to local state for immediate UI update
      if (result.document) {
        const doc = result.document;
        // Always tag with expected form code — the catalog matches by this field
        doc.metadataJson = {
          ...doc.metadataJson,
          detectedFormCode: result.detectedFormCode || formCode,
        };
        setLocalDocs((prev) => [...prev.filter((d) => {
          const meta = (d.metadataJson ?? {}) as Record<string, unknown>;
          return (meta?.detectedFormCode as string)?.toUpperCase() !== formCode;
        }), doc]);
      }

      setUploadStates((prev) => ({ ...prev, [formCode]: 'analyzing' }));
      setTimeout(() => {
        setUploadStates((prev) => ({ ...prev, [formCode]: 'done' }));
        router.refresh();
      }, 1500);
    } catch (err) {
      setUploadErrors((prev) => ({ ...prev, [formCode]: (err as Error).message }));
      setUploadStates((prev) => ({ ...prev, [formCode]: 'error' }));
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>, formCode: string) {
    const file = e.target.files?.[0];
    if (file) handleUpload(file, formCode, formCode === 'PREQUAL' ? 'Lender Prequalification Letter' : 'Buyer Proof of Funds');
    e.target.value = '';
  }

  return (
    <div className="py-4 space-y-4">
      {/* Financing Package Header */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="px-5 py-4 bg-blue-50 border-b border-blue-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
              <Building2 size={16} className="text-blue-600" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-800">Buyer Financing Package</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Required qualification documents for buyer financing verification.
              </p>
            </div>
            {missingCount > 0 && (
              <span className="ml-auto flex items-center gap-1 text-[10px] font-semibold text-red-700 bg-red-50 border border-red-200 px-2 py-1 rounded-full">
                <AlertTriangle size={9} /> {missingCount} missing
              </span>
            )}
          </div>
        </div>
        <div className="divide-y divide-gray-100">
          {catalogDocs.map(({ entry, status }) => (
            <div key={entry.formCode} className="px-5 py-2.5 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-gray-800">{entry.formName}</span>
                  <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                    Required
                  </span>
                </div>
                <p className="text-[10px] text-gray-400 mt-0.5">{entry.description}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <DocStatusBadge status={status} />
                {status === 'missing' && (
                  <button
                    type="button"
                    onClick={() => (entry.formCode === 'PREQUAL' ? prequalFileRef : pofFileRef).current?.click()}
                    className="flex items-center gap-1 text-[10px] font-medium text-blue-600 hover:text-blue-800 bg-blue-50 border border-blue-200 rounded px-2 py-1"
                  >
                    <Upload size={10} /> Upload
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
        {missingCount > 0 && (
          <div className="px-5 py-2 bg-red-50 border-t border-red-100">
            <p className="text-xs text-red-600 flex items-center gap-1.5">
              <AlertTriangle size={11} />
              Buyer financing documentation is incomplete. {missingCount} required document{missingCount !== 1 ? 's' : ''} outstanding.
            </p>
          </div>
        )}
      </div>

      {/* Dedicated Upload Panels */}
      {(['PREQUAL', 'POF'] as const).map((formCode) => {
        const entry = catalogDocs.find((d) => d.entry.formCode === formCode);
        if (!entry || entry.status !== 'missing') return null;
        const state = uploadStates[formCode] ?? 'idle';
        const error = uploadErrors[formCode] ?? null;
        const isPrequal = formCode === 'PREQUAL';
        const fileRef = isPrequal ? prequalFileRef : pofFileRef;
        const title = isPrequal ? 'Lender Prequalification Letter' : 'Buyer Proof of Funds';
        const description = isPrequal
          ? "Upload the buyer's lender prequalification letter. The document will be automatically analyzed and lender information extracted."
          : "Upload the buyer's proof of funds document. The document will be automatically analyzed and account information extracted.";
        const analyzingMsg = isPrequal
          ? 'Extracting lender information'
          : 'Extracting account information';
        const doneMsg = isPrequal
          ? 'Lender information has been extracted and populated below.'
          : 'Proof of funds has been verified and populated below.';
        const btnLabel = isPrequal ? 'Upload Prequalification Letter' : 'Upload Proof of Funds';

        return (
          <div key={formCode} className="rounded-xl border-2 border-dashed border-blue-200 bg-blue-50/50 p-6">
            <input ref={fileRef} type="file" accept=".pdf,application/pdf" className="hidden" onChange={(e) => handleFileSelect(e, formCode)} />
            {state === 'idle' && (
              <div className="text-center">
                <FileUp size={32} className="text-blue-400 mx-auto mb-3" />
                <h3 className="text-sm font-semibold text-gray-800 mb-1">{title} (Required)</h3>
                <p className="text-xs text-gray-500 mb-3 max-w-sm mx-auto">{description}</p>
                <button type="button" onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-700 text-white text-sm font-medium rounded-lg hover:bg-blue-800 transition-colors">
                  <Upload size={14} /> {btnLabel}
                </button>
                <p className="text-[10px] text-gray-400 mt-2">PDF only</p>
              </div>
            )}
            {state === 'uploading' && (
              <div className="flex items-center justify-center gap-3 py-4">
                <Loader2 size={20} className="animate-spin text-blue-500" />
                <div><p className="text-sm font-medium text-gray-700">Uploading document...</p><p className="text-xs text-gray-400">Sending to MyTC</p></div>
              </div>
            )}
            {state === 'analyzing' && (
              <div className="flex items-center justify-center gap-3 py-4">
                <Loader2 size={20} className="animate-spin text-blue-500" />
                <div><p className="text-sm font-medium text-gray-700">Analyzing document...</p><p className="text-xs text-gray-400">{analyzingMsg}</p></div>
              </div>
            )}
            {state === 'done' && (
              <div className="text-center py-2">
                <div className="flex items-center justify-center gap-2 text-emerald-600 mb-1">
                  <CheckCircle size={18} /><span className="text-sm font-semibold">Document uploaded and analyzed</span>
                </div>
                <p className="text-xs text-gray-500">{doneMsg}</p>
              </div>
            )}
            {state === 'error' && (
              <div className="text-center">
                <div className="flex items-center justify-center gap-2 text-red-600 mb-2">
                  <XCircle size={18} /><span className="text-sm font-semibold">Upload failed</span>
                </div>
                <p className="text-xs text-red-500 mb-3">{error}</p>
                <button type="button" onClick={() => { setUploadStates((p) => ({ ...p, [formCode]: 'idle' })); setUploadErrors((p) => ({ ...p, [formCode]: null })); }} className="text-xs text-blue-600 hover:text-blue-800 font-medium">Try again</button>
              </div>
            )}
          </div>
        );
      })}

      {/* Editable Lender Information */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Building2 size={14} className="text-gray-500" />
            <h3 className="text-sm font-semibold text-gray-700">Lender Information</h3>
            <span className="text-[9px] text-gray-400 ml-auto">hover to edit</span>
          </div>
        </div>
        <div className="px-5 py-3 space-y-0.5">
          <EditableField icon={Building2} label="Lender Name" value={lenderName ?? lender?.companyName ?? null} onChange={setLenderName} placeholder="e.g. First National Bank" />
          <EditableField icon={User} label="Loan Officer" value={loanOfficer ?? lender?.contactName ?? null} onChange={setLoanOfficer} placeholder="e.g. John Smith" />
          <EditableField icon={Mail} label="Lender Email" value={officerEmail ?? lender?.email ?? null} onChange={setOfficerEmail} placeholder="loan.officer@bank.com" />
          <EditableField icon={Phone} label="Phone" value={officerPhone ?? lender?.phone ?? null} onChange={setOfficerPhone} placeholder="(555) 123-4567" />
        </div>
      </div>

      {/* Missing Fields Warning */}
      {!lender?.email && catalogDocs.some((d) => d.status === 'verified') && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-2">
            <AlertTriangle size={14} className="text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-medium text-amber-700">Missing Information</p>
              <p className="text-xs text-amber-600 mt-0.5">
                Some lender details could not be automatically extracted. Fields marked &quot;Not provided&quot; can be edited by hovering and clicking the edit icon.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Proof of Funds Information */}
      {hasPofInfo && (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <DollarSign size={14} className="text-gray-500" />
              <h3 className="text-sm font-semibold text-gray-700">Proof of Funds</h3>
              <span className="text-[9px] text-gray-400 ml-auto">hover to edit</span>
            </div>
          </div>
          <div className="px-5 py-3 space-y-0.5">
            <EditableField icon={Building2} label="Institution" value={pofInstitution ?? pofParties?.lenders?.[0]?.companyName ?? null} onChange={setPofInstitution} placeholder="e.g. Chase Bank" />
            <EditableField icon={User} label="Account Holder" value={pofAccountHolder ?? pofParties?.buyers?.[0]?.fullName ?? null} onChange={setPofAccountHolder} placeholder="Buyer name" />
            <EditableField icon={DollarSign} label="Available Funds" value={pofAvailableFunds ?? (pofTransaction?.loanAmount ? `$${pofTransaction.loanAmount.toLocaleString()}` : null) ?? null} onChange={setPofAvailableFunds} placeholder="$0.00" />
            <EditableField icon={FileText} label="Statement Date" value={pofStatementDate ?? pofTransaction?.offerDate ?? null} onChange={setPofStatementDate} placeholder="MM/DD/YYYY" />
            <EditableField icon={Building2} label="Account Type" value={pofAccountType ?? null} onChange={setPofAccountType} placeholder="Checking, Savings, Investment..." />
          </div>
        </div>
      )}

      {/* Empty state */}
      {!hasLenderInfo && !hasPofInfo && (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="px-5 py-8 text-center">
            <FileText size={24} className="text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500">Lender information not yet available.</p>
            <p className="text-xs text-gray-400 mt-1">
              Upload a Lender Prequalification Letter above to auto-extract financing details.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
