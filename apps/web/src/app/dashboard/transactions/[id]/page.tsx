import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';
import { getSession } from '@/lib/auth-actions';
import StagedSwimlane from './StagedSwimlane';
import SimplifiedSwimlane from './SimplifiedSwimlane';
import SellerSidePanel from './SellerSidePanel';
import InitWorkflowPanel from './InitWorkflowPanel';
import BrokerDocumentView from './BrokerDocumentView';
import { DISCLOSURE_FORM_CODES } from './DisclosureCatalog';
import { filterDocs, aggregateCompliance } from './transaction-helpers';
import type { ExtractionResult, ComplianceResult } from '@/app/transactions/new/extraction-result.types';
import type { ApiFormTemplateItem } from '@/lib/api';
import type { FinalNegotiatedTerms } from '@tc/shared';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ hideMeta?: string }>;
}

function humanize(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function fmt(dateStr: string | null | undefined) {
  if (!dateStr) return null;
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

const STATUS_COLORS: Record<string, string> = {
  draft:                    'bg-amber-100 text-amber-700',
  active:                   'bg-green-100 text-green-700',
  under_contract:           'bg-blue-100 text-blue-700',
  pending_close:            'bg-indigo-100 text-indigo-700',
  closed:                   'bg-gray-100 text-gray-600',
  cancelled:                'bg-red-100 text-red-600',
  archived:                 'bg-gray-100 text-gray-400',
};

export default async function TransactionPage({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = searchParams ? await searchParams : {};
  const hideMeta = sp.hideMeta === '1';

  const session = await getSession();
  const isBroker = session?.user?.roles?.includes('broker_admin') ?? false;

  const [transaction, parties, messages, workflowSteps, documents, stageInstances] = await Promise.all([
    api.transactions.get(id),
    api.parties.byTransaction(id),
    api.messages.byTransaction(id),
    api.workflowSteps.byTransaction(id),
    api.documents.byTransaction(id),
    api.stageInstances.byTransaction(id),
  ]);

  if (!transaction) notFound();

  let templateItems: ApiFormTemplateItem[] | undefined;
  if (transaction.formTemplateId) {
    try {
      const template = await api.formTemplates.get(transaction.formTemplateId);
      if (template) {
        templateItems = (template.items ?? []).filter(
          (item) => item.stage === 'DISCLOSURES' || DISCLOSURE_FORM_CODES.has(item.formCode.toUpperCase()),
        );
      }
    } catch {
      // template fetch failed — fall through to no-items
    }
  }

  // Extract contract data from the most recent purchase_agreement document
  const contractDoc = documents?.find((d) => d.documentType === 'purchase_agreement') ?? documents?.[0] ?? null;
  const contractMeta = contractDoc?.metadataJson as Record<string, unknown> | null;
  const extractionResult = (contractMeta?.extraction ?? null) as ExtractionResult | null;
  const compliance       = (contractMeta?.compliance ?? null) as ComplianceResult | null;
  const contingencyFinalTerms = (contractMeta?.contingencyFinalTerms ?? null) as FinalNegotiatedTerms | null;

  // Collect all disclosure documents — match by documentType=disclosure only
  const contractDocId = contractDoc?.id ?? null;
  const disclosureDocuments = filterDocs(documents ?? [], contractDocId, ['disclosure']);
  const disclosureCompliance = aggregateCompliance(disclosureDocuments);

  // Collect intake documents
  const intakeDocuments = filterDocs(documents ?? [], contractDocId, ['intake_document']);

  // Collect inspection documents
  const inspectionDocuments = filterDocs(documents ?? [], contractDocId, ['inspection', 'inspection_report']);
  const inspectionCompliance = aggregateCompliance(inspectionDocuments);

  // Collect appraisal documents
  const appraisalDocuments = filterDocs(documents ?? [], contractDocId, ['appraisal', 'appraisal_report']);

  // Collect loan documents
  const loanDocuments = filterDocs(documents ?? [], contractDocId, ['loan', 'finance']);

  // Collect escrow documents
  const escrowDocuments = filterDocs(documents ?? [], contractDocId, ['escrow']);

  // Collect closing documents
  const closingDocuments = filterDocs(documents ?? [], contractDocId, ['closing', 'verification_of_property']);

  const addressParts = [
    transaction.propertyAddressLine1,
    transaction.propertyAddressLine2,
    transaction.propertyCity,
    transaction.propertyState,
    transaction.propertyPostalCode,
  ].filter(Boolean);

  const propertyAddress = addressParts.length
    ? addressParts.join(', ')
    : 'Address TBD';

  const coordinator = parties?.find(
    (p) => p.partyRole === 'buyer_transaction_coordinator' || p.partyRole === 'seller_transaction_coordinator',
  );

  const txContext = {
    propertyAddress,
    coordinatorName: coordinator?.displayName ?? 'Transaction Coordinator',
    transactionType: transaction.transactionType,
    transactionNumber: transaction.transactionNumber,
  };

  return (
    <div className="flex flex-col h-full min-h-0 space-y-4">
      {/* Breadcrumb + header */}
      <div>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 mb-3"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          Dashboard
        </Link>

        <div className="flex flex-wrap items-start gap-3">
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-semibold text-gray-900 truncate">
              {addressParts.length ? addressParts.join(', ') : 'Address TBD'}
            </h1>
            <p className="text-xs text-gray-500 mt-0.5">#{transaction.transactionNumber}</p>
          </div>

          <div className="flex flex-wrap gap-2 shrink-0">
            <span
              className={cn(
                'text-xs font-medium px-2 py-1 rounded-full',
                transaction.transactionSide === 'SELLER'
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-blue-100 text-blue-700',
              )}
            >
              {transaction.transactionSide === 'SELLER' ? 'Seller Side' : 'Buyer Side'}
            </span>
            <span className={`text-xs font-medium px-2 py-1 rounded-full ${STATUS_COLORS[transaction.status] ?? 'bg-gray-100 text-gray-700'}`}>
              {humanize(transaction.status)}
            </span>
            {(stageInstances ?? [])
              .filter((s) => s.status === 'active')
              .map((s) => (
                <span key={s.id} className="text-xs font-medium px-2 py-1 rounded-full bg-blue-100 text-blue-700">
                  {humanize(s.stage)}
                </span>
              ))}
          </div>
        </div>

        {/* Key dates (hidden via hideMeta=1) */}
        {!hideMeta && (transaction.offerAcceptedAt || transaction.closeOfEscrowAt) && (
          <div className="flex flex-wrap gap-4 mt-2 text-xs text-gray-500">
            {transaction.offerAcceptedAt && (
              <span>Offer accepted: {fmt(transaction.offerAcceptedAt)}</span>
            )}
            {transaction.closeOfEscrowAt && (
              <span>Close of escrow: {fmt(transaction.closeOfEscrowAt)}</span>
            )}
          </div>
        )}
      </div>

      {/* Draft — show init workflow panel (hidden via hideMeta=1) */}
      {!hideMeta && transaction.status === 'draft' && (
        <InitWorkflowPanel
          transactionId={id}
          offerAcceptedAt={transaction.offerAcceptedAt}
        />
      )}

      {/* Seller-side coordination: escrow opening + disclosure packet */}
      {!isBroker && transaction.transactionSide === 'SELLER' && (
        <SellerSidePanel transactionId={id} />
      )}

      {/* Broker view — simplified document list only */}
      {isBroker ? (
        <BrokerDocumentView
          documents={documents ?? []}
          transactionNumber={transaction.transactionNumber}
        />
      ) : transaction.status === 'draft' ? (
        <>
          {/* Draft — unchanged multi-stage tabbed swimlane, preserved as-is */}
          <div className="flex-1 min-h-0 rounded-xl border border-gray-200 bg-white overflow-hidden">
            <StagedSwimlane
              transactionId={id}
              stageInstances={stageInstances ?? []}
              parties={parties ?? []}
              messages={messages ?? []}
              workflowSteps={workflowSteps ?? []}
              extractionResult={extractionResult}
              compliance={compliance}
              contingencyFinalTerms={contingencyFinalTerms}
              disclosureCompliance={disclosureCompliance}
              disclosureDocuments={disclosureDocuments}
              inspectionCompliance={inspectionCompliance}
              inspectionDocuments={inspectionDocuments}
              intakeDocuments={intakeDocuments}
              appraisalDocuments={appraisalDocuments}
              loanDocuments={loanDocuments}
              escrowDocuments={escrowDocuments}
              closingDocuments={closingDocuments}
              allDocuments={documents ?? []}
              templateItems={templateItems}
              txContext={txContext}
              userEmail={session?.user?.email}
            />
          </div>
        </>
      ) : (
        <>
          {/* Post-Draft — simplified 7-section swimlane */}
          <div className="flex-1 min-h-0 rounded-xl border border-gray-200 bg-white overflow-hidden">
            <SimplifiedSwimlane transactionId={id} />
          </div>
        </>
      )}
    </div>
  );
}
