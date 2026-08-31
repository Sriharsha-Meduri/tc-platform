import { TransactionsService } from './transactions.service';
import { TransactionStatus } from './entities/transaction.entity';
import { MemberRole, MembershipStatus } from '../organizations/entities/organization-membership.entity';
import { PartyRole } from '../transaction-parties/entities/transaction-party.entity';

// ── Mock helpers ───────────────────────────────────────────────────────────────

function makeTx(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tx-1',
    transactionNumber: 'TXN-2026-0001',
    organizationId: 'org-1',
    createdByAccountId: 'account-creator',
    assignedCoordinatorAccountId: null,
    buyerAgentAccountId: null,
    status: TransactionStatus.ACTIVE,
    ...overrides,
  };
}

function makeMembership(role: MemberRole, organizationId = 'org-1', status = MembershipStatus.ACTIVE) {
  return { accountId: 'account-x', organizationId, role, status };
}

/** A party linked via `accountId` — the (rare/never-populated-in-practice) direct-link case. */
function makeParty(role: PartyRole, transactionId: string) {
  return { accountId: 'account-x', partyRole: role, transactionId, email: null as string | null };
}

/** A party that only has `displayName`/`email` set — no `accountId` link — the realistic, common case. */
function makePartyByEmail(role: PartyRole, transactionId: string, email: string) {
  return { accountId: null as string | null, partyRole: role, transactionId, email };
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

/** Filters by whichever key (accountId or email) the service's query used, plus the partyRole In(...) list — extracts the real values out of TypeORM's FindOperators to do a genuine comparison, same as Postgres would. */
function makePartiesRepoFake(parties: Array<{ accountId: string | null; partyRole: PartyRole; transactionId: string; email: string | null }>) {
  return mockRepo({
    find: jest.fn(async ({ where }: { where: { accountId?: string; email?: { value?: string }; partyRole?: { value?: PartyRole[] } } }) => {
      const allowedRoles = where.partyRole?.value ?? [];
      const roleMatch = (p: (typeof parties)[number]) => allowedRoles.includes(p.partyRole);

      if (where.accountId !== undefined) {
        return parties.filter((p) => p.accountId === where.accountId && roleMatch(p));
      }
      if (where.email !== undefined) {
        const target = (where.email.value ?? '').toLowerCase();
        return parties.filter((p) => p.email?.toLowerCase() === target && roleMatch(p));
      }
      return [];
    }),
  });
}

function buildService(deps: {
  transactions?: ReturnType<typeof makeTx>[];
  memberships?: ReturnType<typeof makeMembership>[];
  parties?: Array<ReturnType<typeof makeParty> | ReturnType<typeof makePartyByEmail>>;
  /** The account's own email, as it'd be resolved via AccountsService.findOne(id).user.email. */
  accountEmail?: string | null;
  /** Row returned by `findOne` (used by setBuyerSideReminderLeadTime and friends). */
  transactionForFindOne?: ReturnType<typeof makeTx> | null;
} = {}) {
  const transactionsRepo = mockRepo({
    find: jest.fn().mockResolvedValue(deps.transactions ?? []),
    findOne: jest.fn().mockResolvedValue(deps.transactionForFindOne !== undefined ? deps.transactionForFindOne : null),
  });
  const membershipRepo = mockRepo({ find: jest.fn().mockResolvedValue(deps.memberships ?? []) });
  const partiesRepo = makePartiesRepoFake(deps.parties ?? []);
  const accountsService = {
    findOne: jest.fn().mockResolvedValue(
      deps.accountEmail === undefined ? null : { id: ACCOUNT, user: { email: deps.accountEmail } },
    ),
  };
  const accessGrantsService = { findActiveByAccount: jest.fn().mockResolvedValue([]) };
  const auditLogService = { log: jest.fn().mockResolvedValue(undefined) };
  const vpReminderScheduler = { rescheduleForNewLeadTime: jest.fn().mockResolvedValue(undefined) };
  const sellerSideReminderScheduler = { rescheduleForNewLeadTime: jest.fn().mockResolvedValue(undefined) };
  const externalTransactionInformationService = { recalculateCommissionsForContractPriceChange: jest.fn().mockResolvedValue(undefined) };
  const cdaGenerationService = { maybeGenerateCda: jest.fn().mockResolvedValue(null) };
  const cdaNotificationService = { notifyIfCdaReady: jest.fn().mockResolvedValue(undefined) };

  const service = new TransactionsService(
    transactionsRepo as never,
    membershipRepo as never,
    partiesRepo as never,
    accountsService as never,
    accessGrantsService as never,
    auditLogService as never,
    vpReminderScheduler as never,
    sellerSideReminderScheduler as never,
    externalTransactionInformationService as never,
    cdaGenerationService as never,
    cdaNotificationService as never,
  );

  return { service, transactionsRepo, membershipRepo, partiesRepo, auditLogService, vpReminderScheduler, sellerSideReminderScheduler, externalTransactionInformationService, cdaGenerationService, cdaNotificationService };
}

const ACCOUNT = 'account-x';

describe('TransactionsService — QA-delete access control', () => {
  // All tests below exercise the strict, production rule set. The
  // non-production "unrestricted" bypass is covered separately at the
  // bottom of this file.
  const originalAppEnv = process.env.APP_ENV;
  beforeEach(() => { process.env.APP_ENV = 'production'; });
  afterEach(() => { process.env.APP_ENV = originalAppEnv; });

  describe('canAccountManageTransactionForQa', () => {
    it('allows the transaction creator', async () => {
      const { service } = buildService();
      const tx = makeTx({ createdByAccountId: ACCOUNT });
      expect(await service.canAccountManageTransactionForQa(tx as never, ACCOUNT)).toBe(true);
    });

    it('allows the assigned coordinator (TC)', async () => {
      const { service } = buildService();
      const tx = makeTx({ createdByAccountId: 'someone-else', assignedCoordinatorAccountId: ACCOUNT });
      expect(await service.canAccountManageTransactionForQa(tx as never, ACCOUNT)).toBe(true);
    });

    it('allows the assigned buyer agent', async () => {
      const { service } = buildService();
      const tx = makeTx({ createdByAccountId: 'someone-else', buyerAgentAccountId: ACCOUNT });
      expect(await service.canAccountManageTransactionForQa(tx as never, ACCOUNT)).toBe(true);
    });

    it('allows a broker-admin membership to manage every transaction in their brokerage', async () => {
      const { service } = buildService({
        memberships: [makeMembership(MemberRole.BROKER_ADMIN, 'org-1')],
      });
      const tx = makeTx({ createdByAccountId: 'someone-else', organizationId: 'org-1' });
      expect(await service.canAccountManageTransactionForQa(tx as never, ACCOUNT)).toBe(true);
    });

    it('does not let a broker-admin in a different org manage this transaction', async () => {
      const { service } = buildService({
        memberships: [makeMembership(MemberRole.BROKER_ADMIN, 'org-999')],
      });
      const tx = makeTx({ createdByAccountId: 'someone-else', organizationId: 'org-1' });
      expect(await service.canAccountManageTransactionForQa(tx as never, ACCOUNT)).toBe(false);
    });

    it('does not let a plain agent/TC membership (no broker_admin) see the whole org', async () => {
      const { service } = buildService({
        memberships: [makeMembership(MemberRole.AGENT, 'org-1')],
      });
      const tx = makeTx({ createdByAccountId: 'someone-else', organizationId: 'org-1' });
      expect(await service.canAccountManageTransactionForQa(tx as never, ACCOUNT)).toBe(false);
    });

    it('allows an agent who is a buyer-agent or seller-agent party on the transaction', async () => {
      const { service } = buildService({
        parties: [makeParty(PartyRole.SELLER_AGENT, 'tx-1')],
      });
      const tx = makeTx({ id: 'tx-1', createdByAccountId: 'someone-else' });
      expect(await service.canAccountManageTransactionForQa(tx as never, ACCOUNT)).toBe(true);
    });

    it('allows a TC who is a buyer-TC or seller-TC party on the transaction', async () => {
      const { service } = buildService({
        parties: [makeParty(PartyRole.SELLER_TRANSACTION_COORDINATOR, 'tx-1')],
      });
      const tx = makeTx({ id: 'tx-1', createdByAccountId: 'someone-else' });
      expect(await service.canAccountManageTransactionForQa(tx as never, ACCOUNT)).toBe(true);
    });

    it('denies access when there is no relationship to the transaction at all', async () => {
      const { service } = buildService({
        memberships: [makeMembership(MemberRole.AGENT, 'org-1')],
        parties: [makeParty(PartyRole.BUYER_AGENT, 'tx-other')],
      });
      const tx = makeTx({ id: 'tx-1', createdByAccountId: 'someone-else', organizationId: 'org-1' });
      expect(await service.canAccountManageTransactionForQa(tx as never, ACCOUNT)).toBe(false);
    });

    it('does not grant access via a party row on an unrelated transaction', async () => {
      const { service } = buildService({
        parties: [makeParty(PartyRole.BUYER_AGENT, 'tx-unrelated')],
      });
      const tx = makeTx({ id: 'tx-1', createdByAccountId: 'someone-else' });
      expect(await service.canAccountManageTransactionForQa(tx as never, ACCOUNT)).toBe(false);
    });

    // Party rows created via contract submission only ever get displayName/email —
    // nothing in the app links TransactionPartyEntity.accountId to a real account.
    // A TC/agent named as a party (but never accountId-linked) must still be
    // recognized via their account's own email matching the party's email.
    it('allows a TC whose account email matches a Seller TC party email, even with no accountId link on the party row', async () => {
      const { service } = buildService({
        parties: [makePartyByEmail(PartyRole.SELLER_TRANSACTION_COORDINATOR, 'tx-1', 'avni@sunsetrealty.com')],
        accountEmail: 'avni@sunsetrealty.com',
      });
      const tx = makeTx({ id: 'tx-1', createdByAccountId: 'someone-else' });
      expect(await service.canAccountManageTransactionForQa(tx as never, ACCOUNT)).toBe(true);
    });

    it('allows an agent whose account email matches a Buyer Agent party email, even with no accountId link', async () => {
      const { service } = buildService({
        parties: [makePartyByEmail(PartyRole.BUYER_AGENT, 'tx-1', 'agent@brokerage.com')],
        accountEmail: 'AGENT@Brokerage.com', // case-insensitive match
      });
      const tx = makeTx({ id: 'tx-1', createdByAccountId: 'someone-else' });
      expect(await service.canAccountManageTransactionForQa(tx as never, ACCOUNT)).toBe(true);
    });

    it('does not grant access via email match on an unrelated transaction', async () => {
      const { service } = buildService({
        parties: [makePartyByEmail(PartyRole.SELLER_TRANSACTION_COORDINATOR, 'tx-other', 'avni@sunsetrealty.com')],
        accountEmail: 'avni@sunsetrealty.com',
      });
      const tx = makeTx({ id: 'tx-1', createdByAccountId: 'someone-else' });
      expect(await service.canAccountManageTransactionForQa(tx as never, ACCOUNT)).toBe(false);
    });

    it('does not grant access via email match for a party role that is not agent/TC (e.g. Buyer)', async () => {
      const { service } = buildService({
        parties: [makePartyByEmail(PartyRole.BUYER, 'tx-1', 'buyer@example.com')],
        accountEmail: 'buyer@example.com',
      });
      const tx = makeTx({ id: 'tx-1', createdByAccountId: 'someone-else' });
      expect(await service.canAccountManageTransactionForQa(tx as never, ACCOUNT)).toBe(false);
    });

    it('does not blow up and denies access when the account cannot be resolved for email lookup', async () => {
      const { service } = buildService({
        parties: [makePartyByEmail(PartyRole.SELLER_TRANSACTION_COORDINATOR, 'tx-1', 'avni@sunsetrealty.com')],
        accountEmail: undefined, // AccountsService.findOne resolves null
      });
      const tx = makeTx({ id: 'tx-1', createdByAccountId: 'someone-else' });
      expect(await service.canAccountManageTransactionForQa(tx as never, ACCOUNT)).toBe(false);
    });
  });

  describe('findQaDeletableTransactions', () => {
    it('returns only transactions associated with the account — never unrelated ones', async () => {
      const mine = makeTx({ id: 'tx-mine', createdByAccountId: ACCOUNT });
      const assigned = makeTx({ id: 'tx-assigned', createdByAccountId: 'someone-else', assignedCoordinatorAccountId: ACCOUNT });
      const unrelated = makeTx({ id: 'tx-unrelated', createdByAccountId: 'someone-else', organizationId: 'org-999' });

      const { service } = buildService({ transactions: [mine, assigned, unrelated] });
      const result = await service.findQaDeletableTransactions(ACCOUNT);

      expect(result.map((t) => t.id).sort()).toEqual(['tx-assigned', 'tx-mine']);
    });

    it("returns every transaction in a broker's brokerage, regardless of individual assignment", async () => {
      const inBrokerage1 = makeTx({ id: 'tx-1', organizationId: 'org-1', createdByAccountId: 'someone-else' });
      const inBrokerage2 = makeTx({ id: 'tx-2', organizationId: 'org-1', createdByAccountId: 'someone-else-2' });
      const otherOrg = makeTx({ id: 'tx-3', organizationId: 'org-2', createdByAccountId: 'someone-else-3' });

      const { service } = buildService({
        transactions: [inBrokerage1, inBrokerage2, otherOrg],
        memberships: [makeMembership(MemberRole.BROKER_ADMIN, 'org-1')],
      });
      const result = await service.findQaDeletableTransactions(ACCOUNT);

      expect(result.map((t) => t.id).sort()).toEqual(['tx-1', 'tx-2']);
    });

    it('excludes cancelled transactions entirely, even ones the account is directly assigned to', async () => {
      const { service, transactionsRepo } = buildService({ transactions: [] });
      await service.findQaDeletableTransactions(ACCOUNT);
      expect(transactionsRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ status: expect.anything() }) }),
      );
    });

    it('produces the same result set that canAccountManageTransactionForQa would authorize per-transaction (list/delete parity)', async () => {
      const mine = makeTx({ id: 'tx-mine', createdByAccountId: ACCOUNT });
      const unrelated = makeTx({ id: 'tx-unrelated', createdByAccountId: 'someone-else' });

      const { service } = buildService({ transactions: [mine, unrelated] });
      const listed = await service.findQaDeletableTransactions(ACCOUNT);
      const listedIds = new Set(listed.map((t) => t.id));

      for (const tx of [mine, unrelated]) {
        const allowed = await service.canAccountManageTransactionForQa(tx as never, ACCOUNT);
        expect(listedIds.has(tx.id)).toBe(allowed);
      }
    });
  });

  describe('outside production (APP_ENV !== "production")', () => {
    // Local QA testing routinely switches between several seeded dev logins
    // across sessions — the strict createdByAccountId/party/broker rule set
    // would silently orphan transactions created under a different login.
    // Non-production environments have no real security boundary to
    // protect, so every non-cancelled transaction is visible/deletable
    // regardless of who created it or the current account's relationship to it.
    for (const env of [undefined, 'local', 'dev'] as const) {
      it(`unconditionally allows management of an unrelated transaction when APP_ENV=${env}`, async () => {
        process.env.APP_ENV = env;
        try {
          const { service } = buildService();
          const tx = makeTx({ createdByAccountId: 'someone-else-entirely' });
          expect(await service.canAccountManageTransactionForQa(tx as never, ACCOUNT)).toBe(true);
        } finally {
          process.env.APP_ENV = originalAppEnv;
        }
      });

      it(`returns every non-cancelled transaction regardless of creator when APP_ENV=${env}`, async () => {
        process.env.APP_ENV = env;
        try {
          const mine = makeTx({ id: 'tx-mine', createdByAccountId: ACCOUNT });
          const unrelated = makeTx({ id: 'tx-unrelated', createdByAccountId: 'someone-else', organizationId: 'org-999' });
          const { service } = buildService({ transactions: [mine, unrelated] });

          const result = await service.findQaDeletableTransactions(ACCOUNT);

          expect(result.map((t) => t.id).sort()).toEqual(['tx-mine', 'tx-unrelated']);
        } finally {
          process.env.APP_ENV = originalAppEnv;
        }
      });
    }

    it('still enforces the strict rule set once APP_ENV=production, even after a non-production run in the same process', async () => {
      process.env.APP_ENV = 'production';
      try {
        const { service } = buildService();
        const tx = makeTx({ createdByAccountId: 'someone-else-entirely' });
        expect(await service.canAccountManageTransactionForQa(tx as never, ACCOUNT)).toBe(false);
      } finally {
        process.env.APP_ENV = originalAppEnv;
      }
    });
  });
});

describe('TransactionsService.setBuyerSideReminderLeadTime', () => {
  it('rejects a negative lead time without touching the DB or audit log', async () => {
    const { service, transactionsRepo, auditLogService } = buildService({
      transactionForFindOne: makeTx({ buyerSideReminderLeadDays: null }),
    });

    await expect(service.setBuyerSideReminderLeadTime('tx-1', -1)).rejects.toThrow();

    expect(transactionsRepo.save).not.toHaveBeenCalled();
    expect(auditLogService.log).not.toHaveBeenCalled();
  });

  it('rejects a non-integer lead time', async () => {
    const { service } = buildService({ transactionForFindOne: makeTx({ buyerSideReminderLeadDays: null }) });
    await expect(service.setBuyerSideReminderLeadTime('tx-1', 2.5)).rejects.toThrow();
  });

  it('is a no-op (no save, no audit, no reschedule) when the new value equals the current value', async () => {
    const { service, transactionsRepo, auditLogService, vpReminderScheduler } = buildService({
      transactionForFindOne: makeTx({ buyerSideReminderLeadDays: 5 }),
    });

    await service.setBuyerSideReminderLeadTime('tx-1', 5);

    expect(transactionsRepo.save).not.toHaveBeenCalled();
    expect(auditLogService.log).not.toHaveBeenCalled();
    expect(vpReminderScheduler.rescheduleForNewLeadTime).not.toHaveBeenCalled();
  });

  it('saves the new value, writes a diff-guarded audit entry, and reschedules the pending VP reminder when the value changes', async () => {
    const { service, transactionsRepo, auditLogService, vpReminderScheduler } = buildService({
      transactionForFindOne: makeTx({ buyerSideReminderLeadDays: null }),
    });

    const result = await service.setBuyerSideReminderLeadTime('tx-1', 7);

    expect(result.buyerSideReminderLeadDays).toBe(7);
    expect(transactionsRepo.save).toHaveBeenCalledWith(expect.objectContaining({ buyerSideReminderLeadDays: 7 }));
    expect(auditLogService.log).toHaveBeenCalledWith(expect.objectContaining({
      action: 'buyer_side_reminder_lead_time_updated',
      details: expect.objectContaining({ previousValue: null, newValue: 7 }),
    }));
    expect(vpReminderScheduler.rescheduleForNewLeadTime).toHaveBeenCalledWith('tx-1');
  });
});

describe('TransactionsService.setSellerSideReminderLeadTime', () => {
  it('rejects a negative lead time without touching the DB or audit log', async () => {
    const { service, transactionsRepo, auditLogService } = buildService({
      transactionForFindOne: makeTx({ sellerSideReminderLeadDays: null }),
    });

    await expect(service.setSellerSideReminderLeadTime('tx-1', -1)).rejects.toThrow();

    expect(transactionsRepo.save).not.toHaveBeenCalled();
    expect(auditLogService.log).not.toHaveBeenCalled();
  });

  it('rejects a non-integer lead time', async () => {
    const { service } = buildService({ transactionForFindOne: makeTx({ sellerSideReminderLeadDays: null }) });
    await expect(service.setSellerSideReminderLeadTime('tx-1', 2.5)).rejects.toThrow();
  });

  it('is a no-op (no save, no audit, no reschedule) when the new value equals the current value', async () => {
    const { service, transactionsRepo, auditLogService, sellerSideReminderScheduler } = buildService({
      transactionForFindOne: makeTx({ sellerSideReminderLeadDays: 5 }),
    });

    await service.setSellerSideReminderLeadTime('tx-1', 5);

    expect(transactionsRepo.save).not.toHaveBeenCalled();
    expect(auditLogService.log).not.toHaveBeenCalled();
    expect(sellerSideReminderScheduler.rescheduleForNewLeadTime).not.toHaveBeenCalled();
  });

  it('saves the new value, writes a diff-guarded audit entry, and reschedules pending seller-side reminders when the value changes', async () => {
    const { service, transactionsRepo, auditLogService, sellerSideReminderScheduler } = buildService({
      transactionForFindOne: makeTx({ sellerSideReminderLeadDays: null }),
    });

    const result = await service.setSellerSideReminderLeadTime('tx-1', 7);

    expect(result.sellerSideReminderLeadDays).toBe(7);
    expect(transactionsRepo.save).toHaveBeenCalledWith(expect.objectContaining({ sellerSideReminderLeadDays: 7 }));
    expect(auditLogService.log).toHaveBeenCalledWith(expect.objectContaining({
      action: 'seller_side_reminder_lead_time_updated',
      details: expect.objectContaining({ previousValue: null, newValue: 7 }),
    }));
    expect(sellerSideReminderScheduler.rescheduleForNewLeadTime).toHaveBeenCalledWith('tx-1');
  });
});

describe('TransactionsService.update — contractPrice-change commission recalculation', () => {
  it('triggers recalculation when contractPrice changes', async () => {
    const { service, externalTransactionInformationService } = buildService({
      transactionForFindOne: makeTx({ id: 'tx-1', contractPrice: 500000 }),
    });

    const result = await service.update('tx-1', { contractPrice: 550000 } as never);

    expect(result.contractPrice).toBe(550000);
    expect(externalTransactionInformationService.recalculateCommissionsForContractPriceChange)
      .toHaveBeenCalledWith(expect.objectContaining({ id: 'tx-1', contractPrice: 550000 }));
  });

  it('does not trigger recalculation when contractPrice is not part of the update', async () => {
    const { service, externalTransactionInformationService } = buildService({
      transactionForFindOne: makeTx({ id: 'tx-1', contractPrice: 500000 }),
    });

    await service.update('tx-1', { propertyCity: 'Chino' } as never);

    expect(externalTransactionInformationService.recalculateCommissionsForContractPriceChange).not.toHaveBeenCalled();
  });

  it('does not trigger recalculation when contractPrice is resubmitted unchanged', async () => {
    const { service, externalTransactionInformationService } = buildService({
      transactionForFindOne: makeTx({ id: 'tx-1', contractPrice: 500000 }),
    });

    await service.update('tx-1', { contractPrice: 500000 } as never);

    expect(externalTransactionInformationService.recalculateCommissionsForContractPriceChange).not.toHaveBeenCalled();
  });

  it('still returns the saved transaction even when recalculation throws — non-fatal', async () => {
    const { service, externalTransactionInformationService } = buildService({
      transactionForFindOne: makeTx({ id: 'tx-1', contractPrice: 500000 }),
    });
    externalTransactionInformationService.recalculateCommissionsForContractPriceChange.mockRejectedValueOnce(new Error('boom'));

    const result = await service.update('tx-1', { contractPrice: 550000 } as never);

    expect(result.contractPrice).toBe(550000);
  });

  it('also (re)generates the CDA when contractPrice changes', async () => {
    const { service, cdaGenerationService } = buildService({
      transactionForFindOne: makeTx({ id: 'tx-1', contractPrice: 500000 }),
    });

    await service.update('tx-1', { contractPrice: 550000 } as never);

    expect(cdaGenerationService.maybeGenerateCda)
      .toHaveBeenCalledWith(expect.objectContaining({ id: 'tx-1', contractPrice: 550000 }));
  });

  it('does not attempt CDA generation when contractPrice is unchanged', async () => {
    const { service, cdaGenerationService } = buildService({
      transactionForFindOne: makeTx({ id: 'tx-1', contractPrice: 500000 }),
    });

    await service.update('tx-1', { propertyCity: 'Chino' } as never);

    expect(cdaGenerationService.maybeGenerateCda).not.toHaveBeenCalled();
  });

  it('still returns the saved transaction even when CDA generation throws — non-fatal', async () => {
    const { service, cdaGenerationService } = buildService({
      transactionForFindOne: makeTx({ id: 'tx-1', contractPrice: 500000 }),
    });
    cdaGenerationService.maybeGenerateCda.mockRejectedValueOnce(new Error('boom'));

    const result = await service.update('tx-1', { contractPrice: 550000 } as never);

    expect(result.contractPrice).toBe(550000);
  });
});
