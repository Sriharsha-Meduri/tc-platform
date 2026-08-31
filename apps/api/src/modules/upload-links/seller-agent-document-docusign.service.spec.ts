import { NotFoundException, ConflictException, UnprocessableEntityException } from '@nestjs/common';
import { SellerAgentDocumentDocusignService } from './seller-agent-document-docusign.service';
import { PartyRole } from '../transaction-parties/entities/transaction-party.entity';
import { DocuSignEnvelopeStatus } from '../docusign/entities/docusign-envelope.entity';
import { hasActiveBlockers } from '../blocker-overrides/blocker-override.util';

const SELLER_AGENT_LINK = {
  id: 'link-2',
  purpose: 'seller_agent_document_upload',
  transactionId: 'tx-1',
};
const BUYER_AGENT_LINK = { ...SELLER_AGENT_LINK, id: 'link-1', purpose: 'document_upload' };
const TRANSACTION = { id: 'tx-1' };

function makeParty(overrides: Partial<{ id: string; partyRole: PartyRole; displayName: string; email: string | null }> = {}) {
  return { id: 'party-1', partyRole: PartyRole.BUYER, displayName: 'Buyer One', email: 'buyer@example.com', ...overrides };
}

function makeDoc(overrides: Partial<{ id: string; fileName: string | null; formCode: string | null; analysisStatus: string | null; metadataJson: Record<string, unknown> | null }> = {}) {
  return {
    id: 'doc-1', fileName: 'TDS.pdf', formCode: 'TDS', analysisStatus: 'completed',
    metadataJson: { compliance: { checks: [{ ruleId: 'r1', category: 'signatures', formCode: 'TDS', phase: 'disclosure', severity: 'error', status: 'pass', label: 'Seller 1 signature present' }], blockers: [] } },
    ...overrides,
  };
}

function makeEnvelope(overrides: Partial<{ id: string; status: string; documentIds: string[]; uploadLinkId: string; envelopeId: string; sentAt: Date | null }> = {}) {
  return { id: 'env-1', status: DocuSignEnvelopeStatus.SENT, documentIds: ['doc-1'], uploadLinkId: 'link-2', envelopeId: 'ds-env-1', sentAt: new Date('2026-01-01'), ...overrides };
}

function buildService(overrides: {
  doc?: ReturnType<typeof makeDoc> | null;
  docsById?: Record<string, ReturnType<typeof makeDoc> | null>;
  parties?: ReturnType<typeof makeParty>[];
  envelopes?: ReturnType<typeof makeEnvelope>[];
  sendSellerDocumentsImpl?: () => Promise<{ envelopeId: string; status: string; sentAt: Date }>;
  blockerOverrides?: Array<{ blockerId: string; documentId: string | null; formCode: string | null }>;
  allRequiredSubmitted?: boolean;
} = {}) {
  const formTemplatesService = {
    getValidatedDocumentById: overrides.docsById
      ? jest.fn().mockImplementation((_linkId: string, _txId: string, documentId: string) => Promise.resolve(overrides.docsById![documentId] ?? null))
      : jest.fn().mockResolvedValue(overrides.doc !== undefined ? overrides.doc : makeDoc()),
    getSellerAgentChecklistStatus: jest.fn().mockResolvedValue({
      items: [], optionalItems: [], unmatchedDocuments: [], requiredCount: 0, submittedCount: 0,
      allRequiredSubmitted: overrides.allRequiredSubmitted ?? true,
    }),
  };
  const docuSignService = {
    sendSellerDocumentsToBuyer: jest.fn(overrides.sendSellerDocumentsImpl ?? (async () => ({ envelopeId: 'ds-env-new', status: 'sent', sentAt: new Date() }))),
  };
  const auditService = {
    findMostRecentRejectionReasons: jest.fn().mockResolvedValue(new Map()),
    recordDocusignEnvelopeSentAuditEvent: jest.fn().mockResolvedValue(undefined),
    recordDocumentDocusignSendFailedAuditEvent: jest.fn().mockResolvedValue(undefined),
  };
  const partiesRepo = {
    find: jest.fn().mockResolvedValue(overrides.parties ?? [
      makeParty(),
      makeParty({ id: 'party-2', partyRole: PartyRole.BUYER_AGENT, displayName: 'Alice Agent', email: 'alice@brokerage.com' }),
    ]),
  };
  const envelopeRepo = {
    find: jest.fn().mockResolvedValue(overrides.envelopes ?? []),
    create: jest.fn().mockImplementation((v: unknown) => v),
    save: jest.fn().mockImplementation((v: unknown) => Promise.resolve(v)),
  };
  const blockerOverrideService = {
    findForTransaction: jest.fn().mockResolvedValue(overrides.blockerOverrides ?? []),
    hasActiveBlockers: jest.fn(hasActiveBlockers),
  };

  const service = new SellerAgentDocumentDocusignService(
    formTemplatesService as never,
    docuSignService as never,
    auditService as never,
    partiesRepo as never,
    envelopeRepo as never,
    blockerOverrideService as never,
  );

  return { service, formTemplatesService, docuSignService, auditService, partiesRepo, envelopeRepo, blockerOverrideService };
}

describe('SellerAgentDocumentDocusignService — purpose guard', () => {
  it('rejects sendDocument and enrichChecklistWithDocusignInfo for a non-Seller-Agent link', async () => {
    const { service } = buildService();
    await expect(service.sendDocument(BUYER_AGENT_LINK as never, TRANSACTION as never, 'doc-1')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.enrichChecklistWithDocusignInfo(BUYER_AGENT_LINK as never, TRANSACTION as never, {
      items: [], optionalItems: [], unmatchedDocuments: [], requiredCount: 0, submittedCount: 0, allRequiredSubmitted: true,
    } as never)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('SellerAgentDocumentDocusignService.sendDocument', () => {
  it('sends the one document as a single-element documentIds array, using the Buyer-side recipient rule, and audits via the existing action', async () => {
    const { service, docuSignService, auditService } = buildService();

    const envelope = await service.sendDocument(SELLER_AGENT_LINK as never, TRANSACTION as never, 'doc-1');

    expect(docuSignService.sendSellerDocumentsToBuyer).toHaveBeenCalledWith(expect.objectContaining({
      transactionId: 'tx-1',
      uploadLinkId: 'link-2',
      documentIds: ['doc-1'],
      buyers: [{ name: 'Buyer One', email: 'buyer@example.com' }],
      buyerAgent: { name: 'Alice Agent', email: 'alice@brokerage.com' },
    }));
    expect(envelope.envelopeId).toBe('ds-env-new');
    expect(auditService.recordDocusignEnvelopeSentAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      documentIds: ['doc-1'],
    }));
  });

  it('throws and never sends when the document has not completed analysis', async () => {
    const { service, docuSignService } = buildService({ doc: makeDoc({ analysisStatus: 'analyzing' }) });
    await expect(service.sendDocument(SELLER_AGENT_LINK as never, TRANSACTION as never, 'doc-1')).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(docuSignService.sendSellerDocumentsToBuyer).not.toHaveBeenCalled();
  });

  it('throws and never sends when the document type has not been identified', async () => {
    const { service, docuSignService } = buildService({ doc: makeDoc({ formCode: null }) });
    await expect(service.sendDocument(SELLER_AGENT_LINK as never, TRANSACTION as never, 'doc-1')).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(docuSignService.sendSellerDocumentsToBuyer).not.toHaveBeenCalled();
  });

  it('throws and never sends when the document has outstanding blockers', async () => {
    const { service, docuSignService } = buildService({
      doc: makeDoc({ metadataJson: { compliance: { checks: [], blockers: [{ compositeId: 'x', message: 'bad' }] } } }),
    });
    await expect(service.sendDocument(SELLER_AGENT_LINK as never, TRANSACTION as never, 'doc-1')).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(docuSignService.sendSellerDocumentsToBuyer).not.toHaveBeenCalled();
  });

  it('throws and never sends when the document does not belong to this upload link (getValidatedDocumentById scoping)', async () => {
    const { service, formTemplatesService, docuSignService } = buildService({ doc: null });
    await expect(service.sendDocument(SELLER_AGENT_LINK as never, TRANSACTION as never, 'doc-from-another-link')).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(formTemplatesService.getValidatedDocumentById).toHaveBeenCalledWith('link-2', 'tx-1', 'doc-from-another-link');
    expect(docuSignService.sendSellerDocumentsToBuyer).not.toHaveBeenCalled();
  });

  it('does not block on a declined/voided/send_failed prior envelope for this document — a fresh send is allowed', async () => {
    const { service, docuSignService } = buildService({
      envelopes: [makeEnvelope({ status: DocuSignEnvelopeStatus.VOIDED })],
    });
    await service.sendDocument(SELLER_AGENT_LINK as never, TRANSACTION as never, 'doc-1');
    expect(docuSignService.sendSellerDocumentsToBuyer).toHaveBeenCalledTimes(1);
  });

  it('throws ConflictException and never sends when a non-terminal envelope already contains this document', async () => {
    const { service, docuSignService } = buildService({
      envelopes: [makeEnvelope({ status: DocuSignEnvelopeStatus.SENT, documentIds: ['doc-1'] })],
    });
    await expect(service.sendDocument(SELLER_AGENT_LINK as never, TRANSACTION as never, 'doc-1')).rejects.toBeInstanceOf(ConflictException);
    expect(docuSignService.sendSellerDocumentsToBuyer).not.toHaveBeenCalled();
  });

  it('does not block on an envelope that contains a DIFFERENT document', async () => {
    const { service, docuSignService } = buildService({
      envelopes: [makeEnvelope({ status: DocuSignEnvelopeStatus.SENT, documentIds: ['some-other-doc'] })],
    });
    await service.sendDocument(SELLER_AGENT_LINK as never, TRANSACTION as never, 'doc-1');
    expect(docuSignService.sendSellerDocumentsToBuyer).toHaveBeenCalledTimes(1);
  });

  it('resend: true bypasses an existing blocking envelope and sends anyway', async () => {
    const { service, docuSignService } = buildService({
      envelopes: [makeEnvelope({ status: DocuSignEnvelopeStatus.SENT, documentIds: ['doc-1'] })],
    });
    await service.sendDocument(SELLER_AGENT_LINK as never, TRANSACTION as never, 'doc-1', { resend: true });
    expect(docuSignService.sendSellerDocumentsToBuyer).toHaveBeenCalledTimes(1);
  });

  it('throws and never sends when required checklist documents are not all submitted yet, even for an otherwise-eligible document', async () => {
    const { service, formTemplatesService, docuSignService } = buildService({ allRequiredSubmitted: false });
    await expect(service.sendDocument(SELLER_AGENT_LINK as never, TRANSACTION as never, 'doc-1'))
      .rejects.toMatchObject({ message: expect.stringContaining('All required documents must be submitted') });
    expect(formTemplatesService.getSellerAgentChecklistStatus).toHaveBeenCalledWith(TRANSACTION, 'link-2', new Set());
    expect(docuSignService.sendSellerDocumentsToBuyer).not.toHaveBeenCalled();
  });

  it('throws when a required recipient is missing', async () => {
    const { service } = buildService({ parties: [] });
    await expect(service.sendDocument(SELLER_AGENT_LINK as never, TRANSACTION as never, 'doc-1')).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('when the DocuSign API call itself fails, persists a FAILED-status envelope row with a sanitized message (never the raw error), audits the failure, and rethrows a sanitized error', async () => {
    const { service, envelopeRepo, auditService } = buildService({
      sendSellerDocumentsImpl: async () => { throw new Error('DocuSign 500: internal account xyz-secret exposed in this message'); },
    });

    let thrown: Error | undefined;
    try {
      await service.sendDocument(SELLER_AGENT_LINK as never, TRANSACTION as never, 'doc-1');
    } catch (err) {
      thrown = err as Error;
    }
    expect(thrown).toBeInstanceOf(UnprocessableEntityException);
    expect(thrown!.message).not.toContain('xyz-secret');

    expect(envelopeRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      status: DocuSignEnvelopeStatus.FAILED,
      documentIds: ['doc-1'],
      uploadLinkId: 'link-2',
    }));
    const savedRow = envelopeRepo.save.mock.calls[0][0] as { error: string };
    expect(savedRow.error).not.toContain('xyz-secret');

    expect(auditService.recordDocumentDocusignSendFailedAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      transactionId: 'tx-1',
      uploadLinkId: 'link-2',
      documentId: 'doc-1',
    }));
    const auditReason = auditService.recordDocumentDocusignSendFailedAuditEvent.mock.calls[0][0].reason as string;
    expect(auditReason).not.toContain('xyz-secret');
  });
});

describe('SellerAgentDocumentDocusignService.sendDocuments — batch/multi-select send', () => {
  it('sends multiple selected documents as ONE combined envelope, in one call, with one audit event listing every document', async () => {
    const { service, docuSignService, auditService } = buildService({
      docsById: { 'doc-1': makeDoc({ id: 'doc-1', formCode: 'TDS' }), 'doc-2': makeDoc({ id: 'doc-2', formCode: 'SPQ', fileName: 'SPQ.pdf' }) },
    });

    const envelope = await service.sendDocuments(SELLER_AGENT_LINK as never, TRANSACTION as never, ['doc-1', 'doc-2']);

    expect(docuSignService.sendSellerDocumentsToBuyer).toHaveBeenCalledTimes(1);
    expect(docuSignService.sendSellerDocumentsToBuyer).toHaveBeenCalledWith(expect.objectContaining({
      documentIds: ['doc-1', 'doc-2'],
    }));
    expect(envelope.envelopeId).toBe('ds-env-new');
    expect(auditService.recordDocusignEnvelopeSentAuditEvent).toHaveBeenCalledTimes(1);
    expect(auditService.recordDocusignEnvelopeSentAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      documentIds: ['doc-1', 'doc-2'],
    }));
  });

  it('rejects the whole batch and never sends when ANY selected document is ineligible', async () => {
    const { service, docuSignService } = buildService({
      docsById: {
        'doc-1': makeDoc({ id: 'doc-1', formCode: 'TDS' }),
        'doc-2': makeDoc({ id: 'doc-2', formCode: null }), // ineligible — no form code identified
      },
    });

    await expect(service.sendDocuments(SELLER_AGENT_LINK as never, TRANSACTION as never, ['doc-1', 'doc-2']))
      .rejects.toMatchObject({ message: expect.stringContaining('not eligible') });
    expect(docuSignService.sendSellerDocumentsToBuyer).not.toHaveBeenCalled();
  });

  it('throws ConflictException and never sends when ANY selected document already has a blocking envelope', async () => {
    const { service, docuSignService } = buildService({
      docsById: { 'doc-1': makeDoc({ id: 'doc-1' }), 'doc-2': makeDoc({ id: 'doc-2' }) },
      envelopes: [makeEnvelope({ status: DocuSignEnvelopeStatus.SENT, documentIds: ['doc-2'] })],
    });

    await expect(service.sendDocuments(SELLER_AGENT_LINK as never, TRANSACTION as never, ['doc-1', 'doc-2']))
      .rejects.toBeInstanceOf(ConflictException);
    expect(docuSignService.sendSellerDocumentsToBuyer).not.toHaveBeenCalled();
  });

  it('throws when called with an empty selection', async () => {
    const { service, docuSignService } = buildService();
    await expect(service.sendDocuments(SELLER_AGENT_LINK as never, TRANSACTION as never, []))
      .rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(docuSignService.sendSellerDocumentsToBuyer).not.toHaveBeenCalled();
  });

  it('on API failure, persists ONE failed envelope row covering every selected document and audits a failure event per document', async () => {
    const { service, envelopeRepo, auditService } = buildService({
      docsById: { 'doc-1': makeDoc({ id: 'doc-1' }), 'doc-2': makeDoc({ id: 'doc-2', fileName: 'SPQ.pdf' }) },
      sendSellerDocumentsImpl: async () => { throw new Error('DocuSign 500'); },
    });

    await expect(service.sendDocuments(SELLER_AGENT_LINK as never, TRANSACTION as never, ['doc-1', 'doc-2']))
      .rejects.toBeInstanceOf(UnprocessableEntityException);

    expect(envelopeRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      status: DocuSignEnvelopeStatus.FAILED,
      documentIds: ['doc-1', 'doc-2'],
    }));
    expect(auditService.recordDocumentDocusignSendFailedAuditEvent).toHaveBeenCalledTimes(2);
  });
});

describe('SellerAgentDocumentDocusignService.enrichChecklistWithDocusignInfo', () => {
  const baseChecklist = {
    items: [{ formCode: 'TDS', formName: 'Transfer Disclosure Statement', category: 'disclosure', status: 'submitted', matchedDocument: { id: 'doc-1', fileName: 'TDS.pdf', formType: 'TDS', uploadedAt: new Date() } }],
    optionalItems: [],
    unmatchedDocuments: [{ id: 'doc-2', fileName: 'extra.pdf', formType: null, status: 'uploaded', uploadedAt: new Date() }],
    requiredCount: 1,
    submittedCount: 1,
    allRequiredSubmitted: true,
  };

  it('attaches validation.checks (mapped from compliance.checks) and docusign eligibility for a matched, completed document', async () => {
    const { service } = buildService();
    const enriched = await service.enrichChecklistWithDocusignInfo(SELLER_AGENT_LINK as never, TRANSACTION as never, baseChecklist as never);

    expect(enriched.items[0].validation).toEqual({
      checks: [{ id: 'r1', label: 'Seller 1 signature present', status: 'passed', severity: undefined, detail: undefined }],
    });
    expect(enriched.items[0].docusign).toEqual(expect.objectContaining({ eligible: true, envelope: null }));
  });

  it('surfaces a declined (non-blocking) envelope for display, not just blocking ones — the checklist still needs to show its status and offer Resend', async () => {
    const { service } = buildService({
      envelopes: [makeEnvelope({ status: DocuSignEnvelopeStatus.DECLINED, envelopeId: 'ds-env-declined' })],
    });
    const enriched = await service.enrichChecklistWithDocusignInfo(SELLER_AGENT_LINK as never, TRANSACTION as never, baseChecklist as never);

    expect(enriched.items[0].docusign?.envelope).toEqual(
      expect.objectContaining({ envelopeId: 'ds-env-declined', status: DocuSignEnvelopeStatus.DECLINED }),
    );
  });

  it('maps a skipped compliance check to not_applicable and a failed check to failed, preserving severity', async () => {
    const { service } = buildService({
      doc: makeDoc({
        metadataJson: {
          compliance: {
            checks: [
              { ruleId: 'r-skip', category: 'initials', formCode: 'TDS', phase: 'disclosure', severity: 'info', status: 'skipped', label: 'Initials (not required)' },
              { ruleId: 'r-fail', category: 'signatures', formCode: 'TDS', phase: 'disclosure', severity: 'warning', status: 'warning', label: 'Signature date questionable' },
            ],
            blockers: [],
          },
        },
      }),
    });
    const enriched = await service.enrichChecklistWithDocusignInfo(SELLER_AGENT_LINK as never, TRANSACTION as never, baseChecklist as never);

    expect(enriched.items[0].validation?.checks).toEqual([
      { id: 'r-skip', label: 'Initials (not required)', status: 'not_applicable', severity: undefined, detail: undefined },
      { id: 'r-fail', label: 'Signature date questionable', status: 'failed', severity: 'warning', detail: undefined },
    ]);
  });

  it('attaches lastRejectionReasons only for reupload_required items, from the audit-service lookup', async () => {
    const { service, auditService } = buildService({ doc: null });
    auditService.findMostRecentRejectionReasons.mockResolvedValue(new Map([['TDS', ['Missing seller signature']]]));

    const checklistWithRejection = {
      ...baseChecklist,
      items: [{ ...baseChecklist.items[0], status: 'reupload_required', matchedDocument: null }],
    };
    const enriched = await service.enrichChecklistWithDocusignInfo(SELLER_AGENT_LINK as never, TRANSACTION as never, checklistWithRejection as never);

    expect(enriched.items[0].lastRejectionReasons).toEqual(['Missing seller signature']);
    expect(enriched.items[0].docusign).toBeNull();
  });

  it('leaves validation/docusign null for an item with no matched document yet', async () => {
    const { service } = buildService({ doc: null });
    const checklistNoDoc = { ...baseChecklist, items: [{ ...baseChecklist.items[0], status: 'required', matchedDocument: null }] };
    const enriched = await service.enrichChecklistWithDocusignInfo(SELLER_AGENT_LINK as never, TRANSACTION as never, checklistNoDoc as never);
    expect(enriched.items[0].validation).toBeNull();
    expect(enriched.items[0].docusign).toBeNull();
  });

  it('enriches unmatchedDocuments ("Uploaded Documents") with the same validation/docusign treatment', async () => {
    const { service } = buildService();
    const enriched = await service.enrichChecklistWithDocusignInfo(SELLER_AGENT_LINK as never, TRANSACTION as never, baseChecklist as never);
    expect(enriched.unmatchedDocuments[0].validation).toEqual(expect.objectContaining({ checks: expect.any(Array) }));
    expect(enriched.unmatchedDocuments[0].docusign).toEqual(expect.objectContaining({ eligible: true }));
  });

  it('marks an otherwise-eligible document ineligible when the checklist itself is not allRequiredSubmitted — DocuSign never begins early', async () => {
    const { service } = buildService();
    const checklistIncomplete = { ...baseChecklist, allRequiredSubmitted: false };
    const enriched = await service.enrichChecklistWithDocusignInfo(SELLER_AGENT_LINK as never, TRANSACTION as never, checklistIncomplete as never);

    expect(enriched.items[0].docusign).toEqual(expect.objectContaining({
      eligible: false,
      ineligibleReason: expect.stringContaining('All required documents must be submitted'),
    }));
    expect(enriched.unmatchedDocuments[0].docusign).toEqual(expect.objectContaining({ eligible: false }));
  });
});
