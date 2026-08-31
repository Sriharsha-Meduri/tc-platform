'use client';

import { useCallback, useEffect, useState } from 'react';
import UploadLinkLayout from '../shared/UploadLinkLayout';
import UploadDropzoneCard from '../shared/UploadDropzoneCard';
import RequiredDocumentUploadField from '../shared/RequiredDocumentUploadField';
import UploadedDocumentsSection from '../shared/UploadedDocumentsSection';
import ChecklistSidebar from '../shared/ChecklistSidebar';
import GeneratedCdaCard from '../shared/GeneratedCdaCard';
import TransactionCompletedBanner from '../shared/TransactionCompletedBanner';
import { getDocuments, getChecklist, getCda, getSellerAgentStatus } from '../shared/uploadLinkApi';
import type { UploadedDocument, UploadedDocumentCategory, UploadPageContext, PublicCdaDto } from '../shared/uploadLinkTypes';
import type { DocumentChecklistStatus } from '../shared/checklist.types';
import BuyerAgentTransactionInfoForm from './BuyerAgentTransactionInfoForm';
import SellerStatusPendingBanner from './SellerStatusPendingBanner';

/** How often to re-poll the Seller Agent's status while still pending — this page has no other trigger (uploads, analysis) for that side's status changing, so it needs its own light poll. */
const SELLER_STATUS_POLL_MS = 15_000;

/** Required before the Buyer Agent can complete the transaction-info submission. */
const REQUIRED_DOCUMENT_FIELDS: ReadonlyArray<{ category: UploadedDocumentCategory; label: string }> = [
  { category: 'lender_prequalification', label: 'Lender Prequalification Letter' },
  { category: 'proof_of_funds', label: 'Buyer Proof of Funds' },
];

export default function BuyerAgentUploadPage({ token, context }: { token: string; context: UploadPageContext }) {
  const [documents, setDocuments] = useState<UploadedDocument[]>([]);
  const [checklist, setChecklist] = useState<DocumentChecklistStatus | null>(null);
  const [cda, setCda] = useState<PublicCdaDto | null>(null);
  const [sellerStatus, setSellerStatus] = useState<{ allRequiredSubmitted: boolean } | null>(null);

  const loadDocuments = useCallback(() => {
    if (!token) return;
    getDocuments(token).then(setDocuments).catch(() => { /* the page still functions if the list fails to load */ });
  }, [token]);

  const loadChecklist = useCallback(() => {
    if (!token) return;
    getChecklist(token).then(setChecklist).catch(() => { /* the page still functions if the checklist fails to load */ });
  }, [token]);

  const loadCda = useCallback(() => {
    if (!token) return;
    getCda(token).then(setCda).catch(() => { /* the page still functions if the CDA fails to load */ });
  }, [token]);

  const loadSellerStatus = useCallback(() => {
    if (!token) return;
    getSellerAgentStatus(token).then(setSellerStatus).catch(() => { /* the page still functions if this fails to load */ });
  }, [token]);

  useEffect(() => { loadDocuments(); loadChecklist(); loadCda(); loadSellerStatus(); }, [loadDocuments, loadChecklist, loadCda, loadSellerStatus]);

  // Poll only while at least one document is still being analyzed.
  useEffect(() => {
    if (!documents.some((d) => d.status === 'analyzing')) return;
    const interval = setInterval(() => { loadDocuments(); loadChecklist(); }, 4000);
    return () => clearInterval(interval);
  }, [documents, loadDocuments, loadChecklist]);

  // The Seller Agent submits their own documents on an entirely different
  // page — nothing on this page ever triggers that change, so this poll is
  // the only way the notice can disappear automatically once they're done.
  useEffect(() => {
    if (sellerStatus?.allRequiredSubmitted !== false) return;
    const interval = setInterval(loadSellerStatus, SELLER_STATUS_POLL_MS);
    return () => clearInterval(interval);
  }, [sellerStatus, loadSellerStatus]);

  const showSellerStatusPendingBanner = sellerStatus != null && !sellerStatus.allRequiredSubmitted;
  const showTransactionCompletedBanner = checklist?.transactionCompleted ?? false;

  return (
    <UploadLinkLayout
      hasSidebar
      sidebar={<ChecklistSidebar checklist={checklist} />}
      banner={(showSellerStatusPendingBanner || showTransactionCompletedBanner) && (
        <>
          {showSellerStatusPendingBanner && <SellerStatusPendingBanner />}
          {showTransactionCompletedBanner && <TransactionCompletedBanner />}
        </>
      )}
    >
      <UploadDropzoneCard
        token={token}
        title="Upload Documents from Buyer Agent"
        recipientName={context.recipientName}
        propertyAddress={context.propertyAddress}
        maxFiles={context.fileLimits.maxFiles}
        onUploaded={() => { loadDocuments(); loadChecklist(); }}
      />

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-800">Required Documents</h2>
          <p className="text-xs text-gray-500 mt-0.5">Please upload both documents below as soon as they&apos;re available.</p>
        </div>
        <div className="px-6 py-5 space-y-3">
          {REQUIRED_DOCUMENT_FIELDS.map((f) => (
            <RequiredDocumentUploadField
              key={f.category}
              token={token}
              category={f.category}
              label={f.label}
              documents={documents}
              onUploaded={() => { loadDocuments(); loadChecklist(); }}
            />
          ))}
        </div>
      </div>

      <BuyerAgentTransactionInfoForm token={token} onSaved={loadCda} />

      <GeneratedCdaCard cda={cda} />

      <UploadedDocumentsSection documents={documents} />
    </UploadLinkLayout>
  );
}
