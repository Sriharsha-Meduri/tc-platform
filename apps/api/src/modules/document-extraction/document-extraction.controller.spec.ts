import type { AcroFormExtractionResult } from './acroform-extractor.service';
import { DocumentExtractionController } from './document-extraction.controller';

// ── Sample extracted data ──────────────────────────────────────────────────────
// Realistic shape that the LLM returns for an RPA extraction.
const MOCK_RPA_EXTRACTION = {
  documentType: 'Residential Purchase Agreement',
  documentSubtypes: ['Purchase Agreement'],
  sourceLanguage: 'en',
  property: {
    streetAddress: '123 Main St',
    city: 'Los Angeles',
    state: 'CA',
    postalCode: '90028',
    county: 'Los Angeles',
    apn: '1234-567-890',
    mlsNumber: null,
    legalDescription: null,
  },
  transaction: {
    purchasePrice: 850000,
    earnestMoneyAmount: 17000,
    offerDate: '2026-05-01',
    acceptanceDate: '2026-05-03',
    closingDate: '2026-06-15',
    possessionDate: '2026-06-15',
    financingType: 'Conventional',
    loanAmount: 680000,
    occupancyType: 'Primary Residence',
  },
  parties: {
    buyers: [{ fullName: 'John Buyer', email: 'john@test.com', phone: '555-0100', mailingAddress: '456 Oak Ave', signaturePresent: true, confidence: 0.99 }],
    sellers: [{ fullName: 'Sally Seller', email: null, phone: null, mailingAddress: '123 Main St', signaturePresent: true, confidence: 0.98 }],
    buyerAgents: [],
    listingAgents: [],
    brokers: [],
    escrowCompanies: [],
    lenders: [],
    attorneys: [],
    otherParties: [],
  },
  contractTerms: {
    inspectionContingencyDays: 17,
    loanContingencyDays: 21,
    appraisalContingencyDays: 17,
    disclosuresDueDays: 7,
    otherDeadlines: [],
  },
  formsAndDisclosures: [
    { title: 'Residential Purchase Agreement', formCode: 'RPA', status: 'attached', confidence: 0.99 },
  ],
  signatures: {
    buyerSigned: true,
    sellerSigned: true,
    signedParties: ['John Buyer', 'Sally Seller'],
    missingSignatures: [],
  },
  extractionWarnings: [],
  confidenceSummary: { overall: 0.95, property: 0.97, transaction: 0.96, parties: 0.94, formsAndDisclosures: 0.99 },
};

// ── Factory ────────────────────────────────────────────────────────────────────

function createController(overrides?: Record<string, unknown>, ControllerClass = DocumentExtractionController) {
  const mocks = {
    documentExtractionService: { extractFromPdfs: jest.fn() },
    acroFormExtractorService: { extract: jest.fn() },
    acroFormExtractionMapper: { map: jest.fn() },
    rpaComplianceValidator: {
      fromAcroForm: jest.fn().mockReturnValue({ checks: [], blockers: [], warnings: [] }),
      fromLlmExtraction: jest.fn().mockReturnValue({ checks: [], blockers: [], warnings: [] }),
      fromContractFamilyExtraction: jest.fn().mockReturnValue({ checks: [], blockers: [], warnings: [] }),
      fromDisclosureExtraction: jest.fn().mockReturnValue({ checks: [], blockers: [], warnings: [] }),
      noValidationRequired: jest.fn().mockReturnValue({
        checks: [], blockers: [], warnings: [],
        summary: { overallStatus: 'compliant', passCount: 0, failCount: 0, warningCount: 0, skippedCount: 0 },
      }),
    },
    documentPipelineService: {
      process: jest.fn().mockResolvedValue({
        pdfType: 'scanned_or_flattened',
        extraction: {},
        compliance: { checks: [], blockers: [], warnings: [] },
        detectedFormCode: null,
        detectedFormName: null,
        resolvedStage: 'disclosures',
        resolvedDocumentType: 'disclosure',
      }),
    },
    transactionDraftService: {
      createFromExtraction: jest.fn(),
      findDuplicateByAddressAndOrg: jest.fn(),
    },
    aiInteractionsService: { create: jest.fn().mockResolvedValue({ id: 'mock-interaction-id' }) },
    s3: { upload: jest.fn().mockResolvedValue({ storageKey: 'mock-key' }) },
    documentsService: {
      findOne: jest.fn().mockResolvedValue({ id: 'doc-1', versionNo: 1 }),
      findByTransaction: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
      uploadFile: jest.fn().mockResolvedValue({ id: 'doc-uploaded', versionNo: 1 }),
      createNewVersion: jest.fn().mockResolvedValue({ id: 'doc-new-version', versionNo: 2 }),
      createDocumentWithMetadata: jest.fn().mockResolvedValue({ id: 'original-doc-id' }),
      findActiveByTransactionAndStage: jest.fn().mockResolvedValue([]),
      patchMetadataJson: jest.fn(),
      setAiInteractionId: jest.fn(),
      updateAnalysisResult: jest.fn().mockResolvedValue(undefined),
    },
    pageRoutingPipeline: { process: jest.fn() },
    formSplitter: { splitByForm: jest.fn().mockResolvedValue(new Map()) },
    stageReasoning: { runForStage: jest.fn().mockResolvedValue(null) },
    jobStore: {
      create: jest.fn(), emit: jest.fn(), complete: jest.fn(), fail: jest.fn(), get: jest.fn(),
      createWithTimeout: jest.fn().mockResolvedValue(undefined),
      completeDraft: jest.fn().mockResolvedValue(undefined),
    },
    jwtService: { sign: jest.fn(), verify: jest.fn() },
    mailgunService: { sendEmail: jest.fn() },
    transactionsService: { void: jest.fn().mockResolvedValue({}), findOne: jest.fn().mockResolvedValue({ status: 'active' }) },
    pendingUploadsService: {
      create: jest.fn().mockResolvedValue({ id: 'pending-id' }),
      findOne: jest.fn().mockResolvedValue({
        id: 'pending-id',
        transactionId: 'tx-1',
        stage: 'contract',
        storageKey: 'mock-key',
        fileName: 'test.pdf',
        mimeType: 'application/pdf',
        title: 'test.pdf',
        detectedFormCode: 'RPA',
        extractionJson: {},
        complianceJson: {},
        pdfType: 'digital_acroform',
        interactionId: 'interaction-1',
        existingDocId: 'existing-doc-1',
        existingFormCode: 'RPA',
        existingFormName: 'Residential Purchase Agreement',
        existingVersionNo: 1,
      }),
      remove: jest.fn().mockResolvedValue(undefined),
      removeById: jest.fn().mockResolvedValue(undefined),
    },
    repairRequestsService: {
      createRepairRequest: jest.fn().mockResolvedValue({ id: 'rr-1' }),
      receiveRrrr: jest.fn().mockResolvedValue({ id: 'rr-1' }),
    },
    vpService: {
      findByTransaction: jest.fn().mockResolvedValue(null),
      markDocumentReceived: jest.fn().mockResolvedValue({}),
      markValidated: jest.fn().mockResolvedValue({}),
    },
    stageInstancesService: {
      activateStage: jest.fn().mockResolvedValue({}),
    },
    accountsService: {
      findOne: jest.fn().mockResolvedValue(null),
    },
    welcomeEmailService: {
      sendWelcomeEmails: jest.fn().mockResolvedValue([]),
    },
    eventSeederService: {
      seedFromExtraction: jest.fn().mockResolvedValue([]),
    },
    partyRepo: { findOne: jest.fn().mockResolvedValue(null) },
    messageRepo: { save: jest.fn(), create: jest.fn().mockReturnValue({}) },
    ...overrides,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;

  return {
    controller: new ControllerClass(
      mocks.documentExtractionService,
      mocks.acroFormExtractorService,
      mocks.acroFormExtractionMapper,
      mocks.rpaComplianceValidator,
      mocks.documentPipelineService,
      mocks.transactionDraftService,
      mocks.aiInteractionsService,
      mocks.s3,
      mocks.documentsService,
      mocks.pageRoutingPipeline,
      mocks.formSplitter,
      mocks.stageReasoning,
      mocks.jobStore,
      mocks.jwtService,
      mocks.mailgunService,
      mocks.transactionsService,
      mocks.pendingUploadsService,
      mocks.repairRequestsService,
      mocks.vpService,
      mocks.stageInstancesService,
      mocks.accountsService,
      mocks.welcomeEmailService,
      mocks.eventSeederService,
      mocks.partyRepo,
      mocks.messageRepo,
    ),
    mocks,
  };
}

function scanResult(hasAcroForm: boolean, fieldCount = 0, fields?: AcroFormExtractionResult['fields']): AcroFormExtractionResult {
  return {
    hasAcroForm,
    fieldCount,
    pageCount: 1,
    fields: fields ?? [],
    fieldMap: {},
    formFieldValues: {},
  } as unknown as AcroFormExtractionResult;
}

function makeFile(): Express.Multer.File {
  return {
    buffer: Buffer.from('fake-pdf-content'),
    originalname: 'test.pdf',
    mimetype: 'application/pdf',
    size: 100,
    fieldname: 'file',
    encoding: '7bit',
    destination: '',
    filename: 'test.pdf',
    path: '/tmp/test.pdf',
    stream: null as unknown as import('stream').Readable,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('DocumentExtractionController — disclosure analysis persistence', () => {
  function makeExtraction(formCode: string, pageIndices: number[], data: Record<string, unknown> = {}) {
    return {
      formCode,
      formName: `${formCode} form`,
      pageIndices,
      output: { data, modelName: 'gemini', rawResponse: '{}' },
    };
  }

  function makeCombinedFiles(fileName = 'combo.pdf') {
    return {
      allFiles: [{ file: { originalname: fileName, mimetype: 'application/pdf' } as Express.Multer.File, storageKey: 'combo-key' }],
      fileBuffers: new Map([[fileName, Buffer.from('combo-bytes')]]),
    };
  }

  it('persists analysisStatus=completed and per-form compliance for a split disclosure when extraction was already produced (extract-and-draft flow)', async () => {
    const { controller, mocks } = createController();
    const { allFiles, fileBuffers } = makeCombinedFiles();

    const rpaExtraction = makeExtraction('RPA', [0, 1, 2]);
    const tdsExtraction = makeExtraction('TDS', [3, 4], { sellerSignaturePresent: false });
    const extractionFileMap = new Map([[rpaExtraction, 'combo.pdf'], [tdsExtraction, 'combo.pdf']]);

    mocks.formSplitter.splitByForm.mockResolvedValue(new Map([
      ['RPA', { buffer: Buffer.from('rpa-bytes'), pageStart: 0, pageEnd: 2 }],
      ['TDS', { buffer: Buffer.from('tds-bytes'), pageStart: 3, pageEnd: 4 }],
    ]));

    mocks.rpaComplianceValidator.fromDisclosureExtraction.mockReturnValue({
      checks: [{ ruleId: 'tds-seller-sig', status: 'fail', label: 'Seller signature present', formCode: 'TDS' }],
      blockers: [{ compositeId: 'WARN-TDS-10002', code: 'WARN-TDS-10002', message: 'Seller 2 signature is missing.', formCode: 'TDS' }],
      warnings: [],
    });

    await (controller as any).createOriginalAndSeparatedForms({
      allFiles,
      fileBuffers,
      allExtractions: [rpaExtraction, tdsExtraction],
      extractionFileMap,
      transactionId: 'tx-1',
      primaryDocId: 'primary-doc-id',
      primaryFormCode: 'RPA',
      stage: 'contract',
      createdDocs: [],
    });

    const tdsCall = mocks.documentsService.createDocumentWithMetadata.mock.calls.find(
      (args: any[]) => args[0].formCode === 'TDS',
    );
    expect(tdsCall).toBeDefined();
    expect(tdsCall[0].analysisStatus).toBe('completed');
    expect(tdsCall[0].metadataJson.compliance.blockers[0].compositeId).toBe('WARN-TDS-10002');
    expect(mocks.rpaComplianceValidator.fromDisclosureExtraction).toHaveBeenCalledWith('TDS', tdsExtraction.output.data);
    // Reused the already-produced extraction — no extra pipeline run for this form.
    expect(mocks.documentPipelineService.process).not.toHaveBeenCalled();
    expect(mocks.documentsService.updateAnalysisResult).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ analysisStatus: 'completed' }),
    );
  });

  it('runs the unified pipeline against the split buffer when no prior extraction exists (upload-and-extract flow)', async () => {
    const { controller, mocks } = createController();
    const { allFiles, fileBuffers } = makeCombinedFiles();

    // upload-and-extract's routing call skips LLM extraction for split siblings — fe.output is null.
    const rpaExtraction = { formCode: 'RPA', formName: 'RPA form', pageIndices: [0, 1, 2], output: null };
    const spqBareExtraction = { formCode: 'SPQ', formName: 'SPQ form', pageIndices: [3], output: null };
    const spqBuffer = Buffer.from('spq-bytes');

    mocks.formSplitter.splitByForm.mockResolvedValue(new Map([
      ['RPA', { buffer: Buffer.from('rpa-bytes'), pageStart: 0, pageEnd: 2 }],
      ['SPQ', { buffer: spqBuffer, pageStart: 3, pageEnd: 3 }],
    ]));

    mocks.documentPipelineService.process.mockResolvedValue({
      pdfType: 'scanned_or_flattened',
      extraction: { some: 'spq-data' },
      compliance: { checks: [], blockers: [], warnings: [] },
      detectedFormCode: 'SPQ',
      detectedFormName: 'SPQ form',
      resolvedStage: 'disclosures',
      resolvedDocumentType: 'disclosure',
    });

    await (controller as any).createOriginalAndSeparatedForms({
      allFiles,
      fileBuffers,
      allExtractions: [rpaExtraction, spqBareExtraction],
      extractionFileMap: new Map([[rpaExtraction, 'combo.pdf'], [spqBareExtraction, 'combo.pdf']]),
      transactionId: 'tx-1',
      primaryDocId: 'primary-doc-id',
      primaryFormCode: 'RPA',
      stage: 'contract',
      isUploadAndExtract: true,
      createdDocs: [],
    });

    expect(mocks.documentPipelineService.process).toHaveBeenCalledWith(spqBuffer);
    const spqCall = mocks.documentsService.createDocumentWithMetadata.mock.calls.find(
      (args: any[]) => args[0].formCode === 'SPQ',
    );
    expect(spqCall).toBeDefined();
    expect(spqCall[0].analysisStatus).toBe('completed');
    expect(spqCall[0].metadataJson.extraction).toEqual({ some: 'spq-data' });
  });

  it('validates each split disclosure independently — a failing form does not affect a passing sibling', async () => {
    const { controller, mocks } = createController();
    const { allFiles, fileBuffers } = makeCombinedFiles();

    const rpaExtraction = makeExtraction('RPA', [0]);
    const tdsExtraction = makeExtraction('TDS', [1]);
    const spqExtraction = makeExtraction('SPQ', [2]);

    mocks.formSplitter.splitByForm.mockResolvedValue(new Map([
      ['RPA', { buffer: Buffer.from('rpa'), pageStart: 0, pageEnd: 0 }],
      ['TDS', { buffer: Buffer.from('tds'), pageStart: 1, pageEnd: 1 }],
      ['SPQ', { buffer: Buffer.from('spq'), pageStart: 2, pageEnd: 2 }],
    ]));

    mocks.rpaComplianceValidator.fromDisclosureExtraction.mockImplementation((formCode: string) => {
      if (formCode === 'TDS') {
        return {
          checks: [{ ruleId: 'tds-sig', status: 'fail', label: 'Seller signature present', formCode: 'TDS' }],
          blockers: [{ compositeId: 'WARN-TDS-10002', code: 'WARN-TDS-10002', message: 'Seller 2 signature is missing.', formCode: 'TDS' }],
          warnings: [],
        };
      }
      return { checks: [{ ruleId: `${formCode.toLowerCase()}-ok`, status: 'pass', label: 'OK', formCode }], blockers: [], warnings: [] };
    });

    await (controller as any).createOriginalAndSeparatedForms({
      allFiles,
      fileBuffers,
      allExtractions: [rpaExtraction, tdsExtraction, spqExtraction],
      extractionFileMap: new Map([[rpaExtraction, 'combo.pdf'], [tdsExtraction, 'combo.pdf'], [spqExtraction, 'combo.pdf']]),
      transactionId: 'tx-1',
      primaryDocId: 'primary-doc-id',
      primaryFormCode: 'RPA',
      stage: 'contract',
      createdDocs: [],
    });

    const tdsCall = mocks.documentsService.createDocumentWithMetadata.mock.calls.find((args: any[]) => args[0].formCode === 'TDS');
    const spqCall = mocks.documentsService.createDocumentWithMetadata.mock.calls.find((args: any[]) => args[0].formCode === 'SPQ');

    expect(tdsCall[0].metadataJson.compliance.blockers).toHaveLength(1);
    // The passing SPQ sibling must not inherit TDS's blocker.
    expect(spqCall[0].metadataJson.compliance.blockers).toHaveLength(0);
    expect(spqCall[0].analysisStatus).toBe('completed');
  });

  it('marks analysisStatus=failed and stores analysisError when the pipeline throws for a split form with no prior extraction', async () => {
    const { controller, mocks } = createController();
    const { allFiles, fileBuffers } = makeCombinedFiles();

    const rpaExtraction = { formCode: 'RPA', formName: 'RPA form', pageIndices: [0], output: null };
    const nhdExtraction = { formCode: 'NHD', formName: 'NHD form', pageIndices: [1], output: null };
    const nhdBuffer = Buffer.from('nhd-bytes');

    mocks.formSplitter.splitByForm.mockResolvedValue(new Map([
      ['RPA', { buffer: Buffer.from('rpa'), pageStart: 0, pageEnd: 0 }],
      ['NHD', { buffer: nhdBuffer, pageStart: 1, pageEnd: 1 }],
    ]));

    mocks.documentPipelineService.process.mockRejectedValue(new Error('Gemini extraction timed out'));

    await (controller as any).createOriginalAndSeparatedForms({
      allFiles,
      fileBuffers,
      allExtractions: [rpaExtraction, nhdExtraction],
      extractionFileMap: new Map([[rpaExtraction, 'combo.pdf'], [nhdExtraction, 'combo.pdf']]),
      transactionId: 'tx-1',
      primaryDocId: 'primary-doc-id',
      primaryFormCode: 'RPA',
      stage: 'contract',
      isUploadAndExtract: true,
      createdDocs: [],
    });

    const nhdCall = mocks.documentsService.createDocumentWithMetadata.mock.calls.find((args: any[]) => args[0].formCode === 'NHD');
    expect(nhdCall[0].analysisStatus).toBe('failed');
    expect(nhdCall[0].metadataJson.analysisError).toBe('Gemini extraction timed out');
    expect(mocks.documentsService.updateAnalysisResult).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ analysisStatus: 'failed' }),
    );
  });

  it('sets analysisStatus=completed on the primary document when uploadAndExtract detects a disclosure form', async () => {
    const { controller, mocks } = createController();

    mocks.acroFormExtractorService.extract.mockResolvedValue(scanResult(false, 0));
    mocks.documentExtractionService.extractFromPdfs.mockResolvedValue({
      result: { ...MOCK_RPA_EXTRACTION, documentType: 'Transfer Disclosure Statement', formsAndDisclosures: [{ formCode: 'TDS', status: 'attached' }] },
      interaction: { id: 'llm-interaction' },
    });
    mocks.documentsService.uploadFile.mockResolvedValue({ id: 'doc-tds', versionNo: 1, storageKey: 'tds-key' });
    mocks.documentsService.findOne.mockResolvedValue({ id: 'doc-tds', versionNo: 1 });

    await controller.uploadAndExtract(makeFile(), 'tx-1', 'disclosures');

    expect(mocks.documentsService.updateAnalysisResult).toHaveBeenCalledWith(
      'doc-tds',
      expect.objectContaining({ analysisStatus: 'completed' }),
    );
  });

  it('sets formCode and analysisStatus=completed on the primary document for a contract-family form (RPA), not just disclosures', async () => {
    const { controller, mocks } = createController();

    mocks.acroFormExtractorService.extract.mockResolvedValue(
      scanResult(true, 1, [{ name: 'buyer_name', type: 'text', value: 'John Buyer', isEmpty: false }]),
    );
    mocks.acroFormExtractionMapper.map.mockReturnValue(MOCK_RPA_EXTRACTION);
    mocks.documentsService.uploadFile.mockResolvedValue({ id: 'doc-rpa', versionNo: 1, storageKey: 'rpa-key' });
    mocks.documentsService.findOne.mockResolvedValue({ id: 'doc-rpa', versionNo: 1 });

    await controller.uploadAndExtract(makeFile(), 'tx-1', 'contract');

    expect(mocks.documentsService.updateAnalysisResult).toHaveBeenCalledWith(
      'doc-rpa',
      expect.objectContaining({ analysisStatus: 'completed', formCode: 'RPA' }),
    );
  });
});

describe('DocumentExtractionController — mockExtractions', () => {
  describe('extractAndDraft', () => {
    it('uses mock extraction when AcroForm is absent and mockExtractions is provided', async () => {
      const { controller, mocks } = createController();

      mocks.acroFormExtractorService.extract.mockResolvedValue(scanResult(false, 0));
      mocks.transactionDraftService.findDuplicateByAddressAndOrg.mockResolvedValue(null);
      mocks.transactionDraftService.createFromExtraction.mockResolvedValue({
        transaction: { id: 'tx-1' },
        document: { id: 'doc-1' },
      });

      const mockRaw = JSON.stringify({ RPA: MOCK_RPA_EXTRACTION });

      const result = await controller.extractAndDraft(
        [makeFile()],
        'org-1',
        'acct-1',
        undefined,
        mockRaw,
      );

      // LLM should NOT be called — mock was used instead
      expect(mocks.documentExtractionService.extractFromPdfs).not.toHaveBeenCalled();
      // Compliance should have run on mock data
      expect(mocks.rpaComplianceValidator.fromLlmExtraction).toHaveBeenCalled();
      // AI interaction should have been saved
      expect(mocks.aiInteractionsService.create).toHaveBeenCalled();
      // Draft should have been created with extraction data
      expect(mocks.transactionDraftService.createFromExtraction).toHaveBeenCalled();
      // Compliance should be in the result
      expect(result.compliance).toBeDefined();
    });

    it('falls back to LLM when no AcroForm and mockExtractions is not provided', async () => {
      const { controller, mocks } = createController();

      mocks.acroFormExtractorService.extract.mockResolvedValue(scanResult(false, 0));
      mocks.documentExtractionService.extractFromPdfs.mockResolvedValue({
        result: MOCK_RPA_EXTRACTION,
        interaction: { id: 'llm-interaction' },
      });
      mocks.transactionDraftService.findDuplicateByAddressAndOrg.mockResolvedValue(null);
      mocks.transactionDraftService.createFromExtraction.mockResolvedValue({
        transaction: { id: 'tx-1' },
        document: { id: 'doc-1' },
      });

      await controller.extractAndDraft([makeFile()], 'org-1', 'acct-1');

      // LLM should have been called (no mock provided)
      expect(mocks.documentExtractionService.extractFromPdfs).toHaveBeenCalled();
    });

    it('surfaces a transient AI-provider extraction failure as EXTRACTION_SERVICE_UNAVAILABLE, even when the failed form was correctly identified as RPA', async () => {
      // Regression: a page can be correctly identified as RPA (via the
      // deterministic text path) while its separate extraction call still
      // fails on a transient provider error (e.g. Gemini 503 "high demand").
      // That must be reported as a temporary service issue, never as
      // "this document isn't an RPA" / RPA_NOT_FOUND.
      const { controller, mocks } = createController();

      mocks.acroFormExtractorService.extract.mockResolvedValue(scanResult(false, 0));
      mocks.pageRoutingPipeline.process.mockResolvedValue({
        totalPages: 17,
        classifications: [],
        formGroups: [{ formCode: 'RPA', pageIndices: Array.from({ length: 17 }, (_, i) => i) }],
        extractions: [
          {
            formCode: 'RPA',
            formName: null,
            pageIndices: Array.from({ length: 17 }, (_, i) => i),
            output: null,
            error: '[GoogleGenerativeAI Error]: Error fetching ...: [503 ] This model is currently experiencing high demand.',
          },
        ],
        validation: null,
        identifierMayHaveFailed: false,
      });

      await expect(
        controller.extractAndDraft([makeFile()], 'org-1', 'acct-1'),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'EXTRACTION_SERVICE_UNAVAILABLE' }),
      });

      // Must not cascade into the RPA/generic LLM fallbacks — those would
      // fail identically and produce the misleading "unknown" document type.
      expect(mocks.documentExtractionService.extractFromPdfs).not.toHaveBeenCalled();
    });

    it('uses AcroForm when available, regardless of mockExtractions', async () => {
      const { controller, mocks } = createController();

      mocks.acroFormExtractorService.extract.mockResolvedValue(scanResult(true, 15, [{ name: 'buyer_name', type: 'text', value: 'John Buyer', isEmpty: false }]));
      mocks.acroFormExtractionMapper.map.mockReturnValue(MOCK_RPA_EXTRACTION);
      mocks.transactionDraftService.findDuplicateByAddressAndOrg.mockResolvedValue(null);
      mocks.transactionDraftService.createFromExtraction.mockResolvedValue({
        transaction: { id: 'tx-1' },
        document: { id: 'doc-1' },
      });

      await controller.extractAndDraft(
        [makeFile()],
        'org-1',
        'acct-1',
        undefined,
        JSON.stringify({ RPA: MOCK_RPA_EXTRACTION }),
      );

      // AcroForm path used — LLM not called, mock not used
      expect(mocks.documentExtractionService.extractFromPdfs).not.toHaveBeenCalled();
      expect(mocks.acroFormExtractionMapper.map).toHaveBeenCalled();
      expect(mocks.rpaComplianceValidator.fromAcroForm).toHaveBeenCalled();
      expect(mocks.rpaComplianceValidator.fromLlmExtraction).not.toHaveBeenCalled();
    });

    it('rejects transactionSide=SELLER while the Seller Side feature flag is locked', async () => {
      const { controller, mocks } = createController();

      mocks.acroFormExtractorService.extract.mockResolvedValue(scanResult(false, 0));
      mocks.transactionDraftService.findDuplicateByAddressAndOrg.mockResolvedValue(null);
      mocks.transactionDraftService.createFromExtraction.mockResolvedValue({
        transaction: { id: 'tx-1' },
        document: { id: 'doc-1' },
      });

      const mockRaw = JSON.stringify({ RPA: MOCK_RPA_EXTRACTION });

      await expect(
        controller.extractAndDraft([makeFile()], 'org-1', 'acct-1', undefined, mockRaw, 'SELLER'),
      ).rejects.toThrow('Seller Side Transaction is not yet available.');

      // Fails fast — never even runs the extraction pipeline or creates a draft.
      expect(mocks.acroFormExtractorService.extract).not.toHaveBeenCalled();
      expect(mocks.transactionDraftService.createFromExtraction).not.toHaveBeenCalled();
    });

    it('defaults transactionSide to BUYER when omitted (backward compatibility)', async () => {
      const { controller, mocks } = createController();

      mocks.acroFormExtractorService.extract.mockResolvedValue(scanResult(false, 0));
      mocks.transactionDraftService.findDuplicateByAddressAndOrg.mockResolvedValue(null);
      mocks.transactionDraftService.createFromExtraction.mockResolvedValue({
        transaction: { id: 'tx-1' },
        document: { id: 'doc-1' },
      });

      const mockRaw = JSON.stringify({ RPA: MOCK_RPA_EXTRACTION });

      await controller.extractAndDraft(
        [makeFile()],
        'org-1',
        'acct-1',
        undefined,
        mockRaw,
      );

      const callArgs = mocks.transactionDraftService.createFromExtraction.mock.calls[0];
      expect(callArgs[callArgs.length - 1]).toBe('BUYER');
    });
  });

  describe('normalizeTransactionSide — Seller Side feature flag (TRANSACTION_FEATURES)', () => {
    it('rejects an explicit SELLER request while sellerSideEnabled is false', () => {
      const { controller } = createController();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(() => (controller as any).normalizeTransactionSide('SELLER')).toThrow(
        'Seller Side Transaction is not yet available.',
      );
    });

    it('defaults omitted/invalid values to BUYER regardless of the flag', () => {
      const { controller } = createController();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((controller as any).normalizeTransactionSide(undefined)).toBe('BUYER');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((controller as any).normalizeTransactionSide('bogus')).toBe('BUYER');
    });

    it('allows SELLER through once TRANSACTION_FEATURES.sellerSideEnabled is flipped to true', () => {
      let FreshController!: typeof DocumentExtractionController;
      jest.isolateModules(() => {
        jest.doMock('@tc/shared', () => ({
          ...jest.requireActual('@tc/shared'),
          TRANSACTION_FEATURES: { buyerSideEnabled: true, sellerSideEnabled: true },
        }));
        FreshController = require('./document-extraction.controller').DocumentExtractionController;
      });

      const { controller } = createController(undefined, FreshController);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((controller as any).normalizeTransactionSide('SELLER')).toBe('SELLER');
    });
  });

  describe('uploadAndExtract', () => {
    it('uses mock extraction when AcroForm is absent and mockExtractions is provided', async () => {
      const { controller, mocks } = createController();

      mocks.acroFormExtractorService.extract.mockResolvedValue(scanResult(false, 0));
      mocks.documentsService.findOne.mockResolvedValue({ id: 'doc-1', versionNo: 1 });

      const result = await controller.uploadAndExtract(
        makeFile(),
        'tx-1',
        'contract',
        undefined,
        undefined,
        JSON.stringify({ RPA: MOCK_RPA_EXTRACTION }),
      );

      expect(mocks.documentExtractionService.extractFromPdfs).not.toHaveBeenCalled();
      // RPA is a contract-family form — routed to fromContractFamilyExtraction
      // (with its real form code), never to the generic fromLlmExtraction.
      expect(mocks.rpaComplianceValidator.fromContractFamilyExtraction).toHaveBeenCalledWith('RPA', expect.anything());
      expect(result.detectedFormCode).toBe('RPA');
      expect(result.submittedStage).toBe('contract');
    });

    it('falls back to LLM when no AcroForm and no mockExtractions', async () => {
      const { controller, mocks } = createController();

      mocks.acroFormExtractorService.extract.mockResolvedValue(scanResult(false, 0));
      mocks.documentExtractionService.extractFromPdfs.mockResolvedValue({
        result: MOCK_RPA_EXTRACTION,
        interaction: { id: 'llm-interaction' },
      });
      mocks.documentsService.findOne.mockResolvedValue({ id: 'doc-1', versionNo: 1 });

      await controller.uploadAndExtract(makeFile(), 'tx-1', 'contract');

      expect(mocks.documentExtractionService.extractFromPdfs).toHaveBeenCalled();
    });

    // Regression coverage for the disclosure-validation-routing fix: a
    // document may only be validated against rules registered for its OWN
    // form code — a non-contract-family form must never fall back to
    // fromLlmExtraction/fromAcroForm (which hardcode formCode: 'RPA').
    it('routes an unconfigured, non-RPA-family form (BRBC) to disclosure-stage validation, never to RPA rules', async () => {
      const { controller, mocks } = createController();

      mocks.acroFormExtractorService.extract.mockResolvedValue(scanResult(false, 0));
      mocks.documentExtractionService.extractFromPdfs.mockResolvedValue({
        result: {
          ...MOCK_RPA_EXTRACTION,
          documentType: 'BRBC',
          formsAndDisclosures: [{ title: 'Buyer Representation and Broker Compensation', formCode: 'BRBC', status: 'attached', confidence: 0.9 }],
        },
        interaction: { id: 'llm-interaction' },
      });
      mocks.documentsService.findOne.mockResolvedValue({ id: 'doc-1', versionNo: 1 });

      const result = await controller.uploadAndExtract(makeFile(), 'tx-1', 'intake');

      expect(result.detectedFormCode).toBe('BRBC');
      expect(mocks.rpaComplianceValidator.fromDisclosureExtraction).toHaveBeenCalledWith('BRBC', expect.anything());
      expect(mocks.rpaComplianceValidator.fromLlmExtraction).not.toHaveBeenCalled();
      expect(mocks.rpaComplianceValidator.fromAcroForm).not.toHaveBeenCalled();
    });

    it('runs no validation at all when no form code can be identified — never guesses by falling back to RPA rules', async () => {
      const { controller, mocks } = createController();

      mocks.acroFormExtractorService.extract.mockResolvedValue(scanResult(false, 0));
      mocks.documentExtractionService.extractFromPdfs.mockResolvedValue({
        result: { ...MOCK_RPA_EXTRACTION, documentType: null, formsAndDisclosures: [] },
        interaction: { id: 'llm-interaction' },
      });
      mocks.documentsService.findOne.mockResolvedValue({ id: 'doc-1', versionNo: 1 });

      const result = await controller.uploadAndExtract(makeFile(), 'tx-1', 'intake');

      expect(result.detectedFormCode).toBeNull();
      expect(mocks.rpaComplianceValidator.noValidationRequired).toHaveBeenCalled();
      expect(mocks.rpaComplianceValidator.fromLlmExtraction).not.toHaveBeenCalled();
      expect(mocks.rpaComplianceValidator.fromAcroForm).not.toHaveBeenCalled();
    });
  });

  describe('parseMockExtractions (via extractAndDraft behavior)', () => {
    it('rejects invalid JSON without throwing', async () => {
      const { controller, mocks } = createController();

      mocks.acroFormExtractorService.extract.mockResolvedValue(scanResult(true, 1, [{ name: 'buyer_name', type: 'text', value: 'John Buyer', isEmpty: false }]));
      mocks.acroFormExtractionMapper.map.mockReturnValue(MOCK_RPA_EXTRACTION);
      mocks.transactionDraftService.findDuplicateByAddressAndOrg.mockResolvedValue(null);
      mocks.transactionDraftService.createFromExtraction.mockResolvedValue({
        transaction: { id: 'tx-1' },
        document: { id: 'doc-1' },
      });

      // Invalid JSON string should be silently ignored — no error thrown
      await expect(
        controller.extractAndDraft([makeFile()], 'org-1', 'acct-1', undefined, 'not-valid-json'),
      ).resolves.toBeDefined();
    });

    it('handles empty mockExtractions object gracefully', async () => {
      const { controller, mocks } = createController();

      mocks.acroFormExtractorService.extract.mockResolvedValue(scanResult(false, 0));
      mocks.documentExtractionService.extractFromPdfs.mockResolvedValue({
        result: MOCK_RPA_EXTRACTION,
        interaction: { id: 'llm-interaction' },
      });
      mocks.transactionDraftService.findDuplicateByAddressAndOrg.mockResolvedValue(null);
      mocks.transactionDraftService.createFromExtraction.mockResolvedValue({
        transaction: { id: 'tx-1' },
        document: { id: 'doc-1' },
      });

      // Empty object {} should fall through to LLM
      await controller.extractAndDraft(
        [makeFile()],
        'org-1',
        'acct-1',
        undefined,
        '{}',
      );

      expect(mocks.documentExtractionService.extractFromPdfs).toHaveBeenCalled();
    });
  });
});

describe('DocumentExtractionController — extractAndDraftRouted completion-email gating', () => {
  // Regression test for a real production crash found via cloud logs: when the
  // async extraction job resolves to a duplicate-transaction result (no new
  // draft created — `{ duplicate: true, existingTransactionId, ... }`, with no
  // `.transaction` field), the completion handler unconditionally called
  // notifyTcOnCompletion, which crashed reading `result.transaction.propertyAddressLine1`
  // off undefined — silently discarding the TC's completion-email attempt every
  // time a duplicate was detected via the routed (async job) upload path.
  it('never attempts to send the completion email when the job resolves to a duplicate-detected result', async () => {
    const { controller, mocks } = createController();
    mocks.accountsService.findOne.mockResolvedValue({ user: { email: 'tc@example.com' } });

    const duplicateResult = {
      duplicate: true,
      existingTransactionId: 'existing-tx-1',
      extractionResult: { documentType: 'Residential Purchase Agreement' },
      compliance: {},
      contractDocuments: [],
    };
    (controller as any).runExtractAndDraftRouted = jest.fn().mockResolvedValue(duplicateResult);

    await controller.extractAndDraftRouted([makeFile()], 'org-1', 'acct-1');
    await new Promise((resolve) => setImmediate(resolve));

    expect(mocks.jobStore.completeDraft).toHaveBeenCalledWith(expect.any(String), duplicateResult);
    expect(mocks.mailgunService.sendEmail).not.toHaveBeenCalled();
  });

  it('still sends the completion email when the job resolves to a real (non-duplicate) draft', async () => {
    const { controller, mocks } = createController();
    mocks.accountsService.findOne.mockResolvedValue({ user: { email: 'tc@example.com' } });

    const draftResult = {
      transaction: { id: 'tx-1', transactionNumber: 'TXN-1', propertyAddressLine1: '123 Main St', propertyCity: 'Anytown', propertyState: 'CA' },
      document: { id: 'doc-1' },
      compliance: {},
      documents: [],
    };
    (controller as any).runExtractAndDraftRouted = jest.fn().mockResolvedValue(draftResult);

    await controller.extractAndDraftRouted([makeFile()], 'org-1', 'acct-1');
    await new Promise((resolve) => setImmediate(resolve));

    expect(mocks.mailgunService.sendEmail).toHaveBeenCalledWith(
      'tc@example.com',
      expect.stringContaining('123 Main St'),
      expect.any(String),
      expect.any(String),
    );
  });

  it('rejects an explicit SELLER request synchronously — never creates a job or starts the async pipeline', async () => {
    const { controller, mocks } = createController();
    const runSpy = jest.fn();
    (controller as any).runExtractAndDraftRouted = runSpy;

    await expect(
      controller.extractAndDraftRouted([makeFile()], 'org-1', 'acct-1', undefined, undefined, 'SELLER'),
    ).rejects.toThrow('Seller Side Transaction is not yet available.');

    expect(mocks.jobStore.createWithTimeout).not.toHaveBeenCalled();
    expect(runSpy).not.toHaveBeenCalled();
  });
});
