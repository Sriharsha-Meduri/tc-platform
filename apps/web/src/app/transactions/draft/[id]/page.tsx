'use client';

import { useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import type { ApiTransaction, ApiParty, ApiDocument } from '@/lib/api';
import type {
  ExtractionResult,
  ExtractionContractTerms,
  ComplianceResult,
  ContractDocumentExtraction,
} from '../../new/extraction-result.types';
import type { FinalNegotiatedTerms } from '@tc/shared';
import { apiGet } from '@/lib/client-api';

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * Thin loader that bridges a seeded DRAFT transaction into the existing
 * contract review wizard (/transactions/new/contract/review).
 *
 * Steps:
 *  1. Fetch transaction + parties + documents from API
 *  2. Build ExtractionResult from the stored metadataJson
 *  3. Write tc_draft_session to sessionStorage
 *  4. Redirect to the review wizard — same UX as PDF upload flow
 */
export default function DraftLoaderPage({ params }: Props) {
  const { id } = use(params);
  const router  = useRouter();

  useEffect(() => {
    async function load() {
      const [txRes, partiesRes, docsRes] = await Promise.all([
        apiGet(`/transactions/${id}`),
        apiGet(`/transaction-parties/transaction/${id}`),
        apiGet(`/transaction-documents/transaction/${id}`),
      ]);

      if (!txRes.ok) { router.replace('/dashboard'); return; }

      const tx: ApiTransaction       = await txRes.json();
      const parties: ApiParty[]       = partiesRes.ok ? await partiesRes.json() : [];
      const docs: ApiDocument[]       = docsRes.ok   ? await docsRes.json()    : [];

      // If already active, go straight to the stages detail page
      if (tx.status !== 'draft') {
        router.replace(`/dashboard/transactions/${id}`);
        return;
      }

      // Pull contract terms from the most recent document's extraction metadata
      const doc        = docs[0] ?? null;
      const metadata   = doc?.metadataJson as Record<string, unknown> | null ?? {};
      const extraction   = metadata.extraction as Record<string, unknown> | undefined;
      const txExtract    = extraction?.transaction as Record<string, unknown> | undefined;
      const terms        = (extraction?.contractTerms ?? metadata.contractTerms ?? {}) as Partial<ExtractionContractTerms>;

      // Pull compliance data stored by extract-and-draft (transaction-draft.service.ts:217)
      const storedCompliance = metadata.compliance as ComplianceResult | undefined;

      // The server-resolved Final Negotiated Terms (Contingencies & Disclosures) —
      // when present, this is the single source of truth for contingency days,
      // never the raw per-document contractTerms fields below.
      const contingencyFinalTerms = metadata.contingencyFinalTerms as FinalNegotiatedTerms | undefined;
      const finalTermByKey = new Map((contingencyFinalTerms?.terms ?? []).map((t) => [t.key, t]));

      // ── Map parties by role ──────────────────────────────────────────────────
      function byRole(role: string) { return parties.filter((p) => p.partyRole === role); }

      const result: ExtractionResult = {
        documentType:    'purchase_agreement',
        documentSubtypes: [],
        sourceLanguage:  'en',

        property: {
          streetAddress:    tx.propertyAddressLine1,
          city:             tx.propertyCity,
          state:            tx.propertyState,
          postalCode:       tx.propertyPostalCode,
          county:           null,
          apn:              null,
          mlsNumber:        null,
          legalDescription: null,
        },

        transaction: {
          purchasePrice:       tx.contractPrice,
          earnestMoneyAmount:  null,
          offerDate:           (txExtract?.offerDate as string) ?? null,
          acceptanceDate:      (txExtract?.acceptanceDate as string) ?? tx.offerAcceptedAt,
          closingDate:         (txExtract?.closingDate as string) ?? tx.closeOfEscrowAt,
          possessionDate:      null,
          financingType:       null,
          loanAmount:          null,
          occupancyType:       null,
        },

        parties: {
          buyers: byRole('buyer').map((p) => ({
            fullName: p.displayName, email: p.email, phone: p.phone,
            mailingAddress: null, signaturePresent: false, confidence: 1,
          })),
          sellers: byRole('seller').map((p) => ({
            fullName: p.displayName, email: p.email, phone: p.phone,
            mailingAddress: null, signaturePresent: false, confidence: 1,
          })),
          buyerAgents: byRole('buyer_agent').map((p) => ({
            fullName: p.displayName, email: p.email, phone: p.phone,
            licenseNumber: null, companyName: null, confidence: 1,
          })),
          listingAgents: byRole('seller_agent').map((p) => ({
            fullName: p.displayName, email: p.email, phone: p.phone,
            licenseNumber: null, companyName: null, confidence: 1,
          })),
          brokers:        [],
          escrowCompanies: byRole('escrow_officer').map((p) => ({
            companyName: null, contactName: p.displayName, email: p.email,
            phone: p.phone, confidence: 1,
          })),
          lenders: byRole('loan_officer').map((p) => ({
            companyName: null, contactName: p.displayName, email: p.email,
            phone: p.phone, confidence: 1,
          })),
          attorneys:   byRole('attorney').map((p) => ({
            fullName: p.displayName, email: p.email, phone: p.phone,
            licenseNumber: null, companyName: null, confidence: 1,
          })),
          otherParties: [],
        },

        contractTerms: {
          inspectionContingencyDays: finalTermByKey.get('inspection')?.days ?? terms.inspectionContingencyDays ?? null,
          loanContingencyDays:       finalTermByKey.get('loan')?.days       ?? terms.loanContingencyDays       ?? null,
          loanContingencyWaived:     finalTermByKey.get('loan')?.status === 'No contingency',
          appraisalContingencyDays:  finalTermByKey.get('appraisal')?.days ?? terms.appraisalContingencyDays  ?? null,
          appraisalContingencyWaived: finalTermByKey.get('appraisal')?.status === 'No contingency',
          disclosuresDueDays:        finalTermByKey.get('disclosuresDue')?.days ?? terms.disclosuresDueDays  ?? null,
          otherDeadlines:            [],
          otherTermsText:             (extraction?.contractTerms as Record<string, unknown> | undefined)?.['otherTermsText'] as string ?? null,
        },

        formsAndDisclosures: [],
        signatures: {
          buyerSigned: false, sellerSigned: false,
          signedParties: [], missingSignatures: [], missingSignatureDates: [],
        },
        extractionWarnings: ['Transaction was seeded via dev API — review all fields before submitting.'],
        confidenceSummary: {
          overall: 1, property: 1, transaction: 1, parties: 1, formsAndDisclosures: null,
        },
      };

      // ── Pull contract documents from metadata ────────────────────────────────
      const storedContractDocuments = metadata.contractDocuments as ContractDocumentExtraction[] | undefined;

      // ── Write session and hand off to the wizard ─────────────────────────────
      sessionStorage.setItem('tc_draft_session', JSON.stringify({
        transactionId:    id,
        extractionResult: result,
        partiesCreated:   parties.length,
        compliance:       storedCompliance ?? null,
        contractDocuments: storedContractDocuments ?? [],
        fromDraft:        true,
      }));

      router.replace('/transactions/new/contract/review');
    }

    load().catch(() => router.replace('/dashboard'));
  }, [id, router]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-gray-500">
        <Loader2 className="w-7 h-7 animate-spin text-blue-600" />
        <p className="text-sm">Loading draft…</p>
      </div>
    </div>
  );
}
