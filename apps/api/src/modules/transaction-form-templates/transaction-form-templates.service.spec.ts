import { TransactionFormTemplatesService } from './transaction-form-templates.service';
import { FinalTermsService } from '../transactions/final-terms.service';

const TX = { id: 'tx-1', organizationId: 'org-1', propertyState: 'CA', transactionType: 'residential', side: 'buyer_side' };

const REQUIRED_TEMPLATE = {
  id: 'template-1',
  items: [
    { formCode: 'RPA', formName: 'Residential Purchase Agreement', category: 'purchase_agreement', isRequired: true, sortOrder: 100 },
    { formCode: 'TDS', formName: 'Transfer Disclosure Statement', category: 'disclosure', isRequired: true, sortOrder: 200 },
    { formCode: 'AVID', formName: "Agent Visual Inspection Disclosure", category: 'disclosure', isRequired: false, sortOrder: 300 },
  ],
};

function makeDoc(overrides: Partial<{
  id: string; fileName: string | null; formCode: string | null; analysisStatus: string | null;
  documentType: string; status: string; createdAt: Date; metadataJson: Record<string, unknown> | null;
}> = {}) {
  return {
    id: 'doc-1',
    fileName: 'file.pdf',
    formCode: null,
    analysisStatus: null,
    documentType: 'external_upload',
    status: 'uploaded',
    createdAt: new Date('2026-01-01'),
    metadataJson: null,
    ...overrides,
  };
}

let contractDocIdCounter = 0;
function makeContractDoc(extraction: Record<string, unknown>, createdAt: string) {
  return {
    id: `contract-doc-${++contractDocIdCounter}`,
    documentType: 'purchase_agreement',
    status: 'uploaded',
    createdAt: new Date(createdAt),
    metadataJson: { extraction },
  };
}

function buildService(overrides: {
  template?: typeof REQUIRED_TEMPLATE | null;
  docs?: ReturnType<typeof makeDoc>[];
  linkDocs?: ReturnType<typeof makeDoc>[];
  contractDocs?: unknown[];
  clockSettings?: unknown;
  /** The row `templateRepo.findOne` returns when the transaction has an explicit `formTemplateId` — undefined means "not found" (falls back to resolveForTransaction). */
  explicitTemplate?: unknown;
  /** hoa_information row for getEscrowChecklistStatus — undefined means "never answered" (hasHoa: null). */
  hoaInfo?: { hasHoa: boolean | null } | null;
  /** Pre-existing blocker-override records for this transaction — see blocker-override.util.ts's scoping rule (documentId > formCode > blockerId-only). */
  blockerOverrides?: Array<{ blockerId: string; documentId: string | null; formCode: string | null }>;
} = {}) {
  const documentsService = {
    findActiveByTransaction: jest.fn().mockResolvedValue(overrides.docs ?? []),
    findActiveByTransactionForChecklist: jest.fn().mockResolvedValue(overrides.docs ?? []),
    findByUploadLink: jest.fn().mockResolvedValue(overrides.linkDocs ?? []),
  };
  // No contract-family documents by default — the contingency-removal items are simply
  // omitted (nothing applies) unless a test opts in via `contractDocs`.
  const documentsRepo = {
    find: jest.fn().mockResolvedValue(overrides.contractDocs ?? []),
  };
  const hoaInfoRepo = {
    findOne: jest.fn().mockResolvedValue(overrides.hoaInfo ?? null),
  };
  const clockService = {
    findByTransaction: jest.fn().mockResolvedValue(overrides.clockSettings ?? null),
  };
  const blockerOverrideService = {
    findForTransaction: jest.fn().mockResolvedValue(overrides.blockerOverrides ?? []),
  };
  // itemRepo is never exercised directly. templateRepo.findOne backs only the explicit
  // tx.formTemplateId lookup (resolveTemplateForTransaction) — resolveForTransaction
  // itself is stubbed below, isolating this spec from its own scoring logic.
  const templateRepo = {
    findOne: jest.fn().mockResolvedValue(overrides.explicitTemplate ?? null),
  };
  // Reuses the same mocked documentsRepo so `contractDocs` overrides drive
  // FinalTermsService.resolve() the exact same way they used to drive the
  // now-removed mergeContractTerms(contractDocs) direct call.
  const finalTermsService = new FinalTermsService(documentsRepo as never);
  const service = new TransactionFormTemplatesService(
    templateRepo as never,
    {} as never,
    documentsRepo as never,
    hoaInfoRepo as never,
    documentsService as never,
    clockService as never,
    blockerOverrideService as never,
    finalTermsService,
  );
  const template = overrides.template !== undefined ? overrides.template : REQUIRED_TEMPLATE;
  jest.spyOn(service, 'resolveForTransaction').mockResolvedValue(template as never);
  return { service, documentsService, documentsRepo, hoaInfoRepo, clockService, templateRepo, blockerOverrideService };
}

describe('TransactionFormTemplatesService — getChecklistStatus', () => {
  it('a required item with no matching document is "required"', async () => {
    const { service } = buildService({ docs: [] });
    const result = await service.getChecklistStatus(TX as never);
    expect(result.items.find((i) => i.formCode === 'RPA')?.status).toBe('required');
    expect(result.allRequiredSubmitted).toBe(false);
  });

  it('a required item with a completed matching document is "submitted", with the filename/form-type tag attached', async () => {
    const { service } = buildService({
      docs: [makeDoc({ id: 'doc-rpa', fileName: 'purchase-agreement.pdf', formCode: 'RPA', analysisStatus: 'completed' })],
    });
    const result = await service.getChecklistStatus(TX as never);
    const rpaItem = result.items.find((i) => i.formCode === 'RPA');
    expect(rpaItem?.status).toBe('submitted');
    expect(rpaItem?.matchedDocument).toEqual({ id: 'doc-rpa', fileName: 'purchase-agreement.pdf', formType: 'RPA', uploadedAt: expect.any(Date) });
  });

  it('allRequiredSubmitted is true only once every required item — including the two dedicated docs and VP — is submitted', async () => {
    const { service } = buildService({
      docs: [
        makeDoc({ id: 'd1', formCode: 'RPA', analysisStatus: 'completed' }),
        makeDoc({ id: 'd2', formCode: 'TDS', analysisStatus: 'completed' }),
        makeDoc({ id: 'd3', documentType: 'lender_prequalification' }),
        makeDoc({ id: 'd4', documentType: 'proof_of_funds' }),
        makeDoc({ id: 'd5', formCode: 'VP', analysisStatus: 'completed' }),
      ],
    });
    const result = await service.getChecklistStatus(TX as never);
    expect(result.allRequiredSubmitted).toBe(true);
    expect(result.submittedCount).toBe(5);
    expect(result.requiredCount).toBe(5); // AVID is not required, not counted; + the 2 always-required dedicated docs + VP
  });

  it('a document whose detected form code is not on the required list appears as "unknown_form"', async () => {
    const { service } = buildService({
      docs: [makeDoc({ formCode: 'AVID', analysisStatus: 'completed' })], // AVID exists but isRequired: false
    });
    const result = await service.getChecklistStatus(TX as never);
    expect(result.unmatchedDocuments).toHaveLength(1);
    expect(result.unmatchedDocuments[0].status).toBe('unknown_form');
  });

  it('a document with completed analysis but no detected form code appears as "needs_review"', async () => {
    const { service } = buildService({ docs: [makeDoc({ formCode: null, analysisStatus: 'completed' })] });
    const result = await service.getChecklistStatus(TX as never);
    expect(result.unmatchedDocuments[0].status).toBe('needs_review');
  });

  it('a still-analyzing document appears as "analyzing" — it cannot be attributed to any item yet', async () => {
    const { service } = buildService({ docs: [makeDoc({ formCode: null, analysisStatus: 'analyzing' })] });
    const result = await service.getChecklistStatus(TX as never);
    expect(result.unmatchedDocuments[0].status).toBe('analyzing');
    expect(result.items.every((i) => i.status === 'required')).toBe(true); // no item speculatively marked
  });

  it('a document whose analysis failed appears as "analysis_failed"', async () => {
    const { service } = buildService({ docs: [makeDoc({ formCode: null, analysisStatus: 'failed' })] });
    const result = await service.getChecklistStatus(TX as never);
    expect(result.unmatchedDocuments[0].status).toBe('analysis_failed');
  });

  it('excludes the three dedicated-category documents (HOA, lender prequal, proof of funds) from unmatchedDocuments entirely', async () => {
    const { service } = buildService({
      docs: [
        makeDoc({ id: 'd1', documentType: 'hoa_document', analysisStatus: 'completed' }),
        makeDoc({ id: 'd2', documentType: 'lender_prequalification', analysisStatus: 'analyzing' }),
        makeDoc({ id: 'd3', documentType: 'proof_of_funds', analysisStatus: 'failed' }),
      ],
    });
    const result = await service.getChecklistStatus(TX as never);
    expect(result.unmatchedDocuments).toHaveLength(0);
  });

  it('no resolvable template → only the two dedicated documents + VP remain on the checklist', async () => {
    const { service } = buildService({ template: null, docs: [makeDoc({ formCode: 'RPA', analysisStatus: 'completed' })] });
    const result = await service.getChecklistStatus(TX as never);
    expect(result.items.map((i) => i.formCode)).toEqual(['lender_prequalification', 'proof_of_funds', 'VP']);
    expect(result.requiredCount).toBe(3);
    expect(result.allRequiredSubmitted).toBe(false); // neither dedicated doc nor VP has been uploaded
    // the one uploaded doc has nothing to match against, so it's unmatched (no required list exists)
    expect(result.unmatchedDocuments).toHaveLength(1);
  });

  it('an unmatchedDocuments entry carries its own compliance checks as `validation` — the sidebar\'s "Additional Uploaded Documents" reads this, never a separate computation', async () => {
    const { service } = buildService({
      template: null,
      docs: [
        makeDoc({
          id: 'd-spq', formCode: 'SPQ', analysisStatus: 'completed',
          metadataJson: { compliance: { checks: [
            { ruleId: 'seller_signature', label: 'Seller signature present', status: 'pass', location: 'Page 5' },
            { ruleId: 'spq_yes_explanations', label: 'Yes-answer explanations complete', status: 'fail', severity: 'error', location: 'Page 2', detail: 'Missing explanation for 7D' },
          ] } },
        }),
      ],
    });
    const result = await service.getChecklistStatus(TX as never);
    expect(result.unmatchedDocuments).toHaveLength(1);
    const validation = result.unmatchedDocuments[0].validation;
    expect(validation?.checks).toEqual([
      { id: 'seller_signature', label: 'Seller signature present', status: 'passed', severity: undefined, detail: undefined, location: 'Page 5' },
      { id: 'spq_yes_explanations', label: 'Yes-answer explanations complete', status: 'failed', severity: 'error', detail: 'Missing explanation for 7D', location: 'Page 2' },
    ]);
  });

  it('an unmatchedDocuments entry with no compliance result yet has `validation: null` — never treated as failed', async () => {
    const { service } = buildService({ template: null, docs: [makeDoc({ id: 'd-analyzing', formCode: 'SPQ', analysisStatus: 'analyzing' })] });
    const result = await service.getChecklistStatus(TX as never);
    expect(result.unmatchedDocuments).toHaveLength(1);
    expect(result.unmatchedDocuments[0].validation).toBeNull();
  });

  it('the two dedicated Buyer Agent document types are always required, regardless of any resolved CAR-form template', async () => {
    const { service } = buildService({ docs: [] });
    const result = await service.getChecklistStatus(TX as never);
    const formCodes = result.items.map((i) => i.formCode);
    expect(formCodes).toContain('lender_prequalification');
    expect(formCodes).toContain('proof_of_funds');
    expect(result.items.find((i) => i.formCode === 'lender_prequalification')?.status).toBe('required');
    expect(result.items.find((i) => i.formCode === 'proof_of_funds')?.status).toBe('required');
  });

  it('a dedicated document is "submitted" as soon as it is present — analysis is never a gate for these two', async () => {
    const { service } = buildService({
      docs: [
        makeDoc({ id: 'd-lender', fileName: 'prequal.pdf', documentType: 'lender_prequalification', analysisStatus: 'analyzing' }),
        makeDoc({ id: 'd-pof', fileName: 'pof.pdf', documentType: 'proof_of_funds', analysisStatus: 'failed' }),
      ],
    });
    const result = await service.getChecklistStatus(TX as never);
    const lenderItem = result.items.find((i) => i.formCode === 'lender_prequalification');
    const pofItem = result.items.find((i) => i.formCode === 'proof_of_funds');
    expect(lenderItem?.status).toBe('submitted');
    expect(lenderItem?.matchedDocument).toEqual({ id: 'd-lender', fileName: 'prequal.pdf', formType: null, uploadedAt: expect.any(Date) });
    expect(pofItem?.status).toBe('submitted');
  });
});

describe('TransactionFormTemplatesService — getChecklistStatus optionalItems (RR/RRRR)', () => {
  it('RR and RRRR are always present in optionalItems, even with no resolvable template', async () => {
    const { service } = buildService({ template: null, docs: [] });
    const result = await service.getChecklistStatus(TX as never);
    const codes = result.optionalItems.map((i) => i.formCode);
    expect(codes).toEqual(['RR', 'RRRR']);
    expect(result.optionalItems.every((i) => i.status === 'required')).toBe(true);
  });

  it('RR/RRRR are never counted in requiredCount, submittedCount, or allRequiredSubmitted — missing them never blocks anything', async () => {
    const { service } = buildService({ docs: [] });
    const before = await service.getChecklistStatus(TX as never);

    const { service: serviceWithRr } = buildService({
      docs: [makeDoc({ id: 'd-rr', formCode: 'RR', analysisStatus: 'completed' })],
    });
    const after = await serviceWithRr.getChecklistStatus(TX as never);

    expect(before.requiredCount).toBe(after.requiredCount);
    expect(before.allRequiredSubmitted).toBe(after.allRequiredSubmitted);
  });

  it('an uploaded, completed RR document appears as "submitted" in optionalItems', async () => {
    const { service } = buildService({
      docs: [makeDoc({ id: 'd-rr', fileName: 'rr.pdf', formCode: 'RR', analysisStatus: 'completed' })],
    });
    const result = await service.getChecklistStatus(TX as never);
    const rrItem = result.optionalItems.find((i) => i.formCode === 'RR');
    expect(rrItem?.status).toBe('submitted');
    expect(rrItem?.matchedDocument).toEqual({ id: 'd-rr', fileName: 'rr.pdf', formType: 'RR', uploadedAt: expect.any(Date) });
  });

  it('an in-flight (analyzing) RR document is attributable to the optional item, unlike required items', async () => {
    const { service } = buildService({
      docs: [makeDoc({ id: 'd-rr', formCode: 'RR', analysisStatus: 'analyzing' })],
    });
    const result = await service.getChecklistStatus(TX as never);
    expect(result.optionalItems.find((i) => i.formCode === 'RR')?.status).toBe('analyzing');
  });

  it('shows "reupload_required" for RR when the caller supplies it in rejectedFormCodes and no live document exists', async () => {
    const { service } = buildService({ docs: [] });
    const result = await service.getChecklistStatus(TX as never, new Set(['RR']));
    expect(result.optionalItems.find((i) => i.formCode === 'RR')?.status).toBe('reupload_required');
    expect(result.optionalItems.find((i) => i.formCode === 'RRRR')?.status).toBe('required');
  });

  it('a completed RR document is excluded from unmatchedDocuments — it is only ever shown once, under optionalItems', async () => {
    const { service } = buildService({
      docs: [makeDoc({ id: 'd-rr', formCode: 'RR', analysisStatus: 'completed' })],
    });
    const result = await service.getChecklistStatus(TX as never);
    expect(result.unmatchedDocuments).toHaveLength(0);
  });

  it('defaults rejectedFormCodes to an empty set when the caller omits it', async () => {
    const { service } = buildService({ docs: [] });
    const result = await service.getChecklistStatus(TX as never);
    expect(result.optionalItems.every((i) => i.status === 'required')).toBe(true);
  });
});

describe('TransactionFormTemplatesService — getChecklistStatus contingency-removal items (CR-B)', () => {
  it('omits all 3 contingency items entirely when there are no contract-family documents', async () => {
    const { service } = buildService({ docs: [], contractDocs: [] });
    const result = await service.getChecklistStatus(TX as never);
    expect(result.items.some((i) => i.contingencyType)).toBe(false);
  });

  it('shows Inspection/Loan/Appraisal Contingency Removal, with a resolved deadline, when all three apply', async () => {
    const contractDoc = makeContractDoc({
      transaction: { acceptanceDate: '2026-01-05' },
      contractTerms: { inspectionContingencyDays: 17, loanContingencyDays: 21, appraisalContingencyDays: 17 },
    }, '2026-01-05');

    const { service } = buildService({ docs: [], contractDocs: [contractDoc] });
    const result = await service.getChecklistStatus(TX as never);

    const contingencyItems = result.items.filter((i) => i.contingencyType);
    expect(contingencyItems).toHaveLength(3);
    expect(contingencyItems.map((i) => i.contingencyType).sort()).toEqual(['appraisal', 'inspection', 'loan']);
    for (const item of contingencyItems) {
      expect(item.formCode).toBe('CR-B');
      expect(item.deadline).not.toBeNull();
      expect(item.deadlineDisplay).not.toBe('N/A — Deadline not found');
      expect(item.status).toBe('required');
    }
  });

  it('omits the Loan Contingency Removal item when the negotiated terms waive it, but keeps Inspection/Appraisal', async () => {
    const contractDoc = makeContractDoc({
      transaction: { acceptanceDate: '2026-01-05' },
      contractTerms: { inspectionContingencyDays: 17, loanContingencyDays: 21, loanContingencyWaived: true, appraisalContingencyDays: 17 },
    }, '2026-01-05');

    const { service } = buildService({ docs: [], contractDocs: [contractDoc] });
    const result = await service.getChecklistStatus(TX as never);

    const contingencyTypes = result.items.filter((i) => i.contingencyType).map((i) => i.contingencyType);
    expect(contingencyTypes).not.toContain('loan');
    expect(contingencyTypes).toContain('inspection');
    expect(contingencyTypes).toContain('appraisal');
  });

  it('a later addendum waiving the loan contingency overrides the earlier RPA, per document precedence', async () => {
    const rpa = makeContractDoc({
      transaction: { acceptanceDate: '2026-01-05' },
      contractTerms: { loanContingencyDays: 21, loanContingencyWaived: false },
    }, '2026-01-05');
    const addendum = makeContractDoc({ contractTerms: { loanContingencyWaived: true } }, '2026-01-10');

    const { service } = buildService({ docs: [], contractDocs: [rpa, addendum] });
    const result = await service.getChecklistStatus(TX as never);

    expect(result.items.some((i) => i.contingencyType === 'loan')).toBe(false);
  });

  it('shows "N/A — Deadline not found" (and does not fabricate a date) when the acceptance date is missing', async () => {
    const contractDoc = makeContractDoc({
      contractTerms: { inspectionContingencyDays: 17 },
    }, '2026-01-05');

    const { service } = buildService({ docs: [], contractDocs: [contractDoc] });
    const result = await service.getChecklistStatus(TX as never);

    const inspectionItem = result.items.find((i) => i.contingencyType === 'inspection');
    expect(inspectionItem).toBeDefined();
    expect(inspectionItem!.deadline).toBeNull();
    expect(inspectionItem!.deadlineDisplay).toBe('N/A — Deadline not found');
    expect(inspectionItem!.status).toBe('required'); // still required — the contingency does apply, only the date is unresolved
  });

  it('one completed CR-B checking multiple boxes satisfies multiple items at once', async () => {
    const contractDoc = makeContractDoc({
      transaction: { acceptanceDate: '2026-01-05' },
      contractTerms: { inspectionContingencyDays: 17, loanContingencyDays: 21, appraisalContingencyDays: 17 },
    }, '2026-01-05');
    const crb = makeDoc({
      id: 'crb-1', formCode: 'CR-B', analysisStatus: 'completed',
      metadataJson: { extraction: { contingencies_removed: { inspection: true, loan: true, appraisal: false } } },
    });

    const { service } = buildService({ docs: [crb], contractDocs: [contractDoc] });
    const result = await service.getChecklistStatus(TX as never);

    expect(result.items.find((i) => i.contingencyType === 'inspection')?.status).toBe('submitted');
    expect(result.items.find((i) => i.contingencyType === 'loan')?.status).toBe('submitted');
    expect(result.items.find((i) => i.contingencyType === 'appraisal')?.status).toBe('required');
  });

  it('a CR-B checking "all_contingencies" satisfies every applicable item', async () => {
    const contractDoc = makeContractDoc({
      transaction: { acceptanceDate: '2026-01-05' },
      contractTerms: { inspectionContingencyDays: 17, loanContingencyDays: 21, appraisalContingencyDays: 17 },
    }, '2026-01-05');
    const crb = makeDoc({
      id: 'crb-1', formCode: 'CR-B', analysisStatus: 'completed',
      metadataJson: { extraction: { contingencies_removed: { all_contingencies: true } } },
    });

    const { service } = buildService({ docs: [crb], contractDocs: [contractDoc] });
    const result = await service.getChecklistStatus(TX as never);

    expect(result.items.filter((i) => i.contingencyType).every((i) => i.status === 'submitted')).toBe(true);
  });

  it('shows "reupload_required" when the caller supplies CR-B in rejectedFormCodes and no live document satisfies the item', async () => {
    const contractDoc = makeContractDoc({
      transaction: { acceptanceDate: '2026-01-05' },
      contractTerms: { inspectionContingencyDays: 17 },
    }, '2026-01-05');

    const { service } = buildService({ docs: [], contractDocs: [contractDoc] });
    const result = await service.getChecklistStatus(TX as never, new Set(['CR-B']));

    expect(result.items.find((i) => i.contingencyType === 'inspection')?.status).toBe('reupload_required');
  });

  it('counts applicable contingency items toward requiredCount/submittedCount, and their submission moves allRequiredSubmitted', async () => {
    const contractDoc = makeContractDoc({
      transaction: { acceptanceDate: '2026-01-05' },
      contractTerms: { inspectionContingencyDays: 17 },
    }, '2026-01-05');

    const { service } = buildService({ template: null, docs: [], contractDocs: [contractDoc] });
    const before = await service.getChecklistStatus(TX as never);
    const beforeCount = before.requiredCount;
    expect(before.items.some((i) => i.contingencyType === 'inspection')).toBe(true);
    expect(before.submittedCount).toBe(0);

    const crb = makeDoc({
      id: 'crb-1', formCode: 'CR-B', analysisStatus: 'completed',
      metadataJson: { extraction: { contingencies_removed: { inspection: true } } },
    });
    const { service: serviceAfter } = buildService({ template: null, docs: [crb], contractDocs: [contractDoc] });
    const after = await serviceAfter.getChecklistStatus(TX as never);
    expect(after.requiredCount).toBe(beforeCount);
    expect(after.submittedCount).toBe(before.submittedCount + 1);
  });

  it('excludes a completed CR-B document from unmatchedDocuments — it is only ever reflected via the contingency items', async () => {
    const contractDoc = makeContractDoc({
      transaction: { acceptanceDate: '2026-01-05' },
      contractTerms: { inspectionContingencyDays: 17 },
    }, '2026-01-05');
    const crb = makeDoc({
      id: 'crb-1', formCode: 'CR-B', analysisStatus: 'completed',
      metadataJson: { extraction: { contingencies_removed: { inspection: true } } },
    });

    const { service } = buildService({ docs: [crb], contractDocs: [contractDoc] });
    const result = await service.getChecklistStatus(TX as never);

    expect(result.unmatchedDocuments).toHaveLength(0);
  });
});

describe('TransactionFormTemplatesService — getChecklistStatus Verification of Property (VP)', () => {
  it('is always present, even with zero contract-family documents', async () => {
    const { service } = buildService({ docs: [], contractDocs: [] });
    const result = await service.getChecklistStatus(TX as never);
    const vp = result.items.find((i) => i.formCode === 'VP');
    expect(vp).toBeDefined();
    expect(vp!.formName).toBe('Verification of Property');
    expect(vp!.status).toBe('required');
  });

  it('shows "N/A — Closing date not found." (and does not fabricate a date) when the closing date is missing', async () => {
    const contractDoc = makeContractDoc({ transaction: { acceptanceDate: '2026-01-05' } }, '2026-01-05'); // no closingDate
    const { service } = buildService({ docs: [], contractDocs: [contractDoc] });
    const result = await service.getChecklistStatus(TX as never);
    const vp = result.items.find((i) => i.formCode === 'VP');
    expect(vp!.deadline).toBeNull();
    expect(vp!.deadlineDisplay).toBe('N/A — Closing date not found.');
  });

  it('resolves the deadline to the transaction\'s Close of Escrow date when available', async () => {
    const contractDoc = makeContractDoc({ transaction: { closingDate: '2026-09-01' } }, '2026-01-05');
    const { service } = buildService({ docs: [], contractDocs: [contractDoc] });
    const result = await service.getChecklistStatus(TX as never);
    const vp = result.items.find((i) => i.formCode === 'VP');
    expect(vp!.deadline).toBe(new Date('2026-09-01').toISOString());
    expect(vp!.deadlineDisplay).not.toBe('N/A — Closing date not found.');
    expect(vp!.contractTimeframe).toBe('Close of Escrow');
  });

  it('a later addendum restating the closing date overrides the earlier RPA, per document precedence', async () => {
    const rpa = makeContractDoc({ transaction: { closingDate: '2026-09-01' } }, '2026-01-05');
    const addendum = makeContractDoc({ transaction: { closingDate: '2026-09-15' } }, '2026-02-01');
    const { service } = buildService({ docs: [], contractDocs: [rpa, addendum] });
    const result = await service.getChecklistStatus(TX as never);
    const vp = result.items.find((i) => i.formCode === 'VP');
    expect(vp!.deadline).toBe(new Date('2026-09-15').toISOString());
  });

  it('a completed VP document marks the item "submitted"', async () => {
    const vpDoc = makeDoc({ id: 'vp-1', formCode: 'VP', analysisStatus: 'completed' });
    const { service } = buildService({ docs: [vpDoc], contractDocs: [] });
    const result = await service.getChecklistStatus(TX as never);
    const vp = result.items.find((i) => i.formCode === 'VP');
    expect(vp!.status).toBe('submitted');
    expect(vp!.matchedDocument?.id).toBe('vp-1');
  });

  it('an in-flight VP document is "analyzing"', async () => {
    const vpDoc = makeDoc({ id: 'vp-1', formCode: 'VP', analysisStatus: 'analyzing' });
    const { service } = buildService({ docs: [vpDoc], contractDocs: [] });
    const result = await service.getChecklistStatus(TX as never);
    expect(result.items.find((i) => i.formCode === 'VP')?.status).toBe('analyzing');
  });

  it('shows "reupload_required" when the caller supplies VP in rejectedFormCodes and no live document exists', async () => {
    const { service } = buildService({ docs: [], contractDocs: [] });
    const result = await service.getChecklistStatus(TX as never, new Set(['VP']));
    expect(result.items.find((i) => i.formCode === 'VP')?.status).toBe('reupload_required');
  });

  it('counts VP toward requiredCount/submittedCount', async () => {
    const { service: withoutVp } = buildService({ template: null, docs: [], contractDocs: [] });
    const before = await withoutVp.getChecklistStatus(TX as never);
    const beforeCount = before.requiredCount;

    const vpDoc = makeDoc({ id: 'vp-1', formCode: 'VP', analysisStatus: 'completed' });
    const { service: withVp } = buildService({ template: null, docs: [vpDoc], contractDocs: [] });
    const after = await withVp.getChecklistStatus(TX as never);

    expect(after.requiredCount).toBe(beforeCount);
    expect(after.submittedCount).toBe(before.submittedCount + 1);
  });

  it('excludes a completed VP document from unmatchedDocuments', async () => {
    const vpDoc = makeDoc({ id: 'vp-1', formCode: 'VP', analysisStatus: 'completed' });
    const { service } = buildService({ docs: [vpDoc], contractDocs: [] });
    const result = await service.getChecklistStatus(TX as never);
    expect(result.unmatchedDocuments).toHaveLength(0);
  });
});

describe('TransactionFormTemplatesService — getSellerAgentChecklistStatus', () => {
  it('generates the checklist purely from the resolved template — no dedicated Buyer-Agent-only items appear', async () => {
    const { service } = buildService({ linkDocs: [] });
    const result = await service.getSellerAgentChecklistStatus(TX as never, 'link-seller-1', new Set());
    const formCodes = result.items.map((i) => i.formCode);
    expect(formCodes).toEqual(['RPA', 'TDS']); // AVID excluded (isRequired: false); no lender_prequalification/proof_of_funds
    expect(result.requiredCount).toBe(2);
  });

  it('reflects a change to the resolved template on the very next call — nothing is cached', async () => {
    const { service } = buildService({ linkDocs: [] });
    const first = await service.getSellerAgentChecklistStatus(TX as never, 'link-seller-1', new Set());
    expect(first.items.map((i) => i.formCode)).toEqual(['RPA', 'TDS']);

    jest.spyOn(service, 'resolveForTransaction').mockResolvedValue({
      id: 'template-2',
      items: [{ formCode: 'SCO', formName: 'Seller Counter Offer', category: 'counter_offer', isRequired: true, sortOrder: 100 }],
    } as never);
    const second = await service.getSellerAgentChecklistStatus(TX as never, 'link-seller-1', new Set());
    expect(second.items.map((i) => i.formCode)).toEqual(['SCO']);
  });

  it('is scoped strictly to the given upload link — findByUploadLink is called, not findActiveByTransaction', async () => {
    const { service, documentsService } = buildService({
      linkDocs: [makeDoc({ id: 'd1', formCode: 'RPA', analysisStatus: 'completed' })],
    });
    await service.getSellerAgentChecklistStatus(TX as never, 'link-seller-1', new Set());
    expect(documentsService.findByUploadLink).toHaveBeenCalledWith('link-seller-1', 'tx-1');
    expect(documentsService.findActiveByTransaction).not.toHaveBeenCalled();
  });

  it('uploadLinkId: null (no Seller Agent link minted yet, e.g. the internal swimlane) — every item comes back required, findByUploadLink is never called', async () => {
    const { service, documentsService } = buildService({ linkDocs: [] });
    const result = await service.getSellerAgentChecklistStatus(TX as never, null, new Set());
    expect(documentsService.findByUploadLink).not.toHaveBeenCalled();
    expect(result.items.map((i) => i.formCode)).toEqual(['RPA', 'TDS']);
    expect(result.items.every((i) => i.status === 'required')).toBe(true);
    expect(result.unmatchedDocuments).toEqual([]);
  });

  it('a required item with a completed matching document is "submitted"', async () => {
    const { service } = buildService({ linkDocs: [makeDoc({ id: 'd1', formCode: 'RPA', analysisStatus: 'completed' })] });
    const result = await service.getSellerAgentChecklistStatus(TX as never, 'link-seller-1', new Set());
    expect(result.items.find((i) => i.formCode === 'RPA')?.status).toBe('submitted');
  });

  it('a required item with an in-flight matching document is "analyzing" — attributable to the item, unlike the two-state matcher', async () => {
    const { service } = buildService({ linkDocs: [makeDoc({ id: 'd1', formCode: 'RPA', analysisStatus: 'analyzing' })] });
    const result = await service.getSellerAgentChecklistStatus(TX as never, 'link-seller-1', new Set());
    expect(result.items.find((i) => i.formCode === 'RPA')?.status).toBe('analyzing');
  });

  it('a required item with no live document but a recent rejection for its form code is "reupload_required"', async () => {
    const { service } = buildService({ linkDocs: [] });
    const result = await service.getSellerAgentChecklistStatus(TX as never, 'link-seller-1', new Set(['RPA']));
    expect(result.items.find((i) => i.formCode === 'RPA')?.status).toBe('reupload_required');
    expect(result.items.find((i) => i.formCode === 'TDS')?.status).toBe('required'); // not in the rejected set
  });

  it('a later successful submission supersedes a prior rejection — submitted wins even if the form code is still in rejectedFormCodes', async () => {
    const { service } = buildService({ linkDocs: [makeDoc({ id: 'd1', formCode: 'RPA', analysisStatus: 'completed' })] });
    const result = await service.getSellerAgentChecklistStatus(TX as never, 'link-seller-1', new Set(['RPA']));
    expect(result.items.find((i) => i.formCode === 'RPA')?.status).toBe('submitted');
  });

  it('excludes superseded and rejected documents from satisfying a checklist item', async () => {
    const { service } = buildService({
      linkDocs: [
        makeDoc({ id: 'd1', formCode: 'RPA', analysisStatus: 'completed', status: 'superseded' }),
        makeDoc({ id: 'd2', formCode: 'TDS', analysisStatus: 'completed', status: 'rejected' }),
      ],
    });
    const result = await service.getSellerAgentChecklistStatus(TX as never, 'link-seller-1', new Set());
    expect(result.items.find((i) => i.formCode === 'RPA')?.status).toBe('required');
    expect(result.items.find((i) => i.formCode === 'TDS')?.status).toBe('required');
  });

  it('a document uploaded through a DIFFERENT link never satisfies this link\'s checklist — findByUploadLink already scopes it, this documents the intent', async () => {
    // findByUploadLink is mocked to only ever return docs "for this link" — a cross-link doc simply
    // never appears in linkDocs, which is the real production scoping mechanism (uploadLinkId filter).
    const { service } = buildService({ linkDocs: [] });
    const result = await service.getSellerAgentChecklistStatus(TX as never, 'link-seller-1', new Set());
    expect(result.allRequiredSubmitted).toBe(false);
    expect(result.submittedCount).toBe(0);
  });

  it('allRequiredSubmitted is true only once every required item is submitted', async () => {
    const { service } = buildService({
      linkDocs: [
        makeDoc({ id: 'd1', formCode: 'RPA', analysisStatus: 'completed' }),
        makeDoc({ id: 'd2', formCode: 'TDS', analysisStatus: 'completed' }),
      ],
    });
    const result = await service.getSellerAgentChecklistStatus(TX as never, 'link-seller-1', new Set());
    expect(result.allRequiredSubmitted).toBe(true);
  });

  it('additional (non-checklist) uploaded documents are kept separate, in unmatchedDocuments, not counted against the required checklist', async () => {
    const { service } = buildService({
      linkDocs: [makeDoc({ id: 'd1', formCode: 'UNKNOWN_FORM', analysisStatus: 'completed' })],
    });
    const result = await service.getSellerAgentChecklistStatus(TX as never, 'link-seller-1', new Set());
    expect(result.items.every((i) => i.status === 'required')).toBe(true);
    expect(result.unmatchedDocuments).toHaveLength(1);
    expect(result.unmatchedDocuments[0].id).toBe('d1');
  });

  it('no resolvable template → an empty checklist (no hard-coded seller fallback list)', async () => {
    const { service } = buildService({ template: null, linkDocs: [] });
    const result = await service.getSellerAgentChecklistStatus(TX as never, 'link-seller-1', new Set());
    expect(result.items).toEqual([]);
    expect(result.requiredCount).toBe(0);
  });

  // ── Brokerage Template selection (tx.formTemplateId) ─────────────────────────

  it('honors the transaction\'s explicitly selected Brokerage Template (formTemplateId) over the dynamic org/state/type/side match', async () => {
    const explicitTemplate = {
      id: 'brokerage-template-1',
      items: [{ formCode: 'NHD', formName: 'Natural Hazard Disclosure Statement', category: 'disclosure', isRequired: true, sortOrder: 100 }],
    };
    const { service, templateRepo } = buildService({ linkDocs: [], explicitTemplate });
    const tx = { ...TX, formTemplateId: 'brokerage-template-1' };

    const result = await service.getSellerAgentChecklistStatus(tx as never, 'link-seller-1', new Set());

    expect(templateRepo.findOne).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'brokerage-template-1' } }));
    expect(result.items.map((i) => i.formCode)).toEqual(['NHD']); // not RPA/TDS from the dynamically-resolved REQUIRED_TEMPLATE
  });

  it('falls back to the dynamic org/state/type/side match when the transaction has no formTemplateId', async () => {
    const { service, templateRepo } = buildService({ linkDocs: [] });
    const result = await service.getSellerAgentChecklistStatus(TX as never, 'link-seller-1', new Set());
    expect(templateRepo.findOne).not.toHaveBeenCalled();
    expect(result.items.map((i) => i.formCode)).toEqual(['RPA', 'TDS']);
  });

  it('falls back to the dynamic match when formTemplateId points at a template that no longer exists', async () => {
    const { service } = buildService({ linkDocs: [], explicitTemplate: null });
    const tx = { ...TX, formTemplateId: 'deleted-template' };
    const result = await service.getSellerAgentChecklistStatus(tx as never, 'link-seller-1', new Set());
    expect(result.items.map((i) => i.formCode)).toEqual(['RPA', 'TDS']);
  });

  it('changing the selected Brokerage Template mid-transaction is reflected on the very next fetch, and previously uploaded documents are preserved (not deleted), only their required/optional attribution changes', async () => {
    const uploadedTds = makeDoc({ id: 'd-tds', formCode: 'TDS', analysisStatus: 'completed' });
    const { service, templateRepo } = buildService({ linkDocs: [uploadedTds] });
    const tx = { ...TX, formTemplateId: 'brokerage-template-1' };

    templateRepo.findOne.mockResolvedValueOnce({
      id: 'brokerage-template-1',
      items: [{ formCode: 'TDS', formName: 'Transfer Disclosure Statement', category: 'disclosure', isRequired: true, sortOrder: 100 }],
    });
    const before = await service.getSellerAgentChecklistStatus(tx as never, 'link-seller-1', new Set());
    expect(before.items.find((i) => i.formCode === 'TDS')?.status).toBe('submitted');

    // Brokerage swaps the template — TDS is now optional, not required — but never touches the upload.
    templateRepo.findOne.mockResolvedValueOnce({
      id: 'brokerage-template-2',
      items: [{ formCode: 'TDS', formName: 'Transfer Disclosure Statement', category: 'disclosure', isRequired: false, sortOrder: 100 }],
    });
    const after = await service.getSellerAgentChecklistStatus(tx as never, 'link-seller-1', new Set());
    expect(after.items.find((i) => i.formCode === 'TDS')).toBeUndefined(); // no longer a required item
    expect(after.optionalItems.find((i) => i.formCode === 'TDS')?.status).toBe('submitted'); // same uploaded document, now shown as optional/uploaded
  });

  // ── Responsible-party filtering (source of truth: CAR form registry's applicableTo) ──

  it('excludes a template item that is not the Seller Agent\'s responsibility, even when the template itself marks it required', async () => {
    const { service } = buildService({
      template: {
        id: 'template-1',
        items: [
          { formCode: 'TDS', formName: 'Transfer Disclosure Statement', category: 'disclosure', isRequired: true, sortOrder: 100 },
          { formCode: 'BHIA', formName: "Buyer Homeowners' Insurance Advisory", category: 'advisory', isRequired: true, sortOrder: 200 }, // buyer_side only
        ],
      },
      linkDocs: [],
    });
    const result = await service.getSellerAgentChecklistStatus(TX as never, 'link-seller-1', new Set());
    expect(result.items.map((i) => i.formCode)).toEqual(['TDS']);
    expect(result.optionalItems.map((i) => i.formCode)).toEqual([]);
  });

  it('a template item with no CAR-form registry entry (a brokerage custom form) is never silently hidden', async () => {
    const { service } = buildService({
      template: { id: 'template-1', items: [{ formCode: 'BROKERAGE-CUSTOM-1', formName: 'Brokerage Custom Disclosure', category: 'disclosure', isRequired: true, sortOrder: 100 }] },
      linkDocs: [],
    });
    const result = await service.getSellerAgentChecklistStatus(TX as never, 'link-seller-1', new Set());
    expect(result.items.map((i) => i.formCode)).toEqual(['BROKERAGE-CUSTOM-1']);
  });

  it('never shows the same form code twice even if it somehow appears more than once in the resolved template\'s items', async () => {
    const { service } = buildService({
      template: {
        id: 'template-1',
        items: [
          { formCode: 'TDS', formName: 'Transfer Disclosure Statement', category: 'disclosure', isRequired: true, sortOrder: 100 },
          { formCode: 'TDS', formName: 'Transfer Disclosure Statement (dup)', category: 'disclosure', isRequired: true, sortOrder: 150 },
        ],
      },
      linkDocs: [],
    });
    const result = await service.getSellerAgentChecklistStatus(TX as never, 'link-seller-1', new Set());
    expect(result.items.filter((i) => i.formCode === 'TDS')).toHaveLength(1);
  });

  // ── Optional Seller Agent items ────────────────────────────────────────────────

  it('a non-required Seller Agent template item appears in optionalItems, missing when not uploaded', async () => {
    const { service } = buildService({
      template: {
        id: 'template-1',
        items: [{ formCode: 'FHDA', formName: 'Fair Housing and Discrimination Advisory', category: 'disclosure', isRequired: false, sortOrder: 100 }],
      },
      linkDocs: [],
    });
    const result = await service.getSellerAgentChecklistStatus(TX as never, 'link-seller-1', new Set());
    expect(result.items).toEqual([]);
    expect(result.optionalItems.map((i) => i.formCode)).toEqual(['FHDA']);
    expect(result.optionalItems[0].status).toBe('required'); // "missing" — the 4-state matcher's not-yet-submitted status
    expect(result.requiredCount).toBe(0); // optional items never affect required/submitted counts
  });

  it('a non-required Seller Agent template item shows submitted once uploaded, and an optional-only doc never leaks into unmatchedDocuments', async () => {
    const { service } = buildService({
      template: {
        id: 'template-1',
        items: [{ formCode: 'FHDA', formName: 'Fair Housing and Discrimination Advisory', category: 'disclosure', isRequired: false, sortOrder: 100 }],
      },
      linkDocs: [makeDoc({ id: 'd-fhda', formCode: 'FHDA', analysisStatus: 'completed' })],
    });
    const result = await service.getSellerAgentChecklistStatus(TX as never, 'link-seller-1', new Set());
    expect(result.optionalItems[0].status).toBe('submitted');
    expect(result.unmatchedDocuments).toEqual([]);
  });

  // ── End-to-end example matching the exact spec: TDS/SPQ/AVID/NHD required, FHDA optional ──

  it('exactly reflects the Seller Agent document requirements from the Brokerage Template selected for the transaction', async () => {
    const { service } = buildService({
      template: {
        id: 'brokerage-template-1',
        items: [
          { formCode: 'TDS', formName: 'Transfer Disclosure Statement', category: 'disclosure', isRequired: true, sortOrder: 100 },
          { formCode: 'SPQ', formName: 'Seller Property Questionnaire', category: 'disclosure', isRequired: true, sortOrder: 200 },
          { formCode: 'AVID', formName: 'Agent Visual Inspection Disclosure', category: 'disclosure', isRequired: true, sortOrder: 300 },
          { formCode: 'NHD', formName: 'Natural Hazard Disclosure Statement', category: 'disclosure', isRequired: true, sortOrder: 400 },
          { formCode: 'FHDA', formName: 'Fair Housing and Discrimination Advisory', category: 'disclosure', isRequired: false, sortOrder: 500 },
        ],
      },
      linkDocs: [
        makeDoc({ id: 'd-spq', formCode: 'SPQ', analysisStatus: 'completed' }),
        makeDoc({ id: 'd-nhd', formCode: 'NHD', analysisStatus: 'completed' }),
      ],
    });

    const result = await service.getSellerAgentChecklistStatus(TX as never, 'link-seller-1', new Set());

    // AVID is a static `required: true` template item here, but is never sourced
    // from the template (see the `item.formCode !== 'AVID'` filter) — with no
    // completed TDS in linkDocs, computeAvidRequirement contributes nothing, so
    // AVID doesn't appear on the checklist at all. See the dedicated
    // "AVID dynamic requirement" describe block below for the triggered case.
    const requiredStatuses = Object.fromEntries(result.items.map((i) => [i.formCode, i.status]));
    expect(requiredStatuses).toEqual({
      TDS: 'required',
      SPQ: 'submitted',
      NHD: 'submitted',
    });
    expect(result.optionalItems.map((i) => i.formCode)).toEqual(['FHDA']);
    expect(result.optionalItems[0].status).toBe('required');
  });
});

describe('TransactionFormTemplatesService — getSellerAgentChecklistStatus AVID dynamic requirement (TDS Section III)', () => {
  function tdsDoc(seeAttachedAvid: boolean | undefined, overrides: Partial<{ id: string; createdAt: Date }> = {}) {
    return makeDoc({
      id: overrides.id ?? 'd-tds',
      formCode: 'TDS',
      analysisStatus: 'completed',
      createdAt: overrides.createdAt ?? new Date('2026-01-01'),
      metadataJson: {
        extraction: {
          section_III_agents_inspection_disclosure_listing: seeAttachedAvid === undefined
            ? { agent_notes_no_items: true }
            : { see_attached_avid: seeAttachedAvid },
        },
      },
    });
  }

  it('AVID never appears when no TDS document has completed analysis yet', async () => {
    const { service } = buildService({ linkDocs: [] });
    const result = await service.getSellerAgentChecklistStatus(TX as never, 'link-seller-1', new Set());
    expect(result.items.find((i) => i.formCode === 'AVID')).toBeUndefined();
  });

  it('AVID never appears when TDS Section III selects "no items for disclosure" instead of AVID', async () => {
    const { service } = buildService({ linkDocs: [tdsDoc(undefined)] });
    const result = await service.getSellerAgentChecklistStatus(TX as never, 'link-seller-1', new Set());
    expect(result.items.find((i) => i.formCode === 'AVID')).toBeUndefined();
  });

  it('AVID never appears when TDS Section III explicitly has see_attached_avid: false', async () => {
    const { service } = buildService({ linkDocs: [tdsDoc(false)] });
    const result = await service.getSellerAgentChecklistStatus(TX as never, 'link-seller-1', new Set());
    expect(result.items.find((i) => i.formCode === 'AVID')).toBeUndefined();
  });

  it('AVID is added as a required item, with the exact spec blocker text as requirementNote, once TDS Section III selects "See attached AVID" and no AVID has been uploaded', async () => {
    const { service } = buildService({ linkDocs: [tdsDoc(true)] });
    const result = await service.getSellerAgentChecklistStatus(TX as never, 'link-seller-1', new Set());
    const avidItem = result.items.find((i) => i.formCode === 'AVID');
    expect(avidItem?.status).toBe('required');
    expect(avidItem?.requirementNote).toBe('TDS Section III: AVID is selected, but an Agent Visual Inspection Disclosure (AVID) was not provided.');
    expect(result.allRequiredSubmitted).toBe(false);
  });

  it('the missing-AVID requirementNote clears and the item becomes submitted once a completed AVID document exists', async () => {
    const { service } = buildService({
      linkDocs: [tdsDoc(true), makeDoc({ id: 'd-avid', formCode: 'AVID', analysisStatus: 'completed' })],
    });
    const result = await service.getSellerAgentChecklistStatus(TX as never, 'link-seller-1', new Set());
    const avidItem = result.items.find((i) => i.formCode === 'AVID');
    expect(avidItem?.status).toBe('submitted');
    expect(avidItem?.requirementNote).toBeUndefined();
  });

  it('an in-flight AVID upload is "analyzing", not "required" — attributable to the item like any other Seller Agent checklist item', async () => {
    const { service } = buildService({
      linkDocs: [tdsDoc(true), makeDoc({ id: 'd-avid', formCode: 'AVID', analysisStatus: 'analyzing' })],
    });
    const result = await service.getSellerAgentChecklistStatus(TX as never, 'link-seller-1', new Set());
    expect(result.items.find((i) => i.formCode === 'AVID')?.status).toBe('analyzing');
  });

  it('uses the most recently completed TDS document when more than one exists for this link', async () => {
    const { service } = buildService({
      linkDocs: [
        tdsDoc(true, { id: 'd-tds-old', createdAt: new Date('2026-01-01') }),
        tdsDoc(undefined, { id: 'd-tds-new', createdAt: new Date('2026-01-05') }), // supersedes: no AVID selected
      ],
    });
    const result = await service.getSellerAgentChecklistStatus(TX as never, 'link-seller-1', new Set());
    expect(result.items.find((i) => i.formCode === 'AVID')).toBeUndefined();
  });

  it('even when the resolved template still lists AVID as a static required item, exactly one AVID item appears — the dynamic computation is the sole source, never a duplicate', async () => {
    const { service } = buildService({
      template: REQUIRED_TEMPLATE, // includes AVID isRequired: false, per the top-of-file fixture
      linkDocs: [tdsDoc(true)],
    });
    const result = await service.getSellerAgentChecklistStatus(TX as never, 'link-seller-1', new Set());
    expect(result.items.filter((i) => i.formCode === 'AVID')).toHaveLength(1);
    expect(result.optionalItems.find((i) => i.formCode === 'AVID')).toBeUndefined();
  });
});

describe('TransactionFormTemplatesService — getValidatedDocumentsForEnvelope', () => {
  it('includes only documents with completed analysis — analyzing/failed/uploaded are excluded', async () => {
    const { service } = buildService({
      linkDocs: [
        makeDoc({ id: 'd1', formCode: 'RPA', analysisStatus: 'completed' }),
        makeDoc({ id: 'd2', formCode: 'TDS', analysisStatus: 'analyzing' }),
        makeDoc({ id: 'd3', formCode: null, analysisStatus: null }),
      ],
    });
    const docs = await service.getValidatedDocumentsForEnvelope('link-seller-1', 'tx-1');
    expect(docs.map((d) => d.id)).toEqual(['d1']);
  });

  it('excludes superseded and rejected documents, even if their analysis completed', async () => {
    const { service } = buildService({
      linkDocs: [
        makeDoc({ id: 'd1', formCode: 'RPA', analysisStatus: 'completed', status: 'superseded' }),
        makeDoc({ id: 'd2', formCode: 'TDS', analysisStatus: 'completed', status: 'rejected' }),
      ],
    });
    const docs = await service.getValidatedDocumentsForEnvelope('link-seller-1', 'tx-1');
    expect(docs).toHaveLength(0);
  });

  it('includes both checklist-required and unmatched-but-validated documents — everything validated through this link', async () => {
    const { service } = buildService({
      linkDocs: [
        makeDoc({ id: 'd-required', formCode: 'RPA', analysisStatus: 'completed' }),
        makeDoc({ id: 'd-other', formCode: 'SOME_OTHER_FORM', analysisStatus: 'completed' }),
      ],
    });
    const docs = await service.getValidatedDocumentsForEnvelope('link-seller-1', 'tx-1');
    expect(docs.map((d) => d.id).sort()).toEqual(['d-other', 'd-required']);
  });

  it('preserves upload order — oldest first', async () => {
    const { service } = buildService({
      linkDocs: [
        makeDoc({ id: 'd-newer', formCode: 'TDS', analysisStatus: 'completed', createdAt: new Date('2026-02-01') }),
        makeDoc({ id: 'd-older', formCode: 'RPA', analysisStatus: 'completed', createdAt: new Date('2026-01-01') }),
      ],
    });
    const docs = await service.getValidatedDocumentsForEnvelope('link-seller-1', 'tx-1');
    expect(docs.map((d) => d.id)).toEqual(['d-older', 'd-newer']);
  });

  it('scoped strictly to the given upload link', async () => {
    const { service, documentsService } = buildService({ linkDocs: [] });
    await service.getValidatedDocumentsForEnvelope('link-seller-1', 'tx-1');
    expect(documentsService.findByUploadLink).toHaveBeenCalledWith('link-seller-1', 'tx-1');
  });
});

describe('TransactionFormTemplatesService — getValidatedDocumentById', () => {
  it('returns the document when it belongs to this link, is active, and has completed analysis', async () => {
    const { service } = buildService({
      linkDocs: [makeDoc({ id: 'd1', formCode: 'TDS', analysisStatus: 'completed' })],
    });
    const doc = await service.getValidatedDocumentById('link-seller-1', 'tx-1', 'd1');
    expect(doc?.id).toBe('d1');
  });

  it('returns null when the id does not exist among this link\'s active documents', async () => {
    const { service } = buildService({
      linkDocs: [makeDoc({ id: 'd1', formCode: 'TDS', analysisStatus: 'completed' })],
    });
    const doc = await service.getValidatedDocumentById('link-seller-1', 'tx-1', 'not-this-link');
    expect(doc).toBeNull();
  });

  it('returns null when the document has not completed analysis yet', async () => {
    const { service } = buildService({
      linkDocs: [makeDoc({ id: 'd1', formCode: 'TDS', analysisStatus: 'analyzing' })],
    });
    const doc = await service.getValidatedDocumentById('link-seller-1', 'tx-1', 'd1');
    expect(doc).toBeNull();
  });

  it('returns null for a superseded or rejected document, even if analysis completed', async () => {
    const { service } = buildService({
      linkDocs: [makeDoc({ id: 'd1', formCode: 'TDS', analysisStatus: 'completed', status: 'rejected' })],
    });
    const doc = await service.getValidatedDocumentById('link-seller-1', 'tx-1', 'd1');
    expect(doc).toBeNull();
  });

  it('is scoped strictly to the given upload link', async () => {
    const { service, documentsService } = buildService({ linkDocs: [] });
    await service.getValidatedDocumentById('link-seller-1', 'tx-1', 'd1');
    expect(documentsService.findByUploadLink).toHaveBeenCalledWith('link-seller-1', 'tx-1');
  });
});

describe('TransactionFormTemplatesService — getEscrowChecklistStatus', () => {
  it('Signed RPA is "required" with no matching document', async () => {
    const { service } = buildService({ docs: [] });
    const empty = await service.getEscrowChecklistStatus(TX as never);
    const rpaEmpty = empty.items.find((i) => i.formCode === 'RPA');
    expect(rpaEmpty?.status).toBe('required');
    expect(rpaEmpty?.escrowPage17Completed).toBe(false);
  });

  describe('Signed RPA — governed solely by RPA logical Page 17 (Escrow Holder Acknowledgment), never by upload/analysis/buyer-seller-signatures alone', () => {
    function rpaDoc(checks: Array<{ ruleId: string; status: string }> = []) {
      return makeDoc({ formCode: 'RPA', analysisStatus: 'completed', metadataJson: { compliance: { checks } } });
    }

    it('an RPA that completed analysis but never reached RPA page 17 stays "required" — never inferred complete from the mere fact of upload/analysis', async () => {
      const { service } = buildService({ docs: [rpaDoc([])] });
      const result = await service.getEscrowChecklistStatus(TX as never);
      const rpa = result.items.find((i) => i.formCode === 'RPA');
      expect(rpa?.status).toBe('required');
      expect(rpa?.escrowPage17Completed).toBe(false);
      expect(rpa?.uploaded).toBe(true);
    });

    it('page 17 present but the escrow/company section is blank (rpa_page17_escrow_completed skipped) — stays "required", not "reupload_required" (no blocker)', async () => {
      const { service } = buildService({ docs: [rpaDoc([{ ruleId: 'rpa_page17_escrow_completed', status: 'skipped' }])] });
      const result = await service.getEscrowChecklistStatus(TX as never);
      const rpa = result.items.find((i) => i.formCode === 'RPA');
      expect(rpa?.status).toBe('required');
      expect(rpa?.escrowPage17Completed).toBe(false);
    });

    it('page 17 present with escrow company info but no escrow holder signature — stays "required"', async () => {
      // rpa_page17_escrow_completed is only pushed as 'pass' when BOTH info and signature
      // are present; a "skipped" status here represents this exact partial case.
      const { service } = buildService({ docs: [rpaDoc([{ ruleId: 'rpa_page17_escrow_completed', status: 'skipped' }])] });
      const result = await service.getEscrowChecklistStatus(TX as never);
      expect(result.items.find((i) => i.formCode === 'RPA')?.status).toBe('required');
    });

    it('page 17 present with both escrow/company info AND the escrow holder signature — "submitted"', async () => {
      const { service } = buildService({ docs: [rpaDoc([{ ruleId: 'rpa_page17_escrow_completed', status: 'pass' }])] });
      const result = await service.getEscrowChecklistStatus(TX as never);
      const rpa = result.items.find((i) => i.formCode === 'RPA');
      expect(rpa?.status).toBe('submitted');
      expect(rpa?.escrowPage17Completed).toBe(true);
    });

    it('buyer/seller signatures on pages 1-16 alone never satisfy the item — an RPA fully executed by buyer/seller but with no page 17 escrow data is still "required"', async () => {
      // No BLOCKER_BUYER_SIGNATURE/BLOCKER_SELLER_SIGNATURE present at all (i.e. buyer and
      // seller are fully signed — nothing to reupload) and still no rpa_page17_escrow_completed
      // check present — completion must never be inferred from this alone.
      const { service } = buildService({ docs: [rpaDoc([])] });
      const result = await service.getEscrowChecklistStatus(TX as never);
      expect(result.items.find((i) => i.formCode === 'RPA')?.status).toBe('required');
    });
  });

  it('the three dedicated Escrow document types are matched by documentType, each independently "submitted" once uploaded', async () => {
    const { service } = buildService({
      docs: [
        makeDoc({ id: 'd1', documentType: 'escrow_instructions' }),
        makeDoc({ id: 'd2', documentType: 'preliminary_title_report' }),
      ],
    });
    const result = await service.getEscrowChecklistStatus(TX as never);
    expect(result.items.find((i) => i.formCode === 'escrow_instructions')?.status).toBe('submitted');
    expect(result.items.find((i) => i.formCode === 'preliminary_title_report')?.status).toBe('submitted');
    expect(result.items.find((i) => i.formCode === 'estimated_closing_statement')?.status).toBe('required');
  });

  it('does not include an "HOA Documents" item when the Seller Agent has not answered Yes to the HOA question', async () => {
    const { service: withNoAnswer } = buildService({ docs: [], hoaInfo: null });
    const noAnswer = await withNoAnswer.getEscrowChecklistStatus(TX as never);
    expect(noAnswer.items.find((i) => i.formCode === 'hoa_document')).toBeUndefined();

    const { service: withNo } = buildService({ docs: [], hoaInfo: { hasHoa: false } });
    const no = await withNo.getEscrowChecklistStatus(TX as never);
    expect(no.items.find((i) => i.formCode === 'hoa_document')).toBeUndefined();
  });

  it('includes a required "HOA Documents" item, checked off once uploaded, only when the Seller Agent answered Yes', async () => {
    const { service: required } = buildService({ docs: [], hoaInfo: { hasHoa: true } });
    const requiredResult = await required.getEscrowChecklistStatus(TX as never);
    const hoaItem = requiredResult.items.find((i) => i.formCode === 'hoa_document');
    expect(hoaItem?.status).toBe('required');
    expect(hoaItem?.formName).toBe('HOA Documents');

    const { service: submitted } = buildService({ docs: [makeDoc({ documentType: 'hoa_document' })], hoaInfo: { hasHoa: true } });
    const submittedResult = await submitted.getEscrowChecklistStatus(TX as never);
    expect(submittedResult.items.find((i) => i.formCode === 'hoa_document')?.status).toBe('submitted');
  });

  it('a document with a genuine content-validation blocker (e.g. a bad signature) is "reupload_required", never silently "submitted" — content validation still applies', async () => {
    const { service } = buildService({
      docs: [makeDoc({ formCode: 'RPA', analysisStatus: 'completed', metadataJson: { compliance: { blockers: [{ code: 'BLOCKER_BUYER_SIGNATURE' }] } } })],
    });
    const result = await service.getEscrowChecklistStatus(TX as never);
    expect(result.items.find((i) => i.formCode === 'RPA')?.status).toBe('reupload_required');
  });

  it('excludes Signed RPA and every dedicated Escrow document type from unmatchedDocuments, but still surfaces anything else uploaded', async () => {
    const { service } = buildService({
      docs: [
        makeDoc({ id: 'd1', formCode: 'RPA', analysisStatus: 'completed' }),
        makeDoc({ id: 'd2', documentType: 'escrow_instructions' }),
        makeDoc({ id: 'd3', documentType: 'external_upload', formCode: 'AD', analysisStatus: 'completed' }),
      ],
    });
    const result = await service.getEscrowChecklistStatus(TX as never);
    expect(result.unmatchedDocuments.map((d) => d.id)).toEqual(['d3']);
  });

  it('an Escrow unmatchedDocuments entry carries its own compliance checks as `validation`, same as the Buyer Agent checklist', async () => {
    const { service } = buildService({
      docs: [
        makeDoc({
          id: 'd-tds', documentType: 'external_upload', formCode: 'TDS', analysisStatus: 'completed',
          metadataJson: { compliance: { checks: [{ ruleId: 'tds_section_c_yes_explanations', label: 'Yes-answer explanations complete', status: 'fail', severity: 'error', location: 'Page 2' }] } },
        }),
      ],
    });
    const result = await service.getEscrowChecklistStatus(TX as never);
    expect(result.unmatchedDocuments).toHaveLength(1);
    expect(result.unmatchedDocuments[0].validation?.checks).toEqual([
      { id: 'tds_section_c_yes_explanations', label: 'Yes-answer explanations complete', status: 'failed', severity: 'error', detail: undefined, location: 'Page 2' },
    ]);
  });

  it('requiredCount/submittedCount/allRequiredSubmitted reflect only the items actually on the checklist', async () => {
    const { service } = buildService({
      docs: [makeDoc({
        formCode: 'RPA',
        analysisStatus: 'completed',
        metadataJson: { compliance: { checks: [{ ruleId: 'rpa_page17_escrow_completed', status: 'pass' }] } },
      })],
      hoaInfo: null,
    });
    const result = await service.getEscrowChecklistStatus(TX as never);
    expect(result.requiredCount).toBe(4); // RPA + 3 dedicated escrow types, no HOA item
    expect(result.submittedCount).toBe(1);
    expect(result.allRequiredSubmitted).toBe(false);
  });
});

describe('TransactionFormTemplatesService — getBrokerChecklistStatus', () => {
  it('is an empty, already-satisfied checklist until the CDA has been generated', async () => {
    const { service } = buildService({ docs: [] });
    const result = await service.getBrokerChecklistStatus(TX as never);
    expect(result).toEqual({
      items: [],
      optionalItems: [],
      unmatchedDocuments: [],
      requiredCount: 0,
      submittedCount: 0,
      allRequiredSubmitted: true,
    });
  });

  it('shows "Sign CDA" as required once the CDA exists but no signed CDA has been uploaded yet', async () => {
    const { service } = buildService({ docs: [makeDoc({ id: 'cda-1', documentType: 'cda' })] });
    const result = await service.getBrokerChecklistStatus(TX as never);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ formCode: 'signed_cda', formName: 'Sign CDA', category: 'commission', status: 'required' });
    expect(result.requiredCount).toBe(1);
    expect(result.submittedCount).toBe(0);
    expect(result.allRequiredSubmitted).toBe(false);
  });

  it('marks "Sign CDA" as submitted once the signed CDA has been uploaded', async () => {
    const { service } = buildService({
      docs: [
        makeDoc({ id: 'cda-1', documentType: 'cda' }),
        makeDoc({ id: 'signed-cda-1', documentType: 'signed_cda' }),
      ],
    });
    const result = await service.getBrokerChecklistStatus(TX as never);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ formCode: 'signed_cda', formName: 'Sign CDA', category: 'commission', status: 'submitted' });
    expect(result.requiredCount).toBe(1);
    expect(result.submittedCount).toBe(1);
    expect(result.allRequiredSubmitted).toBe(true);
  });
});
