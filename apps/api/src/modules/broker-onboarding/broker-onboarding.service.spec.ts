import { BrokerOnboardingService } from './broker-onboarding.service';

const TX_ID = 'tx-1';
const TRANSACTION = {
  id: TX_ID,
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

const BUYER_AGENT_LINK = {
  id: 'link-ba-1',
  purpose: 'document_upload',
  transactionId: TX_ID,
  recipientPartyId: 'party-ba-1',
  recipientRole: 'buyer_agent',
  recipientName: 'Alice Agent',
  recipientEmail: 'alice@brokerage.com',
};

const SELLER_AGENT_LINK = { ...BUYER_AGENT_LINK, id: 'link-sa-1', purpose: 'seller_agent_document_upload', recipientRole: 'seller_agent' };

function buildService(overrides: {
  buyerSideInfo?: { brokerFullName: string | null; brokerEmail: string | null } | null;
  createdLinkOverrides?: Partial<{ id: string; emailSentAt: Date | null; recipientEmail: string }>;
  sendUploadLinkEmailImpl?: jest.Mock;
} = {}) {
  let buyerSideRow: Record<string, unknown> | null = overrides.buyerSideInfo !== undefined
    ? (overrides.buyerSideInfo as Record<string, unknown> | null)
    : { brokerFullName: 'Bobby Broker', brokerEmail: 'bobby@brokerfirm.com' };
  const buyerSideInformationService = {
    findByTransaction: jest.fn(async () => buyerSideRow),
  };

  let linkCounter = 0;
  const createdLinks: Array<Record<string, unknown>> = [];
  const uploadLinkService = {
    createSecureUploadLinkForEmailRecipient: jest.fn(async (recipient: { recipientEmail: string }, purpose: string) => {
      const existing = createdLinks.find((l) => l.recipientEmail === recipient.recipientEmail && l.purpose === purpose);
      if (existing?.emailSentAt) {
        return { link: existing, token: null };
      }
      const link = {
        id: overrides.createdLinkOverrides?.id ?? `link-broker-${++linkCounter}`,
        purpose,
        transactionId: TX_ID,
        recipientEmail: recipient.recipientEmail,
        emailSentAt: overrides.createdLinkOverrides?.emailSentAt ?? null,
      };
      createdLinks.push(link);
      return { link, token: `raw-token-${linkCounter}` };
    }),
    findActiveLinkForEmail: jest.fn(async (transactionId: string, recipientEmail: string, purpose: string) =>
      createdLinks.find((l) => l.transactionId === transactionId && l.recipientEmail === recipientEmail && l.purpose === purpose) ?? null),
  };

  const uploadLinkEmailService = {
    sendUploadLinkEmail: overrides.sendUploadLinkEmailImpl ?? jest.fn(async (link: Record<string, unknown>) => {
      link.emailSentAt = new Date();
      const found = createdLinks.find((l) => l.id === link.id);
      if (found) found.emailSentAt = link.emailSentAt;
    }),
  };

  const auditLogService = { log: jest.fn().mockResolvedValue(undefined) };

  const service = new BrokerOnboardingService(
    buyerSideInformationService as never,
    uploadLinkService as never,
    uploadLinkEmailService as never,
    auditLogService as never,
  );

  return { service, buyerSideInformationService, uploadLinkService, uploadLinkEmailService, auditLogService, createdLinks };
}

describe('BrokerOnboardingService.sendWelcomeEmail', () => {
  it('mints and sends the broker welcome email, auditing the send', async () => {
    const { service, uploadLinkService, uploadLinkEmailService, auditLogService } = buildService();
    const result = await service.sendWelcomeEmail(BUYER_AGENT_LINK as never, TRANSACTION as never);

    expect(result.sent).toBe(true);
    expect(result.alreadySent).toBe(false);
    expect(result.brokerEmail).toBe('bobby@brokerfirm.com');

    expect(uploadLinkService.createSecureUploadLinkForEmailRecipient).toHaveBeenCalledWith(
      expect.objectContaining({ recipientId: null, recipientRole: 'other', recipientName: 'Bobby Broker', recipientEmail: 'bobby@brokerfirm.com' }),
      'broker_document_upload',
      {},
    );

    expect(uploadLinkEmailService.sendUploadLinkEmail).toHaveBeenCalledWith(
      expect.objectContaining({ recipientEmail: 'bobby@brokerfirm.com' }),
      expect.any(String),
      expect.objectContaining({
        tcName: 'Carla Creator',
        transactionEmail: 'txn-abc123@txn.mytcapp.net',
        tcPhone: '555-0200',
        transactionId: 'tx-1',
        propertyAddress: expect.stringContaining('123 Main St'),
      }),
    );

    expect(auditLogService.log).toHaveBeenCalledWith(expect.objectContaining({
      action: 'broker_welcome_email_sent',
      details: expect.objectContaining({ brokerEmail: 'bobby@brokerfirm.com', tcEmailIncluded: true }),
    }));
  });

  it('rejects when the broker name/email have not been saved yet', async () => {
    const { service } = buildService({ buyerSideInfo: { brokerFullName: null, brokerEmail: null } });
    await expect(service.sendWelcomeEmail(BUYER_AGENT_LINK as never, TRANSACTION as never))
      .rejects.toThrow("Save the broker's name and email before sending the welcome email.");
  });

  it('rejects when the saved broker email is invalid', async () => {
    const { service } = buildService({ buyerSideInfo: { brokerFullName: 'Bobby Broker', brokerEmail: 'not-an-email' } });
    await expect(service.sendWelcomeEmail(BUYER_AGENT_LINK as never, TRANSACTION as never))
      .rejects.toThrow('Broker email is not a valid email address.');
  });

  it('rejects (generic 404) when called from a non-Buyer-Agent link', async () => {
    const { service } = buildService();
    await expect(service.sendWelcomeEmail(SELLER_AGENT_LINK as never, TRANSACTION as never))
      .rejects.toThrow('This upload link is invalid or has expired.');
  });

  it('is idempotent — a repeat save with an unchanged email does not resend or write a duplicate audit row', async () => {
    const { service, uploadLinkEmailService, auditLogService } = buildService();
    const first = await service.sendWelcomeEmail(BUYER_AGENT_LINK as never, TRANSACTION as never);
    expect(first.sent).toBe(true);

    const second = await service.sendWelcomeEmail(BUYER_AGENT_LINK as never, TRANSACTION as never);
    expect(second.sent).toBe(false);
    expect(second.alreadySent).toBe(true);

    expect(uploadLinkEmailService.sendUploadLinkEmail).toHaveBeenCalledTimes(1);
    expect(auditLogService.log).toHaveBeenCalledTimes(1);
  });

  it('mints and sends a fresh link/email when the broker email has changed since the last send', async () => {
    const { service, buyerSideInformationService, uploadLinkEmailService, createdLinks } = buildService();
    await service.sendWelcomeEmail(BUYER_AGENT_LINK as never, TRANSACTION as never);

    buyerSideInformationService.findByTransaction.mockResolvedValue({ brokerFullName: 'Bobby Broker', brokerEmail: 'new-bobby@brokerfirm.com' });
    const second = await service.sendWelcomeEmail(BUYER_AGENT_LINK as never, TRANSACTION as never);

    expect(second.sent).toBe(true);
    expect(second.brokerEmail).toBe('new-bobby@brokerfirm.com');
    expect(uploadLinkEmailService.sendUploadLinkEmail).toHaveBeenCalledTimes(2);
    expect(createdLinks).toHaveLength(2);
  });

  it('does not write an audit row when the email send silently fails (emailSentAt never gets set)', async () => {
    const failingSend = jest.fn(async () => { /* simulates sendUploadLinkEmail swallowing a Mailgun error — emailSentAt stays null */ });
    const { service, auditLogService } = buildService({ sendUploadLinkEmailImpl: failingSend });

    const result = await service.sendWelcomeEmail(BUYER_AGENT_LINK as never, TRANSACTION as never);
    expect(result.sent).toBe(false);
    expect(result.alreadySent).toBe(false);
    expect(auditLogService.log).not.toHaveBeenCalled();
  });
});
