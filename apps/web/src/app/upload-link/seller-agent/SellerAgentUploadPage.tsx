'use client';

import { useCallback, useEffect, useState } from 'react';
import UploadLinkLayout from '../shared/UploadLinkLayout';
import UploadDropzoneCard from '../shared/UploadDropzoneCard';
import UploadedDocumentsSection from '../shared/UploadedDocumentsSection';
import ChecklistSidebar from '../shared/ChecklistSidebar';
import TransactionCompletedBanner from '../shared/TransactionCompletedBanner';
import { getDocuments, getChecklist } from '../shared/uploadLinkApi';
import type { UploadedDocument, UploadPageContext } from '../shared/uploadLinkTypes';
import type { DocumentChecklistStatus } from '../shared/checklist.types';
import SellerAgentEscrowInfoForm from './SellerAgentEscrowInfoForm';
import SendDocumentsViaDocuSignModal from './SendDocumentsViaDocuSignModal';
import { sendDocumentsDocusign } from './sellerAgentUploadService';
import DocusignPendingBanner from './DocusignPendingBanner';

export default function SellerAgentUploadPage({ token, context }: { token: string; context: UploadPageContext }) {
  const [documents, setDocuments] = useState<UploadedDocument[]>([]);
  const [checklist, setChecklist] = useState<DocumentChecklistStatus | null>(null);

  const loadDocuments = useCallback(() => {
    if (!token) return;
    getDocuments(token).then(setDocuments).catch(() => { /* the page still functions if the list fails to load */ });
  }, [token]);

  const loadChecklist = useCallback(() => {
    if (!token) return;
    getChecklist(token).then(setChecklist).catch(() => { /* the page still functions if the checklist fails to load */ });
  }, [token]);

  useEffect(() => { loadDocuments(); loadChecklist(); }, [loadDocuments, loadChecklist]);

  // Poll only while at least one document is still being analyzed.
  useEffect(() => {
    if (!documents.some((d) => d.status === 'analyzing')) return;
    const interval = setInterval(() => { loadDocuments(); loadChecklist(); }, 4000);
    return () => clearInterval(interval);
  }, [documents, loadDocuments, loadChecklist]);

  // ── Centralized DocuSign send (multi-select) ──────────────────────────────
  const [docusignModalOpen, setDocusignModalOpen] = useState(false);
  const [docusignSending, setDocusignSending] = useState(false);
  const [docusignSendError, setDocusignSendError] = useState<string | null>(null);

  async function handleConfirmDocusignSend(documentIds: string[]) {
    if (!token || documentIds.length === 0) return;
    setDocusignSending(true);
    setDocusignSendError(null);
    try {
      await sendDocumentsDocusign(token, documentIds);
      setDocusignModalOpen(false);
      loadChecklist();
    } catch (err) {
      setDocusignSendError((err as Error).message);
    } finally {
      setDocusignSending(false);
    }
  }

  const showDocusignPendingBanner = checklist != null && !checklist.allRequiredSubmitted;
  const showTransactionCompletedBanner = checklist?.transactionCompleted ?? false;

  return (
    <UploadLinkLayout
      hasSidebar
      sidebar={(
        <ChecklistSidebar
          checklist={checklist}
          onOpenDocusignSend={checklist && checklist.allRequiredSubmitted ? () => { setDocusignSendError(null); setDocusignModalOpen(true); } : undefined}
        />
      )}
      banner={(showDocusignPendingBanner || showTransactionCompletedBanner) && (
        <>
          {showDocusignPendingBanner && <DocusignPendingBanner />}
          {showTransactionCompletedBanner && <TransactionCompletedBanner />}
        </>
      )}
      modal={docusignModalOpen && checklist && (
        <SendDocumentsViaDocuSignModal
          checklist={checklist}
          sending={docusignSending}
          error={docusignSendError}
          onConfirm={handleConfirmDocusignSend}
          onCancel={() => { setDocusignModalOpen(false); setDocusignSendError(null); }}
        />
      )}
    >
      <UploadDropzoneCard
        token={token}
        title="Upload Documents from Seller Agent"
        recipientName={context.recipientName}
        propertyAddress={context.propertyAddress}
        maxFiles={context.fileLimits.maxFiles}
        onUploaded={() => { loadDocuments(); loadChecklist(); }}
      />

      <SellerAgentEscrowInfoForm token={token} />

      <UploadedDocumentsSection documents={documents} />
    </UploadLinkLayout>
  );
}
