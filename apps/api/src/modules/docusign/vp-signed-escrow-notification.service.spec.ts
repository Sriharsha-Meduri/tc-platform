import { VpSignedEscrowNotificationService } from './vp-signed-escrow-notification.service';
import { AuditAction } from '../audit-log/audit-log.entity';

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

const ESCROW_LINK = {
  id: 'link-escrow-1',
  purpose: 'escrow_officer_document_upload',
  transactionId: TX_ID,
  recipientEmail: 'pat@escrowco.com',
  recipientName: 'Pat Escrow',
  recipientRole: 'escrow_officer',
  recipientPartyId: null,
  ccEmail: null,
  ccRole: null,
  emailSentAt: new Date(),
  emailMessageId: 'orig-msg-id',
};

function buildService(overrides: {
  escrowInfo?: { escrowEmail: string | null } | null;
  existingLink?: typeof ESCROW_LINK | null;
  sendFails?: boolean;
} = {}) {
  const escrowInformationService = {
    findByTransaction: jest.fn().mockResolvedValue(
      overrides.escrowInfo !== undefined ? overrides.escrowInfo : { escrowEmail: 'pat@escrowco.com' },
    ),
  };

  const existingLink = overrides.existingLink === undefined ? { ...ESCROW_LINK } : overrides.existingLink;
  let regenCounter = 0;
  const uploadLinkRepo = {
    findActiveForRecipientEmail: jest.fn().mockResolvedValue(existingLink),
    regenerate: jest.fn(async (link: typeof ESCROW_LINK) => {
      regenCounter += 1;
      return { link, token: `raw-token-${regenCounter}` };
    }),
  };

  const messagesRepo = {
    create: jest.fn((v: unknown) => v),
    save: jest.fn().mockImplementation((v: unknown) => Promise.resolve(v)),
  };

  const mailgunService = {
    sendEmail: jest.fn().mockImplementation(() => {
      if (overrides.sendFails) return Promise.reject(new Error('Mailgun down'));
      return Promise.resolve({ messageId: 'mg-reply-1' });
    }),
  };
  const emailTemplateService = {
    render: jest.fn().mockImplementation((name: string, ctx: Record<string, unknown>) => `<rendered ${name}>${JSON.stringify(ctx)}`),
  };
  const auditLogService = { log: jest.fn().mockResolvedValue(undefined) };

  const service = new VpSignedEscrowNotificationService(
    escrowInformationService as never,
    uploadLinkRepo as never,
    messagesRepo as never,
    mailgunService as never,
    emailTemplateService as never,
    auditLogService as never,
  );

  return { service, escrowInformationService, uploadLinkRepo, messagesRepo, mailgunService, emailTemplateService, auditLogService };
}

describe('VpSignedEscrowNotificationService.notifyEscrowOfSignedVp', () => {
  it('replies on the Escrow link\'s own existing thread, informing them the signed VP is available', async () => {
    const { service, uploadLinkRepo, mailgunService, auditLogService } = buildService();

    await service.notifyEscrowOfSignedVp(TRANSACTION as never, 'vp-doc-1-signed');

    expect(uploadLinkRepo.regenerate).toHaveBeenCalledWith(expect.objectContaining({ id: 'link-escrow-1' }));
    expect(mailgunService.sendEmail).toHaveBeenCalledTimes(1);
    const [to, subject, , , from, cc, inReplyTo] = mailgunService.sendEmail.mock.calls[0];
    expect(to).toBe('pat@escrowco.com');
    expect(subject).toContain('Re:');
    expect(from).toContain('txn-abc123@txn.mytcapp.net');
    expect(cc).toBeUndefined();
    expect(inReplyTo).toBe('orig-msg-id');

    expect(auditLogService.log).toHaveBeenCalledWith(expect.objectContaining({
      action: AuditAction.SIGNED_VP_AVAILABLE_EMAIL_SENT,
      targetType: 'upload_link',
      targetId: 'link-escrow-1',
      details: expect.objectContaining({ transactionId: TX_ID, recipientEmail: 'pat@escrowco.com', documentId: 'vp-doc-1-signed' }),
    }));
  });

  it('is a no-op when no escrow email has been saved yet', async () => {
    const { service, mailgunService, auditLogService } = buildService({ escrowInfo: { escrowEmail: null } });
    await service.notifyEscrowOfSignedVp(TRANSACTION as never, 'vp-doc-1-signed');
    expect(mailgunService.sendEmail).not.toHaveBeenCalled();
    expect(auditLogService.log).not.toHaveBeenCalled();
  });

  it('is a no-op when Escrow has no upload link at all yet', async () => {
    const { service, mailgunService } = buildService({ existingLink: null });
    await service.notifyEscrowOfSignedVp(TRANSACTION as never, 'vp-doc-1-signed');
    expect(mailgunService.sendEmail).not.toHaveBeenCalled();
  });

  it('is a no-op when the Escrow link exists but was never actually emailed', async () => {
    const { service, mailgunService } = buildService({ existingLink: { ...ESCROW_LINK, emailSentAt: null as unknown as Date } });
    await service.notifyEscrowOfSignedVp(TRANSACTION as never, 'vp-doc-1-signed');
    expect(mailgunService.sendEmail).not.toHaveBeenCalled();
  });

  it('sends every time it is called — no dedup against repeated envelope-completion retries', async () => {
    const { service, mailgunService } = buildService();
    await service.notifyEscrowOfSignedVp(TRANSACTION as never, 'vp-doc-1-signed');
    await service.notifyEscrowOfSignedVp(TRANSACTION as never, 'vp-doc-1-signed');
    expect(mailgunService.sendEmail).toHaveBeenCalledTimes(2);
  });

  it('records the outbound message row with the signed-VP notification metadata', async () => {
    const { service, messagesRepo } = buildService();
    await service.notifyEscrowOfSignedVp(TRANSACTION as never, 'vp-doc-1-signed');

    const saved = messagesRepo.save.mock.calls[0][0] as {
      transactionId: string; status: string; providerThreadId: string;
      metadataJson: { type: string; documentId: string; uploadLinkId: string };
    };
    expect(saved.transactionId).toBe(TX_ID);
    expect(saved.status).toBe('sent');
    expect(saved.providerThreadId).toBe('orig-msg-id');
    expect(saved.metadataJson.type).toBe('signed_vp_available_notification');
    expect(saved.metadataJson.documentId).toBe('vp-doc-1-signed');
    expect(saved.metadataJson.uploadLinkId).toBe('link-escrow-1');
  });

  it('never throws and never writes an audit row when the email send fails', async () => {
    const { service, auditLogService, messagesRepo } = buildService({ sendFails: true });
    await expect(service.notifyEscrowOfSignedVp(TRANSACTION as never, 'vp-doc-1-signed')).resolves.toBeUndefined();
    expect(auditLogService.log).not.toHaveBeenCalled();
    expect(messagesRepo.save).not.toHaveBeenCalled();
  });

  it('never throws even when the escrow-info lookup itself fails', async () => {
    const { service, escrowInformationService, mailgunService } = buildService();
    escrowInformationService.findByTransaction.mockRejectedValueOnce(new Error('DB down'));
    await expect(service.notifyEscrowOfSignedVp(TRANSACTION as never, 'vp-doc-1-signed')).resolves.toBeUndefined();
    expect(mailgunService.sendEmail).not.toHaveBeenCalled();
  });
});
