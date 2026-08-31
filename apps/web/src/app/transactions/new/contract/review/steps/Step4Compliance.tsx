'use client';

import { useRef, useState } from 'react';
import { FileCheck, Upload, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { StepCard, StepCardHeader, StepCardBody, SectionDivider, RpaComplianceSection, FormStatusBadge, ComplianceBadge } from '../review-shared';
import { cn } from '@/lib/utils';
import type { ExtractionResult, ComplianceResult, ExtractionForm } from '../../../extraction-result.types';

export function Step4Compliance({ result, compliance, transactionId, onReupload, allForms }: {
  result: ExtractionResult;
  compliance: ComplianceResult | null;
  transactionId: string | null;
  onReupload: (file: File) => Promise<{ extraction: ExtractionResult; compliance: ComplianceResult } | null>;
  allForms?: ExtractionForm[];
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);

  const canReupload = !uploading && !uploadSuccess && transactionId;

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const result = await onReupload(file);
      if (result) {
        setUploadSuccess(true);
        setTimeout(() => setUploadSuccess(false), 5000);
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  return (
    <StepCard>
      <StepCardHeader
        title="Compliance & Forms"
        description="Review RPA compliance checks and attached disclosure forms."
        badge={compliance && <ComplianceBadge summary={compliance.summary} />}
      />

      {/* RPA Compliance */}
      <SectionDivider title="Contract Form Compliance" icon={FileCheck} />
      <StepCardBody className="border-b border-gray-100">
        {compliance ? (
          <>
            <div className="flex gap-3 text-xs text-gray-500 mb-4">
              <span className="text-green-700 font-medium">{compliance.summary.passCount} passed</span>
              {compliance.summary.failCount > 0 && <span className="text-red-700 font-medium">{compliance.summary.failCount} failed</span>}
              {compliance.summary.warningCount > 0 && <span className="text-amber-700 font-medium">{compliance.summary.warningCount} warnings</span>}
            </div>
            <RpaComplianceSection compliance={compliance} />
          </>
        ) : (
          <p className="text-sm text-gray-400">Compliance data not available — re-upload to generate a report.</p>
        )}
      </StepCardBody>

      {/* Forms & Disclosures */}
      <SectionDivider title="Forms & Disclosures" icon={FileCheck} />
      <StepCardBody>
        {(() => {
          const forms = allForms ?? (result.formsAndDisclosures ?? []);
          const attached = forms.filter(f => f.status === 'attached');
          if (attached.length === 0) {
            return <p className="text-sm text-gray-400">No forms attached to this document.</p>;
          }
          return (
            <div className="space-y-2">
              {attached.map((form, i) => (
                <div key={i} className="flex items-center justify-between py-2.5 px-3 bg-gray-50 border border-gray-200 rounded-lg">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{form.title}</p>
                    {form.formCode && <p className="text-xs text-gray-400">{form.formCode}</p>}
                  </div>
                  <FormStatusBadge status={form.status} />
                </div>
              ))}
            </div>
          );
        })()}
      </StepCardBody>

      {/* Upload forms */}
      <SectionDivider title="Upload Forms" icon={Upload} />
      <StepCardBody>
        {uploadSuccess ? (
          <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700">
            <CheckCircle2 size={16} className="shrink-0" />
            Document uploaded successfully. Compliance report has been updated.
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-gray-600">
              Upload form PDFs to update compliance checks. New documents will create new versions as needed.
            </p>
            {uploadError && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                <AlertCircle size={14} className="shrink-0" />
                {uploadError}
              </div>
            )}
            <div className="flex items-center gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,application/pdf"
                onChange={handleFileSelected}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={!canReupload}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors',
                  'hover:bg-blue-800 disabled:opacity-40 disabled:cursor-not-allowed',
                )}
              >
                {uploading ? (
                  <><Loader2 size={14} className="animate-spin" /> Uploading…</>
                ) : (
                  <><Upload size={14} /> Select PDF to Upload</>
                )}
              </button>
            </div>
          </div>
        )}
      </StepCardBody>
    </StepCard>
  );
}
