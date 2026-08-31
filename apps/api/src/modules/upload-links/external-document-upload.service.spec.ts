import { ExternalDocumentUploadService } from './external-document-upload.service';
import { canExternalUserSeeDocument, resolveUploadedByType, UploadLinkVisibilityType } from './document-visibility.util';

function makeFile(name: string, overrides: Partial<Express.Multer.File> = {}): Express.Multer.File {
  return {
    fieldname: 'files',
    originalname: name,
    encoding: '7bit',
    mimetype: 'application/pdf',
    size: 1024,
    buffer: Buffer.from('content'),
    stream: undefined as never,
    destination: '',
    filename: '',
    path: '',
    ...overrides,
  };
}

const LINK = {
  id: 'link-1',
  purpose: 'document_upload',
  emailMessageId: 'mg-buyer-1',
  transactionId: 'tx-1',
  recipientPartyId: 'party-ba-1',
  recipientRole: 'buyer_agent',
  recipientName: 'Alice Agent',
  recipientEmail: 'alice@brokerage.com',
  ccPartyId: null,
  ccRole: null,
  ccName: null,
  ccEmail: null,
};
const SELLER_AGENT_LINK = {
  id: 'link-2',
  purpose: 'seller_agent_document_upload',
  emailMessageId: 'mg-seller-1',
  transactionId: 'tx-1',
  recipientPartyId: 'party-sa-1',
  recipientRole: 'seller_agent',
  recipientName: 'Sam Seller Agent',
  recipientEmail: 'sam@listingco.com',
  ccPartyId: 'party-stc-1',
  ccRole: 'seller_transaction_coordinator',
  ccName: 'Tina TC',
  ccEmail: 'tina@sunsetrealty.com',
};
const ESCROW_LINK = {
  id: 'link-4',
  purpose: 'escrow_officer_document_upload',
  emailMessageId: 'mg-escrow-1',
  transactionId: 'tx-1',
  recipientPartyId: null,
  recipientRole: 'escrow_officer',
  recipientName: 'Erin Escrow',
  recipientEmail: 'erin@escrowco.com',
  ccPartyId: null,
  ccRole: 'buyer_agent',
  ccName: 'Alice Agent',
  ccEmail: 'alice@brokerage.com',
};
const BROKER_LINK = {
  id: 'link-5',
  purpose: 'broker_document_upload',
  emailMessageId: null,
  transactionId: 'tx-1',
  recipientPartyId: null,
  recipientRole: 'other',
  recipientName: 'Bobby Broker',
  recipientEmail: 'bobby@brokerfirm.com',
  ccPartyId: null,
  ccRole: null,
  ccName: null,
  ccEmail: null,
};
const COMPLIANT_RESULT = { summary: { overallStatus: 'compliant', passCount: 1, failCount: 0, warningCount: 0, skippedCount: 0 }, checks: [], blockers: [] };
const NEEDS_REVIEW_RESULT = { summary: { overallStatus: 'needs_review', passCount: 1, failCount: 0, warningCount: 1, skippedCount: 0 }, checks: [], warnings: [{ code: 'WARN-1', message: 'Missing optional initials.' }] };
function nonCompliantResult(blockerMessages: string[]) {
  return {
    summary: { overallStatus: 'non_compliant', passCount: 0, failCount: blockerMessages.length, warningCount: 0, skippedCount: 0 },
    checks: [],
    blockers: blockerMessages.map((message, i) => ({ code: `BLOCKER-${i}`, compositeId: `BLOCKER-RPA-${i}`, message, formCode: 'RPA', type: 'blocker' as const })),
  };
}

const TRANSACTION = {
  id: 'tx-1',
  propertyAddressLine1: '123 Main St',
  propertyCity: 'Chino',
  propertyState: 'CA',
  outboundEmailAddress: 'txn-abc123@txn.mytcapp.net',
  createdByAccount: {
    displayName: 'Carla Creator',
    firstName: 'Carla',
    cellPhone: '555-0200',
    user: { email: 'carla@tc.com' },
  },
};
const OTHER_TRANSACTION = {
  id: 'tx-2',
  propertyAddressLine1: '456 Other Ave',
  propertyCity: 'Nowhere',
  propertyState: 'CA',
  outboundEmailAddress: 'txn-def456@txn.mytcapp.net',
  createdByAccount: {
    displayName: 'Dana Other',
    firstName: 'Dana',
    cellPhone: '555-0300',
    user: { email: 'dana@tc.com' },
  },
};
const OTHER_TX_LINK = { ...LINK, id: 'link-3', transactionId: 'tx-2', recipientEmail: 'other@brokerage.com' };

/** Lets the in-memory document fakes below resolve "which link uploaded this doc, and what's that link's own purpose/recipientRole" from a bare uploadLinkId — mirroring the real uploadLink relation TypeORM would load. */
const LINKS_BY_ID: Record<string, { purpose: string; recipientRole: string }> = {
  [LINK.id]: LINK,
  [SELLER_AGENT_LINK.id]: SELLER_AGENT_LINK,
  [ESCROW_LINK.id]: ESCROW_LINK,
  [OTHER_TX_LINK.id]: OTHER_TX_LINK,
};

interface DocRow {
  id: string;
  transactionId: string;
  uploadLinkId: string | null;
  fileName: string | null;
  storageKey: string;
  formCode: string | null;
  analysisStatus: string | null;
  fileSizeBytes: number | null;
  idempotencyKey: string | null;
  documentType: string;
  metadataJson?: Record<string, unknown>;
  createdAt: Date;
  status?: string;
  stage?: string;
  isOriginalPackage?: boolean;
  sourceDocumentId?: string | null;
  sourcePageStart?: number | null;
  sourcePageEnd?: number | null;
  title?: string;
}

/** Applies the real canExternalUserSeeDocument/resolveUploadedByType rules against an in-memory doc "table" — shared by every fake below so the visibility rule itself is never reimplemented, only the doc storage. */
function visibleDocsFor(docs: DocRow[], transactionId: string, linkType: UploadLinkVisibilityType): (DocRow & { uploadLink: { purpose: string; recipientRole: string } | null })[] {
  return docs
    .filter((d) => d.transactionId === transactionId && d.status !== 'superseded')
    .map((d) => ({ ...d, uploadLink: d.uploadLinkId ? (LINKS_BY_ID[d.uploadLinkId] ?? null) : null }))
    .filter((d) => canExternalUserSeeDocument(
      { uploadedByType: resolveUploadedByType(d.uploadLinkId, d.uploadLink?.purpose), formCode: d.formCode, documentType: d.documentType, status: d.status ?? 'uploaded' },
      linkType,
    ));
}

/** A small stateful fake standing in for storageService.storeUploadedFile + TransactionDocumentsService, sharing one in-memory "table" so tests can exercise real create → analyze → list flows. */
function makeUploadedDocsFake() {
  const docs: DocRow[] = [];
  let counter = 0;

  const storeUploadedFile = jest.fn(async (params: {
    transactionId: string; uploadLinkId?: string | null; file: Express.Multer.File;
    idempotencyKey?: string | null; fileSizeBytes?: number | null; analysisStatus?: string | null;
    documentType?: string; metadataJson: Record<string, unknown>;
  }) => {
    const doc: DocRow = {
      id: `doc-${++counter}`,
      transactionId: params.transactionId,
      uploadLinkId: params.uploadLinkId ?? null,
      fileName: params.file.originalname,
      storageKey: `transactions/${params.transactionId}/external-uploads/${counter}-${params.file.originalname}`,
      formCode: null,
      analysisStatus: params.analysisStatus ?? null,
      fileSizeBytes: params.fileSizeBytes ?? null,
      idempotencyKey: params.idempotencyKey ?? null,
      documentType: params.documentType ?? 'external_upload',
      metadataJson: params.metadataJson,
      createdAt: new Date(),
    };
    docs.push(doc);
    return doc;
  });

  const documentsService = {
    findOne: jest.fn(async (id: string) => docs.find((d) => d.id === id) ?? null),
    findByUploadLink: jest.fn(async (uploadLinkId: string, transactionId: string) =>
      docs.filter((d) => d.uploadLinkId === uploadLinkId && d.transactionId === transactionId)),
    findByUploadLinkAndIdempotencyKey: jest.fn(async (uploadLinkId: string, idempotencyKey: string) =>
      docs.find((d) => d.uploadLinkId === uploadLinkId && d.idempotencyKey === idempotencyKey) ?? null),
    findVisibleForUploadLink: jest.fn(async (transactionId: string, linkType: UploadLinkVisibilityType) =>
      visibleDocsFor(docs, transactionId, linkType)),
    updateAnalysisResult: jest.fn(async (id: string, patch: { analysisStatus: string; formCode?: string | null; analyzedAt: Date }) => {
      const doc = docs.find((d) => d.id === id);
      if (doc) {
        doc.analysisStatus = patch.analysisStatus;
        if (patch.formCode !== undefined) doc.formCode = patch.formCode;
      }
    }),
    patchMetadataJson: jest.fn(async (id: string, patch: Record<string, unknown>) => {
      const doc = docs.find((d) => d.id === id);
      if (doc) doc.metadataJson = { ...(doc.metadataJson ?? {}), ...patch };
    }),
    createDocumentWithMetadata: jest.fn(async (params: {
      transactionId: string; stage: string; documentType: string; title: string; storageKey: string | null;
      fileName: string | null; mimeType: string | null; sourceDocumentId?: string | null;
      sourcePageStart?: number | null; sourcePageEnd?: number | null; formCode?: string | null;
      uploadLinkId?: string | null; analysisStatus?: string | null; metadataJson?: Record<string, unknown>;
    }) => {
      const doc: DocRow = {
        id: `doc-${++counter}`,
        transactionId: params.transactionId,
        uploadLinkId: params.uploadLinkId ?? null,
        fileName: params.fileName,
        storageKey: params.storageKey ?? '',
        formCode: params.formCode ?? null,
        analysisStatus: params.analysisStatus ?? null,
        fileSizeBytes: null,
        idempotencyKey: null,
        documentType: params.documentType,
        metadataJson: params.metadataJson,
        createdAt: new Date(),
        stage: params.stage,
        isOriginalPackage: false,
        sourceDocumentId: params.sourceDocumentId ?? null,
        sourcePageStart: params.sourcePageStart ?? null,
        sourcePageEnd: params.sourcePageEnd ?? null,
        title: params.title,
      };
      docs.push(doc);
      return doc;
    }),
    markAsOriginalPackage: jest.fn(async (id: string) => {
      const doc = docs.find((d) => d.id === id);
      if (doc) {
        doc.isOriginalPackage = true;
        doc.formCode = null;
      }
    }),
  };

  return { docs, storeUploadedFile, documentsService };
}

function buildService(overrides: {
  validateFileImpl?: (file: Express.Multer.File) => { valid: true; sanitizedFileName: string } | { valid: false; reason: string };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  storeUploadedFileImpl?: (params: any) => Promise<{ id: string; storageKey: string }>;
  link?: typeof LINK | typeof SELLER_AGENT_LINK | typeof ESCROW_LINK | typeof BROKER_LINK;
  transaction?: typeof TRANSACTION;
  documentsServiceImpl?: Record<string, jest.Mock>;
  pipelineProcessImpl?: (buffer: Buffer) => Promise<unknown>;
  checklistStatusImpl?: () => Promise<{ allRequiredSubmitted: boolean }>;
  linkFindByIdImpl?: () => Promise<{ docusignConfirmationRequestedAt: Date | null } | null>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  formSplitterImpl?: (sourceBuffer: Buffer, extractions: any[]) => Promise<Map<string, { buffer: Buffer; pageStart: number; pageEnd: number }>>;
} = {}) {
  const uploadLinkService = { validateUploadToken: jest.fn().mockResolvedValue({ link: overrides.link ?? LINK, transaction: overrides.transaction ?? TRANSACTION }) };
  const uploadLinkRepo = {
    incrementUploadCount: jest.fn().mockResolvedValue(undefined),
    findById: jest.fn(overrides.linkFindByIdImpl ?? (async () => ({ docusignConfirmationRequestedAt: null }))),
    recordDocusignConfirmationRequested: jest.fn().mockResolvedValue(undefined),
  };
  const defaultValidateFile = (file: Express.Multer.File): { valid: true; sanitizedFileName: string } =>
    ({ valid: true, sanitizedFileName: file.originalname.toLowerCase() });
  const fileValidationService = {
    validateFile: jest.fn(overrides.validateFileImpl ?? defaultValidateFile),
  };
  let docCounter = 0;
  const storageService = {
    storeUploadedFile: jest.fn(
      overrides.storeUploadedFileImpl ?? (async () => ({ id: `doc-${++docCounter}`, storageKey: `transactions/tx-1/external-uploads/${docCounter}-file.pdf` })),
    ),
  };
  const auditService = {
    recordUploadAuditEvent: jest.fn().mockResolvedValue(undefined),
    recordValidationFailureAuditEvent: jest.fn().mockResolvedValue(undefined),
    recordRejectionEmailSentAuditEvent: jest.fn().mockResolvedValue(undefined),
    recordDocusignConfirmationRequestedAuditEvent: jest.fn().mockResolvedValue(undefined),
    findRecentlyRejectedFormCodes: jest.fn().mockResolvedValue(new Set()),
    recordBuyerAgentValidationFailureAuditEvent: jest.fn().mockResolvedValue(undefined),
    recordBuyerAgentRejectionEmailSentAuditEvent: jest.fn().mockResolvedValue(undefined),
    recordEscrowValidationFailureAuditEvent: jest.fn().mockResolvedValue(undefined),
    recordEscrowRejectionEmailSentAuditEvent: jest.fn().mockResolvedValue(undefined),
  };
  const documentsService = {
    findByUploadLink: jest.fn().mockResolvedValue([]),
    findByUploadLinkAndIdempotencyKey: jest.fn().mockResolvedValue(null),
    findVisibleForUploadLink: jest.fn().mockResolvedValue([]),
    updateAnalysisResult: jest.fn().mockResolvedValue(undefined),
    patchMetadataJson: jest.fn().mockResolvedValue(undefined),
    ...overrides.documentsServiceImpl,
  };
  const pipelineService = {
    process: jest.fn(overrides.pipelineProcessImpl ?? (async () => ({
      detectedFormCode: 'RPA', detectedFormName: 'Purchase Agreement', extraction: {},
      compliance: COMPLIANT_RESULT,
    }))),
  };
  const uploadLinkEmailService = {
    sendSellerAgentRejectionEmail: jest.fn().mockResolvedValue({ sent: true, providerMessageId: 'mg-rejection-1' }),
    sendSellerAgentDocusignConfirmationEmail: jest.fn().mockResolvedValue({ sent: true, providerMessageId: 'mg-docusign-confirm-1' }),
    sendBuyerAgentRejectionEmail: jest.fn().mockResolvedValue({ sent: true, providerMessageId: 'mg-buyer-rejection-1' }),
    sendEscrowRejectionEmail: jest.fn().mockResolvedValue({ sent: true, providerMessageId: 'mg-escrow-rejection-1' }),
  };
  const formTemplatesService = {
    getSellerAgentChecklistStatus: jest.fn(overrides.checklistStatusImpl ?? (async () => ({ allRequiredSubmitted: false }))),
  };
  const contingencyReminderScheduler = {
    cancelForSatisfiedContingencies: jest.fn().mockResolvedValue(undefined),
  };
  const vpReminderScheduler = {
    cancelIfSatisfied: jest.fn().mockResolvedValue(undefined),
  };
  const sellerSideReminderScheduler = {
    cancelIfSatisfied: jest.fn().mockResolvedValue(undefined),
  };
  const vpBrokerDocusignService = {
    handleVpUploaded: jest.fn().mockResolvedValue(undefined),
  };
  const formSplitter = {
    splitByForm: jest.fn(overrides.formSplitterImpl ?? (async () => new Map())),
  };
  const s3 = {
    upload: jest.fn().mockResolvedValue({ storageKey: 'transactions/tx-1/external-uploads/split-doc.pdf' }),
  };
  const messagesRepo = {
    find: jest.fn().mockResolvedValue([]),
  };

  const service = new ExternalDocumentUploadService(
    uploadLinkService as never,
    uploadLinkRepo as never,
    fileValidationService as never,
    storageService as never,
    auditService as never,
    documentsService as never,
    pipelineService as never,
    uploadLinkEmailService as never,
    formTemplatesService as never,
    contingencyReminderScheduler as never,
    vpReminderScheduler as never,
    sellerSideReminderScheduler as never,
    vpBrokerDocusignService as never,
    formSplitter as never,
    s3 as never,
    messagesRepo as never,
  );

  return { service, uploadLinkService, uploadLinkRepo, fileValidationService, storageService, auditService, documentsService, pipelineService, uploadLinkEmailService, formTemplatesService, contingencyReminderScheduler, vpReminderScheduler, sellerSideReminderScheduler, vpBrokerDocusignService, formSplitter, s3, messagesRepo };
}

describe('ExternalDocumentUploadService', () => {
  it('rejects with the generic invalid-token error when the token does not validate, before touching storage', async () => {
    const { storageService } = buildService();
    const failingUploadLinkService = { validateUploadToken: jest.fn().mockRejectedValue(new Error('This upload link is invalid or has expired.')) };
    const failing = new ExternalDocumentUploadService(
      failingUploadLinkService as never,
      { incrementUploadCount: jest.fn() } as never,
      { validateFile: jest.fn() } as never,
      storageService as never,
      { recordUploadAuditEvent: jest.fn() } as never,
      { findByUploadLink: jest.fn(), findByUploadLinkAndIdempotencyKey: jest.fn(), updateAnalysisResult: jest.fn(), patchMetadataJson: jest.fn() } as never,
      { process: jest.fn() } as never,
      { sendSellerAgentRejectionEmail: jest.fn() } as never,
      { getSellerAgentChecklistStatus: jest.fn() } as never,
      { cancelForSatisfiedContingencies: jest.fn() } as never,
      { cancelIfSatisfied: jest.fn() } as never,
      { cancelIfSatisfied: jest.fn() } as never,
      { handleVpUploaded: jest.fn() } as never,
      { splitByForm: jest.fn().mockResolvedValue(new Map()) } as never,
      { upload: jest.fn() } as never,
      { find: jest.fn().mockResolvedValue([]) } as never,
    );

    await expect(failing.uploadTransactionDocuments('bad-token', [makeFile('a.pdf')])).rejects.toThrow('This upload link is invalid or has expired.');
    expect(storageService.storeUploadedFile).not.toHaveBeenCalled();
  });

  it('rejects the new document-list endpoint with the same generic message for an expired/revoked/invalid token', async () => {
    const failingUploadLinkService = { validateUploadToken: jest.fn().mockRejectedValue(new Error('This upload link is invalid or has expired.')) };
    const failing = new ExternalDocumentUploadService(
      failingUploadLinkService as never,
      { incrementUploadCount: jest.fn() } as never,
      { validateFile: jest.fn() } as never,
      { storeUploadedFile: jest.fn() } as never,
      { recordUploadAuditEvent: jest.fn() } as never,
      { findByUploadLink: jest.fn(), findByUploadLinkAndIdempotencyKey: jest.fn(), updateAnalysisResult: jest.fn(), patchMetadataJson: jest.fn() } as never,
      { process: jest.fn() } as never,
      { sendSellerAgentRejectionEmail: jest.fn() } as never,
      { getSellerAgentChecklistStatus: jest.fn() } as never,
      { cancelForSatisfiedContingencies: jest.fn() } as never,
      { cancelIfSatisfied: jest.fn() } as never,
      { cancelIfSatisfied: jest.fn() } as never,
      { handleVpUploaded: jest.fn() } as never,
      { splitByForm: jest.fn().mockResolvedValue(new Map()) } as never,
      { upload: jest.fn() } as never,
      { find: jest.fn().mockResolvedValue([]) } as never,
    );

    await expect(failing.listUploadedDocuments('bad-token')).rejects.toThrow('This upload link is invalid or has expired.');
  });

  it('uploads multiple files successfully in one request', async () => {
    const { service, storageService } = buildService();
    const results = await service.uploadTransactionDocuments('good-token', [makeFile('a.pdf'), makeFile('b.pdf')]);

    expect(results).toHaveLength(2);
    expect(results.every((r) => r.status === 'success')).toBe(true);
    expect(storageService.storeUploadedFile).toHaveBeenCalledTimes(2);
  });

  it('rejects unsupported and oversized files without calling storage', async () => {
    const { service, storageService } = buildService({
      validateFileImpl: (file) => file.mimetype === 'application/pdf'
        ? { valid: false, reason: 'File exceeds the 25MB size limit.' }
        : { valid: false, reason: 'File type "application/x-msdownload" is not supported.' },
    });
    const results = await service.uploadTransactionDocuments('good-token', [
      makeFile('huge.pdf'),
      makeFile('installer.exe', { mimetype: 'application/x-msdownload' }),
    ]);

    expect(results.every((r) => r.status === 'failed')).toBe(true);
    expect(storageService.storeUploadedFile).not.toHaveBeenCalled();
  });

  it('does not overwrite when two uploads share the same filename — each gets its own document row', async () => {
    const { service, storageService } = buildService();
    const results = await service.uploadTransactionDocuments('good-token', [makeFile('contract.pdf'), makeFile('contract.pdf')]);

    expect(results).toHaveLength(2);
    expect(results.every((r) => r.status === 'success')).toBe(true);
    expect(new Set(results.map((r) => r.documentId)).size).toBe(2); // two distinct document rows
    expect(storageService.storeUploadedFile).toHaveBeenCalledTimes(2);
  });

  it('records a success audit event with the full field set and increments the link upload count', async () => {
    const { service, auditService, uploadLinkRepo } = buildService();
    await service.uploadTransactionDocuments('good-token', [makeFile('contract.pdf', { size: 2048 })]);

    expect(auditService.recordUploadAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      transactionId: 'tx-1',
      propertyAddress: expect.stringContaining('123 Main St'),
      originalFileName: 'contract.pdf',
      fileType: 'application/pdf',
      fileSize: 2048,
      recipientRole: 'buyer_agent',
      recipientPartyId: 'party-ba-1',
      recipientName: 'Alice Agent',
      recipientEmail: 'alice@brokerage.com',
      uploadLinkId: 'link-1',
      uploadSource: 'secure_email_link',
      status: 'success',
    }));
    expect(uploadLinkRepo.incrementUploadCount).toHaveBeenCalledWith('link-1');
  });

  it('a storage failure leaves no document record and is recorded as a failed audit event, not a success', async () => {
    const { service, auditService, storageService, uploadLinkRepo } = buildService({
      storeUploadedFileImpl: async () => { throw new Error('S3 upload failed'); },
    });

    const results = await service.uploadTransactionDocuments('good-token', [makeFile('contract.pdf')]);

    expect(results).toEqual([{ fileName: 'contract.pdf', status: 'failed', error: 'S3 upload failed' }]);
    expect(auditService.recordUploadAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      status: 'failed',
      failureReason: 'S3 upload failed',
      documentId: null,
      storageKey: null,
    }));
    expect(uploadLinkRepo.incrementUploadCount).not.toHaveBeenCalled();
    expect(storageService.storeUploadedFile).toHaveBeenCalledTimes(1);
  });

  it('processes files independently — one failure does not block the others in the same batch', async () => {
    let call = 0;
    const { service } = buildService({
      storeUploadedFileImpl: async () => {
        call += 1;
        if (call === 1) throw new Error('boom');
        return { id: 'doc-ok', storageKey: 'transactions/tx-1/external-uploads/ok.pdf' };
      },
    });

    const results = await service.uploadTransactionDocuments('good-token', [makeFile('bad.pdf'), makeFile('good.pdf')]);
    expect(results.find((r) => r.fileName === 'bad.pdf')?.status).toBe('failed');
    expect(results.find((r) => r.fileName === 'good.pdf')?.status).toBe('success');
  });

  it('kicks off background analysis for a successfully-stored PDF, but not for a non-PDF file', async () => {
    const { service, pipelineService } = buildService();
    await service.uploadTransactionDocuments('good-token', [makeFile('contract.pdf'), makeFile('photo.jpg', { mimetype: 'image/jpeg' })]);

    // give the un-awaited `void this.analyzeUploadedDocument(...)` a turn of the event loop
    await new Promise((resolve) => setImmediate(resolve));
    expect(pipelineService.process).toHaveBeenCalledTimes(1);
  });
});

describe('ExternalDocumentUploadService — Broker link has zero document access', () => {
  it('rejects uploadTransactionDocuments with the generic invalid-link message, before touching storage', async () => {
    const { service, storageService } = buildService({ link: BROKER_LINK });
    await expect(service.uploadTransactionDocuments('broker-token', [makeFile('a.pdf')]))
      .rejects.toThrow('This upload link is invalid or has expired.');
    expect(storageService.storeUploadedFile).not.toHaveBeenCalled();
  });

  it('rejects listUploadedDocuments with the generic invalid-link message', async () => {
    const { service, documentsService } = buildService({ link: BROKER_LINK });
    await expect(service.listUploadedDocuments('broker-token'))
      .rejects.toThrow('This upload link is invalid or has expired.');
    expect(documentsService.findVisibleForUploadLink).not.toHaveBeenCalled();
  });
});

describe('ExternalDocumentUploadService — Seller Agent secure upload link', () => {
  it('uploads multiple documents successfully through the Seller Agent link', async () => {
    const { service, storageService } = buildService({ link: SELLER_AGENT_LINK });
    const results = await service.uploadTransactionDocuments('seller-token', [makeFile('disclosure.pdf'), makeFile('addendum.pdf')]);

    expect(results).toHaveLength(2);
    expect(results.every((r) => r.status === 'success')).toBe(true);
    expect(storageService.storeUploadedFile).toHaveBeenCalledTimes(2);
  });

  it('does not overwrite when two Seller Agent uploads share the same filename', async () => {
    const { service } = buildService({ link: SELLER_AGENT_LINK });
    const results = await service.uploadTransactionDocuments('seller-token', [makeFile('disclosure.pdf'), makeFile('disclosure.pdf')]);

    expect(results.every((r) => r.status === 'success')).toBe(true);
    expect(new Set(results.map((r) => r.documentId)).size).toBe(2);
  });

  it('records the audit event and document metadata with the Seller Agent upload source, purpose, CC identity, and email message id', async () => {
    const { service, auditService, storageService } = buildService({ link: SELLER_AGENT_LINK });
    await service.uploadTransactionDocuments('seller-token', [makeFile('disclosure.pdf', { size: 4096 })]);

    expect(auditService.recordUploadAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      transactionId: 'tx-1',
      propertyAddress: expect.stringContaining('123 Main St'),
      originalFileName: 'disclosure.pdf',
      fileType: 'application/pdf',
      fileSize: 4096,
      recipientRole: 'seller_agent',
      recipientPartyId: 'party-sa-1',
      recipientName: 'Sam Seller Agent',
      recipientEmail: 'sam@listingco.com',
      ccRecipient: { role: 'seller_transaction_coordinator', partyId: 'party-stc-1', name: 'Tina TC', email: 'tina@sunsetrealty.com' },
      uploadLinkId: 'link-2',
      uploadLinkPurpose: 'seller_agent_document_upload',
      uploadSource: 'seller_agent_secure_upload_link',
      emailMessageId: 'mg-seller-1',
      status: 'success',
    }));

    expect(storageService.storeUploadedFile).toHaveBeenCalledWith(expect.objectContaining({
      metadataJson: expect.objectContaining({
        uploadSource: 'seller_agent_secure_upload_link',
        uploadLinkId: 'link-2',
        uploadLinkPurpose: 'seller_agent_document_upload',
        recipientRole: 'seller_agent',
        ccRole: 'seller_transaction_coordinator',
        ccPartyId: 'party-stc-1',
        ccName: 'Tina TC',
        ccEmail: 'tina@sunsetrealty.com',
      }),
    }));
  });

  it('omits CC fields in the audit event when no Seller TC was assigned to the link', async () => {
    const { service, auditService } = buildService({ link: { ...SELLER_AGENT_LINK, ccPartyId: null, ccRole: null, ccName: null, ccEmail: null } });
    await service.uploadTransactionDocuments('seller-token', [makeFile('disclosure.pdf')]);

    expect(auditService.recordUploadAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ ccRecipient: null }));
  });

  it('keeps the Buyer Agent upload source distinct from the Seller Agent upload source', async () => {
    const { service: buyerService, auditService: buyerAudit } = buildService({ link: LINK });
    const { service: sellerService, auditService: sellerAudit } = buildService({ link: SELLER_AGENT_LINK });

    await buyerService.uploadTransactionDocuments('buyer-token', [makeFile('a.pdf')]);
    await sellerService.uploadTransactionDocuments('seller-token', [makeFile('b.pdf')]);

    expect(buyerAudit.recordUploadAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ uploadSource: 'secure_email_link', uploadLinkPurpose: 'document_upload' }));
    expect(sellerAudit.recordUploadAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ uploadSource: 'seller_agent_secure_upload_link', uploadLinkPurpose: 'seller_agent_document_upload' }));
  });

  it('stores, audits, and increments upload count exactly once per file — no PDF splitting, blockers, or swimlane/stage side effects invoked', async () => {
    const { service, storageService, auditService, uploadLinkRepo, uploadLinkService, fileValidationService } = buildService({ link: SELLER_AGENT_LINK });
    await service.uploadTransactionDocuments('seller-token', [makeFile('disclosure.pdf')]);

    // The orchestrator's only collaborators are these seven — there is no swimlane,
    // blocker, or stage-advancement dependency to call in the first place.
    expect(uploadLinkService.validateUploadToken).toHaveBeenCalledTimes(1);
    expect(fileValidationService.validateFile).toHaveBeenCalledTimes(1);
    expect(storageService.storeUploadedFile).toHaveBeenCalledTimes(1);
    expect(auditService.recordUploadAuditEvent).toHaveBeenCalledTimes(1);
    expect(uploadLinkRepo.incrementUploadCount).toHaveBeenCalledTimes(1);
  });
});

describe('ExternalDocumentUploadService — background form-type analysis', () => {
  it('a successful, untagged Escrow Officer PDF upload (e.g. a Signed RPA) is analyzed SYNCHRONOUSLY like Buyer/Seller Agent — already "completed" with its form type by the time upload returns', async () => {
    const { docs, storeUploadedFile, documentsService } = makeUploadedDocsFake();
    const { service, pipelineService } = buildService({
      link: ESCROW_LINK,
      storeUploadedFileImpl: storeUploadedFile,
      documentsServiceImpl: documentsService,
      pipelineProcessImpl: async () => ({ detectedFormCode: 'RPA', detectedFormName: 'Residential Purchase Agreement', extraction: {}, compliance: COMPLIANT_RESULT }),
    });

    const [result] = await service.uploadTransactionDocuments('escrow-token', [makeFile('rpa.pdf')]);

    expect(result.status).toBe('success');
    expect(docs[0].analysisStatus).toBe('completed');
    expect(docs[0].formCode).toBe('RPA');
    expect(pipelineService.process).toHaveBeenCalledTimes(1); // ran once, synchronously — no separate fire-and-forget re-analysis
  });

  it('an Escrow Officer upload tagged with one of Escrow\'s own dedicated document types (never a CAR form) stays on the pre-existing async path — stored "analyzing", then "saved" once analysis completes', async () => {
    const { docs, storeUploadedFile, documentsService } = makeUploadedDocsFake();
    const { service } = buildService({
      link: ESCROW_LINK,
      storeUploadedFileImpl: storeUploadedFile,
      documentsServiceImpl: documentsService,
      pipelineProcessImpl: async () => ({ detectedFormCode: null, detectedFormName: null, extraction: {}, compliance: COMPLIANT_RESULT }),
    });

    const [result] = await service.uploadTransactionDocuments('escrow-token', [makeFile('instructions.pdf')], null, 'escrow_instructions');

    // The row is created already tagged "analyzing" — asserted at the storage call site rather
    // than by reading the mutable row after the fact, since the mocked pipeline resolves fast
    // enough that the fire-and-forget analysis may already have completed by this point.
    expect(storeUploadedFile).toHaveBeenCalledWith(expect.objectContaining({ analysisStatus: 'analyzing' }));

    await service.analyzeUploadedDocument(result.documentId!, Buffer.from('pdf'));

    expect(docs[0].analysisStatus).toBe('completed');
  });

  it('a successful Buyer Agent PDF upload is analyzed SYNCHRONOUSLY like Seller Agent — already "completed" with its form type by the time upload returns, since a compliant detection never blocks saving', async () => {
    const { docs, storeUploadedFile, documentsService } = makeUploadedDocsFake();
    const { service, pipelineService } = buildService({
      storeUploadedFileImpl: storeUploadedFile,
      documentsServiceImpl: documentsService,
      pipelineProcessImpl: async () => ({ detectedFormCode: 'RPA', detectedFormName: 'Residential Purchase Agreement', extraction: {}, compliance: COMPLIANT_RESULT }),
    });

    const [result] = await service.uploadTransactionDocuments('buyer-token', [makeFile('rpa.pdf')]);

    expect(result.status).toBe('success');
    expect(docs[0].analysisStatus).toBe('completed');
    expect(docs[0].formCode).toBe('RPA');
    expect(pipelineService.process).toHaveBeenCalledTimes(1); // ran once, synchronously — no separate fire-and-forget re-analysis
  });

  it('a successful (compliant) Seller Agent PDF upload is analyzed SYNCHRONOUSLY — already "completed" with its form type by the time upload returns, not "analyzing"', async () => {
    const { docs, storeUploadedFile, documentsService } = makeUploadedDocsFake();
    const { service, pipelineService } = buildService({
      link: SELLER_AGENT_LINK,
      storeUploadedFileImpl: storeUploadedFile,
      documentsServiceImpl: documentsService,
      pipelineProcessImpl: async () => ({ detectedFormCode: 'TDS', detectedFormName: 'Transfer Disclosure Statement', extraction: {}, compliance: COMPLIANT_RESULT }),
    });

    await service.uploadTransactionDocuments('seller-token', [makeFile('tds.pdf')]);

    expect(docs[0].uploadLinkId).toBe('link-2');
    expect(docs[0].analysisStatus).toBe('completed');
    expect(docs[0].formCode).toBe('TDS');
    expect(pipelineService.process).toHaveBeenCalledTimes(1); // ran once, synchronously — no separate fire-and-forget re-analysis
  });

  it('keeps the uploaded file and marks analysis as failed, without touching any other field, when the pipeline throws', async () => {
    const { docs, storeUploadedFile, documentsService } = makeUploadedDocsFake();
    const { service } = buildService({
      storeUploadedFileImpl: storeUploadedFile,
      documentsServiceImpl: documentsService,
      pipelineProcessImpl: async () => { throw new Error('LLM classification failed'); },
    });

    const [result] = await service.uploadTransactionDocuments('buyer-token', [makeFile('scanned.pdf')]);
    await service.analyzeUploadedDocument(result.documentId!, Buffer.from('pdf'));

    expect(docs[0].analysisStatus).toBe('failed');
    expect(docs[0].formCode).toBeNull();
    expect(docs[0].storageKey).toBeTruthy(); // the file itself is untouched/retained

    const [dto] = await service.listUploadedDocuments('buyer-token');
    expect(dto.status).toBe('analysis_failed');
    expect(dto.message).toBe('Document uploaded successfully, but the form type could not be identified.');
  });
});

describe('ExternalDocumentUploadService — persisted, strictly-scoped document list', () => {
  it('the uploaded-documents list persists after "refresh" — a second, independent call returns the same documents', async () => {
    const { storeUploadedFile, documentsService } = makeUploadedDocsFake();
    const { service } = buildService({ storeUploadedFileImpl: storeUploadedFile, documentsServiceImpl: documentsService });

    await service.uploadTransactionDocuments('buyer-token', [makeFile('a.pdf'), makeFile('b.pdf')]);

    const firstFetch = await service.listUploadedDocuments('buyer-token');
    const secondFetch = await service.listUploadedDocuments('buyer-token'); // simulates the recipient returning to the page later
    expect(firstFetch.map((d) => d.id)).toEqual(secondFetch.map((d) => d.id));
    expect(firstFetch).toHaveLength(2);
  });

  it('a Buyer Agent link never returns another transaction\'s documents', async () => {
    const { docs, storeUploadedFile, documentsService } = makeUploadedDocsFake();
    const { service: serviceForTxA } = buildService({ storeUploadedFileImpl: storeUploadedFile, documentsServiceImpl: documentsService, link: LINK, transaction: TRANSACTION });
    const { service: serviceForTxB } = buildService({ storeUploadedFileImpl: storeUploadedFile, documentsServiceImpl: documentsService, link: OTHER_TX_LINK, transaction: OTHER_TRANSACTION });

    await serviceForTxA.uploadTransactionDocuments('token-a', [makeFile('a.pdf')]);
    await serviceForTxB.uploadTransactionDocuments('token-b', [makeFile('b.pdf')]);
    expect(docs).toHaveLength(2); // sanity: both landed in the shared fake store

    const listForTxA = await serviceForTxA.listUploadedDocuments('token-a');
    expect(listForTxA).toHaveLength(1);
    expect(listForTxA[0].fileName).toBe('a.pdf');
  });

  it('Buyer Agent and Seller Agent links only ever see their own uploads, even within the same transaction', async () => {
    const { docs, storeUploadedFile, documentsService } = makeUploadedDocsFake();
    const { service: buyerService } = buildService({ storeUploadedFileImpl: storeUploadedFile, documentsServiceImpl: documentsService, link: LINK });
    const { service: sellerService } = buildService({ storeUploadedFileImpl: storeUploadedFile, documentsServiceImpl: documentsService, link: SELLER_AGENT_LINK });

    await buyerService.uploadTransactionDocuments('buyer-token', [makeFile('buyer-doc.pdf')]);
    await sellerService.uploadTransactionDocuments('seller-token', [makeFile('seller-doc.pdf')]);
    expect(docs).toHaveLength(2);

    const buyerList = await buyerService.listUploadedDocuments('buyer-token');
    const sellerList = await sellerService.listUploadedDocuments('seller-token');

    expect(buyerList).toHaveLength(1);
    expect(buyerList[0].fileName).toBe('buyer-doc.pdf');
    expect(buyerList[0].recipientRole).toBe('buyer_agent');

    expect(sellerList).toHaveLength(1);
    expect(sellerList[0].fileName).toBe('seller-doc.pdf');
    expect(sellerList[0].recipientRole).toBe('seller_agent');
  });

  it('includes a token-scoped viewUrl for a document with a stored file, and null when there is none yet', async () => {
    const { storeUploadedFile, documentsService } = makeUploadedDocsFake();
    const { service } = buildService({ storeUploadedFileImpl: storeUploadedFile, documentsServiceImpl: documentsService });

    const [uploaded] = await service.uploadTransactionDocuments('buyer-token', [makeFile('a.pdf')]);
    const [dto] = await service.listUploadedDocuments('buyer-token');

    expect(dto.viewUrl).toBe(`/api/v1/upload-links/token/buyer-token/documents/${uploaded.documentId}/file`);
  });

  it('excludes a superseded document (e.g. an unsigned original replaced by its DocuSign-signed version) from the public list', async () => {
    const { docs, storeUploadedFile, documentsService } = makeUploadedDocsFake();
    const { service } = buildService({ storeUploadedFileImpl: storeUploadedFile, documentsServiceImpl: documentsService });

    await service.uploadTransactionDocuments('buyer-token', [makeFile('original.pdf'), makeFile('signed.pdf')]);
    const original = docs.find((d) => d.fileName === 'original.pdf')!;
    original.status = 'superseded';

    const list = await service.listUploadedDocuments('buyer-token');
    expect(list.map((d) => d.fileName)).toEqual(['signed.pdf']);
  });

  it('applies the same superseded-exclusion/signed-replacement behavior on the Seller Agent upload link, not just the Buyer Agent one', async () => {
    const { docs, storeUploadedFile, documentsService } = makeUploadedDocsFake();
    const { service } = buildService({ storeUploadedFileImpl: storeUploadedFile, documentsServiceImpl: documentsService, link: SELLER_AGENT_LINK });

    await service.uploadTransactionDocuments('seller-token', [makeFile('tds-original.pdf'), makeFile('tds-signed.pdf')]);
    const original = docs.find((d) => d.fileName === 'tds-original.pdf')!;
    original.status = 'superseded';

    const list = await service.listUploadedDocuments('seller-token');
    expect(list.map((d) => d.fileName)).toEqual(['tds-signed.pdf']);
    expect(list[0].recipientRole).toBe('seller_agent');
  });

  it('never exposes storageKey, credentials, or raw extraction/compliance internals in the public document list', async () => {
    const { storeUploadedFile, documentsService } = makeUploadedDocsFake();
    const { service } = buildService({
      storeUploadedFileImpl: storeUploadedFile,
      documentsServiceImpl: documentsService,
      pipelineProcessImpl: async () => ({ detectedFormCode: 'RPA', detectedFormName: 'Purchase Agreement', extraction: { secret: 'raw llm output' }, compliance: { summary: { overallStatus: 'compliant' }, blockers: ['x'] } }),
    });

    const [result] = await service.uploadTransactionDocuments('buyer-token', [makeFile('rpa.pdf')]);
    await service.analyzeUploadedDocument(result.documentId!, Buffer.from('pdf'));

    const [dto] = await service.listUploadedDocuments('buyer-token');
    const keys = Object.keys(dto);
    expect(keys).not.toContain('storageKey');
    expect(keys).not.toContain('metadataJson');
    expect(keys).not.toContain('extraction');
    expect(keys).not.toContain('compliance');
    expect(JSON.stringify(dto)).not.toContain('raw llm output');
  });
});

describe('ExternalDocumentUploadService — idempotent upload requests', () => {
  it('a retried request with the same Idempotency-Key and filename returns the existing document instead of creating a new one', async () => {
    const { storeUploadedFile, documentsService } = makeUploadedDocsFake();
    const { service } = buildService({ storeUploadedFileImpl: storeUploadedFile, documentsServiceImpl: documentsService });

    const first = await service.uploadTransactionDocuments('buyer-token', [makeFile('contract.pdf')], 'batch-key-1');
    const retry = await service.uploadTransactionDocuments('buyer-token', [makeFile('contract.pdf')], 'batch-key-1');

    expect(first[0].status).toBe('success');
    expect(retry[0].status).toBe('success');
    expect(retry[0].documentId).toBe(first[0].documentId);
    expect(storeUploadedFile).toHaveBeenCalledTimes(1); // the retry never re-touched storage
  });

  it('a different Idempotency-Key for the same filename is treated as a genuinely new upload', async () => {
    const { docs, storeUploadedFile, documentsService } = makeUploadedDocsFake();
    const { service } = buildService({ storeUploadedFileImpl: storeUploadedFile, documentsServiceImpl: documentsService });

    const first = await service.uploadTransactionDocuments('buyer-token', [makeFile('contract.pdf')], 'batch-key-1');
    const second = await service.uploadTransactionDocuments('buyer-token', [makeFile('contract.pdf')], 'batch-key-2');

    expect(second[0].documentId).not.toBe(first[0].documentId);
    expect(docs).toHaveLength(2);
  });

  it('with no Idempotency-Key supplied, repeated uploads of the same filename still create separate documents (unchanged prior behavior)', async () => {
    const { docs, storeUploadedFile, documentsService } = makeUploadedDocsFake();
    const { service } = buildService({ storeUploadedFileImpl: storeUploadedFile, documentsServiceImpl: documentsService });

    await service.uploadTransactionDocuments('buyer-token', [makeFile('contract.pdf')]);
    await service.uploadTransactionDocuments('buyer-token', [makeFile('contract.pdf')]);

    expect(docs).toHaveLength(2);
  });
});

describe('ExternalDocumentUploadService — HOA document category', () => {
  it('an HOA-tagged PDF is stored but never analyzed — it goes straight to "saved" with category hoa_document', async () => {
    const { docs, storeUploadedFile, documentsService } = makeUploadedDocsFake();
    const { service, pipelineService } = buildService({ storeUploadedFileImpl: storeUploadedFile, documentsServiceImpl: documentsService });

    const [result] = await service.uploadTransactionDocuments('buyer-token', [makeFile('hoa-bylaws.pdf')], null, 'hoa_document');

    expect(result.status).toBe('success');
    expect(docs[0].analysisStatus).toBe('completed'); // never 'analyzing', even for a PDF
    expect(docs[0].documentType).toBe('hoa_document');
    expect(pipelineService.process).not.toHaveBeenCalled();

    const [dto] = await service.listUploadedDocuments('buyer-token');
    expect(dto.category).toBe('hoa_document');
    expect(dto.status).toBe('saved');
    expect(dto.formType).toBeNull();
  });

  it('a general (non-HOA) upload is tagged category: "general"', async () => {
    const { storeUploadedFile, documentsService } = makeUploadedDocsFake();
    const { service } = buildService({ storeUploadedFileImpl: storeUploadedFile, documentsServiceImpl: documentsService });

    await service.uploadTransactionDocuments('buyer-token', [makeFile('contract.pdf')]);

    const [dto] = await service.listUploadedDocuments('buyer-token');
    expect(dto.category).toBe('general');
  });

  it('HOA and general documents can coexist in the same list, each correctly categorized', async () => {
    const { storeUploadedFile, documentsService } = makeUploadedDocsFake();
    const { service } = buildService({ storeUploadedFileImpl: storeUploadedFile, documentsServiceImpl: documentsService });

    await service.uploadTransactionDocuments('buyer-token', [makeFile('contract.pdf')]);
    await service.uploadTransactionDocuments('buyer-token', [makeFile('hoa-financials.pdf')], null, 'hoa_document');

    const list = await service.listUploadedDocuments('buyer-token');
    expect(list.find((d) => d.fileName === 'contract.pdf')?.category).toBe('general');
    expect(list.find((d) => d.fileName === 'hoa-financials.pdf')?.category).toBe('hoa_document');
  });

  it('is a Buyer Agent link feature only — a Seller Agent link passing documentCategory: "hoa_document" is silently ignored (normal upload, still analyzed)', async () => {
    const { storeUploadedFile, documentsService } = makeUploadedDocsFake();
    const { service, storageService } = buildService({
      link: SELLER_AGENT_LINK,
      storeUploadedFileImpl: storeUploadedFile,
      documentsServiceImpl: documentsService,
    });

    const [result] = await service.uploadTransactionDocuments('seller-token', [makeFile('not-actually-hoa.pdf')], null, 'hoa_document');

    expect(result.status).toBe('success');
    // Still analyzed like any other PDF — the HOA skip never applied. A Seller Agent PDF now
    // runs the compliance-validation gate SYNCHRONOUSLY (compliant here, via the default mock),
    // so it's already 'completed' with its result attached by the time storage is called —
    // never the 'analyzing' transient state Buyer Agent/Escrow PDFs go through.
    expect(storageService.storeUploadedFile).toHaveBeenCalledWith(expect.objectContaining({
      analysisStatus: 'completed',
      documentType: undefined, // never tagged 'hoa_document' for a Seller Agent link
    }));

    const [dto] = await service.listUploadedDocuments('seller-token');
    expect(dto.category).toBe('general');
  });
});

describe('ExternalDocumentUploadService — required document fields (Lender Prequalification Letter / Buyer Proof of Funds)', () => {
  it('tags a Lender Prequalification Letter upload with its assigned documentType, not automatic form classification', async () => {
    const { docs, storeUploadedFile, documentsService } = makeUploadedDocsFake();
    const { service } = buildService({
      storeUploadedFileImpl: storeUploadedFile,
      documentsServiceImpl: documentsService,
      pipelineProcessImpl: async () => ({ detectedFormCode: null, detectedFormName: null, extraction: {}, compliance: COMPLIANT_RESULT }),
    });

    await service.uploadTransactionDocuments('buyer-token', [makeFile('prequal-letter.pdf')], null, 'lender_prequalification');

    expect(docs[0].documentType).toBe('lender_prequalification'); // assigned deterministically at upload time

    const [dto] = await service.listUploadedDocuments('buyer-token');
    expect(dto.category).toBe('lender_prequalification');
  });

  it('tags a Buyer Proof of Funds upload with its assigned documentType', async () => {
    const { docs, storeUploadedFile, documentsService } = makeUploadedDocsFake();
    const { service } = buildService({ storeUploadedFileImpl: storeUploadedFile, documentsServiceImpl: documentsService });

    await service.uploadTransactionDocuments('buyer-token', [makeFile('proof-of-funds.pdf')], null, 'proof_of_funds');

    expect(docs[0].documentType).toBe('proof_of_funds');
    const [dto] = await service.listUploadedDocuments('buyer-token');
    expect(dto.category).toBe('proof_of_funds');
  });

  it('unlike HOA documents, a Lender Prequalification Letter PDF is still analyzed — synchronously now, like any other non-HOA Buyer Agent PDF', async () => {
    const { storeUploadedFile, documentsService } = makeUploadedDocsFake();
    const { service, storageService } = buildService({ storeUploadedFileImpl: storeUploadedFile, documentsServiceImpl: documentsService });

    await service.uploadTransactionDocuments('buyer-token', [makeFile('prequal-letter.pdf')], null, 'lender_prequalification');

    expect(storageService.storeUploadedFile).toHaveBeenCalledWith(expect.objectContaining({
      analysisStatus: 'completed',
      documentType: 'lender_prequalification',
    }));
  });

  it('is a Buyer Agent link feature only — a Seller Agent link passing documentCategory: "proof_of_funds" is silently ignored', async () => {
    const { storeUploadedFile, documentsService } = makeUploadedDocsFake();
    const { service, storageService } = buildService({
      link: SELLER_AGENT_LINK,
      storeUploadedFileImpl: storeUploadedFile,
      documentsServiceImpl: documentsService,
    });

    await service.uploadTransactionDocuments('seller-token', [makeFile('not-tagged.pdf')], null, 'proof_of_funds');

    expect(storageService.storeUploadedFile).toHaveBeenCalledWith(expect.objectContaining({ documentType: undefined }));
    const [dto] = await service.listUploadedDocuments('seller-token');
    expect(dto.category).toBe('general');
  });
});

describe('ExternalDocumentUploadService — Escrow Officer dedicated document types', () => {
  it('tags each of the 3 escrow document types with its assigned documentType, still analyzed normally (not skipped like HOA)', async () => {
    const { docs, storeUploadedFile, documentsService } = makeUploadedDocsFake();
    const { service, storageService } = buildService({ link: ESCROW_LINK, storeUploadedFileImpl: storeUploadedFile, documentsServiceImpl: documentsService });

    await service.uploadTransactionDocuments('escrow-token', [makeFile('instructions.pdf')], null, 'escrow_instructions');
    await service.uploadTransactionDocuments('escrow-token', [makeFile('prelim-title.pdf')], null, 'preliminary_title_report');
    await service.uploadTransactionDocuments('escrow-token', [makeFile('closing-statement.pdf')], null, 'estimated_closing_statement');

    expect(docs.map((d) => d.documentType)).toEqual(['escrow_instructions', 'preliminary_title_report', 'estimated_closing_statement']);
    expect(storageService.storeUploadedFile).toHaveBeenCalledWith(expect.objectContaining({ analysisStatus: 'analyzing', documentType: 'escrow_instructions' }));

    const list = await service.listUploadedDocuments('escrow-token');
    expect(list.find((d) => d.fileName === 'instructions.pdf')?.category).toBe('escrow_instructions');
    expect(list.find((d) => d.fileName === 'prelim-title.pdf')?.category).toBe('preliminary_title_report');
    expect(list.find((d) => d.fileName === 'closing-statement.pdf')?.category).toBe('estimated_closing_statement');
  });

  it('is an Escrow Officer link feature only — a Buyer Agent link passing an escrow documentCategory is silently ignored', async () => {
    const { storeUploadedFile, documentsService } = makeUploadedDocsFake();
    const { service, storageService } = buildService({ link: LINK, storeUploadedFileImpl: storeUploadedFile, documentsServiceImpl: documentsService });

    await service.uploadTransactionDocuments('buyer-token', [makeFile('not-actually-escrow.pdf')], null, 'escrow_instructions');

    expect(storageService.storeUploadedFile).toHaveBeenCalledWith(expect.objectContaining({ documentType: undefined }));
    const [dto] = await service.listUploadedDocuments('buyer-token');
    expect(dto.category).toBe('general');
  });

  it('the cross-contamination guard runs both ways — an Escrow link passing a Buyer-Agent-only category (e.g. proof_of_funds) is silently ignored', async () => {
    const { storeUploadedFile, documentsService } = makeUploadedDocsFake();
    const { service, storageService } = buildService({ link: ESCROW_LINK, storeUploadedFileImpl: storeUploadedFile, documentsServiceImpl: documentsService });

    await service.uploadTransactionDocuments('escrow-token', [makeFile('not-proof-of-funds.pdf')], null, 'proof_of_funds');

    expect(storageService.storeUploadedFile).toHaveBeenCalledWith(expect.objectContaining({ documentType: undefined }));
    const [dto] = await service.listUploadedDocuments('escrow-token');
    expect(dto.category).toBe('general');
  });

  it('an Escrow link can also tag the HOA category — HOA documents are collected through Escrow, same skip-analysis behavior as the Buyer Agent', async () => {
    const { storeUploadedFile, documentsService, docs } = makeUploadedDocsFake();
    const { service, pipelineService } = buildService({ link: ESCROW_LINK, storeUploadedFileImpl: storeUploadedFile, documentsServiceImpl: documentsService });

    const [result] = await service.uploadTransactionDocuments('escrow-token', [makeFile('hoa-bylaws.pdf')], null, 'hoa_document');

    expect(result.status).toBe('success');
    expect(docs[0].documentType).toBe('hoa_document');
    expect(docs[0].analysisStatus).toBe('completed'); // never 'analyzing', same as the Buyer Agent's own HOA uploads
    expect(pipelineService.process).not.toHaveBeenCalled();

    const [dto] = await service.listUploadedDocuments('escrow-token');
    expect(dto.category).toBe('hoa_document');
  });

  it('an Escrow Officer link never sees the Buyer Agent\'s or Seller Agent\'s documents for the same transaction, and vice versa', async () => {
    // Detected as TDS, not RPA — the RPA-always-visible-to-Escrow exception is
    // covered by its own dedicated describe block below; this test is about
    // ordinary, non-exception cross-link isolation.
    const nonRpaPipelineImpl = async () => ({ detectedFormCode: 'TDS', detectedFormName: 'Transfer Disclosure Statement', extraction: {}, compliance: COMPLIANT_RESULT });
    const { docs, storeUploadedFile, documentsService } = makeUploadedDocsFake();
    const { service: buyerService } = buildService({ link: LINK, storeUploadedFileImpl: storeUploadedFile, documentsServiceImpl: documentsService, pipelineProcessImpl: nonRpaPipelineImpl });
    const { service: sellerService } = buildService({ link: SELLER_AGENT_LINK, storeUploadedFileImpl: storeUploadedFile, documentsServiceImpl: documentsService, pipelineProcessImpl: nonRpaPipelineImpl });
    const { service: escrowService } = buildService({ link: ESCROW_LINK, storeUploadedFileImpl: storeUploadedFile, documentsServiceImpl: documentsService, pipelineProcessImpl: nonRpaPipelineImpl });

    await buyerService.uploadTransactionDocuments('buyer-token', [makeFile('buyer-doc.pdf')]);
    await sellerService.uploadTransactionDocuments('seller-token', [makeFile('seller-doc.pdf')]);
    await escrowService.uploadTransactionDocuments('escrow-token', [makeFile('escrow-doc.pdf')], null, 'escrow_instructions');
    expect(docs).toHaveLength(3);

    const escrowList = await escrowService.listUploadedDocuments('escrow-token');
    expect(escrowList).toHaveLength(1);
    expect(escrowList[0].fileName).toBe('escrow-doc.pdf');
    expect(escrowList[0].recipientRole).toBe('escrow_officer');

    const buyerList = await buyerService.listUploadedDocuments('buyer-token');
    expect(buyerList).toHaveLength(1);
    expect(buyerList[0].fileName).toBe('buyer-doc.pdf');

    const sellerList = await sellerService.listUploadedDocuments('seller-token');
    expect(sellerList).toHaveLength(1);
    expect(sellerList[0].fileName).toBe('seller-doc.pdf');
  });

  it('the escrow upload source is distinct from the Buyer/Seller Agent sources, and the CC (Buyer Agent) is recorded on the audit event', async () => {
    const { service, auditService } = buildService({ link: ESCROW_LINK });
    await service.uploadTransactionDocuments('escrow-token', [makeFile('instructions.pdf')], null, 'escrow_instructions');

    expect(auditService.recordUploadAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      uploadSource: 'escrow_officer_secure_upload_link',
      uploadLinkPurpose: 'escrow_officer_document_upload',
      recipientRole: 'escrow_officer',
      recipientEmail: 'erin@escrowco.com',
      ccRecipient: { role: 'buyer_agent', partyId: null, name: 'Alice Agent', email: 'alice@brokerage.com' },
    }));
  });
});

describe('ExternalDocumentUploadService — per-link document visibility matrix (uploadedByType)', () => {
  /** A document that was never uploaded through any secure link — the internal/authenticated (TC/myTC) path, represented identically to how TransactionDocumentEntity itself represents it: uploadLinkId null. */
  function makeInternalDoc(overrides: Partial<DocRow> = {}): DocRow {
    return {
      id: `internal-${Math.random().toString(36).slice(2)}`,
      transactionId: 'tx-1',
      uploadLinkId: null,
      fileName: 'internal.pdf',
      storageKey: 'transactions/tx-1/internal/internal.pdf',
      formCode: null,
      analysisStatus: 'completed',
      fileSizeBytes: 1024,
      idempotencyKey: null,
      documentType: 'external_upload',
      createdAt: new Date(),
      ...overrides,
    };
  }

  it('a Buyer Agent link sees Buyer Agent uploads AND internal (TC/myTC) uploads', async () => {
    const { docs, storeUploadedFile, documentsService } = makeUploadedDocsFake();
    docs.push(makeInternalDoc({ id: 'internal-1', fileName: 'tc-uploaded.pdf' }));
    const { service } = buildService({ link: LINK, storeUploadedFileImpl: storeUploadedFile, documentsServiceImpl: documentsService });

    await service.uploadTransactionDocuments('buyer-token', [makeFile('buyer-doc.pdf')]);
    const list = await service.listUploadedDocuments('buyer-token');

    expect(list.map((d) => d.fileName).sort()).toEqual(['buyer-doc.pdf', 'tc-uploaded.pdf']);
    expect(list.find((d) => d.fileName === 'tc-uploaded.pdf')?.uploadedByType).toBe('INTERNAL');
    expect(list.find((d) => d.fileName === 'tc-uploaded.pdf')?.recipientRole).toBe('internal');
    expect(list.find((d) => d.fileName === 'buyer-doc.pdf')?.uploadedByType).toBe('BUYER_AGENT');
  });

  it('a Seller Agent link never sees internal (TC/myTC) uploads, unlike Buyer Agent', async () => {
    const { docs, documentsService } = makeUploadedDocsFake();
    docs.push(makeInternalDoc({ id: 'internal-1', fileName: 'tc-uploaded.pdf' }));
    const { service } = buildService({ link: SELLER_AGENT_LINK, documentsServiceImpl: documentsService });

    const list = await service.listUploadedDocuments('seller-token');
    expect(list).toHaveLength(0);
  });

  it('an Escrow link sees the transaction\'s current RPA even when it was uploaded via the Buyer Agent link, not the Escrow link itself', async () => {
    const { docs, documentsService } = makeUploadedDocsFake();
    docs.push(makeInternalDoc({
      id: 'rpa-1', fileName: 'rpa-signed.pdf', formCode: 'RPA', uploadLinkId: LINK.id, analysisStatus: 'completed',
    }));
    const { service } = buildService({ link: ESCROW_LINK, documentsServiceImpl: documentsService });

    const list = await service.listUploadedDocuments('escrow-token');
    expect(list).toHaveLength(1);
    expect(list[0].fileName).toBe('rpa-signed.pdf');
    expect(list[0].formType).toBe('RPA');
    expect(list[0].uploadedByType).toBe('BUYER_AGENT'); // the RPA's own true origin is preserved even though Escrow can see it
  });

  it('an Escrow link never duplicates the RPA when it also uploaded a (superseded) copy itself — only the current active version appears once', async () => {
    const { docs, documentsService } = makeUploadedDocsFake();
    docs.push(makeInternalDoc({
      id: 'rpa-unsigned', fileName: 'rpa-unsigned.pdf', formCode: 'RPA', uploadLinkId: LINK.id, analysisStatus: 'completed', status: 'superseded',
    }));
    docs.push(makeInternalDoc({
      id: 'rpa-signed', fileName: 'rpa-signed.pdf', formCode: 'RPA', uploadLinkId: ESCROW_LINK.id, analysisStatus: 'completed',
    }));
    const { service } = buildService({ link: ESCROW_LINK, documentsServiceImpl: documentsService });

    const list = await service.listUploadedDocuments('escrow-token');
    const rpaEntries = list.filter((d) => d.formType === 'RPA');
    expect(rpaEntries).toHaveLength(1);
    expect(rpaEntries[0].fileName).toBe('rpa-signed.pdf');
    expect(rpaEntries[0].uploadedByType).toBe('ESCROW');
  });

  it('an Escrow link still never sees a non-RPA Buyer Agent or Seller Agent document', async () => {
    const { docs, documentsService } = makeUploadedDocsFake();
    docs.push(makeInternalDoc({ id: 'tds-1', fileName: 'tds.pdf', formCode: 'TDS', uploadLinkId: LINK.id, analysisStatus: 'completed' }));
    docs.push(makeInternalDoc({ id: 'sco-1', fileName: 'sco.pdf', formCode: 'SCO', uploadLinkId: SELLER_AGENT_LINK.id, analysisStatus: 'completed' }));
    const { service } = buildService({ link: ESCROW_LINK, documentsServiceImpl: documentsService });

    const list = await service.listUploadedDocuments('escrow-token');
    expect(list).toHaveLength(0);
  });

  it('matches the expected visibility matrix exactly: internal→Buyer only, Buyer Agent upload→Buyer only, Seller Agent upload→Seller only, Escrow upload (non-RPA)→Escrow only', async () => {
    for (const linkType of ['BUYER_AGENT', 'SELLER_AGENT', 'ESCROW'] as const) {
      expect(canExternalUserSeeDocument({ uploadedByType: 'INTERNAL', formCode: 'TDS', documentType: 'general', status: 'approved' }, linkType)).toBe(linkType === 'BUYER_AGENT');
      expect(canExternalUserSeeDocument({ uploadedByType: 'BUYER_AGENT', formCode: 'TDS', documentType: 'general', status: 'approved' }, linkType)).toBe(linkType === 'BUYER_AGENT');
      expect(canExternalUserSeeDocument({ uploadedByType: 'SELLER_AGENT', formCode: 'TDS', documentType: 'general', status: 'approved' }, linkType)).toBe(linkType === 'SELLER_AGENT');
      expect(canExternalUserSeeDocument({ uploadedByType: 'ESCROW', formCode: 'TDS', documentType: 'general', status: 'approved' }, linkType)).toBe(linkType === 'ESCROW');
    }
  });
});

describe('ExternalDocumentUploadService — Seller Agent document validation gate', () => {
  it('a non-compliant Seller Agent PDF is NOT saved — storage is never called, and the failure reasons come from the compliance blockers', async () => {
    const { service, storageService, auditService } = buildService({
      link: SELLER_AGENT_LINK,
      pipelineProcessImpl: async () => ({
        detectedFormCode: 'RPA', detectedFormName: 'Purchase Agreement', extraction: {},
        compliance: nonCompliantResult(['Missing buyer signature on page 3.', 'Missing initials — Section 14.']),
      }),
    });

    const [result] = await service.uploadTransactionDocuments('seller-token', [makeFile('unsigned.pdf')]);

    expect(result.status).toBe('failed');
    expect(result.validationFailures).toEqual(['Missing buyer signature on page 3.', 'Missing initials — Section 14.']);
    expect(storageService.storeUploadedFile).not.toHaveBeenCalled();
    expect(auditService.recordValidationFailureAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      transactionId: 'tx-1',
      originalFileName: 'unsigned.pdf',
      uploadLinkId: 'link-2',
      recipientName: 'Sam Seller Agent',
      recipientEmail: 'sam@listingco.com',
      reasons: ['Missing buyer signature on page 3.', 'Missing initials — Section 14.'],
    }));
  });

  it('a compliant Seller Agent PDF is saved normally, with the synchronous pipeline result attached — no rejection email is sent', async () => {
    const { service, storageService, uploadLinkEmailService } = buildService({
      link: SELLER_AGENT_LINK,
      pipelineProcessImpl: async () => ({ detectedFormCode: 'TDS', detectedFormName: 'Transfer Disclosure Statement', extraction: {}, compliance: COMPLIANT_RESULT }),
    });

    const [result] = await service.uploadTransactionDocuments('seller-token', [makeFile('signed.pdf')]);

    expect(result.status).toBe('success');
    expect(result.validationFailures).toBeUndefined();
    expect(storageService.storeUploadedFile).toHaveBeenCalledTimes(1);
    expect(uploadLinkEmailService.sendSellerAgentRejectionEmail).not.toHaveBeenCalled();
  });

  it('a Seller Agent PDF with only warnings (needs_review, no blockers) is still saved — warnings are not required checks', async () => {
    const { service, storageService } = buildService({
      link: SELLER_AGENT_LINK,
      pipelineProcessImpl: async () => ({ detectedFormCode: 'TDS', detectedFormName: 'Transfer Disclosure Statement', extraction: {}, compliance: NEEDS_REVIEW_RESULT }),
    });

    const [result] = await service.uploadTransactionDocuments('seller-token', [makeFile('minor-issue.pdf')]);

    expect(result.status).toBe('success');
    expect(storageService.storeUploadedFile).toHaveBeenCalledTimes(1);
  });

  it('a non-PDF file on the Seller Agent link bypasses the validation gate entirely — the pipeline never runs and the file is saved as-is', async () => {
    const { service, storageService, pipelineService } = buildService({ link: SELLER_AGENT_LINK });

    const [result] = await service.uploadTransactionDocuments('seller-token', [makeFile('photo.jpg', { mimetype: 'image/jpeg' })]);

    expect(result.status).toBe('success');
    expect(pipelineService.process).not.toHaveBeenCalled();
    expect(storageService.storeUploadedFile).toHaveBeenCalledTimes(1);
  });

  it('the Buyer Agent link now enforces its own equivalent gate too — a non-compliant PDF is rejected (see the dedicated Buyer Agent describe block below for full coverage)', async () => {
    const { service, storageService } = buildService({
      link: LINK,
      pipelineProcessImpl: async () => ({ detectedFormCode: 'RPA', detectedFormName: 'Purchase Agreement', extraction: {}, compliance: nonCompliantResult(['Missing signature.']) }),
    });

    const [result] = await service.uploadTransactionDocuments('buyer-token', [makeFile('unsigned.pdf')]);

    expect(result.status).toBe('failed');
    expect(storageService.storeUploadedFile).not.toHaveBeenCalled();
  });

  it('an untagged, non-compliant Escrow Officer PDF is also rejected — Escrow now enforces the same gate for general (non-dedicated-category) uploads', async () => {
    const { service, storageService } = buildService({
      link: ESCROW_LINK,
      pipelineProcessImpl: async () => ({ detectedFormCode: 'RPA', detectedFormName: 'Purchase Agreement', extraction: {}, compliance: nonCompliantResult(['Missing signature.']) }),
    });

    const [result] = await service.uploadTransactionDocuments('escrow-token', [makeFile('unsigned.pdf')]);

    expect(result.status).toBe('failed');
    expect(storageService.storeUploadedFile).not.toHaveBeenCalled();
  });

  it('an Escrow Officer upload tagged with one of Escrow\'s own dedicated document types stays exempt from the gate, even if non-compliant', async () => {
    const { service, storageService } = buildService({
      link: ESCROW_LINK,
      pipelineProcessImpl: async () => ({ detectedFormCode: 'RPA', detectedFormName: 'Purchase Agreement', extraction: {}, compliance: nonCompliantResult(['Missing signature.']) }),
    });

    const [result] = await service.uploadTransactionDocuments('escrow-token', [makeFile('unsigned.pdf')], null, 'escrow_instructions');

    expect(result.status).toBe('success');
    expect(storageService.storeUploadedFile).toHaveBeenCalledTimes(1);
  });

  it('one rejected file among several does not block the others in the same batch — each is evaluated independently', async () => {
    let call = 0;
    const { service } = buildService({
      link: SELLER_AGENT_LINK,
      pipelineProcessImpl: async () => {
        call += 1;
        return call === 1
          ? { detectedFormCode: 'RPA', detectedFormName: 'Purchase Agreement', extraction: {}, compliance: nonCompliantResult(['Missing signature.']) }
          : { detectedFormCode: 'TDS', detectedFormName: 'Transfer Disclosure Statement', extraction: {}, compliance: COMPLIANT_RESULT };
      },
    });

    const results = await service.uploadTransactionDocuments('seller-token', [makeFile('bad.pdf'), makeFile('good.pdf')]);

    expect(results.find((r) => r.fileName === 'bad.pdf')?.status).toBe('failed');
    expect(results.find((r) => r.fileName === 'good.pdf')?.status).toBe('success');
  });
});

describe('ExternalDocumentUploadService — Seller Agent rejection reply email', () => {
  it('sends one consolidated rejection email, CC-ing the Seller TC, and records the audit event, when at least one document is rejected', async () => {
    const { service, uploadLinkEmailService, auditService } = buildService({
      link: SELLER_AGENT_LINK,
      pipelineProcessImpl: async () => ({ detectedFormCode: 'RPA', detectedFormName: 'Purchase Agreement', extraction: {}, compliance: nonCompliantResult(['Missing signature.']) }),
    });

    await service.uploadTransactionDocuments('seller-token', [makeFile('unsigned.pdf')], 'attempt-1');

    expect(uploadLinkEmailService.sendSellerAgentRejectionEmail).toHaveBeenCalledTimes(1);
    const [linkArg, tokenArg, ctxArg, rejectedArg, idempotencyArg] = uploadLinkEmailService.sendSellerAgentRejectionEmail.mock.calls[0];
    expect(linkArg.id).toBe('link-2');
    expect(tokenArg).toBe('seller-token'); // the same token already in hand — never re-minted
    expect(ctxArg.tcName).toBe('Carla Creator'); // the myTC account that created the transaction — never link.ccName
    expect(ctxArg.transactionEmail).toBe('txn-abc123@txn.mytcapp.net'); // the transaction Mailgun address — never the TC's myTC login email
    expect(ctxArg.tcPhone).toBe('555-0200');
    expect(ctxArg.transactionId).toBe('tx-1');
    expect(ctxArg.propertyAddress).toContain('123 Main St');
    expect(rejectedArg).toEqual([{ fileName: 'unsigned.pdf', reasons: ['Missing signature.'] }]);
    expect(idempotencyArg).toBe('attempt-1');

    expect(auditService.recordRejectionEmailSentAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      transactionId: 'tx-1',
      uploadLinkId: 'link-2',
      recipientEmail: 'sam@listingco.com',
      ccEmail: 'tina@sunsetrealty.com',
      rejectedFileNames: ['unsigned.pdf'],
      providerMessageId: 'mg-rejection-1',
    }));
  });

  it('does not send a rejection email when every document in the attempt passes validation', async () => {
    const { service, uploadLinkEmailService } = buildService({
      link: SELLER_AGENT_LINK,
      pipelineProcessImpl: async () => ({ detectedFormCode: 'TDS', detectedFormName: 'Transfer Disclosure Statement', extraction: {}, compliance: COMPLIANT_RESULT }),
    });

    await service.uploadTransactionDocuments('seller-token', [makeFile('signed.pdf')], 'attempt-2');

    expect(uploadLinkEmailService.sendSellerAgentRejectionEmail).not.toHaveBeenCalled();
  });

  it('sends exactly one rejection email per upload attempt — a batch with two rejected files still gets a single, consolidated email', async () => {
    const { service, uploadLinkEmailService } = buildService({
      link: SELLER_AGENT_LINK,
      pipelineProcessImpl: async () => ({ detectedFormCode: 'RPA', detectedFormName: 'Purchase Agreement', extraction: {}, compliance: nonCompliantResult(['Missing signature.']) }),
    });

    await service.uploadTransactionDocuments('seller-token', [makeFile('bad1.pdf'), makeFile('bad2.pdf')], 'attempt-3');

    expect(uploadLinkEmailService.sendSellerAgentRejectionEmail).toHaveBeenCalledTimes(1);
    const [, , , rejectedArg] = uploadLinkEmailService.sendSellerAgentRejectionEmail.mock.calls[0];
    expect(rejectedArg).toHaveLength(2);
  });

  it('does not resend a rejection email for the same (uploadLinkId, idempotencyKey) — a retried request is deduped against existing outbound messages', async () => {
    const existingRejectionMessage = {
      transactionId: 'tx-1',
      direction: 'outbound',
      metadataJson: { type: 'seller_agent_document_rejection', uploadLinkId: 'link-2', idempotencyKey: 'attempt-4' },
    };
    const { service, uploadLinkEmailService, messagesRepo } = buildService({
      link: SELLER_AGENT_LINK,
      pipelineProcessImpl: async () => ({ detectedFormCode: 'RPA', detectedFormName: 'Purchase Agreement', extraction: {}, compliance: nonCompliantResult(['Missing signature.']) }),
    });
    messagesRepo.find.mockResolvedValue([existingRejectionMessage]);

    await service.uploadTransactionDocuments('seller-token', [makeFile('unsigned.pdf')], 'attempt-4');

    expect(uploadLinkEmailService.sendSellerAgentRejectionEmail).not.toHaveBeenCalled();
  });

  it('a different idempotency key is treated as a genuinely new attempt and does send', async () => {
    const existingRejectionMessage = {
      transactionId: 'tx-1',
      direction: 'outbound',
      metadataJson: { type: 'seller_agent_document_rejection', uploadLinkId: 'link-2', idempotencyKey: 'attempt-5' },
    };
    const { service, uploadLinkEmailService, messagesRepo } = buildService({
      link: SELLER_AGENT_LINK,
      pipelineProcessImpl: async () => ({ detectedFormCode: 'RPA', detectedFormName: 'Purchase Agreement', extraction: {}, compliance: nonCompliantResult(['Missing signature.']) }),
    });
    messagesRepo.find.mockResolvedValue([existingRejectionMessage]);

    await service.uploadTransactionDocuments('seller-token', [makeFile('unsigned.pdf')], 'attempt-6');

    expect(uploadLinkEmailService.sendSellerAgentRejectionEmail).toHaveBeenCalledTimes(1);
  });

  it('does not record the "email sent" audit event when the send itself fails', async () => {
    const { service, auditService, uploadLinkEmailService } = buildService({
      link: SELLER_AGENT_LINK,
      pipelineProcessImpl: async () => ({ detectedFormCode: 'RPA', detectedFormName: 'Purchase Agreement', extraction: {}, compliance: nonCompliantResult(['Missing signature.']) }),
    });
    uploadLinkEmailService.sendSellerAgentRejectionEmail.mockResolvedValue({ sent: false, providerMessageId: null });

    await service.uploadTransactionDocuments('seller-token', [makeFile('unsigned.pdf')], 'attempt-7');

    expect(auditService.recordRejectionEmailSentAuditEvent).not.toHaveBeenCalled();
  });
});

describe('ExternalDocumentUploadService — Seller Agent DocuSign confirmation email', () => {
  it('sends the confirmation email and stamps docusignConfirmationRequestedAt when the checklist newly becomes complete', async () => {
    const { service, uploadLinkEmailService, uploadLinkRepo, auditService, formTemplatesService } = buildService({
      link: SELLER_AGENT_LINK,
      checklistStatusImpl: async () => ({ allRequiredSubmitted: true }),
    });

    await service.uploadTransactionDocuments('seller-token', [makeFile('signed.pdf')]);

    expect(formTemplatesService.getSellerAgentChecklistStatus).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'tx-1' }), 'link-2', expect.any(Set),
    );
    expect(uploadLinkRepo.recordDocusignConfirmationRequested).toHaveBeenCalledWith('link-2');
    expect(uploadLinkEmailService.sendSellerAgentDocusignConfirmationEmail).toHaveBeenCalledTimes(1);
    const [linkArg, tokenArg, ctxArg] = uploadLinkEmailService.sendSellerAgentDocusignConfirmationEmail.mock.calls[0];
    expect(linkArg.id).toBe('link-2');
    expect(tokenArg).toBe('seller-token'); // the same token already in hand — never re-minted
    expect(ctxArg.tcName).toBe('Carla Creator');
    expect(ctxArg.transactionEmail).toBe('txn-abc123@txn.mytcapp.net');
    expect(ctxArg.transactionId).toBe('tx-1');
    expect(auditService.recordDocusignConfirmationRequestedAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      transactionId: 'tx-1',
      uploadLinkId: 'link-2',
      recipientEmail: 'sam@listingco.com',
      ccEmail: 'tina@sunsetrealty.com',
      providerMessageId: 'mg-docusign-confirm-1',
    }));
  });

  it('does not send when the checklist is not yet complete', async () => {
    const { service, uploadLinkEmailService, uploadLinkRepo } = buildService({
      link: SELLER_AGENT_LINK,
      checklistStatusImpl: async () => ({ allRequiredSubmitted: false }),
    });

    await service.uploadTransactionDocuments('seller-token', [makeFile('signed.pdf')]);

    expect(uploadLinkEmailService.sendSellerAgentDocusignConfirmationEmail).not.toHaveBeenCalled();
    expect(uploadLinkRepo.recordDocusignConfirmationRequested).not.toHaveBeenCalled();
  });

  it('does not re-send on a later upload once already requested — idempotency guarded by docusignConfirmationRequestedAt', async () => {
    const { service, uploadLinkEmailService, formTemplatesService } = buildService({
      link: SELLER_AGENT_LINK,
      checklistStatusImpl: async () => ({ allRequiredSubmitted: true }),
      linkFindByIdImpl: async () => ({ docusignConfirmationRequestedAt: new Date('2026-01-01T00:00:00Z') }),
    });

    await service.uploadTransactionDocuments('seller-token', [makeFile('extra.pdf')]);

    expect(formTemplatesService.getSellerAgentChecklistStatus).not.toHaveBeenCalled();
    expect(uploadLinkEmailService.sendSellerAgentDocusignConfirmationEmail).not.toHaveBeenCalled();
  });

  it('is a Seller Agent link feature only — a Buyer Agent link never triggers the confirmation email', async () => {
    const { service, uploadLinkEmailService, formTemplatesService } = buildService({
      link: LINK,
      checklistStatusImpl: async () => ({ allRequiredSubmitted: true }),
    });

    await service.uploadTransactionDocuments('good-token', [makeFile('a.pdf')]);

    expect(formTemplatesService.getSellerAgentChecklistStatus).not.toHaveBeenCalled();
    expect(uploadLinkEmailService.sendSellerAgentDocusignConfirmationEmail).not.toHaveBeenCalled();
  });

  it('does not record the audit event when the send itself fails', async () => {
    const { service, auditService, uploadLinkEmailService } = buildService({
      link: SELLER_AGENT_LINK,
      checklistStatusImpl: async () => ({ allRequiredSubmitted: true }),
    });
    uploadLinkEmailService.sendSellerAgentDocusignConfirmationEmail.mockResolvedValue({ sent: false, providerMessageId: null });

    await service.uploadTransactionDocuments('seller-token', [makeFile('signed.pdf')]);

    expect(auditService.recordDocusignConfirmationRequestedAuditEvent).not.toHaveBeenCalled();
  });
});

describe('ExternalDocumentUploadService — Buyer Agent RR/RRRR validation gate', () => {
  it('a non-compliant RR upload is NOT saved — storage is never called, and the failure reasons come from the compliance blockers', async () => {
    const { service, storageService, auditService } = buildService({
      link: LINK,
      pipelineProcessImpl: async () => ({
        detectedFormCode: 'RR', detectedFormName: 'Request for Repair', extraction: { header: { property_address: '123 Main St' } },
        compliance: nonCompliantResult(['Buyer has not signed the RR.']),
      }),
    });

    const [result] = await service.uploadTransactionDocuments('buyer-token', [makeFile('rr-unsigned.pdf')]);

    expect(result.status).toBe('failed');
    expect(result.validationFailures).toEqual(['Buyer has not signed the RR.']);
    expect(storageService.storeUploadedFile).not.toHaveBeenCalled();
    expect(auditService.recordBuyerAgentValidationFailureAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      transactionId: 'tx-1',
      originalFileName: 'rr-unsigned.pdf',
      uploadLinkId: 'link-1',
      recipientName: 'Alice Agent',
      recipientEmail: 'alice@brokerage.com',
      reasons: ['Buyer has not signed the RR.'],
      detectedFormCode: 'RR',
    }));
  });

  it('a non-compliant RRRR upload is also rejected — the gate applies to both form codes', async () => {
    const { service, storageService } = buildService({
      link: LINK,
      pipelineProcessImpl: async () => ({
        detectedFormCode: 'RRRR', detectedFormName: "Seller's Response to Buyer's Request for Repair", extraction: { header: { property_address: '123 Main St' } },
        compliance: nonCompliantResult(['Seller has not signed the RRRR.']),
      }),
    });

    const [result] = await service.uploadTransactionDocuments('buyer-token', [makeFile('rrrr-unsigned.pdf')]);

    expect(result.status).toBe('failed');
    expect(storageService.storeUploadedFile).not.toHaveBeenCalled();
  });

  it('a compliant RR upload is saved normally, tagged with its detected form code — no rejection email is sent', async () => {
    const { service, storageService, uploadLinkEmailService } = buildService({
      link: LINK,
      pipelineProcessImpl: async () => ({
        detectedFormCode: 'RR', detectedFormName: 'Request for Repair', extraction: { header: { property_address: '123 Main St' } },
        compliance: COMPLIANT_RESULT,
      }),
    });

    const [result] = await service.uploadTransactionDocuments('buyer-token', [makeFile('rr-signed.pdf')]);

    expect(result.status).toBe('success');
    expect(storageService.storeUploadedFile).toHaveBeenCalledWith(expect.objectContaining({ analysisStatus: 'completed' }));
    expect(uploadLinkEmailService.sendBuyerAgentRejectionEmail).not.toHaveBeenCalled();
  });

  it('a non-compliant PDF detected as a form OTHER than RR/RRRR/CR-B/VP is now also rejected — the gate covers every Buyer Agent form with a real blocker, not just the 4 legacy allowlisted codes', async () => {
    const { service, storageService, auditService } = buildService({
      link: LINK,
      pipelineProcessImpl: async () => ({
        detectedFormCode: 'TDS', detectedFormName: 'Transfer Disclosure Statement', extraction: {},
        compliance: nonCompliantResult(['Missing seller signature.']),
      }),
    });

    const [result] = await service.uploadTransactionDocuments('buyer-token', [makeFile('unrelated.pdf')]);

    expect(result.status).toBe('failed');
    expect(storageService.storeUploadedFile).not.toHaveBeenCalled();
    expect(auditService.recordBuyerAgentValidationFailureAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ detectedFormCode: 'TDS' }));
  });

  it('an unclassified (detectedFormCode: null) non-compliant PDF is also rejected — the gate is scoped by purpose, not by which form was identified', async () => {
    const { service, storageService } = buildService({
      link: LINK,
      pipelineProcessImpl: async () => ({
        detectedFormCode: null, detectedFormName: null, extraction: {},
        compliance: nonCompliantResult(['Some blocker.']),
      }),
    });

    const [result] = await service.uploadTransactionDocuments('buyer-token', [makeFile('unknown.pdf')]);

    expect(result.status).toBe('failed');
    expect(storageService.storeUploadedFile).not.toHaveBeenCalled();
  });

  it('an HOA-tagged upload is exempt from the sync gate even if it would otherwise be a non-compliant RR', async () => {
    const { service, storageService, pipelineService } = buildService({
      link: LINK,
      pipelineProcessImpl: async () => ({
        detectedFormCode: 'RR', detectedFormName: 'Request for Repair', extraction: {},
        compliance: nonCompliantResult(['Buyer has not signed the RR.']),
      }),
    });

    const [result] = await service.uploadTransactionDocuments('buyer-token', [makeFile('hoa-bylaws.pdf')], null, 'hoa_document');

    expect(result.status).toBe('success');
    expect(pipelineService.process).not.toHaveBeenCalled();
    expect(storageService.storeUploadedFile).toHaveBeenCalledTimes(1);
  });

  it('rejects an RR upload when the extracted property address does not match the transaction — even though the mocked compliance result itself is compliant', async () => {
    const { service, storageService } = buildService({
      link: LINK,
      transaction: { ...TRANSACTION, propertyAddressLine1: '123 Main St' } as never,
      pipelineProcessImpl: async () => ({
        detectedFormCode: 'RR', detectedFormName: 'Request for Repair',
        extraction: { header: { property_address: '999 Completely Different Ave' } },
        compliance: COMPLIANT_RESULT,
      }),
    });

    const [result] = await service.uploadTransactionDocuments('buyer-token', [makeFile('wrong-address.pdf')]);

    expect(result.status).toBe('failed');
    expect(result.validationFailures?.[0]).toContain('does not match');
    expect(storageService.storeUploadedFile).not.toHaveBeenCalled();
  });

  it('the Seller Agent and Escrow Officer links are unaffected by the Buyer Agent RR/RRRR gate', async () => {
    const { service: sellerService, storageService: sellerStorage } = buildService({
      link: SELLER_AGENT_LINK,
      pipelineProcessImpl: async () => ({
        detectedFormCode: 'RR', detectedFormName: 'Request for Repair', extraction: {},
        compliance: nonCompliantResult(['Buyer has not signed the RR.']),
      }),
    });
    const [sellerResult] = await sellerService.uploadTransactionDocuments('seller-token', [makeFile('rr-via-seller-link.pdf')]);
    expect(sellerResult.status).toBe('failed'); // Seller Agent's OWN unconditional gate still applies — this just confirms it's not double-handled as a Buyer Agent rejection
    expect(sellerStorage.storeUploadedFile).not.toHaveBeenCalled();

    const { service: escrowService, storageService: escrowStorage } = buildService({
      link: ESCROW_LINK,
      pipelineProcessImpl: async () => ({
        detectedFormCode: 'RR', detectedFormName: 'Request for Repair', extraction: {},
        compliance: nonCompliantResult(['Buyer has not signed the RR.']),
      }),
    });
    const [escrowResult] = await escrowService.uploadTransactionDocuments('escrow-token', [makeFile('rr-via-escrow-link.pdf')], null, 'escrow_instructions');
    expect(escrowResult.status).toBe('success'); // tagged with one of Escrow's own dedicated document types — exempt from the sync gate regardless of compliance
    // Still goes through the pre-existing async fire-and-forget analysis path (never blocking), not the new synchronous one.
    expect(escrowStorage.storeUploadedFile).toHaveBeenCalledWith(expect.objectContaining({ analysisStatus: 'analyzing' }));
  });
});

describe('ExternalDocumentUploadService — Buyer Agent RR/RRRR rejection reply email', () => {
  it('sends one consolidated rejection email and records the audit event, when at least one RR/RRRR document is rejected', async () => {
    const { service, uploadLinkEmailService, auditService } = buildService({
      link: LINK,
      pipelineProcessImpl: async () => ({ detectedFormCode: 'RR', detectedFormName: 'Request for Repair', extraction: { header: { property_address: '123 Main St' } }, compliance: nonCompliantResult(['Buyer has not signed the RR.']) }),
    });

    await service.uploadTransactionDocuments('buyer-token', [makeFile('rr-unsigned.pdf')], 'ba-attempt-1');

    expect(uploadLinkEmailService.sendBuyerAgentRejectionEmail).toHaveBeenCalledTimes(1);
    const [linkArg, tokenArg, ctxArg, rejectedArg, idempotencyArg] = uploadLinkEmailService.sendBuyerAgentRejectionEmail.mock.calls[0];
    expect(linkArg.id).toBe('link-1');
    expect(tokenArg).toBe('buyer-token'); // the same token already in hand — never re-minted
    expect(ctxArg.tcName).toBe('Carla Creator');
    expect(ctxArg.transactionEmail).toBe('txn-abc123@txn.mytcapp.net');
    expect(ctxArg.transactionId).toBe('tx-1');
    expect(ctxArg.propertyAddress).toContain('123 Main St');
    expect(rejectedArg).toEqual([{ fileName: 'rr-unsigned.pdf', reasons: ['Buyer has not signed the RR.'] }]);
    expect(idempotencyArg).toBe('ba-attempt-1');

    expect(auditService.recordBuyerAgentRejectionEmailSentAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      transactionId: 'tx-1',
      uploadLinkId: 'link-1',
      recipientEmail: 'alice@brokerage.com',
      rejectedFileNames: ['rr-unsigned.pdf'],
      providerMessageId: 'mg-buyer-rejection-1',
    }));
  });

  it('does not send a rejection email when every upload in the attempt passes validation', async () => {
    const { service, uploadLinkEmailService } = buildService({
      link: LINK,
      pipelineProcessImpl: async () => ({ detectedFormCode: 'RR', detectedFormName: 'Request for Repair', extraction: { header: { property_address: '123 Main St' } }, compliance: COMPLIANT_RESULT }),
    });

    await service.uploadTransactionDocuments('buyer-token', [makeFile('rr-signed.pdf')], 'ba-attempt-2');

    expect(uploadLinkEmailService.sendBuyerAgentRejectionEmail).not.toHaveBeenCalled();
  });

  it('does not resend a rejection email for the same (uploadLinkId, idempotencyKey) — a retried request is deduped against existing outbound messages', async () => {
    const existingRejectionMessage = {
      transactionId: 'tx-1',
      direction: 'outbound',
      metadataJson: { type: 'buyer_agent_document_rejection', uploadLinkId: 'link-1', idempotencyKey: 'ba-attempt-3' },
    };
    const { service, uploadLinkEmailService, messagesRepo } = buildService({
      link: LINK,
      pipelineProcessImpl: async () => ({ detectedFormCode: 'RR', detectedFormName: 'Request for Repair', extraction: {}, compliance: nonCompliantResult(['Buyer has not signed the RR.']) }),
    });
    messagesRepo.find.mockResolvedValue([existingRejectionMessage]);

    await service.uploadTransactionDocuments('buyer-token', [makeFile('rr-unsigned.pdf')], 'ba-attempt-3');

    expect(uploadLinkEmailService.sendBuyerAgentRejectionEmail).not.toHaveBeenCalled();
  });

  it('a Seller Agent rejection in the same test run never gets deduped against a Buyer Agent rejection message, and vice versa (distinct metadataJson.type)', async () => {
    const existingBuyerAgentRejection = {
      transactionId: 'tx-1',
      direction: 'outbound',
      metadataJson: { type: 'buyer_agent_document_rejection', uploadLinkId: 'link-2', idempotencyKey: 'shared-key' },
    };
    const { service, uploadLinkEmailService, messagesRepo } = buildService({
      link: SELLER_AGENT_LINK,
      pipelineProcessImpl: async () => ({ detectedFormCode: 'TDS', detectedFormName: 'Transfer Disclosure Statement', extraction: {}, compliance: nonCompliantResult(['Missing seller signature.']) }),
    });
    messagesRepo.find.mockResolvedValue([existingBuyerAgentRejection]);

    await service.uploadTransactionDocuments('seller-token', [makeFile('unsigned.pdf')], 'shared-key');

    expect(uploadLinkEmailService.sendSellerAgentRejectionEmail).toHaveBeenCalledTimes(1);
  });
});

describe('ExternalDocumentUploadService — Buyer Agent CR-B validation gate', () => {
  it('a non-compliant CR-B upload is NOT saved — it goes through the same gate as RR/RRRR', async () => {
    const { service, storageService, auditService } = buildService({
      link: LINK,
      pipelineProcessImpl: async () => ({
        detectedFormCode: 'CR-B', detectedFormName: 'Contingency Removal (Buyer)', extraction: { header: { property_address: '123 Main St' } },
        compliance: nonCompliantResult(['Buyer has not signed the CR-B.']),
      }),
    });

    const [result] = await service.uploadTransactionDocuments('buyer-token', [makeFile('crb-unsigned.pdf')]);

    expect(result.status).toBe('failed');
    expect(result.validationFailures).toEqual(['Buyer has not signed the CR-B.']);
    expect(storageService.storeUploadedFile).not.toHaveBeenCalled();
    expect(auditService.recordBuyerAgentValidationFailureAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ detectedFormCode: 'CR-B' }));
  });

  it('rejects a CR-B upload when the extracted property address does not match the transaction', async () => {
    const { service, storageService } = buildService({
      link: LINK,
      transaction: { ...TRANSACTION, propertyAddressLine1: '123 Main St' } as never,
      pipelineProcessImpl: async () => ({
        detectedFormCode: 'CR-B', detectedFormName: 'Contingency Removal (Buyer)',
        extraction: { header: { property_address: '999 Completely Different Ave' } },
        compliance: COMPLIANT_RESULT,
      }),
    });

    const [result] = await service.uploadTransactionDocuments('buyer-token', [makeFile('wrong-address.pdf')]);

    expect(result.status).toBe('failed');
    expect(result.validationFailures?.[0]).toContain('does not match');
    expect(storageService.storeUploadedFile).not.toHaveBeenCalled();
  });

  it('a compliant CR-B upload is saved normally, tagged with its detected form code', async () => {
    const { service, storageService } = buildService({
      link: LINK,
      pipelineProcessImpl: async () => ({
        detectedFormCode: 'CR-B', detectedFormName: 'Contingency Removal (Buyer)',
        extraction: { header: { property_address: '123 Main St' }, contingencies_removed: { inspection: true } },
        compliance: COMPLIANT_RESULT,
      }),
    });

    const [result] = await service.uploadTransactionDocuments('buyer-token', [makeFile('crb-signed.pdf')]);

    expect(result.status).toBe('success');
    expect(storageService.storeUploadedFile).toHaveBeenCalledWith(expect.objectContaining({ analysisStatus: 'completed' }));
  });

  it('cancels the pending reminder for each contingency checked on a compliant, saved CR-B', async () => {
    const { service, contingencyReminderScheduler } = buildService({
      link: LINK,
      pipelineProcessImpl: async () => ({
        detectedFormCode: 'CR-B', detectedFormName: 'Contingency Removal (Buyer)',
        extraction: { header: { property_address: '123 Main St' }, contingencies_removed: { inspection: true, loan: true, appraisal: false } },
        compliance: COMPLIANT_RESULT,
      }),
    });

    await service.uploadTransactionDocuments('buyer-token', [makeFile('crb-signed.pdf')]);

    expect(contingencyReminderScheduler.cancelForSatisfiedContingencies).toHaveBeenCalledWith('tx-1', expect.arrayContaining(['inspection', 'loan']));
    const [, typesArg] = contingencyReminderScheduler.cancelForSatisfiedContingencies.mock.calls[0];
    expect(typesArg).not.toContain('appraisal');
  });

  it('cancels the reminder for every contingency type when "all_contingencies" is checked', async () => {
    const { service, contingencyReminderScheduler } = buildService({
      link: LINK,
      pipelineProcessImpl: async () => ({
        detectedFormCode: 'CR-B', detectedFormName: 'Contingency Removal (Buyer)',
        extraction: { header: { property_address: '123 Main St' }, contingencies_removed: { all_contingencies: true } },
        compliance: COMPLIANT_RESULT,
      }),
    });

    await service.uploadTransactionDocuments('buyer-token', [makeFile('crb-signed.pdf')]);

    const [, typesArg] = contingencyReminderScheduler.cancelForSatisfiedContingencies.mock.calls[0];
    expect(typesArg.sort()).toEqual(['appraisal', 'inspection', 'loan']);
  });

  it('does not call cancelForSatisfiedContingencies when no contingency box is checked', async () => {
    const { service, contingencyReminderScheduler } = buildService({
      link: LINK,
      pipelineProcessImpl: async () => ({
        detectedFormCode: 'CR-B', detectedFormName: 'Contingency Removal (Buyer)',
        extraction: { header: { property_address: '123 Main St' }, contingencies_removed: { inspection: false, loan: false, appraisal: false } },
        compliance: COMPLIANT_RESULT,
      }),
    });

    await service.uploadTransactionDocuments('buyer-token', [makeFile('crb-signed.pdf')]);

    expect(contingencyReminderScheduler.cancelForSatisfiedContingencies).not.toHaveBeenCalled();
  });

  it('does not call cancelForSatisfiedContingencies for a compliant RR upload — only CR-B triggers it', async () => {
    const { service, contingencyReminderScheduler } = buildService({
      link: LINK,
      pipelineProcessImpl: async () => ({
        detectedFormCode: 'RR', detectedFormName: 'Request for Repair',
        extraction: { header: { property_address: '123 Main St' } },
        compliance: COMPLIANT_RESULT,
      }),
    });

    await service.uploadTransactionDocuments('buyer-token', [makeFile('rr-signed.pdf')]);

    expect(contingencyReminderScheduler.cancelForSatisfiedContingencies).not.toHaveBeenCalled();
  });

  it('cancels the pending VP reminder on a compliant, saved Verification of Property upload', async () => {
    const { service, vpReminderScheduler } = buildService({
      link: LINK,
      pipelineProcessImpl: async () => ({
        detectedFormCode: 'VP', detectedFormName: 'Verification of Property',
        extraction: { header: { property_address: '123 Main St' } },
        compliance: COMPLIANT_RESULT,
      }),
    });

    await service.uploadTransactionDocuments('buyer-token', [makeFile('vp-signed.pdf')]);

    expect(vpReminderScheduler.cancelIfSatisfied).toHaveBeenCalledWith('tx-1');
  });

  it('does not call vpReminderScheduler.cancelIfSatisfied for a compliant CR-B upload — only VP triggers it', async () => {
    const { service, vpReminderScheduler } = buildService({
      link: LINK,
      pipelineProcessImpl: async () => ({
        detectedFormCode: 'CR-B', detectedFormName: 'Contingency Removal (Buyer)',
        extraction: { header: { property_address: '123 Main St' }, contingencies_removed: { inspection: true } },
        compliance: COMPLIANT_RESULT,
      }),
    });

    await service.uploadTransactionDocuments('buyer-token', [makeFile('crb-signed.pdf')]);

    expect(vpReminderScheduler.cancelIfSatisfied).not.toHaveBeenCalled();
  });

  it('cancels the pending seller-side reminder for the detected form code on a compliant Seller Agent upload', async () => {
    const { service, sellerSideReminderScheduler } = buildService({
      link: SELLER_AGENT_LINK,
      pipelineProcessImpl: async () => ({
        detectedFormCode: 'TDS', detectedFormName: 'Transfer Disclosure Statement',
        extraction: { header: { property_address: '123 Main St' } },
        compliance: COMPLIANT_RESULT,
      }),
    });

    await service.uploadTransactionDocuments('seller-token', [makeFile('tds-signed.pdf')]);

    expect(sellerSideReminderScheduler.cancelIfSatisfied).toHaveBeenCalledWith('tx-1', 'TDS');
  });

  it('does not call sellerSideReminderScheduler.cancelIfSatisfied for a compliant Buyer Agent VP upload — only Seller Agent uploads trigger it', async () => {
    const { service, sellerSideReminderScheduler } = buildService({
      link: LINK,
      pipelineProcessImpl: async () => ({
        detectedFormCode: 'VP', detectedFormName: 'Verification of Property',
        extraction: { header: { property_address: '123 Main St' } },
        compliance: COMPLIANT_RESULT,
      }),
    });

    await service.uploadTransactionDocuments('buyer-token', [makeFile('vp-signed.pdf')]);

    expect(sellerSideReminderScheduler.cancelIfSatisfied).not.toHaveBeenCalled();
  });

  it('the Seller Agent link is unaffected by the Buyer Agent CR-B gate/cancellation — its own unconditional gate still applies', async () => {
    const { service, storageService, contingencyReminderScheduler } = buildService({
      link: SELLER_AGENT_LINK,
      pipelineProcessImpl: async () => ({
        detectedFormCode: 'CR-B', detectedFormName: 'Contingency Removal (Buyer)', extraction: {},
        compliance: nonCompliantResult(['Buyer has not signed the CR-B.']),
      }),
    });

    const [result] = await service.uploadTransactionDocuments('seller-token', [makeFile('crb-via-seller-link.pdf')]);

    expect(result.status).toBe('failed');
    expect(storageService.storeUploadedFile).not.toHaveBeenCalled();
    expect(contingencyReminderScheduler.cancelForSatisfiedContingencies).not.toHaveBeenCalled();
  });
});

describe('ExternalDocumentUploadService — Buyer Agent VP validation gate', () => {
  it('a non-compliant VP upload is NOT saved — it goes through the same gate as RR/RRRR/CR-B', async () => {
    const { service, storageService, auditService } = buildService({
      link: LINK,
      pipelineProcessImpl: async () => ({
        detectedFormCode: 'VP', detectedFormName: 'Verification of Property Condition', extraction: { header: { property_address: '123 Main St' } },
        compliance: nonCompliantResult(['Buyer has not signed the VP.']),
      }),
    });

    const [result] = await service.uploadTransactionDocuments('buyer-token', [makeFile('vp-unsigned.pdf')]);

    expect(result.status).toBe('failed');
    expect(result.validationFailures).toEqual(['Buyer has not signed the VP.']);
    expect(storageService.storeUploadedFile).not.toHaveBeenCalled();
    expect(auditService.recordBuyerAgentValidationFailureAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ detectedFormCode: 'VP' }));
  });

  it('rejects a VP upload when the extracted property address does not match the transaction', async () => {
    const { service, storageService } = buildService({
      link: LINK,
      transaction: { ...TRANSACTION, propertyAddressLine1: '123 Main St' } as never,
      pipelineProcessImpl: async () => ({
        detectedFormCode: 'VP', detectedFormName: 'Verification of Property Condition',
        extraction: { header: { property_address: '999 Completely Different Ave' } },
        compliance: COMPLIANT_RESULT,
      }),
    });

    const [result] = await service.uploadTransactionDocuments('buyer-token', [makeFile('wrong-address.pdf')]);

    expect(result.status).toBe('failed');
    expect(result.validationFailures?.[0]).toContain('does not match');
    expect(storageService.storeUploadedFile).not.toHaveBeenCalled();
  });

  it('a compliant VP upload is saved normally, tagged with its detected form code', async () => {
    const { service, storageService } = buildService({
      link: LINK,
      pipelineProcessImpl: async () => ({
        detectedFormCode: 'VP', detectedFormName: 'Verification of Property Condition',
        extraction: { header: { property_address: '123 Main St' }, property_verified: true },
        compliance: COMPLIANT_RESULT,
      }),
    });

    const [result] = await service.uploadTransactionDocuments('buyer-token', [makeFile('vp-signed.pdf')]);

    expect(result.status).toBe('success');
    expect(storageService.storeUploadedFile).toHaveBeenCalledWith(expect.objectContaining({ analysisStatus: 'completed' }));
  });

  it('does not call cancelForSatisfiedContingencies for a compliant VP upload — that side effect is CR-B-only', async () => {
    const { service, contingencyReminderScheduler } = buildService({
      link: LINK,
      pipelineProcessImpl: async () => ({
        detectedFormCode: 'VP', detectedFormName: 'Verification of Property Condition',
        extraction: { header: { property_address: '123 Main St' }, property_verified: true },
        compliance: COMPLIANT_RESULT,
      }),
    });

    await service.uploadTransactionDocuments('buyer-token', [makeFile('vp-signed.pdf')]);

    expect(contingencyReminderScheduler.cancelForSatisfiedContingencies).not.toHaveBeenCalled();
  });

  it('the Seller Agent and Escrow Officer links are unaffected by the Buyer Agent VP gate', async () => {
    const { service: sellerService, storageService: sellerStorage } = buildService({
      link: SELLER_AGENT_LINK,
      pipelineProcessImpl: async () => ({
        detectedFormCode: 'VP', detectedFormName: 'Verification of Property Condition', extraction: {},
        compliance: nonCompliantResult(['Buyer has not signed the VP.']),
      }),
    });
    const [sellerResult] = await sellerService.uploadTransactionDocuments('seller-token', [makeFile('vp-via-seller-link.pdf')]);
    expect(sellerResult.status).toBe('failed'); // Seller Agent's OWN unconditional gate still applies
    expect(sellerStorage.storeUploadedFile).not.toHaveBeenCalled();

    const { service: escrowService, storageService: escrowStorage } = buildService({
      link: ESCROW_LINK,
      pipelineProcessImpl: async () => ({
        detectedFormCode: 'VP', detectedFormName: 'Verification of Property Condition', extraction: {},
        compliance: nonCompliantResult(['Buyer has not signed the VP.']),
      }),
    });
    const [escrowResult] = await escrowService.uploadTransactionDocuments('escrow-token', [makeFile('vp-via-escrow-link.pdf')], null, 'escrow_instructions');
    expect(escrowResult.status).toBe('success'); // tagged with one of Escrow's own dedicated document types — exempt from the sync gate regardless of compliance
    expect(escrowStorage.storeUploadedFile).toHaveBeenCalledWith(expect.objectContaining({ analysisStatus: 'analyzing' }));
  });

  it('a non-compliant PDF that is NOT detected as VP is rejected too — the Buyer Agent gate covers every form, not just the legacy allowlisted codes', async () => {
    const { service, storageService } = buildService({
      link: LINK,
      pipelineProcessImpl: async () => ({
        detectedFormCode: 'TDS', detectedFormName: 'Transfer Disclosure Statement', extraction: {},
        compliance: nonCompliantResult(['Missing seller signature.']),
      }),
    });

    const [result] = await service.uploadTransactionDocuments('buyer-token', [makeFile('unrelated.pdf')]);

    expect(result.status).toBe('failed');
    expect(storageService.storeUploadedFile).not.toHaveBeenCalled();
  });
});

describe('ExternalDocumentUploadService — Buyer Agent VP rejection reply email', () => {
  it('sends the rejection email (reusing the same generic Buyer Agent rejection path) and records the audit event', async () => {
    const { service, uploadLinkEmailService, auditService } = buildService({
      link: LINK,
      pipelineProcessImpl: async () => ({
        detectedFormCode: 'VP', detectedFormName: 'Verification of Property Condition', extraction: { header: { property_address: '123 Main St' } },
        compliance: nonCompliantResult(['Buyer has not signed the VP.']),
      }),
    });

    await service.uploadTransactionDocuments('buyer-token', [makeFile('vp-unsigned.pdf')], 'vp-attempt-1');

    expect(uploadLinkEmailService.sendBuyerAgentRejectionEmail).toHaveBeenCalledTimes(1);
    const [, , , rejectedArg, idempotencyArg] = uploadLinkEmailService.sendBuyerAgentRejectionEmail.mock.calls[0];
    expect(rejectedArg).toEqual([{ fileName: 'vp-unsigned.pdf', reasons: ['Buyer has not signed the VP.'] }]);
    expect(idempotencyArg).toBe('vp-attempt-1');

    expect(auditService.recordBuyerAgentRejectionEmailSentAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      transactionId: 'tx-1',
      uploadLinkId: 'link-1',
      rejectedFileNames: ['vp-unsigned.pdf'],
    }));
  });

  it('does not resend a rejection email for the same (uploadLinkId, idempotencyKey) — dedup applies identically for VP', async () => {
    const existingRejectionMessage = {
      transactionId: 'tx-1',
      direction: 'outbound',
      metadataJson: { type: 'buyer_agent_document_rejection', uploadLinkId: 'link-1', idempotencyKey: 'vp-attempt-2' },
    };
    const { service, uploadLinkEmailService, messagesRepo } = buildService({
      link: LINK,
      pipelineProcessImpl: async () => ({
        detectedFormCode: 'VP', detectedFormName: 'Verification of Property Condition', extraction: {},
        compliance: nonCompliantResult(['Buyer has not signed the VP.']),
      }),
    });
    messagesRepo.find.mockResolvedValue([existingRejectionMessage]);

    await service.uploadTransactionDocuments('buyer-token', [makeFile('vp-unsigned.pdf')], 'vp-attempt-2');

    expect(uploadLinkEmailService.sendBuyerAgentRejectionEmail).not.toHaveBeenCalled();
  });
});

describe('ExternalDocumentUploadService — Escrow Officer validation gate + rejection reply email', () => {
  it('a non-compliant, untagged Escrow PDF is NOT saved — storage is never called, blocker location is prefixed onto the reason, and the audit event records the detected form code', async () => {
    const { service, storageService, auditService } = buildService({
      link: ESCROW_LINK,
      pipelineProcessImpl: async () => ({
        detectedFormCode: 'RPA', detectedFormName: 'Residential Purchase Agreement', extraction: {},
        compliance: {
          summary: { overallStatus: 'non_compliant', passCount: 0, failCount: 1, warningCount: 0, skippedCount: 0 },
          checks: [],
          blockers: [{ code: 'BLOCKER-1', compositeId: 'BLOCKER-RPA-1', message: 'Buyer initials are missing.', location: 'Page 6', formCode: 'RPA', type: 'blocker' as const }],
        },
      }),
    });

    const [result] = await service.uploadTransactionDocuments('escrow-token', [makeFile('rpa-unsigned.pdf')]);

    expect(result.status).toBe('failed');
    expect(result.validationFailures).toEqual(['Page 6 — Buyer initials are missing.']);
    expect(result.formCode).toBe('RPA');
    expect(storageService.storeUploadedFile).not.toHaveBeenCalled();
    expect(auditService.recordEscrowValidationFailureAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      transactionId: 'tx-1',
      originalFileName: 'rpa-unsigned.pdf',
      uploadLinkId: 'link-4',
      recipientName: 'Erin Escrow',
      recipientEmail: 'erin@escrowco.com',
      reasons: ['Page 6 — Buyer initials are missing.'],
      detectedFormCode: 'RPA',
    }));
  });

  it('a compliant, untagged Escrow PDF is saved normally — no rejection email is sent', async () => {
    const { service, storageService, uploadLinkEmailService } = buildService({
      link: ESCROW_LINK,
      pipelineProcessImpl: async () => ({ detectedFormCode: 'RPA', detectedFormName: 'Residential Purchase Agreement', extraction: {}, compliance: COMPLIANT_RESULT }),
    });

    const [result] = await service.uploadTransactionDocuments('escrow-token', [makeFile('rpa-signed.pdf')]);

    expect(result.status).toBe('success');
    expect(storageService.storeUploadedFile).toHaveBeenCalledTimes(1);
    expect(uploadLinkEmailService.sendEscrowRejectionEmail).not.toHaveBeenCalled();
  });

  it('an unidentified Escrow PDF (no configured validator, no form code) is never rejected — resolves compliant with zero blockers', async () => {
    const { service, storageService } = buildService({
      link: ESCROW_LINK,
      pipelineProcessImpl: async () => ({ detectedFormCode: null, detectedFormName: null, extraction: {}, compliance: COMPLIANT_RESULT }),
    });

    const [result] = await service.uploadTransactionDocuments('escrow-token', [makeFile('unidentified.pdf')]);

    expect(result.status).toBe('success');
    expect(storageService.storeUploadedFile).toHaveBeenCalledTimes(1);
  });

  it('sends one consolidated rejection email replying on the Escrow link\'s own email thread, and records the audit event, when at least one document is rejected', async () => {
    const { service, uploadLinkEmailService, auditService } = buildService({
      link: ESCROW_LINK,
      pipelineProcessImpl: async () => ({
        detectedFormCode: 'RPA', detectedFormName: 'Residential Purchase Agreement', extraction: {},
        compliance: nonCompliantResult(['Missing escrow holder signature.']),
      }),
    });

    await service.uploadTransactionDocuments('escrow-token', [makeFile('rpa-unsigned.pdf')], 'escrow-attempt-1');

    expect(uploadLinkEmailService.sendEscrowRejectionEmail).toHaveBeenCalledTimes(1);
    const [linkArg, tokenArg, ctxArg, rejectedArg, idempotencyArg] = uploadLinkEmailService.sendEscrowRejectionEmail.mock.calls[0];
    expect(linkArg.id).toBe('link-4');
    expect(linkArg.emailMessageId).toBe('mg-escrow-1'); // the same thread the welcome email was sent on — never a new thread
    expect(tokenArg).toBe('escrow-token');
    expect(ctxArg.tcName).toBe('Carla Creator');
    expect(rejectedArg).toEqual([{ fileName: 'rpa-unsigned.pdf', reasons: ['Missing escrow holder signature.'] }]);
    expect(idempotencyArg).toBe('escrow-attempt-1');

    expect(auditService.recordEscrowRejectionEmailSentAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      transactionId: 'tx-1',
      uploadLinkId: 'link-4',
      recipientEmail: 'erin@escrowco.com',
      rejectedFileNames: ['rpa-unsigned.pdf'],
      providerMessageId: 'mg-escrow-rejection-1',
    }));
  });

  it('does not resend an Escrow rejection email for the same (uploadLinkId, idempotencyKey) — a retried request is deduped against existing outbound messages', async () => {
    const existingRejectionMessage = {
      transactionId: 'tx-1',
      direction: 'outbound',
      metadataJson: { type: 'escrow_document_rejection', uploadLinkId: 'link-4', idempotencyKey: 'escrow-attempt-2' },
    };
    const { service, uploadLinkEmailService, messagesRepo } = buildService({
      link: ESCROW_LINK,
      pipelineProcessImpl: async () => ({
        detectedFormCode: 'RPA', detectedFormName: 'Residential Purchase Agreement', extraction: {},
        compliance: nonCompliantResult(['Missing escrow holder signature.']),
      }),
    });
    messagesRepo.find.mockResolvedValue([existingRejectionMessage]);

    await service.uploadTransactionDocuments('escrow-token', [makeFile('rpa-unsigned.pdf')], 'escrow-attempt-2');

    expect(uploadLinkEmailService.sendEscrowRejectionEmail).not.toHaveBeenCalled();
  });
});

describe('ExternalDocumentUploadService — combined-PDF splitting into per-form documents', () => {
  function makeFormParts() {
    return [
      { formCode: 'RPA', formName: 'Residential Purchase Agreement', pageIndices: [0, 1], extraction: { header: {} }, compliance: COMPLIANT_RESULT },
      { formCode: 'AVID', formName: "Agent's Visual Inspection Disclosure", pageIndices: [2], extraction: { header: {} }, compliance: COMPLIANT_RESULT },
    ];
  }

  function makeSplitMap() {
    return new Map([
      ['RPA', { buffer: Buffer.from('rpa-bytes'), pageStart: 1, pageEnd: 2 }],
      ['AVID', { buffer: Buffer.from('avid-bytes'), pageStart: 3, pageEnd: 3 }],
    ]);
  }

  it('a combined PDF with 2 detected forms creates 1 original + 2 split rows, all sharing the same uploadLinkId', async () => {
    const { docs, storeUploadedFile, documentsService } = makeUploadedDocsFake();
    const { service } = buildService({
      storeUploadedFileImpl: storeUploadedFile,
      documentsServiceImpl: documentsService,
      pipelineProcessImpl: async () => ({
        detectedFormCode: 'RPA', detectedFormName: 'Residential Purchase Agreement', extraction: { header: {} },
        compliance: COMPLIANT_RESULT, formParts: makeFormParts(),
      }),
      formSplitterImpl: async () => makeSplitMap(),
    });

    await service.uploadTransactionDocuments('buyer-token', [makeFile('combined.pdf')]);

    expect(docs).toHaveLength(3);
    expect(docs.every((d) => d.uploadLinkId === 'link-1')).toBe(true);
  });

  it('the original row becomes isOriginalPackage:true with formCode cleared, so it can never itself satisfy a checklist item', async () => {
    const { docs, storeUploadedFile, documentsService } = makeUploadedDocsFake();
    const { service } = buildService({
      storeUploadedFileImpl: storeUploadedFile,
      documentsServiceImpl: documentsService,
      pipelineProcessImpl: async () => ({
        detectedFormCode: 'RPA', detectedFormName: 'Residential Purchase Agreement', extraction: { header: {} },
        compliance: COMPLIANT_RESULT, formParts: makeFormParts(),
      }),
      formSplitterImpl: async () => makeSplitMap(),
    });

    await service.uploadTransactionDocuments('buyer-token', [makeFile('combined.pdf')]);

    const original = docs.find((d) => d.id === 'doc-1')!;
    expect(original.isOriginalPackage).toBe(true);
    expect(original.formCode).toBeNull();
  });

  it('each split row carries provenance back to the original and its own per-form formCode', async () => {
    const { docs, storeUploadedFile, documentsService } = makeUploadedDocsFake();
    const { service } = buildService({
      storeUploadedFileImpl: storeUploadedFile,
      documentsServiceImpl: documentsService,
      pipelineProcessImpl: async () => ({
        detectedFormCode: 'RPA', detectedFormName: 'Residential Purchase Agreement', extraction: { header: {} },
        compliance: COMPLIANT_RESULT, formParts: makeFormParts(),
      }),
      formSplitterImpl: async () => makeSplitMap(),
    });

    await service.uploadTransactionDocuments('buyer-token', [makeFile('combined.pdf')]);

    const rpaSplit = docs.find((d) => d.formCode === 'RPA')!;
    const avidSplit = docs.find((d) => d.formCode === 'AVID')!;
    expect(rpaSplit.sourceDocumentId).toBe('doc-1');
    expect(rpaSplit.sourcePageStart).toBe(1);
    expect(rpaSplit.sourcePageEnd).toBe(2);
    expect(avidSplit.sourceDocumentId).toBe('doc-1');
    expect(avidSplit.sourcePageStart).toBe(3);
    expect(avidSplit.sourcePageEnd).toBe(3);
    expect(rpaSplit.analysisStatus).toBe('completed');
    expect(avidSplit.analysisStatus).toBe('completed');
  });

  it('each split row inherits its own formCode\'s compliance result, not the whole file\'s primary-form result', async () => {
    const { docs, storeUploadedFile, documentsService } = makeUploadedDocsFake();
    const avidBlocked = nonCompliantResult(['Missing AVID signature.']);
    const { service } = buildService({
      storeUploadedFileImpl: storeUploadedFile,
      documentsServiceImpl: documentsService,
      pipelineProcessImpl: async () => ({
        detectedFormCode: 'RPA', detectedFormName: 'Residential Purchase Agreement', extraction: { header: {} },
        compliance: COMPLIANT_RESULT,
        formParts: [
          { formCode: 'RPA', formName: 'Residential Purchase Agreement', pageIndices: [0, 1], extraction: { header: {} }, compliance: COMPLIANT_RESULT },
          { formCode: 'AVID', formName: "Agent's Visual Inspection Disclosure", pageIndices: [2], extraction: { header: {} }, compliance: avidBlocked },
        ],
      }),
      formSplitterImpl: async () => makeSplitMap(),
    });

    await service.uploadTransactionDocuments('buyer-token', [makeFile('combined.pdf')]);

    const rpaSplit = docs.find((d) => d.formCode === 'RPA')!;
    const avidSplit = docs.find((d) => d.formCode === 'AVID')!;
    expect((rpaSplit.metadataJson?.compliance as typeof COMPLIANT_RESULT).summary.overallStatus).toBe('compliant');
    expect((avidSplit.metadataJson?.compliance as typeof avidBlocked).summary.overallStatus).toBe('non_compliant');
  });

  it('a single-form PDF (formParts.length <= 1) is never split — unchanged pre-existing single-document behavior', async () => {
    const { docs, storeUploadedFile, documentsService } = makeUploadedDocsFake();
    const { service, formSplitter } = buildService({
      storeUploadedFileImpl: storeUploadedFile,
      documentsServiceImpl: documentsService,
      pipelineProcessImpl: async () => ({
        detectedFormCode: 'RPA', detectedFormName: 'Residential Purchase Agreement', extraction: {},
        compliance: COMPLIANT_RESULT,
      }),
    });

    await service.uploadTransactionDocuments('buyer-token', [makeFile('single-form.pdf')]);

    expect(docs).toHaveLength(1);
    expect(docs[0].formCode).toBe('RPA');
    expect(docs[0].isOriginalPackage).toBeFalsy();
    expect(formSplitter.splitByForm).not.toHaveBeenCalled();
  });

  it('a formSplitter failure is non-fatal — the original document is still saved and the upload reports success', async () => {
    const { docs, storeUploadedFile, documentsService } = makeUploadedDocsFake();
    const { service } = buildService({
      storeUploadedFileImpl: storeUploadedFile,
      documentsServiceImpl: documentsService,
      pipelineProcessImpl: async () => ({
        detectedFormCode: 'RPA', detectedFormName: 'Residential Purchase Agreement', extraction: { header: {} },
        compliance: COMPLIANT_RESULT, formParts: makeFormParts(),
      }),
      formSplitterImpl: async () => { throw new Error('qpdf not found'); },
    });

    const results = await service.uploadTransactionDocuments('buyer-token', [makeFile('combined.pdf')]);

    expect(results[0].status).toBe('success');
    expect(docs).toHaveLength(1);
    expect(docs[0].isOriginalPackage).toBeFalsy();
  });

  it('a split document uploaded through the Seller Agent link also carries uploadLinkId, so it shows on that link\'s own checklist', async () => {
    const { docs, storeUploadedFile, documentsService } = makeUploadedDocsFake();
    const { service } = buildService({
      link: SELLER_AGENT_LINK,
      storeUploadedFileImpl: storeUploadedFile,
      documentsServiceImpl: documentsService,
      pipelineProcessImpl: async () => ({
        detectedFormCode: 'RPA', detectedFormName: 'Residential Purchase Agreement', extraction: { header: {} },
        compliance: COMPLIANT_RESULT, formParts: makeFormParts(),
      }),
      formSplitterImpl: async () => makeSplitMap(),
    });

    await service.uploadTransactionDocuments('seller-token', [makeFile('combined.pdf')]);

    expect(docs.every((d) => d.uploadLinkId === 'link-2')).toBe(true);
  });
});

describe('ExternalDocumentUploadService — multi-file upload regressions', () => {
  function makeFormParts() {
    return [
      { formCode: 'RPA', formName: 'Residential Purchase Agreement', pageIndices: [0, 1], extraction: { header: {} }, compliance: COMPLIANT_RESULT },
      { formCode: 'AVID', formName: "Agent's Visual Inspection Disclosure", pageIndices: [2], extraction: { header: {} }, compliance: COMPLIANT_RESULT },
    ];
  }

  function makeSplitMap() {
    return new Map([
      ['RPA', { buffer: Buffer.from('rpa-bytes'), pageStart: 1, pageEnd: 2 }],
      ['AVID', { buffer: Buffer.from('avid-bytes'), pageStart: 3, pageEnd: 3 }],
    ]);
  }

  it('uploads two valid PDFs simultaneously — both succeed with distinct document rows in the same batch', async () => {
    const { docs, storeUploadedFile, documentsService } = makeUploadedDocsFake();
    const { service } = buildService({ storeUploadedFileImpl: storeUploadedFile, documentsServiceImpl: documentsService });

    const results = await service.uploadTransactionDocuments('buyer-token', [makeFile('one.pdf'), makeFile('two.pdf')]);

    expect(results).toEqual([
      { fileName: 'one.pdf', status: 'success', documentId: 'doc-1' },
      { fileName: 'two.pdf', status: 'success', documentId: 'doc-2' },
    ]);
    expect(docs).toHaveLength(2);
  });

  it('uploads multiple PDFs with different form types in one request — each document is independently classified against its own bytes, never the other file\'s result', async () => {
    const { docs, storeUploadedFile, documentsService } = makeUploadedDocsFake();
    const { service, pipelineService } = buildService({
      storeUploadedFileImpl: storeUploadedFile,
      documentsServiceImpl: documentsService,
      pipelineProcessImpl: async (buffer: Buffer) => {
        const text = buffer.toString();
        if (text === 'rpa-content') {
          return { detectedFormCode: 'RPA', detectedFormName: 'Residential Purchase Agreement', extraction: { documentType: 'RPA' }, compliance: COMPLIANT_RESULT };
        }
        return { detectedFormCode: 'TDS', detectedFormName: 'Transfer Disclosure Statement', extraction: { documentType: 'TDS' }, compliance: COMPLIANT_RESULT };
      },
    });

    const results = await service.uploadTransactionDocuments('buyer-token', [
      makeFile('rpa.pdf', { buffer: Buffer.from('rpa-content') }),
      makeFile('tds.pdf', { buffer: Buffer.from('tds-content') }),
    ]);

    expect(pipelineService.process).toHaveBeenCalledTimes(2);
    expect(results.every((r) => r.status === 'success')).toBe(true);
    const rpaDoc = docs.find((d) => d.fileName === 'rpa.pdf')!;
    const tdsDoc = docs.find((d) => d.fileName === 'tds.pdf')!;
    expect(rpaDoc.formCode).toBe('RPA');
    expect(tdsDoc.formCode).toBe('TDS');
    expect((rpaDoc.metadataJson?.extraction as { documentType: string }).documentType).toBe('RPA');
    expect((tdsDoc.metadataJson?.extraction as { documentType: string }).documentType).toBe('TDS');
  });

  it('a multi-file batch where one file requires splitting still splits correctly alongside the other, unsplit file', async () => {
    const { docs, storeUploadedFile, documentsService } = makeUploadedDocsFake();
    const { service, formSplitter } = buildService({
      storeUploadedFileImpl: storeUploadedFile,
      documentsServiceImpl: documentsService,
      pipelineProcessImpl: async (buffer: Buffer) => {
        if (buffer.toString() === 'combined-content') {
          return {
            detectedFormCode: 'RPA', detectedFormName: 'Residential Purchase Agreement', extraction: { header: {} },
            compliance: COMPLIANT_RESULT, formParts: makeFormParts(),
          };
        }
        return { detectedFormCode: 'TDS', detectedFormName: 'Transfer Disclosure Statement', extraction: {}, compliance: COMPLIANT_RESULT };
      },
      formSplitterImpl: async () => makeSplitMap(),
    });

    const results = await service.uploadTransactionDocuments('buyer-token', [
      makeFile('combined.pdf', { buffer: Buffer.from('combined-content') }),
      makeFile('single.pdf', { buffer: Buffer.from('single-content') }),
    ]);

    expect(results.every((r) => r.status === 'success')).toBe(true);
    expect(formSplitter.splitByForm).toHaveBeenCalledTimes(1);
    // combined.pdf → 1 original (isOriginalPackage) + 2 split rows; single.pdf → 1 unsplit row = 4 total.
    expect(docs).toHaveLength(4);
    const original = docs.find((d) => d.fileName === 'combined.pdf')!;
    expect(original.isOriginalPackage).toBe(true);
    expect(docs.some((d) => d.formCode === 'RPA' && d.sourceDocumentId === original.id)).toBe(true);
    expect(docs.some((d) => d.formCode === 'AVID' && d.sourceDocumentId === original.id)).toBe(true);
    const singleDoc = docs.find((d) => d.fileName === 'single.pdf')!;
    expect(singleDoc.formCode).toBe('TDS');
    expect(singleDoc.isOriginalPackage).toBeFalsy();
  });

  it('one successful file and one failed file in the same multi-file upload — the failure never blocks or corrupts the successful file\'s result', async () => {
    const { docs, storeUploadedFile, documentsService } = makeUploadedDocsFake();
    const failingStore = jest.fn(async (params: Parameters<typeof storeUploadedFile>[0]) => {
      if (params.file.originalname === 'corrupt.pdf') throw new Error('Unable to read PDF structure');
      return storeUploadedFile(params);
    });
    const { service } = buildService({ storeUploadedFileImpl: failingStore, documentsServiceImpl: documentsService });

    const results = await service.uploadTransactionDocuments('buyer-token', [
      makeFile('corrupt.pdf'),
      makeFile('good.pdf'),
    ]);

    expect(results.find((r) => r.fileName === 'corrupt.pdf')).toEqual({ fileName: 'corrupt.pdf', status: 'failed', error: 'Unable to read PDF structure' });
    expect(results.find((r) => r.fileName === 'good.pdf')?.status).toBe('success');
    expect(docs).toHaveLength(1);
    expect(docs[0].fileName).toBe('good.pdf');
  });

  it('every document from a multi-file upload is associated with the correct transaction and upload link, with each keeping its own independently-computed form code and extraction', async () => {
    const { docs, storeUploadedFile, documentsService } = makeUploadedDocsFake();
    const { service } = buildService({
      link: SELLER_AGENT_LINK,
      storeUploadedFileImpl: storeUploadedFile,
      documentsServiceImpl: documentsService,
      pipelineProcessImpl: async (buffer: Buffer) => {
        const text = buffer.toString();
        return {
          detectedFormCode: text === 'sco-content' ? 'SCO' : 'AVID',
          detectedFormName: text === 'sco-content' ? 'Seller Counter Offer' : "Agent's Visual Inspection Disclosure",
          extraction: { source: text },
          compliance: COMPLIANT_RESULT,
        };
      },
    });

    await service.uploadTransactionDocuments('seller-token', [
      makeFile('sco.pdf', { buffer: Buffer.from('sco-content') }),
      makeFile('avid.pdf', { buffer: Buffer.from('avid-content') }),
    ]);

    expect(docs).toHaveLength(2);
    for (const doc of docs) {
      expect(doc.transactionId).toBe('tx-1');
      expect(doc.uploadLinkId).toBe('link-2');
    }
    const scoDoc = docs.find((d) => d.fileName === 'sco.pdf')!;
    const avidDoc = docs.find((d) => d.fileName === 'avid.pdf')!;
    expect(scoDoc.formCode).toBe('SCO');
    expect((scoDoc.metadataJson?.extraction as { source: string }).source).toBe('sco-content');
    expect(avidDoc.formCode).toBe('AVID');
    expect((avidDoc.metadataJson?.extraction as { source: string }).source).toBe('avid-content');
  });
});
