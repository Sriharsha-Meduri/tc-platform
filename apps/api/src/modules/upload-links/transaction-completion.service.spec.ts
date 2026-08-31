import { TransactionCompletionService } from './transaction-completion.service';
import { TransactionSide } from '../transactions/entities/transaction.entity';

const TX_ID = 'tx-1';
const BUYER_SIDE_TX = { id: TX_ID, side: TransactionSide.BUYER_SIDE };
const SELLER_SIDE_TX = { id: TX_ID, side: TransactionSide.SELLER_SIDE };

const COMPLETE_CHECKLIST = { items: [], optionalItems: [], unmatchedDocuments: [], requiredCount: 1, submittedCount: 1, allRequiredSubmitted: true };
const INCOMPLETE_CHECKLIST = { ...COMPLETE_CHECKLIST, submittedCount: 0, allRequiredSubmitted: false };

const BUYER_LINK = { id: 'link-buyer', purpose: 'document_upload', transactionId: TX_ID };
const SELLER_LINK = { id: 'link-seller', purpose: 'seller_agent_document_upload', transactionId: TX_ID };
const ESCROW_LINK = { id: 'link-escrow', purpose: 'escrow_officer_document_upload', transactionId: TX_ID };
const BROKER_LINK = { id: 'link-broker', purpose: 'broker_document_upload', transactionId: TX_ID };

function buildService(overrides: {
  links?: Record<string, unknown>;
  checklistsComplete?: boolean;
  signedCda?: unknown;
  envelopes?: Array<{ status: string }>;
} = {}) {
  const links: Record<string, unknown> = overrides.links ?? {
    document_upload: BUYER_LINK,
    seller_agent_document_upload: SELLER_LINK,
    escrow_officer_document_upload: ESCROW_LINK,
    broker_document_upload: BROKER_LINK,
  };

  const uploadLinksRepo = {
    findOne: jest.fn(async ({ where }: { where: { purpose: string } }) => links[where.purpose] ?? null),
  };

  const envelopeRepo = {
    find: jest.fn().mockResolvedValue(overrides.envelopes ?? []),
  };

  const checklistComposition = {
    composeForPurpose: jest.fn().mockResolvedValue(overrides.checklistsComplete === false ? INCOMPLETE_CHECKLIST : COMPLETE_CHECKLIST),
  };

  const cdaGenerationService = {
    getSignedCdaForTransaction: jest.fn().mockResolvedValue(overrides.signedCda !== undefined ? overrides.signedCda : { id: 'signed-cda-1' }),
  };

  const service = new TransactionCompletionService(
    uploadLinksRepo as never,
    envelopeRepo as never,
    checklistComposition as never,
    cdaGenerationService as never,
  );

  return { service, uploadLinksRepo, envelopeRepo, checklistComposition, cdaGenerationService };
}

describe('TransactionCompletionService.isTransactionCompleted', () => {
  it('is true when every purpose checklist is fully submitted, a signed CDA exists, and no envelope is outstanding (buyer-side)', async () => {
    const { service } = buildService();
    expect(await service.isTransactionCompleted(BUYER_SIDE_TX as never)).toBe(true);
  });

  it('is false when any single purpose checklist is not fully submitted', async () => {
    const { service, checklistComposition } = buildService();
    checklistComposition.composeForPurpose
      .mockResolvedValueOnce(COMPLETE_CHECKLIST) // buyer agent
      .mockResolvedValueOnce(INCOMPLETE_CHECKLIST); // seller agent
    expect(await service.isTransactionCompleted(BUYER_SIDE_TX as never)).toBe(false);
  });

  it('is false for a buyer-side transaction with all checklists complete but no signed CDA on file yet', async () => {
    const { service } = buildService({ signedCda: null });
    expect(await service.isTransactionCompleted(BUYER_SIDE_TX as never)).toBe(false);
  });

  it('never requires a signed CDA on a seller-side transaction', async () => {
    const { service, cdaGenerationService } = buildService({ signedCda: null });
    expect(await service.isTransactionCompleted(SELLER_SIDE_TX as never)).toBe(true);
    expect(cdaGenerationService.getSignedCdaForTransaction).not.toHaveBeenCalled();
  });

  it('is false when a DocuSign envelope for the transaction is still created/sent/delivered', async () => {
    for (const status of ['created', 'sent', 'delivered']) {
      const { service } = buildService({ envelopes: [{ status }] });
      expect(await service.isTransactionCompleted(BUYER_SIDE_TX as never)).toBe(false);
    }
  });

  it('is unaffected by envelopes in a terminal state (completed/declined/voided/send_failed)', async () => {
    for (const status of ['completed', 'declined', 'voided', 'send_failed']) {
      const { service } = buildService({ envelopes: [{ status }] });
      expect(await service.isTransactionCompleted(BUYER_SIDE_TX as never)).toBe(true);
    }
  });

  it('resolves the active link per purpose and feeds it into composeForPurpose — never a hardcoded null', async () => {
    const { service, checklistComposition, uploadLinksRepo } = buildService();
    await service.isTransactionCompleted(BUYER_SIDE_TX as never);

    expect(uploadLinksRepo.findOne).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ transactionId: TX_ID, purpose: 'document_upload' }) }));
    expect(checklistComposition.composeForPurpose).toHaveBeenCalledWith('document_upload', BUYER_LINK, BUYER_SIDE_TX);
    expect(checklistComposition.composeForPurpose).toHaveBeenCalledWith('seller_agent_document_upload', SELLER_LINK, BUYER_SIDE_TX);
    expect(checklistComposition.composeForPurpose).toHaveBeenCalledWith('escrow_officer_document_upload', ESCROW_LINK, BUYER_SIDE_TX);
    expect(checklistComposition.composeForPurpose).toHaveBeenCalledWith('broker_document_upload', BROKER_LINK, BUYER_SIDE_TX);
  });

  it('passes link: null through to composeForPurpose when a purpose has no active link yet, rather than blowing up', async () => {
    const { service, checklistComposition } = buildService({ links: { document_upload: BUYER_LINK } });
    await service.isTransactionCompleted(BUYER_SIDE_TX as never);
    expect(checklistComposition.composeForPurpose).toHaveBeenCalledWith('seller_agent_document_upload', null, BUYER_SIDE_TX);
    expect(checklistComposition.composeForPurpose).toHaveBeenCalledWith('escrow_officer_document_upload', null, BUYER_SIDE_TX);
    expect(checklistComposition.composeForPurpose).toHaveBeenCalledWith('broker_document_upload', null, BUYER_SIDE_TX);
  });

  it('a transaction with no active links anywhere yet is never complete', async () => {
    const { service } = buildService({ links: {}, checklistsComplete: false });
    expect(await service.isTransactionCompleted(BUYER_SIDE_TX as never)).toBe(false);
  });
});
