'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import type { ApiDocument, ApiParty } from '@/lib/api';
import type {
  DocumentAnalysis,
  AnalyzeDocumentsResponse,
  RecipientRole,
} from '@/lib/docusign-field.types';
import DocuSignFieldWorkflow from './DocuSignFieldWorkflow';
import ManualPlacementModal, { type ManualPlacementField, type PlacedField } from './ManualPlacementModal';

export interface TransactionContext {
  propertyAddress: string;
  coordinatorName: string;
  brokerageName?: string;
  transactionType?: string;
  transactionNumber?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  transactionId: string;
  disclosureDocuments: ApiDocument[];
  parties?: ApiParty[];
  txContext?: TransactionContext;
}

const SIGNER_ROLES = new Set(['buyer', 'seller', 'buyer_agent', 'seller_agent']);

const PARTY_ROLE_TO_DOCUSIGN: Record<string, string> = {
  buyer: 'Buyer',
  seller: 'Seller',
  buyer_agent: 'Buyer Agent',
  seller_agent: 'Seller Agent',
  buyer_transaction_coordinator: 'Buyer TC',
  seller_transaction_coordinator: 'Seller TC',
};

function buildDefaultSubject(txContext?: TransactionContext): string {
  if (!txContext) return 'Signature Request';
  return `Signature Request – ${txContext.propertyAddress}`;
}

function buildDefaultBody(txContext?: TransactionContext): string {
  const address = txContext?.propertyAddress ?? '[Property Address]';
  const coordinator = txContext?.coordinatorName ?? 'your transaction coordinator';
  return [
    `Documents related to ${address} are ready for your electronic signature.`,
    ``,
    `Please review and sign the highlighted fields. DocuSign will guide you to each field that needs your attention.`,
    ``,
    `If you have any questions, please contact ${coordinator}.`,
  ].join('\n');
}

export default function SendViaDocuSignModal({
  open,
  onClose,
  transactionId,
  disclosureDocuments,
  parties = [],
  txContext,
}: Props) {
  const [documentAnalyses, setDocumentAnalyses] = useState<DocumentAnalysis[]>([]);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [recipients, setRecipients] = useState<RecipientRole[]>([]);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [manualFields, setManualFields] = useState<ManualPlacementField[]>([]);
  const [manualDocId, setManualDocId] = useState<string>('');
  const [manualFormCode, setManualFormCode] = useState<string>('');
  const [manualTotalPages, setManualTotalPages] = useState(1);
  const [manualPlaced, setManualPlaced] = useState<PlacedField[]>([]);
  const [pendingSigners, setPendingSigners] = useState<Array<{ name: string; email: string; role: string }>>([]);
  const [pendingDocIds, setPendingDocIds] = useState<string[]>([]);
  const [sendPending, setSendPending] = useState(false);

  useEffect(() => {
    if (sendPending && pendingSigners.length > 0) {
      setSendPending(false);
      doSend(pendingDocIds, pendingSigners, manualPlaced);
    }
  }, [sendPending]);

  const emailSubject = buildDefaultSubject(txContext);
  const emailBody = buildDefaultBody(txContext);

  const allDocIds = useMemo(
    () => disclosureDocuments.filter((d) => d.storageUrl != null).map((d) => d.id),
    [disclosureDocuments],
  );

  const initializedRef = useRef(false);

  useEffect(() => {
    if (!open) {
      initializedRef.current = false;
      return;
    }
    if (initializedRef.current) return;
    initializedRef.current = true;

    setSent(false);
    setSending(false);
    setSendError(null);
    setDocumentAnalyses([]);
    setAnalysisError(null);

    const signerParties = parties.filter((p) => SIGNER_ROLES.has(p.partyRole) && p.email);
    setRecipients(
      signerParties.map((p, i) => ({
        recipientId: String(i + 1),
        name: p.displayName,
        email: p.email ?? '',
        role: PARTY_ROLE_TO_DOCUSIGN[p.partyRole] ?? p.partyRole,
        partyRole: p.partyRole,
      })),
    );
  }, [open, parties]);

  useEffect(() => {
    if (!open || allDocIds.length === 0) {
      setDocumentAnalyses([]);
      return;
    }

    let cancelled = false;
    setLoadingAnalysis(true);
    setAnalysisError(null);

    fetch('/api/v1/docusign/analyze-documents', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transactionId, documentIds: allDocIds }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || 'Failed to analyze documents');
        }
        return res.json() as Promise<AnalyzeDocumentsResponse>;
      })
      .then((data) => {
        if (!cancelled) {
          setDocumentAnalyses(data.analyses);
          setAnalysisError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setAnalysisError((err as Error).message || 'Failed to analyze documents');
          setDocumentAnalyses([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingAnalysis(false);
      });

    return () => { cancelled = true; };
  }, [open, transactionId, allDocIds]);

  /**
   * Build DocuSign tab placements automatically from the analysis data.
   * This runs entirely behind the scenes — the user only picks documents.
   */
  const buildTabPlacements = (selectedDocIds: string[]) => {
    const placements: Array<{ documentId: string; tabs: Record<string, unknown[]> }> = [];
    let docNum = 0;

    for (const docId of selectedDocIds) {
      const analysis = documentAnalyses.find((a) => a.documentId === docId);
      if (!analysis || analysis.fields.length === 0) continue;
      docNum++;

      const grouped: Record<string, unknown[]> = {};

      for (const field of analysis.fields) {
        const recipient = recipients.find((r) => r.partyRole === field.recommendedRecipientRole || r.role === field.recommendedRecipientRole);
        const recipientId = recipient?.recipientId ?? '1';

        const tab = {
          tabType: field.docuSignTabType,
          recipientId,
          pageNumber: String(field.pageNumber),
          xPosition: String(field.xPosition),
          yPosition: String(field.yPosition),
          documentId: field.documentId,
          tabLabel: field.label,
          width: field.width ? String(field.width) : undefined,
          height: field.height ? String(field.height) : undefined,
          required: field.isRequired ? 'true' : 'false',
          locked: 'false',
        };

        const key = mapTabTypeToKey(field.docuSignTabType);
        (grouped[key] ??= []).push(tab);
      }

      placements.push({
        documentId: docId,
        tabs: grouped,
      });
    }

    return placements;
  };

  const handleSend = async (
    selectedDocIds: string[],
    signers: Array<{ name: string; email: string; role: string }>,
  ) => {
    // Check for low-confidence fields that need manual placement
    const allLowConfFields: ManualPlacementField[] = [];
    for (const docId of selectedDocIds) {
      const analysis = documentAnalyses.find((a) => a.documentId === docId);
      if (!analysis) continue;
      const lowFields = analysis.fields
        .filter((f) => f.confidence === 'low')
        .map((f) => ({
          documentId: f.documentId,
          fieldId: f.id,
          fieldLabel: f.label,
          fieldType: f.fieldType as ManualPlacementField['fieldType'],
          docuSignTabType: f.docuSignTabType,
          recommendedRecipientRole: f.recommendedRecipientRole,
          formCode: f.formCode || 'Unknown',
          pageNumber: f.pageNumber,
          confidence: 'low' as const,
        }));
      allLowConfFields.push(...lowFields);
    }

    if (allLowConfFields.length > 0) {
      // Show manual placement modal for the first document with low-confidence fields
      const firstDocId = selectedDocIds.find((id) =>
        allLowConfFields.some((f) => f.documentId === id),
      ) || selectedDocIds[0];
      const analysis = documentAnalyses.find((a) => a.documentId === firstDocId);
      setManualDocId(firstDocId);
      setManualFormCode(analysis?.formCode || 'Unknown');
      setManualTotalPages(analysis?.fields.reduce((max, f) => Math.max(max, f.pageNumber), 1) ?? 1);
      setManualFields(allLowConfFields);
      setManualPlaced([]);
      setPendingSigners(signers);
      setPendingDocIds(selectedDocIds);
      setShowManual(true);
      return;
    }

    await doSend(selectedDocIds, signers, []);
  };

  const doSend = async (
    selectedDocIds: string[],
    signers: Array<{ name: string; email: string; role: string }>,
    overrides: PlacedField[],
  ) => {
    setSending(true);
    setSendError(null);

    try {
      const placements = buildTabPlacements(selectedDocIds);

      // Apply manual placement overrides
      if (overrides.length > 0) {
        for (const placement of placements) {
          for (const [key, tabList] of Object.entries(placement.tabs)) {
            const tabs = tabList as Record<string, unknown>[];
            for (const tab of tabs) {
              const override = overrides.find(
                (o) => o.field.documentId === placement.documentId
                  && (tab.tabLabel as string) === o.field.fieldLabel,
              );
              if (override) {
                tab.xPosition = String(override.x);
                tab.yPosition = String(override.y);
                tab.width = String(override.width);
                tab.height = String(override.height);
              }
            }
          }
        }
      }

      const res = await fetch('/api/v1/docusign/envelopes/with-fields', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transactionId,
          documentIds: selectedDocIds,
          signers,
          fieldPlacements: placements.map((p, i) => ({
            documentId: p.documentId,
            documentBase64: '',
            fileName: '',
            documentNumber: String(i + 1),
            tabs: p.tabs,
          })),
          emailSubject,
          emailBody,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || 'Failed to send documents');
      }

      setSent(true);
      setSendError(null);
    } catch (err) {
      setSendError((err as Error).message || 'Failed to send for signature');
    } finally {
      setSending(false);
    }
  };

  const handleManualProceed = async () => {
    setShowManual(false);
    await doSend(pendingDocIds, pendingSigners, manualPlaced);
  };

  return (
    <>
      <DocuSignFieldWorkflow
        open={open}
        onClose={onClose}
        transactionId={transactionId}
        documentAnalyses={documentAnalyses}
        loadingAnalysis={loadingAnalysis}
        analysisError={analysisError}
        recipients={recipients}
        emailSubject={emailSubject}
        emailBody={emailBody}
        onSend={handleSend}
        sending={sending}
        sendError={sendError}
        sent={sent}
      />

      <ManualPlacementModal
        open={showManual}
        onClose={() => {
          setShowManual(false);
          setSendPending(true);
        }}
        placed={manualPlaced}
        onPlace={setManualPlaced}
        documentId={manualDocId}
        formCode={manualFormCode}
        totalPages={manualTotalPages}
        pageImageUrl={(pageNum) =>
          `/api/v1/docusign/documents/${manualDocId}/page/${pageNum}/preview`
        }
        transactionId={transactionId}
        fields={manualFields}
      />
    </>
  );
}

function mapTabTypeToKey(tabType: string): string {
  switch (tabType) {
    case 'signHere': return 'signHereTabs';
    case 'initialHere': return 'initialHereTabs';
    case 'dateSigned': return 'dateSignedTabs';
    case 'fullName': return 'fullNameTabs';
    case 'checkbox': return 'checkboxTabs';
    default: return 'textTabs';
  }
}
