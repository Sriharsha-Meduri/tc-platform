import { Body, Controller, Delete, ForbiddenException, Get, NotFoundException, Param, Patch, Post, Query, Req, Res, StreamableFile, UploadedFile, UseInterceptors, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { Request, Response } from 'express';
import { TransactionDocumentsService } from './transaction-documents.service';
import { S3StorageService } from '../storage/s3-storage.service';
import { DocumentStatus } from './entities/transaction-document.entity';
import { SubmissionStatus } from './entities/transaction-document-submission.entity';
import { CreateTransactionDocumentInput } from './dto/create-transaction-document.input';
import { UpdateDocumentInput } from './dto/update-document.input';
import { CreateSubmissionInput } from './dto/create-submission.input';
import { TransactionEntity } from '../transactions/entities/transaction.entity';
import { AccountsService } from '../accounts/accounts.service';
import { TransactionAccessService } from '../transaction-authorization/transaction-access.service';

@Controller('transaction-documents')
export class TransactionDocumentsController {
  constructor(
    private readonly transactionDocumentsService: TransactionDocumentsService,
    private readonly s3: S3StorageService,
    private readonly accountsService: AccountsService,
    private readonly transactionAccessService: TransactionAccessService,
    @InjectRepository(TransactionEntity)
    private readonly transactionsRepo: Repository<TransactionEntity>,
  ) {}

  /** Same pattern used across every other controller in this codebase — req.user.userId → AccountEntity. */
  private async resolveAccountId(req: Request): Promise<string> {
    const userId = (req.user as { userId?: string })?.userId;
    if (!userId) throw new ForbiddenException('Authentication required');
    const account = await this.accountsService.findByUserId(userId);
    if (!account) throw new ForbiddenException('Account not found');
    return account.id;
  }

  // ── Submissions ────────────────────────────────────────────────────────────

  @Post('submissions')
  createSubmission(@Body() dto: CreateSubmissionInput) {
    return this.transactionDocumentsService.createSubmission(dto);
  }

  @Get('submissions/transaction/:transactionId')
  findSubmissionsByTransaction(@Param('transactionId') transactionId: string) {
    return this.transactionDocumentsService.findSubmissionsByTransaction(transactionId);
  }

  @Get('submissions/:id')
  findSubmission(@Param('id') id: string) {
    return this.transactionDocumentsService.findSubmission(id);
  }

  @Patch('submissions/:id/status')
  updateSubmissionStatus(
    @Param('id') id: string,
    @Body('status') status: SubmissionStatus,
  ) {
    return this.transactionDocumentsService.updateSubmissionStatus(id, status);
  }

  @Patch('submissions/:id/accept')
  acceptSubmission(@Param('id') id: string) {
    return this.transactionDocumentsService.acceptSubmission(id);
  }

  // ── S3 routes — declared before :id/* to prevent dynamic-param shadowing ──

  /**
   * Stream any stored file directly by storage key.
   * GET /transaction-documents/storage/file?key=transactions/{txId}/{stage}/{filename}
   */
  @Get('storage/file')
  async streamS3File(
    @Query('key') key: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    if (!key) throw new BadRequestException('key query parameter is required');

    try {
      const { stream, contentType, contentLength, fileName } = await this.s3.getObject(key);

      res.set({
        'Content-Type':        contentType,
        'Content-Disposition': `inline; filename="${fileName}"`,
        ...(contentLength != null ? { 'Content-Length': String(contentLength) } : {}),
      });

      return new StreamableFile(stream);
    } catch (err) {
      const code = (err as { name?: string })?.name;
      if (code === 'NoSuchKey' || code === 'NotFound') {
        throw new NotFoundException(`File not found in storage: ${key}`);
      }
      throw err;
    }
  }

  /**
   * List all stored files for a transaction across all stages.
   * GET /transaction-documents/storage/transaction/:transactionId
   */
  @Get('storage/transaction/:transactionId')
  listS3ByTransaction(@Param('transactionId') transactionId: string) {
    return this.s3.listByTransaction(transactionId);
  }

  /**
   * List all stored files for a transaction scoped to a specific stage.
   * GET /transaction-documents/storage/transaction/:transactionId/stage/:stage
   */
  @Get('storage/transaction/:transactionId/stage/:stage')
  listS3ByStage(
    @Param('transactionId') transactionId: string,
    @Param('stage') stage: string,
  ) {
    return this.s3.listByTransactionAndStage(transactionId, stage);
  }

  // ── Documents (static prefixes before :id/* dynamic routes) ──────────────

  /** All versions, including superseded — full audit trail. */
  @Get('transaction/:transactionId')
  findByTransaction(@Param('transactionId') transactionId: string) {
    return this.transactionDocumentsService.findByTransaction(transactionId);
  }

  /** Only the current active set — what the TC is working with right now. */
  @Get('transaction/:transactionId/active')
  findActiveByTransaction(@Param('transactionId') transactionId: string) {
    return this.transactionDocumentsService.findActiveByTransaction(transactionId);
  }

  // ── S3 file streaming ─────────────────────────────────────────────────────

  /**
   * Stream a document file directly from S3.
   * storageUrl in document responses points here: GET /transaction-documents/:id/file
   */
  @Get(':id/file')
  async streamFile(
    @Param('id') id: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const doc = await this.transactionDocumentsService.findOne(id);
    if (!doc.storageKey) {
      throw new NotFoundException(`Document ${id} has no file stored`);
    }

    const accountId = await this.resolveAccountId(req);
    const transaction = await this.transactionsRepo.findOne({ where: { id: doc.transactionId } });
    if (!transaction) throw new NotFoundException(`Document ${id} has no owning transaction`);
    const canAccess = await this.transactionAccessService.canAccountAccessTransaction(accountId, transaction);
    if (!canAccess) throw new ForbiddenException('You do not have access to this document.');

    try {
      const { stream, contentType, contentLength, fileName } = await this.s3.getObject(doc.storageKey);

      res.set({
        'Content-Type':        contentType,
        'Content-Disposition': `inline; filename="${fileName}"`,
        ...(contentLength != null ? { 'Content-Length': String(contentLength) } : {}),
      });

      return new StreamableFile(stream);
    } catch (err) {
      const code = (err as { name?: string })?.name;
      if (code === 'NoSuchKey' || code === 'NotFound') {
        throw new NotFoundException(`File not found in storage for document ${id}`);
      }
      throw err;
    }
  }

  @Get(':id/versions')
  findVersionChain(@Param('id') id: string) {
    return this.transactionDocumentsService.findVersionChain(id);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.transactionDocumentsService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateTransactionDocumentInput) {
    return this.transactionDocumentsService.create(dto);
  }

  /**
   * Upload a file to S3 and create a transaction_documents record.
   *
   * Multipart fields:
   *   file           — the file (required)
   *   transactionId  — UUID (required)
   *   stage          — e.g. "contract", "disclosures", "inspection" (required)
   *   documentType   — e.g. "purchase_agreement" (optional, defaults to "general")
   *   title          — display name (optional, defaults to filename)
   *   workflowStepId — UUID of the workflow step (optional)
   */
  @Post('upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 50 * 1024 * 1024 } }))
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Body('transactionId') transactionId: string,
    @Body('stage') stage: string,
    @Body('documentType') documentType?: string,
    @Body('title') title?: string,
    @Body('workflowStepId') workflowStepId?: string,
  ) {
    if (!file) throw new BadRequestException('file is required');
    if (!transactionId) throw new BadRequestException('transactionId is required');
    if (!stage) throw new BadRequestException('stage is required');

    return this.transactionDocumentsService.uploadFile({
      transactionId,
      stage,
      file,
      documentType,
      title,
      workflowStepId: workflowStepId ?? null,
    });
  }

  /** Upload a corrected version of an existing document. */
  @Post(':id/new-version')
  createNewVersion(
    @Param('id') previousDocId: string,
    @Body() dto: CreateTransactionDocumentInput,
  ) {
    return this.transactionDocumentsService.createNewVersion(previousDocId, dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateDocumentInput) {
    return this.transactionDocumentsService.update(id, dto);
  }

  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body('status') status: DocumentStatus) {
    return this.transactionDocumentsService.updateStatus(id, status);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.transactionDocumentsService.remove(id);
  }
}
