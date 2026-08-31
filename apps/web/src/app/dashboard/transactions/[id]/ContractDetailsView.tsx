'use client';

import React, { useState } from 'react';
import { FileText, AlertTriangle } from 'lucide-react';
import { Step1Parties } from '@/app/transactions/new/contract/review/steps/Step1Parties';
import { Step2Dates } from '@/app/transactions/new/contract/review/steps/Step2Dates';
import { Step3Contingencies } from '@/app/transactions/new/contract/review/steps/Step3Contingencies';
import { Step4Compliance } from '@/app/transactions/new/contract/review/steps/Step4Compliance';
import type { ExtractionResult, ComplianceResult } from '@/app/transactions/new/extraction-result.types';
import type { FinalNegotiatedTerms } from '@tc/shared';

// Error boundary prevents a crash in any Step component from unmounting the
// entire StagedSwimlane tree (which would snap the selected tab back to the
// current stage).
class ContractErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <AlertTriangle className="w-8 h-8 text-amber-400 mb-3" />
          <p className="text-sm text-gray-600">Contract data could not be displayed.</p>
          <p className="text-xs text-gray-400 mt-1">
            The extracted contract data may be in an unexpected format.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

interface Props {
  extractionResult: ExtractionResult | null;
  compliance: ComplianceResult | null;
  transactionId: string | null;
  finalTerms?: FinalNegotiatedTerms | null;
}

export default function ContractDetailsView({ extractionResult, compliance, transactionId, finalTerms }: Props) {
  const [reuploadedExtraction, setReuploadedExtraction] = useState<ExtractionResult | null>(null);

  if (!extractionResult) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <FileText className="w-8 h-8 text-gray-300 mb-3" />
        <p className="text-sm text-gray-500">No contract data available.</p>
        <p className="text-xs text-gray-400 mt-1">Contract data appears here once a PDF has been processed.</p>
      </div>
    );
  }
  const isAcroForm = compliance?.sourceType === 'acroform';
  const displayResult = reuploadedExtraction ?? extractionResult;
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

  async function handleReupload(file: File): Promise<{ extraction: ExtractionResult; compliance: ComplianceResult } | null> {
    if (!transactionId) return null;
    const form = new FormData();
    form.append('file', file);
    form.append('transactionId', transactionId);
    form.append('stage', 'contract');

    const res = await fetch(`${apiUrl}/api/v1/document-extraction/upload-and-extract`, {
      method: 'POST',
      body: form,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: 'Re-upload failed' })) as { message?: string };
      throw new Error(err.message ?? 'Re-upload failed');
    }
    const data = await res.json() as { extraction: ExtractionResult; compliance: ComplianceResult };
    setReuploadedExtraction(data.extraction);
    return data;
  }

  return (
    <ContractErrorBoundary>
      <div className="space-y-4 py-2">
        <Step1Parties result={displayResult} isAcroForm={isAcroForm} />
        <Step2Dates result={displayResult} isAcroForm={isAcroForm} />
        <Step3Contingencies result={displayResult} reminderSchedule={null} finalTerms={finalTerms} />
        <Step4Compliance result={displayResult} compliance={compliance} transactionId={transactionId} onReupload={handleReupload} />
      </div>
    </ContractErrorBoundary>
  );
}
