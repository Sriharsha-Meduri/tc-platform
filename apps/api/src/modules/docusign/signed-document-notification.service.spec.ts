import { SignedDocumentNotificationService, NotifyDocumentSignedOptions } from './signed-document-notification.service';
import { AuditAction } from '../audit-log/audit-log.entity';

const AGENT_SUBJECT = 'Welcome to Escrow & Transaction Timeline – 123 Main St';
const BUYER_SUBJECT = 'Welcome to Your Transaction & Timeline – 123 Main St';

function makeTx(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tx-1',
    transactionNumber: 'TXN-2026-0001',
    propertyAddressLine1: '123 Main St',
    propertyCity: 'Chino',
    propertyState: 'CA',
    outboundEmailAddress: 'tx-1@txn.mytcapp.net',
    ...overrides,
  };
}

function makeThread(overrides: Record<string, unknown> = {}) {
  return {
    id: 'msg-agent-1',
    subject: AGENT_SUBJECT,
    providerMessageId: 'mg-welcome-agent-1',
    stage: 'contract',
    metadataJson: { to: ['ba@brokerage.com', 'sa@brokerage.com'], cc: [] },
    ...overrides,
  };
}

function makeBuyerThread(overrides: Record<string, unknown> = {}) {
  return makeThread({
    id: 'msg-buyer-1',
    subject: BUYER_SUBJECT,
    providerMessageId: 'mg-welcome-buyer-1',
    metadataJson: { to: ['jane@buyer.com'], cc: ['ba@brokerage.com'] },
    ...overrides,
  });
}

function mockRepo(overrides: Record<string, jest.Mock> = {}) {
  return {
    findOne: jest.fn().mockResolvedValue(null),
    save: jest.fn().mockImplementation((v: unknown) => Promise.resolve(v)),
    create: jest.fn().mockImplementation((v: unknown) => v),
    ...overrides,
  };
}

function buildService(deps: {
  tx?: ReturnType<typeof makeTx> | null;
  agentThread?: ReturnType<typeof makeThread> | null;
  buyerThread?: ReturnType<typeof makeBuyerThread> | null;
  mailFails?: boolean;
} = {}) {
  const tx = deps.tx === undefined ? makeTx() : deps.tx;
  const agentThread = deps.agentThread === undefined ? makeThread() : deps.agentThread;
  const buyerThread = deps.buyerThread === undefined ? null : deps.buyerThread;

  const transactionsRepo = mockRepo({ findOne: jest.fn().mockResolvedValue(tx) });
  const messagesRepo = mockRepo({
    findOne: jest.fn().mockImplementation(({ where }: { where: { subject: { value?: string } } }) => {
      const pattern = (where.subject as unknown as { value?: string })?.value ?? '';
      if (pattern.startsWith('Welcome to Your Transaction')) return Promise.resolve(buyerThread);
      if (pattern.startsWith('Welcome to Escrow')) return Promise.resolve(agentThread);
      return Promise.resolve(null);
    }),
  });

  const mailgunService = {
    sendEmail: jest.fn().mockImplementation(() => {
      if (deps.mailFails) return Promise.reject(new Error('Mailgun down'));
      return Promise.resolve({ messageId: 'mg-reply-1' });
    }),
  };
  const emailTemplateService = {
    render: jest.fn().mockImplementation((name: string, ctx: Record<string, unknown>) => `<rendered ${name}>${JSON.stringify(ctx)}`),
  };
  const auditLogService = { log: jest.fn().mockResolvedValue(undefined) };

  const service = new SignedDocumentNotificationService(
    transactionsRepo as never,
    messagesRepo as never,
    mailgunService as never,
    emailTemplateService as never,
    auditLogService as never,
  );

  return { service, transactionsRepo, messagesRepo, mailgunService, emailTemplateService, auditLogService };
}

function baseOpts(overrides: Partial<NotifyDocumentSignedOptions> = {}): NotifyDocumentSignedOptions {
  return {
    transactionId: 'tx-1',
    documentId: 'doc-1-signed',
    documentName: 'Purchase Agreement',
    formCode: 'RPA',
    docusignEnvelopeId: 'envelope-abc',
    completedAt: new Date('2026-05-03T12:00:00Z'),
    ...overrides,
  };
}

describe('SignedDocumentNotificationService', () => {
  it('replies onto the agent-facing welcome thread when only that thread exists', async () => {
    const { service, mailgunService } = buildService();
    await service.notifyDocumentSigned(baseOpts());

    expect(mailgunService.sendEmail).toHaveBeenCalledTimes(1);
    const [to, subject, , , from, cc, inReplyTo] = mailgunService.sendEmail.mock.calls[0];
    expect(to).toEqual(['ba@brokerage.com', 'sa@brokerage.com']);
    expect(subject).toBe(`Re: ${AGENT_SUBJECT}`);
    expect(from).toContain('tx-1@txn.mytcapp.net');
    expect(cc ?? []).toEqual([]);
    expect(inReplyTo).toBe('mg-welcome-agent-1');
  });

  it('replies onto the buyer-facing welcome thread when only that thread exists', async () => {
    const { service, mailgunService } = buildService({ agentThread: null, buyerThread: makeBuyerThread() });
    await service.notifyDocumentSigned(baseOpts());

    expect(mailgunService.sendEmail).toHaveBeenCalledTimes(1);
    const [to, subject, , , , cc, inReplyTo] = mailgunService.sendEmail.mock.calls[0];
    expect(to).toEqual(['jane@buyer.com']);
    expect(cc).toEqual(['ba@brokerage.com']);
    expect(subject).toBe(`Re: ${BUYER_SUBJECT}`);
    expect(inReplyTo).toBe('mg-welcome-buyer-1');
  });

  it('replies onto both threads when both the agent and buyer welcome threads exist', async () => {
    const { service, mailgunService, messagesRepo } = buildService({ buyerThread: makeBuyerThread() });
    await service.notifyDocumentSigned(baseOpts());

    expect(mailgunService.sendEmail).toHaveBeenCalledTimes(2);
    expect(messagesRepo.save).toHaveBeenCalledTimes(2);
    const subjects = mailgunService.sendEmail.mock.calls.map((c) => c[1]);
    expect(subjects).toEqual(expect.arrayContaining([`Re: ${AGENT_SUBJECT}`, `Re: ${BUYER_SUBJECT}`]));
  });

  it("never derives recipients from the DocuSign envelope's signers — only from the thread's own recorded To/Cc", async () => {
    const { service, mailgunService } = buildService();
    await service.notifyDocumentSigned(baseOpts());

    const [to, , , , , cc] = mailgunService.sendEmail.mock.calls[0];
    const allRecipients = [...to, ...(cc ?? [])];
    // The fixture's thread recipients never include a signer email like this one.
    expect(allRecipients).not.toContain('signer@example.com');
  });

  it('falls back to toDetail/ccDetail (name+email pairs) when a thread was saved with that shape instead of flat arrays', async () => {
    const { service, mailgunService } = buildService({
      agentThread: makeThread({ metadataJson: { toDetail: [{ name: 'Alice Agent', email: 'alice@brokerage.com' }], ccDetail: [] } }),
    });
    await service.notifyDocumentSigned(baseOpts());

    const [to] = mailgunService.sendEmail.mock.calls[0];
    expect(to).toEqual(['alice@brokerage.com']);
  });

  it('skips sending entirely when no Welcome email thread exists for the transaction', async () => {
    const { service, mailgunService, messagesRepo, auditLogService } = buildService({ agentThread: null, buyerThread: null });
    await service.notifyDocumentSigned(baseOpts());

    expect(mailgunService.sendEmail).not.toHaveBeenCalled();
    expect(messagesRepo.save).not.toHaveBeenCalled();
    expect(auditLogService.log).not.toHaveBeenCalled();
  });

  it('skips a thread with no recorded To recipients rather than sending to nobody', async () => {
    const { service, mailgunService } = buildService({
      agentThread: makeThread({ metadataJson: { to: [], cc: [] } }),
    });
    await service.notifyDocumentSigned(baseOpts());
    expect(mailgunService.sendEmail).not.toHaveBeenCalled();
  });

  it('never renders placeholder text — formCode is passed through as null when absent, not a fabricated string', async () => {
    const { service, emailTemplateService } = buildService();
    await service.notifyDocumentSigned(baseOpts({ formCode: null }));

    const [, ctx] = emailTemplateService.render.mock.calls[0] as [string, { formCode: unknown }];
    expect(ctx.formCode).toBeNull();
  });

  it('includes the document name, formCode, and transaction ID in the template context', async () => {
    const { service, emailTemplateService } = buildService();
    await service.notifyDocumentSigned(baseOpts({ documentName: 'Transfer Disclosure Statement', formCode: 'TDS' }));

    const [, ctx] = emailTemplateService.render.mock.calls[0] as [string, { documentName: string; formCode: string; transactionId: string }];
    expect(ctx.documentName).toBe('Transfer Disclosure Statement');
    expect(ctx.formCode).toBe('TDS');
    expect(ctx.transactionId).toBe('tx-1');
  });

  it('records the message row and audit log entry on a successful send', async () => {
    const { service, messagesRepo, auditLogService } = buildService();
    await service.notifyDocumentSigned(baseOpts());

    const saved = messagesRepo.save.mock.calls[0][0] as {
      transactionId: string; status: string; providerMessageId: string;
      metadataJson: { type: string; inReplyTo: string; documentId: string; docusignEnvelopeId: string };
    };
    expect(saved.transactionId).toBe('tx-1');
    expect(saved.status).toBe('sent');
    expect(saved.providerMessageId).toBe('mg-reply-1');
    expect(saved.metadataJson.type).toBe('document_signed');
    expect(saved.metadataJson.inReplyTo).toBe('mg-welcome-agent-1');
    expect(saved.metadataJson.documentId).toBe('doc-1-signed');
    expect(saved.metadataJson.docusignEnvelopeId).toBe('envelope-abc');

    expect(auditLogService.log).toHaveBeenCalledWith(expect.objectContaining({
      action: AuditAction.DOCUMENT_SIGNED_EMAIL_SENT,
      targetType: 'transaction',
      targetId: 'tx-1',
      details: expect.objectContaining({ status: 'sent', documentId: 'doc-1-signed' }),
    }));
  });

  it('records a FAILED message row and audits the failure when the send throws', async () => {
    const { service, messagesRepo, auditLogService } = buildService({ mailFails: true });
    await service.notifyDocumentSigned(baseOpts());

    const saved = messagesRepo.save.mock.calls[0][0] as { status: string };
    expect(saved.status).toBe('failed');

    expect(auditLogService.log).toHaveBeenCalledWith(expect.objectContaining({
      action: AuditAction.DOCUMENT_SIGNED_EMAIL_SENT,
      details: expect.objectContaining({ status: 'failed' }),
    }));
  });

  it('skips sending when the transaction itself cannot be found', async () => {
    const { service, mailgunService } = buildService({ tx: null });
    await service.notifyDocumentSigned(baseOpts());
    expect(mailgunService.sendEmail).not.toHaveBeenCalled();
  });
});
