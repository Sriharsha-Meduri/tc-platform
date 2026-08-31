import { Injectable, Logger } from '@nestjs/common';
import { S3StorageService } from '../storage/s3-storage.service';
import { TransactionDocumentsService } from '../transaction-documents/transaction-documents.service';
import { TransactionDocumentEntity } from '../transaction-documents/entities/transaction-document.entity';

export interface StoreUploadedFileParams {
  transactionId: string;
  stage: string;
  file: Express.Multer.File;
  sanitizedFileName: string;
  metadataJson: Record<string, unknown>;
  uploadLinkId?: string | null;
  idempotencyKey?: string | null;
  fileSizeBytes?: number | null;
  /** Initial background-analysis state for this row — e.g. 'analyzing' for PDFs, 'completed' when no analysis applies. */
  analysisStatus?: string | null;
  /** Defaults to 'external_upload' — override for distinctly-tagged uploads (e.g. 'hoa_document'). */
  documentType?: string;
}

/**
 * Thin wrapper combining S3 upload + transaction_documents row creation as
 * one atomic-as-practical step: the DB row is only created after the S3
 * upload succeeds, and if the DB write fails, the just-uploaded S3 object is
 * deleted — so a failed upload never leaves an orphaned blob or an
 * incomplete document record behind.
 */
@Injectable()
export class TransactionDocumentStorageService {
  private readonly logger = new Logger(TransactionDocumentStorageService.name);

  constructor(
    private readonly s3: S3StorageService,
    private readonly transactionDocumentsService: TransactionDocumentsService,
  ) {}

  async storeUploadedFile(params: StoreUploadedFileParams): Promise<TransactionDocumentEntity> {
    const { transactionId, stage, file, sanitizedFileName, metadataJson } = params;

    const { storageKey } = await this.s3.upload(transactionId, stage, sanitizedFileName, file.buffer, file.mimetype);

    try {
      return await this.transactionDocumentsService.createDocumentWithMetadata({
        transactionId,
        stage,
        documentType: params.documentType ?? 'external_upload',
        title: file.originalname,
        storageKey,
        fileName: file.originalname,
        mimeType: file.mimetype,
        metadataJson,
        uploadLinkId: params.uploadLinkId ?? null,
        idempotencyKey: params.idempotencyKey ?? null,
        fileSizeBytes: params.fileSizeBytes ?? null,
        analysisStatus: params.analysisStatus ?? null,
      });
    } catch (err) {
      this.logger.error(`Document row creation failed after S3 upload — rolling back ${storageKey}: ${(err as Error).message}`);
      await this.s3.delete(storageKey).catch((deleteErr: Error) => {
        this.logger.error(`Rollback delete also failed for ${storageKey}: ${deleteErr.message}`);
      });
      throw err;
    }
  }
}
