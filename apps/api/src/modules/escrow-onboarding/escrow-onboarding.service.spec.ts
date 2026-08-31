import { EscrowOnboardingService } from './escrow-onboarding.service';

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
const ESCROW_LINK = { ...BUYER_AGENT_LINK, id: 'link-escrow-1', purpose: 'escrow_officer_document_upload', recipientRole: 'escrow_officer', recipientName: 'Erin Escrow', recipientEmail: 'erin@escrowco.com' };

function buildService(overrides: {
  escrowInfo?: { escrowContactName: string | null; escrowEmail: string | null } | null;
  hoaInfo?: { hasHoa: boolean | null } | null;
  createdLinkOverrides?: Partial<{ id: string; emailSentAt: Date | null; recipientEmail: string }>;
  sendUploadLinkEmailImpl?: jest.Mock;
  transaction?: Record<string, unknown>;
} = {}) {
  let escrowInfoRow: Record<string, unknown> | null = overrides.escrowInfo !== undefined
    ? (overrides.escrowInfo as Record<string, unknown> | null)
    : { escrowContactName: 'Erin Escrow', escrowEmail: 'erin@escrowco.com', willSendDocumentsToBuyer: null };
  const escrowInformationService = {
    findByTransaction: jest.fn(async () => escrowInfoRow),
    upsert: jest.fn(async (transactionId: string, input: Record<string, unknown>) => {
      const changedFields: string[] = [];
      const previousValues: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(input)) {
        if (value === undefined) continue;
        const prev = escrowInfoRow ? escrowInfoRow[key] : null;
        if ((prev ?? null) !== (value ?? null)) {
          changedFields.push(key);
          previousValues[key] = prev ?? null;
        }
      }
      if (changedFields.length === 0) return { entity: escrowInfoRow, changedFields: [], previousValues: {}, hadChanges: false };
      escrowInfoRow = { ...(escrowInfoRow ?? {}), transactionId, ...input };
      return { entity: escrowInfoRow, changedFields, previousValues, hadChanges: true };
    }),
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
        id: overrides.createdLinkOverrides?.id ?? `link-escrow-${++linkCounter}`,
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

  const hoaInfoRow: Record<string, unknown> | null = overrides.hoaInfo !== undefined
    ? (overrides.hoaInfo as Record<string, unknown> | null)
    : null;
  const hoaInformationService = {
    findByTransaction: jest.fn(async () => hoaInfoRow),
  };

  const auditLogService = { log: jest.fn().mockResolvedValue(undefined) };

  const service = new EscrowOnboardingService(
    escrowInformationService as never,
    hoaInformationService as never,
    uploadLinkService as never,
    uploadLinkEmailService as never,
    auditLogService as never,
  );

  return { service, escrowInformationService, hoaInformationService, uploadLinkService, uploadLinkEmailService, auditLogService, createdLinks };
}

describe('EscrowOnboardingService.sendWelcomeEmail', () => {
  it('signs with the transaction creator account and includes the cc-instruction line with the transaction Mailgun address', async () => {
    const { service, uploadLinkService, uploadLinkEmailService, auditLogService } = buildService();
    const result = await service.sendWelcomeEmail(SELLER_AGENT_LINK as never, TRANSACTION as never);

    expect(result.sent).toBe(true);
    expect(result.alreadySent).toBe(false);
    expect(result.escrowEmail).toBe('erin@escrowco.com');

    expect(uploadLinkService.createSecureUploadLinkForEmailRecipient).toHaveBeenCalledWith(
      expect.objectContaining({ recipientId: null, recipientRole: 'escrow_officer', recipientName: 'Erin Escrow', recipientEmail: 'erin@escrowco.com' }),
      'escrow_officer_document_upload',
      expect.objectContaining({ ccRecipient: { partyId: null, role: 'seller_agent', name: 'Alice Agent', email: 'alice@brokerage.com' } }),
    );

    expect(uploadLinkEmailService.sendUploadLinkEmail).toHaveBeenCalledWith(
      expect.objectContaining({ recipientEmail: 'erin@escrowco.com' }),
      expect.any(String),
      expect.objectContaining({
        tcName: 'Carla Creator',
        transactionEmail: 'txn-abc123@txn.mytcapp.net',
        tcPhone: '555-0200',
        ccInstructionEmail: 'txn-abc123@txn.mytcapp.net',
        transactionId: 'tx-1',
        propertyAddress: expect.stringContaining('123 Main St'),
      }),
    );

    expect(auditLogService.log).toHaveBeenCalledWith(expect.objectContaining({
      action: 'escrow_welcome_email_sent',
      details: expect.objectContaining({ escrowEmail: 'erin@escrowco.com', ccSellerAgentEmail: 'alice@brokerage.com', tcEmailIncluded: true }),
    }));
  });

  it('omits the creator TC lines (and the cc-instruction line) when the creator account has no name/email', async () => {
    const tx = { ...TRANSACTION, createdByAccount: { displayName: null, firstName: null, cellPhone: null, user: { email: null } } };
    const { service, uploadLinkEmailService, auditLogService } = buildService({ transaction: tx });
    const result = await service.sendWelcomeEmail(SELLER_AGENT_LINK as never, tx as never);

    expect(result.sent).toBe(true);
    expect(uploadLinkEmailService.sendUploadLinkEmail).toHaveBeenCalledWith(
      expect.anything(), expect.any(String),
      // Name/phone come from the creator account; the email is the transaction
      // Mailgun address (never the TC's myTC login email), so it still renders.
      expect.objectContaining({ tcName: null, tcPhone: null, transactionEmail: 'txn-abc123@txn.mytcapp.net', ccInstructionEmail: 'txn-abc123@txn.mytcapp.net', transactionId: 'tx-1' }),
    );
    expect(auditLogService.log).toHaveBeenCalledWith(expect.objectContaining({ details: expect.objectContaining({ tcEmailIncluded: true }) }));
  });

  it('omits the transaction email when the transaction has no Mailgun address', async () => {
    const tx = { ...TRANSACTION, outboundEmailAddress: null, createdByAccount: { displayName: null, firstName: null, cellPhone: null, user: { email: 'carla@tc.com' } } };
    const { service, uploadLinkEmailService, auditLogService } = buildService({ transaction: tx });
    const result = await service.sendWelcomeEmail(SELLER_AGENT_LINK as never, tx as never);

    expect(result.sent).toBe(true);
    expect(uploadLinkEmailService.sendUploadLinkEmail).toHaveBeenCalledWith(
      expect.anything(), expect.any(String),
      // Never falls back to the TC's myTC login email — the email line is omitted.
      expect.objectContaining({ tcName: null, tcPhone: null, transactionEmail: null, ccInstructionEmail: null, transactionId: 'tx-1' }),
    );
    expect(auditLogService.log).toHaveBeenCalledWith(expect.objectContaining({ details: expect.objectContaining({ tcEmailIncluded: false }) }));
  });

  it('rejects when the escrow name/email have not been saved yet', async () => {
    const { service } = buildService({ escrowInfo: { escrowContactName: null, escrowEmail: null } });
    await expect(service.sendWelcomeEmail(SELLER_AGENT_LINK as never, TRANSACTION as never))
      .rejects.toThrow("Save the escrow officer's name and email before sending the welcome email.");
  });

  it('rejects when the saved escrow email is invalid', async () => {
    const { service } = buildService({ escrowInfo: { escrowContactName: 'Erin Escrow', escrowEmail: 'not-an-email' } });
    await expect(service.sendWelcomeEmail(SELLER_AGENT_LINK as never, TRANSACTION as never))
      .rejects.toThrow('Escrow email is not a valid email address.');
  });

  it('rejects (generic 404) when called from a non-Seller-Agent link', async () => {
    const { service } = buildService();
    await expect(service.sendWelcomeEmail(BUYER_AGENT_LINK as never, TRANSACTION as never))
      .rejects.toThrow('This upload link is invalid or has expired.');
  });

  it('is idempotent — a repeat confirm with an unchanged email does not resend or write a duplicate audit row', async () => {
    const { service, uploadLinkEmailService, auditLogService } = buildService();
    const first = await service.sendWelcomeEmail(SELLER_AGENT_LINK as never, TRANSACTION as never);
    expect(first.sent).toBe(true);

    const second = await service.sendWelcomeEmail(SELLER_AGENT_LINK as never, TRANSACTION as never);
    expect(second.sent).toBe(false);
    expect(second.alreadySent).toBe(true);

    expect(uploadLinkEmailService.sendUploadLinkEmail).toHaveBeenCalledTimes(1);
    expect(auditLogService.log).toHaveBeenCalledTimes(1);
  });

  it('mints and sends a fresh link/email when the escrow email has changed since the last send', async () => {
    const { service, escrowInformationService, uploadLinkEmailService, createdLinks } = buildService();
    await service.sendWelcomeEmail(SELLER_AGENT_LINK as never, TRANSACTION as never);

    escrowInformationService.findByTransaction.mockResolvedValue({ escrowContactName: 'Erin Escrow', escrowEmail: 'new-erin@escrowco.com' });
    const second = await service.sendWelcomeEmail(SELLER_AGENT_LINK as never, TRANSACTION as never);

    expect(second.sent).toBe(true);
    expect(second.escrowEmail).toBe('new-erin@escrowco.com');
    expect(uploadLinkEmailService.sendUploadLinkEmail).toHaveBeenCalledTimes(2);
    expect(createdLinks).toHaveLength(2);
  });

  it('does not write an audit row when the email send silently fails (emailSentAt never gets set)', async () => {
    const failingSend = jest.fn(async () => { /* simulates sendUploadLinkEmail swallowing a Mailgun error — emailSentAt stays null */ });
    const { service, auditLogService } = buildService({ sendUploadLinkEmailImpl: failingSend });

    const result = await service.sendWelcomeEmail(SELLER_AGENT_LINK as never, TRANSACTION as never);
    expect(result.sent).toBe(false);
    expect(result.alreadySent).toBe(false);
    expect(auditLogService.log).not.toHaveBeenCalled();
  });
});

describe('EscrowOnboardingService.getWelcomeEmailStatus', () => {
  it('returns nulls before any send', async () => {
    const { service } = buildService();
    const status = await service.getWelcomeEmailStatus(SELLER_AGENT_LINK as never, TRANSACTION as never);
    expect(status).toEqual({ sentAt: null, sentTo: null });
  });

  it('returns the sent timestamp/recipient after a send', async () => {
    const { service } = buildService();
    await service.sendWelcomeEmail(SELLER_AGENT_LINK as never, TRANSACTION as never);

    const status = await service.getWelcomeEmailStatus(SELLER_AGENT_LINK as never, TRANSACTION as never);
    expect(status.sentAt).toBeInstanceOf(Date);
    expect(status.sentTo).toBe('erin@escrowco.com');
  });

  it('rejects (generic 404) when called from a non-Seller-Agent link', async () => {
    const { service } = buildService();
    await expect(service.getWelcomeEmailStatus(BUYER_AGENT_LINK as never, TRANSACTION as never))
      .rejects.toThrow('This upload link is invalid or has expired.');
  });
});

describe('EscrowOnboardingService — "will send documents to the Buyer?" delivery preference', () => {
  it('getDocumentDeliveryPreference returns null before any answer is saved', async () => {
    const { service } = buildService();
    const result = await service.getDocumentDeliveryPreference(ESCROW_LINK as never, TRANSACTION as never);
    expect(result).toEqual({ willSendDocumentsToBuyer: null });
  });

  it('saveDocumentDeliveryPreference persists the answer and it is readable afterward', async () => {
    const { service } = buildService();
    const saved = await service.saveDocumentDeliveryPreference(ESCROW_LINK as never, TRANSACTION as never, true);
    expect(saved).toEqual({ willSendDocumentsToBuyer: true });

    const readBack = await service.getDocumentDeliveryPreference(ESCROW_LINK as never, TRANSACTION as never);
    expect(readBack).toEqual({ willSendDocumentsToBuyer: true });
  });

  it('writes exactly one audit entry when the answer changes, none on an identical resubmission', async () => {
    const { service, auditLogService } = buildService();
    await service.saveDocumentDeliveryPreference(ESCROW_LINK as never, TRANSACTION as never, true);
    expect(auditLogService.log).toHaveBeenCalledTimes(1);
    expect(auditLogService.log).toHaveBeenCalledWith(expect.objectContaining({
      action: 'escrow_document_delivery_preference_updated',
      details: expect.objectContaining({ transactionId: TX_ID, willSendDocumentsToBuyer: true }),
    }));

    await service.saveDocumentDeliveryPreference(ESCROW_LINK as never, TRANSACTION as never, true);
    expect(auditLogService.log).toHaveBeenCalledTimes(1); // no new entry for the unchanged resubmission
  });

  it('writes a second audit entry when the answer flips from yes to no', async () => {
    const { service, auditLogService } = buildService();
    await service.saveDocumentDeliveryPreference(ESCROW_LINK as never, TRANSACTION as never, true);
    await service.saveDocumentDeliveryPreference(ESCROW_LINK as never, TRANSACTION as never, false);
    expect(auditLogService.log).toHaveBeenCalledTimes(2);
  });

  it('rejects getDocumentDeliveryPreference (generic 404) from a non-Escrow-Officer link', async () => {
    const { service } = buildService();
    await expect(service.getDocumentDeliveryPreference(BUYER_AGENT_LINK as never, TRANSACTION as never))
      .rejects.toThrow('This upload link is invalid or has expired.');
  });

  it('rejects saveDocumentDeliveryPreference (generic 404) from a non-Escrow-Officer link', async () => {
    const { service } = buildService();
    await expect(service.saveDocumentDeliveryPreference(BUYER_AGENT_LINK as never, TRANSACTION as never, true))
      .rejects.toThrow('This upload link is invalid or has expired.');
  });
});

describe('EscrowOnboardingService.getHoaRequirement', () => {
  it('returns null when the Seller Agent has not answered the HOA question yet', async () => {
    const { service } = buildService({ hoaInfo: null });
    const result = await service.getHoaRequirement(ESCROW_LINK as never, TRANSACTION as never);
    expect(result).toEqual({ hasHoa: null });
  });

  it('returns true when the Seller Agent answered Yes', async () => {
    const { service } = buildService({ hoaInfo: { hasHoa: true } });
    const result = await service.getHoaRequirement(ESCROW_LINK as never, TRANSACTION as never);
    expect(result).toEqual({ hasHoa: true });
  });

  it('returns false when the Seller Agent answered No', async () => {
    const { service } = buildService({ hoaInfo: { hasHoa: false } });
    const result = await service.getHoaRequirement(ESCROW_LINK as never, TRANSACTION as never);
    expect(result).toEqual({ hasHoa: false });
  });

  it('reflects a later change from Yes to No — always reads the current transaction-level value, never a stale cached one', async () => {
    const { service, hoaInformationService } = buildService({ hoaInfo: { hasHoa: true } });
    const first = await service.getHoaRequirement(ESCROW_LINK as never, TRANSACTION as never);
    expect(first).toEqual({ hasHoa: true });

    hoaInformationService.findByTransaction.mockResolvedValue({ hasHoa: false });
    const second = await service.getHoaRequirement(ESCROW_LINK as never, TRANSACTION as never);
    expect(second).toEqual({ hasHoa: false });
  });

  it('rejects (generic 404) when called from a non-Escrow-Officer link', async () => {
    const { service } = buildService();
    await expect(service.getHoaRequirement(BUYER_AGENT_LINK as never, TRANSACTION as never))
      .rejects.toThrow('This upload link is invalid or has expired.');
  });
});

describe('EscrowOnboardingService escrow number', () => {
  it('getEscrowNumber returns null before the Escrow Officer has saved one', async () => {
    const { service } = buildService();
    const result = await service.getEscrowNumber(ESCROW_LINK as never, TRANSACTION as never);
    expect(result).toEqual({ escrowNumber: null });
  });

  it('saveEscrowNumber persists the escrow number and it is readable afterward', async () => {
    const { service } = buildService();
    const saved = await service.saveEscrowNumber(ESCROW_LINK as never, TRANSACTION as never, '24-123456');
    expect(saved).toEqual({ escrowNumber: '24-123456' });

    const readBack = await service.getEscrowNumber(ESCROW_LINK as never, TRANSACTION as never);
    expect(readBack).toEqual({ escrowNumber: '24-123456' });
  });

  it('writes exactly one audit entry when the escrow number changes, none on an identical resubmission', async () => {
    const { service, auditLogService } = buildService();
    await service.saveEscrowNumber(ESCROW_LINK as never, TRANSACTION as never, '24-123456');
    expect(auditLogService.log).toHaveBeenCalledTimes(1);
    expect(auditLogService.log).toHaveBeenCalledWith(expect.objectContaining({
      action: 'escrow_number_updated',
      details: expect.objectContaining({ transactionId: TX_ID, escrowNumber: '24-123456' }),
    }));

    await service.saveEscrowNumber(ESCROW_LINK as never, TRANSACTION as never, '24-123456');
    expect(auditLogService.log).toHaveBeenCalledTimes(1); // no new entry for the unchanged resubmission
  });

  it('clears a previously saved escrow number when null is submitted', async () => {
    const { service, auditLogService } = buildService();
    await service.saveEscrowNumber(ESCROW_LINK as never, TRANSACTION as never, '24-123456');
    await service.saveEscrowNumber(ESCROW_LINK as never, TRANSACTION as never, null);

    const readBack = await service.getEscrowNumber(ESCROW_LINK as never, TRANSACTION as never);
    expect(readBack).toEqual({ escrowNumber: null });
    expect(auditLogService.log).toHaveBeenCalledTimes(2);
  });

  it('rejects getEscrowNumber (generic 404) from a non-Escrow-Officer link', async () => {
    const { service } = buildService();
    await expect(service.getEscrowNumber(BUYER_AGENT_LINK as never, TRANSACTION as never))
      .rejects.toThrow('This upload link is invalid or has expired.');
  });

  it('rejects saveEscrowNumber (generic 404) from a non-Escrow-Officer link', async () => {
    const { service } = buildService();
    await expect(service.saveEscrowNumber(BUYER_AGENT_LINK as never, TRANSACTION as never, '24-123456'))
      .rejects.toThrow('This upload link is invalid or has expired.');
  });
});
