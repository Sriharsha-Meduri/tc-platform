import { TransactionAccessService } from './transaction-access.service';
import { MemberAccessScope, MembershipStatus } from '../organizations/entities/organization-membership.entity';
import { TransactionEntity } from '../transactions/entities/transaction.entity';

function makeTx(overrides: Partial<TransactionEntity> = {}): TransactionEntity {
  return { id: 'tx-1', organizationId: 'org-1', ...overrides } as TransactionEntity;
}

function buildService(opts: {
  membership?: { accessScope: MemberAccessScope; status?: MembershipStatus } | null;
  partyByAccountId?: object | null;
  partyByEmail?: object | null;
  accountEmail?: string | null;
  grants?: Array<{ accountId: string; revokedAt: Date | null; expiresAt: Date | null }>;
} = {}) {
  const membershipRepo = {
    findOne: jest.fn().mockImplementation(({ where: _where }) => {
      if (!opts.membership) return Promise.resolve(null);
      const active = (opts.membership.status ?? MembershipStatus.ACTIVE) === MembershipStatus.ACTIVE;
      if (!active) return Promise.resolve(null);
      return Promise.resolve({ accessScope: opts.membership.accessScope, status: opts.membership.status ?? MembershipStatus.ACTIVE });
    }),
  };

  const partiesRepo = {
    findOne: jest.fn().mockResolvedValue(opts.partyByAccountId ?? null),
    createQueryBuilder: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(opts.partyByEmail ?? null),
    }),
  };

  const accountsService = {
    findOne: jest.fn().mockResolvedValue(
      opts.accountEmail === undefined ? { id: 'acct-1', user: { email: 'acct@example.com' } }
        : opts.accountEmail === null ? null
        : { id: 'acct-1', user: { email: opts.accountEmail } },
    ),
  };

  const accessGrantsService = {
    findByTransaction: jest.fn().mockResolvedValue(opts.grants ?? []),
  };

  const service = new TransactionAccessService(
    membershipRepo as never,
    partiesRepo as never,
    accountsService as never,
    accessGrantsService as never,
  );

  return { service, membershipRepo, partiesRepo, accountsService, accessGrantsService };
}

describe('TransactionAccessService.canAccountAccessTransaction', () => {
  it('grants access via an active org membership (all_transactions scope)', async () => {
    const { service } = buildService({ membership: { accessScope: MemberAccessScope.ALL_TRANSACTIONS } });
    await expect(service.canAccountAccessTransaction('acct-1', makeTx())).resolves.toBe(true);
  });

  it('grants access via an active org membership regardless of access_scope — coordinator assignment is optional', async () => {
    const { service } = buildService({ membership: { accessScope: MemberAccessScope.ASSIGNED_ONLY } });
    await expect(service.canAccountAccessTransaction('acct-1', makeTx())).resolves.toBe(true);
  });

  it('denies access when the org membership is not active', async () => {
    const { service } = buildService({ membership: { accessScope: MemberAccessScope.ALL_TRANSACTIONS, status: MembershipStatus.PENDING } });
    await expect(service.canAccountAccessTransaction('acct-1', makeTx())).resolves.toBe(false);
  });

  it('grants access via a party row directly linked by accountId', async () => {
    const { service } = buildService({ partyByAccountId: { id: 'party-1' } });
    await expect(service.canAccountAccessTransaction('acct-1', makeTx())).resolves.toBe(true);
  });

  it('grants access via a party row matched by email (case-insensitive) when no accountId link exists', async () => {
    const { service } = buildService({ partyByEmail: { id: 'party-2' }, accountEmail: 'Agent@Example.com' });
    await expect(service.canAccountAccessTransaction('acct-1', makeTx())).resolves.toBe(true);
  });

  it('grants access via an active, unexpired transaction_access_grants row', async () => {
    const { service } = buildService({
      grants: [{ accountId: 'acct-1', revokedAt: null, expiresAt: null }],
    });
    await expect(service.canAccountAccessTransaction('acct-1', makeTx())).resolves.toBe(true);
  });

  it('denies access via a grant that has been revoked', async () => {
    const { service } = buildService({
      grants: [{ accountId: 'acct-1', revokedAt: new Date('2020-01-01'), expiresAt: null }],
    });
    await expect(service.canAccountAccessTransaction('acct-1', makeTx())).resolves.toBe(false);
  });

  it('denies access via a grant that has already expired', async () => {
    const { service } = buildService({
      grants: [{ accountId: 'acct-1', revokedAt: null, expiresAt: new Date('2000-01-01') }],
    });
    await expect(service.canAccountAccessTransaction('acct-1', makeTx())).resolves.toBe(false);
  });

  it('grants access via a grant that has not yet expired', async () => {
    const { service } = buildService({
      grants: [{ accountId: 'acct-1', revokedAt: null, expiresAt: new Date('2999-01-01') }],
    });
    await expect(service.canAccountAccessTransaction('acct-1', makeTx())).resolves.toBe(true);
  });

  it('denies access when none of the four modes match (hybrid: no mode grants anything)', async () => {
    const { service } = buildService();
    await expect(service.canAccountAccessTransaction('acct-1', makeTx())).resolves.toBe(false);
  });

  it('grants access when at least one mode matches even if the others do not (hybrid combination)', async () => {
    const { service } = buildService({
      membership: { accessScope: MemberAccessScope.ASSIGNED_ONLY },
      grants: [{ accountId: 'acct-1', revokedAt: null, expiresAt: null }],
    });
    await expect(service.canAccountAccessTransaction('acct-1', makeTx())).resolves.toBe(true);
  });

  it('does not throw when the account lookup fails, and still denies access', async () => {
    const { service, accountsService } = buildService();
    accountsService.findOne.mockRejectedValue(new Error('not found'));
    await expect(service.canAccountAccessTransaction('acct-1', makeTx())).resolves.toBe(false);
  });

  it('grants access to the account that created the transaction, even with no party row or grant', async () => {
    const { service } = buildService();
    await expect(service.canAccountAccessTransaction('acct-1', makeTx({ createdByAccountId: 'acct-1' }))).resolves.toBe(true);
  });

  it('grants access to the assigned coordinator, even with no party row or grant', async () => {
    const { service } = buildService();
    await expect(service.canAccountAccessTransaction('acct-1', makeTx({ assignedCoordinatorAccountId: 'acct-1' }))).resolves.toBe(true);
  });

  it('grants access to the linked buyer agent, even with no party row or grant', async () => {
    const { service } = buildService();
    await expect(service.canAccountAccessTransaction('acct-1', makeTx({ buyerAgentAccountId: 'acct-1' }))).resolves.toBe(true);
  });

  it('short-circuits on the creator check before touching org membership, party, or grant lookups', async () => {
    const { service, membershipRepo, partiesRepo, accessGrantsService } = buildService();
    await service.canAccountAccessTransaction('acct-1', makeTx({ createdByAccountId: 'acct-1' }));
    expect(membershipRepo.findOne).not.toHaveBeenCalled();
    expect(partiesRepo.findOne).not.toHaveBeenCalled();
    expect(accessGrantsService.findByTransaction).not.toHaveBeenCalled();
  });
});
