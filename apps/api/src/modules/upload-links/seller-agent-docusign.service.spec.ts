import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { SellerAgentDocusignService, BUYER_REVIEW_REMINDER_TEXT } from './seller-agent-docusign.service';
import { PartyRole } from '../transaction-parties/entities/transaction-party.entity';
import { DocuSignEnvelopeStatus } from '../docusign/entities/docusign-envelope.entity';

interface FakeLink {
  id: string;
  purpose: string;
  transactionId: string;
  recipientEmail: string;
  docusignConfirmationRequestedAt: Date | null;
  docusignConfirmedAt: Date | null;
}

const SELLER_AGENT_LINK: FakeLink = {
  id: 'link-2',
  purpose: 'seller_agent_document_upload',
  transactionId: 'tx-1',
  recipientEmail: 'sam@listingco.com',
  docusignConfirmationRequestedAt: null,
  docusignConfirmedAt: null,
};
const BUYER_AGENT_LINK: FakeLink = { ...SELLER_AGENT_LINK, id: 'link-1', purpose: 'document_upload' };

const TRANSACTION = { id: 'tx-1' };

function makeParty(overrides: Partial<{ id: string; partyRole: PartyRole; displayName: string; email: string | null }> = {}) {
  return { id: 'party-1', partyRole: PartyRole.BUYER, displayName: 'Buyer One', email: 'buyer@example.com', ...overrides };
}

function makeEnvelope(overrides: Partial<{ id: string; status: string; uploadLinkId: string; createdAt: Date; sentAt: Date | null; envelopeId: string }> = {}) {
  return { id: 'env-1', status: DocuSignEnvelopeStatus.SENT, uploadLinkId: 'link-2', createdAt: new Date('2026-01-01'), sentAt: new Date('2026-01-01'), envelopeId: 'ds-env-1', ...overrides };
}

const DOC = { id: 'doc-1', fileName: 'RPA.pdf', formCode: 'RPA' };

function buildService(overrides: {
  link?: FakeLink;
  linkFindByIdImpl?: () => Promise<FakeLink | null>;
  checklistStatusImpl?: () => Promise<{ allRequiredSubmitted: boolean }>;
  parties?: ReturnType<typeof makeParty>[];
  envelopes?: ReturnType<typeof makeEnvelope>[];
  documents?: (typeof DOC)[];
  sendSellerDocumentsImpl?: () => Promise<{ envelopeId: string }>;
} = {}) {
  const uploadLinkRepo = {
    findById: jest.fn(overrides.linkFindByIdImpl ?? (async () => overrides.link ?? SELLER_AGENT_LINK)),
    recordDocusignConfirmed: jest.fn().mockResolvedValue(undefined),
  };
  const formTemplatesService = {
    getSellerAgentChecklistStatus: jest.fn(overrides.checklistStatusImpl ?? (async () => ({ allRequiredSubmitted: true }))),
    getValidatedDocumentsForEnvelope: jest.fn().mockResolvedValue(overrides.documents ?? [DOC]),
  };
  const docuSignService = {
    sendSellerDocumentsToBuyer: jest.fn(overrides.sendSellerDocumentsImpl ?? (async () => ({ envelopeId: 'ds-env-new', status: 'sent', sentAt: new Date() }))),
  };
  const auditService = {
    findRecentlyRejectedFormCodes: jest.fn().mockResolvedValue(new Set()),
    recordDocusignConfirmedAuditEvent: jest.fn().mockResolvedValue(undefined),
    recordDocusignEnvelopeSentAuditEvent: jest.fn().mockResolvedValue(undefined),
  };
  const partiesRepo = { find: jest.fn().mockResolvedValue(overrides.parties ?? [makeParty(), makeParty({ id: 'party-2', partyRole: PartyRole.BUYER_AGENT, displayName: 'Alice Agent', email: 'alice@brokerage.com' })]) };
  const envelopeRepo = { find: jest.fn().mockResolvedValue(overrides.envelopes ?? []) };

  const service = new SellerAgentDocusignService(
    uploadLinkRepo as never,
    formTemplatesService as never,
    docuSignService as never,
    auditService as never,
    partiesRepo as never,
    envelopeRepo as never,
  );

  return { service, uploadLinkRepo, formTemplatesService, docuSignService, auditService, partiesRepo, envelopeRepo };
}

describe('SellerAgentDocusignService — purpose guard', () => {
  it('rejects getStatus/confirm/send for a non-Seller-Agent link', async () => {
    const { service } = buildService({ link: BUYER_AGENT_LINK });
    await expect(service.getStatus(BUYER_AGENT_LINK as never, TRANSACTION as never)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.confirm(BUYER_AGENT_LINK as never, TRANSACTION as never)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.send(BUYER_AGENT_LINK as never, TRANSACTION as never)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('SellerAgentDocusignService.getStatus', () => {
  it('reports eligible=true and lists Buyers/Buyer Agent when the checklist is complete', async () => {
    const { service } = buildService({ checklistStatusImpl: async () => ({ allRequiredSubmitted: true }) });
    const status = await service.getStatus(SELLER_AGENT_LINK as never, TRANSACTION as never);
    expect(status.eligible).toBe(true);
    expect(status.buyers).toEqual([{ name: 'Buyer One', email: 'buyer@example.com' }]);
    expect(status.buyerAgent).toEqual({ name: 'Alice Agent', email: 'alice@brokerage.com' });
    expect(status.missingRecipients).toEqual([]);
  });

  it('reports eligible=false when the checklist is not complete', async () => {
    const { service } = buildService({ checklistStatusImpl: async () => ({ allRequiredSubmitted: false }) });
    const status = await service.getStatus(SELLER_AGENT_LINK as never, TRANSACTION as never);
    expect(status.eligible).toBe(false);
  });

  it('lists missing recipients when no Buyer or Buyer Agent party exists', async () => {
    const { service } = buildService({ parties: [] });
    const status = await service.getStatus(SELLER_AGENT_LINK as never, TRANSACTION as never);
    expect(status.missingRecipients).toEqual(['Buyer', 'Buyer Agent']);
  });

  it('lists a missing Buyer when the Buyer has no valid email, even with a Buyer Agent present', async () => {
    const { service } = buildService({
      parties: [makeParty({ email: null }), makeParty({ id: 'party-2', partyRole: PartyRole.BUYER_AGENT, email: 'alice@brokerage.com' })],
    });
    const status = await service.getStatus(SELLER_AGENT_LINK as never, TRANSACTION as never);
    expect(status.missingRecipients).toEqual(['Buyer (Buyer One)']);
  });

  it('surfaces an existing non-terminal envelope as existingEnvelope', async () => {
    const { service } = buildService({ envelopes: [makeEnvelope({ status: DocuSignEnvelopeStatus.DELIVERED })] });
    const status = await service.getStatus(SELLER_AGENT_LINK as never, TRANSACTION as never);
    expect(status.existingEnvelope).toEqual(expect.objectContaining({ status: DocuSignEnvelopeStatus.DELIVERED }));
  });

  it('ignores declined/voided envelopes — existingEnvelope stays null', async () => {
    const { service } = buildService({
      envelopes: [makeEnvelope({ status: DocuSignEnvelopeStatus.DECLINED }), makeEnvelope({ id: 'env-2', status: DocuSignEnvelopeStatus.VOIDED })],
    });
    const status = await service.getStatus(SELLER_AGENT_LINK as never, TRANSACTION as never);
    expect(status.existingEnvelope).toBeNull();
  });

  it('reflects confirmationRequested/confirmed straight from the link entity', async () => {
    const link = { ...SELLER_AGENT_LINK, docusignConfirmationRequestedAt: new Date(), docusignConfirmedAt: new Date() };
    const { service } = buildService({ link });
    const status = await service.getStatus(link as never, TRANSACTION as never);
    expect(status.confirmationRequested).toBe(true);
    expect(status.confirmed).toBe(true);
  });
});

describe('SellerAgentDocusignService.confirm', () => {
  it('throws when the checklist is not complete', async () => {
    const { service } = buildService({ checklistStatusImpl: async () => ({ allRequiredSubmitted: false }) });
    await expect(service.confirm(SELLER_AGENT_LINK as never, TRANSACTION as never)).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('stamps confirmation and records the audit event when the checklist is complete', async () => {
    const { service, uploadLinkRepo, auditService } = buildService();
    const result = await service.confirm(SELLER_AGENT_LINK as never, TRANSACTION as never);
    expect(result).toEqual({ confirmed: true });
    expect(uploadLinkRepo.recordDocusignConfirmed).toHaveBeenCalledWith('link-2');
    expect(auditService.recordDocusignConfirmedAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ uploadLinkId: 'link-2', recipientEmail: 'sam@listingco.com' }));
  });

  it('is idempotent — confirming an already-confirmed link is a no-op, not an error', async () => {
    const link = { ...SELLER_AGENT_LINK, docusignConfirmedAt: new Date() };
    const { service, uploadLinkRepo, formTemplatesService } = buildService({ link });
    const result = await service.confirm(link as never, TRANSACTION as never);
    expect(result).toEqual({ confirmed: true });
    expect(formTemplatesService.getSellerAgentChecklistStatus).not.toHaveBeenCalled();
    expect(uploadLinkRepo.recordDocusignConfirmed).not.toHaveBeenCalled();
  });
});

describe('SellerAgentDocusignService.send', () => {
  const CONFIRMED_LINK = { ...SELLER_AGENT_LINK, docusignConfirmedAt: new Date('2026-01-02') };

  it('throws when the checklist is not complete', async () => {
    const { service } = buildService({ link: CONFIRMED_LINK, checklistStatusImpl: async () => ({ allRequiredSubmitted: false }) });
    await expect(service.send(CONFIRMED_LINK as never, TRANSACTION as never)).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('throws when the seller has not confirmed yet', async () => {
    const { service } = buildService({ link: SELLER_AGENT_LINK });
    await expect(service.send(SELLER_AGENT_LINK as never, TRANSACTION as never)).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('throws ConflictException when a non-terminal envelope already exists for this link', async () => {
    const { service } = buildService({ link: CONFIRMED_LINK, envelopes: [makeEnvelope({ status: DocuSignEnvelopeStatus.SENT })] });
    await expect(service.send(CONFIRMED_LINK as never, TRANSACTION as never)).rejects.toBeInstanceOf(ConflictException);
  });

  it('does not block on a declined/voided prior envelope — a fresh send is allowed', async () => {
    const { service, docuSignService } = buildService({ link: CONFIRMED_LINK, envelopes: [makeEnvelope({ status: DocuSignEnvelopeStatus.VOIDED })] });
    await service.send(CONFIRMED_LINK as never, TRANSACTION as never);
    expect(docuSignService.sendSellerDocumentsToBuyer).toHaveBeenCalledTimes(1);
  });

  it('throws when a required recipient is missing', async () => {
    const { service } = buildService({ link: CONFIRMED_LINK, parties: [] });
    await expect(service.send(CONFIRMED_LINK as never, TRANSACTION as never)).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('throws when there are no validated documents to send', async () => {
    const { service } = buildService({ link: CONFIRMED_LINK, documents: [] });
    await expect(service.send(CONFIRMED_LINK as never, TRANSACTION as never)).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('sends all Buyers as signers, the Buyer Agent as CC, all validated documents, and the exact reminder text', async () => {
    const { service, docuSignService, auditService } = buildService({
      link: CONFIRMED_LINK,
      parties: [
        makeParty({ id: 'buyer-1', displayName: 'Buyer One', email: 'buyer1@example.com' }),
        makeParty({ id: 'buyer-2', displayName: 'Buyer Two', email: 'buyer2@example.com' }),
        makeParty({ id: 'ba-1', partyRole: PartyRole.BUYER_AGENT, displayName: 'Alice Agent', email: 'alice@brokerage.com' }),
      ],
    });

    const envelope = await service.send(CONFIRMED_LINK as never, TRANSACTION as never);

    expect(docuSignService.sendSellerDocumentsToBuyer).toHaveBeenCalledWith({
      transactionId: 'tx-1',
      uploadLinkId: 'link-2',
      documentIds: ['doc-1'],
      buyers: [
        { name: 'Buyer One', email: 'buyer1@example.com' },
        { name: 'Buyer Two', email: 'buyer2@example.com' },
      ],
      buyerAgent: { name: 'Alice Agent', email: 'alice@brokerage.com' },
      emailBody: BUYER_REVIEW_REMINDER_TEXT,
    });
    expect(envelope.envelopeId).toBe('ds-env-new');
    expect(auditService.recordDocusignEnvelopeSentAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      transactionId: 'tx-1',
      uploadLinkId: 'link-2',
      documentIds: ['doc-1'],
      buyerEmails: ['buyer1@example.com', 'buyer2@example.com'],
      buyerAgentEmail: 'alice@brokerage.com',
    }));
  });
});
