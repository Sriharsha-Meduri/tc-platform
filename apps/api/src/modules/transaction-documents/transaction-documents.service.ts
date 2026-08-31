import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, In, IsNull } from 'typeorm';
import { TransactionDocumentEntity, DocumentStatus } from './entities/transaction-document.entity';
import { TransactionDocumentSubmissionEntity, SubmissionStatus } from './entities/transaction-document-submission.entity';
import { CreateTransactionDocumentInput } from './dto/create-transaction-document.input';
import { UpdateDocumentInput } from './dto/update-document.input';
import { CreateSubmissionInput } from './dto/create-submission.input';
import { S3StorageService } from '../storage/s3-storage.service';
import { BlockerOverrideService } from '../blocker-overrides/blocker-override.service';
import { partitionBlockers } from '../blocker-overrides/blocker-override.util';
import type { BlockerOutput } from '../document-extraction/compliance-result.types';
import { canExternalUserSeeDocument, resolveUploadedByType, UploadLinkVisibilityType } from '../upload-links/document-visibility.util';

@Injectable()
export class TransactionDocumentsService {
  constructor(
    @InjectRepository(TransactionDocumentEntity)
    private readonly documentsRepo: Repository<TransactionDocumentEntity>,
    @InjectRepository(TransactionDocumentSubmissionEntity)
    private readonly submissionsRepo: Repository<TransactionDocumentSubmissionEntity>,
    private readonly s3: S3StorageService,
    private readonly blockerOverrideService: BlockerOverrideService,
  ) {}

  // ── Storage URL helper ────────────────────────────────────────────────────

  /**
   * Set storageUrl to the API proxy endpoint for any doc that has a storageKey.
   * The frontend calls this endpoint; the API streams the file from S3.
   * Format: /api/v1/transaction-documents/{id}/file
   */
  private withStorageUrls(docs: TransactionDocumentEntity[]): TransactionDocumentEntity[] {
    const apiBase = process.env.NEXT_PUBLIC_API_URL ?? process.env.API_BASE_URL ?? 'http://localhost:3000';
    for (const doc of docs) {
      if (doc.storageKey) {
        doc.storageUrl = `${apiBase}/api/v1/transaction-documents/${doc.id}/file`;
      }
    }
    return docs;
  }

  /**
   * Filters an overridden blocker out of each document's own
   * metadataJson.compliance.blockers before it's ever handed to a frontend
   * consumer — the compliance section, and every per-stage detail view built
   * on top of it, all read this same field directly, so annotating it here
   * (rather than in each of those views) is what makes an override show up
   * everywhere without any of them special-casing overrides themselves. The
   * original, unfiltered blocker list is never touched in the database —
   * only this in-memory response copy — and the overridden ones are kept
   * under a separate key so nothing is silently hidden from the audit trail.
   */
  private async annotateComplianceOverrides(docs: TransactionDocumentEntity[]): Promise<TransactionDocumentEntity[]> {
    const byTransaction = new Map<string, TransactionDocumentEntity[]>();
    for (const doc of docs) {
      if (!byTransaction.has(doc.transactionId)) byTransaction.set(doc.transactionId, []);
      byTransaction.get(doc.transactionId)!.push(doc);
    }

    for (const [transactionId, txDocs] of byTransaction) {
      const overrides = await this.blockerOverrideService.findForTransaction(transactionId);
      if (overrides.length === 0) continue;

      for (const doc of txDocs) {
        const meta = doc.metadataJson as { compliance?: { blockers?: BlockerOutput[] } } | null;
        const blockers = meta?.compliance?.blockers;
        if (!blockers || blockers.length === 0) continue;

        const { active, overridden } = partitionBlockers(blockers, overrides, { documentId: doc.id, formCode: doc.formCode });
        if (overridden.length === 0) continue;

        doc.metadataJson = {
          ...meta,
          compliance: { ...meta!.compliance, blockers: active, overriddenBlockers: overridden },
        };
      }
    }

    return docs;
  }

  // ── Documents ──────────────────────────────────────────────────────────────

  async findByTransaction(transactionId: string): Promise<TransactionDocumentEntity[]> {
    const docs = await this.documentsRepo.find({
      where: { transactionId },
      relations: ['uploadedByAccount'],
    });
    return this.annotateComplianceOverrides(this.withStorageUrls(docs));
  }

  /** Returns only the current active document set — excludes superseded, rejected, and original-package rows. */
  async findActiveByTransaction(transactionId: string): Promise<TransactionDocumentEntity[]> {
    const docs = await this.documentsRepo.find({
      where: {
        transactionId,
        status: Not(In([DocumentStatus.SUPERSEDED, DocumentStatus.REJECTED])),
        isOriginalPackage: false,
      },
    });
    return this.annotateComplianceOverrides(this.withStorageUrls(docs));
  }

  /**
   * Like findActiveByTransaction, but includes original-package rows that came
   * from the secure-upload-link splitting flow (uploadLinkId set) — those are
   * deliberately visible on the checklist as the "original uploaded PDF" entry,
   * unlike the authenticated extract-and-draft flow's original-package rows
   * (uploadLinkId null), which stay hidden as pure audit records.
   */
  async findActiveByTransactionForChecklist(transactionId: string): Promise<TransactionDocumentEntity[]> {
    const notSupersededOrRejected = Not(In([DocumentStatus.SUPERSEDED, DocumentStatus.REJECTED]));
    const docs = await this.documentsRepo.find({
      where: [
        { transactionId, status: notSupersededOrRejected, isOriginalPackage: false },
        { transactionId, status: notSupersededOrRejected, isOriginalPackage: true, uploadLinkId: Not(IsNull()) },
      ],
    });
    return this.withStorageUrls(docs);
  }

  /** Active documents scoped to a single stage — the primary query for stage reasoning. Excludes original-package rows. */
  async findActiveByTransactionAndStage(transactionId: string, stage: string): Promise<TransactionDocumentEntity[]> {
    const docs = await this.documentsRepo.find({
      where: {
        transactionId,
        stage: stage.toLowerCase(),
        status: Not(In([DocumentStatus.SUPERSEDED, DocumentStatus.REJECTED])),
        isOriginalPackage: false,
      },
    });
    return this.withStorageUrls(docs);
  }

  /** Merge patch into an existing document's metadataJson without overwriting other keys. */
  async patchMetadataJson(id: string, patch: Record<string, unknown>): Promise<void> {
    const doc = await this.documentsRepo.findOne({ where: { id } });
    if (!doc) return;
    doc.metadataJson = { ...(doc.metadataJson ?? {}), ...patch };
    await this.documentsRepo.save(doc);
  }

  /** Set the ai_interaction_id FK column on a document row. */
  async setAiInteractionId(id: string, aiInteractionId: string): Promise<void> {
    await this.documentsRepo.update(id, { aiInteractionId });
  }

  async findOne(id: string): Promise<TransactionDocumentEntity> {
    const doc = await this.documentsRepo.findOne({ where: { id } });
    if (!doc) throw new NotFoundException(`TransactionDocument ${id} not found`);
    return this.withStorageUrls([doc])[0];
  }

  /** Like findOne, but with the uploadLink relation loaded — needed anywhere a document's own canonical origin (see resolveUploadedByType) must be resolved, e.g. the external file-view route's authorization check. */
  async findOneWithUploadLink(id: string): Promise<TransactionDocumentEntity> {
    const doc = await this.documentsRepo.findOne({ where: { id }, relations: ['uploadLink'] });
    if (!doc) throw new NotFoundException(`TransactionDocument ${id} not found`);
    return this.withStorageUrls([doc])[0];
  }

  /**
   * Every document a given external upload-link audience is allowed to see —
   * transaction-wide (unlike findByUploadLink, which is scoped to a single
   * uploadLinkId), filtered through the single canExternalUserSeeDocument
   * resolver: a Buyer Agent link also sees internal (TC/myTC) uploads, a
   * Seller Agent link sees only its own uploads, and an Escrow link always
   * sees the transaction's current RPA regardless of who uploaded it.
   *
   * Excludes only superseded documents, matching the prior
   * findByUploadLink-based "Uploaded Documents" list's own filter — a
   * signed RPA that replaces an unsigned one becomes the only active
   * version (superseded status is set automatically on replacement), so
   * this can never surface both the old and new version at once.
   */
  async findVisibleForUploadLink(transactionId: string, linkType: UploadLinkVisibilityType): Promise<TransactionDocumentEntity[]> {
    const docs = await this.documentsRepo.find({
      where: { transactionId, status: Not(DocumentStatus.SUPERSEDED) },
      relations: ['uploadLink'],
      order: { createdAt: 'DESC' },
    });
    const visible = docs.filter((d) => canExternalUserSeeDocument(
      { uploadedByType: resolveUploadedByType(d.uploadLinkId, d.uploadLink?.purpose), formCode: d.formCode, documentType: d.documentType, status: d.status },
      linkType,
    ));
    return this.withStorageUrls(visible);
  }

  /** Get the full version chain for a document (oldest → newest). */
  async findVersionChain(id: string): Promise<TransactionDocumentEntity[]> {
    // Walk forward from the root: find the oldest ancestor first
    const target = await this.findOne(id);
    const chain: TransactionDocumentEntity[] = [];

    // Walk backwards to find root
    let current: TransactionDocumentEntity = target;
    const visited = new Set<string>();
    while (current.previousVersionId && !visited.has(current.id)) {
      visited.add(current.id);
      const prev = await this.documentsRepo.findOne({ where: { id: current.previousVersionId } });
      if (!prev) break;
      chain.unshift(prev);
      current = prev;
    }
    chain.push(target);

    // Walk forward from target to find any newer versions
    let newer = await this.documentsRepo.findOne({ where: { previousVersionId: target.id } });
    while (newer && !visited.has(newer.id)) {
      visited.add(newer.id);
      chain.push(newer);
      newer = await this.documentsRepo.findOne({ where: { previousVersionId: newer.id } });
    }

    return chain;
  }

  /**
   * Upload a file to S3 and create (or update) a transaction_documents row.
   * storageKey is set from S3; storageUrl is left null in DB (generated on-demand).
   */
  async uploadFile(params: {
    transactionId: string;
    stage: string;
    file: Express.Multer.File;
    documentType?: string;
    title?: string;
    workflowStepId?: string | null;
  }): Promise<TransactionDocumentEntity> {
    const { transactionId, stage, file, workflowStepId } = params;
    const documentType = params.documentType ?? 'general';
    const title = params.title ?? file.originalname;

    const { storageKey } = await this.s3.upload(
      transactionId,
      stage,
      file.originalname,
      file.buffer,
      file.mimetype,
    );

    const doc = this.documentsRepo.create({
      transactionId,
      stage: stage.toLowerCase(),
      documentType,
      title,
      fileName: file.originalname,
      mimeType: file.mimetype,
      storageKey,
      storageUrl: null,   // always generated on-demand; never persisted
      status: DocumentStatus.UPLOADED,
      workflowStepId: workflowStepId ?? null,
    });

    const saved = await this.documentsRepo.save(doc);
    return this.withStorageUrls([saved])[0];
  }

  async create(dto: CreateTransactionDocumentInput): Promise<TransactionDocumentEntity> {
    const doc = this.documentsRepo.create({
      transactionId: dto.transactionId,
      documentType: dto.documentType,
      title: dto.title,
      fileName: dto.fileName ?? null,
      mimeType: dto.mimeType ?? null,
      storageKey: dto.storageKey ?? null,
      storageUrl: dto.storageUrl ?? null,
      status: dto.status,
      requestedFromPartyId: dto.requestedFromPartyId ?? null,
      uploadedByAccountId: dto.uploadedByAccountId ?? null,
      dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
      submissionId: dto.submissionId ?? null,
    });
    return this.documentsRepo.save(doc);
  }

  /**
   * Create a document row with full metadata, without uploading to S3.
   * The caller is responsible for uploading the file and providing the storageKey.
   * Used by the multi-form extract-and-draft flow to persist per-form extraction
   * data for non-RPA forms (AD, TDS, SPQ, etc.) alongside the primary RPA document.
   */
  async createDocumentWithMetadata(params: {
    transactionId: string;
    stage: string;
    documentType: string;
    title: string;
    storageKey: string | null;
    fileName: string | null;
    mimeType: string | null;
    uploadedByAccountId?: string;
    aiInteractionId?: string;
    metadataJson?: Record<string, unknown>;
    isOriginalPackage?: boolean;
    /** Per-form provenance — set on derived (split) form documents. */
    sourceDocumentId?: string | null;
    sourcePageStart?: number | null;
    sourcePageEnd?: number | null;
    formCode?: string | null;
    /** Secure upload-link provenance — set only for documents uploaded through a public upload-link token. */
    uploadLinkId?: string | null;
    analysisStatus?: string | null;
    idempotencyKey?: string | null;
    fileSizeBytes?: number | null;
    /**
     * Set to chain this row onto an existing document as a new version —
     * the referenced row is marked SUPERSEDED and this row's versionNo is
     * incremented from it, exactly like createNewVersion. Used by
     * system-regenerated documents (e.g. the CDA) that overwrite their own
     * prior output rather than being a genuinely new upload.
     */
    previousVersionId?: string | null;
  }): Promise<TransactionDocumentEntity> {
    let versionNo = 1;
    if (params.previousVersionId) {
      const prev = await this.findOne(params.previousVersionId);
      prev.status = DocumentStatus.SUPERSEDED;
      await this.documentsRepo.save(prev);
      versionNo = prev.versionNo + 1;
    }

    const doc = this.documentsRepo.create({
      transactionId: params.transactionId,
      stage: params.stage.toLowerCase(),
      documentType: params.documentType,
      title: params.title,
      fileName: params.fileName,
      mimeType: params.mimeType,
      storageKey: params.storageKey,
      storageUrl: null,
      status: DocumentStatus.UPLOADED,
      uploadedByAccountId: params.uploadedByAccountId ?? null,
      aiInteractionId: params.aiInteractionId ?? null,
      metadataJson: params.metadataJson ?? null,
      isOriginalPackage: params.isOriginalPackage ?? false,
      sourceDocumentId: params.sourceDocumentId ?? null,
      sourcePageStart: params.sourcePageStart ?? null,
      sourcePageEnd: params.sourcePageEnd ?? null,
      formCode: params.formCode ?? null,
      uploadLinkId: params.uploadLinkId ?? null,
      analysisStatus: params.analysisStatus ?? null,
      idempotencyKey: params.idempotencyKey ?? null,
      fileSizeBytes: params.fileSizeBytes ?? null,
      previousVersionId: params.previousVersionId ?? null,
      versionNo,
    });
    const saved = await this.documentsRepo.save(doc);
    return this.withStorageUrls([saved])[0];
  }

  /** All documents uploaded through a specific secure upload-link — the backend visibility-scoping query. */
  async findByUploadLink(uploadLinkId: string, transactionId: string): Promise<TransactionDocumentEntity[]> {
    const docs = await this.documentsRepo.find({
      where: { uploadLinkId, transactionId },
      order: { createdAt: 'DESC' },
    });
    return this.withStorageUrls(docs);
  }

  /** Idempotency lookup — an existing document created from the same (uploadLinkId, idempotencyKey) pair. */
  async findByUploadLinkAndIdempotencyKey(uploadLinkId: string, idempotencyKey: string): Promise<TransactionDocumentEntity | null> {
    return this.documentsRepo.findOne({ where: { uploadLinkId, idempotencyKey } });
  }

  /** Narrow update for background analysis results — avoids touching the GraphQL UpdateDocumentInput DTO. */
  async updateAnalysisResult(id: string, params: { analysisStatus: string; formCode?: string | null; analyzedAt: Date }): Promise<void> {
    await this.documentsRepo.update(id, {
      analysisStatus: params.analysisStatus,
      analyzedAt: params.analyzedAt,
      ...(params.formCode !== undefined ? { formCode: params.formCode } : {}),
    });
  }

  /**
   * Called once a combined upload-link PDF has been split into per-form
   * documents: marks the original row as the (visible) original package and
   * clears its own formCode so it can never itself satisfy a checklist item —
   * only its split children (linked back via their own sourceDocumentId) can.
   */
  async markAsOriginalPackage(id: string): Promise<void> {
    await this.documentsRepo.update(id, { isOriginalPackage: true, formCode: null });
  }

  /**
   * Upload a new version of an existing document.
   * Marks the previous version as SUPERSEDED and creates a new row
   * with versionNo incremented, linked back via previousVersionId.
   */
  async createNewVersion(
    previousDocId: string,
    dto: CreateTransactionDocumentInput,
  ): Promise<TransactionDocumentEntity> {
    const prev = await this.findOne(previousDocId);

    // Mark old version as superseded
    prev.status = DocumentStatus.SUPERSEDED;
    await this.documentsRepo.save(prev);

    const next = this.documentsRepo.create({
      transactionId: prev.transactionId,
      documentType: prev.documentType,
      title: dto.title ?? prev.title,
      fileName: dto.fileName ?? null,
      mimeType: dto.mimeType ?? null,
      storageKey: dto.storageKey ?? null,
      storageUrl: dto.storageUrl ?? null,
      status: dto.status ?? DocumentStatus.UPLOADED,
      requestedFromPartyId: prev.requestedFromPartyId,
      uploadedByAccountId: dto.uploadedByAccountId ?? null,
      dueAt: prev.dueAt,
      workflowStepId: prev.workflowStepId,
      submissionId: dto.submissionId ?? null,
      previousVersionId: previousDocId,
      versionNo: prev.versionNo + 1,
    });
    return this.documentsRepo.save(next);
  }

  async update(id: string, dto: UpdateDocumentInput): Promise<TransactionDocumentEntity> {
    const doc = await this.findOne(id);
    Object.assign(doc, dto);
    return this.documentsRepo.save(doc);
  }

  async updateStatus(id: string, status: DocumentStatus): Promise<TransactionDocumentEntity> {
    const doc = await this.findOne(id);
    doc.status = status;
    return this.documentsRepo.save(doc);
  }

  async remove(id: string): Promise<void> {
    const doc = await this.findOne(id);
    await this.documentsRepo.remove(doc);
  }

  // ── Submissions ────────────────────────────────────────────────────────────

  async findSubmissionsByTransaction(
    transactionId: string,
  ): Promise<TransactionDocumentSubmissionEntity[]> {
    return this.submissionsRepo.find({
      where: { transactionId },
      relations: ['documents'],
      order: { submissionNo: 'ASC' },
    });
  }

  async findSubmission(id: string): Promise<TransactionDocumentSubmissionEntity> {
    const s = await this.submissionsRepo.findOne({ where: { id }, relations: ['documents'] });
    if (!s) throw new NotFoundException(`DocumentSubmission ${id} not found`);
    return s;
  }

  async createSubmission(
    dto: CreateSubmissionInput,
  ): Promise<TransactionDocumentSubmissionEntity> {
    // Auto-increment submission_no within this transaction
    const maxResult = await this.submissionsRepo
      .createQueryBuilder('s')
      .select('MAX(s.submissionNo)', 'max')
      .where('s.transactionId = :tid', { tid: dto.transactionId })
      .getRawOne<{ max: number | null }>();

    const nextNo = (maxResult?.max ?? 0) + 1;

    const submission = this.submissionsRepo.create({
      transactionId: dto.transactionId,
      submissionNo: nextNo,
      status: SubmissionStatus.PENDING,
      submittedByPartyId: dto.submittedByPartyId ?? null,
      notes: dto.notes ?? null,
    });
    return this.submissionsRepo.save(submission);
  }

  async updateSubmissionStatus(
    id: string,
    status: SubmissionStatus,
  ): Promise<TransactionDocumentSubmissionEntity> {
    const submission = await this.findSubmission(id);
    submission.status = status;
    return this.submissionsRepo.save(submission);
  }

  /**
   * Accept a submission: mark it ACCEPTED and supersede all earlier submissions
   * for this transaction.
   */
  async acceptSubmission(id: string): Promise<TransactionDocumentSubmissionEntity> {
    const submission = await this.findSubmission(id);
    if (submission.status === SubmissionStatus.ACCEPTED) return submission;

    // Supersede older submissions
    await this.submissionsRepo
      .createQueryBuilder()
      .update()
      .set({ status: SubmissionStatus.SUPERSEDED })
      .where('transaction_id = :tid AND id != :id AND status != :s', {
        tid: submission.transactionId,
        id,
        s: SubmissionStatus.SUPERSEDED,
      })
      .execute();

    submission.status = SubmissionStatus.ACCEPTED;
    return this.submissionsRepo.save(submission);
  }
}
