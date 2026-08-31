import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash } from 'crypto';
import { generateCda, CdaGenerationInput } from '@tc/document-intelligence';
import { CDA_CONFIG } from '@tc/shared';
import { TransactionEntity, TransactionSide } from '../transactions/entities/transaction.entity';
import { TransactionPartyEntity, PartyRole } from '../transaction-parties/entities/transaction-party.entity';
import { TransactionDocumentEntity } from '../transaction-documents/entities/transaction-document.entity';
import { TransactionDocumentsService } from '../transaction-documents/transaction-documents.service';
import { S3StorageService } from '../storage/s3-storage.service';
import { BuyerSideInformationService } from '../transaction-contact-information/buyer-side-information.service';
import { BrokerInformationService } from '../transaction-contact-information/broker-information.service';
import { EscrowInformationService } from '../transaction-contact-information/escrow-information.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditAction } from '../audit-log/audit-log.entity';
import { UploadLinkEntity } from '../upload-links/entities/upload-link.entity';
import { resolveUploadLinkVisibilityType, resolveUploadedByType, canExternalUserSeeDocument } from '../upload-links/document-visibility.util';
import { CDA_DOCUMENT_TYPE, SIGNED_CDA_DOCUMENT_TYPE } from './cda.constants';

const CDA_STAGE = 'commission';
const CDA_FILE_NAME = 'CDA-Commission-Disbursement-Authorization.pdf';
const CDA_MIME_TYPE = 'application/pdf';

/**
 * Auto-generates (and regenerates) the CDA once both the Buyer Agent's and
 * Broker's own commission sections are complete. Buyer-side transactions
 * only for now — the Seller Agent's upload link has no commission-capture
 * UI yet (no seller-side equivalent of buyer_side_information/
 * broker_information exists), so maybeGenerateCda is a no-op for a
 * seller-side transaction until that subsystem is built.
 *
 * Deliberately does not duplicate any commission math that already lives
 * in ExternalTransactionInformationService — grossCommission and
 * brokerCommissionAmount are read as already-calculated, saved values from
 * buyer_side_information/broker_information. The one new formula this
 * service owns is the myTC-fee-aware three-way split
 * (agentCommissionAmount = grossCommission - brokerCommissionAmount -
 * mytcAppCommissionAmount) — CDA-specific because mytcAppCommissionAmount
 * has no other consumer in the app.
 */
@Injectable()
export class CdaGenerationService {
  constructor(
    @InjectRepository(TransactionPartyEntity)
    private readonly partiesRepo: Repository<TransactionPartyEntity>,
    private readonly buyerSideInformationService: BuyerSideInformationService,
    private readonly brokerInformationService: BrokerInformationService,
    private readonly escrowInformationService: EscrowInformationService,
    private readonly transactionDocumentsService: TransactionDocumentsService,
    private readonly s3: S3StorageService,
    private readonly auditLogService: AuditLogService,
  ) {}

  /**
   * Returns the generated (or regenerated) CDA document row, or null when
   * generation is skipped — either because this isn't a buyer-side
   * transaction, or because the Buyer Agent and/or Broker haven't both
   * finished their commission sections yet (a partial save must never
   * produce a partial/incorrect CDA). Never throws for an incomplete-data
   * case; callers still wrap this in try/catch for genuine failures (PDF
   * generation, S3, DB) since a CDA regeneration must never fail the
   * commission save that triggered it.
   */
  async maybeGenerateCda(transaction: TransactionEntity): Promise<TransactionDocumentEntity | null> {
    if (transaction.side !== TransactionSide.BUYER_SIDE) return null;
    if (transaction.contractPrice === null || transaction.contractPrice === undefined) return null;

    const [buyerSide, broker, escrow, buyerAgentParty] = await Promise.all([
      this.buyerSideInformationService.findByTransaction(transaction.id),
      this.brokerInformationService.findByTransaction(transaction.id),
      this.escrowInformationService.findByTransaction(transaction.id),
      this.partiesRepo.findOne({ where: { transactionId: transaction.id, partyRole: PartyRole.BUYER_AGENT } }),
    ]);

    if (buyerSide?.grossCommission === null || buyerSide?.grossCommission === undefined) return null;
    if (broker?.brokerCommissionAmount === null || broker?.brokerCommissionAmount === undefined) return null;

    const mytcAppCommissionAmount = CDA_CONFIG.mytcAppCommissionAmount;
    const agentCommissionAmount = Math.round(
      (buyerSide.grossCommission - broker.brokerCommissionAmount - mytcAppCommissionAmount) * 100,
    ) / 100;

    const propertyAddress = [transaction.propertyAddressLine1, transaction.propertyCity, transaction.propertyState]
      .filter(Boolean).join(', ') || transaction.propertyAddressLine1;

    const input: CdaGenerationInput = {
      brokerage: buyerSide.brokerageName ?? '',
      brokerName: buyerSide.brokerFullName ?? '',
      agent: buyerAgentParty?.displayName ?? '',

      escrowNumber: escrow?.escrowNumber ?? null,

      salePrice: transaction.contractPrice,
      closeOfEscrowDate: transaction.closeOfEscrowAt,

      clientCredits: buyerSide.clientCredits,

      brokerageAddress: broker.brokerPaymentAddress,
      agentAddress: buyerSide.buyerAgentPaymentAddress,

      brokerCommissionAmount: broker.brokerCommissionAmount,
      agentCommissionAmount,
      mytcAppCommissionAmount,

      // No signature source exists anywhere in the app yet — always blank
      // until an authorized-signature capture mechanism is built.
      brokerSignature: null,

      date: new Date(),
      sideRepresented: 'Buyer',
      myTCAddress: CDA_CONFIG.myTCAddress,
      propertyAddress,
    };

    const pdfBuffer = await generateCda(input);

    // Every field that can actually change what's printed on the CDA — excludes `date`
    // (always "today", never material) and `brokerSignature` (always null today, no
    // source exists yet). CdaNotificationService compares this against what a
    // recipient's link was last notified about, so a resave that regenerates an
    // identical CDA (e.g. clicking Save with no field changes) never re-sends the
    // "CDA is ready" email — only an actual content change does.
    const contentFingerprint = createHash('sha256').update(JSON.stringify({
      brokerage: input.brokerage, brokerName: input.brokerName, agent: input.agent,
      escrowNumber: input.escrowNumber, salePrice: input.salePrice,
      closeOfEscrowDate: input.closeOfEscrowDate instanceof Date ? input.closeOfEscrowDate.toISOString() : input.closeOfEscrowDate ?? null,
      clientCredits: input.clientCredits, brokerageAddress: input.brokerageAddress,
      agentAddress: input.agentAddress, brokerCommissionAmount: input.brokerCommissionAmount,
      agentCommissionAmount: input.agentCommissionAmount, mytcAppCommissionAmount: input.mytcAppCommissionAmount,
      propertyAddress: input.propertyAddress, sideRepresented: input.sideRepresented,
      myTCAddress: input.myTCAddress,
    })).digest('hex');

    const existing = (await this.transactionDocumentsService.findActiveByTransaction(transaction.id))
      .find((doc) => doc.documentType === CDA_DOCUMENT_TYPE) ?? null;

    // Same "upload to S3 first, only create the row once the upload
    // succeeds" ordering TransactionDocumentStorageService.storeUploadedFile
    // uses for user-uploaded files — the generated PDF is treated no
    // differently once it exists as bytes.
    const { storageKey } = await this.s3.upload(transaction.id, CDA_STAGE, CDA_FILE_NAME, pdfBuffer, CDA_MIME_TYPE);

    const stored = await this.transactionDocumentsService.createDocumentWithMetadata({
      transactionId: transaction.id,
      stage: CDA_STAGE,
      documentType: CDA_DOCUMENT_TYPE,
      title: 'Commission Disbursement Authorization (CDA)',
      storageKey,
      fileName: CDA_FILE_NAME,
      mimeType: CDA_MIME_TYPE,
      fileSizeBytes: pdfBuffer.length,
      metadataJson: {
        generatedAt: new Date().toISOString(),
        source: 'auto_generated_cda',
        grossCommission: buyerSide.grossCommission,
        brokerCommissionAmount: broker.brokerCommissionAmount,
        agentCommissionAmount,
        mytcAppCommissionAmount,
        contentFingerprint,
      },
      previousVersionId: existing?.id ?? null,
    });

    await this.auditLogService.log({
      accountId: null,
      action: AuditAction.CDA_GENERATED,
      targetType: 'transaction_document',
      targetId: stored.id,
      targetDisplayName: transaction.transactionNumber,
      description: `CDA ${existing ? 'regenerated' : 'generated'} for transaction ${transaction.transactionNumber} from Buyer Agent + Broker commission data`,
      details: {
        transactionId: transaction.id,
        documentId: stored.id,
        previousVersionId: existing?.id ?? null,
        grossCommission: buyerSide.grossCommission,
        brokerCommissionAmount: broker.brokerCommissionAmount,
        agentCommissionAmount,
        mytcAppCommissionAmount,
      },
    });

    return stored;
  }

  /**
   * The single resolver behind getCdaForLink/getSignedCdaForLink — scoped to
   * what the requesting upload link's own audience is allowed to see,
   * through the same canExternalUserSeeDocument rule as every other
   * document-visibility check, so a Seller Agent link (or any link on the
   * wrong transaction) always gets null, and a Buyer Agent/Broker/Escrow
   * link gets the file only once one actually exists AND that link's
   * audience is allowed to see documents of this type. `token` is only used
   * to build the file-view URL — it is never re-validated here (the
   * controller already did that via validateUploadToken before calling in).
   */
  /** The shared "current active document of this type, on this transaction" lookup behind every getter below — token-scoped and internal alike. */
  private async findActiveDocumentOfType(transaction: TransactionEntity, documentType: string): Promise<TransactionDocumentEntity | null> {
    const doc = (await this.transactionDocumentsService.findActiveByTransaction(transaction.id))
      .find((d) => d.documentType === documentType);
    return doc && doc.transactionId === transaction.id ? doc : null;
  }

  private async getDocumentForLink(
    token: string, link: UploadLinkEntity, transaction: TransactionEntity, documentType: string,
  ): Promise<PublicCdaDto | null> {
    const doc = await this.findActiveDocumentOfType(transaction, documentType);
    if (!doc) return null;

    const linkType = resolveUploadLinkVisibilityType(link.purpose);
    const uploadedByType = resolveUploadedByType(doc.uploadLinkId, null);
    if (!canExternalUserSeeDocument({ uploadedByType, formCode: doc.formCode, documentType: doc.documentType, status: doc.status }, linkType)) {
      return null;
    }

    return {
      id: doc.id,
      fileName: doc.fileName,
      generatedAt: doc.createdAt,
      versionNo: doc.versionNo,
      viewUrl: `/api/v1/upload-links/token/${token}/documents/${doc.id}/file`,
    };
  }

  /**
   * The internal (myTC dashboard) counterpart to getDocumentForLink — no
   * token, no visibility gate, since an internal caller is already authorized
   * at the transaction level (TransactionAccessService), and builds the same
   * internal viewUrl every other WorkspaceDocumentDto uses.
   */
  private async getDocumentForTransaction(transaction: TransactionEntity, documentType: string): Promise<PublicCdaDto | null> {
    const doc = await this.findActiveDocumentOfType(transaction, documentType);
    if (!doc) return null;

    return {
      id: doc.id,
      fileName: doc.fileName,
      generatedAt: doc.createdAt,
      versionNo: doc.versionNo,
      viewUrl: `/api/v1/transaction-documents/${doc.id}/file`,
    };
  }

  /** The generated (unsigned) CDA — Buyer Agent and Broker links only, see document-visibility.util.ts. */
  async getCdaForLink(token: string, link: UploadLinkEntity, transaction: TransactionEntity): Promise<PublicCdaDto | null> {
    return this.getDocumentForLink(token, link, transaction, CDA_DOCUMENT_TYPE);
  }

  /** The Broker-uploaded signed CDA — Broker (their own upload) and Escrow links only, see document-visibility.util.ts. */
  async getSignedCdaForLink(token: string, link: UploadLinkEntity, transaction: TransactionEntity): Promise<PublicCdaDto | null> {
    return this.getDocumentForLink(token, link, transaction, SIGNED_CDA_DOCUMENT_TYPE);
  }

  /** The generated CDA, for the internal myTC swimlane — same lookup as getCdaForLink, internal viewUrl, no visibility gate. */
  async getCdaForTransaction(transaction: TransactionEntity): Promise<PublicCdaDto | null> {
    return this.getDocumentForTransaction(transaction, CDA_DOCUMENT_TYPE);
  }

  /** The signed CDA, for the internal myTC swimlane — same lookup as getSignedCdaForLink, internal viewUrl, no visibility gate. */
  async getSignedCdaForTransaction(transaction: TransactionEntity): Promise<PublicCdaDto | null> {
    return this.getDocumentForTransaction(transaction, SIGNED_CDA_DOCUMENT_TYPE);
  }
}

export interface PublicCdaDto {
  id: string;
  fileName: string | null;
  generatedAt: Date;
  versionNo: number;
  viewUrl: string;
}
