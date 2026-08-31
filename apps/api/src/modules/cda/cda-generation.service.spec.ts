import { CdaGenerationService } from './cda-generation.service';
import { TransactionSide } from '../transactions/entities/transaction.entity';
import { PartyRole } from '../transaction-parties/entities/transaction-party.entity';

const generateCdaMock = jest.fn((_input: Record<string, unknown>) => Promise.resolve(Buffer.from('%PDF-fake')));
jest.mock('@tc/document-intelligence', () => ({
  generateCda: (input: Record<string, unknown>) => generateCdaMock(input),
}));

function buildService(overrides: {
  buyerSide?: Record<string, unknown> | null;
  broker?: Record<string, unknown> | null;
  escrow?: Record<string, unknown> | null;
  buyerAgentParty?: Record<string, unknown> | null;
  existingDocs?: Array<Record<string, unknown>>;
} = {}) {
  const partiesRepo = { findOne: jest.fn().mockResolvedValue(overrides.buyerAgentParty !== undefined ? overrides.buyerAgentParty : { displayName: 'Alice Agent' }) };
  const buyerSideInformationService = { findByTransaction: jest.fn().mockResolvedValue(overrides.buyerSide !== undefined ? overrides.buyerSide : { grossCommission: 30000, brokerageName: 'Sunset Realty', brokerFullName: 'Bob Broker', buyerAgentPaymentAddress: '123 Agent St', clientCredits: 500 }) };
  const brokerInformationService = { findByTransaction: jest.fn().mockResolvedValue(overrides.broker !== undefined ? overrides.broker : { brokerCommissionAmount: 3000, brokerPaymentAddress: '456 Broker Blvd' }) };
  const escrowInformationService = { findByTransaction: jest.fn().mockResolvedValue(overrides.escrow !== undefined ? overrides.escrow : { escrowNumber: 'ESC-123' }) };
  const transactionDocumentsService = {
    findActiveByTransaction: jest.fn().mockResolvedValue(overrides.existingDocs ?? []),
    createDocumentWithMetadata: jest.fn(async (params: Record<string, unknown>) => ({ id: 'cda-doc-1', ...params })),
  };
  const s3 = { upload: jest.fn().mockResolvedValue({ storageKey: 'transactions/tx-1/commission/CDA-Commission-Disbursement-Authorization.pdf' }) };
  const auditLogService = { log: jest.fn().mockResolvedValue(undefined) };

  const service = new CdaGenerationService(
    partiesRepo as never,
    buyerSideInformationService as never,
    brokerInformationService as never,
    escrowInformationService as never,
    transactionDocumentsService as never,
    s3 as never,
    auditLogService as never,
  );

  return { service, partiesRepo, buyerSideInformationService, brokerInformationService, escrowInformationService, transactionDocumentsService, s3, auditLogService };
}

const BUYER_SIDE_TX = { id: 'tx-1', transactionNumber: 'TXN-1', side: TransactionSide.BUYER_SIDE, contractPrice: 1200000, propertyAddressLine1: '16019 Lantana Ave', propertyCity: 'Chino', propertyState: 'CA', closeOfEscrowAt: new Date('2026-09-01') };
const SELLER_SIDE_TX = { ...BUYER_SIDE_TX, side: TransactionSide.SELLER_SIDE };

describe('CdaGenerationService.maybeGenerateCda', () => {
  beforeEach(() => generateCdaMock.mockClear());

  it('generates a CDA once both the Buyer Agent and Broker commission sections are complete', async () => {
    const { service, transactionDocumentsService, auditLogService } = buildService();

    const result = await service.maybeGenerateCda(BUYER_SIDE_TX as never);

    expect(result).not.toBeNull();
    expect(generateCdaMock).toHaveBeenCalledTimes(1);
    expect(transactionDocumentsService.createDocumentWithMetadata).toHaveBeenCalledWith(expect.objectContaining({
      transactionId: 'tx-1', documentType: 'cda', previousVersionId: null,
    }));
    expect(auditLogService.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'cda_generated' }));
  });

  it('maps buyer-side fields into the CdaGenerationInput correctly', async () => {
    const { service } = buildService();

    await service.maybeGenerateCda(BUYER_SIDE_TX as never);

    expect(generateCdaMock).toHaveBeenCalledWith(expect.objectContaining({
      brokerage: 'Sunset Realty',
      brokerName: 'Bob Broker',
      agent: 'Alice Agent',
      escrowNumber: 'ESC-123',
      salePrice: 1200000,
      clientCredits: 500,
      brokerageAddress: '456 Broker Blvd',
      agentAddress: '123 Agent St',
      brokerCommissionAmount: 3000,
      sideRepresented: 'Buyer',
      propertyAddress: '16019 Lantana Ave, Chino, CA',
    }));
  });

  it('computes agentCommissionAmount as grossCommission - brokerCommissionAmount - mytcAppCommissionAmount', async () => {
    const { service } = buildService({
      buyerSide: { grossCommission: 30000, brokerageName: null, brokerFullName: null, buyerAgentPaymentAddress: null, clientCredits: null },
      broker: { brokerCommissionAmount: 5000, brokerPaymentAddress: null },
    });

    await service.maybeGenerateCda(BUYER_SIDE_TX as never);

    const input = generateCdaMock.mock.calls[0][0] as { agentCommissionAmount: number; mytcAppCommissionAmount: number };
    expect(input.mytcAppCommissionAmount).toBe(0); // CDA_CONFIG default
    expect(input.agentCommissionAmount).toBe(25000); // 30000 - 5000 - 0
  });

  it('returns null for a seller-side transaction — buyer-side only for now', async () => {
    const { service, transactionDocumentsService } = buildService();

    const result = await service.maybeGenerateCda(SELLER_SIDE_TX as never);

    expect(result).toBeNull();
    expect(generateCdaMock).not.toHaveBeenCalled();
    expect(transactionDocumentsService.createDocumentWithMetadata).not.toHaveBeenCalled();
  });

  it('returns null when the transaction has no contractPrice yet', async () => {
    const { service } = buildService();
    const result = await service.maybeGenerateCda({ ...BUYER_SIDE_TX, contractPrice: null } as never);
    expect(result).toBeNull();
    expect(generateCdaMock).not.toHaveBeenCalled();
  });

  it('returns null when the Buyer Agent has not saved a commission yet', async () => {
    const { service } = buildService({ buyerSide: null });
    const result = await service.maybeGenerateCda(BUYER_SIDE_TX as never);
    expect(result).toBeNull();
    expect(generateCdaMock).not.toHaveBeenCalled();
  });

  it('returns null when the Buyer Agent has a row but no grossCommission computed yet', async () => {
    const { service } = buildService({ buyerSide: { grossCommission: null, brokerageName: 'Sunset Realty' } });
    const result = await service.maybeGenerateCda(BUYER_SIDE_TX as never);
    expect(result).toBeNull();
  });

  it('returns null when the Broker has not saved their commission split yet', async () => {
    const { service } = buildService({ broker: null });
    const result = await service.maybeGenerateCda(BUYER_SIDE_TX as never);
    expect(result).toBeNull();
    expect(generateCdaMock).not.toHaveBeenCalled();
  });

  it('returns null when the Broker has a row but no brokerCommissionAmount computed yet', async () => {
    const { service } = buildService({ broker: { brokerCommissionAmount: null, brokerPaymentAddress: '456 Broker Blvd' } });
    const result = await service.maybeGenerateCda(BUYER_SIDE_TX as never);
    expect(result).toBeNull();
  });

  it('supersedes the existing CDA document and increments the version chain on regeneration', async () => {
    const { service, transactionDocumentsService } = buildService({
      existingDocs: [{ id: 'cda-doc-old', documentType: 'cda' }, { id: 'other-doc', documentType: 'external_upload' }],
    });

    await service.maybeGenerateCda(BUYER_SIDE_TX as never);

    expect(transactionDocumentsService.createDocumentWithMetadata).toHaveBeenCalledWith(expect.objectContaining({
      previousVersionId: 'cda-doc-old',
    }));
  });

  it('leaves brokerSignature null — no signature source exists in the app yet', async () => {
    const { service } = buildService();
    await service.maybeGenerateCda(BUYER_SIDE_TX as never);
    const input = generateCdaMock.mock.calls[0][0] as { brokerSignature: unknown };
    expect(input.brokerSignature).toBeNull();
  });
});

describe('CdaGenerationService.getCdaForTransaction / getSignedCdaForTransaction — the internal (myTC swimlane) counterparts to getCdaForLink/getSignedCdaForLink', () => {
  it('getCdaForTransaction returns the internal transaction-documents viewUrl, with no token and no visibility gating', async () => {
    const { service } = buildService({
      existingDocs: [{ id: 'cda-doc-1', documentType: 'cda', fileName: 'CDA.pdf', createdAt: new Date('2026-01-05'), versionNo: 2, transactionId: 'tx-1' }],
    });
    const result = await service.getCdaForTransaction(BUYER_SIDE_TX as never);
    expect(result).toEqual({
      id: 'cda-doc-1', fileName: 'CDA.pdf', generatedAt: new Date('2026-01-05'), versionNo: 2,
      viewUrl: '/api/v1/transaction-documents/cda-doc-1/file',
    });
  });

  it('getCdaForTransaction returns null when no CDA has been generated yet', async () => {
    const { service } = buildService({ existingDocs: [] });
    const result = await service.getCdaForTransaction(BUYER_SIDE_TX as never);
    expect(result).toBeNull();
  });

  it('getSignedCdaForTransaction returns the internal viewUrl for the signed_cda document type', async () => {
    const { service } = buildService({
      existingDocs: [
        { id: 'cda-doc-1', documentType: 'cda', fileName: 'CDA.pdf', createdAt: new Date('2026-01-05'), versionNo: 1, transactionId: 'tx-1' },
        { id: 'signed-doc-1', documentType: 'signed_cda', fileName: 'signed.pdf', createdAt: new Date('2026-01-06'), versionNo: 1, transactionId: 'tx-1' },
      ],
    });
    const result = await service.getSignedCdaForTransaction(BUYER_SIDE_TX as never);
    expect(result).toEqual({
      id: 'signed-doc-1', fileName: 'signed.pdf', generatedAt: new Date('2026-01-06'), versionNo: 1,
      viewUrl: '/api/v1/transaction-documents/signed-doc-1/file',
    });
  });

  it('getSignedCdaForTransaction returns null when no signed CDA has been uploaded yet, even though a CDA exists', async () => {
    const { service } = buildService({
      existingDocs: [{ id: 'cda-doc-1', documentType: 'cda', fileName: 'CDA.pdf', createdAt: new Date('2026-01-05'), versionNo: 1, transactionId: 'tx-1' }],
    });
    const result = await service.getSignedCdaForTransaction(BUYER_SIDE_TX as never);
    expect(result).toBeNull();
  });

  it('never returns a document belonging to a different transaction, even if documentType matches', async () => {
    const { service } = buildService({
      existingDocs: [{ id: 'cda-doc-other-tx', documentType: 'cda', fileName: 'CDA.pdf', createdAt: new Date('2026-01-05'), versionNo: 1, transactionId: 'tx-OTHER' }],
    });
    const result = await service.getCdaForTransaction(BUYER_SIDE_TX as never);
    expect(result).toBeNull();
  });
});
