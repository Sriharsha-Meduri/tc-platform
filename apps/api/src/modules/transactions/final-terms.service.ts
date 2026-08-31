import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TransactionDocumentEntity } from '../transaction-documents/entities/transaction-document.entity';
import { findContractFamilyDocuments } from './contract-terms-merge.util';
import {
  resolveFinalNegotiatedTerms,
  detectCounterNumber,
  type FinalNegotiatedTerms,
  type FinalTermsInputDocument,
  type ContractDocumentExtraction,
  type ContractContingencyInfo,
} from '@tc/document-intelligence';

/** The subset of a stored raw extraction this service reads. */
interface StoredExtraction {
  documentType?: string | null;
  transaction?: {
    acceptanceDate?: string | null;
    offerDate?: string | null;
    closingDate?: string | null;
    possessionDate?: string | null;
    purchasePrice?: number | null;
  } | null;
  contractTerms?: {
    inspectionContingencyDays?: number | null;
    loanContingencyDays?: number | null;
    loanContingencyWaived?: boolean | null;
    appraisalContingencyDays?: number | null;
    appraisalContingencyWaived?: boolean | null;
    disclosuresDueDays?: number | null;
    initialDepositBusinessDays?: number | null;
  } | null;
}

const CONTRACT_DOCUMENT_TYPES = new Set(['RPA', 'SCO', 'BCO', 'SMCO', 'BMCO']);

/**
 * Computes and persists the single, authoritative Final Negotiated Terms for
 * a transaction's "Contingencies & Disclosures" section, and is the only
 * writer of `transaction_documents.metadataJson.finalTerms`.
 *
 * Recomputed from every active contract-family document each time — never
 * assumed still valid from a previous document's stale snapshot — so a
 * newly-uploaded counter-offer, re-upload, or supersede is always reflected.
 */
@Injectable()
export class FinalTermsService {
  private readonly logger = new Logger(FinalTermsService.name);

  constructor(
    @InjectRepository(TransactionDocumentEntity)
    private readonly documentsRepo: Repository<TransactionDocumentEntity>,
  ) {}

  /**
   * Read-only variant of `computeAndPersist` — resolves the same Final
   * Negotiated Terms (including price/dates/credits via `valueTerms`) without
   * writing anything back to the database. Callers that need the resolver's
   * output on a read path (e.g. computing checklist items) should use this,
   * not `computeAndPersist`, to avoid an unnecessary write on every read.
   */
  async resolve(transactionId: string): Promise<FinalNegotiatedTerms | null> {
    const docs = await findContractFamilyDocuments(this.documentsRepo, transactionId);
    if (docs.length === 0) return null;

    const inputDocuments = this.buildInputDocuments(docs);
    if (inputDocuments.length === 0) return null;

    return resolveFinalNegotiatedTerms(inputDocuments);
  }

  async computeAndPersist(transactionId: string): Promise<FinalNegotiatedTerms | null> {
    const docs = await findContractFamilyDocuments(this.documentsRepo, transactionId);
    if (docs.length === 0) return null;

    const inputDocuments = this.buildInputDocuments(docs);
    if (inputDocuments.length === 0) return null;

    const finalTerms = resolveFinalNegotiatedTerms(inputDocuments);

    // Written onto every active contract-family document row so any reader
    // (draft payload, dashboard contract-details payload) finds the same
    // value regardless of which document's metadata it happens to load.
    //
    // Stored under `contingencyFinalTerms`, deliberately NOT `finalTerms` —
    // the web app already has an unrelated, differently-shaped `finalTerms`
    // concept (whole-contract names/price/dates, see
    // apps/web/.../extraction-result.types.ts) that also reads
    // metadataJson.finalTerms. Reusing that key would silently feed this
    // resolver's contingency-specific shape to that consumer.
    await Promise.all(docs.map((doc) => {
      doc.metadataJson = { ...(doc.metadataJson ?? {}), contingencyFinalTerms: finalTerms as unknown as Record<string, unknown> };
      return this.documentsRepo.save(doc);
    }));

    return finalTerms;
  }

  /**
   * Builds one FinalTermsInputDocument per active contract-family document.
   * Prefers the richer per-document breakdown captured at initial draft
   * creation (`normalizeContractDocument` output stored as
   * `metadataJson.contractDocuments`, which covers insurance/title/HOA
   * review and precise waiver detail) when a document is represented there;
   * falls back to a conversion from that document's own raw extraction
   * (always fresh — patched on every upload/re-upload) otherwise, e.g. a
   * later counter-offer uploaded as its own standalone file. The fallback
   * only ever covers loan/appraisal/inspection/disclosuresDue/
   * emdInitialDeposit — the same five fields `mergeContractTerms` covers —
   * since the raw `ExtractionResult` schema has no insurance/title/HOA
   * review fields to fall back to.
   */
  private buildInputDocuments(docs: TransactionDocumentEntity[]): FinalTermsInputDocument[] {
    const richByFileName = new Map<string, ContractDocumentExtraction>();
    for (const doc of docs) {
      const meta = doc.metadataJson as Record<string, unknown> | null;
      const rich = meta?.contractDocuments as ContractDocumentExtraction[] | undefined;
      if (rich) for (const cd of rich) richByFileName.set(cd.fileName, cd);
    }

    const inputs: FinalTermsInputDocument[] = [];
    for (const doc of docs) {
      const meta = doc.metadataJson as Record<string, unknown> | null;
      const extraction = meta?.extraction as StoredExtraction | undefined;
      if (!extraction) continue;

      const fileName = doc.fileName ?? doc.title;
      const document = richByFileName.get(fileName) ?? this.buildFallbackDocument(doc, extraction, fileName);
      if (!document) continue;

      inputs.push({
        document,
        documentId: doc.id,
        versionNo: doc.versionNo,
        rawContractTerms: {
          disclosuresDueDays: extraction.contractTerms?.disclosuresDueDays ?? null,
          initialDepositBusinessDays: extraction.contractTerms?.initialDepositBusinessDays ?? null,
        },
      });
    }
    return inputs;
  }

  private buildFallbackDocument(
    doc: TransactionDocumentEntity,
    extraction: StoredExtraction,
    fileName: string,
  ): ContractDocumentExtraction | null {
    const rawCode = (doc.formCode ?? extraction.documentType ?? 'RPA').toUpperCase();
    const documentType = (CONTRACT_DOCUMENT_TYPES.has(rawCode) ? rawCode : 'RPA') as ContractDocumentExtraction['documentType'];
    const terms = extraction.contractTerms ?? {};
    const counterNumber = documentType === 'RPA' ? 0 : detectCounterNumber(documentType, fileName, {});

    const contingency = (days: number | null | undefined, waived?: boolean | null): ContractContingencyInfo | null => {
      if (waived === true) return { status: 'No contingency', deadline: null };
      return days != null ? { status: 'Contingent', deadline: `${days} days` } : null;
    };

    return {
      documentId: doc.id,
      fileName,
      documentType,
      counterNumber,
      sequenceOrder: 0,
      referencedFormCode: null,
      referencedCounterOfferNumber: null,
      extractedTerms: {
        formRevision: null,
        formRevisionLabel: null,
        datePrepared: null,
        offerDate: extraction.transaction?.offerDate ?? null,
        acceptanceDate: extraction.transaction?.acceptanceDate ?? null,
        expirationDate: null,
        buyerName: null,
        sellerName: null,
        propertyAddress: null,
        purchasePrice: extraction.transaction?.purchasePrice ?? null,
        initialDeposit: null,
        closeOfEscrow: extraction.transaction?.closingDate ?? null,
        sellerCreditToBuyer: null,
        buyerBrokerCompensation: null,
        loanContingency: contingency(terms.loanContingencyDays, terms.loanContingencyWaived),
        appraisalContingency: contingency(terms.appraisalContingencyDays, terms.appraisalContingencyWaived),
        inspectionContingency: terms.inspectionContingencyDays != null
          ? { status: 'Contingent', deadline: `${terms.inspectionContingencyDays} days` }
          : null,
        insuranceContingency: null,
        sellerDocumentReview: null,
        titleReview: null,
        hoaReview: null,
        possession: null,
        otherTerms: null,
        otherTermsOverrides: null,
        signatures: { buyerSigned: false, sellerSigned: false, buyerSignedDate: null, sellerSignedDate: null },
      },
    };
  }
}
