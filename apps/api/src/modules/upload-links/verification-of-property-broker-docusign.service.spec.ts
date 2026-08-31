import { VerificationOfPropertyBrokerDocusignService } from './verification-of-property-broker-docusign.service';

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

const VP_DOC = (overrides: Record<string, unknown> = {}) => ({
  id: 'vp-doc-1',
  formCode: 'VP',
  analysisStatus: 'completed',
  metadataJson: { compliance: { blockers: [] } },
  ...overrides,
});

const BROKER_LINK = { id: 'link-broker-1', purpose: 'broker_document_upload', transactionId: TX_ID, recipientEmail: 'bobby@brokerfirm.com', emailSentAt: new Date(), emailMessageId: 'orig-msg-id' };

function buildService(overrides: {
  doc?: ReturnType<typeof VP_DOC> | null;
  buyerSideInfo?: { brokerFullName: string | null; brokerEmail: string | null } | null;
  hasActiveBlockers?: boolean;
  existingEnvelopes?: Array<{ documentIds: string[] | null; status: string; envelopeId?: string }>;
  createEnvelopeImpl?: () => Promise<{ envelopeId: string }>;
  links?: Array<Record<string, unknown>>;
  sendResult?: { sent: boolean; providerMessageId: string | null };
} = {}) {
  const documentsService = {
    findOne: jest.fn().mockImplementation(async () => {
      if (overrides.doc === null) throw new Error('not found');
      return overrides.doc ?? VP_DOC();
    }),
  };
  const buyerSideInformationService = {
    findByTransaction: jest.fn().mockResolvedValue(
      overrides.buyerSideInfo !== undefined ? overrides.buyerSideInfo : { brokerFullName: 'Bobby Broker', brokerEmail: 'bobby@brokerfirm.com' },
    ),
  };
  const docuSignService = {
    createEnvelope: jest.fn(overrides.createEnvelopeImpl ?? (async () => ({ envelopeId: 'env-1' }))),
  };
  const blockerOverrideService = {
    findForTransaction: jest.fn().mockResolvedValue([]),
    hasActiveBlockers: jest.fn().mockReturnValue(overrides.hasActiveBlockers ?? false),
  };
  const envelopes = overrides.existingEnvelopes ?? [];
  const envelopeRepo = {
    find: jest.fn().mockResolvedValue(envelopes),
    create: jest.fn((v: unknown) => v),
    save: jest.fn().mockResolvedValue(undefined),
  };
  const links = overrides.links ?? [{ ...BROKER_LINK }];
  let regenCounter = 0;
  const uploadLinkService = {
    findActiveLinkForEmail: jest.fn(async (transactionId: string, email: string, purpose: string) =>
      links.find((l) => l.transactionId === transactionId && l.recipientEmail === email && l.purpose === purpose) ?? null),
    regenerateSecureUploadLink: jest.fn(async (id: string) => {
      const existing = links.find((l) => l.id === id)!;
      const newLink = { ...existing, id: `${id}-regen-${++regenCounter}` };
      return { link: newLink, token: `raw-token-${regenCounter}` };
    }),
  };
  const uploadLinkEmailService = {
    sendVpSentToBrokerEmail: jest.fn().mockResolvedValue(overrides.sendResult ?? { sent: true, providerMessageId: 'mg-1' }),
  };
  const auditLogService = { log: jest.fn().mockResolvedValue(undefined) };

  const service = new VerificationOfPropertyBrokerDocusignService(
    documentsService as never,
    buyerSideInformationService as never,
    docuSignService as never,
    blockerOverrideService as never,
    envelopeRepo as never,
    uploadLinkService as never,
    uploadLinkEmailService as never,
    auditLogService as never,
  );

  return { service, documentsService, buyerSideInformationService, docuSignService, blockerOverrideService, envelopeRepo, uploadLinkService, uploadLinkEmailService, auditLogService };
}

describe('VerificationOfPropertyBrokerDocusignService.handleVpUploaded', () => {
  it('sends the VP document to the Broker via DocuSign and replies on their existing upload-link thread', async () => {
    const { service, docuSignService, envelopeRepo, uploadLinkService, uploadLinkEmailService, auditLogService } = buildService();

    await service.handleVpUploaded(TRANSACTION as never, 'vp-doc-1');

    expect(docuSignService.createEnvelope).toHaveBeenCalledWith(expect.objectContaining({
      transactionId: TX_ID,
      documentIds: ['vp-doc-1'],
      signers: [{ name: 'Bobby Broker', email: 'bobby@brokerfirm.com', role: 'Broker' }],
    }));
    expect(envelopeRepo.save).not.toHaveBeenCalled(); // success path never touches envelopeRepo.save directly — DocuSignService owns that
    expect(uploadLinkService.regenerateSecureUploadLink).toHaveBeenCalledWith('link-broker-1');
    expect(uploadLinkEmailService.sendVpSentToBrokerEmail).toHaveBeenCalledWith(
      expect.objectContaining({ recipientEmail: 'bobby@brokerfirm.com' }), expect.any(String), expect.anything(),
    );
    expect(auditLogService.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'vp_sent_to_broker_via_docusign' }));
    expect(auditLogService.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'vp_broker_notification_sent' }));
  });

  it('is a no-op when the document is not a completed VP form', async () => {
    const { service, docuSignService } = buildService({ doc: VP_DOC({ formCode: 'RPA' }) });
    await service.handleVpUploaded(TRANSACTION as never, 'vp-doc-1');
    expect(docuSignService.createEnvelope).not.toHaveBeenCalled();
  });

  it('is a no-op when analysis has not completed', async () => {
    const { service, docuSignService } = buildService({ doc: VP_DOC({ analysisStatus: 'analyzing' }) });
    await service.handleVpUploaded(TRANSACTION as never, 'vp-doc-1');
    expect(docuSignService.createEnvelope).not.toHaveBeenCalled();
  });

  it('is a no-op when a required validation blocker is still active', async () => {
    const { service, docuSignService } = buildService({ hasActiveBlockers: true });
    await service.handleVpUploaded(TRANSACTION as never, 'vp-doc-1');
    expect(docuSignService.createEnvelope).not.toHaveBeenCalled();
  });

  it('is a no-op when no broker email is on file for the transaction', async () => {
    const { service, docuSignService } = buildService({ buyerSideInfo: { brokerFullName: null, brokerEmail: null } });
    await service.handleVpUploaded(TRANSACTION as never, 'vp-doc-1');
    expect(docuSignService.createEnvelope).not.toHaveBeenCalled();
  });

  it('skips sending when this exact document already has a still-live envelope', async () => {
    const { service, docuSignService } = buildService({
      existingEnvelopes: [{ documentIds: ['vp-doc-1'], status: 'sent', envelopeId: 'env-prior' }],
    });
    await service.handleVpUploaded(TRANSACTION as never, 'vp-doc-1');
    expect(docuSignService.createEnvelope).not.toHaveBeenCalled();
  });

  it('sends again when the only prior envelope for this document was declined/voided/failed', async () => {
    const { service, docuSignService } = buildService({
      existingEnvelopes: [{ documentIds: ['vp-doc-1'], status: 'declined', envelopeId: 'env-prior' }],
    });
    await service.handleVpUploaded(TRANSACTION as never, 'vp-doc-1');
    expect(docuSignService.createEnvelope).toHaveBeenCalled();
  });

  it('records a FAILED envelope row and an audit event, but never throws, when the DocuSign API call fails', async () => {
    const { service, envelopeRepo, auditLogService, uploadLinkEmailService } = buildService({
      createEnvelopeImpl: async () => { throw new Error('DocuSign API down'); },
    });

    await expect(service.handleVpUploaded(TRANSACTION as never, 'vp-doc-1')).resolves.toBeUndefined();

    expect(envelopeRepo.save).toHaveBeenCalledWith(expect.objectContaining({ status: 'send_failed', documentIds: ['vp-doc-1'] }));
    expect(auditLogService.log).toHaveBeenCalledWith(expect.objectContaining({
      action: 'vp_sent_to_broker_via_docusign',
      description: expect.stringContaining('Failed'),
    }));
    expect(uploadLinkEmailService.sendVpSentToBrokerEmail).not.toHaveBeenCalled();
  });

  it('still sends via DocuSign but skips the notification when the Broker has no existing upload-link thread yet', async () => {
    const { service, docuSignService, uploadLinkEmailService, auditLogService } = buildService({ links: [] });

    await service.handleVpUploaded(TRANSACTION as never, 'vp-doc-1');

    expect(docuSignService.createEnvelope).toHaveBeenCalled();
    expect(uploadLinkEmailService.sendVpSentToBrokerEmail).not.toHaveBeenCalled();
    expect(auditLogService.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'vp_sent_to_broker_via_docusign' }));
    expect(auditLogService.log).not.toHaveBeenCalledWith(expect.objectContaining({ action: 'vp_broker_notification_sent' }));
  });

  it('does not write the notification audit row when the notification email send fails', async () => {
    const { service, auditLogService } = buildService({ sendResult: { sent: false, providerMessageId: null } });
    await service.handleVpUploaded(TRANSACTION as never, 'vp-doc-1');
    expect(auditLogService.log).not.toHaveBeenCalledWith(expect.objectContaining({ action: 'vp_broker_notification_sent' }));
  });

  it('never throws even when the document lookup itself fails', async () => {
    const { service, docuSignService } = buildService({ doc: null });
    await expect(service.handleVpUploaded(TRANSACTION as never, 'vp-doc-1')).resolves.toBeUndefined();
    expect(docuSignService.createEnvelope).not.toHaveBeenCalled();
  });
});
