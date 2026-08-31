'use client';

import { useCallback, useEffect, useState } from 'react';
import UploadLinkLayout from '../shared/UploadLinkLayout';
import UploadDropzoneCard from '../shared/UploadDropzoneCard';
import RequiredDocumentUploadField from '../shared/RequiredDocumentUploadField';
import UploadedDocumentsSection from '../shared/UploadedDocumentsSection';
import ChecklistSidebar from '../shared/ChecklistSidebar';
import GeneratedCdaCard from '../shared/GeneratedCdaCard';
import TransactionCompletedBanner from '../shared/TransactionCompletedBanner';
import { getDocuments, getChecklist, getSignedCda } from '../shared/uploadLinkApi';
import type { UploadedDocument, UploadedDocumentCategory, UploadPageContext, PublicCdaDto } from '../shared/uploadLinkTypes';
import type { DocumentChecklistStatus } from '../shared/checklist.types';
import EscrowForm from './EscrowForm';
import { getEscrowHoaStatus } from './escrowUploadService';

/**
 * Required before the Escrow Officer's dedicated document types are
 * considered submitted. Signed RPA is deliberately not here: it's matched
 * by form code (like any other CAR form), not a dedicated upload button.
 * "HOA Documents" is rendered separately, conditional on the Seller Agent's
 * HOA answer.
 */
const REQUIRED_ESCROW_DOCUMENT_FIELDS: ReadonlyArray<{ category: UploadedDocumentCategory; label: string }> = [
  { category: 'escrow_instructions', label: 'Escrow Instructions' },
  { category: 'preliminary_title_report', label: 'Preliminary Title Report' },
  { category: 'estimated_closing_statement', label: 'Estimated Closing Statement' },
];

export default function EscrowUploadPage({ token, context }: { token: string; context: UploadPageContext }) {
  const [documents, setDocuments] = useState<UploadedDocument[]>([]);
  const [checklist, setChecklist] = useState<DocumentChecklistStatus | null>(null);
  const [escrowHasHoa, setEscrowHasHoa] = useState<boolean | null>(null);
  const [signedCda, setSignedCda] = useState<PublicCdaDto | null>(null);

  const loadDocuments = useCallback(() => {
    if (!token) return;
    getDocuments(token).then(setDocuments).catch(() => { /* the page still functions if the list fails to load */ });
  }, [token]);

  const loadChecklist = useCallback(() => {
    if (!token) return;
    getChecklist(token).then(setChecklist).catch(() => { /* the page still functions if the checklist fails to load */ });
  }, [token]);

  const loadSignedCda = useCallback(() => {
    if (!token) return;
    getSignedCda(token).then(setSignedCda).catch(() => { /* the page still functions if this fails to load */ });
  }, [token]);

  useEffect(() => { loadDocuments(); loadChecklist(); loadSignedCda(); }, [loadDocuments, loadChecklist, loadSignedCda]);
  useEffect(() => {
    if (!token) return;
    getEscrowHoaStatus(token).then(setEscrowHasHoa).catch(() => { /* the page still functions if this fails to load */ });
  }, [token]);

  // Poll only while at least one document is still being analyzed.
  useEffect(() => {
    if (!documents.some((d) => d.status === 'analyzing')) return;
    const interval = setInterval(() => { loadDocuments(); loadChecklist(); }, 4000);
    return () => clearInterval(interval);
  }, [documents, loadDocuments, loadChecklist]);

  return (
    <UploadLinkLayout
      hasSidebar
      sidebar={<ChecklistSidebar checklist={checklist} />}
      banner={checklist?.transactionCompleted ? <TransactionCompletedBanner /> : null}
    >
      <GeneratedCdaCard cda={signedCda} title="Signed CDA" description="The signed Commission Disbursement Authorization has been received." />

      <UploadDropzoneCard
        token={token}
        title="Upload Transaction Documents"
        recipientName={context.recipientName}
        propertyAddress={context.propertyAddress}
        maxFiles={context.fileLimits.maxFiles}
        onUploaded={() => { loadDocuments(); loadChecklist(); }}
      />

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-800">Required Documents</h2>
          <p className="text-xs text-gray-500 mt-0.5">Signed RPA can be uploaded through the general upload area above. Please upload the documents below as soon as they&apos;re available.</p>
        </div>
        <div className="px-6 py-5 space-y-3">
          {REQUIRED_ESCROW_DOCUMENT_FIELDS.map((f) => (
            <RequiredDocumentUploadField
              key={f.category}
              token={token}
              category={f.category}
              label={f.label}
              documents={documents}
              onUploaded={() => { loadDocuments(); loadChecklist(); }}
            />
          ))}
          {escrowHasHoa === true && (
            <RequiredDocumentUploadField
              key="hoa_document"
              token={token}
              category="hoa_document"
              label="HOA Documents"
              documents={documents}
              onUploaded={() => { loadDocuments(); loadChecklist(); }}
            />
          )}
        </div>
      </div>

      <EscrowForm token={token} />

      <UploadedDocumentsSection documents={documents} />
    </UploadLinkLayout>
  );
}
