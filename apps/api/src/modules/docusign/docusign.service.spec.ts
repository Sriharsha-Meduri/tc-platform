import { Readable } from 'stream';
import { DocuSignService } from './docusign.service';
import { DocuSignEnvelopeStatus } from './entities/docusign-envelope.entity';
import { DocumentStatus } from '../transaction-documents/entities/transaction-document.entity';
import { matchDocumentsToChecklist, buildDocumentValidation } from '../transaction-form-templates/checklist-matching.util';

const TX = {
  id: 'tx-1',
  propertyAddressLine1: '123 Main St',
  propertyAddressLine2: null,
  propertyCity: 'Chino',
  propertyState: 'CA',
  propertyPostalCode: '91708',
};

function makeStoredDoc(overrides: Partial<{ id: string; storageKey: string | null; fileName: string }> = {}) {
  return {
    id: 'doc-1',
    storageKey: 'transactions/tx-1/external-uploads/doc-1.pdf',
    ...overrides,
  };
}

function buildService(overrides: {
  docs?: ReturnType<typeof makeStoredDoc>[];
  envelopeResponse?: Record<string, unknown>;
  signingUrlResponse?: { url: string } | null;
} = {}) {
  const originalEnv = { ...process.env };
  process.env.DOCUSIGN_INTEGRATION_KEY = 'test-integration-key';
  process.env.DOCUSIGN_IMPERSONATED_USER_ID = 'test-impersonated-user';
  process.env.DOCUSIGN_PRIVATE_KEY = 'test-private-key';
  process.env.DOCUSIGN_AUTH_SERVER = 'account-d.docusign.com';

  const envelopeRepo = {
    create: jest.fn((data: Record<string, unknown>) => data),
    save: jest.fn(async (data: Record<string, unknown>) => ({ id: 'envelope-row-1', ...data })),
  };
  const docRepo = { find: jest.fn().mockResolvedValue(overrides.docs ?? [makeStoredDoc()]) };
  const txRepo = { findOne: jest.fn().mockResolvedValue(TX) };
  const partyRepo = {};
  const templateRepo = {};
  const templateItemRepo = {};
  const s3 = {
    getObject: jest.fn().mockImplementation(async () => ({
      stream: Readable.from([Buffer.from('pdf-bytes')]),
      fileName: 'doc.pdf',
    })),
  };
  const oauthService = { getValidToken: jest.fn() };
  const lineDetector = { detectLines: jest.fn() };
  const pdfRender = { getPageCount: jest.fn(), getPageDimensions: jest.fn(), renderPage: jest.fn() };
  const signedDocumentNotification = { notifyDocumentSigned: jest.fn().mockResolvedValue(undefined) };
  const vpSignedEscrowNotification = { notifyEscrowOfSignedVp: jest.fn().mockResolvedValue(undefined) };
  const documentPipeline = { process: jest.fn() };

  const service = new DocuSignService(
    envelopeRepo as never,
    docRepo as never,
    txRepo as never,
    partyRepo as never,
    templateRepo as never,
    templateItemRepo as never,
    s3 as never,
    oauthService as never,
    lineDetector as never,
    pdfRender as never,
    signedDocumentNotification as never,
    vpSignedEscrowNotification as never,
    documentPipeline as never,
  );

  // Bypass real RSA/JWT signing — irrelevant to what this suite tests.
  jest.spyOn(service as never as { signJwt: () => Promise<string> }, 'signJwt').mockResolvedValue('fake.jwt.token');

  const envelopeResponse = overrides.envelopeResponse ?? {
    envelopeId: 'envelope-123',
    uri: '/envelopes/envelope-123',
    status: 'sent',
    statusDateTime: new Date().toISOString(),
    recipients: { signers: [] },
  };

  const fetchMock = jest.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    if (url.includes('/oauth/token')) {
      return { ok: true, json: async () => ({ access_token: 'test-token', token_type: 'Bearer', expires_in: 3600 }) };
    }
    if (url.includes('/oauth/userinfo')) {
      return { ok: true, json: async () => ({ accounts: [{ account_id: 'acct-1', base_uri: 'https://demo.docusign.net', is_default: true }] }) };
    }
    if (url.endsWith('/envelopes') && method === 'POST') {
      return { ok: true, json: async () => envelopeResponse };
    }
    if (url.includes('/views/recipient')) {
      if (overrides.signingUrlResponse === null) return { ok: false, status: 400, text: async () => 'no signing url' };
      return { ok: true, json: async () => (overrides.signingUrlResponse ?? { url: 'https://demo.docusign.net/signing/abc' }) };
    }
    throw new Error(`Unexpected fetch call: ${method} ${url}`);
  });
  global.fetch = fetchMock as never;

  return { service, envelopeRepo, docRepo, txRepo, s3, fetchMock, restoreEnv: () => { process.env = originalEnv; } };
}

function findEnvelopeCreateCall(fetchMock: jest.Mock): [string, RequestInit] {
  const call = fetchMock.mock.calls.find((c: unknown[]) => {
    const [url, init] = c as [string, RequestInit | undefined];
    return url.endsWith('/envelopes') && init?.method === 'POST';
  });
  return call as [string, RequestInit];
}

describe('DocuSignService.sendSellerDocumentsToBuyer', () => {
  afterEach(() => jest.restoreAllMocks());

  it('sends all Buyers as signers with the SAME routingOrder (simultaneous signing)', async () => {
    const { service, fetchMock, restoreEnv } = buildService();
    try {
      await service.sendSellerDocumentsToBuyer({
        transactionId: 'tx-1',
        uploadLinkId: 'link-seller-1',
        documentIds: ['doc-1'],
        buyers: [{ name: 'Ashok Buyer', email: 'ashok@example.com' }, { name: 'Sunila Buyer', email: 'sunila@example.com' }],
        buyerAgent: { name: 'Sam Seller Agent', email: 'sam@listingco.com' },
      });

      const envelopeCall = findEnvelopeCreateCall(fetchMock);
      const body = JSON.parse((envelopeCall![1] as RequestInit).body as string);
      const recipients = body.compositeTemplates[0].inlineTemplates[0].recipients;
      expect(recipients.signers).toHaveLength(2);
      expect(new Set(recipients.signers.map((s: { routingOrder: string }) => s.routingOrder)).size).toBe(1);
      expect(recipients.signers.map((s: { email: string }) => s.email)).toEqual(['ashok@example.com', 'sunila@example.com']);
    } finally {
      restoreEnv();
    }
  });

  it('adds the Buyer Agent as a carbonCopy, never a signer, with no tabs at all', async () => {
    const { service, fetchMock, restoreEnv } = buildService();
    try {
      await service.sendSellerDocumentsToBuyer({
        transactionId: 'tx-1',
        uploadLinkId: 'link-seller-1',
        documentIds: ['doc-1'],
        buyers: [{ name: 'Ashok Buyer', email: 'ashok@example.com' }],
        buyerAgent: { name: 'Sam Seller Agent', email: 'sam@listingco.com' },
      });

      const envelopeCall = findEnvelopeCreateCall(fetchMock);
      const body = JSON.parse((envelopeCall![1] as RequestInit).body as string);
      const recipients = body.compositeTemplates[0].inlineTemplates[0].recipients;
      expect(recipients.carbonCopies).toEqual([
        expect.objectContaining({ email: 'sam@listingco.com', name: 'Sam Seller Agent' }),
      ]);
      expect(recipients.carbonCopies[0].tabs).toBeUndefined();
      expect(recipients.signers.some((s: { email: string }) => s.email === 'sam@listingco.com')).toBe(false);
    } finally {
      restoreEnv();
    }
  });

  it('persists ccRecipients and uploadLinkId on the saved envelope entity', async () => {
    const { service, envelopeRepo, restoreEnv } = buildService();
    try {
      await service.sendSellerDocumentsToBuyer({
        transactionId: 'tx-1',
        uploadLinkId: 'link-seller-1',
        documentIds: ['doc-1'],
        buyers: [{ name: 'Ashok Buyer', email: 'ashok@example.com' }],
        buyerAgent: { name: 'Sam Seller Agent', email: 'sam@listingco.com' },
      });

      expect(envelopeRepo.create).toHaveBeenCalledWith(expect.objectContaining({
        uploadLinkId: 'link-seller-1',
        ccRecipients: [expect.objectContaining({ email: 'sam@listingco.com', name: 'Sam Seller Agent' })],
        status: DocuSignEnvelopeStatus.SENT,
      }));
    } finally {
      restoreEnv();
    }
  });

  it('preserves the caller-supplied document order in the envelope, not the DB query order', async () => {
    const { service, fetchMock, restoreEnv } = buildService({
      docs: [makeStoredDoc({ id: 'doc-b', fileName: 'b.pdf' }), makeStoredDoc({ id: 'doc-a', fileName: 'a.pdf' })],
    });
    try {
      await service.sendSellerDocumentsToBuyer({
        transactionId: 'tx-1',
        uploadLinkId: 'link-seller-1',
        documentIds: ['doc-a', 'doc-b'], // explicit order — opposite of docRepo.find's return order
        buyers: [{ name: 'Ashok Buyer', email: 'ashok@example.com' }],
        buyerAgent: { name: 'Sam Seller Agent', email: 'sam@listingco.com' },
      });

      const envelopeCall = findEnvelopeCreateCall(fetchMock);
      const body = JSON.parse((envelopeCall![1] as RequestInit).body as string);
      const documentIds = body.compositeTemplates.map((c: { document: { documentId: string } }) => c.document.documentId);
      expect(documentIds).toEqual(['1', '2']); // sequential DocuSign IDs assigned in the CALLER's order
    } finally {
      restoreEnv();
    }
  });

  it('skips documents with no stored file, and throws if none remain', async () => {
    const { service, restoreEnv } = buildService({ docs: [makeStoredDoc({ id: 'doc-1', storageKey: null })] });
    try {
      await expect(service.sendSellerDocumentsToBuyer({
        transactionId: 'tx-1',
        uploadLinkId: 'link-seller-1',
        documentIds: ['doc-1'],
        buyers: [{ name: 'Ashok Buyer', email: 'ashok@example.com' }],
        buyerAgent: { name: 'Sam Seller Agent', email: 'sam@listingco.com' },
      })).rejects.toThrow('None of the selected documents have a stored PDF file');
    } finally {
      restoreEnv();
    }
  });

  it('throws when the transaction does not exist', async () => {
    const { service, txRepo, restoreEnv } = buildService();
    txRepo.findOne.mockResolvedValue(null);
    try {
      await expect(service.sendSellerDocumentsToBuyer({
        transactionId: 'missing-tx',
        uploadLinkId: 'link-seller-1',
        documentIds: ['doc-1'],
        buyers: [{ name: 'Ashok Buyer', email: 'ashok@example.com' }],
        buyerAgent: { name: 'Sam Seller Agent', email: 'sam@listingco.com' },
      })).rejects.toThrow('Transaction not found');
    } finally {
      restoreEnv();
    }
  });
});

// ── Signed document promotion (post-completion handling) ────────────────────

interface FakeDoc {
  id: string;
  transactionId: string;
  stage: string | null;
  documentType: string;
  title: string;
  fileName: string | null;
  formCode: string | null;
  sourceDocumentId: string | null;
  sourcePageStart: number | null;
  sourcePageEnd: number | null;
  versionNo: number;
  status: string;
  previousVersionId: string | null;
  uploadedByAccountId: string | null;
  uploadLinkId: string | null;
  submissionId: string | null;
  requestedFromPartyId: string | null;
  workflowStepId: string | null;
  aiInteractionId: string | null;
  dueAt: Date | null;
  metadataJson: Record<string, unknown> | null;
  docusignEnvelopeId?: string | null;
  signedAt?: Date | null;
  analysisStatus?: string | null;
  analyzedAt?: Date | null;
}

function makeOriginalDoc(overrides: Partial<FakeDoc> = {}): FakeDoc {
  return {
    id: 'doc-1',
    transactionId: 'tx-1',
    stage: 'closing',
    documentType: 'rpa',
    title: 'Purchase Agreement',
    fileName: 'rpa.pdf',
    formCode: 'RPA',
    sourceDocumentId: null,
    sourcePageStart: null,
    sourcePageEnd: null,
    versionNo: 1,
    status: DocumentStatus.UPLOADED,
    previousVersionId: null,
    uploadedByAccountId: 'account-1',
    uploadLinkId: 'link-1',
    submissionId: 'submission-1',
    requestedFromPartyId: 'party-1',
    workflowStepId: 'step-1',
    aiInteractionId: 'ai-1',
    dueAt: new Date('2026-02-01'),
    metadataJson: { existing: true },
    // A document is only ever DocuSign-eligible once its own pre-signature
    // analysis already completed (see SellerAgentDocumentDocusignService.isDocumentEligible)
    // — every fixture here reflects that real precondition by default.
    analysisStatus: 'completed',
    analyzedAt: new Date('2026-01-20'),
    ...overrides,
  };
}

function bufferResponse(bytes = 'pdf-bytes', headers: Record<string, string> = {}) {
  return {
    ok: true,
    arrayBuffer: async () => Buffer.from(bytes),
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
  };
}

function buildSyncService(opts: {
  envelope?: Partial<{ id: string; envelopeId: string; transactionId: string; documentIds: string[]; completedProcessedAt: Date | null; signers: unknown[] | null }>;
  docs?: FakeDoc[];
  statusResponse?: Record<string, unknown>;
  documentsListResponse?: { envelopeDocuments: Array<{ documentId: string; name: string; type?: string }> } | null;
  certificateAvailable?: boolean;
  combinedDownloadFails?: boolean;
  s3UploadFails?: boolean;
  persistFails?: boolean;
  pipelineFails?: boolean;
} = {}) {
  const originalEnv = { ...process.env };
  process.env.DOCUSIGN_INTEGRATION_KEY = 'test-integration-key';
  process.env.DOCUSIGN_IMPERSONATED_USER_ID = 'test-impersonated-user';
  process.env.DOCUSIGN_PRIVATE_KEY = 'test-private-key';
  process.env.DOCUSIGN_AUTH_SERVER = 'account-d.docusign.com';

  const envelopeStore = {
    id: 'env-row-1',
    envelopeId: 'envelope-abc',
    transactionId: 'tx-1',
    documentIds: ['doc-1'],
    completedProcessedAt: null as Date | null,
    completedAt: new Date('2026-01-15T12:00:00.000Z'),
    signers: [{ name: 'Bob Buyer', email: 'bob@buyer.com', status: 'completed' }] as unknown[] | null,
    ...opts.envelope,
  };

  const documentRows: FakeDoc[] = opts.docs ?? [makeOriginalDoc()];
  const savedSignedRows: FakeDoc[] = [];

  function findInStore(where: Record<string, unknown>): FakeDoc | undefined {
    return [...documentRows, ...savedSignedRows].find((d) =>
      Object.entries(where).every(([k, v]) => (d as unknown as Record<string, unknown>)[k] === v));
  }

  const envelopeRepo = {
    findOne: jest.fn(async () => ({ ...envelopeStore })),
    save: jest.fn(async (e: typeof envelopeStore) => { Object.assign(envelopeStore, e); return { ...envelopeStore }; }),
    update: jest.fn(async (id: string, patch: Partial<typeof envelopeStore>) => {
      if (id === envelopeStore.id) Object.assign(envelopeStore, patch);
      return { affected: 1 };
    }),
    createQueryBuilder: jest.fn(() => {
      const qb: { __patch?: { completedProcessedAt: Date }; update: jest.Mock; set: jest.Mock; where: jest.Mock; execute: jest.Mock } = {
        update: jest.fn(() => qb),
        set: jest.fn((patch: { completedProcessedAt: Date }) => { qb.__patch = patch; return qb; }),
        where: jest.fn(() => qb),
        execute: jest.fn(async () => {
          if (envelopeStore.completedProcessedAt === null) {
            envelopeStore.completedProcessedAt = qb.__patch!.completedProcessedAt;
            return { affected: 1 };
          }
          return { affected: 0 };
        }),
      };
      return qb;
    }),
  };

  const docRepo = {
    findOne: jest.fn(async ({ where }: { where: Record<string, unknown> }) => findInStore(where) ?? null),
    find: jest.fn(async () => documentRows.filter((d) => (envelopeStore.documentIds ?? []).includes(d.id))),
    manager: {
      transaction: jest.fn(async (cb: (manager: unknown) => Promise<void>) => {
        if (opts.persistFails) throw new Error('DB write failed');
        const manager = {
          findOne: jest.fn(async (_entity: unknown, { where }: { where: Record<string, unknown> }) => findInStore(where) ?? null),
          create: jest.fn((_entity: unknown, data: Record<string, unknown>) => data),
          save: jest.fn(async (_entity: unknown, data: FakeDoc) => {
            if (data.status === DocumentStatus.SIGNED) {
              savedSignedRows.push(data);
            } else {
              const idx = documentRows.findIndex((d) => d.id === data.id);
              if (idx >= 0) documentRows[idx] = data;
            }
            return data;
          }),
        };
        return cb(manager);
      }),
    },
  };

  const s3 = {
    upload: jest.fn(async (_txId: string, _stage: string, fileName: string) => {
      if (opts.s3UploadFails && fileName.endsWith('-signed.pdf')) throw new Error('S3 upload failed');
      return { storageKey: `transactions/tx-1/closing/${fileName}` };
    }),
  };

  const oauthService = { getValidToken: jest.fn() };
  const lineDetector = { detectLines: jest.fn() };
  const pdfRender = { getPageCount: jest.fn(), getPageDimensions: jest.fn(), renderPage: jest.fn() };
  const signedDocumentNotification = { notifyDocumentSigned: jest.fn().mockResolvedValue(undefined) };
  const vpSignedEscrowNotification = { notifyEscrowOfSignedVp: jest.fn().mockResolvedValue(undefined) };
  const txRepo = { findOne: jest.fn().mockResolvedValue({ id: 'tx-1', transactionNumber: 'TXN-2026-0001' }) };
  const documentPipeline = {
    process: jest.fn(async () => {
      if (opts.pipelineFails) throw new Error('Pipeline extraction failed');
      return {
        pdfType: 'digital_acroform',
        extraction: {},
        compliance: { checks: [] as unknown[], blockers: [] as unknown[] },
        detectedFormCode: null as string | null,
        detectedFormName: null as string | null,
        resolvedStage: 'closing',
        resolvedDocumentType: 'general',
      };
    }),
  };

  const service = new DocuSignService(
    envelopeRepo as never,
    docRepo as never,
    txRepo as never,
    {} as never,
    {} as never,
    {} as never,
    s3 as never,
    oauthService as never,
    lineDetector as never,
    pdfRender as never,
    signedDocumentNotification as never,
    vpSignedEscrowNotification as never,
    documentPipeline as never,
  );

  jest.spyOn(service as never as { signJwt: () => Promise<string> }, 'signJwt').mockResolvedValue('fake.jwt.token');

  const statusResponse = {
    status: 'completed',
    completedDateTime: '2026-01-15T12:00:00.000Z',
    recipients: { signers: [{ recipientId: '1', email: 'bob@buyer.com', status: 'completed' }] },
    ...opts.statusResponse,
  };

  const fetchMock = jest.fn(async (url: string) => {
    if (url.includes('/oauth/token')) {
      return { ok: true, json: async () => ({ access_token: 'test-token', token_type: 'Bearer', expires_in: 3600 }) };
    }
    if (url.includes('/oauth/userinfo')) {
      return { ok: true, json: async () => ({ accounts: [{ account_id: 'acct-1', base_uri: 'https://demo.docusign.net', is_default: true }] }) };
    }
    if (/\/envelopes\/[^/]+$/.test(url)) {
      return { ok: true, json: async () => statusResponse };
    }
    if (url.endsWith('/documents/combined')) {
      if (opts.combinedDownloadFails) return { ok: false, status: 500 };
      return bufferResponse('combined-pdf-bytes', { 'content-disposition': 'attachment; filename="combined.pdf"' });
    }
    if (url.endsWith('/documents/certificate')) {
      if (opts.certificateAvailable === false) return { ok: false, status: 404 };
      return bufferResponse('certificate-bytes');
    }
    if (url.endsWith('/documents')) {
      if (!opts.documentsListResponse) return { ok: false, status: 404 };
      return { ok: true, json: async () => opts.documentsListResponse };
    }
    if (/\/documents\/[^/]+$/.test(url)) {
      return bufferResponse('per-document-pdf-bytes');
    }
    throw new Error(`Unexpected fetch call: ${url}`);
  });
  global.fetch = fetchMock as never;

  return {
    service, envelopeRepo, docRepo, s3, fetchMock, documentRows, savedSignedRows, envelopeStore, signedDocumentNotification, vpSignedEscrowNotification, txRepo, documentPipeline,
    restoreEnv: () => { process.env = originalEnv; },
  };
}

describe('DocuSignService — signed document promotion (post-completion)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('the atomic claim prevents a duplicate signed row even when two completion handlers race on the same envelope', async () => {
    const { service, savedSignedRows, s3, restoreEnv } = buildSyncService();
    try {
      await Promise.all([service.processCompletedEnvelope('env-row-1'), service.processCompletedEnvelope('env-row-1')]);

      expect(savedSignedRows).toHaveLength(1);
      expect(s3.upload).toHaveBeenCalledTimes(2); // one signed PDF + one certificate, from whichever call won the claim
    } finally {
      restoreEnv();
    }
  });

  it('a repeated syncEnvelopeStatus call (e.g. the next cron tick) is a no-op once completion has already been processed', async () => {
    const { service, savedSignedRows, s3, restoreEnv } = buildSyncService();
    try {
      await service.syncEnvelopeStatus('env-row-1');
      await service.syncEnvelopeStatus('env-row-1');

      expect(savedSignedRows).toHaveLength(1);
      expect(s3.upload).toHaveBeenCalledTimes(2); // signed PDF + certificate, from the first sync only
    } finally {
      restoreEnv();
    }
  });

  it('skips a document belonging to a different transaction than the envelope, while still promoting the document that does belong to it', async () => {
    const foreignDoc = makeOriginalDoc({ id: 'doc-foreign', transactionId: 'tx-OTHER' });
    const ownDoc = makeOriginalDoc({ id: 'doc-1', transactionId: 'tx-1' });
    const { service, savedSignedRows, restoreEnv } = buildSyncService({
      envelope: { documentIds: ['doc-foreign', 'doc-1'] },
      docs: [foreignDoc, ownDoc],
    });
    try {
      await service.syncEnvelopeStatus('env-row-1');

      expect(savedSignedRows).toHaveLength(1);
      expect(savedSignedRows[0].previousVersionId).toBe('doc-1');
      expect(savedSignedRows.some((d) => d.previousVersionId === 'doc-foreign')).toBe(false);
    } finally {
      restoreEnv();
    }
  });

  it('downloads and stores the certificate of completion, referencing its storage key on the signed row', async () => {
    const { service, savedSignedRows, s3, restoreEnv } = buildSyncService();
    try {
      await service.syncEnvelopeStatus('env-row-1');

      expect(s3.upload).toHaveBeenCalledWith('tx-1', 'closing', 'certificate-envelope-abc.pdf', expect.any(Buffer), 'application/pdf');
      expect(savedSignedRows[0].metadataJson?.docusignCertificateStorageKey).toContain('certificate-envelope-abc.pdf');
    } finally {
      restoreEnv();
    }
  });

  it('still creates the signed document when the certificate download fails — the certificate is supplementary, never a hard requirement', async () => {
    const { service, savedSignedRows, restoreEnv } = buildSyncService({ certificateAvailable: false });
    try {
      await service.syncEnvelopeStatus('env-row-1');

      expect(savedSignedRows).toHaveLength(1);
      expect(savedSignedRows[0].metadataJson?.docusignCertificateStorageKey).toBeUndefined();
    } finally {
      restoreEnv();
    }
  });

  it('copies full provenance from the original document onto the signed version, and stamps signedAt/docusignEnvelopeId', async () => {
    const original = makeOriginalDoc({
      uploadLinkId: 'link-99', submissionId: 'submission-99', requestedFromPartyId: 'party-99',
      workflowStepId: 'step-99', aiInteractionId: 'ai-99', dueAt: new Date('2026-03-01'),
    });
    const { service, savedSignedRows, restoreEnv } = buildSyncService({ docs: [original] });
    try {
      await service.syncEnvelopeStatus('env-row-1');

      const signed = savedSignedRows[0];
      expect(signed.uploadLinkId).toBe('link-99');
      expect(signed.submissionId).toBe('submission-99');
      expect(signed.requestedFromPartyId).toBe('party-99');
      expect(signed.workflowStepId).toBe('step-99');
      expect(signed.aiInteractionId).toBe('ai-99');
      expect(signed.dueAt).toEqual(new Date('2026-03-01'));
      expect(signed.status).toBe(DocumentStatus.SIGNED);
      expect(signed.previousVersionId).toBe(original.id);
      expect(signed.versionNo).toBe(original.versionNo + 1);
      expect(signed.docusignEnvelopeId).toBe('envelope-abc');
      expect(signed.signedAt).toEqual(new Date('2026-01-15T12:00:00.000Z'));
    } finally {
      restoreEnv();
    }
  });

  it('marks the original document as superseded once its signed version is created, preserving the version chain', async () => {
    const original = makeOriginalDoc();
    const { service, documentRows, savedSignedRows, restoreEnv } = buildSyncService({ docs: [original] });
    try {
      await service.syncEnvelopeStatus('env-row-1');

      const updatedOriginal = documentRows.find((d) => d.id === original.id)!;
      expect(updatedOriginal.status).toBe(DocumentStatus.SUPERSEDED);
      expect(savedSignedRows[0].previousVersionId).toBe(updatedOriginal.id);
    } finally {
      restoreEnv();
    }
  });

  it('skips creating a signed version when one already exists for this original document (belt-and-suspenders duplicate check)', async () => {
    const original = makeOriginalDoc({ id: 'doc-1' });
    const existingSigned = makeOriginalDoc({ id: 'doc-1-signed', status: DocumentStatus.SIGNED, previousVersionId: 'doc-1' });
    const { service, s3, savedSignedRows, restoreEnv } = buildSyncService({ docs: [original, existingSigned] });
    try {
      await service.syncEnvelopeStatus('env-row-1');

      expect(savedSignedRows).toHaveLength(0);
      // Only the once-per-envelope certificate upload happens — the signed-PDF upload for doc-1 is skipped entirely.
      expect(s3.upload).toHaveBeenCalledTimes(1);
      expect(s3.upload).toHaveBeenCalledWith(expect.any(String), expect.any(String), expect.stringContaining('certificate'), expect.anything(), 'application/pdf');
    } finally {
      restoreEnv();
    }
  });

  it('resolves a per-document signed PDF via the DocuSign document list when the original fileName is unambiguous', async () => {
    const original = makeOriginalDoc({ id: 'doc-1', fileName: 'rpa.pdf' });
    const { service, fetchMock, restoreEnv } = buildSyncService({
      docs: [original],
      documentsListResponse: { envelopeDocuments: [{ documentId: '1', name: 'rpa.pdf', type: 'content' }] },
    });
    try {
      await service.syncEnvelopeStatus('env-row-1');

      const perDocCall = fetchMock.mock.calls.find((c) => (c[0] as string).endsWith('/documents/1'));
      expect(perDocCall).toBeDefined();
    } finally {
      restoreEnv();
    }
  });

  // ── Buyer-side compliance re-validation of the actual signed PDF ────────────

  describe('signed-document compliance re-validation', () => {
    it('runs the document pipeline against the isolated per-document signed PDF, and persists a fresh compliance result with analysisStatus completed', async () => {
      const original = makeOriginalDoc({ id: 'doc-1', fileName: 'rpa.pdf', analysisStatus: 'completed', metadataJson: { compliance: { checks: [{ ruleId: 'stale', label: 'Stale pre-signature check' }] } } });
      const freshChecks = [{ ruleId: 'buyer_signature', label: 'Buyer signature present', status: 'pass' }];
      const { service, savedSignedRows, documentPipeline, restoreEnv } = buildSyncService({
        docs: [original],
        documentsListResponse: { envelopeDocuments: [{ documentId: '1', name: 'rpa.pdf', type: 'content' }] },
      });
      documentPipeline.process.mockResolvedValue({
        pdfType: 'digital_acroform',
        extraction: { fresh: true },
        compliance: { checks: freshChecks, blockers: [] },
        detectedFormCode: 'RPA',
        detectedFormName: 'Residential Purchase Agreement',
        resolvedStage: 'closing',
        resolvedDocumentType: 'rpa',
      });
      try {
        await service.syncEnvelopeStatus('env-row-1');

        // The pipeline is called with the isolated per-document buffer, not the combined-envelope fallback.
        expect(documentPipeline.process).toHaveBeenCalledWith(Buffer.from('per-document-pdf-bytes'));

        expect(savedSignedRows).toHaveLength(1);
        const signed = savedSignedRows[0] as unknown as FakeDoc;
        expect(signed.analysisStatus).toBe('completed');
        expect(signed.analyzedAt).toBeInstanceOf(Date);
        expect((signed.metadataJson as { compliance: unknown }).compliance).toEqual({ checks: freshChecks, blockers: [] });
        // formCode identity is preserved from the original document, never overridden by fresh detection.
        expect(signed.formCode).toBe('RPA');
      } finally {
        restoreEnv();
      }
    });

    it('falls back to the original document analysisStatus (never leaves it null) when no isolated per-document PDF could be resolved', async () => {
      const original = makeOriginalDoc({ id: 'doc-1', fileName: 'rpa.pdf', analysisStatus: 'completed' });
      const { service, savedSignedRows, documentPipeline, restoreEnv } = buildSyncService({ docs: [original] });
      try {
        await service.syncEnvelopeStatus('env-row-1');

        expect(documentPipeline.process).not.toHaveBeenCalled();
        const signed = savedSignedRows[0] as unknown as FakeDoc;
        expect(signed.analysisStatus).toBe('completed');
      } finally {
        restoreEnv();
      }
    });

    it('falls back to the original analysisStatus when the pipeline throws — the signed document still persists, not left permanently unmatchable', async () => {
      const original = makeOriginalDoc({ id: 'doc-1', fileName: 'rpa.pdf', analysisStatus: 'completed' });
      const { service, savedSignedRows, restoreEnv } = buildSyncService({
        docs: [original],
        documentsListResponse: { envelopeDocuments: [{ documentId: '1', name: 'rpa.pdf', type: 'content' }] },
        pipelineFails: true,
      });
      try {
        await service.syncEnvelopeStatus('env-row-1');

        expect(savedSignedRows).toHaveLength(1);
        const signed = savedSignedRows[0] as unknown as FakeDoc;
        expect(signed.analysisStatus).toBe('completed');
      } finally {
        restoreEnv();
      }
    });
  });

  // ── processCompletedEnvelope: public API, retry-safety, and notification wiring ──

  it('processCompletedEnvelope is idempotent across duplicate direct calls (e.g. a webhook retry) — one signed row, one notification', async () => {
    const { service, savedSignedRows, signedDocumentNotification, restoreEnv } = buildSyncService();
    try {
      const first = await service.processCompletedEnvelope('env-row-1');
      const second = await service.processCompletedEnvelope('env-row-1');

      expect(first.savedDocumentIds).toEqual(['doc-1']);
      expect(second.savedDocumentIds).toEqual([]);
      expect(savedSignedRows).toHaveLength(1);
      expect(signedDocumentNotification.notifyDocumentSigned).toHaveBeenCalledTimes(1);
    } finally {
      restoreEnv();
    }
  });

  it('returns the original document ids whose signed version was newly persisted this run', async () => {
    const docA = makeOriginalDoc({ id: 'doc-a' });
    const docB = makeOriginalDoc({ id: 'doc-b' });
    const { service, restoreEnv } = buildSyncService({
      envelope: { documentIds: ['doc-a', 'doc-b'] },
      docs: [docA, docB],
    });
    try {
      const result = await service.processCompletedEnvelope('env-row-1');
      expect(result.savedDocumentIds.sort()).toEqual(['doc-a', 'doc-b']);
    } finally {
      restoreEnv();
    }
  });

  it('a failed combined-PDF download clears completedProcessedAt so a later retry can complete the work, and sends no notification', async () => {
    const { service, envelopeStore, savedSignedRows, signedDocumentNotification, restoreEnv } = buildSyncService({ combinedDownloadFails: true });
    try {
      const result = await service.processCompletedEnvelope('env-row-1');

      expect(result.savedDocumentIds).toEqual([]);
      expect(savedSignedRows).toHaveLength(0);
      expect(envelopeStore.completedProcessedAt).toBeNull();
      expect(signedDocumentNotification.notifyDocumentSigned).not.toHaveBeenCalled();
    } finally {
      restoreEnv();
    }
  });

  it('retries successfully after a download failure is fixed — the next call is not blocked by the earlier failed claim', async () => {
    const opts: { combinedDownloadFails?: boolean } = { combinedDownloadFails: true };
    const { service, envelopeStore, savedSignedRows, restoreEnv } = buildSyncService(opts);
    try {
      const first = await service.processCompletedEnvelope('env-row-1');
      expect(first.savedDocumentIds).toEqual([]);
      expect(envelopeStore.completedProcessedAt).toBeNull();

      opts.combinedDownloadFails = false;
      const second = await service.processCompletedEnvelope('env-row-1');
      expect(second.savedDocumentIds).toEqual(['doc-1']);
      expect(savedSignedRows).toHaveLength(1);
      expect(envelopeStore.completedProcessedAt).not.toBeNull();
    } finally {
      restoreEnv();
    }
  });

  it('an S3 upload failure for a signed document clears completedProcessedAt for retry and sends no notification for that document', async () => {
    const { service, envelopeStore, savedSignedRows, signedDocumentNotification, restoreEnv } = buildSyncService({ s3UploadFails: true });
    try {
      const result = await service.processCompletedEnvelope('env-row-1');

      expect(result.savedDocumentIds).toEqual([]);
      expect(savedSignedRows).toHaveLength(0);
      expect(envelopeStore.completedProcessedAt).toBeNull();
      expect(signedDocumentNotification.notifyDocumentSigned).not.toHaveBeenCalled();
    } finally {
      restoreEnv();
    }
  });

  it('a database persistence failure (not a benign lost-race unique violation) clears completedProcessedAt for retry', async () => {
    const { service, envelopeStore, savedSignedRows, signedDocumentNotification, restoreEnv } = buildSyncService({ persistFails: true });
    try {
      const result = await service.processCompletedEnvelope('env-row-1');

      expect(result.savedDocumentIds).toEqual([]);
      expect(savedSignedRows).toHaveLength(0);
      expect(envelopeStore.completedProcessedAt).toBeNull();
      expect(signedDocumentNotification.notifyDocumentSigned).not.toHaveBeenCalled();
    } finally {
      restoreEnv();
    }
  });

  it('calls the signed-document notification once persistence succeeds, with the document name, formCode, envelope id, and completion time', async () => {
    const original = makeOriginalDoc({ id: 'doc-1', title: 'Purchase Agreement', formCode: 'RPA', transactionId: 'tx-1' });
    const { service, signedDocumentNotification, restoreEnv } = buildSyncService({ docs: [original] });
    try {
      await service.processCompletedEnvelope('env-row-1');

      expect(signedDocumentNotification.notifyDocumentSigned).toHaveBeenCalledWith(expect.objectContaining({
        transactionId: 'tx-1',
        documentName: 'Purchase Agreement',
        formCode: 'RPA',
        docusignEnvelopeId: 'envelope-abc',
        completedAt: new Date('2026-01-15T12:00:00.000Z'),
      }));
    } finally {
      restoreEnv();
    }
  });

  it('does not call the signed-document notification for a document skipped as an already-existing duplicate', async () => {
    const original = makeOriginalDoc({ id: 'doc-1' });
    const existingSigned = makeOriginalDoc({ id: 'doc-1-signed', status: DocumentStatus.SIGNED, previousVersionId: 'doc-1' });
    const { service, signedDocumentNotification, restoreEnv } = buildSyncService({ docs: [original, existingSigned] });
    try {
      await service.processCompletedEnvelope('env-row-1');
      expect(signedDocumentNotification.notifyDocumentSigned).not.toHaveBeenCalled();
    } finally {
      restoreEnv();
    }
  });

  it('a notification failure never rolls back or blocks the already-persisted signed document', async () => {
    const { service, savedSignedRows, envelopeStore, signedDocumentNotification, restoreEnv } = buildSyncService();
    signedDocumentNotification.notifyDocumentSigned.mockRejectedValue(new Error('Mailgun down'));
    try {
      const result = await service.processCompletedEnvelope('env-row-1');

      expect(result.savedDocumentIds).toEqual(['doc-1']);
      expect(savedSignedRows).toHaveLength(1);
      // Notification is fire-and-forget from inside processCompletedEnvelope's per-document
      // loop — a rejected promise there must not surface as an unhandled rejection or
      // affect the envelope's own completedProcessedAt claim.
      await new Promise((r) => setTimeout(r, 0));
      expect(envelopeStore.completedProcessedAt).not.toBeNull();
    } finally {
      restoreEnv();
    }
  });

  it('a signed VP document gets the "Signed Verification of Property" title/fileName override, not the generic "(Signed)" suffix', async () => {
    const original = makeOriginalDoc({ id: 'doc-1', title: 'Verification of Property', fileName: 'vp.pdf', formCode: 'VP', transactionId: 'tx-1' });
    const { service, savedSignedRows, restoreEnv } = buildSyncService({ docs: [original] });
    try {
      await service.processCompletedEnvelope('env-row-1');

      expect(savedSignedRows).toHaveLength(1);
      expect(savedSignedRows[0].title).toBe('Signed Verification of Property');
      expect(savedSignedRows[0].fileName).toBe('Signed Verification of Property.pdf');
    } finally {
      restoreEnv();
    }
  });

  it('a non-VP signed document keeps the generic "(Signed)" title suffix and derived fileName', async () => {
    const original = makeOriginalDoc({ id: 'doc-1', title: 'Purchase Agreement', fileName: 'rpa.pdf', formCode: 'RPA', transactionId: 'tx-1' });
    const { service, savedSignedRows, restoreEnv } = buildSyncService({ docs: [original] });
    try {
      await service.processCompletedEnvelope('env-row-1');

      expect(savedSignedRows).toHaveLength(1);
      expect(savedSignedRows[0].title).toBe('Purchase Agreement (Signed)');
      expect(savedSignedRows[0].fileName).not.toBe('Signed Verification of Property.pdf');
    } finally {
      restoreEnv();
    }
  });

  it('fires the signed-VP escrow notification only for a VP document, never for other form codes', async () => {
    const original = makeOriginalDoc({ id: 'doc-1', formCode: 'VP', transactionId: 'tx-1' });
    const { service, vpSignedEscrowNotification, txRepo, restoreEnv } = buildSyncService({ docs: [original] });
    try {
      await service.processCompletedEnvelope('env-row-1');
      await new Promise((r) => setTimeout(r, 0));

      expect(txRepo.findOne).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'tx-1' },
        relations: ['createdByAccount', 'createdByAccount.user'],
      }));
      expect(vpSignedEscrowNotification.notifyEscrowOfSignedVp).toHaveBeenCalledTimes(1);
      expect(vpSignedEscrowNotification.notifyEscrowOfSignedVp).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'tx-1' }),
        expect.any(String),
      );
    } finally {
      restoreEnv();
    }
  });

  it('does not fire the signed-VP escrow notification for a non-VP document', async () => {
    const original = makeOriginalDoc({ id: 'doc-1', formCode: 'RPA', transactionId: 'tx-1' });
    const { service, vpSignedEscrowNotification, restoreEnv } = buildSyncService({ docs: [original] });
    try {
      await service.processCompletedEnvelope('env-row-1');
      await new Promise((r) => setTimeout(r, 0));
      expect(vpSignedEscrowNotification.notifyEscrowOfSignedVp).not.toHaveBeenCalled();
    } finally {
      restoreEnv();
    }
  });

  it('a signed-VP escrow notification failure never rolls back or blocks the already-persisted signed document', async () => {
    const original = makeOriginalDoc({ id: 'doc-1', formCode: 'VP', transactionId: 'tx-1' });
    const { service, savedSignedRows, envelopeStore, vpSignedEscrowNotification, restoreEnv } = buildSyncService({ docs: [original] });
    vpSignedEscrowNotification.notifyEscrowOfSignedVp.mockRejectedValue(new Error('Mailgun down'));
    try {
      const result = await service.processCompletedEnvelope('env-row-1');
      await new Promise((r) => setTimeout(r, 0));

      expect(result.savedDocumentIds).toEqual(['doc-1']);
      expect(savedSignedRows).toHaveLength(1);
      expect(envelopeStore.completedProcessedAt).not.toBeNull();
    } finally {
      restoreEnv();
    }
  });

  it('syncEnvelopeStatus routes through processCompletedEnvelope and still activates on a clean completion', async () => {
    const { service, savedSignedRows, signedDocumentNotification, restoreEnv } = buildSyncService();
    try {
      const updated = await service.syncEnvelopeStatus('env-row-1');
      expect(updated?.status).toBe(DocuSignEnvelopeStatus.COMPLETED);
      expect(savedSignedRows).toHaveLength(1);
      expect(signedDocumentNotification.notifyDocumentSigned).toHaveBeenCalledTimes(1);
    } finally {
      restoreEnv();
    }
  });

  it('syncEnvelopeStatus does not clobber a cleared completedProcessedAt back to a truthy value after a failed completion attempt', async () => {
    const { service, envelopeStore, restoreEnv } = buildSyncService({ combinedDownloadFails: true });
    try {
      await service.syncEnvelopeStatus('env-row-1');
      expect(envelopeStore.completedProcessedAt).toBeNull();
    } finally {
      restoreEnv();
    }
  });
});

/**
 * End-to-end: Seller Agent sends an RPA to the Buyer via DocuSign, the Buyer
 * completes signing, and the resulting signed document is fed into the same
 * `matchDocumentsToChecklist`/`buildDocumentValidation` functions the real
 * Buyer Agent checklist (TransactionFormTemplatesService.getChecklistStatus)
 * uses — proving the whole chain (webhook → S3 → buyer-side re-validation →
 * checklist match → validation dropdown) actually works together, not just
 * each piece in isolation.
 */
describe('Buyer-signed DocuSign document — full checklist integration', () => {
  const RPA_CHECKLIST_ITEM = [{ key: 'RPA', label: 'Residential Purchase Agreement', category: 'purchase_agreement' }];

  /** Mirrors TransactionDocumentsService.findActiveByTransactionForChecklist's own exclusion rule. */
  function activeDocsAfterSigning(documentRows: FakeDoc[], savedSignedRows: FakeDoc[]): FakeDoc[] {
    return [...documentRows, ...savedSignedRows].filter((d) => d.status !== DocumentStatus.SUPERSEDED && d.status !== 'rejected');
  }

  it('a passing signed document completes the Buyer Agent required-checklist item and shows its passed checks in the validation dropdown', async () => {
    const original = makeOriginalDoc({ id: 'doc-1', fileName: 'rpa.pdf', formCode: 'RPA', analysisStatus: 'completed' });
    const { service, documentRows, savedSignedRows, documentPipeline, restoreEnv } = buildSyncService({
      docs: [original],
      documentsListResponse: { envelopeDocuments: [{ documentId: '1', name: 'rpa.pdf', type: 'content' }] },
    });
    const passingChecks = [{ ruleId: 'buyer_signature', label: 'Buyer signature present', status: 'pass' }];
    documentPipeline.process.mockResolvedValue({
      pdfType: 'digital_acroform', extraction: {}, compliance: { checks: passingChecks, blockers: [] },
      detectedFormCode: 'RPA', detectedFormName: 'RPA', resolvedStage: 'closing', resolvedDocumentType: 'rpa',
    });

    try {
      const result = await service.processCompletedEnvelope('env-row-1');

      // Signed document persisted, retrievable, correct form code retained.
      expect(result.savedDocumentIds).toEqual(['doc-1']);
      expect(savedSignedRows).toHaveLength(1);
      const signedDoc = savedSignedRows[0] as unknown as FakeDoc;
      expect(signedDoc.status).toBe(DocumentStatus.SIGNED);
      expect(signedDoc.formCode).toBe('RPA');
      expect(signedDoc.previousVersionId).toBe('doc-1');

      // Buyer-side validation ran against the actual signed bytes.
      expect(documentPipeline.process).toHaveBeenCalledWith(Buffer.from('per-document-pdf-bytes'));

      // The real Buyer Agent checklist matcher picks the signed document up by formCode.
      const activeDocs = activeDocsAfterSigning(documentRows, savedSignedRows);
      const [item] = matchDocumentsToChecklist(RPA_CHECKLIST_ITEM, activeDocs as never, 'formCode');
      expect(item.status).toBe('submitted');
      expect(item.matchedDocument?.id).toBe(signedDoc.id);

      // The validation dropdown shows the passed check.
      const validation = buildDocumentValidation(signedDoc as never);
      expect(validation?.checks).toEqual([
        expect.objectContaining({ id: 'buyer_signature', label: 'Buyer signature present', status: 'passed' }),
      ]);
    } finally {
      restoreEnv();
    }
  });

  it('a failing signed document leaves the Buyer Agent checklist item incomplete and surfaces its blocker in the validation dropdown', async () => {
    const original = makeOriginalDoc({ id: 'doc-1', fileName: 'rpa.pdf', formCode: 'RPA', analysisStatus: 'completed' });
    const { service, documentRows, savedSignedRows, documentPipeline, restoreEnv } = buildSyncService({
      docs: [original],
      documentsListResponse: { envelopeDocuments: [{ documentId: '1', name: 'rpa.pdf', type: 'content' }] },
    });
    const failingChecks = [{ ruleId: 'buyer_agent_signature', label: 'Buyer Agent signature present', status: 'fail', severity: 'error' }];
    const blockers = [{ code: 'BLOCKER_BUYER_AGENT_SIGNATURE', message: 'Buyer Agent signature is missing', formCode: 'RPA' }];
    documentPipeline.process.mockResolvedValue({
      pdfType: 'digital_acroform', extraction: {}, compliance: { checks: failingChecks, blockers },
      detectedFormCode: 'RPA', detectedFormName: 'RPA', resolvedStage: 'closing', resolvedDocumentType: 'rpa',
    });

    try {
      const result = await service.processCompletedEnvelope('env-row-1');

      expect(result.savedDocumentIds).toEqual(['doc-1']);
      const signedDoc = savedSignedRows[0] as unknown as FakeDoc;
      expect(signedDoc.status).toBe(DocumentStatus.SIGNED);

      // The checklist item must NOT be marked complete — it has an active blocker.
      const activeDocs = activeDocsAfterSigning(documentRows, savedSignedRows);
      const [item] = matchDocumentsToChecklist(RPA_CHECKLIST_ITEM, activeDocs as never, 'formCode');
      expect(item.status).toBe('reupload_required');
      expect(item.status).not.toBe('submitted');

      // The failed check and its blocker are visible in the validation dropdown.
      const validation = buildDocumentValidation(signedDoc as never);
      expect(validation?.checks).toEqual([
        expect.objectContaining({ id: 'buyer_agent_signature', label: 'Buyer Agent signature present', status: 'failed', severity: 'error' }),
      ]);
    } finally {
      restoreEnv();
    }
  });
});
