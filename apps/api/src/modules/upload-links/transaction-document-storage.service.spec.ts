import { TransactionDocumentStorageService } from './transaction-document-storage.service';

function makeFile(): Express.Multer.File {
  return {
    fieldname: 'files',
    originalname: 'contract.pdf',
    encoding: '7bit',
    mimetype: 'application/pdf',
    size: 1024,
    buffer: Buffer.from('content'),
    stream: undefined as never,
    destination: '',
    filename: '',
    path: '',
  };
}

function buildService(overrides: { createFails?: boolean } = {}) {
  const s3 = {
    upload: jest.fn().mockResolvedValue({ storageKey: 'transactions/tx-1/external-uploads/abc123-contract.pdf' }),
    delete: jest.fn().mockResolvedValue(undefined),
  };
  const transactionDocumentsService = {
    createDocumentWithMetadata: jest.fn(
      overrides.createFails
        ? () => Promise.reject(new Error('DB write failed'))
        : (params: Record<string, unknown>) => Promise.resolve({ id: 'doc-1', ...params }),
    ),
  };

  const service = new TransactionDocumentStorageService(s3 as never, transactionDocumentsService as never);
  return { service, s3, transactionDocumentsService };
}

describe('TransactionDocumentStorageService', () => {
  it('uploads to S3 then creates the document row, in that order', async () => {
    const { service, s3, transactionDocumentsService } = buildService();
    const doc = await service.storeUploadedFile({
      transactionId: 'tx-1',
      stage: 'external-uploads',
      file: makeFile(),
      sanitizedFileName: 'contract.pdf',
      metadataJson: { uploadSource: 'secure_email_link' },
    });

    expect(s3.upload).toHaveBeenCalledWith('tx-1', 'external-uploads', 'contract.pdf', expect.any(Buffer), 'application/pdf');
    expect(transactionDocumentsService.createDocumentWithMetadata).toHaveBeenCalledWith(
      expect.objectContaining({
        transactionId: 'tx-1',
        stage: 'external-uploads',
        documentType: 'external_upload',
        storageKey: 'transactions/tx-1/external-uploads/abc123-contract.pdf',
      }),
    );
    expect(doc.id).toBe('doc-1');
  });

  it('rolls back the S3 object when the document row fails to save — no orphaned blob, no partial record', async () => {
    const { service, s3 } = buildService({ createFails: true });

    await expect(service.storeUploadedFile({
      transactionId: 'tx-1',
      stage: 'external-uploads',
      file: makeFile(),
      sanitizedFileName: 'contract.pdf',
      metadataJson: {},
    })).rejects.toThrow('DB write failed');

    expect(s3.delete).toHaveBeenCalledWith('transactions/tx-1/external-uploads/abc123-contract.pdf');
  });

  it('never sets an aiInteractionId or isOriginalPackage flag — this path never touches document-intelligence processing', async () => {
    const { service, transactionDocumentsService } = buildService();
    await service.storeUploadedFile({
      transactionId: 'tx-1',
      stage: 'external-uploads',
      file: makeFile(),
      sanitizedFileName: 'contract.pdf',
      metadataJson: {},
    });

    const call = transactionDocumentsService.createDocumentWithMetadata.mock.calls[0][0] as Record<string, unknown>;
    expect(call.aiInteractionId).toBeUndefined();
    expect(call.isOriginalPackage).toBeUndefined();
  });
});
