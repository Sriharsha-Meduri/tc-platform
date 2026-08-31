import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { UploadLinkService } from '../upload-links/upload-link.service';
import { FileValidationService } from '../upload-links/file-validation.service';
import { getDefaultAllowedFileConfig, BROKER_TRANSACTION_DOCUMENT_UPLOAD } from '../upload-links/upload-link.types';
import { TransactionDocumentsService } from '../transaction-documents/transaction-documents.service';
import { TransactionDocumentEntity } from '../transaction-documents/entities/transaction-document.entity';
import { S3StorageService } from '../storage/s3-storage.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditAction } from '../audit-log/audit-log.entity';
import { CDA_DOCUMENT_TYPE, SIGNED_CDA_DOCUMENT_TYPE } from '../cda/cda.constants';

const SIGNED_CDA_STAGE = 'commission';
const SIGNED_CDA_TITLE = 'Signed CDA';
const INVALID_LINK_MESSAGE = 'This upload link is invalid or has expired.';

/**
 * The Broker's one and only upload capability — accepting the signed CDA
 * back, and only the signed CDA (never a general document, unlike the
 * Buyer/Seller Agent/Escrow upload endpoints). Deliberately its own small
 * dedicated flow rather than routed through ExternalDocumentUploadService's
 * uploadTransactionDocuments: none of that pipeline's machinery (sync
 * compliance validation, gated form codes, per-form splitting, HOA/lender/
 * proof-of-funds category tagging) applies here, and that service actively
 * rejects broker-purpose links by design (assertNotBrokerLink) — this is the
 * one narrow, explicit exception to that rule.
 *
 * Registered as a provider directly on UploadLinksModule (see
 * upload-links.module.ts) — not its own module — for the same reason
 * CdaNotificationService/BrokerOnboardingService/EscrowOnboardingService
 * are: it needs UploadLinkService/FileValidationService, which live there.
 */
@Injectable()
export class SignedCdaUploadService {
  private readonly logger = new Logger(SignedCdaUploadService.name);

  constructor(
    private readonly uploadLinkService: UploadLinkService,
    private readonly fileValidationService: FileValidationService,
    private readonly documentsService: TransactionDocumentsService,
    private readonly s3: S3StorageService,
    private readonly auditLogService: AuditLogService,
  ) {}

  /**
   * Stores the file as documentType SIGNED_CDA_DOCUMENT_TYPE, linked back to
   * the generated CDA it corresponds to via sourceDocumentId. A repeat
   * upload (the broker corrects a mistake and re-submits) supersedes the
   * prior signed-CDA row through the same previousVersionId chain the
   * generated CDA itself uses — never two active signed-CDA rows at once.
   */
  async uploadSignedCda(token: string, file: Express.Multer.File): Promise<TransactionDocumentEntity> {
    const { link, transaction } = await this.uploadLinkService.validateUploadToken(token);
    if (link.purpose !== BROKER_TRANSACTION_DOCUMENT_UPLOAD) {
      throw new NotFoundException(INVALID_LINK_MESSAGE);
    }

    const activeDocs = await this.documentsService.findActiveByTransaction(transaction.id);
    const cda = activeDocs.find((d) => d.documentType === CDA_DOCUMENT_TYPE);
    if (!cda) {
      throw new BadRequestException('The CDA has not been generated yet — nothing to sign.');
    }

    const config = getDefaultAllowedFileConfig();
    const validation = this.fileValidationService.validateFile(file, config);
    if (!validation.valid) {
      throw new BadRequestException(validation.reason);
    }

    const existingSigned = activeDocs.find((d) => d.documentType === SIGNED_CDA_DOCUMENT_TYPE);

    const { storageKey } = await this.s3.upload(transaction.id, SIGNED_CDA_STAGE, validation.sanitizedFileName, file.buffer, file.mimetype);

    const stored = await this.documentsService.createDocumentWithMetadata({
      transactionId: transaction.id,
      stage: SIGNED_CDA_STAGE,
      documentType: SIGNED_CDA_DOCUMENT_TYPE,
      title: SIGNED_CDA_TITLE,
      storageKey,
      fileName: validation.sanitizedFileName,
      mimeType: file.mimetype,
      fileSizeBytes: file.size,
      sourceDocumentId: cda.id,
      uploadLinkId: link.id,
      metadataJson: {
        uploadSource: 'broker_secure_upload_link',
        uploadLinkId: link.id,
        recipientName: link.recipientName,
        recipientEmail: link.recipientEmail,
        cdaDocumentId: cda.id,
      },
      previousVersionId: existingSigned?.id ?? null,
    });

    await this.auditLogService.log({
      accountId: null,
      action: AuditAction.SIGNED_CDA_UPLOADED,
      targetType: 'transaction_document',
      targetId: stored.id,
      targetDisplayName: transaction.transactionNumber,
      description: `Signed CDA uploaded by ${link.recipientName} for transaction ${transaction.transactionNumber}`,
      details: {
        transactionId: transaction.id,
        documentId: stored.id,
        cdaDocumentId: cda.id,
        previousSignedCdaId: existingSigned?.id ?? null,
        uploadLinkId: link.id,
      },
    });

    this.logger.log(`Signed CDA uploaded for transaction ${transaction.id} (link ${link.id}) — document ${stored.id}`);
    return stored;
  }
}
