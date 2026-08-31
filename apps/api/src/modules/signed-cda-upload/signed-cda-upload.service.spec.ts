import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SignedCdaUploadService } from './signed-cda-upload.service';

const TX_ID = 'tx-1';
const TRANSACTION = { id: TX_ID, transactionNumber: 'TXN-2026-0001' };
const BROKER_LINK = { id: 'link-broker-1', purpose: 'broker_document_upload', transactionId: TX_ID, recipientName: 'Bobby Broker', recipientEmail: 'bobby@brokerfirm.com' };
const BUYER_AGENT_LINK = { id: 'link-ba-1', purpose: 'document_upload', transactionId: TX_ID, recipientName: 'Alice Agent', recipientEmail: 'alice@brokerage.com' };

const CDA_DOC = { id: 'cda-doc-1', documentType: 'cda' };
const SIGNED_CDA_DOC = { id: 'signed-cda-doc-old', documentType: 'signed_cda' };

function makeFile(overrides: Partial<Express.Multer.File> = {}): Express.Multer.File {
  return {
    fieldname: 'file',
    originalname: 'signed-cda.pdf',
    encoding: '7bit',
    mimetype: 'application/pdf',
    size: 1024,
    buffer: Buffer.from('%PDF-fake'),
    ...overrides,
  } as Express.Multer.File;
}

function buildService(overrides: {
  link?: Record<string, unknown>;
  activeDocs?: Record<string, unknown>[];
} = {}) {
  const link = overrides.link ?? BROKER_LINK;
  const uploadLinkService = { validateUploadToken: jest.fn().mockResolvedValue({ link, transaction: TRANSACTION }) };
  const fileValidationService = { validateFile: jest.fn().mockReturnValue({ valid: true, sanitizedFileName: 'signed-cda.pdf' }) };
  const documentsService = {
    findActiveByTransaction: jest.fn().mockResolvedValue(overrides.activeDocs ?? [CDA_DOC]),
    createDocumentWithMetadata: jest.fn(async (params: Record<string, unknown>) => ({ id: 'signed-cda-doc-new', ...params })),
  };
  const s3 = { upload: jest.fn().mockResolvedValue({ storageKey: `transactions/${TX_ID}/commission/signed-cda.pdf` }) };
  const auditLogService = { log: jest.fn().mockResolvedValue(undefined) };

  const service = new SignedCdaUploadService(
    uploadLinkService as never,
    fileValidationService as never,
    documentsService as never,
    s3 as never,
    auditLogService as never,
  );

  return { service, uploadLinkService, fileValidationService, documentsService, s3, auditLogService };
}

describe('SignedCdaUploadService.uploadSignedCda', () => {
  it('stores the signed CDA linked to the generated CDA, and audits the upload', async () => {
    const { service, documentsService, s3, auditLogService } = buildService();

    const result = await service.uploadSignedCda('broker-token', makeFile());

    expect(s3.upload).toHaveBeenCalledWith(TX_ID, 'commission', 'signed-cda.pdf', expect.any(Buffer), 'application/pdf');
    expect(documentsService.createDocumentWithMetadata).toHaveBeenCalledWith(expect.objectContaining({
      transactionId: TX_ID,
      documentType: 'signed_cda',
      sourceDocumentId: 'cda-doc-1',
      uploadLinkId: 'link-broker-1',
      previousVersionId: null,
    }));
    expect(result.id).toBe('signed-cda-doc-new');
    expect(auditLogService.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'signed_cda_uploaded' }));
  });

  it('rejects a non-Broker link with the generic invalid-link message', async () => {
    const { service } = buildService({ link: BUYER_AGENT_LINK });
    await expect(service.uploadSignedCda('buyer-token', makeFile())).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects when the CDA has not been generated yet', async () => {
    const { service, documentsService } = buildService({ activeDocs: [] });
    await expect(service.uploadSignedCda('broker-token', makeFile())).rejects.toBeInstanceOf(BadRequestException);
    expect(documentsService.createDocumentWithMetadata).not.toHaveBeenCalled();
  });

  it('rejects an invalid file without ever touching storage', async () => {
    const { service, fileValidationService, s3 } = buildService();
    fileValidationService.validateFile.mockReturnValue({ valid: false, reason: 'File exceeds the 25MB size limit.' });

    await expect(service.uploadSignedCda('broker-token', makeFile())).rejects.toBeInstanceOf(BadRequestException);
    expect(s3.upload).not.toHaveBeenCalled();
  });

  it('supersedes a prior signed-CDA upload — versionNo chain, not two active rows', async () => {
    const { service, documentsService } = buildService({ activeDocs: [CDA_DOC, SIGNED_CDA_DOC] });

    await service.uploadSignedCda('broker-token', makeFile());

    expect(documentsService.createDocumentWithMetadata).toHaveBeenCalledWith(expect.objectContaining({
      previousVersionId: 'signed-cda-doc-old',
    }));
  });
});
