import { Like } from 'typeorm';
import { TransactionWelcomeEmailService } from './transaction-welcome-email.service';
import { TransactionStatus } from './entities/transaction.entity';
import { PartyRole } from '../transaction-parties/entities/transaction-party.entity';
import { EventType } from '../transaction-events/entities/transaction-event.entity';
import { AuditAction } from '../audit-log/audit-log.entity';
import { EmailTemplateService } from '../auth/email-template.service';

// ── Mock helpers ───────────────────────────────────────────────────────────────

function makeTx(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tx-1',
    transactionNumber: 'TXN-2026-0001',
    createdByAccountId: 'account-creator-1',
    propertyAddressLine1: '123 Main St',
    propertyCity: 'Chino',
    propertyState: 'CA',
    outboundEmailAddress: 'tx-1@txn.mytcapp.net',
    status: TransactionStatus.ACTIVE,
    createdByAccount: { displayName: 'Alice TC', cellPhone: '555-0100', user: { email: 'alice@tc.com' } },
    buyerAgentAccount: { displayName: 'Bob Agent' },
    ...overrides,
  };
}

function makeParty(role: PartyRole, id: string, email: string | null, displayName = 'Someone') {
  return { id, transactionId: 'tx-1', partyRole: role, email, displayName };
}

/** Buyer Agent + Seller Agent — the minimal required set for the welcome email. */
function requiredParties() {
  return [
    makeParty(PartyRole.BUYER_AGENT, 'party-ba-1', 'ba@brokerage.com', 'Alice Agent'),
    makeParty(PartyRole.SELLER_AGENT, 'party-sa-1', 'sa@brokerage.com', 'Dave Agent'),
  ];
}

function makeEvent(type: EventType, date: string) {
  return { id: `ev-${type}`, transactionId: 'tx-1', eventType: type, eventDate: new Date(date), status: 'scheduled', notes: null };
}

function mockRepo(overrides: Record<string, jest.Mock> = {}) {
  return {
    findOne: jest.fn(),
    find: jest.fn().mockResolvedValue([]),
    save: jest.fn().mockImplementation((v: unknown) => Promise.resolve(v)),
    create: jest.fn().mockImplementation((v: unknown) => v),
    ...overrides,
  };
}

function buildService(
  deps: {
    tx?: ReturnType<typeof makeTx>;
    parties?: ReturnType<typeof makeParty>[];
    events?: ReturnType<typeof makeEvent>[];
    /** Simulate a shared welcome email already having been SENT for this transaction. */
    alreadySent?: boolean;
    mailFails?: boolean;
    formTemplate?: { items: { formCode: string; isRequired: boolean }[] } | null;
    uploadedDocs?: { formCode: string | null }[];
  } = {},
) {
  const tx = deps.tx ?? makeTx();
  const parties = deps.parties ?? requiredParties();

  const transactionsRepo = mockRepo({ findOne: jest.fn().mockResolvedValue(tx) });
  const partiesRepo = mockRepo({ find: jest.fn().mockResolvedValue(parties) });
  const eventsRepo = mockRepo({ find: jest.fn().mockResolvedValue(deps.events ?? []) });
  const documentsRepo = mockRepo({ find: jest.fn().mockResolvedValue(deps.uploadedDocs ?? []) });
  const messagesRepo = mockRepo({
    findOne: jest.fn().mockResolvedValue(deps.alreadySent ? { id: 'msg-existing' } : null),
  });

  const mailgunService = {
    sendEmail: jest.fn().mockImplementation(() => {
      if (deps.mailFails) return Promise.reject(new Error('Mailgun down'));
      return Promise.resolve({ messageId: 'mg-shared-1' });
    }),
  };
  const emailTemplateService = {
    render: jest.fn().mockImplementation((_name: string, ctx: { rows?: { label: string; deadline: string }[] }) => {
      const labels = (ctx.rows ?? []).map((r) => `${r.label}: ${r.deadline}`).join(' | ');
      return `<html>${labels}</html>`;
    }),
  };
  const stageInstancesService = { activateStage: jest.fn().mockResolvedValue(undefined) };
  const formTemplatesService = {
    resolveForTransaction: jest.fn().mockResolvedValue(
      deps.formTemplate === undefined ? null : deps.formTemplate,
    ),
  };
  const auditLogService = { log: jest.fn().mockResolvedValue(undefined) };

  const service = new TransactionWelcomeEmailService(
    transactionsRepo as never,
    partiesRepo as never,
    eventsRepo as never,
    messagesRepo as never,
    documentsRepo as never,
    mailgunService as never,
    emailTemplateService as never,
    stageInstancesService as never,
    formTemplatesService as never,
    auditLogService as never,
  );

  return { service, mailgunService, emailTemplateService, messagesRepo, stageInstancesService, formTemplatesService, auditLogService };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('TransactionWelcomeEmailService', () => {
  it('sends one shared email: To Buyer Agent + Seller Agent, Cc empty (no Seller TC assigned)', async () => {
    const { service, mailgunService, messagesRepo } = buildService({
      events: [makeEvent(EventType.OFFER_ACCEPTED, '2026-05-03T12:00:00Z')],
    });
    const sent = await service.sendWelcomeEmails('tx-1');

    expect(mailgunService.sendEmail).toHaveBeenCalledTimes(1);
    const [to, subject, , , , cc] = mailgunService.sendEmail.mock.calls[0];
    expect(to.sort()).toEqual(['ba@brokerage.com', 'sa@brokerage.com'].sort());
    expect(cc ?? []).toEqual([]);
    expect(subject).toContain('Welcome to Escrow & Transaction Timeline');
    expect(sent.sort()).toEqual(['ba@brokerage.com', 'sa@brokerage.com'].sort());
    expect(messagesRepo.save).toHaveBeenCalledTimes(1);
  });

  it('includes the Seller Transaction Coordinator in Cc when present with a valid email', async () => {
    const { service, mailgunService } = buildService({
      parties: [...requiredParties(), makeParty(PartyRole.SELLER_TRANSACTION_COORDINATOR, 'party-stc-1', 'stc@sellertc.com', 'Dana STC')],
    });
    await service.sendWelcomeEmails('tx-1');

    const [, , , , , cc] = mailgunService.sendEmail.mock.calls[0];
    expect(cc).toEqual(['stc@sellertc.com']);
  });

  it('omits the Seller Transaction Coordinator (and logs it) when none is assigned — cc empty, send still proceeds', async () => {
    const { service, mailgunService, messagesRepo } = buildService(); // requiredParties() has no Seller TC
    const sent = await service.sendWelcomeEmails('tx-1');

    expect(mailgunService.sendEmail).toHaveBeenCalledTimes(1);
    const [, , , , , cc] = mailgunService.sendEmail.mock.calls[0];
    expect(cc ?? []).toEqual([]);
    expect(sent.length).toBeGreaterThan(0);
    const saved = messagesRepo.save.mock.calls[0][0] as { metadataJson: { omitted: { role: string }[] } };
    expect(saved.metadataJson.omitted).toEqual([]);
  });

  it('omits the Seller Transaction Coordinator and records why when assigned but missing a valid email — send still proceeds', async () => {
    const { service, mailgunService, messagesRepo } = buildService({
      parties: [...requiredParties(), makeParty(PartyRole.SELLER_TRANSACTION_COORDINATOR, 'party-stc-1', null, 'Dana STC')],
    });
    const sent = await service.sendWelcomeEmails('tx-1');

    expect(mailgunService.sendEmail).toHaveBeenCalledTimes(1);
    const [, , , , , cc] = mailgunService.sendEmail.mock.calls[0];
    expect(cc ?? []).toEqual([]);
    expect(sent.length).toBeGreaterThan(0);
    const saved = messagesRepo.save.mock.calls[0][0] as { metadataJson: { omitted: { role: string; reason: string }[] } };
    expect(saved.metadataJson.omitted).toEqual([{ role: 'Seller Transaction Coordinator', reason: 'no valid email on file' }]);
  });

  it('never places Buyers or Sellers in To or Cc, even when those party rows have valid emails', async () => {
    const { service, mailgunService, messagesRepo } = buildService({
      parties: [
        ...requiredParties(),
        makeParty(PartyRole.BUYER, 'party-buyer-1', 'jane@buyer.com', 'Jane Buyer'),
        makeParty(PartyRole.SELLER, 'party-seller-1', 'sam@seller.com', 'Sam Seller'),
        makeParty(PartyRole.SELLER_TRANSACTION_COORDINATOR, 'party-stc-1', 'stc@sellertc.com', 'Dana STC'),
      ],
    });
    await service.sendWelcomeEmails('tx-1');

    const [to, , , , , cc] = mailgunService.sendEmail.mock.calls[0];
    const allRecipients = [...to, ...(cc ?? [])];
    expect(allRecipients).not.toContain('jane@buyer.com');
    expect(allRecipients).not.toContain('sam@seller.com');

    const saved = messagesRepo.save.mock.calls[0][0] as { metadataJson: { to: string[]; cc: string[] } };
    expect(saved.metadataJson.to).not.toContain('jane@buyer.com');
    expect(saved.metadataJson.cc).not.toContain('sam@seller.com');
  });

  it('removes duplicate email addresses and never places the same recipient in both To and Cc', async () => {
    const { service, mailgunService } = buildService({
      parties: [
        makeParty(PartyRole.BUYER_AGENT, 'party-ba-1', 'shared@example.com'),
        // Seller Agent happens to share an email with the Buyer Agent — deduped to one To entry.
        makeParty(PartyRole.SELLER_AGENT, 'party-sa-1', 'shared@example.com'),
        // Seller TC happens to share an email with an agent already in To — dropped from Cc.
        makeParty(PartyRole.SELLER_TRANSACTION_COORDINATOR, 'party-stc-1', 'shared@example.com'),
      ],
    });
    await service.sendWelcomeEmails('tx-1');

    const [to, , , , , cc] = mailgunService.sendEmail.mock.calls[0];
    expect(to).toEqual(['shared@example.com']);
    expect(cc ?? []).toEqual([]);
  });

  it('stops the send with a validation error when the Buyer Agent has no valid email', async () => {
    const { service, mailgunService } = buildService({
      parties: [
        makeParty(PartyRole.BUYER_AGENT, 'party-ba-1', null),
        makeParty(PartyRole.SELLER_AGENT, 'party-sa-1', 'sa@brokerage.com'),
      ],
    });
    await expect(service.sendWelcomeEmails('tx-1')).rejects.toMatchObject({
      response: { code: 'WELCOME_EMAIL_MISSING_REQUIRED_EMAIL', message: expect.stringContaining('Buyer Agent') },
    });
    expect(mailgunService.sendEmail).not.toHaveBeenCalled();
  });

  it('stops the send with a validation error when the Seller Agent has no valid email', async () => {
    const { service, mailgunService } = buildService({
      parties: [
        makeParty(PartyRole.BUYER_AGENT, 'party-ba-1', 'ba@brokerage.com'),
        makeParty(PartyRole.SELLER_AGENT, 'party-sa-1', 'not-an-email'),
      ],
    });
    await expect(service.sendWelcomeEmails('tx-1')).rejects.toMatchObject({
      response: { code: 'WELCOME_EMAIL_MISSING_REQUIRED_EMAIL', message: expect.stringContaining('Seller Agent') },
    });
    expect(mailgunService.sendEmail).not.toHaveBeenCalled();
  });

  it('stops the send when both agents are missing, listing both in the error', async () => {
    const { service, mailgunService } = buildService({ parties: [] });
    await expect(service.sendWelcomeEmails('tx-1')).rejects.toMatchObject({
      response: {
        code: 'WELCOME_EMAIL_MISSING_REQUIRED_EMAIL',
        message: expect.stringContaining('Buyer Agent'),
      },
    });
    await expect(service.sendWelcomeEmails('tx-1')).rejects.toMatchObject({
      response: { message: expect.stringContaining('Seller Agent') },
    });
    expect(mailgunService.sendEmail).not.toHaveBeenCalled();
  });

  it('does not send a second time once a welcome email has already been sent for the transaction', async () => {
    const { service, mailgunService } = buildService({ alreadySent: true });
    const sent = await service.sendWelcomeEmails('tx-1');
    expect(sent).toEqual([]);
    expect(mailgunService.sendEmail).not.toHaveBeenCalled();
  });

  it('a failed send is recorded as FAILED (not SENT) so a later retry is not blocked as a duplicate, and is audit-logged', async () => {
    const { service, mailgunService, messagesRepo, auditLogService } = buildService({ mailFails: true });
    const sent = await service.sendWelcomeEmails('tx-1');

    expect(sent).toEqual([]);
    expect(mailgunService.sendEmail).toHaveBeenCalledTimes(1);
    const saved = messagesRepo.save.mock.calls[0][0] as { status: string };
    expect(saved.status).toBe('failed');

    expect(auditLogService.log).toHaveBeenCalledWith(expect.objectContaining({
      action: AuditAction.WELCOME_TIMELINE_EMAIL_SENT,
      targetType: 'transaction',
      targetId: 'tx-1',
      details: expect.objectContaining({ status: 'failed' }),
    }));
  });

  it('defers sending while the transaction is still in Draft, even if party emails already exist', async () => {
    const { service, mailgunService } = buildService({ tx: makeTx({ status: TransactionStatus.DRAFT }) });
    const sent = await service.sendWelcomeEmails('tx-1');
    expect(sent).toEqual([]);
    expect(mailgunService.sendEmail).not.toHaveBeenCalled();
  });

  it('defers sending until required transaction documents have been uploaded', async () => {
    const { service, mailgunService } = buildService({
      formTemplate: { items: [{ formCode: 'RPA', isRequired: true }, { formCode: 'TDS', isRequired: true }] },
      uploadedDocs: [{ formCode: 'RPA' }],
    });
    const sent = await service.sendWelcomeEmails('tx-1');
    expect(sent).toEqual([]);
    expect(mailgunService.sendEmail).not.toHaveBeenCalled();
  });

  it('sends once all required transaction documents have been uploaded', async () => {
    const { service, mailgunService } = buildService({
      formTemplate: { items: [{ formCode: 'RPA', isRequired: true }, { formCode: 'TDS', isRequired: true }] },
      uploadedDocs: [{ formCode: 'RPA' }, { formCode: 'TDS' }],
    });
    const sent = await service.sendWelcomeEmails('tx-1');
    expect(sent.length).toBeGreaterThan(0);
    expect(mailgunService.sendEmail).toHaveBeenCalled();
  });

  it('treats a transaction with no resolvable form template as document-complete', async () => {
    const { service, mailgunService } = buildService({ formTemplate: null });
    const sent = await service.sendWelcomeEmails('tx-1');
    expect(sent.length).toBeGreaterThan(0);
    expect(mailgunService.sendEmail).toHaveBeenCalled();
  });

  it('builds timeline rows from contract events, using the computed deadline where data exists', async () => {
    const events = [
      makeEvent(EventType.OFFER_ACCEPTED, '2026-05-03T12:00:00Z'),
      makeEvent(EventType.CLOSING, '2026-06-15T12:00:00Z'),
      makeEvent(EventType.DISCLOSURES_DUE, '2026-05-10T12:00:00Z'),
    ];
    const { service, emailTemplateService } = buildService({ events });
    await service.sendWelcomeEmails('tx-1');
    const [, ctx] = emailTemplateService.render.mock.calls[0] as [string, { rows: { label: string; deadline: string; timeframe: string }[] }];
    expect(ctx.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'Acceptance Date', deadline: '05-03-2026', timeframe: '—' }),
      expect.objectContaining({ label: 'Close of Escrow (COE)', deadline: '06-15-2026', timeframe: 'Per contract' }),
      expect.objectContaining({ label: 'Disclosures to Be Delivered', deadline: '05-10-2026', timeframe: 'Per contract' }),
    ]));
  });

  it('omits milestones with no resolved deadline entirely — never a placeholder row', async () => {
    // Only Acceptance Date has a seeded event; the other 7 milestones (none
    // of which have a transaction_events row — whether because the contract
    // waived that contingency or because it just isn't resolved yet) must
    // not appear in the timeline at all.
    const events = [makeEvent(EventType.OFFER_ACCEPTED, '2026-05-03T12:00:00Z')];
    const { service, emailTemplateService } = buildService({ events });
    await service.sendWelcomeEmails('tx-1');
    const [, ctx] = emailTemplateService.render.mock.calls[0] as [string, { rows: { label: string; deadline: string; status: string }[] }];

    expect(ctx.rows).toHaveLength(1);
    expect(ctx.rows[0]).toMatchObject({ label: 'Acceptance Date', deadline: '05-03-2026' });
    expect(ctx.rows.some((r) => r.label === 'Loan Contingency')).toBe(false);
    expect(ctx.rows.map((r) => r.status)).not.toContain('Needs review');
    expect(ctx.rows.map((r) => r.deadline)).not.toContain('Not specified');
  });

  it('omits a waived/removed contingency from the timeline (no event row is ever seeded for it) without affecting other resolved rows', async () => {
    // Mirrors EventSeederService's real behavior: a contingency the resolver
    // reports as "No contingency" (waived) or "Removed" never gets a
    // transaction_events row at all — this only asserts the welcome email's
    // own display logic never invents a row for what has no event.
    const events = [
      makeEvent(EventType.OFFER_ACCEPTED, '2026-05-03T12:00:00Z'),
      makeEvent(EventType.INSPECTION, '2026-05-20T12:00:00Z'),
      // No LOAN_COMMITMENT or APPRAISAL event — e.g. an all-cash offer.
    ];
    const { service, emailTemplateService } = buildService({ events });
    await service.sendWelcomeEmails('tx-1');
    const [, ctx] = emailTemplateService.render.mock.calls[0] as [string, { rows: { label: string }[] }];

    const labels = ctx.rows.map((r) => r.label);
    expect(labels).toContain('Acceptance Date');
    expect(labels).toContain('Inspection Contingency');
    expect(labels).not.toContain('Loan Contingency');
    expect(labels).not.toContain('Appraisal/Insurance Contingency');
  });

  it('shows an empty-timeline message instead of any placeholder rows when no milestone has been resolved yet', async () => {
    const { service, emailTemplateService } = buildService({ events: [] });
    await service.sendWelcomeEmails('tx-1');
    const [, ctx] = emailTemplateService.render.mock.calls[0] as [string, { rows: unknown[] }];
    expect(ctx.rows).toEqual([]);
  });

  it('activates the DISCLOSURES stage once the email goes out', async () => {
    const { service, stageInstancesService } = buildService();
    await service.sendWelcomeEmails('tx-1');
    expect(stageInstancesService.activateStage).toHaveBeenCalledWith('tx-1', 'disclosures');
  });

  it('does not activate the DISCLOSURES stage when the send fails', async () => {
    const { service, stageInstancesService } = buildService({ mailFails: true });
    await service.sendWelcomeEmails('tx-1');
    expect(stageInstancesService.activateStage).not.toHaveBeenCalled();
  });

  it('records To/Cc recipients, status, timestamp, transaction ID, and provider message ID on the saved message and audit log', async () => {
    const { service, messagesRepo, auditLogService } = buildService({
      parties: [...requiredParties(), makeParty(PartyRole.SELLER_TRANSACTION_COORDINATOR, 'party-stc-1', 'stc@sellertc.com', 'Dana STC')],
    });
    await service.sendWelcomeEmails('tx-1');

    const saved = messagesRepo.save.mock.calls[0][0] as {
      transactionId: string; status: string; providerMessageId: string; sentAt: Date;
      metadataJson: { to: string[]; cc: string[] };
    };
    expect(saved.transactionId).toBe('tx-1');
    expect(saved.status).toBe('sent');
    expect(saved.providerMessageId).toBe('mg-shared-1');
    expect(saved.sentAt).toBeInstanceOf(Date);
    expect(saved.metadataJson.to.sort()).toEqual(['ba@brokerage.com', 'sa@brokerage.com'].sort());
    expect(saved.metadataJson.cc).toEqual(['stc@sellertc.com']);

    expect(auditLogService.log).toHaveBeenCalledWith(expect.objectContaining({
      action: AuditAction.WELCOME_TIMELINE_EMAIL_SENT,
      targetType: 'transaction',
      targetId: 'tx-1',
      details: expect.objectContaining({
        to: expect.arrayContaining(['ba@brokerage.com', 'sa@brokerage.com']),
        cc: ['stc@sellertc.com'],
        status: 'sent',
        providerMessageId: 'mg-shared-1',
      }),
    }));
  });

  // ── TC name source, footer, and "Not specified" elimination ────────────────

  it('sources the TC name from the transaction creator myTC account, not assignedCoordinatorAccount or any manual field', async () => {
    const { service, emailTemplateService } = buildService({
      tx: makeTx({
        createdByAccount: { displayName: 'Carla Creator', cellPhone: '555-0200', user: { email: 'carla@tc.com' } },
        // Even if a different, separately-assignable coordinator is present, it must never be used.
        assignedCoordinatorAccount: { displayName: 'Should Never Appear', cellPhone: '000', user: { email: 'wrong@tc.com' } },
      }),
    });
    await service.sendWelcomeEmails('tx-1');

    const [, ctx] = emailTemplateService.render.mock.calls[0] as [string, { tcName: string; tcPhone: string; transactionEmail: string }];
    expect(ctx.tcName).toBe('Carla Creator');
    expect(ctx.tcPhone).toBe('555-0200');
    // The email is the transaction Mailgun address — never the TC's myTC login email.
    expect(ctx.transactionEmail).toBe('tx-1@txn.mytcapp.net');
    expect(ctx.transactionEmail).not.toBe('carla@tc.com');
  });

  it('passes the transaction ID through to the template context for the footer', async () => {
    const { service, emailTemplateService } = buildService({ tx: makeTx({ id: 'tx-footer-id-123' }) });
    await service.sendWelcomeEmails('tx-footer-id-123');

    for (const call of emailTemplateService.render.mock.calls) {
      const [, ctx] = call as [string, { transactionId: string }];
      expect(ctx.transactionId).toBe('tx-footer-id-123');
    }
  });

  it('never falls back to "Not specified" (or similar placeholder text) for TC name, phone, or email — passes null instead', async () => {
    const { service, emailTemplateService } = buildService({
      tx: makeTx({ createdByAccount: { displayName: null, firstName: null, cellPhone: null, user: { email: null } } }),
    });
    await service.sendWelcomeEmails('tx-1');

    const [, ctx] = emailTemplateService.render.mock.calls[0] as [string, { tcName: unknown; tcPhone: unknown; transactionEmail: unknown }];
    expect(ctx.tcName).toBeFalsy();
    expect(ctx.tcPhone).toBeFalsy();
    // The email still comes from the transaction's Mailgun address, independent of the account.
    expect(ctx.transactionEmail).toBe('tx-1@txn.mytcapp.net');
    expect(ctx.tcName).not.toBe('Not specified');
    expect(ctx.tcPhone).not.toBe('Not specified');
    expect(ctx.transactionEmail).not.toBe('Not specified');
  });

  it('logs the missing-account-name condition for debugging when the creator account has no resolvable name', async () => {
    const { service } = buildService({
      tx: makeTx({ createdByAccountId: 'creator-with-no-name', createdByAccount: { displayName: null, firstName: null, cellPhone: null, user: null } }),
    });
    const loggerWarnSpy = jest.spyOn((service as unknown as { logger: { warn: (msg: string) => void } }).logger, 'warn').mockImplementation();
    await service.sendWelcomeEmails('tx-1');

    expect(loggerWarnSpy).toHaveBeenCalledWith(expect.stringContaining('creator-with-no-name'));
    loggerWarnSpy.mockRestore();
  });
});

describe('TransactionWelcomeEmailService.sendBuyerWelcomeEmail', () => {
  it("sends the Buyer Welcome + Timeline email to the Buyer, cc'ing the Buyer Agent", async () => {
    const { service, mailgunService, messagesRepo } = buildService({
      parties: [...requiredParties(), makeParty(PartyRole.BUYER, 'party-buyer-1', 'jane@buyer.com', 'Jane Buyer')],
      events: [makeEvent(EventType.OFFER_ACCEPTED, '2026-05-03T12:00:00Z')],
    });
    const sent = await service.sendBuyerWelcomeEmail('tx-1');

    expect(mailgunService.sendEmail).toHaveBeenCalledTimes(1);
    const [to, subject, , , , cc] = mailgunService.sendEmail.mock.calls[0];
    expect(to).toEqual(['jane@buyer.com']);
    expect(cc).toEqual(['ba@brokerage.com']);
    expect(subject).toContain('Welcome to Your Transaction & Timeline');
    expect(sent.sort()).toEqual(['ba@brokerage.com', 'jane@buyer.com'].sort());
    expect(messagesRepo.save).toHaveBeenCalledTimes(1);
  });

  it('includes all Buyers as recipients when there are multiple Buyers on the transaction', async () => {
    const { service, mailgunService } = buildService({
      parties: [
        ...requiredParties(),
        makeParty(PartyRole.BUYER, 'party-buyer-1', 'jane@buyer.com', 'Jane Buyer'),
        makeParty(PartyRole.BUYER, 'party-buyer-2', 'john@buyer.com', 'John Buyer'),
      ],
    });
    await service.sendBuyerWelcomeEmail('tx-1');

    const [to] = mailgunService.sendEmail.mock.calls[0];
    expect(to.sort()).toEqual(['jane@buyer.com', 'john@buyer.com'].sort());
  });

  it('never includes the Seller, Seller Agent, or Seller Transaction Coordinator in To or Cc, even with valid emails', async () => {
    const { service, mailgunService, messagesRepo } = buildService({
      parties: [
        ...requiredParties(),
        makeParty(PartyRole.BUYER, 'party-buyer-1', 'jane@buyer.com', 'Jane Buyer'),
        makeParty(PartyRole.SELLER, 'party-seller-1', 'sam@seller.com', 'Sam Seller'),
        makeParty(PartyRole.SELLER_TRANSACTION_COORDINATOR, 'party-stc-1', 'stc@sellertc.com', 'Dana STC'),
      ],
    });
    await service.sendBuyerWelcomeEmail('tx-1');

    const [to, , , , , cc] = mailgunService.sendEmail.mock.calls[0];
    const allRecipients = [...to, ...(cc ?? [])];
    expect(allRecipients).not.toContain('sam@seller.com');
    expect(allRecipients).not.toContain('sa@brokerage.com');
    expect(allRecipients).not.toContain('stc@sellertc.com');

    const saved = messagesRepo.save.mock.calls[0][0] as { metadataJson: { to: string[]; cc: string[] } };
    expect(saved.metadataJson.to).toEqual(['jane@buyer.com']);
    expect(saved.metadataJson.cc).toEqual(['ba@brokerage.com']);
  });

  it('omits the Buyer Agent from Cc (and logs it) when missing a valid email — send still proceeds to the Buyer(s)', async () => {
    const { service, mailgunService, messagesRepo } = buildService({
      parties: [
        makeParty(PartyRole.BUYER_AGENT, 'party-ba-1', null, 'Alice Agent'),
        makeParty(PartyRole.BUYER, 'party-buyer-1', 'jane@buyer.com', 'Jane Buyer'),
      ],
    });
    const sent = await service.sendBuyerWelcomeEmail('tx-1');

    expect(mailgunService.sendEmail).toHaveBeenCalledTimes(1);
    const [to, , , , , cc] = mailgunService.sendEmail.mock.calls[0];
    expect(to).toEqual(['jane@buyer.com']);
    expect(cc ?? []).toEqual([]);
    expect(sent).toEqual(['jane@buyer.com']);

    const saved = messagesRepo.save.mock.calls[0][0] as { metadataJson: { omitted: { role: string; reason: string }[] } };
    expect(saved.metadataJson.omitted).toEqual([{ role: 'Buyer Agent', reason: 'no valid email on file' }]);
  });

  it('skips the send entirely when there is no Buyer with a valid email — no Mailgun call, no message row', async () => {
    const { service, mailgunService, messagesRepo } = buildService({
      parties: requiredParties(), // Buyer Agent + Seller Agent only, no Buyer
    });
    const sent = await service.sendBuyerWelcomeEmail('tx-1');

    expect(sent).toEqual([]);
    expect(mailgunService.sendEmail).not.toHaveBeenCalled();
    expect(messagesRepo.save).not.toHaveBeenCalled();
  });

  it('removes duplicate email addresses and never places the same recipient in both To and Cc', async () => {
    const { service, mailgunService } = buildService({
      parties: [
        makeParty(PartyRole.BUYER_AGENT, 'party-ba-1', 'shared@example.com'),
        // Buyer happens to share an email with the Buyer Agent — dropped from Cc, kept in To.
        makeParty(PartyRole.BUYER, 'party-buyer-1', 'shared@example.com'),
      ],
    });
    await service.sendBuyerWelcomeEmail('tx-1');

    const [to, , , , , cc] = mailgunService.sendEmail.mock.calls[0];
    expect(to).toEqual(['shared@example.com']);
    expect(cc ?? []).toEqual([]);
  });

  it("uses the transaction's outbound Mailgun address for From, never the TC's personal account email", async () => {
    const { service, mailgunService } = buildService({
      tx: makeTx({ outboundEmailAddress: 'tx-1@txn.mytcapp.net' }),
      parties: [...requiredParties(), makeParty(PartyRole.BUYER, 'party-buyer-1', 'jane@buyer.com')],
    });
    await service.sendBuyerWelcomeEmail('tx-1');

    const [, , , , fromAddress] = mailgunService.sendEmail.mock.calls[0];
    expect(fromAddress).toContain('tx-1@txn.mytcapp.net');
    expect(fromAddress).not.toContain('alice@tc.com');
  });

  it('passes the Transaction ID through to the template context for the footer', async () => {
    const { service, emailTemplateService } = buildService({
      tx: makeTx({ id: 'tx-footer-id-123' }),
      parties: [...requiredParties(), makeParty(PartyRole.BUYER, 'party-buyer-1', 'jane@buyer.com')],
    });
    await service.sendBuyerWelcomeEmail('tx-footer-id-123');

    for (const call of emailTemplateService.render.mock.calls) {
      const [, ctx] = call as [string, { transactionId: string }];
      expect(ctx.transactionId).toBe('tx-footer-id-123');
    }
  });

  it('reuses the same timeline-filtering rules as the agent-facing email — omits unresolved milestones, never a placeholder row', async () => {
    const events = [makeEvent(EventType.OFFER_ACCEPTED, '2026-05-03T12:00:00Z')];
    const { service, emailTemplateService } = buildService({
      parties: [...requiredParties(), makeParty(PartyRole.BUYER, 'party-buyer-1', 'jane@buyer.com')],
      events,
    });
    await service.sendBuyerWelcomeEmail('tx-1');
    const [, ctx] = emailTemplateService.render.mock.calls[0] as [string, { rows: { label: string; deadline: string; status: string }[] }];

    expect(ctx.rows).toHaveLength(1);
    expect(ctx.rows[0]).toMatchObject({ label: 'Acceptance Date', deadline: '05-03-2026' });
    expect(ctx.rows.some((r) => r.label === 'Loan Contingency')).toBe(false);
    expect(ctx.rows.map((r) => r.status)).not.toContain('Needs review');
    expect(ctx.rows.map((r) => r.deadline)).not.toContain('Not specified');
  });

  it('does not send a second time once a Buyer welcome email has already been sent for the transaction', async () => {
    const { service, mailgunService } = buildService({
      parties: [...requiredParties(), makeParty(PartyRole.BUYER, 'party-buyer-1', 'jane@buyer.com')],
      alreadySent: true,
    });
    const sent = await service.sendBuyerWelcomeEmail('tx-1');
    expect(sent).toEqual([]);
    expect(mailgunService.sendEmail).not.toHaveBeenCalled();
  });

  it("checks idempotency using its own subject prefix, independent of the agent-facing welcome email's dedupe check", async () => {
    const { service, messagesRepo } = buildService({
      parties: [...requiredParties(), makeParty(PartyRole.BUYER, 'party-buyer-1', 'jane@buyer.com')],
    });
    await service.sendBuyerWelcomeEmail('tx-1');

    expect(messagesRepo.findOne).toHaveBeenCalledWith({
      where: { transactionId: 'tx-1', subject: Like('Welcome to Your Transaction & Timeline%'), status: 'sent' },
    });
    expect(messagesRepo.findOne).not.toHaveBeenCalledWith({
      where: { transactionId: 'tx-1', subject: Like('Welcome to Escrow & Transaction Timeline%'), status: 'sent' },
    });
  });

  it('a failed send is recorded as FAILED (not SENT) so a later retry is not blocked as a duplicate, and is audit-logged', async () => {
    const { service, mailgunService, messagesRepo, auditLogService } = buildService({
      parties: [...requiredParties(), makeParty(PartyRole.BUYER, 'party-buyer-1', 'jane@buyer.com')],
      mailFails: true,
    });
    const sent = await service.sendBuyerWelcomeEmail('tx-1');

    expect(sent).toEqual([]);
    expect(mailgunService.sendEmail).toHaveBeenCalledTimes(1);
    const saved = messagesRepo.save.mock.calls[0][0] as { status: string };
    expect(saved.status).toBe('failed');

    expect(auditLogService.log).toHaveBeenCalledWith(expect.objectContaining({
      action: AuditAction.BUYER_WELCOME_TIMELINE_EMAIL_SENT,
      targetType: 'transaction',
      targetId: 'tx-1',
      details: expect.objectContaining({ status: 'failed' }),
    }));
  });

  it('records To/Cc recipients, status, timestamp, transaction ID, and provider message ID on the saved message and audit log', async () => {
    const { service, messagesRepo, auditLogService } = buildService({
      parties: [...requiredParties(), makeParty(PartyRole.BUYER, 'party-buyer-1', 'jane@buyer.com')],
    });
    await service.sendBuyerWelcomeEmail('tx-1');

    const saved = messagesRepo.save.mock.calls[0][0] as {
      transactionId: string; status: string; providerMessageId: string; sentAt: Date;
      metadataJson: { to: string[]; cc: string[]; type: string };
    };
    expect(saved.transactionId).toBe('tx-1');
    expect(saved.status).toBe('sent');
    expect(saved.providerMessageId).toBe('mg-shared-1');
    expect(saved.sentAt).toBeInstanceOf(Date);
    expect(saved.metadataJson.type).toBe('buyer_welcome_timeline');
    expect(saved.metadataJson.to).toEqual(['jane@buyer.com']);
    expect(saved.metadataJson.cc).toEqual(['ba@brokerage.com']);

    expect(auditLogService.log).toHaveBeenCalledWith(expect.objectContaining({
      action: AuditAction.BUYER_WELCOME_TIMELINE_EMAIL_SENT,
      targetType: 'transaction',
      targetId: 'tx-1',
      details: expect.objectContaining({
        to: ['jane@buyer.com'],
        cc: ['ba@brokerage.com'],
        status: 'sent',
        providerMessageId: 'mg-shared-1',
      }),
    }));
  });
});

describe('TransactionWelcomeEmailService — real template rendering', () => {
  const realTemplateService = new EmailTemplateService();

  function renderBoth(ctx: Record<string, unknown>) {
    return {
      html: realTemplateService.render('transaction-welcome.html.hbs', ctx),
      text: realTemplateService.render('transaction-welcome.text.hbs', ctx),
    };
  }

  const baseCtx = {
    propertyAddress: '123 Main St, Chino, CA',
    txNumber: 'TXN-2026-0001',
    transactionId: 'tx-real-1',
    buyerAgentName: 'Bob Agent',
    rows: [],
  };

  it('never renders "Not specified" (or N/A / Unknown) anywhere when TC name, phone, and email are all missing', () => {
    const { html, text } = renderBoth({ ...baseCtx, tcName: null, tcPhone: null, transactionEmail: null });
    for (const rendered of [html, text]) {
      expect(rendered).not.toContain('Not specified');
      expect(rendered).not.toMatch(/\bN\/A\b/);
      expect(rendered).not.toContain('Unknown');
    }
  });

  it('always includes the Transaction ID in the footer', () => {
    const { html, text } = renderBoth({ ...baseCtx, tcName: 'Alice TC', tcPhone: '555-0100', transactionEmail: 'tx-1@txn.mytcapp.net' });
    expect(html).toContain('Transaction ID: tx-real-1');
    expect(text).toContain('Transaction ID: tx-real-1');
  });

  it('includes the Transaction Coordinator name in the footer when available, sourced consistently with the body/signature', () => {
    const { html, text } = renderBoth({ ...baseCtx, tcName: 'Alice TC', tcPhone: '555-0100', transactionEmail: 'tx-1@txn.mytcapp.net' });
    for (const rendered of [html, text]) {
      expect(rendered).toContain('Transaction Coordinator: Alice TC');
      // Same source used in the body greeting and signature block.
      expect(rendered).toMatch(/My name is (<strong>)?Alice TC/);
      expect(rendered.match(/Alice TC/g)?.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('renders the transaction Mailgun address — never the TC account email — in the signature and footer', () => {
    const { html, text } = renderBoth({
      ...baseCtx,
      tcName: 'Alice TC',
      tcPhone: '555-0100',
      // A tcEmail key (the TC's myTC login email) is never expected; the template
      // must only surface the transaction Mailgun address via transactionEmail.
      tcEmail: 'alice@tc.com',
      transactionEmail: 'tx-1@txn.mytcapp.net',
    });
    for (const rendered of [html, text]) {
      expect(rendered).not.toContain('alice@tc.com');
      expect(rendered).toContain('tx-1@txn.mytcapp.net');
      expect(rendered).toContain('Transaction Email: tx-1@txn.mytcapp.net');
    }
  });

  it('omits the footer Transaction Coordinator line entirely (never a placeholder) when the TC name is missing', () => {
    const { html, text } = renderBoth({ ...baseCtx, tcName: null, tcPhone: null, transactionEmail: null });
    for (const rendered of [html, text]) {
      expect(rendered).not.toContain('Transaction Coordinator: ');
      expect(rendered).toContain('Transaction ID: tx-real-1');
    }
  });

  it('includes prominent instructions that Buyer Agent and Seller Agent get a separate upload-link email, and not to send documents by replying', () => {
    const { html, text } = renderBoth({ ...baseCtx, tcName: 'Alice TC', tcPhone: '555-0100', transactionEmail: 'tx-1@txn.mytcapp.net' });
    for (const rendered of [html, text]) {
      expect(rendered).toMatch(/separate email.*secure upload link/i);
      expect(rendered).toMatch(/do not send or attach documents/i);
    }
  });

  it('renders only resolved timeline rows and never "Needs Review", "Not specified", "N/A", or a blank deadline for any milestone', () => {
    const rows = [
      { label: 'Acceptance Date', deadline: '05-03-2026', timeframe: '—', status: 'Completed' },
      { label: 'Inspection Contingency', deadline: '05-20-2026', timeframe: 'Calendar days per contract', status: '5 days remaining' },
    ];
    const { html, text } = renderBoth({ ...baseCtx, tcName: 'Alice TC', tcPhone: '555-0100', transactionEmail: 'tx-1@txn.mytcapp.net', rows });
    for (const rendered of [html, text]) {
      expect(rendered).toContain('Acceptance Date');
      expect(rendered).toContain('Inspection Contingency');
      // Milestones the caller didn't include (e.g. a waived Loan Contingency) never appear.
      expect(rendered).not.toContain('Loan Contingency');
      expect(rendered).not.toContain('Appraisal/Insurance Contingency');
      expect(rendered).not.toMatch(/needs review/i);
      expect(rendered).not.toContain('Not specified');
      expect(rendered).not.toMatch(/\bN\/A\b/);
      expect(rendered).not.toContain('⚠');
    }
  });

  it('shows the "timeline will be provided" fallback message, never a placeholder table, when no milestone has been resolved yet', () => {
    const { html, text } = renderBoth({ ...baseCtx, tcName: 'Alice TC', tcPhone: '555-0100', transactionEmail: 'tx-1@txn.mytcapp.net', rows: [] });
    for (const rendered of [html, text]) {
      expect(rendered).toContain('Timeline details will be provided as documents are finalized.');
      expect(rendered).not.toMatch(/needs review/i);
      expect(rendered).not.toContain('Not specified');
    }
  });
});
