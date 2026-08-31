import { ContractSubmissionService, SubmitContractDto } from './contract-submission.service';
import { TransactionStatus } from './entities/transaction.entity';
import { PartyRole } from '../transaction-parties/entities/transaction-party.entity';

// ── Mock helpers ───────────────────────────────────────────────────────────────

function makeTx(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tx-1',
    transactionNumber: 'TXN-2026-0001',
    createdByAccountId: 'account-tc-1',
    outboundEmailAddress: 'tx-1@txn.mytcapp.net',
    propertyAddressLine1: '123 Main St',
    propertyCity: 'Chino',
    propertyState: 'CA',
    status: TransactionStatus.DRAFT,
    summaryJson: null,
    ...overrides,
  };
}

/** A stateful fake for TransactionPartyEntity's repository — persists rows across calls
 * so upsert-by-position behavior (no duplicate records) can be verified end-to-end. */
function makePartiesRepoFake() {
  const rows: Array<Record<string, unknown>> = [];
  let idCounter = 0;

  return {
    rows,
    find: jest.fn(async ({ where }: { where: { transactionId: string; partyRole: PartyRole } }) =>
      rows
        .filter((r) => r.transactionId === where.transactionId && r.partyRole === where.partyRole)
        .sort((a, b) => (a.createdAt as number) - (b.createdAt as number)),
    ),
    findOne: jest.fn(async ({ where }: { where: { transactionId: string; partyRole: PartyRole } }) =>
      rows.find((r) => r.transactionId === where.transactionId && r.partyRole === where.partyRole) ?? null,
    ),
    create: jest.fn((v: Record<string, unknown>) => ({ id: `party-${++idCounter}`, createdAt: idCounter, ...v })),
    save: jest.fn(async (v: Record<string, unknown>) => {
      const idx = rows.findIndex((r) => r.id === v.id);
      if (idx >= 0) rows[idx] = v;
      else rows.push(v);
      return v;
    }),
  };
}

function mockRepo(overrides: Record<string, jest.Mock> = {}) {
  return {
    findOne: jest.fn(),
    find: jest.fn().mockResolvedValue([]),
    save: jest.fn().mockImplementation((v: unknown) => Promise.resolve(v)),
    create: jest.fn().mockImplementation((v: unknown) => v),
    createQueryBuilder: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ max: null }),
    }),
    ...overrides,
  };
}

function buildService(deps: {
  tx?: ReturnType<typeof makeTx>;
  blockers?: unknown[];
  welcomeEmailFails?: boolean;
  buyerWelcomeEmailFails?: boolean;
  buyerWelcomeEmailsSent?: string[];
  blockerOverrides?: Array<{ blockerId: string; documentId: string | null; formCode: string | null }>;
} = {}) {
  const partiesRepo = makePartiesRepoFake();
  const transactionsRepo = mockRepo({ findOne: jest.fn().mockResolvedValue(deps.tx ?? makeTx()) });
  const documentsRepo = mockRepo({
    findOne: jest.fn().mockResolvedValue(
      deps.blockers ? { id: 'rpa-doc-1', formCode: 'RPA', metadataJson: { compliance: { blockers: deps.blockers } } } : null,
    ),
  });
  const blockerOverrideService = {
    findForTransaction: jest.fn().mockResolvedValue(deps.blockerOverrides ?? []),
  };
  const submissionsRepo = mockRepo();
  const messagesRepo = mockRepo();
  const mailgunService = { sendEmail: jest.fn().mockResolvedValue({ messageId: 'mg-1' }) };
  const emailTemplateService = { render: jest.fn().mockReturnValue('<html></html>') };
  const eventSeederService = { seedFromExtraction: jest.fn().mockResolvedValue([]) };
  const welcomeEmailService = {
    sendWelcomeEmails: deps.welcomeEmailFails
      ? jest.fn().mockRejectedValue(new Error('Cannot send the Welcome to Escrow email — missing a valid email address for: Buyer.'))
      : jest.fn().mockResolvedValue([]),
    sendBuyerWelcomeEmail: deps.buyerWelcomeEmailFails
      ? jest.fn().mockRejectedValue(new Error('Mailgun down'))
      : jest.fn().mockResolvedValue(deps.buyerWelcomeEmailsSent ?? []),
  };
  const stageInstancesService = { activateStage: jest.fn().mockResolvedValue(undefined) };
  const accountsService = { findAgentByEmail: jest.fn() };
  const accessGrantsService = { create: jest.fn() };
  const uploadLinkService = {
    createSecureUploadLink: jest.fn().mockResolvedValue({ link: { id: 'link-1' }, token: 'raw-token' }),
  };
  const uploadLinkEmailService = { sendUploadLinkEmail: jest.fn().mockResolvedValue(undefined) };

  const service = new ContractSubmissionService(
    transactionsRepo as never,
    partiesRepo as never,
    documentsRepo as never,
    submissionsRepo as never,
    messagesRepo as never,
    mailgunService as never,
    emailTemplateService as never,
    eventSeederService as never,
    welcomeEmailService as never,
    stageInstancesService as never,
    accountsService as never,
    accessGrantsService as never,
    uploadLinkService as never,
    uploadLinkEmailService as never,
    blockerOverrideService as never,
  );

  return { service, partiesRepo, uploadLinkService, uploadLinkEmailService, welcomeEmailService, blockerOverrideService };
}

function baseDto(overrides: Partial<SubmitContractDto> = {}): SubmitContractDto {
  return {
    buyers: [{ name: 'Buyer One', email: 'b1@example.com' }],
    sellers: [{ name: 'Seller One', email: 's1@example.com' }],
    buyerAgentName: 'Agent Smith', buyerAgentEmail: 'agent@example.com',
    sellerAgentName: 'Agent Jones', sellerAgentEmail: 'listing@example.com',
    ...overrides,
  };
}

// Submitting as the agent skips buyer-agent-account validation and the
// qualification-doc/lender-intro side flows, keeping these tests focused on
// party persistence rather than every downstream email path.
const AGENT_SUBMITTER = ['agent'];

describe('ContractSubmissionService — party persistence', () => {
  it('creates one party row per buyer and per seller', async () => {
    const { service, partiesRepo } = buildService();
    await service.submitContract('tx-1', baseDto({
      buyers: [
        { name: 'Buyer One', email: 'b1@example.com' },
        { name: 'Buyer Two', email: 'b2@example.com' },
      ],
      sellers: [{ name: 'Seller One', email: 's1@example.com' }],
    }), AGENT_SUBMITTER);

    const buyerRows = partiesRepo.rows.filter((r) => r.partyRole === PartyRole.BUYER);
    const sellerRows = partiesRepo.rows.filter((r) => r.partyRole === PartyRole.SELLER);
    expect(buyerRows).toHaveLength(2);
    expect(sellerRows).toHaveLength(1);
    expect(buyerRows.map((r) => r.email)).toEqual(['b1@example.com', 'b2@example.com']);
  });

  it('updates the existing party rows in place on resubmission instead of creating duplicates', async () => {
    const { service, partiesRepo } = buildService();
    const dto = baseDto({
      buyers: [
        { name: 'Buyer One', email: 'b1@example.com' },
        { name: 'Buyer Two', email: 'b2@example.com' },
      ],
    });

    await service.submitContract('tx-1', dto, AGENT_SUBMITTER);
    const firstIds = partiesRepo.rows.filter((r) => r.partyRole === PartyRole.BUYER).map((r) => r.id);

    // Resubmit with the same two buyers but an updated email for the second.
    await service.submitContract('tx-1', baseDto({
      buyers: [
        { name: 'Buyer One', email: 'b1@example.com' },
        { name: 'Buyer Two', email: 'b2-updated@example.com' },
      ],
    }), AGENT_SUBMITTER);

    const buyerRows = partiesRepo.rows.filter((r) => r.partyRole === PartyRole.BUYER);
    expect(buyerRows).toHaveLength(2); // no duplicates created
    expect(buyerRows.map((r) => r.id)).toEqual(firstIds); // same underlying records
    expect(buyerRows[1].email).toBe('b2-updated@example.com');
  });

  it('adds a new party row only for buyers beyond the existing count', async () => {
    const { service, partiesRepo } = buildService();
    await service.submitContract('tx-1', baseDto({
      buyers: [{ name: 'Buyer One', email: 'b1@example.com' }],
    }), AGENT_SUBMITTER);
    const firstBuyerId = partiesRepo.rows.find((r) => r.partyRole === PartyRole.BUYER)!.id;

    await service.submitContract('tx-1', baseDto({
      buyers: [
        { name: 'Buyer One', email: 'b1@example.com' },
        { name: 'Buyer Two', email: 'b2@example.com' },
      ],
    }), AGENT_SUBMITTER);

    const buyerRows = partiesRepo.rows.filter((r) => r.partyRole === PartyRole.BUYER);
    expect(buyerRows).toHaveLength(2);
    expect(buyerRows[0].id).toBe(firstBuyerId); // first buyer's record was reused, not recreated
  });

  it('skips blank buyer/seller entries rather than creating empty party records', async () => {
    const { service, partiesRepo } = buildService();
    await service.submitContract('tx-1', baseDto({
      buyers: [
        { name: 'Buyer One', email: 'b1@example.com' },
        { name: '', email: '' },
      ],
    }), AGENT_SUBMITTER);

    const buyerRows = partiesRepo.rows.filter((r) => r.partyRole === PartyRole.BUYER);
    expect(buyerRows).toHaveLength(1);
  });

  it('still upserts the single buyer-agent, seller-agent, and seller TC party rows without duplicating them', async () => {
    const { service, partiesRepo } = buildService();
    await service.submitContract('tx-1', baseDto({
      sellerTcName: 'Dana Seller TC', sellerTcEmail: 'dana@sellertc.com',
    }), AGENT_SUBMITTER);
    await service.submitContract('tx-1', baseDto({
      sellerTcName: 'Dana Seller TC', sellerTcEmail: 'dana-updated@sellertc.com',
    }), AGENT_SUBMITTER);

    const buyerAgentRows = partiesRepo.rows.filter((r) => r.partyRole === PartyRole.BUYER_AGENT);
    const sellerAgentRows = partiesRepo.rows.filter((r) => r.partyRole === PartyRole.SELLER_AGENT);
    const sellerTcRows = partiesRepo.rows.filter((r) => r.partyRole === PartyRole.SELLER_TRANSACTION_COORDINATOR);

    expect(buyerAgentRows).toHaveLength(1);
    expect(sellerAgentRows).toHaveLength(1);
    expect(sellerTcRows).toHaveLength(1);
    expect(sellerTcRows[0].email).toBe('dana-updated@sellertc.com');
  });

  it('does not create a seller TC party row when the field is left blank', async () => {
    const { service, partiesRepo } = buildService();
    await service.submitContract('tx-1', baseDto({ sellerTcName: null, sellerTcEmail: null }), AGENT_SUBMITTER);

    const sellerTcRows = partiesRepo.rows.filter((r) => r.partyRole === PartyRole.SELLER_TRANSACTION_COORDINATOR);
    expect(sellerTcRows).toHaveLength(0);
  });

  it('persists name-only sellers (Draft stage no longer collects seller email), preserves any pre-existing seller email, and the welcome email excludes buyers and sellers', async () => {
    const { service, partiesRepo, welcomeEmailService } = buildService();

    // First submission has a seller with a stored email (e.g. extracted from the contract).
    await service.submitContract('tx-1', baseDto({
      sellers: [{ name: 'Seller One', email: 'seller-extracted@example.com' }],
    }), AGENT_SUBMITTER);
    const sellerRowAfterFirst = partiesRepo.rows.find((r) => r.partyRole === PartyRole.SELLER)!;
    expect(sellerRowAfterFirst.email).toBe('seller-extracted@example.com');

    // Resubmission from the Draft-stage form sends the seller with no email at all.
    await service.submitContract('tx-1', baseDto({
      sellers: [{ name: 'Seller One Updated' }],
    }), AGENT_SUBMITTER);

    const sellerRows = partiesRepo.rows.filter((r) => r.partyRole === PartyRole.SELLER);
    expect(sellerRows).toHaveLength(1); // no duplicate created
    expect(sellerRows[0].displayName).toBe('Seller One Updated');
    // The previously-stored email must not be blanked out just because this
    // submission didn't resupply one.
    expect(sellerRows[0].email).toBe('seller-extracted@example.com');

    // The welcome email call itself never receives buyer/seller data — it looks
    // up recipients independently from party rows scoped to agents/STC only.
    expect(welcomeEmailService.sendWelcomeEmails).toHaveBeenCalledWith('tx-1');
  });

  it('creates a seller party row with a null email when no prior email exists and none is supplied', async () => {
    const { service, partiesRepo } = buildService();
    await service.submitContract('tx-1', baseDto({
      sellers: [{ name: 'Brand New Seller' }],
    }), AGENT_SUBMITTER);

    const sellerRow = partiesRepo.rows.find((r) => r.partyRole === PartyRole.SELLER)!;
    expect(sellerRow.displayName).toBe('Brand New Seller');
    expect(sellerRow.email).toBeNull();
  });
});

describe('ContractSubmissionService — Buyer Agent secure upload-link email', () => {
  it('creates and sends the upload-link email to the Buyer Agent, never the Buyer or Seller', async () => {
    const { service, uploadLinkService, uploadLinkEmailService } = buildService();
    await service.submitContract('tx-1', baseDto(), AGENT_SUBMITTER);

    const buyerCall = uploadLinkService.createSecureUploadLink.mock.calls.find(([, purpose]) => purpose === 'document_upload');
    expect(buyerCall).toBeDefined();
    const [recipient, purpose] = buyerCall!;
    expect(recipient.recipientEmail).toBe('agent@example.com');
    expect(recipient.recipientRole).toBe(PartyRole.BUYER_AGENT);
    expect(purpose).toBe('document_upload');

    // Buyer Agent's call and Seller Agent's call are both present, but distinct.
    expect(uploadLinkService.createSecureUploadLink).toHaveBeenCalledTimes(2);
    expect(uploadLinkEmailService.sendUploadLinkEmail).toHaveBeenCalledTimes(2);
  });

  it('still sends the upload-link email when the buyer agent themselves is the submitter', async () => {
    // Unlike the welcome email (excludeBuyerAgent), the upload link is a standing
    // capability the agent can use regardless of who submitted.
    const { service, uploadLinkEmailService } = buildService();
    await service.submitContract('tx-1', baseDto(), AGENT_SUBMITTER);
    expect(uploadLinkEmailService.sendUploadLinkEmail).toHaveBeenCalled();
  });

  it('does not create a Buyer Agent upload link when the buyer agent has no email', async () => {
    const { service, uploadLinkService } = buildService();
    await service.submitContract('tx-1', baseDto({ buyerAgentEmail: '' }), AGENT_SUBMITTER);
    const buyerCalls = uploadLinkService.createSecureUploadLink.mock.calls.filter(([, purpose]) => purpose === 'document_upload');
    expect(buyerCalls).toHaveLength(0);
  });

  it('does not fail contract submission if upload-link creation throws', async () => {
    const { service, uploadLinkService } = buildService();
    uploadLinkService.createSecureUploadLink.mockRejectedValueOnce(new Error('db down'));
    await expect(service.submitContract('tx-1', baseDto(), AGENT_SUBMITTER)).resolves.toBeDefined();
  });
});

describe('ContractSubmissionService — Seller Agent secure upload-link email', () => {
  function sellerAgentCall(uploadLinkService: ReturnType<typeof buildService>['uploadLinkService']) {
    return uploadLinkService.createSecureUploadLink.mock.calls.find(([, purpose]) => purpose === 'seller_agent_document_upload');
  }

  it('sends the Seller Agent upload-link email immediately after a successful submission', async () => {
    const { service, uploadLinkService, uploadLinkEmailService } = buildService();
    await service.submitContract('tx-1', baseDto(), AGENT_SUBMITTER);

    const call = sellerAgentCall(uploadLinkService);
    expect(call).toBeDefined();
    const [recipient, purpose, opts] = call!;
    expect(recipient.recipientEmail).toBe('listing@example.com');
    expect(recipient.recipientRole).toBe(PartyRole.SELLER_AGENT);
    expect(purpose).toBe('seller_agent_document_upload');
    expect(opts.ccRecipient).toBeNull();

    expect(uploadLinkEmailService.sendUploadLinkEmail).toHaveBeenCalledTimes(2); // buyer agent + seller agent
  });

  it('CCs the Seller Transaction Coordinator when assigned with a valid email', async () => {
    const { service, uploadLinkService } = buildService();
    await service.submitContract('tx-1', baseDto({
      sellerTcName: 'Dana Seller TC', sellerTcEmail: 'dana@sellertc.com',
    }), AGENT_SUBMITTER);

    const [, , opts] = sellerAgentCall(uploadLinkService)!;
    expect(opts.ccRecipient).toEqual(expect.objectContaining({
      role: PartyRole.SELLER_TRANSACTION_COORDINATOR,
      name: 'Dana Seller TC',
      email: 'dana@sellertc.com',
    }));
  });

  it('CCs a Seller TC assigned in an earlier submission even if this retry did not resupply their info', async () => {
    const { service, uploadLinkService } = buildService();
    // First submission assigns the Seller TC party...
    await service.submitContract('tx-1', baseDto({
      sellerTcName: 'Dana Seller TC', sellerTcEmail: 'dana@sellertc.com',
    }), AGENT_SUBMITTER);
    uploadLinkService.createSecureUploadLink.mockClear();

    // ...second submission (a retry) omits sellerTc fields entirely — the persisted
    // party from the first call should still be looked up fresh and CC'd.
    await service.submitContract('tx-1', baseDto(), AGENT_SUBMITTER);

    const [, , opts] = sellerAgentCall(uploadLinkService)!;
    expect(opts.ccRecipient?.email).toBe('dana@sellertc.com');
  });

  it('omits the Seller TC cc when none is assigned', async () => {
    const { service, uploadLinkService } = buildService();
    await service.submitContract('tx-1', baseDto({ sellerTcName: null, sellerTcEmail: null }), AGENT_SUBMITTER);

    const [, , opts] = sellerAgentCall(uploadLinkService)!;
    expect(opts.ccRecipient).toBeNull();
  });

  it('omits the Seller TC cc when assigned but the email is invalid', async () => {
    const { service, uploadLinkService } = buildService();
    await service.submitContract('tx-1', baseDto({
      sellerTcName: 'Dana Seller TC', sellerTcEmail: 'not-an-email',
    }), AGENT_SUBMITTER);

    const [, , opts] = sellerAgentCall(uploadLinkService)!;
    expect(opts.ccRecipient).toBeNull();
  });

  it('never sends the Seller Agent upload email to Buyers, Sellers, or the Buyer Agent', async () => {
    const { service, uploadLinkEmailService } = buildService();
    await service.submitContract('tx-1', baseDto(), AGENT_SUBMITTER);

    // Only two sends total: Buyer Agent (document_upload) + Seller Agent (seller_agent_document_upload).
    expect(uploadLinkEmailService.sendUploadLinkEmail).toHaveBeenCalledTimes(2);
  });

  it('does not create a Seller Agent upload link when the seller agent has no valid email', async () => {
    const { service, uploadLinkService } = buildService();
    await service.submitContract('tx-1', baseDto({ sellerAgentEmail: 'not-an-email' }), AGENT_SUBMITTER);
    expect(sellerAgentCall(uploadLinkService)).toBeUndefined();
  });

  it('does not send the Seller Agent upload email when submission fails (blockers pending)', async () => {
    const { service, uploadLinkService, uploadLinkEmailService } = buildService({
      blockers: [{ code: 'X' }],
    });

    await expect(service.submitContract('tx-1', baseDto(), AGENT_SUBMITTER)).rejects.toThrow();
    expect(sellerAgentCall(uploadLinkService)).toBeUndefined();
    expect(uploadLinkEmailService.sendUploadLinkEmail).not.toHaveBeenCalled();
  });

  it('does not send the Seller Agent upload email when required Buyer-side data is missing (welcome-email validation throws)', async () => {
    const { service, uploadLinkService, uploadLinkEmailService } = buildService({ welcomeEmailFails: true });

    await expect(service.submitContract('tx-1', baseDto(), AGENT_SUBMITTER)).rejects.toThrow();
    expect(sellerAgentCall(uploadLinkService)).toBeUndefined();
    expect(uploadLinkEmailService.sendUploadLinkEmail).not.toHaveBeenCalled();
    expect(uploadLinkService.createSecureUploadLink).not.toHaveBeenCalled();
  });

  it('does not fail contract submission if Seller Agent upload-link creation throws', async () => {
    const { service, uploadLinkService } = buildService();
    uploadLinkService.createSecureUploadLink.mockImplementation((_recipient: unknown, purpose: string) => {
      if (purpose === 'seller_agent_document_upload') return Promise.reject(new Error('db down'));
      return Promise.resolve({ link: { id: 'link-1' }, token: 'raw-token' });
    });
    await expect(service.submitContract('tx-1', baseDto(), AGENT_SUBMITTER)).resolves.toBeDefined();
  });
});

describe('ContractSubmissionService — upload-link email footer (creator TC)', () => {
  function uploadLinkEmailCtxs(uploadLinkEmailService: ReturnType<typeof buildService>['uploadLinkEmailService']) {
    return uploadLinkEmailService.sendUploadLinkEmail.mock.calls.map((c: unknown[]) => c[2] as Record<string, unknown>);
  }

  it('sources the TC footer from the creating myTC account for both the Buyer and Seller Agent upload-link emails', async () => {
    const { service, uploadLinkEmailService } = buildService({
      tx: makeTx({
        createdByAccount: { displayName: 'Carla Creator', cellPhone: '555-0200', user: { email: 'carla@tc.com' } },
      }),
    });
    await service.submitContract('tx-1', baseDto(), AGENT_SUBMITTER);

    const ctxs = uploadLinkEmailCtxs(uploadLinkEmailService);
    expect(ctxs).toHaveLength(2); // buyer agent + seller agent
    for (const ctx of ctxs) {
      expect(ctx.tcName).toBe('Carla Creator');
      expect(ctx.tcPhone).toBe('555-0200');
      // The email is the transaction Mailgun address — never the TC's myTC login email.
      expect(ctx.transactionEmail).toBe('tx-1@txn.mytcapp.net');
      expect(ctx.transactionEmail).not.toBe('carla@tc.com');
      expect(ctx.transactionId).toBe('tx-1');
    }
  });

  it('never passes placeholder text into the upload-link email context when the creator account has no TC identity', async () => {
    const { service, uploadLinkEmailService } = buildService({
      tx: makeTx({
        createdByAccount: { displayName: null, firstName: null, cellPhone: null, user: { email: null } },
      }),
    });
    await service.submitContract('tx-1', baseDto(), AGENT_SUBMITTER);

    for (const ctx of uploadLinkEmailCtxs(uploadLinkEmailService)) {
      expect(ctx.tcName).toBeFalsy();
      expect(ctx.tcPhone).toBeFalsy();
      // Email still comes from the transaction's Mailgun address, independent of the account.
      expect(ctx.transactionEmail).toBe('tx-1@txn.mytcapp.net');
      expect(ctx.transactionEmail).not.toBe('Not specified');
      expect(ctx.tcPhone).not.toBe('Not specified');
      expect(ctx.transactionId).toBe('tx-1');
    }
  });

  it('omits the transaction email from the upload-link context when the transaction has no Mailgun address', async () => {
    const { service, uploadLinkEmailService } = buildService({
      tx: makeTx({
        outboundEmailAddress: null,
        createdByAccount: { displayName: 'Carla Creator', cellPhone: '555-0200', user: { email: 'carla@tc.com' } },
      }),
    });
    await service.submitContract('tx-1', baseDto(), AGENT_SUBMITTER);

    for (const ctx of uploadLinkEmailCtxs(uploadLinkEmailService)) {
      // Never falls back to the TC's myTC login email.
      expect(ctx.transactionEmail).toBeFalsy();
      expect(ctx.transactionEmail).not.toBe('carla@tc.com');
      expect(ctx.tcName).toBe('Carla Creator');
    }
  });
});

describe('ContractSubmissionService — Buyer Welcome + Timeline email', () => {
  it('sends the Buyer Welcome + Timeline email as part of submission', async () => {
    const { service, welcomeEmailService } = buildService();
    await service.submitContract('tx-1', baseDto(), AGENT_SUBMITTER);
    expect(welcomeEmailService.sendBuyerWelcomeEmail).toHaveBeenCalledWith('tx-1');
  });

  it("is a separate call from the agent-facing welcome email, not a substitute for it", async () => {
    const { service, welcomeEmailService } = buildService();
    await service.submitContract('tx-1', baseDto(), AGENT_SUBMITTER);
    expect(welcomeEmailService.sendWelcomeEmails).toHaveBeenCalledWith('tx-1');
    expect(welcomeEmailService.sendBuyerWelcomeEmail).toHaveBeenCalledWith('tx-1');
  });

  it('aggregates the recipients returned by the Buyer welcome email into the emailsSent result of submitContract', async () => {
    const { service } = buildService({ buyerWelcomeEmailsSent: ['jane@buyer.com', 'agent@example.com'] });
    const result = await service.submitContract('tx-1', baseDto(), AGENT_SUBMITTER);
    expect(result.emailsSent).toEqual(expect.arrayContaining(['jane@buyer.com', 'agent@example.com']));
  });

  it('does not fail contract submission if the Buyer welcome email throws — non-fatal, submission still succeeds', async () => {
    const { service, uploadLinkEmailService } = buildService({ buyerWelcomeEmailFails: true });
    const result = await service.submitContract('tx-1', baseDto(), AGENT_SUBMITTER);
    expect(result).toBeDefined();
    // Everything downstream of the failed Buyer welcome email still runs.
    expect(uploadLinkEmailService.sendUploadLinkEmail).toHaveBeenCalledTimes(2);
  });
});
