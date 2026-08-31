import { ForbiddenException } from '@nestjs/common';
import { TransactionWorkspaceService } from './transaction-workspace.service';
import { PartyRole } from '../transaction-parties/entities/transaction-party.entity';
import { DocumentStatus } from '../transaction-documents/entities/transaction-document.entity';
import { UploadLinkStatus } from '../upload-links/entities/upload-link.entity';

const EMPTY_CHECKLIST = { items: [], optionalItems: [], unmatchedDocuments: [], requiredCount: 0, submittedCount: 0, allRequiredSubmitted: true };

function makeTx(overrides: Partial<{ id: string; organizationId: string; propertyState: string; transactionType: string; side: string; sellerSideReminderLeadDays: number | null; buyerSideReminderLeadDays: number | null }> = {}) {
  return {
    id: 'tx-1', organizationId: 'org-1', propertyState: 'CA', transactionType: 'purchase', side: 'dual',
    ...overrides,
  } as never;
}

function makeParty(overrides: Partial<{ id: string; transactionId: string; partyRole: PartyRole; displayName: string; email: string | null; phone: string | null; accountId: string | null; isPrimary: boolean; createdAt: Date; organization: { name: string } | null }> = {}) {
  return {
    id: 'party-1', transactionId: 'tx-1', partyRole: PartyRole.BUYER_AGENT, displayName: 'Agent Name',
    email: 'agent@example.com', phone: null, accountId: null, isPrimary: false, createdAt: new Date('2026-01-01'),
    organization: null,
    ...overrides,
  } as never;
}

function makeDoc(overrides: Partial<{
  id: string; transactionId: string; fileName: string | null; formCode: string | null; documentType: string;
  analysisStatus: string | null; status: DocumentStatus; isOriginalPackage: boolean; createdAt: Date;
  uploadLink: { purpose: string; recipientName: string; recipientRole: string } | null; uploadLinkId: string | null;
  uploadedByAccount: object | null; uploadedByAccountId: string | null;
  docusignEnvelopeId: string | null; signedAt: Date | null; versionNo: number;
}> = {}) {
  return {
    id: 'doc-1', transactionId: 'tx-1', fileName: 'file.pdf', formCode: null, documentType: 'external_upload',
    analysisStatus: null, status: DocumentStatus.UPLOADED, isOriginalPackage: false, createdAt: new Date('2026-01-01'),
    uploadLink: null, uploadLinkId: null, uploadedByAccount: null, uploadedByAccountId: null,
    docusignEnvelopeId: null, signedAt: null, versionNo: 1,
    ...overrides,
  } as never;
}

function makeLink(overrides: Partial<{ id: string; purpose: string; recipientName: string; recipientEmail: string; recipientRole: string; ccName: string | null; ccEmail: string | null; emailSentAt: Date | null; expiresAt: Date | null; status: UploadLinkStatus }> = {}) {
  return {
    id: 'link-1', purpose: 'document_upload', recipientName: 'Agent Name', recipientEmail: 'agent@example.com', recipientRole: 'buyer_agent',
    ccName: null, ccEmail: null, emailSentAt: new Date('2026-01-01'), expiresAt: null, status: UploadLinkStatus.ACTIVE,
    ...overrides,
  } as never;
}

function makeMessage(overrides: Partial<{
  id: string; transactionId: string; subject: string | null; recipientPartyId: string | null; senderPartyId: string | null;
  sentAt: Date | null; createdAt: Date; status: string; bodyText: string | null; metadataJson: Record<string, unknown> | null;
}> = {}) {
  return {
    id: 'msg-1', transactionId: 'tx-1', subject: 'Subject', recipientPartyId: null, senderPartyId: null,
    sentAt: new Date('2026-01-01'), createdAt: new Date('2026-01-01'), status: 'sent', bodyText: 'body',
    metadataJson: null,
    ...overrides,
  } as never;
}

function makeEnvelope(overrides: Partial<{
  id: string; transactionId: string; subject: string | null; sentAt: Date | null; createdAt: Date; status: string;
  message: string | null; signers: { name: string; email: string; status?: string }[];
  ccRecipients: { name: string; email: string }[] | null; uploadLinkId: string | null;
}> = {}) {
  return {
    id: 'env-1', transactionId: 'tx-1', subject: 'Envelope Subject', sentAt: new Date('2026-01-01'),
    createdAt: new Date('2026-01-01'), status: 'sent', message: null, signers: [],
    ccRecipients: null, uploadLinkId: null,
    ...overrides,
  } as never;
}

function buildService(opts: {
  tx?: ReturnType<typeof makeTx> | null;
  canAccess?: boolean;
  parties?: ReturnType<typeof makeParty>[];
  docs?: ReturnType<typeof makeDoc>[];
  messages?: ReturnType<typeof makeMessage>[];
  envelopes?: ReturnType<typeof makeEnvelope>[];
  links?: Record<string, ReturnType<typeof makeLink> | null>;
  escrowInfo?: object | null;
  hoaInfo?: object | null;
  buyerSideInfo?: object | null;
  checklist?: object;
  prefill?: object | null;
  cda?: object | null;
  signedCda?: object | null;
} = {}) {
  const transactionsRepo = { findOne: jest.fn().mockResolvedValue(opts.tx === undefined ? makeTx() : opts.tx) };
  const partiesRepo = { find: jest.fn().mockResolvedValue(opts.parties ?? []), findOne: jest.fn().mockResolvedValue((opts.parties ?? [])[0] ?? null) };
  const documentsRepo = { find: jest.fn().mockResolvedValue(opts.docs ?? []) };
  const messagesRepo = { find: jest.fn().mockResolvedValue(opts.messages ?? []) };
  const envelopesRepo = { find: jest.fn().mockResolvedValue(opts.envelopes ?? []) };
  const uploadLinksRepo = {
    findOne: jest.fn().mockImplementation(({ where }: { where: { purpose: string } }) =>
      Promise.resolve((opts.links ?? {})[where.purpose] ?? null)),
  };
  const transactionAccessService = { canAccountAccessTransaction: jest.fn().mockResolvedValue(opts.canAccess ?? true) };
  const checklistComposition = { composeForPurpose: jest.fn().mockResolvedValue(opts.checklist ?? EMPTY_CHECKLIST) };
  const cdaGenerationService = {
    getCdaForTransaction: jest.fn().mockResolvedValue(opts.cda ?? null),
    getSignedCdaForTransaction: jest.fn().mockResolvedValue(opts.signedCda ?? null),
  };
  const externalTransactionInformationService = { getPrefillData: jest.fn().mockResolvedValue(opts.prefill ?? null) };
  const escrowInformationService = { findByTransaction: jest.fn().mockResolvedValue(opts.escrowInfo ?? null) };
  const hoaInformationService = { findByTransaction: jest.fn().mockResolvedValue(opts.hoaInfo ?? null) };
  const buyerSideInformationService = { findByTransaction: jest.fn().mockResolvedValue(opts.buyerSideInfo ?? null) };
  const blockerOverrideService = { findForTransaction: jest.fn().mockResolvedValue([]) };

  const service = new TransactionWorkspaceService(
    transactionsRepo as never,
    partiesRepo as never,
    documentsRepo as never,
    messagesRepo as never,
    envelopesRepo as never,
    uploadLinksRepo as never,
    transactionAccessService as never,
    checklistComposition as never,
    cdaGenerationService as never,
    externalTransactionInformationService as never,
    escrowInformationService as never,
    hoaInformationService as never,
    buyerSideInformationService as never,
    blockerOverrideService as never,
  );

  return {
    service, transactionsRepo, partiesRepo, documentsRepo, messagesRepo, envelopesRepo, uploadLinksRepo,
    transactionAccessService, checklistComposition, cdaGenerationService, externalTransactionInformationService,
    escrowInformationService, hoaInformationService, buyerSideInformationService,
  };
}

describe('TransactionWorkspaceService — access enforcement', () => {
  it('throws ForbiddenException on every section method when the caller fails the access check', async () => {
    const { service } = buildService({ canAccess: false });
    await expect(service.getParties('acct-1', 'tx-1')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.getDocuments('acct-1', 'tx-1')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.getEmailHistory('acct-1', 'tx-1', 'buyer')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.getBuyerSideDetails('acct-1', 'tx-1')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.getSellerSideDetails('acct-1', 'tx-1')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.getEscrowDetails('acct-1', 'tx-1')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.getBrokerDetails('acct-1', 'tx-1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('throws NotFoundException when the transaction does not exist, before any access check runs', async () => {
    const { service, transactionAccessService } = buildService({ tx: null });
    await expect(service.getParties('acct-1', 'tx-missing')).rejects.toThrow('not found');
    expect(transactionAccessService.canAccountAccessTransaction).not.toHaveBeenCalled();
  });
});

describe('TransactionWorkspaceService.getParties', () => {
  it('maps party rows including brokerage from the joined organization', async () => {
    const { service } = buildService({
      parties: [makeParty({ organization: { name: 'Sunset Realty' } })],
    });
    const result = await service.getParties('acct-1', 'tx-1');
    expect(result[0].brokerage).toBe('Sunset Realty');
  });

  it('returns null brokerage when the party has no organization', async () => {
    const { service } = buildService({ parties: [makeParty({ organization: null })] });
    const result = await service.getParties('acct-1', 'tx-1');
    expect(result[0].brokerage).toBeNull();
  });
});

describe('TransactionWorkspaceService.getDocuments', () => {
  it('excludes superseded, rejected, and original-package documents', async () => {
    const { service } = buildService({
      docs: [
        makeDoc({ id: 'active', status: DocumentStatus.UPLOADED }),
        makeDoc({ id: 'superseded', status: DocumentStatus.SUPERSEDED }),
        makeDoc({ id: 'rejected', status: DocumentStatus.REJECTED }),
        makeDoc({ id: 'original', isOriginalPackage: true }),
      ],
    });
    const result = await service.getDocuments('acct-1', 'tx-1');
    expect(result.map((d) => d.id)).toEqual(['active']);
  });

  it('derives source and uploader from the upload link when link-sourced', async () => {
    const { service } = buildService({
      docs: [makeDoc({ uploadLink: makeLink({ purpose: 'seller_agent_document_upload', recipientName: 'Seller Agent Bob', recipientRole: 'seller_agent' }) })],
    });
    const result = await service.getDocuments('acct-1', 'tx-1');
    expect(result[0].source).toBe('seller_agent_document_upload');
    expect(result[0].uploadedByName).toBe('Seller Agent Bob');
    expect(result[0].uploadedByRole).toBe('seller_agent');
  });

  it('marks internally-uploaded documents with source "internal" and resolves the uploader role via their own party row', async () => {
    const { service, partiesRepo } = buildService({
      docs: [makeDoc({ uploadedByAccountId: 'acct-tc', uploadedByAccount: { displayName: 'Alice TC' } })],
    });
    partiesRepo.find.mockResolvedValueOnce([makeParty({ accountId: 'acct-tc', partyRole: PartyRole.BUYER_TRANSACTION_COORDINATOR })]);
    const result = await service.getDocuments('acct-1', 'tx-1');
    expect(result[0].source).toBe('internal');
    expect(result[0].uploadedByName).toBe('Alice TC');
    expect(result[0].uploadedByRole).toBe(PartyRole.BUYER_TRANSACTION_COORDINATOR);
  });

  it('marks a document with status SIGNED as signed:true, and excludes the superseded original it replaced', async () => {
    const { service } = buildService({
      docs: [
        makeDoc({ id: 'original', status: DocumentStatus.SUPERSEDED }),
        makeDoc({ id: 'signed-doc', status: DocumentStatus.SIGNED, docusignEnvelopeId: 'envelope-abc', signedAt: new Date('2026-05-03'), versionNo: 2 }),
      ],
    });
    const result = await service.getDocuments('acct-1', 'tx-1');

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('signed-doc');
    expect(result[0].signed).toBe(true);
    expect(result[0].status).toBe(DocumentStatus.SIGNED);
    expect(result[0].docusignEnvelopeId).toBe('envelope-abc');
    expect(result[0].signedAt).toEqual(new Date('2026-05-03'));
    expect(result[0].versionNo).toBe(2);
  });

  it('marks a non-signed active document as signed:false, with a null docusignEnvelopeId/signedAt', async () => {
    const { service } = buildService({ docs: [makeDoc({ status: DocumentStatus.UPLOADED })] });
    const result = await service.getDocuments('acct-1', 'tx-1');

    expect(result[0].signed).toBe(false);
    expect(result[0].docusignEnvelopeId).toBeNull();
    expect(result[0].signedAt).toBeNull();
  });
});

describe('TransactionWorkspaceService.getEmailHistory', () => {
  it('includes a message matched only via metadataJson.ccDetail (no recipientPartyId set)', async () => {
    const { service } = buildService({
      parties: [makeParty({ partyRole: PartyRole.SELLER_AGENT, email: 'seller-agent@example.com' })],
      messages: [makeMessage({
        recipientPartyId: null,
        metadataJson: { toDetail: [{ name: 'Seller', email: 'seller@example.com' }], ccDetail: [{ name: 'Seller Agent', email: 'seller-agent@example.com' }] },
      })],
    });
    const result = await service.getEmailHistory('acct-1', 'tx-1', 'seller');
    expect(result).toHaveLength(1);
    expect(result[0].cc).toEqual(['Seller Agent']);
  });

  it('excludes a message that does not involve any relevant party by id or email', async () => {
    const { service } = buildService({
      parties: [makeParty({ partyRole: PartyRole.SELLER_AGENT, email: 'seller-agent@example.com' })],
      messages: [makeMessage({ recipientPartyId: null, metadataJson: { toDetail: [{ name: 'Unrelated', email: 'unrelated@example.com' }] } })],
    });
    const result = await service.getEmailHistory('acct-1', 'tx-1', 'seller');
    expect(result).toHaveLength(0);
  });

  it('matches a DocuSign envelope by signer email and excludes one with no matching signer', async () => {
    const { service } = buildService({
      parties: [makeParty({ partyRole: PartyRole.BUYER_AGENT, email: 'buyer-agent@example.com' })],
      envelopes: [
        makeEnvelope({ id: 'matched', signers: [{ name: 'Buyer Agent', email: 'buyer-agent@example.com' }] }),
        makeEnvelope({ id: 'unmatched', signers: [{ name: 'Someone Else', email: 'someone@example.com' }] }),
      ],
    });
    const result = await service.getEmailHistory('acct-1', 'tx-1', 'buyer');
    expect(result.map((r) => r.id)).toEqual(['matched']);
    expect(result[0].type).toBe('docusign');
  });

  it('folds the escrow officer email in directly even with no transaction_parties row for them', async () => {
    const { service } = buildService({
      parties: [],
      escrowInfo: { escrowEmail: 'escrow@example.com' },
      messages: [makeMessage({ metadataJson: { toDetail: [{ name: 'Escrow', email: 'escrow@example.com' }] } })],
    });
    const result = await service.getEmailHistory('acct-1', 'tx-1', 'escrow');
    expect(result).toHaveLength(1);
  });

  it('attributes a Seller Agent DocuSign send to Seller Side via uploadLinkId, even though its signers/cc are Buyer-side people', async () => {
    const { service } = buildService({
      parties: [makeParty({ partyRole: PartyRole.SELLER_AGENT, email: 'sam@listingco.com' })],
      links: { seller_agent_document_upload: makeLink({ id: 'seller-link-1', purpose: 'seller_agent_document_upload' }) },
      envelopes: [
        makeEnvelope({
          id: 'seller-send', uploadLinkId: 'seller-link-1',
          signers: [{ name: 'Buyer One', email: 'buyer@example.com' }],
          ccRecipients: [{ name: 'Buyer Agent', email: 'buyer-agent@example.com' }],
        }),
        makeEnvelope({ id: 'unrelated', uploadLinkId: 'other-link-9', signers: [{ name: 'Someone', email: 'someone@example.com' }] }),
      ],
    });

    const result = await service.getEmailHistory('acct-1', 'tx-1', 'seller');

    expect(result.map((r) => r.id)).toEqual(['seller-send']);
    expect(result[0].cc).toEqual(['Buyer Agent']);
  });

  it('does not attribute an envelope by uploadLinkId on the Buyer or Escrow side — only Seller Side gets this special-case match', async () => {
    const { service } = buildService({
      parties: [makeParty({ partyRole: PartyRole.BUYER_AGENT, email: 'alice@brokerage.com' })],
      links: { seller_agent_document_upload: makeLink({ id: 'seller-link-1', purpose: 'seller_agent_document_upload' }) },
      envelopes: [
        makeEnvelope({ id: 'seller-send', uploadLinkId: 'seller-link-1', signers: [{ name: 'Buyer One', email: 'buyer@example.com' }] }),
      ],
    });

    const result = await service.getEmailHistory('acct-1', 'tx-1', 'buyer');

    expect(result).toHaveLength(0);
  });

  it('folds the broker email in directly (no transaction_parties row exists for the broker)', async () => {
    const { service } = buildService({
      parties: [],
      buyerSideInfo: { brokerEmail: 'broker@example.com' },
      messages: [makeMessage({ metadataJson: { toDetail: [{ name: 'Broker', email: 'broker@example.com' }] } })],
    });
    const result = await service.getEmailHistory('acct-1', 'tx-1', 'broker');
    expect(result).toHaveLength(1);
  });
});

describe('TransactionWorkspaceService — checklist composition delegation (the "same data source" contract)', () => {
  it('getBuyerSideDetails delegates to ChecklistCompositionService with the Buyer Agent purpose and the resolved link (possibly null)', async () => {
    const buyerLink = makeLink({ id: 'buyer-link', purpose: 'document_upload' });
    const { service, checklistComposition } = buildService({ links: { document_upload: buyerLink } });
    await service.getBuyerSideDetails('acct-1', 'tx-1');
    expect(checklistComposition.composeForPurpose).toHaveBeenCalledWith('document_upload', buyerLink, expect.objectContaining({ id: 'tx-1' }));
  });

  it('getSellerSideDetails, getEscrowDetails, and getBrokerDetails all still compose a checklist when no active link exists yet — never blank', async () => {
    const checklist = { ...EMPTY_CHECKLIST, items: [{ formCode: 'x', formName: 'X', category: 'c', status: 'required' }], requiredCount: 1 };
    const { service, checklistComposition } = buildService({ links: {}, checklist });

    const seller = await service.getSellerSideDetails('acct-1', 'tx-1');
    const escrow = await service.getEscrowDetails('acct-1', 'tx-1');
    const broker = await service.getBrokerDetails('acct-1', 'tx-1');

    expect(seller.checklist).toEqual(checklist);
    expect(escrow.checklist).toEqual(checklist);
    expect(broker.checklist).toEqual(checklist);
    expect(checklistComposition.composeForPurpose).toHaveBeenCalledWith('seller_agent_document_upload', null, expect.anything());
    expect(checklistComposition.composeForPurpose).toHaveBeenCalledWith('escrow_officer_document_upload', null, expect.anything());
    expect(checklistComposition.composeForPurpose).toHaveBeenCalledWith('broker_document_upload', null, expect.anything());
  });
});

describe('TransactionWorkspaceService — per-side document visibility (mirrors the upload-link page\'s own Uploaded Documents list)', () => {
  it('getBuyerSideDetails shows Buyer Agent-origin and INTERNAL-origin documents, but not a Seller Agent-origin one', async () => {
    const { service } = buildService({
      docs: [
        makeDoc({ id: 'buyer-doc', uploadLinkId: 'buyer-link', uploadLink: makeLink({ purpose: 'document_upload' }) }),
        makeDoc({ id: 'internal-doc', uploadLinkId: null }),
        makeDoc({ id: 'seller-doc', uploadLinkId: 'seller-link', uploadLink: makeLink({ purpose: 'seller_agent_document_upload' }) }),
      ],
    });
    const result = await service.getBuyerSideDetails('acct-1', 'tx-1');
    expect(result.documents.map((d) => d.id).sort()).toEqual(['buyer-doc', 'internal-doc']);
  });

  it('getSellerSideDetails shows only Seller Agent-origin documents', async () => {
    const { service } = buildService({
      docs: [
        makeDoc({ id: 'seller-doc', uploadLinkId: 'seller-link', uploadLink: makeLink({ purpose: 'seller_agent_document_upload' }) }),
        makeDoc({ id: 'buyer-doc', uploadLinkId: 'buyer-link', uploadLink: makeLink({ purpose: 'document_upload' }) }),
        makeDoc({ id: 'internal-doc', uploadLinkId: null }),
      ],
    });
    const result = await service.getSellerSideDetails('acct-1', 'tx-1');
    expect(result.documents.map((d) => d.id)).toEqual(['seller-doc']);
  });

  it('getEscrowDetails shows Escrow-origin documents, plus the RPA-formCode exception and the signed_cda-documentType exception', async () => {
    const { service } = buildService({
      docs: [
        makeDoc({ id: 'escrow-doc', uploadLinkId: 'escrow-link', uploadLink: makeLink({ purpose: 'escrow_officer_document_upload' }) }),
        makeDoc({ id: 'rpa-doc', uploadLinkId: 'buyer-link', uploadLink: makeLink({ purpose: 'document_upload' }), formCode: 'RPA' }),
        makeDoc({ id: 'signed-cda-doc', uploadLinkId: 'broker-link', uploadLink: makeLink({ purpose: 'broker_document_upload' }), documentType: 'signed_cda' }),
        makeDoc({ id: 'unrelated-buyer-doc', uploadLinkId: 'buyer-link', uploadLink: makeLink({ purpose: 'document_upload' }) }),
      ],
      escrowInfo: { escrowContactName: 'Eve Escrow', escrowEmail: 'eve@escrow.com' },
    });
    const result = await service.getEscrowDetails('acct-1', 'tx-1');
    expect(result.documents.map((d) => d.id).sort()).toEqual(['escrow-doc', 'rpa-doc', 'signed-cda-doc']);
    expect(result.escrowContactName).toBe('Eve Escrow');
  });

  it('getBrokerDetails has no documents field at all — the Broker upload link has no general document list', async () => {
    const { service } = buildService({ docs: [makeDoc({ id: 'cda-doc', documentType: 'cda' })] });
    const result = await service.getBrokerDetails('acct-1', 'tx-1');
    expect(result as never as { documents?: unknown }).not.toHaveProperty('documents');
  });
});

describe('TransactionWorkspaceService — transactionInfo/cda/signedCda per side', () => {
  it('getBuyerSideDetails returns null transactionInfo with no active link, and the lender+buyerSide slice of the prefill DTO once one exists', async () => {
    const { service: noLink } = buildService({ links: {} });
    expect((await noLink.getBuyerSideDetails('acct-1', 'tx-1')).transactionInfo).toBeNull();

    const buyerLink = makeLink({ id: 'buyer-link', purpose: 'document_upload' });
    const prefill = {
      lender: { lenderName: 'Big Bank', lenderEmail: 'lender@bank.com' },
      escrow: { escrowContactName: null, escrowEmail: null },
      hoa: { hasHoa: null },
      buyerSide: { brokerageName: 'Sunset Realty', brokerFullName: null, brokerEmail: null, buyerAgentPaymentAddress: null, clientCredits: null, buyerCommissionType: null, buyerCommissionValue: null, grossCommission: null },
      broker: { finalSalesPrice: null, grossCommission: null, brokerPaymentAddress: null, brokerCommissionType: null, brokerCommissionValue: null, brokerCommissionAmount: null, buyerAgentCommissionAmount: null },
    };
    const { service, externalTransactionInformationService } = buildService({ links: { document_upload: buyerLink }, prefill });
    const result = await service.getBuyerSideDetails('acct-1', 'tx-1');
    expect(externalTransactionInformationService.getPrefillData).toHaveBeenCalledWith(buyerLink, expect.objectContaining({ id: 'tx-1' }));
    expect(result.transactionInfo).toEqual({ lender: prefill.lender, buyerSide: prefill.buyerSide });
  });

  it('getBuyerSideDetails surfaces the generated CDA from CdaGenerationService.getCdaForTransaction', async () => {
    const cda = { id: 'cda-1', fileName: 'CDA.pdf', generatedAt: new Date('2026-01-01'), versionNo: 1, viewUrl: '/api/v1/transaction-documents/cda-1/file' };
    const { service } = buildService({ cda });
    const result = await service.getBuyerSideDetails('acct-1', 'tx-1');
    expect(result.cda).toEqual(cda);
  });

  it('getEscrowDetails surfaces escrowNumber/willSendDocumentsToBuyer/hasHoa, the link\'s own cc contact, and the signed CDA', async () => {
    const escrowLink = makeLink({ id: 'escrow-link', purpose: 'escrow_officer_document_upload', ccName: 'Sam Seller Agent', ccEmail: 'sam@listingco.com' });
    const signedCda = { id: 'signed-1', fileName: 'signed.pdf', generatedAt: new Date('2026-01-02'), versionNo: 1, viewUrl: '/api/v1/transaction-documents/signed-1/file' };
    const { service } = buildService({
      links: { escrow_officer_document_upload: escrowLink },
      escrowInfo: { escrowContactName: 'Eve Escrow', escrowEmail: 'eve@escrow.com', escrowNumber: 'ESC-123', willSendDocumentsToBuyer: true },
      hoaInfo: { hasHoa: true },
      signedCda,
    });
    const result = await service.getEscrowDetails('acct-1', 'tx-1');
    expect(result.escrowNumber).toBe('ESC-123');
    expect(result.willSendDocumentsToBuyer).toBe(true);
    expect(result.hasHoa).toBe(true);
    expect(result.ccContactName).toBe('Sam Seller Agent');
    expect(result.ccContactEmail).toBe('sam@listingco.com');
    expect(result.signedCda).toEqual(signedCda);
  });

  it('getBrokerDetails falls back to BuyerSideInformationEntity for recipient name/email when there is no active link, and surfaces both CDA and signed CDA', async () => {
    const cda = { id: 'cda-1', fileName: 'CDA.pdf', generatedAt: new Date('2026-01-01'), versionNo: 1, viewUrl: '/api/v1/transaction-documents/cda-1/file' };
    const signedCda = { id: 'signed-1', fileName: 'signed.pdf', generatedAt: new Date('2026-01-02'), versionNo: 1, viewUrl: '/api/v1/transaction-documents/signed-1/file' };
    const { service } = buildService({
      links: {},
      buyerSideInfo: { brokerFullName: 'Bob Broker', brokerEmail: 'bob@brokerhq.com' },
      cda, signedCda,
    });
    const result = await service.getBrokerDetails('acct-1', 'tx-1');
    expect(result.recipientName).toBe('Bob Broker');
    expect(result.recipientEmail).toBe('bob@brokerhq.com');
    expect(result.cda).toEqual(cda);
    expect(result.signedCda).toEqual(signedCda);
  });

  it('getBrokerDetails prefers the active link\'s own recipient name/email over BuyerSideInformationEntity when a link exists', async () => {
    const brokerLink = makeLink({ id: 'broker-link', purpose: 'broker_document_upload', recipientName: 'Bob Broker (link)', recipientEmail: 'bob-link@brokerhq.com' });
    const { service } = buildService({
      links: { broker_document_upload: brokerLink },
      buyerSideInfo: { brokerFullName: 'Bob Broker (stale)', brokerEmail: 'bob-stale@brokerhq.com' },
    });
    const result = await service.getBrokerDetails('acct-1', 'tx-1');
    expect(result.recipientName).toBe('Bob Broker (link)');
    expect(result.recipientEmail).toBe('bob-link@brokerhq.com');
  });
});

describe('TransactionWorkspaceService — reminder lead-day resolution (unchanged behavior)', () => {
  it('getSellerSideDetails resolves sellerSideReminderLeadDays to the default when unset, and to the explicit value when set', async () => {
    const { service: defaultService } = buildService({ tx: makeTx({ sellerSideReminderLeadDays: null }) });
    const defaultResult = await defaultService.getSellerSideDetails('acct-1', 'tx-1');
    expect(defaultResult.sellerSideReminderLeadDays).toBe(3);

    const { service: overriddenService } = buildService({ tx: makeTx({ sellerSideReminderLeadDays: 6 }) });
    const overriddenResult = await overriddenService.getSellerSideDetails('acct-1', 'tx-1');
    expect(overriddenResult.sellerSideReminderLeadDays).toBe(6);
  });
});
