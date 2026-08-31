import { CdaNotificationService } from './cda-notification.service';
import { TransactionSide } from '../transactions/entities/transaction.entity';

const TX_ID = 'tx-1';
const TRANSACTION = {
  id: TX_ID,
  side: TransactionSide.BUYER_SIDE,
  transactionNumber: 'TXN-2026-0001',
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

const CDA_DOC = (fingerprint: string | null) => ({
  id: 'cda-doc-1',
  documentType: 'cda',
  metadataJson: fingerprint === null ? {} : { contentFingerprint: fingerprint },
});

const BUYER_AGENT_LINK = { id: 'link-ba-1', purpose: 'document_upload', transactionId: TX_ID, recipientEmail: 'alice@brokerage.com', emailSentAt: new Date(), emailMessageId: 'orig-msg-id', cdaNotifiedContentHash: null };
const BROKER_LINK = { id: 'link-broker-1', purpose: 'broker_document_upload', transactionId: TX_ID, recipientEmail: 'bobby@brokerfirm.com', emailSentAt: new Date(), emailMessageId: 'orig-msg-id-2', cdaNotifiedContentHash: null };
const ESCROW_LINK = { id: 'link-escrow-1', purpose: 'escrow_officer_document_upload', transactionId: TX_ID, recipientEmail: 'pat@escrowco.com', emailSentAt: new Date(), emailMessageId: 'orig-msg-id-3', cdaNotifiedContentHash: null };

function buildService(overrides: {
  cdaDoc?: ReturnType<typeof CDA_DOC> | undefined;
  buyerAgentParty?: { email: string | null } | null;
  buyerSideInfo?: { brokerEmail: string | null } | null;
  escrowInfo?: { escrowEmail: string | null } | null;
  links?: Record<string, unknown>[];
  sendResult?: { sent: boolean; providerMessageId: string | null };
} = {}) {
  const transactionDocumentsService = {
    findActiveByTransaction: jest.fn().mockResolvedValue(overrides.cdaDoc === undefined ? [CDA_DOC('fp-1')] : (overrides.cdaDoc ? [overrides.cdaDoc] : [])),
  };
  const buyerSideInformationService = {
    findByTransaction: jest.fn().mockResolvedValue(overrides.buyerSideInfo !== undefined ? overrides.buyerSideInfo : { brokerEmail: 'bobby@brokerfirm.com' }),
  };
  const escrowInformationService = {
    findByTransaction: jest.fn().mockResolvedValue(overrides.escrowInfo !== undefined ? overrides.escrowInfo : { escrowEmail: 'pat@escrowco.com' }),
  };
  const partiesRepo = {
    findOne: jest.fn().mockResolvedValue(overrides.buyerAgentParty !== undefined ? overrides.buyerAgentParty : { email: 'alice@brokerage.com' }),
  };

  const links = overrides.links ?? [{ ...BUYER_AGENT_LINK }, { ...BROKER_LINK }, { ...ESCROW_LINK }];
  let regenCounter = 0;
  const uploadLinkService = {
    findActiveLinkForEmail: jest.fn(async (transactionId: string, email: string, purpose: string) =>
      links.find((l) => l.transactionId === transactionId && l.recipientEmail === email && l.purpose === purpose) ?? null),
    regenerateSecureUploadLink: jest.fn(async (id: string) => {
      const existing = links.find((l) => l.id === id)!;
      const newLink = { ...existing, id: `${id}-regen-${++regenCounter}` };
      return { link: newLink, token: `raw-token-${regenCounter}` };
    }),
  };

  const uploadLinkEmailService = {
    sendCdaReadyEmail: jest.fn().mockResolvedValue(overrides.sendResult ?? { sent: true, providerMessageId: 'mg-1' }),
    sendSignedCdaAvailableEmail: jest.fn().mockResolvedValue(overrides.sendResult ?? { sent: true, providerMessageId: 'mg-2' }),
  };

  const uploadLinkRepo = { recordCdaNotified: jest.fn().mockResolvedValue(undefined) };
  const auditLogService = { log: jest.fn().mockResolvedValue(undefined) };

  const service = new CdaNotificationService(
    buyerSideInformationService as never,
    escrowInformationService as never,
    transactionDocumentsService as never,
    partiesRepo as never,
    uploadLinkService as never,
    uploadLinkEmailService as never,
    uploadLinkRepo as never,
    auditLogService as never,
  );

  return { service, transactionDocumentsService, buyerSideInformationService, escrowInformationService, partiesRepo, uploadLinkService, uploadLinkEmailService, uploadLinkRepo, auditLogService };
}

describe('CdaNotificationService.notifyIfCdaReady', () => {
  it('notifies both the Buyer Agent and the Broker on their own existing threads once a CDA exists', async () => {
    const { service, uploadLinkService, uploadLinkEmailService, uploadLinkRepo, auditLogService } = buildService();

    await service.notifyIfCdaReady(TRANSACTION as never);

    expect(uploadLinkService.regenerateSecureUploadLink).toHaveBeenCalledWith('link-ba-1');
    expect(uploadLinkService.regenerateSecureUploadLink).toHaveBeenCalledWith('link-broker-1');
    expect(uploadLinkEmailService.sendCdaReadyEmail).toHaveBeenCalledTimes(2);
    expect(uploadLinkRepo.recordCdaNotified).toHaveBeenCalledTimes(2);
    expect(uploadLinkRepo.recordCdaNotified).toHaveBeenCalledWith(expect.stringContaining('link-ba-1-regen'), 'fp-1');
    expect(uploadLinkRepo.recordCdaNotified).toHaveBeenCalledWith(expect.stringContaining('link-broker-1-regen'), 'fp-1');
    expect(auditLogService.log).toHaveBeenCalledTimes(2);
    expect(auditLogService.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'cda_notification_sent' }));
  });

  it('is a no-op when there is no CDA document yet', async () => {
    const { service, transactionDocumentsService, uploadLinkEmailService } = buildService();
    transactionDocumentsService.findActiveByTransaction.mockResolvedValueOnce([]);

    await service.notifyIfCdaReady(TRANSACTION as never);
    expect(uploadLinkEmailService.sendCdaReadyEmail).not.toHaveBeenCalled();
  });

  it('is a no-op for a non-buyer-side transaction', async () => {
    const { service, uploadLinkEmailService } = buildService();
    await service.notifyIfCdaReady({ ...TRANSACTION, side: TransactionSide.SELLER_SIDE } as never);
    expect(uploadLinkEmailService.sendCdaReadyEmail).not.toHaveBeenCalled();
  });

  it('is a no-op when the CDA document has no stored content fingerprint (generated before this feature existed)', async () => {
    const { service, uploadLinkEmailService } = buildService({ cdaDoc: CDA_DOC(null) });
    await service.notifyIfCdaReady(TRANSACTION as never);
    expect(uploadLinkEmailService.sendCdaReadyEmail).not.toHaveBeenCalled();
  });

  it('never sends to a recipient whose own upload link was never emailed', async () => {
    const links = [{ ...BUYER_AGENT_LINK, emailSentAt: null }, { ...BROKER_LINK }];
    const { service, uploadLinkEmailService } = buildService({ links });
    await service.notifyIfCdaReady(TRANSACTION as never);
    expect(uploadLinkEmailService.sendCdaReadyEmail).toHaveBeenCalledTimes(1);
    expect(uploadLinkEmailService.sendCdaReadyEmail).toHaveBeenCalledWith(expect.objectContaining({ recipientEmail: 'bobby@brokerfirm.com' }), expect.any(String), expect.anything());
  });

  it('does not re-notify a recipient already notified about this exact CDA content', async () => {
    const links = [{ ...BUYER_AGENT_LINK, cdaNotifiedContentHash: 'fp-1' }, { ...BROKER_LINK, cdaNotifiedContentHash: 'fp-1' }];
    const { service, uploadLinkEmailService, uploadLinkService } = buildService({ links });

    await service.notifyIfCdaReady(TRANSACTION as never);

    expect(uploadLinkEmailService.sendCdaReadyEmail).not.toHaveBeenCalled();
    expect(uploadLinkService.regenerateSecureUploadLink).not.toHaveBeenCalled();
  });

  it('DOES re-notify when the CDA content fingerprint has changed since the last notification', async () => {
    const links = [{ ...BUYER_AGENT_LINK, cdaNotifiedContentHash: 'stale-fp' }, { ...BROKER_LINK, cdaNotifiedContentHash: 'stale-fp' }];
    const { service, uploadLinkEmailService } = buildService({ links, cdaDoc: CDA_DOC('fresh-fp') });

    await service.notifyIfCdaReady(TRANSACTION as never);

    expect(uploadLinkEmailService.sendCdaReadyEmail).toHaveBeenCalledTimes(2);
  });

  it('skips the Buyer Agent when their party record has no email, but still notifies the Broker', async () => {
    const { service, uploadLinkEmailService } = buildService({ buyerAgentParty: { email: null } });
    await service.notifyIfCdaReady(TRANSACTION as never);
    expect(uploadLinkEmailService.sendCdaReadyEmail).toHaveBeenCalledTimes(1);
    expect(uploadLinkEmailService.sendCdaReadyEmail).toHaveBeenCalledWith(expect.objectContaining({ recipientEmail: 'bobby@brokerfirm.com' }), expect.any(String), expect.anything());
  });

  it('skips the Broker when no broker email has been saved yet, but still notifies the Buyer Agent', async () => {
    const { service, uploadLinkEmailService } = buildService({ buyerSideInfo: { brokerEmail: null } });
    await service.notifyIfCdaReady(TRANSACTION as never);
    expect(uploadLinkEmailService.sendCdaReadyEmail).toHaveBeenCalledTimes(1);
    expect(uploadLinkEmailService.sendCdaReadyEmail).toHaveBeenCalledWith(expect.objectContaining({ recipientEmail: 'alice@brokerage.com' }), expect.any(String), expect.anything());
  });

  it('does not record cdaNotified or write an audit row when the email send fails', async () => {
    const { service, uploadLinkRepo, auditLogService } = buildService({ sendResult: { sent: false, providerMessageId: null } });
    await service.notifyIfCdaReady(TRANSACTION as never);
    expect(uploadLinkRepo.recordCdaNotified).not.toHaveBeenCalled();
    expect(auditLogService.log).not.toHaveBeenCalled();
  });
});

describe('CdaNotificationService.notifyEscrowOfSignedCda', () => {
  it('replies on the Escrow link\'s own existing thread', async () => {
    const { service, uploadLinkService, uploadLinkEmailService, auditLogService } = buildService();

    await service.notifyEscrowOfSignedCda(TRANSACTION as never);

    expect(uploadLinkService.regenerateSecureUploadLink).toHaveBeenCalledWith('link-escrow-1');
    expect(uploadLinkEmailService.sendSignedCdaAvailableEmail).toHaveBeenCalledWith(
      expect.objectContaining({ recipientEmail: 'pat@escrowco.com' }), expect.any(String), expect.anything(),
    );
    expect(auditLogService.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'signed_cda_available_email_sent' }));
  });

  it('is a no-op when no escrow email has been saved yet', async () => {
    const { service, uploadLinkEmailService } = buildService({ escrowInfo: { escrowEmail: null } });
    await service.notifyEscrowOfSignedCda(TRANSACTION as never);
    expect(uploadLinkEmailService.sendSignedCdaAvailableEmail).not.toHaveBeenCalled();
  });

  it('is a no-op when Escrow has not been onboarded yet (no upload link, or one never emailed)', async () => {
    const links = [{ ...BUYER_AGENT_LINK }, { ...BROKER_LINK }]; // no escrow link at all
    const { service, uploadLinkEmailService } = buildService({ links });
    await service.notifyEscrowOfSignedCda(TRANSACTION as never);
    expect(uploadLinkEmailService.sendSignedCdaAvailableEmail).not.toHaveBeenCalled();
  });

  it('sends every time it is called — no content-fingerprint dedup, unlike notifyIfCdaReady', async () => {
    const { service, uploadLinkEmailService } = buildService();
    await service.notifyEscrowOfSignedCda(TRANSACTION as never);
    await service.notifyEscrowOfSignedCda(TRANSACTION as never);
    expect(uploadLinkEmailService.sendSignedCdaAvailableEmail).toHaveBeenCalledTimes(2);
  });

  it('does not write an audit row when the email send fails', async () => {
    const { service, auditLogService } = buildService({ sendResult: { sent: false, providerMessageId: null } });
    await service.notifyEscrowOfSignedCda(TRANSACTION as never);
    expect(auditLogService.log).not.toHaveBeenCalled();
  });
});
