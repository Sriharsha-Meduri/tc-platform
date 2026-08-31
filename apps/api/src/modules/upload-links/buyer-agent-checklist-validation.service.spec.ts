import { BuyerAgentChecklistValidationService } from './buyer-agent-checklist-validation.service';

const LINK = { id: 'link-1', transactionId: 'tx-1', purpose: 'document_upload' };
const ESCROW_LINK = { id: 'link-4', transactionId: 'tx-1', purpose: 'escrow_officer_document_upload' };
const TRANSACTION = { id: 'tx-1' };

function makeDoc(overrides: Partial<{ id: string; metadataJson: Record<string, unknown> | null }> = {}) {
  return {
    id: 'doc-1',
    metadataJson: {
      compliance: {
        checks: [
          { ruleId: 'r1', label: 'Document type identified', status: 'pass', category: 'identity', formCode: 'RPA', phase: 'contract', severity: 'info' },
          { ruleId: 'r2', label: 'Buyer signature present', status: 'fail', category: 'signatures', formCode: 'RPA', phase: 'contract', severity: 'error', detail: 'Missing buyer signature' },
        ],
      },
    },
    ...overrides,
  };
}

function buildService(overrides: {
  doc?: ReturnType<typeof makeDoc> | null;
  rejectionReasons?: Map<string, string[]>;
  blockerOverrides?: Array<{ blockerId: string; documentId: string | null; formCode: string | null }>;
} = {}) {
  const formTemplatesService = {
    getDocumentInActiveSetById: jest.fn().mockResolvedValue(overrides.doc !== undefined ? overrides.doc : makeDoc()),
  };
  const auditService = {
    findMostRecentBuyerAgentRejectionReasons: jest.fn().mockResolvedValue(overrides.rejectionReasons ?? new Map()),
    findMostRecentEscrowRejectionReasons: jest.fn().mockResolvedValue(overrides.rejectionReasons ?? new Map()),
  };
  const blockerOverrideService = {
    findForTransaction: jest.fn().mockResolvedValue(overrides.blockerOverrides ?? []),
  };
  const service = new BuyerAgentChecklistValidationService(formTemplatesService as never, auditService as never, blockerOverrideService as never);
  return { service, formTemplatesService, auditService, blockerOverrideService };
}

describe('BuyerAgentChecklistValidationService.enrichChecklistWithValidation', () => {
  it('attaches validation.checks (mapped from compliance.checks) for a matched item', async () => {
    const { service } = buildService();
    const checklist = {
      items: [{ formCode: 'RPA', formName: 'Purchase Agreement', category: 'purchase_agreement', status: 'submitted', matchedDocument: { id: 'doc-1', fileName: 'rpa.pdf', formType: 'RPA', uploadedAt: new Date() } }],
      optionalItems: [],
      unmatchedDocuments: [],
      requiredCount: 1,
      submittedCount: 1,
      allRequiredSubmitted: true,
    };

    const enriched = await service.enrichChecklistWithValidation(LINK as never, TRANSACTION as never, checklist as never);

    expect(enriched.items[0].validation).toEqual({
      checks: [
        { id: 'r1', label: 'Document type identified', status: 'passed', severity: undefined, detail: undefined },
        { id: 'r2', label: 'Buyer signature present', status: 'failed', severity: 'error', detail: 'Missing buyer signature' },
      ],
    });
  });

  it('never attaches a docusign field — the Buyer Agent link has no document-sending flow', async () => {
    const { service } = buildService();
    const checklist = {
      items: [{ formCode: 'RPA', formName: 'Purchase Agreement', category: 'purchase_agreement', status: 'submitted', matchedDocument: { id: 'doc-1', fileName: 'rpa.pdf', formType: 'RPA', uploadedAt: new Date() } }],
      optionalItems: [], unmatchedDocuments: [], requiredCount: 1, submittedCount: 1, allRequiredSubmitted: true,
    };
    const enriched = await service.enrichChecklistWithValidation(LINK as never, TRANSACTION as never, checklist as never);
    expect(enriched.items[0]).not.toHaveProperty('docusign');
  });

  it('attaches lastRejectionReasons only for reupload_required items, from the Buyer Agent rejection-reasons lookup', async () => {
    const { service } = buildService({
      doc: null,
      rejectionReasons: new Map([['RR', ['Buyer has not signed the RR.']]]),
    });
    const checklist = {
      items: [{ formCode: 'RR', formName: 'Request for Repair', category: 'inspection_repair', status: 'reupload_required', matchedDocument: null }],
      optionalItems: [], unmatchedDocuments: [], requiredCount: 1, submittedCount: 0, allRequiredSubmitted: false,
    };
    const enriched = await service.enrichChecklistWithValidation(LINK as never, TRANSACTION as never, checklist as never);
    expect(enriched.items[0].lastRejectionReasons).toEqual(['Buyer has not signed the RR.']);
  });

  it('leaves validation null for an item with no matched document yet', async () => {
    const { service, formTemplatesService } = buildService();
    const checklist = {
      items: [{ formCode: 'TDS', formName: 'Transfer Disclosure Statement', category: 'disclosure', status: 'required', matchedDocument: null }],
      optionalItems: [], unmatchedDocuments: [], requiredCount: 1, submittedCount: 0, allRequiredSubmitted: false,
    };
    const enriched = await service.enrichChecklistWithValidation(LINK as never, TRANSACTION as never, checklist as never);
    expect(enriched.items[0].validation).toBeNull();
    expect(formTemplatesService.getDocumentInActiveSetById).not.toHaveBeenCalled();
  });

  it('enriches unmatchedDocuments ("Uploaded Documents") with the same validation treatment', async () => {
    const { service } = buildService();
    const checklist = {
      items: [], optionalItems: [],
      unmatchedDocuments: [{ id: 'doc-1', fileName: 'extra.pdf', formType: 'RPA', status: 'needs_review', uploadedAt: new Date() }],
      requiredCount: 0, submittedCount: 0, allRequiredSubmitted: true,
    };
    const enriched = await service.enrichChecklistWithValidation(LINK as never, TRANSACTION as never, checklist as never);
    expect(enriched.unmatchedDocuments[0].validation?.checks).toHaveLength(2);
  });

  it('resolves documents via the transaction-scoped security boundary, not a bare id', async () => {
    const { service, formTemplatesService } = buildService();
    const checklist = {
      items: [{ formCode: 'RPA', formName: 'Purchase Agreement', category: 'purchase_agreement', status: 'submitted', matchedDocument: { id: 'doc-1', fileName: 'rpa.pdf', formType: 'RPA', uploadedAt: new Date() } }],
      optionalItems: [], unmatchedDocuments: [], requiredCount: 1, submittedCount: 1, allRequiredSubmitted: true,
    };
    await service.enrichChecklistWithValidation(LINK as never, TRANSACTION as never, checklist as never);
    expect(formTemplatesService.getDocumentInActiveSetById).toHaveBeenCalledWith('tx-1', 'doc-1');
  });

  it('an Escrow-purpose link reads its own ESCROW_DOCUMENT_VALIDATION_FAILED rejection trail, not the Buyer Agent one', async () => {
    const rejectionReasons = new Map([['RPA', ['Page 6 — Buyer initials are missing.']]]);
    const { service, auditService } = buildService({ rejectionReasons });
    const checklist = {
      items: [{ formCode: 'RPA', formName: 'Signed RPA', category: 'purchase_agreement', status: 'reupload_required', matchedDocument: { id: 'doc-1', fileName: 'rpa.pdf', formType: 'RPA', uploadedAt: new Date() } }],
      optionalItems: [], unmatchedDocuments: [], requiredCount: 1, submittedCount: 0, allRequiredSubmitted: false,
    };
    const enriched = await service.enrichChecklistWithValidation(ESCROW_LINK as never, TRANSACTION as never, checklist as never);

    expect(auditService.findMostRecentEscrowRejectionReasons).toHaveBeenCalledWith('link-4');
    expect(auditService.findMostRecentBuyerAgentRejectionReasons).not.toHaveBeenCalled();
    expect(enriched.items[0].lastRejectionReasons).toEqual(['Page 6 — Buyer initials are missing.']);
  });
});
