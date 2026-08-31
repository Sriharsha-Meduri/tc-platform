import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DocumentPipelineService } from './document-pipeline.service';
import { RpaComplianceValidator } from './rpa-compliance.validator';
import { AcroFormExtractorService } from './acroform-extractor.service';
import { AcroFormExtractionMapper } from './acroform-extraction-mapper.service';
import type { ExtractionResult } from './extraction-result.types';
import { identifyPdfFirstPage } from '@tc/document-intelligence';

jest.mock('@tc/document-intelligence', () => ({
  ...jest.requireActual('@tc/document-intelligence'),
  identifyPdfFirstPage: jest.fn(),
}));
const mockIdentifyPdfFirstPage = identifyPdfFirstPage as jest.Mock;
const { identifyPdfFirstPage: realIdentifyPdfFirstPage } = jest.requireActual('@tc/document-intelligence');

/**
 * Regression coverage for the disclosure-validation-routing fix: a document
 * must only ever be checked against validators registered for its OWN form
 * code. An RPA-family form (RPA/SCO/BCO/SMCO/BMCO) gets contract-stage
 * validation; every other identified form gets disclosure-stage validation
 * (which resolves an unconfigured form to zero blockers, never a failure);
 * an unidentified form gets no validation at all. Nothing may ever fall
 * back to RPA's business rules for data that isn't an RPA.
 *
 * Uses the REAL RpaComplianceValidator (no mocking) so these tests prove
 * the actual compliance OUTCOME, not just which internal method fired.
 */

function minimalExtraction(overrides: Partial<ExtractionResult> = {}): ExtractionResult {
  return {
    documentType: null,
    documentSubtypes: [],
    sourceLanguage: 'en',
    property: {} as ExtractionResult['property'],
    transaction: {} as ExtractionResult['transaction'],
    parties: {} as ExtractionResult['parties'],
    contractTerms: {} as ExtractionResult['contractTerms'],
    formsAndDisclosures: [],
    signatures: {} as ExtractionResult['signatures'],
    extractionWarnings: [],
    confidenceSummary: {} as ExtractionResult['confidenceSummary'],
    ...overrides,
  };
}

/** One page-routing "form found" entry — formCode here is the identifier's own answer, independent of whatever shape the extraction data itself has. */
function extractionEntry(formCode: string, data: Record<string, unknown>, pageIndices: number[] = [0]) {
  return {
    formCode,
    formName: null,
    pageIndices,
    output: {
      formCode,
      formName: null,
      data,
      rawResponse: '',
      promptTokens: null,
      completionTokens: null,
      modelName: 'llm',
    },
  };
}

function buildService(
  extraction: ExtractionResult,
  overrides: {
    extractions?: ReturnType<typeof extractionEntry>[];
    acroForm?: { hasAcroForm: boolean; fields?: Array<{ type: string; name: string; isEmpty: boolean; value?: unknown }> };
    acroFormMapResult?: ExtractionResult;
  } = {},
) {
  const pageRoutingPipeline = {
    process: jest.fn().mockResolvedValue({
      totalPages: 1,
      classifications: [],
      formGroups: [],
      validation: null,
      identifierMayHaveFailed: false,
      extractions: overrides.extractions ?? [
        extractionEntry(extraction.documentType ?? 'UNKNOWN', extraction as unknown as Record<string, unknown>),
      ],
    }),
  };
  const acroFormExtractor = {
    extract: jest.fn().mockResolvedValue(
      overrides.acroForm
        ? { hasAcroForm: overrides.acroForm.hasAcroForm, fieldCount: overrides.acroForm.fields?.length ?? 0, fields: overrides.acroForm.fields ?? [] }
        : { hasAcroForm: false, fieldCount: 0, fields: [] },
    ),
  };
  const acroFormMapper = { map: jest.fn().mockReturnValue(overrides.acroFormMapResult ?? minimalExtraction({ documentType: 'RPA' })) };
  const extractionService = { extractFromPdfs: jest.fn() };
  const aiInteractions = { create: jest.fn().mockResolvedValue({ id: 'ai-1' }) };
  const rpaComplianceValidator = new RpaComplianceValidator();

  const service = new DocumentPipelineService(
    pageRoutingPipeline as never,
    acroFormExtractor as never,
    acroFormMapper as never,
    extractionService as never,
    aiInteractions as never,
    rpaComplianceValidator,
  );

  return { service, pageRoutingPipeline, acroFormExtractor, acroFormMapper };
}

describe('DocumentPipelineService — disclosure validation routing', () => {
  it('routes an unconfigured disclosure form (BRBC) to disclosure-stage validation — zero blockers, never RPA-derived ones', async () => {
    const extraction = minimalExtraction({ documentType: 'BRBC' });
    const { service } = buildService(extraction);

    const result = await service.process(Buffer.from('pdf'));

    expect(result.detectedFormCode).toBe('BRBC');
    // The real bug: RPA validation on BRBC data would fire blockers like
    // missing buyer/seller signature, missing purchase price, etc. None of
    // that may ever appear for a form with no registered RPA rules.
    expect(result.compliance.blockers ?? []).toHaveLength(0);
    expect(result.compliance.summary.overallStatus).toBe('compliant');
  });

  it('routes a real RPA form to contract-stage validation with its real form code (not silently accepted as "no validation")', async () => {
    const extraction = minimalExtraction({
      documentType: 'RPA',
      parties: { buyers: [], sellers: [], buyerAgents: [], listingAgents: [], brokers: [], escrowCompanies: [], lenders: [], attorneys: [], otherParties: [] } as unknown as ExtractionResult['parties'],
      transaction: { purchasePrice: null, earnestMoneyAmount: null, offerDate: null, acceptanceDate: null, closingDate: null, possessionDate: null, financingType: null, loanAmount: null, occupancyType: null } as unknown as ExtractionResult['transaction'],
      signatures: { buyerSigned: false, sellerSigned: false, signedParties: [], missingSignatures: [], missingSignatureDates: [] },
    });
    const { service } = buildService(extraction);

    const result = await service.process(Buffer.from('pdf'));

    expect(result.detectedFormCode).toBe('RPA');
    // A blank RPA (no buyers/sellers/price) genuinely IS non-compliant — this
    // confirms contract-stage rules really ran, unlike the BRBC case above.
    expect((result.compliance.blockers ?? []).length).toBeGreaterThan(0);
  });

  it('runs no validation at all when no form code can be identified — never guesses by falling back to RPA rules', async () => {
    const extraction = minimalExtraction({ documentType: null });
    const { service } = buildService(extraction);

    const result = await service.process(Buffer.from('pdf'));

    expect(result.detectedFormCode).toBeNull();
    expect(result.compliance.blockers ?? []).toHaveLength(0);
    expect(result.compliance.warnings ?? []).toHaveLength(0);
    expect(result.compliance.summary.overallStatus).toBe('compliant');
  });
});

describe('DocumentPipelineService — standalone disclosure form-code detection', () => {
  /**
   * A standalone disclosure/advisory extraction (BIA, BCA, FHDA, etc.) has
   * its own schema — form_code lives at extraction.header.form_code, never
   * at formsAndDisclosures/documentType (those only exist on the RPA/
   * contract-family shape). Regression coverage for the real bug: uploading
   * a single Fair Housing & Discrimination Advisory / Broker Compensation
   * Advisory / Buyer's Investigation Advisory PDF by itself previously came
   * back with detectedFormCode: null even though the LLM correctly
   * identified the form, because nothing read header.form_code and the
   * page-routing identifier's own answer was discarded before reaching
   * detectPrimaryFormCode.
   */
  function disclosureExtraction(formCode: string): ExtractionResult {
    return { header: { form_code: formCode, form_name: formCode } } as unknown as ExtractionResult;
  }

  it('detects the form code from the page-routing identifier for a standalone disclosure upload — even when the extraction has no formsAndDisclosures/documentType', async () => {
    const extraction = disclosureExtraction('FHDA');
    const { service } = buildService(extraction, {
      extractions: [extractionEntry('FHDA', extraction as unknown as Record<string, unknown>)],
    });

    const result = await service.process(Buffer.from('pdf'));

    expect(result.detectedFormCode).toBe('FHDA');
  });

  it('detects a form code not present in the car-forms display catalog (BCA) — the catalog is display metadata, not a gate on what can be identified', async () => {
    const extraction = disclosureExtraction('BCA');
    const { service } = buildService(extraction, {
      extractions: [extractionEntry('BCA', extraction as unknown as Record<string, unknown>)],
    });

    const result = await service.process(Buffer.from('pdf'));

    expect(result.detectedFormCode).toBe('BCA');
  });

  it('falls back to extraction.header.form_code when the identifier itself found nothing (e.g. UNKNOWN)', async () => {
    const extraction = disclosureExtraction('BIA');
    const { service } = buildService(extraction, {
      extractions: [extractionEntry('UNKNOWN', extraction as unknown as Record<string, unknown>)],
    });

    const result = await service.process(Buffer.from('pdf'));

    expect(result.detectedFormCode).toBe('BIA');
  });

  it('splits a PDF that bundles multiple disclosure forms together (no RPA involved) — each split document keeps its own correct form code', async () => {
    const fhda = disclosureExtraction('FHDA');
    const bia = disclosureExtraction('BIA');
    const { service } = buildService(fhda, {
      extractions: [
        extractionEntry('FHDA', fhda as unknown as Record<string, unknown>, [0]),
        extractionEntry('BIA', bia as unknown as Record<string, unknown>, [1]),
      ],
    });

    const result = await service.process(Buffer.from('pdf'));

    expect(result.formParts).toHaveLength(2);
    expect(result.formParts?.map((p) => p.formCode)).toEqual(['FHDA', 'BIA']);
  });
});

describe('DocumentPipelineService — AcroForm fast path only for RPA-family PDFs', () => {
  /**
   * Regression coverage: AcroFormMapper only knows RPA's own field
   * vocabulary and always reports formCode 'RPA' — see acroform-mapper.ts.
   * Having fillable AcroForm fields is NOT proof a PDF is an RPA (any
   * fillable disclosure like AVID/TDS/SPQ satisfies hasDataFields() too).
   * A real bug: an AVID PDF uploaded with intact AcroForm fields was
   * silently mistagged 'RPA' and validated against RPA's rules instead of
   * ever reaching the page-routing identifier that actually knows AVID.
   */
  const acroFieldsWithData = [{ type: 'text', name: 'some_field', isEmpty: false, value: 'x' }];

  // Full RPA-shaped extraction (matching what AcroFormMapper.map really
  // returns) — a bare minimalExtraction()'s `{}` parties/transaction casts
  // crash validateContractStage's cross-form checks, which only ever run
  // once a document is actually routed through RPA compliance.
  function rpaShapedExtraction(): ExtractionResult {
    return minimalExtraction({
      documentType: 'RPA',
      parties: { buyers: [], sellers: [], buyerAgents: [], listingAgents: [], brokers: [], escrowCompanies: [], lenders: [], attorneys: [], otherParties: [] } as unknown as ExtractionResult['parties'],
      transaction: { purchasePrice: null, earnestMoneyAmount: null, offerDate: null, acceptanceDate: null, closingDate: null, possessionDate: null, financingType: null, loanAmount: null, occupancyType: null } as unknown as ExtractionResult['transaction'],
      signatures: { buyerSigned: false, sellerSigned: false, signedParties: [], missingSignatures: [], missingSignatureDates: [] },
    });
  }

  beforeEach(() => {
    mockIdentifyPdfFirstPage.mockReset();
  });

  it('takes the AcroForm fast path (RPA) when the identifier confirms the page is RPA-family', async () => {
    mockIdentifyPdfFirstPage.mockResolvedValue({ formCode: 'RPA', formName: 'RPA', formRevision: null, pageNumber: 1, totalPages: 17, confidence: 0.99, source: 'title_footer', evidence: [] });
    const { service, acroFormMapper, pageRoutingPipeline } = buildService(minimalExtraction(), {
      acroForm: { hasAcroForm: true, fields: acroFieldsWithData },
      acroFormMapResult: rpaShapedExtraction(),
    });

    const result = await service.process(Buffer.from('pdf'));

    expect(acroFormMapper.map).toHaveBeenCalled();
    expect(pageRoutingPipeline.process).not.toHaveBeenCalled();
    expect(result.pdfType).toBe('digital_acroform');
    expect(result.detectedFormCode).toBe('RPA');
  });

  it('takes the AcroForm fast path when printed-text identification is inconclusive (preserves today\'s behavior for sparse-text RPA exports)', async () => {
    mockIdentifyPdfFirstPage.mockResolvedValue(null);
    const { service, acroFormMapper, pageRoutingPipeline } = buildService(minimalExtraction(), {
      acroForm: { hasAcroForm: true, fields: acroFieldsWithData },
      acroFormMapResult: rpaShapedExtraction(),
    });

    await service.process(Buffer.from('pdf'));

    expect(acroFormMapper.map).toHaveBeenCalled();
    expect(pageRoutingPipeline.process).not.toHaveBeenCalled();
  });

  it('skips the AcroForm fast path and routes to the page-routing identifier when the PDF is confirmed non-RPA-family (AVID) — never mistagged RPA', async () => {
    mockIdentifyPdfFirstPage.mockResolvedValue({ formCode: 'AVID', formName: 'Agent Visual Inspection Disclosure', formRevision: '6/24', pageNumber: 1, totalPages: 3, confidence: 0.99, source: 'title_footer', evidence: [] });
    const avidExtraction = { header: { form_code: 'AVID', form_name: 'Agent Visual Inspection Disclosure' } } as unknown as ExtractionResult;
    const { service, acroFormMapper, pageRoutingPipeline } = buildService(avidExtraction, {
      acroForm: { hasAcroForm: true, fields: acroFieldsWithData },
      extractions: [extractionEntry('AVID', avidExtraction as unknown as Record<string, unknown>)],
    });

    const result = await service.process(Buffer.from('pdf'));

    expect(acroFormMapper.map).not.toHaveBeenCalled();
    expect(pageRoutingPipeline.process).toHaveBeenCalled();
    expect(result.pdfType).toBe('scanned_or_flattened');
    expect(result.detectedFormCode).toBe('AVID');
  });

  it('real-fixture regression: a real AVID PDF with a live (if malformed) AcroForm field is never routed through the RPA-only AcroForm mapper', async () => {
    // This is the actual bug report reproduced end-to-end: a real AVID export
    // whose PDF still carries an AcroForm field (unlike the other AVID
    // fixture, which pdf-lib finds zero fields on) — exactly the shape that
    // silently became 'RPA' before this fix, since AcroFormMapper only knows
    // how to report RPA. Uses the REAL AcroFormExtractorService,
    // AcroFormExtractionMapper, and identifyPdfFirstPage (not mocked) — only
    // the page-routing pipeline (LLM-backed) is stubbed.
    mockIdentifyPdfFirstPage.mockImplementation(realIdentifyPdfFirstPage);
    const pdfBuffer = readFileSync(
      join(__dirname, '../../../../../packages/document-intelligence/test/extraction/somerset-home/AVID_-_LA_-_x9ed6.pdf'),
    );
    const avidExtraction = { header: { form_code: 'AVID', form_name: 'Agent Visual Inspection Disclosure' } } as unknown as ExtractionResult;
    const pageRoutingPipeline = {
      process: jest.fn().mockResolvedValue({
        totalPages: 1,
        classifications: [],
        formGroups: [],
        validation: null,
        identifierMayHaveFailed: false,
        extractions: [extractionEntry('AVID', avidExtraction as unknown as Record<string, unknown>)],
      }),
    };
    const acroFormExtractor = new AcroFormExtractorService();
    const acroFormMapper = new AcroFormExtractionMapper();
    jest.spyOn(acroFormMapper, 'map');
    const aiInteractions = { create: jest.fn().mockResolvedValue({ id: 'ai-1' }) };
    const rpaComplianceValidator = new RpaComplianceValidator();

    const service = new DocumentPipelineService(
      pageRoutingPipeline as never,
      acroFormExtractor,
      acroFormMapper,
      { extractFromPdfs: jest.fn() } as never,
      aiInteractions as never,
      rpaComplianceValidator,
    );

    const result = await service.process(pdfBuffer);

    expect(acroFormMapper.map).not.toHaveBeenCalled();
    expect(result.detectedFormCode).toBe('AVID');
    expect(result.detectedFormCode).not.toBe('RPA');
  }, 15000);
});
