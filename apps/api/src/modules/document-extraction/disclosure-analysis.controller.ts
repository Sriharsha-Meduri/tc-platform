import { BadRequestException, Controller, Logger, NotFoundException, Param, Post } from '@nestjs/common';
import type { Readable } from 'stream';
import { TransactionDocumentsService } from '../transaction-documents/transaction-documents.service';
import { TransactionDocumentEntity } from '../transaction-documents/entities/transaction-document.entity';
import { S3StorageService } from '../storage/s3-storage.service';
import { DocumentPipelineService } from './document-pipeline.service';

function streamToBuffer(stream: Readable): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk: Buffer) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

/**
 * Retry analysis for a single already-uploaded disclosure document — re-runs
 * the same identify → validate → save pipeline used at upload time. Reuses
 * DocumentPipelineService (the unified extraction+compliance entry point) so
 * this never reimplements the disclosure validation rules.
 *
 * TODO: gate to TRANSACTION_COORDINATOR/BROKER_ADMIN once the app-wide
 * REST auth guard lands (see "Pending work" in CLAUDE.md — every route in
 * this API is currently unguarded, not just this one).
 */
@Controller('transactions')
export class DisclosureAnalysisController {
  private readonly logger = new Logger(DisclosureAnalysisController.name);

  constructor(
    private readonly documentsService: TransactionDocumentsService,
    private readonly documentPipelineService: DocumentPipelineService,
    private readonly s3: S3StorageService,
  ) {}

  @Post(':transactionId/documents/:documentId/analyze')
  async analyzeDocument(
    @Param('transactionId') transactionId: string,
    @Param('documentId') documentId: string,
  ): Promise<TransactionDocumentEntity> {
    const doc = await this.documentsService.findOne(documentId);
    if (doc.transactionId !== transactionId) {
      throw new NotFoundException('Document not found for this transaction');
    }
    if (!doc.storageKey) {
      throw new BadRequestException('Document has no stored file to analyze');
    }

    await this.documentsService.updateAnalysisResult(doc.id, {
      analysisStatus: 'analyzing',
      analyzedAt: new Date(),
    });

    try {
      const { stream } = await this.s3.getObject(doc.storageKey);
      const buffer = await streamToBuffer(stream);
      const analyzed = await this.documentPipelineService.process(buffer);

      await this.documentsService.patchMetadataJson(doc.id, {
        extraction: analyzed.extraction as unknown as Record<string, unknown>,
        compliance: analyzed.compliance as unknown as Record<string, unknown>,
        detectedFormCode: analyzed.detectedFormCode,
        analyzedAt: new Date().toISOString(),
        analysisError: undefined,
      });
      await this.documentsService.updateAnalysisResult(doc.id, {
        analysisStatus: 'completed',
        formCode: analyzed.detectedFormCode ?? doc.formCode,
        analyzedAt: new Date(),
      });
    } catch (err) {
      const message = (err as Error).message;
      this.logger.error(`Retry analysis failed for document ${documentId}: ${message}`);
      await this.documentsService.patchMetadataJson(doc.id, { analysisError: message });
      await this.documentsService.updateAnalysisResult(doc.id, {
        analysisStatus: 'failed',
        analyzedAt: new Date(),
      });
    }

    return this.documentsService.findOne(doc.id);
  }
}
