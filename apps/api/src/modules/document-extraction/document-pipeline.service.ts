import { Injectable, Logger } from '@nestjs/common';
import { PageRoutingPipelineService } from './page-routing-pipeline.service';
import { RpaComplianceValidator } from './rpa-compliance.validator';
import { AcroFormExtractorService, type AcroFormExtractionResult } from './acroform-extractor.service';
import { AcroFormExtractionMapper } from './acroform-extraction-mapper.service';
import { DocumentExtractionService } from './document-extraction.service';
import { AiInteractionsService } from '../ai-interactions/ai-interactions.service';
import { AiInteractionStatus } from '../ai-interactions/entities/ai-interaction.entity';
import { getCarForm } from '../transaction-form-templates/metadata/car-forms.metadata';
import { identifyPdfFirstPage } from '@tc/document-intelligence';
import type { FormExtractionOutput, ValidationUploadSource } from '@tc/document-intelligence';
import type { ExtractionResult } from './extraction-result.types';
import type { ComplianceResult } from './compliance-result.types';

/**
 * Form codes with their own contract-stage business rules (validateContractStage)
 * — the primary purchase agreement and its counter-offers. Every other form code
 * (a disclosure with its own validator, a disclosure with none, or an
 * unidentified document) is routed to the disclosures stage instead, which
 * treats an unrecognized form code as "no validation required," never as a
 * failure — see RpaComplianceValidator.fromDisclosureExtraction/
 * noValidationRequired. A document must never be validated against a form
 * it isn't: this set is the single place that decision is made, shared by
 * every branch below.
 */
export const RPA_FAMILY_FORM_CODES = new Set(['RPA', 'SCO', 'BCO', 'SMCO', 'BMCO']);

export interface PipelineFormPart {
  formCode: string;
  formName: string | null;
  /** 0-indexed page numbers within the source PDF this form occupies. */
  pageIndices: number[];
  extraction: ExtractionResult;
  compliance: ComplianceResult;
}

export interface PipelineProcessResult {
  pdfType: 'digital_acroform' | 'scanned_or_flattened';
  extraction: ExtractionResult;
  compliance: ComplianceResult;
  detectedFormCode: string | null;
  detectedFormName: string | null;
  resolvedStage: string;
  resolvedDocumentType: string;
  /** Raw per-form outputs from page-routing pipeline (null when using AcroForm or basic extraction) */
  pageRoutedExtractions?: FormExtractionOutput[];
  /**
   * Every form the page-routing pipeline actually detected and extracted in
   * this PDF, each with its own extraction + compliance already computed
   * (via the same deterministic, catalog-driven validator used for the
   * primary form — no additional LLM calls). Only set when more than one
   * form was found, since a single-form PDF has nothing to split. Used to
   * split a combined PDF into one document per form.
   */
  formParts?: PipelineFormPart[];
}

@Injectable()
export class DocumentPipelineService {
  private readonly logger = new Logger(DocumentPipelineService.name);

  constructor(
    private readonly pageRoutingPipeline: PageRoutingPipelineService,
    private readonly acroFormExtractor: AcroFormExtractorService,
    private readonly acroFormMapper: AcroFormExtractionMapper,
    private readonly extractionService: DocumentExtractionService,
    private readonly aiInteractions: AiInteractionsService,
    private readonly rpaComplianceValidator: RpaComplianceValidator,
  ) {}

  /**
   * Process a single PDF buffer through the full extraction pipeline:
   *   AcroForm check → page-routing pipeline (or basic extraction) → compliance.
   *
   * This is the unified entry point used by manual uploads, email attachments,
   * and any future import methods. Every document follows the same pipeline.
   */
  async process(pdfBuffer: Buffer, uploadSource?: ValidationUploadSource): Promise<PipelineProcessResult> {
    // Step 1: Try AcroForm extraction first (fast, no LLM cost)
    const acroResult = await this.acroFormExtractor.extract(pdfBuffer);

    if (acroResult.hasAcroForm && this.hasDataFields(acroResult) && await this.acroFormLooksLikeRpaFamily(pdfBuffer)) {
      this.logger.log(`Pipeline: AcroForm extraction (${acroResult.fieldCount} fields)`);
      const extraction = this.acroFormMapper.map(acroResult);
      const detectedFormCode = this.detectPrimaryFormCode(extraction);
      const resolvedStage = this.resolveStageFromFormCode(detectedFormCode) ?? 'inspection';
      const resolvedDocumentType = this.formCodeToDocumentType(detectedFormCode) ?? 'general';

      const compliance = this.complianceForFormCode(detectedFormCode, extraction, uploadSource);

      await this.aiInteractions.create({
        modelName: 'acroform',
        feature: 'document_upload',
        promptText: 'acroform_field_extraction',
        responseText: JSON.stringify(extraction),
        promptTokens: 0,
        completionTokens: 0,
        status: AiInteractionStatus.SUCCESS,
        metadataJson: { extraction: extraction as unknown as Record<string, unknown> },
      });

      return {
        pdfType: 'digital_acroform',
        extraction,
        compliance,
        detectedFormCode,
        detectedFormName: detectedFormCode ? (getCarForm(detectedFormCode)?.name ?? null) : null,
        resolvedStage,
        resolvedDocumentType,
      };
    }

    // Step 2: Page-routing pipeline (split → classify → group → extract → validate)
    this.logger.log('Pipeline: page-routing extraction');
    const pageResult = await this.pageRoutingPipeline.process(pdfBuffer);
    const validExtractions = pageResult.extractions.filter((e) => e.output !== null);
    const pageExtractions = validExtractions.map((e) => e.output!);

    // Build unified extraction from the primary (first) form extraction
    let extraction: ExtractionResult;
    let interaction: { id: string };
    /**
     * The page-routing identifier already determined this form's code with
     * high confidence (the exact same signal formParts below uses per form)
     * — checked first in complianceForFormCode below, before falling back to
     * re-deriving it from the extraction payload itself. Without this, a
     * single-form (unsplit) upload whose extraction schema isn't the RPA/
     * contract shape (e.g. a standalone disclosure — BIA, BCA, FHDA, its
     * form code lives at extraction.header.form_code, not
     * formsAndDisclosures/documentType) would lose the identifier's answer
     * and come back with no form code at all, even though the identical PDF
     * gets it right when it's one of several forms split out of a combined
     * upload.
     */
    let primaryIdentifiedFormCode: string | null = null;

    if (pageExtractions.length > 0) {
      const primary = pageExtractions[0];
      extraction = primary.data as unknown as ExtractionResult;
      // No getCarForm() gate here — matches formParts below, which trusts this
      // exact same identifier signal directly. The car-forms metadata catalog
      // is checklist-display metadata (name/category/stage), not a complete
      // list of every form the identifier/extractor layer knows about (e.g.
      // BCA is a fully registered extraction form with no catalog entry) —
      // gating on it would silently drop identified forms it doesn't list.
      const identified = validExtractions[0].formCode.toUpperCase();
      primaryIdentifiedFormCode = identified !== 'UNKNOWN' ? identified : null;

      interaction = await this.aiInteractions.create({
        modelName: primary.modelName,
        feature: 'document_upload',
        promptText: 'page_routing_extraction',
        responseText: primary.rawResponse,
        promptTokens: primary.promptTokens ?? undefined,
        completionTokens: primary.completionTokens ?? undefined,
        status: AiInteractionStatus.SUCCESS,
        metadataJson: { extraction: primary.data },
      });
    } else {
      // Fallback: basic LLM extraction when page-routing produces nothing
      const llmResult = await this.extractionService.extractFromPdfs([{ buffer: pdfBuffer } as any]);
      extraction = llmResult.result;
      interaction = llmResult.interaction;
    }

    const detectedFormCode = primaryIdentifiedFormCode ?? this.detectPrimaryFormCode(extraction);
    const resolvedStage = this.resolveStageFromFormCode(detectedFormCode) ?? 'inspection';
    const resolvedDocumentType = this.formCodeToDocumentType(detectedFormCode) ?? 'general';
    const detectedFormName = detectedFormCode ? (getCarForm(detectedFormCode)?.name ?? null) : null;

    // Generate compliance based on detected form — never guess a form code's
    // validators from another form's rules (see complianceForFormCode).
    const compliance = this.complianceForFormCode(detectedFormCode, extraction, uploadSource);

    // When the page-routing pipeline found more than one form in this PDF, compute
    // extraction+compliance for EVERY form (not just the primary) so the caller can
    // split the combined PDF into one document per form — reusing the exact same
    // deterministic validator call above, just applied per form, no new LLM calls.
    // Applies equally whether the combined PDF mixes an RPA with disclosures or
    // bundles several disclosures alone — the identifier groups pages by form
    // code regardless of what the other forms in the file are.
    const formParts: PipelineFormPart[] | undefined = pageExtractions.length > 1
      ? validExtractions.map((e) => {
        const formCode = e.formCode.toUpperCase();
        const formExtraction = e.output!.data as unknown as ExtractionResult;
        const formCompliance = this.complianceForFormCode(formCode, formExtraction, uploadSource);
        return { formCode, formName: e.formName, pageIndices: e.pageIndices, extraction: formExtraction, compliance: formCompliance };
      })
      : undefined;

    return {
      pdfType: 'scanned_or_flattened',
      extraction,
      compliance,
      detectedFormCode,
      detectedFormName,
      resolvedStage,
      resolvedDocumentType,
      pageRoutedExtractions: pageExtractions.length > 0 ? pageExtractions : undefined,
      formParts,
    };
  }

  /**
   * Routes to the validator set actually registered for `formCode` — the
   * single place this pipeline decides which compliance rules apply to a
   * document, shared by the AcroForm branch, the primary page-routing form,
   * and the per-form split branch so all three can never drift apart.
   *
   *   - RPA-family (RPA/SCO/BCO/SMCO/BMCO) → validateContractStage, with the
   *     real form code preserved (never hardcoded to 'RPA').
   *   - Any other identified form → validateDisclosuresStage, which already
   *     resolves an unrecognized form code to zero blockers/warnings — a
   *     graceful no-op, not a failure.
   *   - No form code identified at all → no validation is run. Never guess
   *     by falling back to RPA (or any other) rules for data of unknown shape.
   */
  private complianceForFormCode(formCode: string | null, extraction: ExtractionResult, uploadSource?: ValidationUploadSource): ComplianceResult {
    if (formCode && RPA_FAMILY_FORM_CODES.has(formCode)) {
      return this.rpaComplianceValidator.fromContractFamilyExtraction(formCode, extraction, undefined, undefined, uploadSource);
    }
    if (formCode) {
      return this.rpaComplianceValidator.fromDisclosureExtraction(formCode, extraction as unknown as Record<string, unknown>, uploadSource);
    }
    return this.rpaComplianceValidator.noValidationRequired();
  }

  /**
   * Returns true if the acroResult has at least one non-signature field AND
   * ACROFORM_EXTRACTION_ENABLED is not explicitly 'false'.
   */
  private hasDataFields(acroResult: AcroFormExtractionResult): boolean {
    if (process.env.ACROFORM_EXTRACTION_ENABLED === 'false') return false;
    return acroResult.fields.some((f) => f.type !== 'signature');
  }

  /**
   * AcroFormMapper only knows RPA's own field vocabulary (purchase price,
   * earnest money, buyer/seller signatures, etc.) and always reports
   * `formCode: 'RPA'` — it has no way to represent any other form. Having
   * fillable AcroForm fields is not enough to prove a PDF actually is an
   * RPA: any fillable disclosure (AVID, TDS, SPQ, ...) satisfies
   * hasDataFields() too and would otherwise be silently mistagged as RPA.
   * This checks the PDF's own page-1 printed text via the same deterministic
   * identifier the page-routing pipeline (Step 2) uses, and only green-lights
   * the AcroForm fast path when the page is genuinely RPA-family or printed-
   * text identification is inconclusive (preserving today's behavior for
   * RPA exports whose printed text layer is too sparse to classify) — a
   * confidently-identified non-RPA-family form always falls through to Step 2
   * instead, where it's classified and validated as itself.
   */
  private async acroFormLooksLikeRpaFamily(pdfBuffer: Buffer): Promise<boolean> {
    const identified = await identifyPdfFirstPage(pdfBuffer);
    if (!identified) return true;
    return RPA_FAMILY_FORM_CODES.has(identified.formCode);
  }

  /**
   * Detect the primary form code from extraction result. Used when no
   * identifier-derived form code is available (the AcroForm branch, and the
   * basic-LLM-extraction fallback when the page-routing identifier found no
   * usable form group at all) — see primaryIdentifiedFormCode in process()
   * for the page-routing branch's own, more direct source.
   */
  private detectPrimaryFormCode(extraction: ExtractionResult): string | null {
    const forms = extraction.formsAndDisclosures ?? [];
    for (const status of ['attached', 'referenced'] as const) {
      const match = forms.find(
        (f) => f.status === status && f.formCode && f.formCode !== 'UNKNOWN',
      );
      if (match?.formCode) return match.formCode.toUpperCase();
    }
    const docType = (extraction.documentType ?? '').toUpperCase();
    if (docType) {
      const byCode = getCarForm(docType);
      if (byCode) return byCode.code;
    }
    // Standalone disclosure/advisory extractions (BIA, BCA, FHDA, etc.) carry
    // their own form code at header.form_code — a field that only exists on
    // that extraction schema, never on the RPA/contract-family shape checked
    // above, so it's safe to check last as a catch-all rather than a
    // higher-priority source. No getCarForm() gate — same reasoning as
    // primaryIdentifiedFormCode in process(): the extraction schema's own
    // form_code is a constrained, known value (from that form's own
    // extractor template), not free text, and the car-forms metadata catalog
    // doesn't list every form the extractor layer knows about (e.g. BCA).
    const headerFormCode = ((extraction as unknown as { header?: { form_code?: string | null } }).header?.form_code ?? '').toUpperCase();
    if (headerFormCode && headerFormCode !== 'UNKNOWN') {
      return headerFormCode;
    }
    return null;
  }

  /** Map form code to the correct transaction stage. */
  private resolveStageFromFormCode(formCode: string | null): string | null {
    if (!formCode) return null;
    const form = getCarForm(formCode.toUpperCase());
    if (!form) return null;

    const CATEGORY_TO_STAGE: Record<string, string> = {
      purchase_agreement:      'contract',
      counter_offer:           'contract',
      disclosure:              'disclosures',
      advisory:                'disclosures',
      federal_compliance:      'disclosures',
      addendum:                'contract',
      contingency_performance: 'inspection',
      inspection_repair:       'inspection',
      finance:                 'loan',
      commercial:              'contract',
      lease_rental:            'intake',
      probate_estate:          'disclosures',
      new_construction:        'contract',
      property_management:     'intake',
    };

    // Per-form overrides
    if (formCode === 'PEAD') return 'closing';
    if (formCode === 'WCI') return 'closing';

    return CATEGORY_TO_STAGE[form.category] ?? 'disclosures';
  }

  /** Map form code to a readable document type string. */
  private formCodeToDocumentType(formCode: string | null): string | null {
    if (!formCode) return null;
    const form = getCarForm(formCode);
    if (!form) return null;

    const CATEGORY_TO_DOC_TYPE: Record<string, string> = {
      purchase_agreement:      'purchase_agreement',
      counter_offer:           'purchase_agreement',
      disclosure:              'disclosure',
      advisory:                'disclosure',
      federal_compliance:      'disclosure',
      addendum:                'addendum',
      contingency_performance: 'inspection_report',
      inspection_repair:       'inspection_report',
      finance:                 'loan',
      escrow_related:          'escrow',
      title_related:           'escrow',
      hoa_related:             'escrow',
    };

    return CATEGORY_TO_DOC_TYPE[form.category] ?? 'general';
  }
}
