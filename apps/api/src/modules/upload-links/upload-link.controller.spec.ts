import { NotFoundException } from '@nestjs/common';
import { Readable } from 'stream';
import { UploadLinkController } from './upload-link.controller';

function makeRes() {
  return { set: jest.fn() } as never;
}

const TRANSACTION = { id: 'tx-1' };
const BUYER_LINK = { id: 'link-buyer', purpose: 'document_upload', transactionId: 'tx-1' };
const SELLER_LINK = { id: 'link-seller', purpose: 'seller_agent_document_upload', transactionId: 'tx-1' };
const ESCROW_LINK = { id: 'link-escrow', purpose: 'escrow_officer_document_upload', transactionId: 'tx-1' };
const BROKER_LINK = { id: 'link-broker', purpose: 'broker_document_upload', transactionId: 'tx-1' };

function buildController(opts: {
  link?: { id: string; purpose: string; transactionId: string };
  doc?: { id: string; transactionId: string; uploadLinkId: string | null; uploadLink: { purpose: string } | null; formCode: string | null; storageKey: string | null };
} = {}) {
  const link = opts.link ?? BUYER_LINK;
  const doc = opts.doc ?? {
    id: 'doc-1', transactionId: 'tx-1', uploadLinkId: link.id, uploadLink: { purpose: link.purpose }, formCode: null, storageKey: 'transactions/tx-1/file.pdf',
  };

  const uploadLinkService = { validateUploadToken: jest.fn().mockResolvedValue({ link, transaction: TRANSACTION }) };
  const transactionDocumentsService = { findOneWithUploadLink: jest.fn().mockResolvedValue(doc) };
  const s3 = { getObject: jest.fn().mockResolvedValue({ stream: Readable.from(['data']), contentType: 'application/pdf', contentLength: 4, fileName: 'file.pdf' }) };

  const controller = new UploadLinkController(
    uploadLinkService as never,
    {} as never, // externalUploadService
    {} as never, // externalTransactionInformationService
    {} as never, // sellerAgentDocusignService
    {} as never, // sellerAgentDocumentDocusignService
    {} as never, // checklistComposition
    {} as never, // transactionCompletionService
    {} as never, // accountsService
    transactionDocumentsService as never,
    s3 as never,
    {} as never, // escrowOnboardingService
    {} as never, // brokerOnboardingService
    {} as never, // cdaGenerationService
    {} as never, // cdaNotificationService
    {} as never, // signedCdaUploadService
  );

  return { controller, uploadLinkService, transactionDocumentsService, s3 };
}

describe('UploadLinkController.streamDocumentFile — per-link visibility enforcement', () => {
  it('serves a document uploaded through the requesting link itself', async () => {
    const { controller, s3 } = buildController({ link: BUYER_LINK });
    const result = await controller.streamDocumentFile('buyer-token', 'doc-1', makeRes());
    expect(result).toBeDefined();
    expect(s3.getObject).toHaveBeenCalledWith('transactions/tx-1/file.pdf');
  });

  it('serves an internal (uploadLinkId null) document to the Buyer Agent link', async () => {
    const { controller } = buildController({
      link: BUYER_LINK,
      doc: { id: 'doc-1', transactionId: 'tx-1', uploadLinkId: null, uploadLink: null, formCode: null, storageKey: 'transactions/tx-1/internal.pdf' },
    });
    const result = await controller.streamDocumentFile('buyer-token', 'doc-1', makeRes());
    expect(result).toBeDefined();
  });

  it('404s an internal document requested through the Seller Agent link', async () => {
    const { controller } = buildController({
      link: SELLER_LINK,
      doc: { id: 'doc-1', transactionId: 'tx-1', uploadLinkId: null, uploadLink: null, formCode: null, storageKey: 'transactions/tx-1/internal.pdf' },
    });
    await expect(controller.streamDocumentFile('seller-token', 'doc-1', makeRes())).rejects.toBeInstanceOf(NotFoundException);
  });

  it('404s a Buyer Agent document requested through the Seller Agent link — even with a valid token for a different, real link', async () => {
    const { controller } = buildController({
      link: SELLER_LINK,
      doc: { id: 'doc-1', transactionId: 'tx-1', uploadLinkId: BUYER_LINK.id, uploadLink: { purpose: BUYER_LINK.purpose }, formCode: 'TDS', storageKey: 'transactions/tx-1/buyer.pdf' },
    });
    await expect(controller.streamDocumentFile('seller-token', 'doc-1', makeRes())).rejects.toBeInstanceOf(NotFoundException);
  });

  it('404s a Seller Agent document requested through the Buyer Agent link — cannot view an unauthorized document by guessing its id', async () => {
    const { controller } = buildController({
      link: BUYER_LINK,
      doc: { id: 'doc-1', transactionId: 'tx-1', uploadLinkId: SELLER_LINK.id, uploadLink: { purpose: SELLER_LINK.purpose }, formCode: 'TDS', storageKey: 'transactions/tx-1/seller.pdf' },
    });
    await expect(controller.streamDocumentFile('buyer-token', 'doc-1', makeRes())).rejects.toBeInstanceOf(NotFoundException);
  });

  it('serves the transaction RPA through the Escrow link even though it was uploaded via the Buyer Agent link', async () => {
    const { controller } = buildController({
      link: ESCROW_LINK,
      doc: { id: 'rpa-1', transactionId: 'tx-1', uploadLinkId: BUYER_LINK.id, uploadLink: { purpose: BUYER_LINK.purpose }, formCode: 'RPA', storageKey: 'transactions/tx-1/rpa.pdf' },
    });
    const result = await controller.streamDocumentFile('escrow-token', 'rpa-1', makeRes());
    expect(result).toBeDefined();
  });

  it('404s a non-RPA Buyer Agent document requested through the Escrow link', async () => {
    const { controller } = buildController({
      link: ESCROW_LINK,
      doc: { id: 'doc-1', transactionId: 'tx-1', uploadLinkId: BUYER_LINK.id, uploadLink: { purpose: BUYER_LINK.purpose }, formCode: 'TDS', storageKey: 'transactions/tx-1/buyer.pdf' },
    });
    await expect(controller.streamDocumentFile('escrow-token', 'doc-1', makeRes())).rejects.toBeInstanceOf(NotFoundException);
  });

  it('404s a document that belongs to a different transaction, even if the audience/formCode rule would otherwise allow it', async () => {
    const { controller } = buildController({
      link: ESCROW_LINK,
      doc: { id: 'rpa-1', transactionId: 'tx-OTHER', uploadLinkId: BUYER_LINK.id, uploadLink: { purpose: BUYER_LINK.purpose }, formCode: 'RPA', storageKey: 'transactions/tx-OTHER/rpa.pdf' },
    });
    await expect(controller.streamDocumentFile('escrow-token', 'rpa-1', makeRes())).rejects.toBeInstanceOf(NotFoundException);
  });

  it('404s any document requested through a Broker link — the broker page has zero document access', async () => {
    const { controller, s3 } = buildController({
      link: BROKER_LINK,
      doc: { id: 'rpa-1', transactionId: 'tx-1', uploadLinkId: BUYER_LINK.id, uploadLink: { purpose: BUYER_LINK.purpose }, formCode: 'RPA', storageKey: 'transactions/tx-1/rpa.pdf' },
    });
    await expect(controller.streamDocumentFile('broker-token', 'rpa-1', makeRes())).rejects.toBeInstanceOf(NotFoundException);
    expect(s3.getObject).not.toHaveBeenCalled();
  });

  it('never touches storage once authorization fails', async () => {
    const { controller, s3 } = buildController({
      link: SELLER_LINK,
      doc: { id: 'doc-1', transactionId: 'tx-1', uploadLinkId: BUYER_LINK.id, uploadLink: { purpose: BUYER_LINK.purpose }, formCode: 'TDS', storageKey: 'transactions/tx-1/buyer.pdf' },
    });
    await expect(controller.streamDocumentFile('seller-token', 'doc-1', makeRes())).rejects.toThrow();
    expect(s3.getObject).not.toHaveBeenCalled();
  });
});

const SAVED_DTO = {
  lender: { lenderName: null, lenderEmail: null },
  escrow: { escrowContactName: null, escrowEmail: null },
  hoa: { hasHoa: null },
  buyerSide: {
    brokerageName: null, brokerFullName: null, brokerEmail: null, buyerAgentPaymentAddress: null, clientCredits: null,
    buyerCommissionType: null, buyerCommissionValue: null, grossCommission: null,
  },
  broker: {
    finalSalesPrice: null, grossCommission: null, brokerPaymentAddress: null,
    brokerCommissionType: null, brokerCommissionValue: null, brokerCommissionAmount: null, buyerAgentCommissionAmount: null,
  },
};

function buildSaveController(opts: { link?: { id: string; purpose: string; transactionId: string } } = {}) {
  const link = opts.link ?? BUYER_LINK;
  const uploadLinkService = { validateUploadToken: jest.fn().mockResolvedValue({ link, transaction: TRANSACTION }) };
  const externalTransactionInformationService = { saveTransactionInformation: jest.fn().mockResolvedValue(SAVED_DTO) };
  const escrowOnboardingService = { sendWelcomeEmail: jest.fn().mockResolvedValue(null) };
  const brokerOnboardingService = { sendWelcomeEmail: jest.fn().mockResolvedValue(null) };
  const cdaGenerationService = { maybeGenerateCda: jest.fn().mockResolvedValue(null) };
  const cdaNotificationService = { notifyIfCdaReady: jest.fn().mockResolvedValue(undefined) };

  const controller = new UploadLinkController(
    uploadLinkService as never,
    {} as never, // externalUploadService
    externalTransactionInformationService as never,
    {} as never, // sellerAgentDocusignService
    {} as never, // sellerAgentDocumentDocusignService
    {} as never, // checklistComposition
    {} as never, // transactionCompletionService
    {} as never, // accountsService
    {} as never, // transactionDocumentsService
    {} as never, // s3
    escrowOnboardingService as never,
    brokerOnboardingService as never,
    cdaGenerationService as never,
    cdaNotificationService as never,
    {} as never, // signedCdaUploadService
  );

  return { controller, uploadLinkService, externalTransactionInformationService, cdaGenerationService, cdaNotificationService };
}

describe('UploadLinkController.saveTransactionInfo — CDA auto-trigger', () => {
  it('attempts CDA generation when the Buyer Agent saves their commission section', async () => {
    const { controller, cdaGenerationService } = buildSaveController({ link: BUYER_LINK });
    await controller.saveTransactionInfo('buyer-token', { buyerSide: { buyerCommissionType: 'percentage', buyerCommissionValue: 3 } });
    expect(cdaGenerationService.maybeGenerateCda).toHaveBeenCalledWith(TRANSACTION);
  });

  it('attempts CDA generation when the Broker saves their commission split', async () => {
    const { controller, cdaGenerationService } = buildSaveController({ link: BROKER_LINK });
    await controller.saveTransactionInfo('broker-token', { broker: { brokerCommissionType: 'percentage', brokerCommissionValue: 10 } });
    expect(cdaGenerationService.maybeGenerateCda).toHaveBeenCalledWith(TRANSACTION);
  });

  it('does not attempt CDA generation for an unrelated Buyer Agent field save (e.g. lender info only)', async () => {
    const { controller, cdaGenerationService } = buildSaveController({ link: BUYER_LINK });
    await controller.saveTransactionInfo('buyer-token', { lender: { lenderName: 'John Smith' } });
    expect(cdaGenerationService.maybeGenerateCda).not.toHaveBeenCalled();
  });

  it('does not attempt CDA generation from the Seller Agent link', async () => {
    const { controller, cdaGenerationService } = buildSaveController({ link: SELLER_LINK });
    await controller.saveTransactionInfo('seller-token', { escrow: { escrowContactName: 'Pat Escrow' } });
    expect(cdaGenerationService.maybeGenerateCda).not.toHaveBeenCalled();
  });

  it('still returns the save result even when CDA generation throws — non-fatal', async () => {
    const { controller, cdaGenerationService } = buildSaveController({ link: BUYER_LINK });
    cdaGenerationService.maybeGenerateCda.mockRejectedValueOnce(new Error('boom'));
    const result = await controller.saveTransactionInfo('buyer-token', { buyerSide: { buyerCommissionType: 'percentage', buyerCommissionValue: 3 } });
    expect(result.saved).toBe(SAVED_DTO);
  });

  it('attempts a CDA-ready notification whenever it attempts CDA generation', async () => {
    const { controller, cdaNotificationService } = buildSaveController({ link: BUYER_LINK });
    await controller.saveTransactionInfo('buyer-token', { buyerSide: { buyerCommissionType: 'percentage', buyerCommissionValue: 3 } });
    expect(cdaNotificationService.notifyIfCdaReady).toHaveBeenCalledWith(TRANSACTION);
  });

  it('never attempts a CDA-ready notification for an unrelated field save', async () => {
    const { controller, cdaNotificationService } = buildSaveController({ link: BUYER_LINK });
    await controller.saveTransactionInfo('buyer-token', { lender: { lenderName: 'John Smith' } });
    expect(cdaNotificationService.notifyIfCdaReady).not.toHaveBeenCalled();
  });

  it('still returns the save result even when the CDA-ready notification throws — non-fatal', async () => {
    const { controller, cdaNotificationService } = buildSaveController({ link: BUYER_LINK });
    cdaNotificationService.notifyIfCdaReady.mockRejectedValueOnce(new Error('boom'));
    const result = await controller.saveTransactionInfo('buyer-token', { buyerSide: { buyerCommissionType: 'percentage', buyerCommissionValue: 3 } });
    expect(result.saved).toBe(SAVED_DTO);
  });
});

describe('UploadLinkController.getCda', () => {
  function buildCdaController(opts: { link?: { id: string; purpose: string; transactionId: string }; cda?: unknown } = {}) {
    const link = opts.link ?? BUYER_LINK;
    const uploadLinkService = { validateUploadToken: jest.fn().mockResolvedValue({ link, transaction: TRANSACTION }) };
    const cdaGenerationService = { getCdaForLink: jest.fn().mockResolvedValue(opts.cda !== undefined ? opts.cda : { id: 'cda-1', fileName: 'CDA.pdf', generatedAt: new Date(), versionNo: 1, viewUrl: '/api/v1/upload-links/token/buyer-token/documents/cda-1/file' }) };

    const controller = new UploadLinkController(
      uploadLinkService as never, // uploadLinkService
      {} as never, // externalUploadService
      {} as never, // externalTransactionInformationService
      {} as never, // sellerAgentDocusignService
      {} as never, // sellerAgentDocumentDocusignService
      {} as never, // checklistComposition
      {} as never, // transactionCompletionService
      {} as never, // accountsService
      {} as never, // transactionDocumentsService
      {} as never, // s3
      {} as never, // escrowOnboardingService
      {} as never, // brokerOnboardingService
      cdaGenerationService as never, // cdaGenerationService
      {} as never, // cdaNotificationService
      {} as never, // signedCdaUploadService
    );

    return { controller, uploadLinkService, cdaGenerationService };
  }

  it('returns the CDA when one exists and this link can see it', async () => {
    const { controller, cdaGenerationService } = buildCdaController({ link: BUYER_LINK });
    const result = await controller.getCda('buyer-token');
    expect(result.cda).not.toBeNull();
    expect(cdaGenerationService.getCdaForLink).toHaveBeenCalledWith('buyer-token', BUYER_LINK, TRANSACTION);
  });

  it('returns { cda: null } rather than erroring when there is no CDA yet', async () => {
    const { controller } = buildCdaController({ cda: null });
    const result = await controller.getCda('buyer-token');
    expect(result).toEqual({ cda: null });
  });
});

describe('UploadLinkController.getSignedCda', () => {
  function buildSignedCdaController(opts: { link?: { id: string; purpose: string; transactionId: string }; signedCda?: unknown } = {}) {
    const link = opts.link ?? ESCROW_LINK;
    const uploadLinkService = { validateUploadToken: jest.fn().mockResolvedValue({ link, transaction: TRANSACTION }) };
    const cdaGenerationService = { getSignedCdaForLink: jest.fn().mockResolvedValue(opts.signedCda !== undefined ? opts.signedCda : { id: 'signed-cda-1', fileName: 'signed-cda.pdf', generatedAt: new Date(), versionNo: 1, viewUrl: '/api/v1/upload-links/token/escrow-token/documents/signed-cda-1/file' }) };

    const controller = new UploadLinkController(
      uploadLinkService as never, // uploadLinkService
      {} as never, // externalUploadService
      {} as never, // externalTransactionInformationService
      {} as never, // sellerAgentDocusignService
      {} as never, // sellerAgentDocumentDocusignService
      {} as never, // checklistComposition
      {} as never, // transactionCompletionService
      {} as never, // accountsService
      {} as never, // transactionDocumentsService
      {} as never, // s3
      {} as never, // escrowOnboardingService
      {} as never, // brokerOnboardingService
      cdaGenerationService as never, // cdaGenerationService
      {} as never, // cdaNotificationService
      {} as never, // signedCdaUploadService
    );

    return { controller, uploadLinkService, cdaGenerationService };
  }

  it('returns the signed CDA when one exists and this link can see it', async () => {
    const { controller, cdaGenerationService } = buildSignedCdaController({ link: ESCROW_LINK });
    const result = await controller.getSignedCda('escrow-token');
    expect(result.signedCda).not.toBeNull();
    expect(cdaGenerationService.getSignedCdaForLink).toHaveBeenCalledWith('escrow-token', ESCROW_LINK, TRANSACTION);
  });

  it('returns { signedCda: null } rather than erroring when none has been uploaded yet', async () => {
    const { controller } = buildSignedCdaController({ signedCda: null });
    const result = await controller.getSignedCda('escrow-token');
    expect(result).toEqual({ signedCda: null });
  });
});

describe('UploadLinkController.uploadSignedCda', () => {
  const FILE = { fieldname: 'file', originalname: 'signed-cda.pdf', mimetype: 'application/pdf', size: 1024, buffer: Buffer.from('%PDF-fake') } as Express.Multer.File;

  function buildUploadSignedCdaController(opts: { uploadThrows?: Error; notifyThrows?: Error } = {}) {
    const uploadLinkService = { validateUploadToken: jest.fn().mockResolvedValue({ link: BROKER_LINK, transaction: TRANSACTION }) };
    const signedCdaUploadService = {
      uploadSignedCda: opts.uploadThrows
        ? jest.fn().mockRejectedValue(opts.uploadThrows)
        : jest.fn().mockResolvedValue({ id: 'signed-cda-doc-1' }),
    };
    const cdaNotificationService = {
      notifyEscrowOfSignedCda: opts.notifyThrows
        ? jest.fn().mockRejectedValue(opts.notifyThrows)
        : jest.fn().mockResolvedValue(undefined),
    };

    const controller = new UploadLinkController(
      uploadLinkService as never, // uploadLinkService
      {} as never, // externalUploadService
      {} as never, // externalTransactionInformationService
      {} as never, // sellerAgentDocusignService
      {} as never, // sellerAgentDocumentDocusignService
      {} as never, // checklistComposition
      {} as never, // transactionCompletionService
      {} as never, // accountsService
      {} as never, // transactionDocumentsService
      {} as never, // s3
      {} as never, // escrowOnboardingService
      {} as never, // brokerOnboardingService
      {} as never, // cdaGenerationService
      cdaNotificationService as never, // cdaNotificationService
      signedCdaUploadService as never, // signedCdaUploadService
    );

    return { controller, uploadLinkService, signedCdaUploadService, cdaNotificationService };
  }

  it('delegates to SignedCdaUploadService and then notifies escrow', async () => {
    const { controller, signedCdaUploadService, cdaNotificationService } = buildUploadSignedCdaController();
    const result = await controller.uploadSignedCda('broker-token', FILE);
    expect(signedCdaUploadService.uploadSignedCda).toHaveBeenCalledWith('broker-token', FILE);
    expect(cdaNotificationService.notifyEscrowOfSignedCda).toHaveBeenCalledWith(TRANSACTION);
    expect(result).toEqual({ documentId: 'signed-cda-doc-1' });
  });

  it('still returns success when the escrow notification fails — a non-fatal side effect', async () => {
    const { controller, signedCdaUploadService } = buildUploadSignedCdaController({ notifyThrows: new Error('mailgun down') });
    const result = await controller.uploadSignedCda('broker-token', FILE);
    expect(signedCdaUploadService.uploadSignedCda).toHaveBeenCalled();
    expect(result).toEqual({ documentId: 'signed-cda-doc-1' });
  });

  it('propagates a failure from the upload itself, and never attempts the notification', async () => {
    const { controller, cdaNotificationService } = buildUploadSignedCdaController({ uploadThrows: new Error('invalid file') });
    await expect(controller.uploadSignedCda('broker-token', FILE)).rejects.toThrow('invalid file');
    expect(cdaNotificationService.notifyEscrowOfSignedCda).not.toHaveBeenCalled();
  });
});

describe('UploadLinkController.getDocumentChecklist', () => {
  const CHECKLIST = { items: [], optionalItems: [], unmatchedDocuments: [], requiredCount: 2, submittedCount: 1, allRequiredSubmitted: false };

  function buildChecklistController(opts: { link?: { id: string; purpose: string; transactionId: string }; checklist?: unknown; completed?: boolean } = {}) {
    const link = opts.link ?? BUYER_LINK;
    const uploadLinkService = { validateUploadToken: jest.fn().mockResolvedValue({ link, transaction: TRANSACTION }) };
    const checklistComposition = { composeForLink: jest.fn().mockResolvedValue(opts.checklist ?? CHECKLIST) };
    const transactionCompletionService = { isTransactionCompleted: jest.fn().mockResolvedValue(opts.completed ?? false) };

    const controller = new UploadLinkController(
      uploadLinkService as never, // uploadLinkService
      {} as never, // externalUploadService
      {} as never, // externalTransactionInformationService
      {} as never, // sellerAgentDocusignService
      {} as never, // sellerAgentDocumentDocusignService
      checklistComposition as never, // checklistComposition
      transactionCompletionService as never, // transactionCompletionService
      {} as never, // accountsService
      {} as never, // transactionDocumentsService
      {} as never, // s3
      {} as never, // escrowOnboardingService
      {} as never, // brokerOnboardingService
      {} as never, // cdaGenerationService
      {} as never, // cdaNotificationService
      {} as never, // signedCdaUploadService
    );

    return { controller, uploadLinkService, checklistComposition, transactionCompletionService };
  }

  it('carries every existing checklist field through unchanged, plus the new transactionCompleted flag', async () => {
    const { controller, checklistComposition } = buildChecklistController({ completed: false });
    const result = await controller.getDocumentChecklist('buyer-token');
    expect(result).toEqual({ ...CHECKLIST, transactionCompleted: false });
    expect(checklistComposition.composeForLink).toHaveBeenCalledWith(BUYER_LINK, TRANSACTION);
  });

  it('reports transactionCompleted: true once TransactionCompletionService says the transaction is done', async () => {
    const { controller, transactionCompletionService } = buildChecklistController({ completed: true });
    const result = await controller.getDocumentChecklist('buyer-token');
    expect(result.transactionCompleted).toBe(true);
    expect(transactionCompletionService.isTransactionCompleted).toHaveBeenCalledWith(TRANSACTION);
  });

  it('is computed the same way regardless of which purpose\'s link requested it', async () => {
    const { controller, transactionCompletionService } = buildChecklistController({ link: ESCROW_LINK, completed: true });
    const result = await controller.getDocumentChecklist('escrow-token');
    expect(result.transactionCompleted).toBe(true);
    expect(transactionCompletionService.isTransactionCompleted).toHaveBeenCalledWith(TRANSACTION);
  });
});

describe('UploadLinkController.getSellerAgentStatus', () => {
  function buildController(opts: { link?: { id: string; purpose: string; transactionId: string }; summary?: { allRequiredSubmitted: boolean } } = {}) {
    const link = opts.link ?? BUYER_LINK;
    const uploadLinkService = { validateUploadToken: jest.fn().mockResolvedValue({ link, transaction: TRANSACTION }) };
    const checklistComposition = { getSellerAgentStatusSummary: jest.fn().mockResolvedValue(opts.summary ?? { allRequiredSubmitted: false }) };

    const controller = new UploadLinkController(
      uploadLinkService as never, // uploadLinkService
      {} as never, // externalUploadService
      {} as never, // externalTransactionInformationService
      {} as never, // sellerAgentDocusignService
      {} as never, // sellerAgentDocumentDocusignService
      checklistComposition as never, // checklistComposition
      {} as never, // transactionCompletionService
      {} as never, // accountsService
      {} as never, // transactionDocumentsService
      {} as never, // s3
      {} as never, // escrowOnboardingService
      {} as never, // brokerOnboardingService
      {} as never, // cdaGenerationService
      {} as never, // cdaNotificationService
      {} as never, // signedCdaUploadService
    );

    return { controller, uploadLinkService, checklistComposition };
  }

  it('returns the seller-side summary from ChecklistCompositionService for the token\'s own transaction, regardless of which purpose the caller\'s own link is', async () => {
    const { controller, checklistComposition } = buildController({ link: BUYER_LINK, summary: { allRequiredSubmitted: false } });
    const result = await controller.getSellerAgentStatus('buyer-token');
    expect(result).toEqual({ allRequiredSubmitted: false });
    expect(checklistComposition.getSellerAgentStatusSummary).toHaveBeenCalledWith(TRANSACTION);
  });

  it('reflects allRequiredSubmitted: true once the summary reports it', async () => {
    const { controller } = buildController({ summary: { allRequiredSubmitted: true } });
    const result = await controller.getSellerAgentStatus('buyer-token');
    expect(result).toEqual({ allRequiredSubmitted: true });
  });
});
