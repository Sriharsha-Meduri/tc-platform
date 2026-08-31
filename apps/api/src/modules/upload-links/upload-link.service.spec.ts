import { UploadLinkService } from './upload-link.service';
import { UploadLinkStatus } from './entities/upload-link.entity';
import { UploadLinkRecipient } from './upload-link.types';
import { generateUploadToken, hashUploadToken } from './upload-link-token.util';

// ── Mock helpers ───────────────────────────────────────────────────────────────

function makeUploadLinkRepoFake() {
  const rows: Array<Record<string, unknown>> = [];
  let counter = 0;

  const fake = {
    rows,
    create: jest.fn(async (data: Record<string, unknown>) => {
      const row = {
        id: `link-${++counter}`,
        status: UploadLinkStatus.ACTIVE,
        revokedAt: null,
        replacedByUploadLinkId: null,
        emailSentAt: null,
        emailMessageId: null,
        firstAccessedAt: null,
        lastAccessedAt: null,
        uploadCount: 0,
        createdAt: new Date(),
        ...data,
      };
      rows.push(row);
      return row;
    }),
    findById: jest.fn(async (id: string) => rows.find((r) => r.id === id) ?? null),
    findByHash: jest.fn(async (hash: string) => rows.find((r) => r.tokenHash === hash) ?? null),
    findActiveForRecipient: jest.fn(async (transactionId: string, recipientPartyId: string | null, purpose: string) =>
      rows.find((r) =>
        r.transactionId === transactionId
        && r.recipientPartyId === recipientPartyId
        && r.purpose === purpose
        && r.status === UploadLinkStatus.ACTIVE
        && (r.expiresAt as Date).getTime() > Date.now(),
      ) ?? null,
    ),
    findActiveForRecipientEmail: jest.fn(async (transactionId: string, recipientEmail: string, purpose: string) =>
      rows.find((r) =>
        r.transactionId === transactionId
        && r.recipientEmail === recipientEmail
        && r.purpose === purpose
        && r.status === UploadLinkStatus.ACTIVE
        && (r.expiresAt as Date).getTime() > Date.now(),
      ) ?? null,
    ),
    revoke: jest.fn(async (id: string) => {
      const r = rows.find((x) => x.id === id);
      if (r) { r.status = UploadLinkStatus.REVOKED; r.revokedAt = new Date(); }
    }),
    markReplaced: jest.fn(async (oldId: string, newId: string) => {
      const r = rows.find((x) => x.id === oldId);
      if (r) { r.status = UploadLinkStatus.REPLACED; r.replacedByUploadLinkId = newId; }
    }),
    recordEmailSent: jest.fn(async (id: string, messageId: string | null) => {
      const r = rows.find((x) => x.id === id);
      if (r) { r.emailSentAt = new Date(); r.emailMessageId = messageId; }
    }),
    recordAccess: jest.fn(async (link: { id: string; firstAccessedAt: Date | null }) => {
      const r = rows.find((x) => x.id === link.id);
      if (r) { r.firstAccessedAt = r.firstAccessedAt ?? new Date(); r.lastAccessedAt = new Date(); }
    }),
    incrementUploadCount: jest.fn(async (id: string, by = 1) => {
      const r = rows.find((x) => x.id === id);
      if (r) r.uploadCount = (r.uploadCount as number) + by;
    }),
    regenerate: jest.fn(async (existing: Record<string, unknown>, createdByAccountId?: string | null) => {
      const token = generateUploadToken();
      const link: Record<string, unknown> = {
        id: `link-${++counter}`,
        status: UploadLinkStatus.ACTIVE,
        revokedAt: null,
        replacedByUploadLinkId: null,
        emailSentAt: null,
        emailMessageId: null,
        firstAccessedAt: null,
        lastAccessedAt: null,
        uploadCount: 0,
        createdAt: new Date(),
        transactionId: existing.transactionId,
        recipientPartyId: existing.recipientPartyId,
        recipientRole: existing.recipientRole,
        recipientName: existing.recipientName,
        recipientEmail: existing.recipientEmail,
        purpose: existing.purpose,
        tokenHash: hashUploadToken(token),
        expiresAt: new Date(Date.now() + 30 * 86_400_000),
        createdByAccountId: createdByAccountId ?? existing.createdByAccountId ?? null,
        ccPartyId: existing.ccPartyId ?? null,
        ccRole: existing.ccRole ?? null,
        ccName: existing.ccName ?? null,
        ccEmail: existing.ccEmail ?? null,
      };
      rows.push(link);

      const existingRow = rows.find((x) => x.id === existing.id);
      if (existingRow) { existingRow.status = UploadLinkStatus.REPLACED; existingRow.replacedByUploadLinkId = link.id; }

      if (existing.emailMessageId) {
        link.emailSentAt = new Date();
        link.emailMessageId = existing.emailMessageId;
      }
      return { link, token };
    }),
  };
  return fake;
}

const TX_ID = 'tx-1';
const OTHER_TX_ID = 'tx-2';

function buildService(overrides: { transactions?: Record<string, unknown>[]; parties?: Record<string, unknown>[] } = {}) {
  const uploadLinkRepo = makeUploadLinkRepoFake();

  const transactions = overrides.transactions ?? [{ id: TX_ID, propertyAddressLine1: '123 Main St', propertyCity: 'Chino', propertyState: 'CA' }];
  const parties = overrides.parties ?? [{ id: 'party-ba-1', transactionId: TX_ID, partyRole: 'buyer_agent' }];

  const transactionsRepo = { findOne: jest.fn(async ({ where }: { where: { id: string } }) => transactions.find((t) => t.id === where.id) ?? null) };
  const partiesRepo = { findOne: jest.fn(async ({ where }: { where: { id: string; transactionId: string } }) => parties.find((p) => p.id === where.id && p.transactionId === where.transactionId) ?? null) };

  const service = new UploadLinkService(uploadLinkRepo as never, transactionsRepo as never, partiesRepo as never);
  return { service, uploadLinkRepo };
}

function buyerAgentRecipient(overrides: Partial<UploadLinkRecipient> = {}): UploadLinkRecipient {
  return {
    transactionId: TX_ID,
    recipientId: 'party-ba-1',
    recipientRole: 'buyer_agent',
    recipientName: 'Alice Agent',
    recipientEmail: 'alice@brokerage.com',
    ...overrides,
  };
}

function sellerAgentRecipient(overrides: Partial<UploadLinkRecipient> = {}): UploadLinkRecipient {
  return {
    transactionId: TX_ID,
    recipientId: 'party-sa-1',
    recipientRole: 'seller_agent',
    recipientName: 'Sam Seller Agent',
    recipientEmail: 'sam@listingco.com',
    ...overrides,
  };
}

const SELLER_AGENT_PARTY = { id: 'party-sa-1', transactionId: TX_ID, partyRole: 'seller_agent' };
const BUYER_AND_SELLER_AGENT_PARTIES = [
  { id: 'party-ba-1', transactionId: TX_ID, partyRole: 'buyer_agent' },
  SELLER_AGENT_PARTY,
];

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('UploadLinkService', () => {
  it('creates a link scoped to the correct transaction and recipient, returning a raw token', async () => {
    const { service, uploadLinkRepo } = buildService();
    const { link, token } = await service.createSecureUploadLink(buyerAgentRecipient(), 'document_upload');

    expect(token).toEqual(expect.any(String));
    expect(link.transactionId).toBe(TX_ID);
    expect(link.recipientPartyId).toBe('party-ba-1');
    expect(link.recipientRole).toBe('buyer_agent');
    expect(uploadLinkRepo.rows).toHaveLength(1);
    // The raw token is never persisted — only its hash.
    expect(link.tokenHash).not.toBe(token);
  });

  it('a freshly created, unexpired token passes validation', async () => {
    const { service } = buildService();
    const { token } = await service.createSecureUploadLink(buyerAgentRecipient(), 'document_upload');

    const { link, transaction } = await service.validateUploadToken(token!);
    expect(link.recipientRole).toBe('buyer_agent');
    expect(transaction.id).toBe(TX_ID);
  });

  it('rejects an unrecognized token with a generic message', async () => {
    const { service } = buildService();
    await expect(service.validateUploadToken('not-a-real-token')).rejects.toThrow('This upload link is invalid or has expired.');
  });

  it('rejects an expired link with the same generic message', async () => {
    const { service, uploadLinkRepo } = buildService();
    const { token } = await service.createSecureUploadLink(buyerAgentRecipient(), 'document_upload');
    uploadLinkRepo.rows[0].expiresAt = new Date(Date.now() - 1000); // force expiry

    await expect(service.validateUploadToken(token!)).rejects.toThrow('This upload link is invalid or has expired.');
  });

  it('rejects a revoked link with the same generic message', async () => {
    const { service, uploadLinkRepo } = buildService();
    const { link, token } = await service.createSecureUploadLink(buyerAgentRecipient(), 'document_upload');
    await uploadLinkRepo.revoke(link.id);

    await expect(service.validateUploadToken(token!)).rejects.toThrow('This upload link is invalid or has expired.');
  });

  it('regenerating a link invalidates the previous one', async () => {
    const { service } = buildService();
    const { link: oldLink, token: oldToken } = await service.createSecureUploadLink(buyerAgentRecipient(), 'document_upload');
    const { link: newLink, token: newToken } = await service.regenerateSecureUploadLink(oldLink.id);

    expect(newLink.id).not.toBe(oldLink.id);
    await expect(service.validateUploadToken(oldToken!)).rejects.toThrow('This upload link is invalid or has expired.');
    const { link } = await service.validateUploadToken(newToken!);
    expect(link.id).toBe(newLink.id);
  });

  it('regenerating a link preserves emailMessageId from the old link, so replies against the new token still thread correctly', async () => {
    const { service, uploadLinkRepo } = buildService();
    const { link: oldLink } = await service.createSecureUploadLink(buyerAgentRecipient(), 'document_upload');
    await uploadLinkRepo.recordEmailSent(oldLink.id, 'mg-original-thread-1');

    const { link: newLink } = await service.regenerateSecureUploadLink(oldLink.id);

    expect(newLink.emailMessageId).toBe('mg-original-thread-1');
  });

  it('regenerating a link that was never emailed leaves the new link with no emailMessageId — nothing to carry forward', async () => {
    const { service } = buildService();
    const { link: oldLink } = await service.createSecureUploadLink(buyerAgentRecipient(), 'document_upload');

    const { link: newLink } = await service.regenerateSecureUploadLink(oldLink.id);

    expect(newLink.emailMessageId).toBeNull();
  });

  it('revoking a link invalidates it immediately', async () => {
    const { service } = buildService();
    const { link, token } = await service.createSecureUploadLink(buyerAgentRecipient(), 'document_upload');
    await service.revokeSecureUploadLink(link.id);
    await expect(service.validateUploadToken(token!)).rejects.toThrow('This upload link is invalid or has expired.');
  });

  it('a token issued for one transaction cannot be used to access another', async () => {
    const { service } = buildService({
      transactions: [
        { id: TX_ID, propertyAddressLine1: '123 Main St', propertyCity: 'Chino', propertyState: 'CA' },
        { id: OTHER_TX_ID, propertyAddressLine1: '456 Other Ave', propertyCity: 'Nowhere', propertyState: 'CA' },
      ],
    });
    const { token } = await service.createSecureUploadLink(buyerAgentRecipient({ transactionId: TX_ID }), 'document_upload');
    const { transaction } = await service.validateUploadToken(token!);
    expect(transaction.id).toBe(TX_ID);
    expect(transaction.id).not.toBe(OTHER_TX_ID);
  });

  it('rejects a token when the transaction no longer exists', async () => {
    const { service } = buildService({ transactions: [] });
    const { token } = await service.createSecureUploadLink(buyerAgentRecipient(), 'document_upload');
    await expect(service.validateUploadToken(token!)).rejects.toThrow('This upload link is invalid or has expired.');
  });

  it('rejects a token when the recipient party is no longer on the transaction', async () => {
    const { service } = buildService({ parties: [] });
    const { token } = await service.createSecureUploadLink(buyerAgentRecipient(), 'document_upload');
    await expect(service.validateUploadToken(token!)).rejects.toThrow('This upload link is invalid or has expired.');
  });

  it('retrying creation reuses the active, already-emailed link instead of minting a duplicate', async () => {
    const { service, uploadLinkRepo } = buildService();
    const { link: first } = await service.createSecureUploadLink(buyerAgentRecipient(), 'document_upload');
    await uploadLinkRepo.recordEmailSent(first.id, 'mg-1'); // simulate the email having gone out

    const { link: second, token: secondToken } = await service.createSecureUploadLink(buyerAgentRecipient(), 'document_upload');
    expect(second.id).toBe(first.id);
    expect(secondToken).toBeNull(); // nothing new to email
    expect(uploadLinkRepo.rows).toHaveLength(1);
  });

  it('supersedes an un-emailed link on retry rather than reusing an undeliverable one', async () => {
    const { service, uploadLinkRepo } = buildService();
    const { link: first } = await service.createSecureUploadLink(buyerAgentRecipient(), 'document_upload');
    // No recordEmailSent — simulates the send failing before it went out.

    const { link: second, token: secondToken } = await service.createSecureUploadLink(buyerAgentRecipient(), 'document_upload');
    expect(second.id).not.toBe(first.id);
    expect(secondToken).toEqual(expect.any(String));
    expect(uploadLinkRepo.rows.find((r) => r.id === first.id)?.status).toBe(UploadLinkStatus.REPLACED);
  });

  it('works for a non-buyer-agent recipient role with no code changes — proves the module is generic', async () => {
    const { service } = buildService({ parties: [{ id: 'party-tc-1', transactionId: TX_ID, partyRole: 'seller_transaction_coordinator' }] });
    const { link, token } = await service.createSecureUploadLink(
      {
        transactionId: TX_ID,
        recipientId: 'party-tc-1',
        recipientRole: 'seller_transaction_coordinator',
        recipientName: 'Dana Seller TC',
        recipientEmail: 'dana@sellertc.com',
      },
      'document_upload',
    );

    expect(link.recipientRole).toBe('seller_transaction_coordinator');
    const { link: validated } = await service.validateUploadToken(token!);
    expect(validated.recipientEmail).toBe('dana@sellertc.com');
  });

  it('getUploadPageContext exposes only property address, recipient name, purpose, expiry, and file limits', async () => {
    const { service } = buildService();
    const { token } = await service.createSecureUploadLink(buyerAgentRecipient(), 'document_upload');
    const ctx = await service.getUploadPageContext(token!);

    expect(Object.keys(ctx).sort()).toEqual(['expiresAt', 'fileLimits', 'propertyAddress', 'purpose', 'recipientName'].sort());
    expect(ctx.propertyAddress).toContain('123 Main St');
    expect(ctx.recipientName).toBe('Alice Agent');
    expect(ctx.fileLimits.maxFiles).toBeGreaterThan(0);
    expect(ctx.fileLimits.maxFileSizeBytes).toBeGreaterThan(0);
    expect(ctx.fileLimits.allowedMimeTypes.length).toBeGreaterThan(0);
  });
});

describe('UploadLinkService — Seller Agent purpose isolation from Buyer Agent', () => {
  it('the Seller Agent link is a distinct record with a distinct token from the Buyer Agent link', async () => {
    const { service, uploadLinkRepo } = buildService({ parties: BUYER_AND_SELLER_AGENT_PARTIES });
    const { link: buyerLink, token: buyerToken } = await service.createSecureUploadLink(buyerAgentRecipient(), 'document_upload');
    const { link: sellerLink, token: sellerToken } = await service.createSecureUploadLink(sellerAgentRecipient(), 'seller_agent_document_upload');

    expect(sellerLink.id).not.toBe(buyerLink.id);
    expect(sellerToken).not.toBe(buyerToken);
    expect(sellerLink.tokenHash).not.toBe(buyerLink.tokenHash);
    expect(sellerLink.purpose).toBe('seller_agent_document_upload');
    expect(buyerLink.purpose).toBe('document_upload');
    expect(uploadLinkRepo.rows).toHaveLength(2);
  });

  it('a Buyer Agent token resolves only to the Buyer Agent workflow — it cannot be used for the Seller Agent purpose', async () => {
    const { service } = buildService({ parties: BUYER_AND_SELLER_AGENT_PARTIES });
    const { token: buyerToken } = await service.createSecureUploadLink(buyerAgentRecipient(), 'document_upload');
    await service.createSecureUploadLink(sellerAgentRecipient(), 'seller_agent_document_upload');

    const { link } = await service.validateUploadToken(buyerToken!);
    expect(link.purpose).toBe('document_upload');
    expect(link.recipientRole).toBe('buyer_agent');
    expect(link.purpose).not.toBe('seller_agent_document_upload');
  });

  it('a Seller Agent token cannot be used to access another transaction', async () => {
    const { service } = buildService({
      transactions: [
        { id: TX_ID, propertyAddressLine1: '123 Main St', propertyCity: 'Chino', propertyState: 'CA' },
        { id: OTHER_TX_ID, propertyAddressLine1: '456 Other Ave', propertyCity: 'Nowhere', propertyState: 'CA' },
      ],
      parties: BUYER_AND_SELLER_AGENT_PARTIES,
    });
    const { token } = await service.createSecureUploadLink(sellerAgentRecipient({ transactionId: TX_ID }), 'seller_agent_document_upload');

    const { transaction } = await service.validateUploadToken(token!);
    expect(transaction.id).toBe(TX_ID);
    expect(transaction.id).not.toBe(OTHER_TX_ID);
  });

  it('a freshly created, unexpired Seller Agent token passes validation', async () => {
    const { service } = buildService({ parties: BUYER_AND_SELLER_AGENT_PARTIES });
    const { token } = await service.createSecureUploadLink(sellerAgentRecipient(), 'seller_agent_document_upload');

    const { link, transaction } = await service.validateUploadToken(token!);
    expect(link.recipientRole).toBe('seller_agent');
    expect(link.purpose).toBe('seller_agent_document_upload');
    expect(transaction.id).toBe(TX_ID);
  });

  it('rejects an unrecognized, expired, or revoked Seller Agent token with the same generic message', async () => {
    const { service, uploadLinkRepo } = buildService({ parties: BUYER_AND_SELLER_AGENT_PARTIES });

    await expect(service.validateUploadToken('not-a-real-seller-token')).rejects.toThrow('This upload link is invalid or has expired.');

    const { token: expiredToken } = await service.createSecureUploadLink(sellerAgentRecipient(), 'seller_agent_document_upload');
    uploadLinkRepo.rows[0].expiresAt = new Date(Date.now() - 1000);
    await expect(service.validateUploadToken(expiredToken!)).rejects.toThrow('This upload link is invalid or has expired.');

    const { link: revokedLink, token: revokedToken } = await service.createSecureUploadLink(
      sellerAgentRecipient({ recipientId: 'party-sa-2' }), 'seller_agent_document_upload',
    );
    await service.revokeSecureUploadLink(revokedLink.id);
    await expect(service.validateUploadToken(revokedToken!)).rejects.toThrow('This upload link is invalid or has expired.');
  });

  it('retrying Seller Agent link creation reuses the active, already-emailed link — Buyer Agent link creation is unaffected', async () => {
    const { service, uploadLinkRepo } = buildService({ parties: BUYER_AND_SELLER_AGENT_PARTIES });
    const { link: buyerLink } = await service.createSecureUploadLink(buyerAgentRecipient(), 'document_upload');
    await uploadLinkRepo.recordEmailSent(buyerLink.id, 'mg-buyer-1');

    const { link: sellerFirst } = await service.createSecureUploadLink(sellerAgentRecipient(), 'seller_agent_document_upload');
    await uploadLinkRepo.recordEmailSent(sellerFirst.id, 'mg-seller-1');

    // Simulate a retry of "Submit & Send Emails" re-issuing both link requests.
    const { link: buyerRetry, token: buyerRetryToken } = await service.createSecureUploadLink(buyerAgentRecipient(), 'document_upload');
    const { link: sellerRetry, token: sellerRetryToken } = await service.createSecureUploadLink(sellerAgentRecipient(), 'seller_agent_document_upload');

    expect(buyerRetry.id).toBe(buyerLink.id);
    expect(buyerRetryToken).toBeNull();
    expect(sellerRetry.id).toBe(sellerFirst.id);
    expect(sellerRetryToken).toBeNull();
    expect(uploadLinkRepo.rows).toHaveLength(2); // no duplicate rows created for either purpose
  });

  it('regenerating the Seller Agent link invalidates only the previous Seller Agent link, leaving the Buyer Agent link untouched', async () => {
    const { service } = buildService({ parties: BUYER_AND_SELLER_AGENT_PARTIES });
    const { link: buyerLink, token: buyerToken } = await service.createSecureUploadLink(buyerAgentRecipient(), 'document_upload');
    const { link: sellerLink, token: oldSellerToken } = await service.createSecureUploadLink(sellerAgentRecipient(), 'seller_agent_document_upload');

    const { link: newSellerLink, token: newSellerToken } = await service.regenerateSecureUploadLink(sellerLink.id);

    expect(newSellerLink.id).not.toBe(sellerLink.id);
    await expect(service.validateUploadToken(oldSellerToken!)).rejects.toThrow('This upload link is invalid or has expired.');
    const { link: revalidatedSeller } = await service.validateUploadToken(newSellerToken!);
    expect(revalidatedSeller.id).toBe(newSellerLink.id);

    // Buyer Agent link is completely unaffected by the Seller Agent regeneration.
    const { link: revalidatedBuyer } = await service.validateUploadToken(buyerToken!);
    expect(revalidatedBuyer.id).toBe(buyerLink.id);
    expect(revalidatedBuyer.status).toBe(UploadLinkStatus.ACTIVE);
  });

  it('revoking the Seller Agent link does not revoke the Buyer Agent link', async () => {
    const { service } = buildService({ parties: BUYER_AND_SELLER_AGENT_PARTIES });
    const { link: buyerLink, token: buyerToken } = await service.createSecureUploadLink(buyerAgentRecipient(), 'document_upload');
    const { link: sellerLink, token: sellerToken } = await service.createSecureUploadLink(sellerAgentRecipient(), 'seller_agent_document_upload');

    await service.revokeSecureUploadLink(sellerLink.id);

    await expect(service.validateUploadToken(sellerToken!)).rejects.toThrow('This upload link is invalid or has expired.');
    const { link: revalidatedBuyer } = await service.validateUploadToken(buyerToken!);
    expect(revalidatedBuyer.id).toBe(buyerLink.id);
  });

  it('the Seller Agent upload page context exposes the same minimal fields as the Buyer Agent workflow — no confidential data', async () => {
    const { service } = buildService({ parties: BUYER_AND_SELLER_AGENT_PARTIES });
    const { token } = await service.createSecureUploadLink(sellerAgentRecipient(), 'seller_agent_document_upload');
    const ctx = await service.getUploadPageContext(token!);

    expect(Object.keys(ctx).sort()).toEqual(['expiresAt', 'fileLimits', 'propertyAddress', 'purpose', 'recipientName'].sort());
    expect(ctx.recipientName).toBe('Sam Seller Agent');
    expect(ctx.purpose).toBe('seller_agent_document_upload');
    expect(ctx.fileLimits.maxFiles).toBeGreaterThan(0);
  });
});

function escrowRecipient(overrides: Partial<UploadLinkRecipient> = {}): UploadLinkRecipient {
  return {
    transactionId: TX_ID,
    recipientId: null,
    recipientRole: 'escrow_officer',
    recipientName: 'Erin Escrow',
    recipientEmail: 'erin@escrowco.com',
    ...overrides,
  };
}

describe('UploadLinkService — createSecureUploadLinkForEmailRecipient (Escrow Officer, email-keyed idempotency)', () => {
  it('creates a link with no recipientPartyId, keyed by email instead', async () => {
    const { service, uploadLinkRepo } = buildService();
    const { link, token } = await service.createSecureUploadLinkForEmailRecipient(escrowRecipient(), 'escrow_officer_document_upload');

    expect(token).toEqual(expect.any(String));
    expect(link.recipientPartyId).toBeNull();
    expect(link.recipientEmail).toBe('erin@escrowco.com');
    expect(link.purpose).toBe('escrow_officer_document_upload');
    expect(uploadLinkRepo.rows).toHaveLength(1);
  });

  it('a freshly created escrow token passes validation with no party-membership check (recipientPartyId is null)', async () => {
    const { service } = buildService();
    const { token } = await service.createSecureUploadLinkForEmailRecipient(escrowRecipient(), 'escrow_officer_document_upload');

    const { link, transaction } = await service.validateUploadToken(token!);
    expect(link.recipientRole).toBe('escrow_officer');
    expect(transaction.id).toBe(TX_ID);
  });

  it('reuses the active, already-emailed link when the email is unchanged — no duplicate row, no new token', async () => {
    const { service, uploadLinkRepo } = buildService();
    const { link: first } = await service.createSecureUploadLinkForEmailRecipient(escrowRecipient(), 'escrow_officer_document_upload');
    await uploadLinkRepo.recordEmailSent(first.id, 'mg-escrow-1');

    const { link: second, token: secondToken } = await service.createSecureUploadLinkForEmailRecipient(escrowRecipient(), 'escrow_officer_document_upload');
    expect(second.id).toBe(first.id);
    expect(secondToken).toBeNull();
    expect(uploadLinkRepo.rows).toHaveLength(1);
  });

  it('mints a FRESH link when the recipient email has changed — never silently reuses a link tied to a stale address', async () => {
    const { service, uploadLinkRepo } = buildService();
    const { link: first } = await service.createSecureUploadLinkForEmailRecipient(escrowRecipient({ recipientEmail: 'old@escrowco.com' }), 'escrow_officer_document_upload');
    await uploadLinkRepo.recordEmailSent(first.id, 'mg-escrow-1');

    const { link: second, token: secondToken } = await service.createSecureUploadLinkForEmailRecipient(
      escrowRecipient({ recipientEmail: 'new@escrowco.com' }), 'escrow_officer_document_upload',
    );
    expect(second.id).not.toBe(first.id);
    expect(second.recipientEmail).toBe('new@escrowco.com');
    expect(secondToken).toEqual(expect.any(String));
    expect(uploadLinkRepo.rows).toHaveLength(2);
    // The old link for the stale address is untouched (not superseded — it's a distinct recipient, not a retry).
    expect(uploadLinkRepo.rows.find((r) => r.id === first.id)?.status).toBe(UploadLinkStatus.ACTIVE);
  });

  it('findActiveLinkForEmail reflects send status for status-display purposes', async () => {
    const { service, uploadLinkRepo } = buildService();
    expect(await service.findActiveLinkForEmail(TX_ID, 'erin@escrowco.com', 'escrow_officer_document_upload')).toBeNull();

    const { link } = await service.createSecureUploadLinkForEmailRecipient(escrowRecipient(), 'escrow_officer_document_upload');
    await uploadLinkRepo.recordEmailSent(link.id, 'mg-escrow-1');

    const found = await service.findActiveLinkForEmail(TX_ID, 'erin@escrowco.com', 'escrow_officer_document_upload');
    expect(found?.id).toBe(link.id);
    expect(found?.emailSentAt).toBeInstanceOf(Date);
  });

  it('the Buyer Agent link is completely unaffected by escrow link creation/idempotency', async () => {
    const { service, uploadLinkRepo } = buildService();
    const { link: buyerLink } = await service.createSecureUploadLink(buyerAgentRecipient(), 'document_upload');
    await uploadLinkRepo.recordEmailSent(buyerLink.id, 'mg-buyer-1');

    await service.createSecureUploadLinkForEmailRecipient(escrowRecipient(), 'escrow_officer_document_upload');
    expect(uploadLinkRepo.rows).toHaveLength(2);

    // Re-requesting the Buyer Agent link after the escrow creation still resolves to the same, unaffected row.
    const { link: buyerRetry, token: buyerRetryToken } = await service.createSecureUploadLink(buyerAgentRecipient(), 'document_upload');
    expect(buyerRetry.id).toBe(buyerLink.id);
    expect(buyerRetryToken).toBeNull();
    expect(uploadLinkRepo.rows).toHaveLength(2); // no new row created
  });
});

function brokerRecipient(overrides: Partial<UploadLinkRecipient> = {}): UploadLinkRecipient {
  return {
    transactionId: TX_ID,
    recipientId: null,
    recipientRole: 'other',
    recipientName: 'Bobby Broker',
    recipientEmail: 'bobby@brokerfirm.com',
    ...overrides,
  };
}

describe('UploadLinkService — createSecureUploadLinkForEmailRecipient (Broker, email-keyed idempotency)', () => {
  it('creates a link with no recipientPartyId, keyed by email instead, and the broker purpose is accepted by validateUploadToken', async () => {
    const { service, uploadLinkRepo } = buildService();
    const { link, token } = await service.createSecureUploadLinkForEmailRecipient(brokerRecipient(), 'broker_document_upload');

    expect(token).toEqual(expect.any(String));
    expect(link.recipientPartyId).toBeNull();
    expect(link.recipientEmail).toBe('bobby@brokerfirm.com');
    expect(link.purpose).toBe('broker_document_upload');
    expect(uploadLinkRepo.rows).toHaveLength(1);

    const { link: validated } = await service.validateUploadToken(token!);
    expect(validated.purpose).toBe('broker_document_upload');
  });

  it('reuses the active, already-emailed link when the broker email is unchanged — no duplicate row, no new token', async () => {
    const { service, uploadLinkRepo } = buildService();
    const { link: first } = await service.createSecureUploadLinkForEmailRecipient(brokerRecipient(), 'broker_document_upload');
    await uploadLinkRepo.recordEmailSent(first.id, 'mg-broker-1');

    const { link: second, token: secondToken } = await service.createSecureUploadLinkForEmailRecipient(brokerRecipient(), 'broker_document_upload');
    expect(second.id).toBe(first.id);
    expect(secondToken).toBeNull();
    expect(uploadLinkRepo.rows).toHaveLength(1);
  });

  it('mints a FRESH link when the broker email has changed — never silently reuses a link tied to a stale address', async () => {
    const { service, uploadLinkRepo } = buildService();
    const { link: first } = await service.createSecureUploadLinkForEmailRecipient(brokerRecipient({ recipientEmail: 'old@brokerfirm.com' }), 'broker_document_upload');
    await uploadLinkRepo.recordEmailSent(first.id, 'mg-broker-1');

    const { link: second, token: secondToken } = await service.createSecureUploadLinkForEmailRecipient(
      brokerRecipient({ recipientEmail: 'new@brokerfirm.com' }), 'broker_document_upload',
    );
    expect(second.id).not.toBe(first.id);
    expect(second.recipientEmail).toBe('new@brokerfirm.com');
    expect(secondToken).toEqual(expect.any(String));
    expect(uploadLinkRepo.rows).toHaveLength(2);
  });
});
