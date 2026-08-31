import {
  Controller,
  Post,
  Get,
  Sse,
  MessageEvent,
  Param,
  UploadedFiles,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
  ServiceUnavailableException,
  Body,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Observable, interval, map } from 'rxjs';
import { ExtractionJobStore } from './extraction-job.store';
import { PendingUploadsService } from './pending-uploads.service';
import { FilesInterceptor, FileInterceptor } from '@nestjs/platform-express';
import { DocumentExtractionService, ExtractionWithInteraction } from './document-extraction.service';
import { AcroFormExtractorService, type AcroFormExtractionResult } from './acroform-extractor.service';
import { AcroFormExtractionMapper } from './acroform-extraction-mapper.service';
import { RpaComplianceValidator } from './rpa-compliance.validator';
import { DocumentPipelineService, RPA_FAMILY_FORM_CODES } from './document-pipeline.service';
import { ExtractionResult } from './extraction-result.types';
import type { ComplianceResult } from './compliance-result.types';
import type { FormExtractionOutput, ExtractionProgressEvent } from '@tc/document-intelligence';
import { TransactionDraftService, DraftTransactionResult } from '../transactions/transaction-draft.service';
import { TransactionsService } from '../transactions/transactions.service';
import { CoordinatorSide } from '../transactions/entities/transaction.entity';
import { TRANSACTION_FEATURES } from '@tc/shared';
import { AiInteractionsService } from '../ai-interactions/ai-interactions.service';
import { AiInteractionStatus } from '../ai-interactions/entities/ai-interaction.entity';
import { S3StorageService } from '../storage/s3-storage.service';
import { TransactionDocumentsService } from '../transaction-documents/transaction-documents.service';
import { TransactionDocumentEntity, DocumentStatus } from '../transaction-documents/entities/transaction-document.entity';
import { TransactionPartyEntity } from '../transaction-parties/entities/transaction-party.entity';
import { TransactionMessageEntity, MessageChannel, MessageDirection, MessageStatus } from '../transaction-messages/entities/transaction-message.entity';
import { PageRoutingPipelineService } from './page-routing-pipeline.service';
import { DocumentFormSplitterService } from './document-form-splitter.service';
import type { PageRoutingPipelineResult } from './page-routing.types';
import { StageReasoningService, type StageReasoningResult } from './stage-reasoning.service';
import type { BatchProgressJson, BatchUploadResult, BatchFileProgress } from './batch-upload.types';
import { JwtService } from '@nestjs/jwt';
import { Public } from '../auth/decorators/public.decorator';
import { MailgunService } from '../auth/mailgun.service';
import { AccountsService } from '../accounts/accounts.service';
import { RepairRequestsService } from '../repair-requests/repair-requests.service';
import { VerificationOfPropertyService } from '../verification-of-property/verification-of-property.service';
import { TransactionStageInstancesService } from '../transactions/transaction-stage-instances.service';
import { TransactionWelcomeEmailService } from '../transactions/transaction-welcome-email.service';
import { EventSeederService } from '../transactions/event-seeder.service';
import { getCarForm, FormCategory } from '../transaction-form-templates/metadata/car-forms.metadata';
import {
  resolveFormDefinition,
  compareRpaExtractions,
  compareScoExtractions,
  isMaterialChange,
  getFamilyForFormCode,
  findLatestInFamily,
  normalizeToExtractionResult,
  normalizeContractDocument,
  validateContractChain,
  enrichDocumentsWithGeminiContingency,
  enrichDocumentsWithFieldRegionCrops,
  resolveFinalNegotiatedTerms,
  RenderedPageCache,
  GeminiProvider,
  normalizeContractFormCode,
  isContractFormCode,
  type FormComparisonResult,
  type FormExtractionResult,
  type ContractDocumentExtraction,
  type FinalTermsInputDocument,
} from '@tc/document-intelligence';

/**
 * Builds the minimal FinalTermsInputDocument[] the shared resolver needs
 * from freshly-extracted (not-yet-persisted) contract documents — there is
 * no TransactionDocumentEntity id/versionNo yet at this point in the upload
 * flow, so a stable per-document identifier (fileName) stands in; nothing
 * downstream of this call reads documentId/versionNo for anything other
 * than attribution display, which isn't consumed here.
 */
function toFinalTermsInputDocuments(contractDocuments: ContractDocumentExtraction[]): FinalTermsInputDocument[] {
  return contractDocuments.map((document) => ({
    document,
    documentId: document.documentId ?? document.fileName,
    versionNo: 1,
  }));
}

export interface DraftWithComplianceResult extends DraftTransactionResult {
  compliance: ComplianceResult;
  /** When true, a duplicate was detected — no new draft was created. */
  duplicate?: boolean;
  /** The existing draft's transaction ID (only set when duplicate=true). */
  existingTransactionId?: string;
  /** All document rows created during this upload, including non-RPA forms. */
  documents?: TransactionDocumentEntity[];
}

export interface ComplianceCheckResult {
  /** Whether the PDF had AcroForm fields (digital) or was image-based (scanned) */
  pdfType: 'digital_acroform' | 'scanned_or_flattened';
  extractionResult: ExtractionResult;
  compliance: ComplianceResult;
}

export interface UploadAndExtractResult {
  /** Core document/extraction fields. Not set when requiresConfirmation=true. */
  document?: TransactionDocumentEntity;
  extraction?: ExtractionResult;
  compliance?: ComplianceResult;
  pdfType?: 'digital_acroform' | 'scanned_or_flattened';

  /** Stage the user submitted the document to (may differ from where it was stored). */
  submittedStage: string;
  /** Stage the document was actually stored under (may differ from the submitted stage). */
  resolvedStage: string;
  /** Document type stored on the record. */
  resolvedDocumentType: string;
  /** True when the document was automatically moved to a different stage than submitted. */
  reclassified: boolean;
  /** CAR form code that was detected (e.g. 'RPA', 'TDS', 'SPQ'). Null if no recognized form. */
  detectedFormCode: string | null;
  /** Human-readable form name if a known CAR form was detected, e.g. "Request for Repair". */
  detectedFormName: string | null;
  /**
   * Stage reasoning result, when decision forms were present and reasoning ran.
   * Null when the uploaded form was compliance-only or the stage has no reasoning definition.
   * Not set when requiresConfirmation=true.
   */
  reasoning?: StageReasoningResult | null;

  /**
   * When true, the upload requires user confirmation before the document is created.
   * The server has already uploaded to S3 and extracted data, but is waiting for the
   * user to confirm that they want to supersede the existing document.
   * Use `pendingUploadId` with `confirm-upload` or `cancel-upload` endpoints.
   */
  requiresConfirmation?: boolean;
  /** ID for the pending upload — used with confirm-upload / cancel-upload. */
  pendingUploadId?: string;
  /** Info about the existing document that will be superseded (only when requiresConfirmation=true). */
  existingDocInfo?: {
    id: string;
    formCode: string | null;
    formName: string | null;
    versionNo: number;
    uploadedAt: Date;
  };

  /** True when a previous version of this form existed for the same transaction+stage. */
  hasPreviousVersion: boolean;
  /** ID of the previous version document (if hasPreviousVersion is true). */
  previousVersionId: string | null;
  /** Version number of this document (1 for first version, increments on re-upload). */
  versionNo?: number;

  /** Comparison result between new extraction and previous version (if any). */
  versionComparison: FormComparisonResult | null;
  /**
   * Suggested action based on form criticality and comparison result:
   * - 'none': no previous version or no changes
   * - 'superseded': minor changes or non-critical form, old version marked as superseded
   * - 'void_suggested': material changes on critical form — UI should suggest voiding previous
   */
  versionAction: 'none' | 'superseded' | 'void_suggested';
}

/**
 * Builds a ContractDocumentExtraction from an ExtractionResult.
 * Used for AcroForm and mock extraction paths where no FormExtractionResult
 * is available (normalizeContractDocument requires a FormExtractionResult).
 */
function buildRpaContractDocument(
  result: ExtractionResult,
  fileName: string,
): ContractDocumentExtraction {
  const sig = result.signatures;
  return {
    documentId: null,
    fileName,
    documentType: 'RPA',
    counterNumber: 0,
    sequenceOrder: 1,
    referencedFormCode: null,
    referencedCounterOfferNumber: null,
    extractedTerms: {
      formRevision: null,
      formRevisionLabel: null,
      datePrepared: null,
      offerDate: result.transaction.offerDate ?? null,
      acceptanceDate: result.transaction.acceptanceDate ?? null,
      expirationDate: null,
      buyerName: result.parties?.buyers?.[0]?.fullName ?? null,
      sellerName: result.parties?.sellers?.[0]?.fullName ?? null,
      propertyAddress: result.property.streetAddress ?? null,
      purchasePrice: result.transaction.purchasePrice ?? null,
      initialDeposit: result.transaction.earnestMoneyAmount ?? null,
      closeOfEscrow: result.transaction.closingDate ?? null,
      sellerCreditToBuyer: null,
      buyerBrokerCompensation: null,
      loanContingency: null,
      appraisalContingency: null,
      inspectionContingency: null,
      insuranceContingency: null,
      sellerDocumentReview: null,
      titleReview: null,
      hoaReview: null,
      possession: result.transaction.possessionDate ?? null,
      otherTerms: null,
      otherTermsOverrides: null,
      signatures: {
        buyerSigned: sig.buyerSigned,
        sellerSigned: sig.sellerSigned,
        buyerSignedDate: null,
        sellerSignedDate: null,
      },
    },
  };
}

@Controller('document-extraction')
export class DocumentExtractionController {
  private readonly logger = new Logger(DocumentExtractionController.name);

  constructor(
    private readonly documentExtractionService: DocumentExtractionService,
    private readonly acroFormExtractorService: AcroFormExtractorService,
    private readonly acroFormExtractionMapper: AcroFormExtractionMapper,
    private readonly rpaComplianceValidator: RpaComplianceValidator,
    private readonly documentPipelineService: DocumentPipelineService,
    private readonly transactionDraftService: TransactionDraftService,
    private readonly aiInteractionsService: AiInteractionsService,
    private readonly s3: S3StorageService,
    private readonly documentsService: TransactionDocumentsService,
    private readonly pageRoutingPipeline: PageRoutingPipelineService,
    private readonly formSplitter: DocumentFormSplitterService,
    private readonly stageReasoning: StageReasoningService,
    private readonly jobStore: ExtractionJobStore,
    private readonly jwtService: JwtService,
    private readonly mailgunService: MailgunService,
    private readonly transactionsService: TransactionsService,
    private readonly pendingUploadsService: PendingUploadsService,
    private readonly repairRequestsService: RepairRequestsService,
    private readonly vpService: VerificationOfPropertyService,
    private readonly stageInstancesService: TransactionStageInstancesService,
    private readonly accountsService: AccountsService,
    private readonly welcomeEmailService: TransactionWelcomeEmailService,
    private readonly eventSeederService: EventSeederService,
    @InjectRepository(TransactionPartyEntity)
    private readonly partyRepo: Repository<TransactionPartyEntity>,
    @InjectRepository(TransactionMessageEntity)
    private readonly messageRepo: Repository<TransactionMessageEntity>,
  ) {}

  /** Extract structured data from one or more PDFs — does not create any records. */
  @Post('extract')
  @UseInterceptors(FilesInterceptor('files', 10, { limits: { fileSize: 25 * 1024 * 1024 } }))
  async extract(
    @UploadedFiles() files: Express.Multer.File[],
  ): Promise<ExtractionWithInteraction> {
    if (!files || files.length === 0) {
      throw new BadRequestException('At least one PDF file is required');
    }
    return this.documentExtractionService.extractFromPdfs(files);
  }

  /**
   * Run compliance validation on uploaded PDF(s).
   *
   * Automatically selects the right path:
   *  - Digital/fillable PDFs with AcroForm fields → pdf-lib field extraction → rule engine
   *  - Scanned/flattened PDFs (no AcroForm) → Claude LLM extraction → rule engine
   *
   * Both paths produce the same ComplianceResult shape.
   */
  @Post('compliance-check')
  @UseInterceptors(FilesInterceptor('files', 10, { limits: { fileSize: 25 * 1024 * 1024 } }))
  async complianceCheck(
    @UploadedFiles() files: Express.Multer.File[],
  ): Promise<ComplianceCheckResult> {
    if (!files || files.length === 0) {
      throw new BadRequestException('At least one PDF file is required');
    }

    // Check the first file to determine PDF type
    const firstBuffer = files[0].buffer;
    const acroResult = await this.acroFormExtractorService.extract(firstBuffer);

    if (acroResult.hasAcroForm && this.hasDataFields(acroResult)) {
      // Digital/fillable PDF — validate directly from AcroForm fields (fast, no LLM cost)
      this.logger.log(`Compliance check via AcroForm: ${acroResult.fieldCount} fields`);
      const compliance = this.rpaComplianceValidator.fromAcroForm(acroResult);

      // Still run LLM extraction for full ExtractionResult (needed for response shape)
      const { result: extractionResult } = await this.documentExtractionService.extractFromPdfs(files);
      return { pdfType: 'digital_acroform', extractionResult, compliance };
    }

    // Scanned/flattened PDF — must use LLM; derive compliance from LLM output
    this.logger.log('Compliance check via LLM extraction (scanned or flattened PDF)');
    const { result: extractionResult } = await this.documentExtractionService.extractFromPdfs(files);
    const compliance = this.rpaComplianceValidator.fromLlmExtraction(extractionResult);
    return { pdfType: 'scanned_or_flattened', extractionResult, compliance };
  }

  /**
   * Debug endpoint: upload a PDF and see exactly what the pipeline classifies and
   * extracts. No transactions or documents are created. Returns the raw pipeline
   * result for inspection.
   */
  @Public()
  @Post('debug-pipeline')
  @UseInterceptors(FilesInterceptor('files', 10, { limits: { fileSize: 25 * 1024 * 1024 } }))
  async debugPipeline(@UploadedFiles() files: Express.Multer.File[]): Promise<{
    totalPages: number;
    classifications: { pageNumber: number | null; formCodes: string[]; confidence: number }[];
    formGroups: { formCode: string; pageIndices: number[] }[];
    extractions: { formCode: string; formName: string | null; pageIndices: number[]; hasOutput: boolean; error?: string }[];
  }> {
    if (!files || files.length === 0) throw new BadRequestException('At least one PDF file is required');
    const mergedPdf = await this.mergePdfBuffers(files.map(f => f.buffer));
    const result = await this.pageRoutingPipeline.process(mergedPdf, undefined, undefined, undefined, 'CONTRACT');
    return {
      totalPages: result.totalPages,
      classifications: result.classifications.map(c => ({
        pageNumber: c.pageNumber, formCodes: c.formCodes, confidence: c.confidence,
      })),
      formGroups: result.formGroups.map(g => ({
        formCode: g.formCode, pageIndices: g.pageIndices,
      })),
      extractions: result.extractions.map(e => ({
        formCode: e.formCode, formName: e.formName, pageIndices: e.pageIndices,
        hasOutput: e.output !== null, error: e.error,
      })),
    };
  }

  /**
   * Extract from uploaded contract PDF(s), run compliance validation, and create
   * a draft transaction. Returns the draft transaction, extraction result, and
   * compliance report for the review screen.
   *
   * Extraction strategy — AcroForm first, LLM fallback:
   *   1. If the PDF has AcroForm fields (digital/fillable) → map fields directly to
   *      ExtractionResult. No LLM call, no token cost.
   *   2. If the PDF is scanned/flattened (no AcroForm) → fall back to Claude LLM extraction.
   *
   * Duplicate check:
   *   If a transaction for the same property address already exists within this
   *   organization, a 409 Conflict is returned. The org scope is intentional — a buyer
   *   who switches to a different brokerage should be able to create a new transaction
   *   with their new org for the same property.
   *
   * TODO: replace organizationId / createdByAccountId body fields with JWT session
   *       once auth guards are wired up on this endpoint.
   */
  @Post('extract-and-draft')
  @UseInterceptors(FilesInterceptor('files', 10, { limits: { fileSize: 25 * 1024 * 1024 } }))
  async extractAndDraft(
    @UploadedFiles() files: Express.Multer.File[],
    @Body('organizationId') organizationId: string,
    @Body('createdByAccountId') createdByAccountId: string,
    @Body('formTemplateId') formTemplateId?: string,
    @Body('mockExtractions') mockExtractionsRaw?: string,
    @Body('transactionSide') transactionSide?: string,
  ): Promise<DraftWithComplianceResult> {
    if (!files || files.length === 0) {
      throw new BadRequestException('At least one PDF file is required');
    }
    if (!organizationId || !createdByAccountId) {
      throw new BadRequestException('organizationId and createdByAccountId are required');
    }
    // Fail fast — reject a locked Seller Side request before running the
    // (expensive) extraction pipeline below.
    const resolvedTransactionSide = this.normalizeTransactionSide(transactionSide);

    // ── Step 1: extraction — AcroForm first, LLM fallback ─────────────────────
    let extraction!: ExtractionResult;
    let interaction!: import('../ai-interactions/entities/ai-interaction.entity').AiInteractionEntity;
    let compliance!: ComplianceResult;
    let contractDocuments: ContractDocumentExtraction[] | undefined;
    let allExtractions: FormExtractionResult[] | undefined;
    let extractionFileMap: Map<FormExtractionResult, string> | undefined;

    const acroResult = await this.acroFormExtractorService.extract(files[0].buffer);

    if (acroResult.hasAcroForm && this.hasDataFields(acroResult)) {
      // Digital/fillable PDF — read directly from AcroForm fields (no LLM cost)
      this.logger.log(`AcroForm extraction: ${acroResult.fieldCount} fields from ${acroResult.pageCount}-page PDF`);
      extraction = this.acroFormExtractionMapper.map(acroResult);
      compliance = this.rpaComplianceValidator.fromAcroForm(acroResult);

      // Save an ai_interactions row with modelName 'acroform' for audit trail
      interaction = await this.aiInteractionsService.create({
        modelName: 'acroform',
        feature: 'contract_extraction',
        promptText: 'acroform_field_extraction',
        responseText: JSON.stringify(extraction),
        promptTokens: 0,
        completionTokens: 0,
        status: AiInteractionStatus.SUCCESS,
        metadataJson: { extraction: extraction as unknown as Record<string, unknown> },
      });
      contractDocuments = [buildRpaContractDocument(extraction, files[0].originalname)];
    } else {
      // Scanned/flattened PDF — use mock if provided, else LLM extraction
    const parsedMocks = this.parseMockExtractions(mockExtractionsRaw);
    if (parsedMocks) {
        const firstCode = Object.keys(parsedMocks)[0];
        extraction = parsedMocks[firstCode] as ExtractionResult;
        this.logger.log(`No AcroForm — using mock extraction for ${firstCode}`);
        interaction = await this.aiInteractionsService.create({
          modelName: 'mock',
          feature: 'contract_extraction',
          promptText: 'mock_extraction',
          responseText: JSON.stringify(extraction),
          promptTokens: 0,
          completionTokens: 0,
          status: AiInteractionStatus.SUCCESS,
          metadataJson: { extraction: extraction as unknown as Record<string, unknown> },
        });
        compliance = this.rpaComplianceValidator.fromLlmExtraction(extraction);
        contractDocuments = [buildRpaContractDocument(extraction, files[0].originalname)];
      } else {
        // Process each uploaded file separately through the pipeline so that
        // multiple forms of the same type (e.g. SCO1, SCO2) each produce their
        // own distinct extraction instead of being merged into one group.
        let pipelineOk = false;
        allExtractions = [];
        extractionFileMap = new Map<FormExtractionResult, string>();
        const pageBuffersByFileName = new Map<string, Buffer>();
        let providerFailure: string | null = null;
        for (const file of files) {
          try {
            // Decrypt encrypted PDFs (e.g. RC4-encrypted SCO forms) before
            // sending to the pipeline, since pdf-lib's ignoreEncryption in the
            // splitter produces garbled content streams for encrypted PDFs.
            const decrypted = await this.decryptPdfIfNeeded(file.buffer);
            if (file.originalname) pageBuffersByFileName.set(file.originalname, decrypted);
            const result = await this.pageRoutingPipeline.process(decrypted);
            for (const fe of result.extractions) {
              allExtractions.push(fe);
              extractionFileMap.set(fe, file.originalname ?? `${fe.formCode}.pdf`);
            }
            providerFailure ??= this.detectExtractionProviderFailure(result);
          } catch (e) {
            this.logger.warn(`Pipeline extraction failed for ${file.originalname}: ${(e as Error).message}`);
          }
        }
        // The classifier failing to run (rate limit, quota, auth, network) is not
        // the same thing as "this document isn't an RPA" — surface it as such
        // instead of cascading through fallbacks that will fail the same way and
        // end up blaming the document.
        if (providerFailure) {
          throw new ServiceUnavailableException({
            code: 'EXTRACTION_SERVICE_UNAVAILABLE',
            message:
              `Document analysis is temporarily unavailable — the AI extraction service returned an error ` +
              `("${providerFailure}"). This is not a problem with your document. Please try again in a few minutes.`,
          });
        }
        if (allExtractions.length > 0) {
          this.logger.log(
            `Pipeline extractions (per-file): ${allExtractions.map(e =>
              `${e.formCode}(${e.pageIndices.length}pgs,${e.output?'ok':'null'})`
            ).join(', ')}`
          );
          const rpaExtraction = allExtractions.find(
            (e) => normalizeContractFormCode(e.formCode) === 'RPA' && e.output,
          );
          if (rpaExtraction?.output) {
            const normalized = normalizeToExtractionResult(rpaExtraction.output.data);
            if (normalized) {
              extraction = normalized;
              // ── Capture per-document contract extractions ───────────────
              const contractFormCodes = new Set(['RPA', 'SCO', 'BCO', 'SMCO', 'BMCO']);
              let seq = 1;
              contractDocuments = [];
              for (const fe of allExtractions) {
                const normalizedCode = normalizeContractFormCode(fe.formCode);
                if (normalizedCode && contractFormCodes.has(normalizedCode)) {
                  const fileName = extractionFileMap.get(fe) ?? `${fe.formCode}.pdf`;
                  const cd = normalizeContractDocument(fe, fileName, seq++);
                  if (cd) contractDocuments.push(cd);
                }
              }
              if (contractDocuments.length > 1) {
                this.logger.log(`Captured ${contractDocuments.length} contract document(s) for timeline review`);
              }

              // ── Gemini-based contingency extraction from Other Terms ───
              const geminiKey = process.env.GEMINI_API_KEY;
              if (geminiKey && contractDocuments.length > 0) {
                try {
                  await enrichDocumentsWithGeminiContingency(contractDocuments, geminiKey);
                  this.logger.log('Gemini contingency extraction enriched contract documents');
                } catch (err: unknown) {
                  this.logger.warn(`Gemini contingency extraction failed: ${(err as Error).message}`);
                }
              }

              // ── Targeted field-region crop corroboration (SCO/BCO/SMCO/BMCO) ──
              // Independent secondary signal only — reconcileFieldWithCrop never
              // overwrites an already-present, disagreeing extracted value.
              if (geminiKey && contractDocuments.length > 0 && pageBuffersByFileName.size > 0) {
                try {
                  const cropCache = new RenderedPageCache({ dpi: 200 });
                  const cropProvider = new GeminiProvider(geminiKey);
                  await enrichDocumentsWithFieldRegionCrops(contractDocuments, pageBuffersByFileName, cropCache, cropProvider);
                } catch (err: unknown) {
                  this.logger.warn(`Field-region crop enrichment failed: ${(err as Error).message}`);
                }
              }

              // ── Resolve final terms from negotiation chain ──────────────
              const chainResult = validateContractChain(contractDocuments, allExtractions);
              const finalTerms = resolveFinalNegotiatedTerms(toFinalTermsInputDocuments(contractDocuments), { extractions: allExtractions });
              const finalValueByKey = new Map(finalTerms.valueTerms.map((t) => [t.key, t.value]));
              if (finalTerms.acceptanceDate) {
                extraction.transaction.acceptanceDate = finalTerms.acceptanceDate;
                this.logger.log(
                  `Acceptance date resolved from ${chainResult.finalDocumentType}: ${finalTerms.acceptanceDate}`,
                );
              }
              const finalPurchasePrice = finalValueByKey.get('purchasePrice') as number | undefined;
              if (finalPurchasePrice != null) {
                extraction.transaction.purchasePrice = finalPurchasePrice;
                this.logger.log(
                  `Purchase price resolved from ${chainResult.finalDocumentType}: $${finalPurchasePrice.toLocaleString()}`,
                );
              }
              if (chainResult.warnings.length > 0) {
                this.logger.warn(`Contract chain warnings: ${chainResult.warnings.join('; ')}`);
              }
              const finalCloseOfEscrow = finalValueByKey.get('closeOfEscrow') as string | undefined;
              if (finalCloseOfEscrow) {
                extraction.transaction.closingDate = finalCloseOfEscrow;
                this.logger.log(
                  `Close of escrow resolved from chain: ${finalCloseOfEscrow}`,
                );
              }
              const finalPossession = finalValueByKey.get('possession') as string | undefined;
              if (finalPossession) {
                extraction.transaction.possessionDate = finalPossession;
              }
              if (!extraction.transaction.possessionDate && extraction.transaction.closingDate) {
                extraction.transaction.possessionDate = extraction.transaction.closingDate;
              }

              interaction = await this.aiInteractionsService.create({
                modelName: rpaExtraction.output.modelName ?? 'unknown',
                feature: 'contract_extraction',
                promptText: 'page_routing_extraction',
                responseText: rpaExtraction.output.rawResponse,
                promptTokens: rpaExtraction.output.promptTokens ?? undefined,
                completionTokens: rpaExtraction.output.completionTokens ?? undefined,
                status: AiInteractionStatus.SUCCESS,
                metadataJson: { extraction: extraction as unknown as Record<string, unknown> },
              });
              compliance = this.rpaComplianceValidator.fromLlmExtraction(
                extraction,
                contractDocuments,
                allExtractions,
              );
              pipelineOk = true;
            }
          }
        }
        if (!pipelineOk) {
          this.logger.log('Pipeline did not produce RPA extraction — trying explicit RPA extraction');
          const llmResult = await this.documentExtractionService.extractFromPdfs(files, 'RPA');
          const normalized = normalizeToExtractionResult(llmResult.result as unknown as Record<string, unknown>);
          if (normalized && (
            normalized.transaction.purchasePrice ||
            normalized.transaction.acceptanceDate ||
            normalized.parties?.buyers?.length ||
            normalized.parties?.sellers?.length ||
            normalized.property?.streetAddress
          )) {
            extraction = normalized;
            interaction = llmResult.interaction;
            compliance = this.rpaComplianceValidator.fromLlmExtraction(extraction);
          } else {
            this.logger.log('RPA extraction produced no meaningful data — using generic LLM');
            const genericResult = await this.documentExtractionService.extractFromPdfs(files);
            const normalizedGeneric = normalizeToExtractionResult(genericResult.result as unknown as Record<string, unknown>);
            extraction = normalizedGeneric ?? genericResult.result;
            interaction = genericResult.interaction;
            compliance = this.rpaComplianceValidator.fromLlmExtraction(extraction);
          }
        }
      }
    }

    // ── Step 1b: RPA gate ─────────────────────────────────────────────────────
    // A transaction cannot be initiated without a signed Residential Purchase Agreement.
    if (!this.isRpaDocument(extraction)) {
      throw new UnprocessableEntityException({
        code: 'RPA_NOT_FOUND',
        documentType: extraction.documentType,
        message:
          `No Residential Purchase Agreement (RPA) was detected in the uploaded document(s). ` +
          `The document appears to be "${extraction.documentType ?? 'an unrecognized document type'}". ` +
          `A signed RPA is required to initiate a buyer-side transaction.`,
      });
    }

    // ── Step 2: duplicate check (address + org) ────────────────────────────────
    if (extraction.property.streetAddress) {
      const existing = await this.transactionDraftService.findDuplicateByAddressAndOrg(
        extraction.property.streetAddress,
        organizationId,
      );
      if (existing) {
        this.logger.log(`Duplicate detected — existing draft ${existing.id} for ${extraction.property.streetAddress}`);
        return {
          duplicate: true,
          existingTransactionId: existing.id,
          extractionResult: extraction,
          compliance,
          contractDocuments,
        } as DraftWithComplianceResult;
      }
    }

    // ── Step 3: create draft transaction ──────────────────────────────────────
    const draft = await this.transactionDraftService.createFromExtraction(
      extraction, interaction, compliance, organizationId, createdByAccountId, formTemplateId, contractDocuments,
      resolvedTransactionSide,
    );

    // ── Step 4: upload all PDFs to S3 ────────────────────────────────────────
    // Each uploaded file is stored once as an original-package audit record.
    // Separated per-form PDFs are derived from these sources and become the
    // primary documents used throughout the system (view, download, DocuSign, etc.).
    const txId = draft.transaction.id;
    const allFiles: { file: Express.Multer.File; storageKey: string | null }[] =
      files.map((f) => ({ file: f, storageKey: null }));

    await Promise.all(allFiles.map(async (entry) => {
      try {
        const result = await this.s3.upload(
          txId, 'contract', entry.file.originalname, entry.file.buffer, entry.file.mimetype,
        );
        entry.storageKey = result.storageKey;
      } catch (err) {
        this.logger.error(`S3 upload failed for ${entry.file.originalname}: ${(err as Error).message}`);
      }
    }));

    // Create isOriginalPackage audit record(s) for the combined upload(s)
    const createdDocs: TransactionDocumentEntity[] = [draft.document];
    const fileBuffers = new Map<string, Buffer>();
    for (const entry of allFiles) {
      fileBuffers.set(entry.file.originalname, entry.file.buffer);
    }

    await this.createOriginalAndSeparatedForms({
      allFiles,
      fileBuffers,
      allExtractions: allExtractions ?? [],
      extractionFileMap: extractionFileMap ?? new Map(),
      transactionId: txId,
      primaryDocId: draft.document.id,
      primaryFormCode: 'RPA',
      stage: 'contract',
      createdDocs,
    });

    await this.notifyTcOnCompletion(draft, createdByAccountId).catch((err) => {
      this.logger.warn(`Failed to send completion email: ${(err as Error).message}`);
    });

    return { ...draft, compliance, documents: createdDocs };
  }

  /**
   * Same as extractAndDraft but returns immediately with a jobId, streams
   * progress via SSE at GET extract-and-draft-routed/:jobId/progress, and
   * exposes the result at GET extract-and-draft-routed/:jobId/result.
   *
   * Progress stages:
   *    0-5%   — starting / AcroForm check
   *    5-60%  — pipeline extraction (maps pipeline onProgress events)
   *    60-75% — normalizing, resolving chain, compliance
   *    75-85% — duplicate check
   *    85-95% — creating draft + S3 upload
   *   100%    — complete
   */
  @Post('extract-and-draft-routed')
  @UseInterceptors(FilesInterceptor('files', 10, { limits: { fileSize: 25 * 1024 * 1024 } }))
  async extractAndDraftRouted(
    @UploadedFiles() files: Express.Multer.File[],
    @Body('organizationId') organizationId: string,
    @Body('createdByAccountId') createdByAccountId: string,
    @Body('formTemplateId') formTemplateId?: string,
    @Body('mockExtractions') mockExtractionsRaw?: string,
    @Body('transactionSide') transactionSide?: string,
  ): Promise<{ jobId: string }> {
    if (!files || files.length === 0) {
      throw new BadRequestException('At least one PDF file is required');
    }
    if (!organizationId || !createdByAccountId) {
      throw new BadRequestException('organizationId and createdByAccountId are required');
    }
    // Fail fast — reject a locked Seller Side request before creating a job.
    const resolvedTransactionSide = this.normalizeTransactionSide(transactionSide);

    const jobId = randomUUID();
    await this.jobStore.createWithTimeout(jobId);

    this.runExtractAndDraftRouted(jobId, files, organizationId, createdByAccountId, formTemplateId, mockExtractionsRaw, resolvedTransactionSide)
      .then(async (result) => {
        try {
          await this.jobStore.completeDraft(jobId, result);
          // A duplicate-detected result has no `.transaction` — no new draft was
          // created, so there is nothing to notify the TC about (mirrors the
          // synchronous extractAndDraft, which returns before ever reaching its
          // own notifyTcOnCompletion call in this same situation).
          if (!result.duplicate) {
            await this.notifyTcOnCompletion(result, createdByAccountId).catch((err) => {
              this.logger.warn(`Failed to send completion email: ${(err as Error).message}`);
            });
          }
        } catch (e) {
          this.logger.error(`Failed to complete job ${jobId}: ${(e as Error).message}`);
        }
      })
      .catch(async (err: Error) => {
        this.logger.error(`Extraction job ${jobId} failed: ${err.message}`);
        try {
          if (err instanceof UnprocessableEntityException || err instanceof ServiceUnavailableException) {
            const response = err.getResponse() as { code?: string; message?: string; documentType?: string | null };
            await this.jobStore.fail(jobId, response.message ?? err.message, {
              code: response.code,
              documentType: response.documentType,
            });
          } else {
            await this.jobStore.fail(jobId, err.message);
          }
          await this.notifyTcOnFailure(err.message, createdByAccountId).catch((e2) => {
            this.logger.warn(`Failed to send failure email: ${(e2 as Error).message}`);
          });
        } catch (e) {
          this.logger.error(`Failed to persist failure for job ${jobId}: ${(e as Error).message}`);
        }
      });

    return { jobId };
  }

  /**
   * SSE stream for extract-and-draft-routed progress.
   * Polls the database every 1s and emits new progress events as they arrive.
   * Public because EventSource cannot send custom headers (no Bearer token).
   */
  @Public()
  @Sse('extract-and-draft-routed/:jobId/progress')
  streamDraftProgress(@Param('jobId') jobId: string): Observable<MessageEvent> {
    return new Observable<MessageEvent>((observer) => {
      let lastVersion = -1;
      let disposed = false;

      async function poll(jobStore: ExtractionJobStore) {
        if (disposed) return;
        try {
          const job = await jobStore.get(jobId);
          if (!job) {
            observer.next({ data: { stage: 'error', message: `Job ${jobId} not found`, percent: 0 } } as MessageEvent);
            observer.complete();
            return;
          }

          if (job.status === 'complete') {
            if (job.progress?.stage !== 'complete' || job.progressVersion > lastVersion) {
              observer.next({ data: { stage: 'complete', message: 'Draft created', percent: 100 } } as MessageEvent);
            }
            observer.complete();
            return;
          }

          if (job.status === 'error') {
            if (job.progressVersion > lastVersion && job.progress) {
              lastVersion = job.progressVersion;
              observer.next({ data: job.progress } as MessageEvent);
            }
            observer.complete();
            return;
          }

          if (job.progressVersion > lastVersion) {
            lastVersion = job.progressVersion;
            if (job.progress) {
              observer.next({ data: job.progress } as MessageEvent);
            }
          }
        } catch (err) {
          if (!disposed) observer.error(err);
        }
      }

      poll(this.jobStore);
      const handle = setInterval(() => poll(this.jobStore), 1000);

      return () => {
        disposed = true;
        clearInterval(handle);
      };
    });
  }

  /** Returns the draft+compliance result once the routed job is complete. */
  @Public()
  @Get('extract-and-draft-routed/:jobId/result')
  async getDraftResult(@Param('jobId') jobId: string): Promise<DraftWithComplianceResult> {
    const job = await this.jobStore.get(jobId);
    if (!job) throw new NotFoundException(`Job ${jobId} not found`);
    if (job.status === 'error') {
      const details = job.errorDetails as { code?: string; documentType?: string | null } | undefined;
      if (details?.code === 'RPA_NOT_FOUND') {
        throw new UnprocessableEntityException({
          code: 'RPA_NOT_FOUND',
          documentType: details.documentType ?? 'unknown',
          message: job.error ?? 'Extraction failed to produce a document result.',
        });
      }
      if (details?.code === 'EXTRACTION_SERVICE_UNAVAILABLE') {
        throw new ServiceUnavailableException({
          code: 'EXTRACTION_SERVICE_UNAVAILABLE',
          message: job.error ?? 'Document analysis is temporarily unavailable. Please try again in a few minutes.',
        });
      }
      throw new BadRequestException(job.error ?? 'Extraction failed');
    }
    if (job.status !== 'complete') throw new BadRequestException('Job is still processing');
    return job.draftResult as DraftWithComplianceResult;
  }

  /**
   * Background runner for extract-and-draft-routed.
   * Mirrors the extract-and-draft logic but emits progress events to the job store.
   */
  private async runExtractAndDraftRouted(
    jobId: string,
    files: Express.Multer.File[],
    organizationId: string,
    createdByAccountId: string,
    formTemplateId?: string,
    mockExtractionsRaw?: string,
    transactionSide?: CoordinatorSide,
  ): Promise<DraftWithComplianceResult> {
    const emit = (percent: number, message: string, stage?: string) => {
      this.jobStore.emit(jobId, { percent, message, stage: stage ?? 'processing' } as import('./pipeline-progress.types').PipelineProgressEvent)
        .catch((err: Error) => this.logger.warn(`emit error: ${err.message}`));
    };

    emit(2, 'Checking document type…', 'extracting');

    // ── Step 1: extraction — AcroForm first, LLM fallback ─────────────────────
    let extraction!: ExtractionResult;
    let interaction!: import('../ai-interactions/entities/ai-interaction.entity').AiInteractionEntity;
    let compliance!: ComplianceResult;
    let contractDocuments: ContractDocumentExtraction[] | undefined;
    let allExtractions: FormExtractionResult[] | undefined;
    let extractionFileMap: Map<FormExtractionResult, string> | undefined;

    const parsedMocks = this.parseMockExtractions(mockExtractionsRaw);
      if (parsedMocks) {
        const firstCode = Object.keys(parsedMocks)[0];
        extraction = parsedMocks[firstCode] as ExtractionResult;
        this.logger.log(`No AcroForm — using mock extraction for ${firstCode}`);
        interaction = await this.aiInteractionsService.create({
          modelName: 'mock',
          feature: 'contract_extraction',
          promptText: 'mock_extraction',
          responseText: JSON.stringify(extraction),
          promptTokens: 0,
          completionTokens: 0,
          status: AiInteractionStatus.SUCCESS,
          metadataJson: { extraction: extraction as unknown as Record<string, unknown> },
        });
        compliance = this.rpaComplianceValidator.fromLlmExtraction(extraction);
        contractDocuments = [buildRpaContractDocument(extraction, files[0].originalname)];
        emit(55, 'Mock extraction complete', 'extracting');
      } else {
        emit(5, 'Analyzing documents…', 'extracting');
        let pipelineOk = false;
        allExtractions = [];
        extractionFileMap = new Map<FormExtractionResult, string>();
        const pageBuffersByFileName = new Map<string, Buffer>();
        let providerFailure: string | null = null;

        // Pre-compute per-file progress: 5-55% across all files
        const progStart = 5;
        const progPerFile = 50 / files.length;

        for (let fi = 0; fi < files.length; fi++) {
          const file = files[fi];
          emit(progStart + fi * progPerFile, `Processing ${file.originalname}…`, 'extracting');
          try {
            const decrypted = await this.decryptPdfIfNeeded(file.buffer);
            if (file.originalname) pageBuffersByFileName.set(file.originalname, decrypted);
            const result = await this.pageRoutingPipeline.process(
              decrypted,
              (event) => {
                if (event.stage === 'complete') return;
                const pct = progStart + fi * progPerFile + (event.percent * progPerFile / 100);
                this.jobStore.emit(jobId, { ...event, percent: Math.round(pct) })
                  .catch((err: Error) => this.logger.warn(`pipeline emit error: ${err.message}`));
              },
            );
            for (const fe of result.extractions) {
              allExtractions.push(fe);
              extractionFileMap.set(fe, file.originalname ?? `${fe.formCode}.pdf`);
            }
            providerFailure ??= this.detectExtractionProviderFailure(result);
          } catch (e) {
            this.logger.warn(`Pipeline extraction failed for ${file.originalname}: ${(e as Error).message}`);
          }
        }

        // The classifier failing to run (rate limit, quota, auth, network) is not
        // the same thing as "this document isn't an RPA" — surface it as such
        // instead of cascading through fallbacks that will fail the same way and
        // end up blaming the document.
        if (providerFailure) {
          throw new ServiceUnavailableException({
            code: 'EXTRACTION_SERVICE_UNAVAILABLE',
            message:
              `Document analysis is temporarily unavailable — the AI extraction service returned an error ` +
              `("${providerFailure}"). This is not a problem with your document. Please try again in a few minutes.`,
          });
        }

        if (allExtractions.length > 0) {
          emit(55, 'Normalizing extraction data…', 'processing');
          this.logger.log(
            `Pipeline extractions (per-file): ${allExtractions.map(e =>
              `${e.formCode}(${e.pageIndices.length}pgs,${e.output?'ok':'null'})`
            ).join(', ')}`
          );

          // ── Build contractDocuments from ALL extractions (independent of RPA) ──
          // Any BCO/SCO/SMCO counter offer that was successfully identified and
          // extracted must appear in the contract timeline — even if the RPA
          // extraction failed or the RPA form code was a variant.
          const contractFormCodes = new Set(['RPA', 'SCO', 'BCO', 'SMCO', 'BMCO']);
          let seq = 1;
          contractDocuments = [];
          for (const fe of allExtractions) {
            const normalizedCode = normalizeContractFormCode(fe.formCode);
            if (normalizedCode && contractFormCodes.has(normalizedCode)) {
              const fileName = extractionFileMap.get(fe) ?? `${fe.formCode}.pdf`;
              const cd = normalizeContractDocument(fe, fileName, seq++);
              if (cd) contractDocuments.push(cd);
            }
          }
          this.logger.log(
            `Contract documents built: ${contractDocuments.length} ` +
              `(${contractDocuments.map(c => c.documentType).join(', ') || 'none'})`,
          );

          // ── Find RPA extraction for main result ────────────────────────────
          const rpaExtraction = allExtractions.find(
            (e) => normalizeContractFormCode(e.formCode) === 'RPA' && e.output,
          );
          if (rpaExtraction?.output) {
            const normalized = normalizeToExtractionResult(rpaExtraction.output.data);
            if (normalized) {
              extraction = normalized;

              // ── Gemini-based contingency extraction from Other Terms ───
              const geminiKey = process.env.GEMINI_API_KEY;
              if (geminiKey && contractDocuments.length > 0) {
                try {
                  await enrichDocumentsWithGeminiContingency(contractDocuments, geminiKey);
                  this.logger.log('Gemini contingency extraction enriched contract documents');
                } catch (err: unknown) {
                  this.logger.warn(`Gemini contingency extraction failed: ${(err as Error).message}`);
                }
              }

              // ── Targeted field-region crop corroboration (SCO/BCO/SMCO/BMCO) ──
              // Independent secondary signal only — reconcileFieldWithCrop never
              // overwrites an already-present, disagreeing extracted value.
              if (geminiKey && contractDocuments.length > 0 && pageBuffersByFileName.size > 0) {
                try {
                  const cropCache = new RenderedPageCache({ dpi: 200 });
                  const cropProvider = new GeminiProvider(geminiKey);
                  await enrichDocumentsWithFieldRegionCrops(contractDocuments, pageBuffersByFileName, cropCache, cropProvider);
                } catch (err: unknown) {
                  this.logger.warn(`Field-region crop enrichment failed: ${(err as Error).message}`);
                }
              }

              const chainResult = validateContractChain(contractDocuments, allExtractions);
              const finalTerms = resolveFinalNegotiatedTerms(toFinalTermsInputDocuments(contractDocuments), { extractions: allExtractions });
              const finalValueByKey = new Map(finalTerms.valueTerms.map((t) => [t.key, t.value]));
              if (finalTerms.acceptanceDate) {
                extraction.transaction.acceptanceDate = finalTerms.acceptanceDate;
              }
              const finalPurchasePrice = finalValueByKey.get('purchasePrice') as number | undefined;
              if (finalPurchasePrice != null) {
                extraction.transaction.purchasePrice = finalPurchasePrice;
              }
              const finalCloseOfEscrow = finalValueByKey.get('closeOfEscrow') as string | undefined;
              if (finalCloseOfEscrow) {
                extraction.transaction.closingDate = finalCloseOfEscrow;
              }
              const finalPossession = finalValueByKey.get('possession') as string | undefined;
              if (finalPossession) {
                extraction.transaction.possessionDate = finalPossession;
              }
              if (!extraction.transaction.possessionDate && extraction.transaction.closingDate) {
                extraction.transaction.possessionDate = extraction.transaction.closingDate;
              }
              if (chainResult.warnings.length > 0) {
                this.logger.warn(`Contract chain warnings: ${chainResult.warnings.join('; ')}`);
              }

              interaction = await this.aiInteractionsService.create({
                modelName: rpaExtraction.output.modelName ?? 'unknown',
                feature: 'contract_extraction',
                promptText: 'page_routing_extraction',
                responseText: rpaExtraction.output.rawResponse,
                promptTokens: rpaExtraction.output.promptTokens ?? undefined,
                completionTokens: rpaExtraction.output.completionTokens ?? undefined,
                status: AiInteractionStatus.SUCCESS,
                metadataJson: { extraction: extraction as unknown as Record<string, unknown> },
              });
              compliance = this.rpaComplianceValidator.fromLlmExtraction(
                extraction,
                contractDocuments,
                allExtractions,
              );
              pipelineOk = true;
            }
          }
        }
        if (!pipelineOk) {
          emit(55, 'Falling back to generic extraction…', 'extracting');
          this.logger.log('Pipeline did not produce RPA extraction — trying explicit RPA extraction');
          try {
            const llmResult = await this.documentExtractionService.extractFromPdfs(files, 'RPA');
            const normalized = normalizeToExtractionResult(llmResult.result as unknown as Record<string, unknown>);
            if (normalized && (
              normalized.transaction.purchasePrice ||
              normalized.transaction.acceptanceDate ||
              normalized.parties?.buyers?.length ||
              normalized.parties?.sellers?.length ||
              normalized.property?.streetAddress
            )) {
              extraction = normalized;
              interaction = llmResult.interaction;
              compliance = this.rpaComplianceValidator.fromLlmExtraction(extraction);
            } else {
              emit(55, 'Generic extraction…', 'extracting');
              try {
                const genericResult = await this.documentExtractionService.extractFromPdfs(files);
                const normalizedGeneric = normalizeToExtractionResult(genericResult.result as unknown as Record<string, unknown>);
                extraction = normalizedGeneric ?? genericResult.result;
                interaction = genericResult.interaction;
                compliance = this.rpaComplianceValidator.fromLlmExtraction(extraction);
              } catch (e2) {
                this.logger.warn(`Generic fallback extraction failed: ${(e2 as Error).message}`);
              }
            }
          } catch (e) {
            this.logger.warn(`RPA fallback extraction failed: ${(e as Error).message}`);
          }
        }
      }

    // ── Step 2: RPA gate ──────────────────────────────────────────────────────
    emit(65, 'Validating purchase agreement…', 'compliance');

    if (!extraction || (typeof extraction === 'object' && Object.keys(extraction).length === 0)) {
      throw new UnprocessableEntityException({
        code: 'RPA_NOT_FOUND',
        documentType: 'unknown',
        message: 'Extraction failed to produce a document result.',
      });
    }

    if (!this.isRpaDocument(extraction)) {
      throw new UnprocessableEntityException({
        code: 'RPA_NOT_FOUND',
        documentType: extraction.documentType,
        message:
          `No Residential Purchase Agreement (RPA) was detected in the uploaded document(s). ` +
          `The document appears to be "${extraction.documentType ?? 'an unrecognized document type'}". ` +
          `A signed RPA is required to initiate a buyer-side transaction.`,
      });
    }

    // ── Step 3: duplicate check ────────────────────────────────────────────────
    emit(75, 'Checking for duplicate transactions…', 'compliance');
    if (extraction.property.streetAddress) {
      const existing = await this.transactionDraftService.findDuplicateByAddressAndOrg(
        extraction.property.streetAddress,
        organizationId,
      );
      if (existing) {
        this.logger.log(`Duplicate detected — existing draft ${existing.id} for ${extraction.property.streetAddress}`);
        return {
          duplicate: true,
          existingTransactionId: existing.id,
          extractionResult: extraction,
          compliance,
          contractDocuments,
        } as DraftWithComplianceResult;
      }
    }

    // ── Step 4: create draft transaction ──────────────────────────────────────
    emit(85, 'Creating draft transaction…', 'drafting');
    const draft = await this.transactionDraftService.createFromExtraction(
      extraction, interaction, compliance, organizationId, createdByAccountId, formTemplateId, contractDocuments,
      transactionSide,
    );

    // ── Step 5: upload all PDFs to S3 ────────────────────────────────────────
    emit(92, 'Uploading documents…', 'drafting');
    // Each uploaded file is stored once as an original-package audit record.
    // Separated per-form PDFs are derived from these sources and become the
    // primary documents used throughout the system.
    const txId = draft.transaction.id;
    const allFiles: { file: Express.Multer.File; storageKey: string | null }[] =
      files.map((f) => ({ file: f, storageKey: null }));

    await Promise.all(allFiles.map(async (entry) => {
      try {
        const result = await this.s3.upload(
          txId, 'contract', entry.file.originalname, entry.file.buffer, entry.file.mimetype,
        );
        entry.storageKey = result.storageKey;
      } catch (err) {
        this.logger.error(`S3 upload failed for ${entry.file.originalname}: ${(err as Error).message}`);
      }
    }));

    // Create isOriginalPackage audit record(s) and separated per-form PDFs
    const createdDocs: TransactionDocumentEntity[] = [draft.document];
    const fileBuffers = new Map<string, Buffer>();
    for (const entry of allFiles) {
      fileBuffers.set(entry.file.originalname, entry.file.buffer);
    }

    await this.createOriginalAndSeparatedForms({
      allFiles,
      fileBuffers,
      allExtractions: allExtractions ?? [],
      extractionFileMap: extractionFileMap ?? new Map(),
      transactionId: txId,
      primaryDocId: draft.document.id,
      primaryFormCode: 'RPA',
      stage: 'contract',
      createdDocs,
    });

    return { ...draft, compliance, documents: createdDocs };
  }

  /**
   * Voids an existing draft and creates a new one from replacement extraction data.
   * Used when a duplicate property address is detected — the user chooses to replace
   * the old draft with the newly uploaded contract's data.
   */
  @Post('replace-draft/:existingTransactionId')
  async replaceDraft(
    @Param('existingTransactionId') existingTransactionId: string,
    @Body() dto: {
      extractionResult: ExtractionResult;
      compliance: ComplianceResult;
      organizationId: string;
      createdByAccountId: string;
      formTemplateId?: string;
      contractDocuments?: ContractDocumentExtraction[];
    },
  ): Promise<DraftWithComplianceResult> {
    // Preserve the coordinated side from the transaction being replaced so a
    // seller-side replacement doesn't silently reset to buyer-side.
    let transactionSide: CoordinatorSide = CoordinatorSide.BUYER;
    try {
      const existing = await this.transactionsService.findOne(existingTransactionId);
      transactionSide = existing?.transactionSide ?? CoordinatorSide.BUYER;
    } catch {
      // Transaction already voided/unavailable — fall back to BUYER.
    }

    await this.transactionsService.void(existingTransactionId);
    this.logger.log(`Voided old draft ${existingTransactionId} for replacement`);

    const interaction = await this.aiInteractionsService.create({
      modelName: 'replacement',
      feature: 'contract_extraction',
      promptText: 'replacement_extraction',
      responseText: JSON.stringify(dto.extractionResult),
      promptTokens: 0,
      completionTokens: 0,
      status: AiInteractionStatus.SUCCESS,
      metadataJson: { extraction: dto.extractionResult as unknown as Record<string, unknown> },
    });

    const draft = await this.transactionDraftService.createFromExtraction(
      dto.extractionResult, interaction, dto.compliance,
      dto.organizationId, dto.createdByAccountId, dto.formTemplateId,
      dto.contractDocuments, transactionSide,
    );

    this.logger.log(`Draft replaced — old ${existingTransactionId} → new ${draft.transaction.id}`);
    return { ...draft, compliance: dto.compliance };
  }

  /**
   * Step 1 of the page-routing pipeline: upload the PDF and get a jobId.
   * Processing starts immediately in the background.
   * Connect to GET /extract-routed/:jobId/progress to stream progress events via SSE.
   */
  @Post('extract-routed')
  @UseInterceptors(FilesInterceptor('files', 1, { limits: { fileSize: 50 * 1024 * 1024 } }))
  async extractRoutedStart(
    @UploadedFiles() files: Express.Multer.File[],
    @Body('mockExtractions') mockExtractionsRaw?: string,
  ): Promise<{ jobId: string }> {
    if (!files || files.length === 0) {
      throw new BadRequestException('A PDF file is required');
    }

    const jobId = randomUUID();
    await this.jobStore.createWithTimeout(jobId);

    const parsedMocks = this.parseMockExtractions(mockExtractionsRaw);
    const extractionSnaps = parsedMocks ? this.mockExtractionsToSnaps(parsedMocks) : undefined;

    // Fire and forget — progress is streamed via SSE
    this.pageRoutingPipeline
      .process(files[0].buffer, (event) => {
        if (event.stage === 'complete') return;
        this.jobStore.emit(jobId, event).catch((err: Error) => this.logger.warn(`pipeline emit error: ${err.message}`));
      }, undefined, extractionSnaps)
      .then((result) => this.jobStore.complete(jobId, result))
      .catch((err: Error) => this.jobStore.fail(jobId, err.message));

    return { jobId };
  }

  /**
   * Step 2: SSE stream for pipeline progress.
   * Polls the database every 1s and emits new progress events as they arrive.
   * The stream closes automatically when processing finishes.
   */
  @Sse('extract-routed/:jobId/progress')
  streamProgress(@Param('jobId') jobId: string): Observable<MessageEvent> {
    return new Observable<MessageEvent>((observer) => {
      let lastVersion = -1;
      let disposed = false;

      async function poll(jobStore: ExtractionJobStore) {
        if (disposed) return;
        try {
          const job = await jobStore.get(jobId);
          if (!job) {
            observer.next({ data: { stage: 'error', message: `Job ${jobId} not found`, percent: 0 } } as MessageEvent);
            observer.complete();
            return;
          }

          if (job.status === 'complete') {
            // Always emit 'complete' — a late fire-and-forget emit() may have
            // overwritten progressJson with a stale event after complete().
            if (job.progress?.stage !== 'complete' || job.progressVersion > lastVersion) {
              observer.next({ data: { stage: 'complete', message: 'Processing complete', percent: 100 } } as MessageEvent);
            }
            observer.complete();
            return;
          }

          if (job.status === 'error') {
            observer.complete();
            return;
          }

          if (job.progressVersion > lastVersion) {
            lastVersion = job.progressVersion;
            observer.next({ data: job.progress ?? { stage: 'processing', message: 'Starting…', percent: 0 } } as MessageEvent);
          }
        } catch (err) {
          if (!disposed) observer.error(err);
        }
      }

      poll(this.jobStore);
      const handle = setInterval(() => poll(this.jobStore), 1000);

      return () => {
        disposed = true;
        clearInterval(handle);
      };
    });
  }

  /** Returns the final result once the job is complete. */
  @Get('extract-routed/:jobId/result')
  async getResult(@Param('jobId') jobId: string): Promise<PageRoutingPipelineResult> {
    const job = await this.jobStore.get(jobId);
    if (!job) throw new NotFoundException(`Job ${jobId} not found`);
    if (job.status === 'error') throw new BadRequestException(job.error ?? 'Extraction failed');
    if (job.status !== 'complete') throw new BadRequestException('Job is still processing');
    return job.result!;
  }

  /**
   * Upload a PDF to an existing transaction, run extraction + compliance, and store
   * results in the document's metadata_json. Used for "Submit Additional Forms".
   *
   * Multipart fields:
   *   file           — the PDF (required)
   *   transactionId  — UUID (required)
   *   stage          — e.g. "contract", "disclosures" (required)
   *   documentType   — e.g. "disclosure" (optional, inferred from stage)
   *   title          — display name (optional, defaults to filename)
   */
  @Post('upload-and-extract')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 50 * 1024 * 1024 } }))
  async uploadAndExtract(
    @UploadedFile() file: Express.Multer.File,
    @Body('transactionId') transactionId: string,
    @Body('stage') stage: string,
    @Body('documentType') documentType?: string,
    @Body('title') title?: string,
    @Body('mockExtractions') mockExtractionsRaw?: string,
  ): Promise<UploadAndExtractResult> {
    if (!file) throw new BadRequestException('file is required');
    if (!transactionId) throw new BadRequestException('transactionId is required');
    if (!stage) throw new BadRequestException('stage is required');

    const tx = await this.transactionsService.findOne(transactionId).catch(() => null);
    if (!tx) throw new NotFoundException('Transaction not found');

    const result = await this.runUploadAndExtract({ file, transactionId, stage, documentType, title, mockExtractionsRaw });

    // Auto-detect RR/RRRR and trigger repair request workflow
    if (result.detectedFormCode && result.document) {
      await this.handleRepairRequestDetection(transactionId, result.detectedFormCode, result.document.id);
      await this.handleVpDetection(transactionId, result.detectedFormCode, result.document.id);
    }

    return result;
  }

  // ── Batch upload ────────────────────────────────────────────────────────

  /**
   * Upload multiple documents to an existing transaction in a single batch.
   * Each file is processed independently through the extraction pipeline.
   * Returns a jobId for SSE progress streaming.
   */
  @Post('upload-and-extract-batch')
  @UseInterceptors(FilesInterceptor('files', 20, { limits: { fileSize: 50 * 1024 * 1024 } }))
  async uploadAndExtractBatch(
    @UploadedFiles() files: Express.Multer.File[],
    @Body('transactionId') transactionId: string,
    @Body('stage') stage: string,
  ): Promise<{ jobId: string }> {
    if (!files || files.length === 0) throw new BadRequestException('At least one file is required');
    if (!transactionId) throw new BadRequestException('transactionId is required');
    if (!stage) throw new BadRequestException('stage is required');

    const tx = await this.transactionsService.findOne(transactionId).catch(() => null);
    if (!tx) throw new NotFoundException('Transaction not found');

    const jobId = randomUUID();
    await this.jobStore.createWithTimeout(jobId, 900_000);

    // Fire-and-forget: process files in the background
    this.runBatchUploadAndExtract(jobId, files, transactionId, stage).catch((err) => {
      this.logger.error(`Batch upload job ${jobId} failed: ${(err as Error).message}`);
      this.jobStore.fail(jobId, (err as Error).message).catch(() => {});
    });

    return { jobId };
  }

  /** SSE progress stream for batch upload jobs. */
  @Public()
  @Sse('upload-and-extract-batch/:jobId/progress')
  streamBatchProgress(@Param('jobId') jobId: string): Observable<MessageEvent> {
    return new Observable<MessageEvent>((observer) => {
      let lastVersion = -1;
      let disposed = false;

      const poll = async () => {
        if (disposed) return;
        try {
          const job = await this.jobStore.get(jobId);
          if (!job) {
            observer.next({ data: { overall: { percent: 0, message: `Job ${jobId} not found` }, files: [] } } as MessageEvent);
            observer.complete();
            return;
          }

          if (job.status === 'complete') {
            if (job.progressVersion > lastVersion) {
              observer.next({ data: { overall: { percent: 100, message: 'Complete' }, files: [] } } as MessageEvent);
            }
            observer.complete();
            return;
          }

          if (job.status === 'error') {
            if (job.progressVersion > lastVersion && job.progress) {
              lastVersion = job.progressVersion;
              observer.next({ data: job.progress } as MessageEvent);
            }
            observer.complete();
            return;
          }

          if (job.progressVersion > lastVersion) {
            lastVersion = job.progressVersion;
            if (job.progress) {
              observer.next({ data: job.progress } as MessageEvent);
            }
          }
        } catch (err) {
          if (!disposed) observer.error(err);
        }
      };

      poll();
      const handle = setInterval(poll, 1000);

      return () => {
        disposed = true;
        clearInterval(handle);
      };
    });
  }

  /** Returns the batch upload result once the job is complete. */
  @Public()
  @Get('upload-and-extract-batch/:jobId/result')
  async getBatchResult(@Param('jobId') jobId: string): Promise<BatchUploadResult> {
    const job = await this.jobStore.get(jobId);
    if (!job) throw new NotFoundException(`Job ${jobId} not found`);
    if (job.status === 'error') throw new BadRequestException(job.error ?? 'Batch upload failed');
    if (job.status !== 'complete') throw new BadRequestException('Job is still processing');
    return job.draftResult as BatchUploadResult;
  }

  /**
   * Process a batch of files sequentially. Each file goes through the full
   * upload-and-extract pipeline independently. Errors on individual files
   * are captured and do not halt the batch.
   */
  private async runBatchUploadAndExtract(
    jobId: string,
    files: Express.Multer.File[],
    transactionId: string,
    stage: string,
  ): Promise<void> {
    const total = files.length;
    const fileResults: BatchFileProgress[] = files.map((f, i) => ({
      index: i,
      fileName: f.originalname,
      status: 'queued' as const,
    }));

    const emitProgress = async (overallPercent: number, overallMessage: string) => {
      const progress: BatchProgressJson = {
        overall: { percent: overallPercent, message: overallMessage },
        files: fileResults,
      };
      await this.jobStore.emit(jobId, progress as unknown as import('./pipeline-progress.types').PipelineProgressEvent);
    };

    await emitProgress(0, `Starting batch upload of ${total} file${total !== 1 ? 's' : ''}…`);

    for (let i = 0; i < total; i++) {
      const file = files[i];
      fileResults[i].status = 'processing';
      await emitProgress(
        Math.round((i / total) * 100),
        `Processing ${i + 1} of ${total}: ${file.originalname}`,
      );

      try {
        const result = await this.runUploadAndExtract({
          file,
          transactionId,
          stage,
          onProgress: (event) => {
            fileResults[i].extractionProgress = {
              currentPage: event.currentPage,
              totalPages: event.totalPages,
              message: event.message,
            };
            emitProgress(
              Math.round(((i + 0.5) / total) * 100),
              `${file.originalname}: ${event.message}`,
            ).catch(() => {});
          },
        });

        if (result.requiresConfirmation) {
          fileResults[i].status = 'requires_confirmation';
          fileResults[i].pendingUploadId = result.pendingUploadId;
          fileResults[i].existingDocInfo = result.existingDocInfo;
          fileResults[i].formCode = result.detectedFormCode;
          fileResults[i].detectedFormName = result.detectedFormName;
          fileResults[i].reclassified = result.reclassified;
          fileResults[i].resolvedStage = result.resolvedStage;
        } else {
          fileResults[i].status = 'completed';
          fileResults[i].document = result.document;
          fileResults[i].formCode = result.detectedFormCode;
          fileResults[i].detectedFormName = result.detectedFormName;
          fileResults[i].reclassified = result.reclassified;
          fileResults[i].resolvedStage = result.resolvedStage;

          if (result.detectedFormCode && result.document) {
            await this.handleRepairRequestDetection(transactionId, result.detectedFormCode, result.document.id);
            await this.handleVpDetection(transactionId, result.detectedFormCode, result.document.id);
          }
        }
      } catch (err) {
        this.logger.error(`Batch upload: file ${i} (${file.originalname}) failed: ${(err as Error).message}`);
        fileResults[i].status = 'error';
        fileResults[i].error = (err as Error).message ?? 'Processing failed';
      }

      await emitProgress(
        Math.round(((i + 1) / total) * 100),
        i + 1 < total
          ? `Processed ${i + 1} of ${total} — next: ${files[i + 1].originalname}`
          : `Processed ${total} of ${total} — finalizing…`,
      );
    }

    const batchResult: BatchUploadResult = {
      jobId,
      status: 'complete',
      files: fileResults,
    };

    await this.jobStore.completeDraft(jobId, batchResult);
  }

  /**
   * Generate a signed upload link and email it to a recipient.
   * The link points to the public /upload/{token} page and expires in 7 days.
   */
  @Post('send-upload-link')
  async sendUploadLink(
    @Body('transactionId') transactionId: string,
    @Body('stage') stage: string,
    @Body('recipientEmail') recipientEmail: string,
    @Body('recipientName') recipientName?: string,
  ): Promise<{ uploadUrl: string }> {
    if (!transactionId) throw new BadRequestException('transactionId is required');
    if (!stage) throw new BadRequestException('stage is required');
    if (!recipientEmail) throw new BadRequestException('recipientEmail is required');

    const token = this.jwtService.sign(
      { type: 'doc_upload', transactionId, stage },
      { expiresIn: '7d' },
    );

    const webAppUrl = process.env.WEB_APP_URL ?? 'http://localhost:3001';
    const uploadUrl = `${webAppUrl}/upload/${token}`;
    const name = recipientName?.trim() || 'there';
    const stageLabel = stage.charAt(0).toUpperCase() + stage.slice(1).toLowerCase();

    await this.mailgunService.sendEmail(
      recipientEmail,
      `Action required: Upload ${stageLabel} documents`,
      `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;">
        <p>Hi ${name},</p>
        <p>Your transaction coordinator is requesting that you upload your <strong>${stageLabel}</strong> documents.</p>
        <p style="margin:24px 0;">
          <a href="${uploadUrl}" style="background:#1d4ed8;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;">
            Upload Documents
          </a>
        </p>
        <p style="color:#6b7280;font-size:13px;">This link expires in 7 days. If you did not expect this email, please ignore it.</p>
      </div>`,
      `Hi ${name},\n\nYour transaction coordinator is requesting ${stageLabel} documents.\n\nUpload here:\n${uploadUrl}\n\nThis link expires in 7 days.`,
    );

    return { uploadUrl };
  }

  /**
   * Public endpoint — accepts a signed JWT token (from a send-upload-link email)
   * instead of session auth. Validates the token, then runs the full upload-and-extract flow.
   */
  @Post('upload-via-token')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 50 * 1024 * 1024 } }))
  async uploadViaToken(
    @UploadedFile() file: Express.Multer.File,
    @Body('token') token: string,
    @Body('documentType') documentType?: string,
    @Body('title') title?: string,
    @Body('mockExtractions') mockExtractionsRaw?: string,
  ): Promise<UploadAndExtractResult> {
    if (!file) throw new BadRequestException('file is required');
    if (!token) throw new BadRequestException('token is required');

    let payload: { type: string; transactionId: string; stage: string };
    try {
      payload = this.jwtService.verify<typeof payload>(token);
    } catch {
      throw new BadRequestException('Invalid or expired upload token');
    }

    if (payload.type !== 'doc_upload') {
      throw new BadRequestException('Invalid token type');
    }

    return this.runUploadAndExtract({
      file,
      transactionId: payload.transactionId,
      stage: payload.stage,
      documentType,
      title,
      mockExtractionsRaw,
    });
  }

  /**
   * Confirm a pending duplicate upload — supersedes the existing document and
   * creates a new version with the extracted data.
   * Called after the user accepts the confirmation dialog in the UI.
   */
  @Post('confirm-upload')
  async confirmUpload(
    @Body('pendingUploadId') pendingUploadId: string,
  ): Promise<UploadAndExtractResult> {
    if (!pendingUploadId) throw new BadRequestException('pendingUploadId is required');

    const pending = await this.pendingUploadsService.findOne(pendingUploadId);

    const existingDoc = await this.documentsService.findOne(pending.existingDocId);

    const doc = await this.documentsService.createNewVersion(existingDoc.id, {
      transactionId: pending.transactionId,
      documentType: existingDoc.documentType,
      title: pending.title,
      fileName: pending.fileName,
      mimeType: pending.mimeType,
      storageKey: pending.storageKey,
      status: DocumentStatus.UPLOADED,
    });

    await this.documentsService.patchMetadataJson(doc.id, {
      extraction: pending.extractionJson,
      compliance: pending.complianceJson,
      extractedAt: new Date().toISOString(),
      pdfSource: pending.pdfType === 'digital_acroform' ? 'acroform' : 'llm',
      detectedFormCode: pending.detectedFormCode,
      submittedStage: pending.stage,
    });

    if (pending.interactionId) {
      await this.documentsService.setAiInteractionId(doc.id, pending.interactionId);
    }

    const extraction = pending.extractionJson as unknown as ExtractionResult;
    const compliance = pending.complianceJson as unknown as ComplianceResult;

    const reasoningOutcome = await this.stageReasoning.runForStage(
      pending.transactionId, pending.stage,
    );
    const reasoning = reasoningOutcome && !('skipped' in reasoningOutcome) ? reasoningOutcome : null;

    const updatedDoc = await this.documentsService.findOne(doc.id);

    await this.pendingUploadsService.remove(pendingUploadId);

    this.logger.log(
      `confirm-upload: superseded ${pending.existingDocId} → created ${doc.id}` +
      ` (${pending.detectedFormCode}, v${doc.versionNo})`,
    );

    await this.eventSeederService.seedFromExtraction(pending.transactionId)
      .catch((err: Error) => this.logger.warn(`Event re-seed failed for ${pending.transactionId} (non-fatal): ${err.message}`));

    await this.welcomeEmailService.sendWelcomeEmails(pending.transactionId)
      .catch((err: Error) => this.logger.warn(`Welcome/timeline email re-check failed for ${pending.transactionId} (non-fatal): ${err.message}`));

    return {
      document: updatedDoc,
      extraction,
      compliance,
      pdfType: (pending.pdfType as 'digital_acroform' | 'scanned_or_flattened') ?? undefined,
      submittedStage: pending.stage,
      resolvedStage: pending.stage,
      resolvedDocumentType: existingDoc.documentType,
      reclassified: false,
      detectedFormCode: pending.detectedFormCode,
      detectedFormName: pending.existingFormName,
      reasoning,
      hasPreviousVersion: true,
      previousVersionId: pending.existingDocId,
      versionNo: doc.versionNo,
      versionComparison: null,
      versionAction: 'superseded',
    };
  }

  /**
   * Cancel a pending duplicate upload — removes the S3 file and pending record.
   * Called when the user rejects the confirmation dialog in the UI.
   */
  @Post('cancel-upload')
  async cancelUpload(
    @Body('pendingUploadId') pendingUploadId: string,
  ): Promise<{ cancelled: boolean }> {
    if (!pendingUploadId) throw new BadRequestException('pendingUploadId is required');

    const pending = await this.pendingUploadsService.findOne(pendingUploadId);

    await this.s3.delete(pending.storageKey);
    await this.pendingUploadsService.remove(pendingUploadId);

    this.logger.log(`cancel-upload: removed pending upload ${pendingUploadId}`);

    return { cancelled: true };
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private findExactMatchInDocs(
    docs: TransactionDocumentEntity[],
    detectedFormCode: string | null,
  ): TransactionDocumentEntity | null {
    if (!detectedFormCode) return null;
    const upper = detectedFormCode.toUpperCase();
    for (const doc of docs) {
      const meta = doc.metadataJson as Record<string, unknown> | null;
      const docCode = meta?.detectedFormCode as string | undefined;
      if (docCode && docCode.toUpperCase() === upper) return doc;
    }
    return null;
  }

  private compareExtractions(
    detectedCode: string,
    oldExtraction: Record<string, unknown>,
    newExtraction: Record<string, unknown>,
  ): FormComparisonResult | null {
    const code = detectedCode.toUpperCase();

    if (code === 'RPA') {
      return compareRpaExtractions(
        oldExtraction as Parameters<typeof compareRpaExtractions>[0],
        newExtraction as Parameters<typeof compareRpaExtractions>[1],
      );
    }

    if (['SCO', 'BCO', 'SMCO', 'BMCO'].includes(code)) {
      return compareScoExtractions(
        oldExtraction as Parameters<typeof compareScoExtractions>[0],
        newExtraction as Parameters<typeof compareScoExtractions>[1],
      );
    }

    return null;
  }

  /**
   * Creates original-package audit records and separated per-form PDFs from one
   * or more source files. The original combined uploads get isOriginalPackage: true
   * rows, and every detected form (including the primary) gets its own separated
   * PDF with provenance pointing back to the original package.
   *
   * Used by extract-and-draft, extract-and-draft-routed, and upload-and-extract.
   */
  private async createOriginalAndSeparatedForms(params: {
    allFiles: { file: Express.Multer.File; storageKey: string | null }[];
    fileBuffers: Map<string, Buffer>;
    allExtractions: FormExtractionResult[];
    extractionFileMap: Map<FormExtractionResult, string>;
    transactionId: string;
    primaryDocId: string;
    primaryFormCode: string;
    stage: string;
    isUploadAndExtract?: boolean;
    createdDocs: TransactionDocumentEntity[];
  }): Promise<string[]> {
    const {
      allFiles, fileBuffers, allExtractions, extractionFileMap,
      transactionId, primaryDocId, primaryFormCode, stage,
      isUploadAndExtract, createdDocs,
    } = params;

    const originalDocIds: string[] = [];

    for (const entry of allFiles) {
      if (!entry.storageKey) continue;

      let originalDocId: string;
      if (isUploadAndExtract) {
        // For upload-and-extract, the doc row already has the combined file's
        // storageKey. Create a separate isOriginalPackage row for audit, then
        // update the doc row to point to the separated form PDF.
        const originalDoc = await this.documentsService.createDocumentWithMetadata({
          transactionId,
          stage,
          documentType: 'original_package',
          title: `Original Upload – ${entry.file.originalname}`,
          storageKey: entry.storageKey,
          fileName: entry.file.originalname,
          mimeType: entry.file.mimetype,
          isOriginalPackage: true,
          metadataJson: {
            isOriginalPackage: true,
            originalFileNames: [entry.file.originalname],
            fileCount: 1,
            uploadedAt: new Date().toISOString(),
          },
        });
        originalDocId = originalDoc.id;
      } else {
        const originalDoc = await this.documentsService.createDocumentWithMetadata({
          transactionId,
          stage,
          documentType: 'original_package',
          title: `Original Upload – ${entry.file.originalname}`,
          storageKey: entry.storageKey,
          fileName: entry.file.originalname,
          mimeType: entry.file.mimetype,
          isOriginalPackage: true,
          metadataJson: {
            isOriginalPackage: true,
            originalFileNames: allFiles.map((f) => f.file.originalname),
            fileCount: allFiles.length,
            uploadedAt: new Date().toISOString(),
          },
        });
        originalDocId = originalDoc.id;
      }
      originalDocIds.push(originalDocId);

      const srcBuffer = fileBuffers.get(entry.file.originalname);
      if (!srcBuffer) continue;

      const splitBuffer = await this.decryptPdfIfNeeded(srcBuffer);

      const perFormPdfs = await this.formSplitter.splitByForm(
        splitBuffer,
        allExtractions.filter((fe) => {
          const srcFile = extractionFileMap.get(fe) ?? `${fe.formCode}.pdf`;
          return srcFile === entry.file.originalname && fe.output && fe.pageIndices.length > 0;
        }),
      );

      for (const [formCode, { buffer, pageStart, pageEnd }] of perFormPdfs) {
        const upperCode = formCode.toUpperCase();
        const perFormFilename = `${upperCode}-${entry.file.originalname.replace(/\.pdf$/i, '')}.pdf`;
        const { storageKey: perFormKey } = await this.s3.upload(
          transactionId, stage, perFormFilename, buffer, 'application/pdf',
        );

        if (upperCode === primaryFormCode.toUpperCase()) {
          await this.documentsService.update(primaryDocId, {
            storageKey: perFormKey,
            status: DocumentStatus.UPLOADED,
            sourceDocumentId: originalDocId,
            sourcePageStart: pageStart,
            sourcePageEnd: pageEnd,
            formCode: upperCode,
            analysisStatus: 'completed',
          } as Record<string, unknown>);
          await this.documentsService.patchMetadataJson(primaryDocId, {
            sourceDocumentId: originalDocId,
            sourcePageStart: pageStart,
            sourcePageEnd: pageEnd,
            formCode: upperCode,
          });
        } else {
          const formStage = this.resolveStageFromFormCode(formCode) ?? 'disclosures';
          const formDocType = this.formCodeToDocumentType(formCode) ?? 'disclosure';
          const fe = allExtractions.find((e) => e.formCode.toUpperCase() === upperCode);
          const isExtractFlow = !!fe?.output && !isUploadAndExtract;
          const isDisclosureStage = formStage === 'disclosures';

          let formMetadataJson: Record<string, unknown>;
          let analysisStatus: 'completed' | 'failed' | null = null;

          if (isDisclosureStage) {
            // Every split disclosure is validated independently — a passing
            // sibling form must never mask a failing one. Reuse the extraction
            // already produced by the page-routing pipeline when available
            // (extract-and-draft flow); otherwise this form was only split, not
            // extracted (upload-and-extract flow), so run the unified pipeline
            // on just this form's own split PDF to produce its own result.
            const hadPriorExtraction = !!fe?.output?.data;
            let extractionData = fe?.output?.data as unknown as Record<string, unknown> | undefined;
            let formCompliance: ComplianceResult | null = null;
            let analysisError: string | undefined;
            try {
              if (extractionData) {
                formCompliance = this.rpaComplianceValidator.fromDisclosureExtraction(upperCode, extractionData);
              } else {
                const analyzed = await this.documentPipelineService.process(buffer);
                extractionData = analyzed.extraction as unknown as Record<string, unknown>;
                formCompliance = analyzed.compliance;
              }
              analysisStatus = 'completed';
            } catch (err) {
              analysisStatus = 'failed';
              analysisError = (err as Error).message;
              this.logger.error(`Disclosure analysis failed for split form ${upperCode}: ${analysisError}`);
            }
            formMetadataJson = {
              ...(extractionData ? { extraction: extractionData } : {}),
              detectedFormCode: upperCode,
              extractedAt: new Date().toISOString(),
              pdfSource: hadPriorExtraction ? 'llm' : 'split',
              ...(formCompliance ? { compliance: formCompliance as unknown as Record<string, unknown> } : {}),
              ...(analysisError ? { analysisError } : {}),
            };
          } else {
            // Not a disclosure form, but its identity is just as settled as one —
            // the split above only ever produces a row for a form the pipeline
            // actually classified, so this document must be just as "complete"
            // for checklist-matching purposes (formCode + analysisStatus) as any
            // disclosure split above.
            analysisStatus = 'completed';
            formMetadataJson = isExtractFlow && fe?.output ? {
              extraction: fe.output.data as unknown as Record<string, unknown>,
              detectedFormCode: upperCode,
              extractedAt: new Date().toISOString(),
              pdfSource: 'llm',
            } : {
              detectedFormCode: upperCode,
              extractedAt: new Date().toISOString(),
              pdfSource: 'split',
            };
          }

          const formDoc = await this.documentsService.createDocumentWithMetadata({
            transactionId,
            stage: formStage.toLowerCase(),
            documentType: formDocType,
            title: fe?.formName ?? formCode,
            storageKey: perFormKey,
            fileName: perFormFilename,
            mimeType: 'application/pdf',
            sourceDocumentId: originalDocId,
            sourcePageStart: pageStart,
            sourcePageEnd: pageEnd,
            formCode: upperCode,
            metadataJson: formMetadataJson,
            ...(analysisStatus ? { analysisStatus } : {}),
          });

          if (analysisStatus) {
            await this.documentsService.updateAnalysisResult(formDoc.id, {
              analysisStatus,
              analyzedAt: new Date(),
            });
          }

          createdDocs.push(formDoc);
        }
      }
    }

    return originalDocIds;
  }

  /**
   * Shared helper — creates per-form PDFs from source file buffers, uploads each
   * to S3, and creates derived TransactionDocumentEntity rows with full provenance
   * metadata (sourceDocumentId, sourcePageStart/End, formCode).
   *
   * Used by both extract-and-draft (non-routed + routed) and upload-and-extract.
   *
   * @returns array of created derived document entities (does not include source document)
   */
  private async createPerFormDocumentRows(params: {
    sourceDocumentId: string;
    transactionId: string;
    extractionsByFile: Map<string, FormExtractionResult[]>;
    fileBuffers: Map<string, Buffer>;
    extractionFileMap: Map<FormExtractionResult, string>;
    /** Optional: extractions from upload-and-extract (no output/raw data). Pass only to skip AI interactions for these. */
    skipAiForFormCodes?: Set<string>;
  }): Promise<TransactionDocumentEntity[]> {
    const createdDocs: TransactionDocumentEntity[] = [];
    const {
      sourceDocumentId, transactionId, extractionsByFile,
      fileBuffers, extractionFileMap, skipAiForFormCodes,
    } = params;

    for (const [srcFileName, extractions] of extractionsByFile) {
      const srcBuffer = fileBuffers.get(srcFileName);
      if (!srcBuffer) continue;

      let perFormStorageKeys: Map<string, { storageKey: string; pageStart: number; pageEnd: number }>;
      try {
        const perFormPdfs = await this.formSplitter.splitByForm(srcBuffer, extractions);
        perFormStorageKeys = new Map();
        for (const [formCode, { buffer, pageStart, pageEnd }] of perFormPdfs) {
          const perFormFilename = `${formCode}-${srcFileName.replace(/\.pdf$/i, '')}.pdf`;
          const result = await this.s3.upload(transactionId, 'contract', perFormFilename, buffer, 'application/pdf');
          perFormStorageKeys.set(`${formCode}::${srcFileName}`, { storageKey: result.storageKey, pageStart, pageEnd });
        }
      } catch (err) {
        this.logger.error(`Per-form PDF creation failed for ${srcFileName}: ${(err as Error).message}`);
        continue;
      }

      for (const fe of extractions) {
        if (!fe.output || fe.formCode === 'RPA') continue;
        const formCodeUpper = fe.formCode.toUpperCase();
        const perFormKey = `${formCodeUpper}::${srcFileName}`;
        const perFormInfo = perFormStorageKeys.get(perFormKey);
        const storageKey = perFormInfo?.storageKey ?? null;

        // Upload-and-extract flow: no AI interaction needed (just form identification)
        if (skipAiForFormCodes?.has(formCodeUpper)) {
          const formStage = this.resolveStageFromFormCode(fe.formCode) ?? 'disclosures';
          const formDocType = this.formCodeToDocumentType(fe.formCode) ?? 'disclosure';
          const formDoc = await this.documentsService.createDocumentWithMetadata({
            transactionId,
            stage: formStage.toLowerCase(),
            documentType: formDocType,
            title: fe.formName ?? fe.formCode,
            storageKey,
            fileName: perFormInfo ? `${formCodeUpper}-${srcFileName.replace(/\.pdf$/i, '')}.pdf` : `${fe.formCode}.pdf`,
            mimeType: 'application/pdf',
            sourceDocumentId,
            sourcePageStart: perFormInfo?.pageStart ?? null,
            sourcePageEnd: perFormInfo?.pageEnd ?? null,
            formCode: formCodeUpper,
            metadataJson: {
              detectedFormCode: formCodeUpper,
              extractedAt: new Date().toISOString(),
              pdfSource: 'split',
            },
          });
          createdDocs.push(formDoc);
          continue;
        }

        // Extract-and-draft flow: full AI interaction + compliance
        const formInteraction = await this.aiInteractionsService.create({
          modelName: fe.output.modelName ?? 'unknown',
          feature: 'document_upload',
          promptText: 'page_routing_extraction',
          responseText: fe.output.rawResponse,
          promptTokens: fe.output.promptTokens ?? undefined,
          completionTokens: fe.output.completionTokens ?? undefined,
          status: AiInteractionStatus.SUCCESS,
          metadataJson: { extraction: fe.output.data as unknown as Record<string, unknown> },
        });

        const formStage = this.resolveStageFromFormCode(fe.formCode) ?? 'disclosures';
        const formDocType = this.formCodeToDocumentType(fe.formCode) ?? 'disclosure';

        const formCompliance = this.rpaComplianceValidator.fromDisclosureExtraction(
          fe.formCode,
          fe.output.data as Record<string, unknown>,
        );

        const formDoc = await this.documentsService.createDocumentWithMetadata({
          transactionId,
          stage: formStage.toLowerCase(),
          documentType: formDocType,
          title: fe.formName ?? fe.formCode,
          storageKey,
          fileName: perFormInfo
            ? `${formCodeUpper}-${srcFileName.replace(/\.pdf$/i, '')}.pdf`
            : (extractionFileMap.get(fe) ?? `${fe.formCode}.pdf`),
          mimeType: 'application/pdf',
          aiInteractionId: formInteraction.id,
          sourceDocumentId,
          sourcePageStart: perFormInfo?.pageStart ?? null,
          sourcePageEnd: perFormInfo?.pageEnd ?? null,
          formCode: formCodeUpper,
          metadataJson: {
            extraction: fe.output.data as unknown as Record<string, unknown>,
            detectedFormCode: formCodeUpper,
            extractedAt: new Date().toISOString(),
            pdfSource: 'llm',
            compliance: formCompliance as unknown as Record<string, unknown>,
          },
        });

        createdDocs.push(formDoc);
      }
    }

    return createdDocs;
  }


  private async runUploadAndExtract(params: {
    file: Express.Multer.File;
    transactionId: string;
    stage: string;
    documentType?: string;
    title?: string;
    mockExtractionsRaw?: string;
    onProgress?: (event: ExtractionProgressEvent) => void;
  }): Promise<UploadAndExtractResult> {
    const { file, transactionId, stage } = params;
    const documentType = params.documentType ?? this.inferDocumentType(stage);
    const title = params.title ?? file.originalname;

    let extraction: ExtractionResult;
    let interaction: import('../ai-interactions/entities/ai-interaction.entity').AiInteractionEntity;
    let compliance: ComplianceResult;
    let pdfType: 'digital_acroform' | 'scanned_or_flattened';

    const acroResult = await this.acroFormExtractorService.extract(file.buffer);

    if (acroResult.hasAcroForm && this.hasDataFields(acroResult)) {
      this.logger.log(`upload-and-extract: AcroForm, ${acroResult.fieldCount} fields`);
      extraction = this.acroFormExtractionMapper.map(acroResult);
      pdfType = 'digital_acroform';
      interaction = await this.aiInteractionsService.create({
        modelName: 'acroform',
        feature: 'document_upload',
        promptText: 'acroform_field_extraction',
        responseText: JSON.stringify(extraction),
        promptTokens: 0,
        completionTokens: 0,
        status: AiInteractionStatus.SUCCESS,
        metadataJson: { extraction: extraction as unknown as Record<string, unknown> },
      });
    } else {
      const parsedMocks = this.parseMockExtractions(params.mockExtractionsRaw);
      if (parsedMocks) {
        const firstCode = Object.keys(parsedMocks)[0];
        extraction = parsedMocks[firstCode] as ExtractionResult;
        pdfType = 'scanned_or_flattened';
        this.logger.log(`upload-and-extract: using mock extraction for ${firstCode}`);
        interaction = await this.aiInteractionsService.create({
          modelName: 'mock',
          feature: 'document_upload',
          promptText: 'mock_extraction',
          responseText: JSON.stringify(extraction),
          promptTokens: 0,
          completionTokens: 0,
          status: AiInteractionStatus.SUCCESS,
          metadataJson: { extraction: extraction as unknown as Record<string, unknown> },
        });
      } else {
        this.logger.log('upload-and-extract: LLM extraction (no AcroForm)');
        const llmResult = await this.documentExtractionService.extractFromPdfs([file], undefined, undefined, params.onProgress);
        extraction = llmResult.result;
        interaction = llmResult.interaction;
        pdfType = 'scanned_or_flattened';
      }
    }

    // Detect form code BEFORE generating compliance so we route to the correct validator
    const detectedCode = this.detectPrimaryFormCode(extraction);
    const resolvedStage = detectedCode
      ? (this.resolveStageFromFormCode(detectedCode) ?? stage)
      : stage;

    // Generate compliance using ONLY the validator set registered for the
    // detected form code — never RPA rules for a non-RPA-family document,
    // and never a guess when no form code was identified at all. Mirrors
    // DocumentPipelineService.complianceForFormCode() exactly (shares its
    // RPA_FAMILY_FORM_CODES set) so this hand-rolled upload path can't drift
    // from the pipeline's routing decision.
    if (detectedCode && RPA_FAMILY_FORM_CODES.has(detectedCode)) {
      compliance = this.rpaComplianceValidator.fromContractFamilyExtraction(detectedCode, extraction);
    } else if (detectedCode) {
      compliance = this.rpaComplianceValidator.fromDisclosureExtraction(
        detectedCode,
        extraction as unknown as Record<string, unknown>,
      );
    } else {
      compliance = this.rpaComplianceValidator.noValidationRequired();
    }
    const resolvedDocumentType = detectedCode
      ? (this.formCodeToDocumentType(detectedCode) ?? documentType)
      : documentType;
    const reclassified = resolvedStage.toLowerCase() !== stage.toLowerCase();
    const detectedFormName = detectedCode ? (getCarForm(detectedCode)?.name ?? null) : null;

    if (reclassified) {
      this.logger.log(
        `upload-and-extract: reclassified from "${stage}" → "${resolvedStage}" ` +
        `(detected form: ${detectedCode ?? 'unknown'})`,
      );
    }

    const activeDocs = detectedCode
      ? await this.documentsService.findActiveByTransactionAndStage(transactionId, resolvedStage)
      : [];

    const family = detectedCode ? getFamilyForFormCode(detectedCode) : null;
    const familyMatch = family && detectedCode
      ? findLatestInFamily(activeDocs, detectedCode)
      : null;

    const existingDoc = familyMatch !== null
      ? activeDocs[familyMatch.index]
      : this.findExactMatchInDocs(activeDocs, detectedCode);

    const { storageKey } = await this.s3.upload(
      transactionId,
      resolvedStage,
      file.originalname,
      file.buffer,
      file.mimetype,
    );

    let doc: TransactionDocumentEntity;
    let previousVersionId: string | null = null;
    let versionComparison: FormComparisonResult | null = null;
    let versionAction: 'none' | 'superseded' | 'void_suggested' = 'none';

    if (existingDoc) {
      const existingMeta = existingDoc.metadataJson as Record<string, unknown> | null;
      const existingFormCode = existingMeta?.detectedFormCode as string | undefined ?? null;

      const pending = await this.pendingUploadsService.create({
        transactionId,
        stage: resolvedStage,
        storageKey,
        fileName: file.originalname,
        mimeType: file.mimetype,
        title,
        detectedFormCode: detectedCode,
        extractionJson: extraction as unknown as Record<string, unknown>,
        complianceJson: compliance as unknown as Record<string, unknown>,
        pdfType,
        interactionId: interaction.id,
        existingDocId: existingDoc.id,
        existingFormCode,
        existingFormName: detectedFormName,
        existingVersionNo: existingDoc.versionNo,
        existingUploadedAt: existingDoc.createdAt,
      });

      this.logger.log(
        `upload-and-extract: duplicate ${detectedCode} detected — stored pending upload ${pending.id}` +
        ` (existing doc: ${existingDoc.id}, v${existingDoc.versionNo})`,
      );

      return {
        requiresConfirmation: true,
        pendingUploadId: pending.id,
        existingDocInfo: {
          id: existingDoc.id,
          formCode: existingFormCode,
          formName: detectedFormName,
          versionNo: existingDoc.versionNo,
          uploadedAt: existingDoc.createdAt,
        },
        submittedStage: stage,
        resolvedStage,
        resolvedDocumentType,
        reclassified,
        detectedFormCode: detectedCode,
        detectedFormName,
        hasPreviousVersion: true,
        previousVersionId: existingDoc.id,
        versionComparison: null,
        versionAction: 'superseded',
      };
    } else {
      this.logger.log(`upload-and-extract: creating new document (${detectedCode ?? 'unrecognized'})`);

      doc = await this.documentsService.uploadFile({
        transactionId,
        stage: resolvedStage,
        file,
        documentType: resolvedDocumentType,
        title,
      });
    }

    const metadataPatch: Record<string, unknown> = {
      extraction: extraction as unknown as Record<string, unknown>,
      compliance: compliance as unknown as Record<string, unknown>,
      extractedAt: new Date().toISOString(),
      pdfSource: pdfType === 'digital_acroform' ? 'acroform' : 'llm',
      detectedFormCode: detectedCode,
      submittedStage: stage,
      formCode: detectedCode,
      upload: {
        originalFileName: file.originalname,
        uploadedAt: new Date().toISOString(),
      },
    };

    if (versionComparison) {
      metadataPatch.versionComparison = versionComparison as unknown as Record<string, unknown>;
    }

    if (detectedCode && getFamilyForFormCode(detectedCode)) {
      const extractionData = extraction as unknown as Record<string, unknown>;
      const header = extractionData['header'] as Record<string, unknown> | undefined;
      const num = header?.['counter_offer_number'];
      if (typeof num === 'string' && num.length > 0) {
        metadataPatch.counterOfferNumber = num;
      }
    }

    await this.documentsService.patchMetadataJson(doc.id, metadataPatch);
    await this.documentsService.setAiInteractionId(doc.id, interaction.id);

    // Any successfully identified document must never sit at "not analyzed" once
    // identification/compliance has already been computed above — every other
    // consumer (swimlane, checklists, blocker summary, dropdown, reminder
    // schedulers) reads formCode + analysisStatus as the single source of truth,
    // never metadataJson alone. Applies to every stage, not just disclosures —
    // a contract-family document (RPA, SCO, SMCO, BCO) that never gets this must
    // never satisfy a checklist item, and would incorrectly surface as an
    // unrecognized/"Unknown Form" upload on external upload-link checklists.
    if (detectedCode) {
      await this.documentsService.updateAnalysisResult(doc.id, {
        analysisStatus: 'completed',
        formCode: detectedCode,
        analyzedAt: new Date(),
      });
    }

    // ── Per-form PDF splitting ─────────────────────────────────────────────────
    // Run the pipeline (split + classify only, no LLM extraction) to identify
    // form groups within the uploaded file. When multiple forms are detected,
    // the original combined file becomes an isOriginalPackage audit record,
    // and every form (including the primary) gets its own separated PDF.
    // Works for ALL PDF types (AcroForm and scanned/flattened).
    if (doc) {
      try {
        const pageResult = await this.pageRoutingPipeline.process(file.buffer, undefined, undefined, undefined, undefined, Infinity);

        if (pageResult.formGroups.length > 1) {
          const fileBuffers = new Map<string, Buffer>();
          fileBuffers.set(file.originalname, file.buffer);

          const allFiles = [{ file: file as Express.Multer.File, storageKey: doc.storageKey }];

          await this.createOriginalAndSeparatedForms({
            allFiles,
            fileBuffers,
            allExtractions: pageResult.extractions,
            extractionFileMap: new Map(pageResult.extractions.map((fe) => [fe, file.originalname])),
            transactionId,
            primaryDocId: doc.id,
            primaryFormCode: detectedCode ?? 'UNKNOWN',
            stage: resolvedStage,
            isUploadAndExtract: true,
            createdDocs: [] as TransactionDocumentEntity[],
          });

          // Reload doc to get updated storageKey and provenance
          doc = await this.documentsService.findOne(doc.id);
          this.logger.log(`upload-and-extract: created ${pageResult.formGroups.length - 1} per-form derived document(s)`);
        }
      } catch (err) {
        this.logger.warn(`Per-form PDF splitting failed (non-fatal): ${(err as Error).message}`);
      }
    }

    // ── Activate stage instance for the resolved stage ──────────────────────
    if (doc && resolvedStage && resolvedStage !== 'general') {
      await this.stageInstancesService.activateStage(transactionId, resolvedStage)
        .catch((err: Error) => this.logger.warn(`Stage activation failed for ${resolvedStage}: ${err.message}`));
    }

    const reasoningOutcome = await this.stageReasoning.runForStage(transactionId, resolvedStage);
    const reasoning = reasoningOutcome && !('skipped' in reasoningOutcome) ? reasoningOutcome : null;

    const updatedDoc = await this.documentsService.findOne(doc.id);

    await this.eventSeederService.seedFromExtraction(transactionId)
      .catch((err: Error) => this.logger.warn(`Event re-seed failed for ${transactionId} (non-fatal): ${err.message}`));

    await this.welcomeEmailService.sendWelcomeEmails(transactionId)
      .catch((err: Error) => this.logger.warn(`Welcome/timeline email re-check failed for ${transactionId} (non-fatal): ${err.message}`));

    return {
      document: updatedDoc,
      extraction,
      compliance,
      pdfType,
      submittedStage: stage,
      resolvedStage,
      resolvedDocumentType,
      reclassified,
      detectedFormCode: detectedCode,
      detectedFormName,
      reasoning,
      hasPreviousVersion: !!existingDoc,
      previousVersionId,
      versionNo: updatedDoc.versionNo,
      versionComparison,
      versionAction,
    };
  }

  /**
   * Parse and validate the optional mockExtractions form field.
   * Accepts a JSON string in multipart forms, parses it, and returns a
   * Record keyed by uppercase form code (e.g. 'RPA', 'TDS').
   * Returns null when no mock data was provided.
   */
  private parseMockExtractions(raw: string | undefined): Record<string, unknown> | null {
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (Object.keys(parsed).length === 0) return null;
      return parsed;
    } catch {
      this.logger.warn(`Invalid mockExtractions JSON: ${raw}`);
      return null;
    }
  }

  /**
   * Convert mock extractions to the pipeline's extractionSnaps format.
   * Each mock value becomes a FormExtractionOutput that the pipeline
   * uses instead of calling the LLM for that form code.
   */
  private mockExtractionsToSnaps(mockExtractions: Record<string, unknown>): Record<string, FormExtractionOutput> {
    const snaps: Record<string, FormExtractionOutput> = {};
    for (const [code, data] of Object.entries(mockExtractions)) {
      const upper = code.toUpperCase();
      const dataObj = data as Record<string, unknown>;
      snaps[upper] = {
        formCode: upper,
        formName: (dataObj.documentType as string | null) ?? null,
        data: dataObj,
        rawResponse: JSON.stringify(dataObj),
        promptTokens: 0,
        completionTokens: 0,
        modelName: 'mock',
      };
    }
    return snaps;
  }

  /**
   * Detects a provider-level failure (rate limit, quota, auth, network,
   * transient 5xx) as opposed to a legitimate "this isn't a recognized
   * form" classification. A thrown extraction error is unambiguous evidence
   * of a service issue regardless of which form it happened on — a form
   * that was correctly identified (e.g. RPA, via the deterministic text
   * path) can still fail extraction due to a transient AI-provider outage,
   * and that must never be treated the same as "this document isn't an
   * RPA". Returns the underlying error message when detected, otherwise
   * null.
   */
  private detectExtractionProviderFailure(result: PageRoutingPipelineResult): string | null {
    const failed = result.extractions.find((e) => e.error);
    return failed?.error ?? null;
  }

  /**
   * Returns true if the extraction result represents a Residential Purchase Agreement (RPA).
   * Checks documentType first, then falls back to the formsAndDisclosures list.
   */
  private isRpaDocument(extraction: ExtractionResult): boolean {
    const docType = (extraction.documentType ?? '').toLowerCase();

    if (
      /\brpa\b/.test(docType) ||
      /purchase\s{0,5}agreement/i.test(docType) ||
      /residential\s{0,10}purchase/i.test(docType)
    ) {
      return true;
    }

    return (extraction.formsAndDisclosures ?? []).some((f) => {
      const code = (f.formCode ?? '').toLowerCase();
      const title = f.title.toLowerCase();
      return (
        /\brpa\b/.test(code) ||
        /\brpa\b/.test(title) ||
        /purchase\s{0,5}agreement/i.test(title)
      );
    });
  }

  /**
   * Coerces the `transactionSide` body field ('BUYER' | 'SELLER') into the
   * CoordinatorSide enum. Anything other than an explicit 'SELLER' resolves to
   * BUYER — the backward-compatible default for clients that predate the
   * selector (the pre-existing upload flows never sent this field).
   *
   * Server-side half of the Create Transaction Seller Side lock (see
   * TransactionSideSelector.tsx for the UI half): while
   * TRANSACTION_FEATURES.sellerSideEnabled is false, an explicit 'SELLER'
   * request is rejected rather than silently coerced to BUYER, so a client
   * that intentionally asked for Seller Side never ends up with an
   * unintended Buyer Side transaction.
   */
  private normalizeTransactionSide(value?: string): CoordinatorSide {
    if (value === 'SELLER') {
      if (!TRANSACTION_FEATURES.sellerSideEnabled) {
        throw new ForbiddenException('Seller Side Transaction is not yet available.');
      }
      return CoordinatorSide.SELLER;
    }
    return CoordinatorSide.BUYER;
  }

  /**
   * Returns true if the acroResult has at least one non-signature field AND
   * ACROFORM_EXTRACTION_ENABLED is not explicitly 'false'.
   *
   * Set ACROFORM_EXTRACTION_ENABLED=false to skip AcroForm extraction entirely
   * and always use LLM extraction.
   */
  private hasDataFields(acroResult: AcroFormExtractionResult): boolean {
    if (process.env.ACROFORM_EXTRACTION_ENABLED === 'false') {
      return false;
    }
    return acroResult.fields.some(f => f.type !== 'signature');
  }

  /**
   * Finds the primary CAR form code from an extraction result.
   * Prefers forms explicitly marked as 'attached', then 'referenced'.
   */
  private detectPrimaryFormCode(extraction: ExtractionResult): string | null {
    const forms = extraction.formsAndDisclosures ?? [];

    // Prefer forms the LLM marked as physically present in the upload
    for (const status of ['attached', 'referenced'] as const) {
      const match = forms.find(
        (f) => f.status === status && f.formCode && f.formCode !== 'UNKNOWN',
      );
      if (match?.formCode) return match.formCode.toUpperCase();
    }

    // Last resort: check documentType string against known form names/codes
    const docType = (extraction.documentType ?? '').toUpperCase();
    if (docType) {
      const byCode = getCarForm(docType);
      if (byCode) return byCode.code;
    }

    return null;
  }

  /** Maps a CAR form category to the transaction stage where it belongs. */
  private resolveStageFromFormCode(formCode: string): string | null {
    const form = getCarForm(formCode);
    if (!form) return null;

    const CATEGORY_TO_STAGE: Record<FormCategory, string> = {
      purchase_agreement:      'contract',
      counter_offer:           'contract',
      listing_agreement:       'intake',
      buyer_representation:    'intake',
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
      closing:                 'closing',
      escrow:                  'escrow',
    };

    // Per-form overrides for codes whose category doesn't match their natural stage
    const FORM_STAGE_OVERRIDE: Record<string, string> = {
      PREQUAL: 'intake',
      POF:     'intake',
      PEAD:    'closing',
      WCI:     'closing',
      FIRPTA:  'closing',
      LPD:     'closing',
      VP:      'closing',
      LR:      'escrow',
      IA:      'escrow',
    };

    return FORM_STAGE_OVERRIDE[form.code.toUpperCase()]
      ?? CATEGORY_TO_STAGE[form.category]
      ?? null;
  }

  /** Maps a CAR form code to the documentType string stored on the document record. */
  private formCodeToDocumentType(formCode: string): string | null {
    const form = getCarForm(formCode);
    if (!form) return null;

    // Forms that have a stage override should use that stage's document type
    const FORM_DOC_TYPE_OVERRIDE: Record<string, string> = {
      PREQUAL: 'intake_document',
      POF:     'intake_document',
      PEAD:    'closing',
      WCI:     'closing',
      FIRPTA:  'closing',
      LPD:     'closing',
      VP:      'closing',
      LR:      'escrow',
      IA:      'escrow',
    };
    if (FORM_DOC_TYPE_OVERRIDE[form.code]) {
      return FORM_DOC_TYPE_OVERRIDE[form.code];
    }

    const CATEGORY_TO_DOC_TYPE: Record<FormCategory, string> = {
      purchase_agreement:      'purchase_agreement',
      counter_offer:           'purchase_agreement',
      listing_agreement:       'general',
      buyer_representation:    'general',
      disclosure:              'disclosure',
      advisory:                'disclosure',
      federal_compliance:      'disclosure',
      addendum:                'purchase_agreement',
      contingency_performance: 'inspection_report',
      inspection_repair:       'inspection_report',
      finance:                 'loan',
      commercial:              'purchase_agreement',
      lease_rental:            'general',
      probate_estate:          'disclosure',
      new_construction:        'purchase_agreement',
      property_management:     'general',
      closing:                 'closing',
      escrow:                  'escrow',
    };

    return CATEGORY_TO_DOC_TYPE[form.category] ?? 'general';
  }

  private inferDocumentType(stage: string): string {
    const map: Record<string, string> = {
      contract: 'purchase_agreement',
      disclosures: 'disclosure',
      inspection: 'inspection_report',
      appraisal: 'appraisal',
      loan: 'loan',
      escrow: 'escrow',
      closing: 'closing',
      post_close: 'general',
      intake: 'general',
    };
    return map[stage.toLowerCase()] ?? 'general';
  }

  /** Merge multiple PDF buffers into a single PDF, repairing malformed files via qpdf. */
  private async mergePdfBuffers(buffers: Buffer[]): Promise<Buffer> {
    if (buffers.length === 1) return buffers[0];
    const { PDFDocument } = await import('pdf-lib');
    const { writeFile, readFile, unlink } = await import('fs/promises');
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    const merged = await PDFDocument.create();
    let loaded = 0;
    for (const buf of buffers) {
      let src: Awaited<ReturnType<typeof PDFDocument.load>> | null = null;

      // Decrypt encrypted PDFs (e.g. RC4-encrypted SCO forms) before loading,
      // since pdf-lib's ignoreEncryption loads garbled content streams.
      let loadBuf = buf;
      loadBuf = await this.decryptPdfIfNeeded(buf);

      try {
        src = await PDFDocument.load(loadBuf, { ignoreEncryption: true });
      } catch {
        // Try repairing with qpdf
        const tmpIn = `/tmp/merge-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`;
        const tmpOut = `/tmp/merge-${Date.now()}-${Math.random().toString(36).slice(2)}-repaired.pdf`;
        try {
          await writeFile(tmpIn, buf);
          await execAsync(`qpdf --linearize "${tmpIn}" "${tmpOut}"`);
          const repaired = await readFile(tmpOut);
          src = await PDFDocument.load(repaired, { ignoreEncryption: true });
        } catch (repairErr) {
          this.logger.warn(`Skipping unrepairable PDF: ${(repairErr as Error).message}`);
          continue;
        } finally {
          await unlink(tmpIn).catch(() => {});
          await unlink(tmpOut).catch(() => {});
        }
      }
      if (src) {
        try {
          const pages = await merged.copyPages(src, src.getPageIndices());
          for (const page of pages) merged.addPage(page);
          loaded++;
        } catch (copyErr) {
          this.logger.warn(`Skipping PDF (copyPages failed): ${(copyErr as Error).message}`);
        }
      }
    }
    if (loaded === 0) {
      throw new Error('All uploaded PDFs are corrupt or unreadable');
    }
    return Buffer.from(await merged.save());
  }

  /**
   * Decrypt an encrypted PDF (e.g. RC4-encrypted SCO forms) using qpdf,
   * since pdf-lib's ignoreEncryption produces garbled content streams.
   * Returns the original buffer if the PDF is not encrypted.
   */
  private async decryptPdfIfNeeded(buf: Buffer): Promise<Buffer> {
    const { writeFile, readFile, unlink } = await import('fs/promises');
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    if (!buf.includes('/Encrypt')) return buf;

    const tmpIn = `/tmp/decrypt-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`;
    const tmpOut = `/tmp/decrypt-${Date.now()}-${Math.random().toString(36).slice(2)}-decrypted.pdf`;
    try {
      await writeFile(tmpIn, buf);
      await execAsync(`qpdf --decrypt --linearize "${tmpIn}" "${tmpOut}"`);
      return await readFile(tmpOut);
    } catch {
      this.logger.warn('Failed to decrypt encrypted PDF via qpdf, falling back to raw buffer');
      return buf;
    } finally {
      await unlink(tmpIn).catch(() => {});
      await unlink(tmpOut).catch(() => {});
    }
  }

  /**
   * When an RR or RRRR document is detected during upload, automatically
   * trigger the repair request workflow: create pending RR or mark RRRR received.
   */
  private async handleRepairRequestDetection(
    transactionId: string,
    detectedFormCode: string,
    documentId: string,
  ): Promise<void> {
    const code = detectedFormCode.toUpperCase();

    if (code === 'RR') {
      try {
        await this.repairRequestsService.createRepairRequest({
          transactionId,
          rrDocumentId: documentId,
        });
        this.logger.log(`RR auto-detected and workflow created for tx=${transactionId.slice(0, 8)} doc=${documentId.slice(0, 8)}`);
      } catch (err) {
        this.logger.warn(`RR auto-detection failed (non-fatal): ${(err as Error).message}`);
      }
    } else if (code === 'RRRR') {
      try {
        await this.repairRequestsService.receiveRrrr({
          transactionId,
          rrrrDocumentId: documentId,
        });
        this.logger.log(`RRRR auto-detected and workflow updated for tx=${transactionId.slice(0, 8)} doc=${documentId.slice(0, 8)}`);
      } catch (err) {
        this.logger.warn(`RRRR auto-detection failed (non-fatal): ${(err as Error).message}`);
      }
    }

    // Notify Seller Agent for any contingency-related document
    if (['RR', 'RRRR', 'CR-B', 'CR', 'CR-S', 'BIW', 'TIR', 'ICR'].includes(code)) {
      try {
        await this.notifySellerAgentOfContingencyDoc(transactionId, code, documentId);
      } catch (err) {
        this.logger.warn(`Seller agent notification failed (non-fatal): ${(err as Error).message}`);
      }
    }
  }

  /**
   * When a VP (Verification of Property) form is detected during upload,
   * automatically mark it as received and validated in the VP workflow.
   */
  private async handleVpDetection(
    transactionId: string,
    detectedFormCode: string,
    documentId: string,
  ): Promise<void> {
    const code = detectedFormCode.toUpperCase();
    if (code !== 'VP') return;

    try {
      const vp = await this.vpService.findByTransaction(transactionId);
      if (vp) {
        await this.vpService.markDocumentReceived(vp.id, documentId);
        await this.vpService.markValidated(vp.id);
        this.logger.log(
          `VP form auto-detected and validated for tx=${transactionId.slice(0, 8)} doc=${documentId.slice(0, 8)}`,
        );
      }
    } catch (err) {
      this.logger.warn(`VP auto-detection failed (non-fatal): ${(err as Error).message}`);
    }
  }

  /**
   * Notify the Seller Agent that a contingency document has been uploaded.
   * Sends an email via the transaction's outbound email address and records
   * a transaction message for the swimlane.
   */
  private async notifySellerAgentOfContingencyDoc(
    transactionId: string,
    formCode: string,
    documentId: string,
  ): Promise<void> {
    const tx = await this.transactionsService.findOne(transactionId);
    if (!tx) return;

    const sellerAgent = await this.partyRepo.findOne({
      where: { transactionId, partyRole: 'seller_agent' as any },
    });
    if (!sellerAgent?.email) return;

    const propertyAddress = [tx.propertyAddressLine1, tx.propertyCity, tx.propertyState]
      .filter(Boolean).join(', ');

    const docDesc = {
      RR: 'Request for Repairs (RR)',
      RRRR: "Seller's Response to Request for Repairs (RRRR)",
      'CR-B': 'Contingency Removal (CR-B)',
      CR: 'Contingency Removal',
      'CR-S': 'Contingency Removal (Seller)',
      BIW: 'Home Inspection Report',
      TIR: 'Termite Inspection Report',
      ICR: 'Inspection Contingency Removal',
    }[formCode] ?? `${formCode} document`;

    const subject = `${docDesc} uploaded — ${propertyAddress}`;
    const html = `<p>A contingency document (<strong>${docDesc}</strong>) has been uploaded for the transaction at <strong>${propertyAddress}</strong> (Transaction #${tx.transactionNumber}).</p>`;
    const text = html.replace(/<[^>]*>/g, '');

    await this.mailgunService.sendEmail(
      sellerAgent.email,
      subject,
      `<div style="font-family:Arial;max-width:480px;margin:0 auto;background:#fff;padding:24px;">${html}</div>`,
      text,
      tx.outboundEmailAddress ?? undefined,
    );

    await this.messageRepo.save(
      this.messageRepo.create({
        transactionId,
        channel: MessageChannel.EMAIL,
        direction: MessageDirection.OUTBOUND,
        status: MessageStatus.SENT,
        subject,
        bodyText: text,
        providerName: 'mailgun',
        recipientPartyId: sellerAgent.id,
        stage: 'inspection',
        sentAt: new Date(),
        metadataJson: { to: sellerAgent.email, role: 'seller_agent', formCode, documentId, eventType: 'CONTINGENCY_DOC_UPLOADED' },
      }),
    );

    this.logger.log(`Seller Agent notified: ${formCode} for tx=${transactionId.slice(0, 8)}`);
  }

  /**
   * Sends a confirmation email to the TC when background document processing completes.
   */
  private async notifyTcOnCompletion(
    result: DraftTransactionResult,
    createdByAccountId: string,
  ): Promise<void> {
    try {
      const account = await this.accountsService.findOne(createdByAccountId);
      if (!account?.user?.email) return;
      const tcEmail = account.user.email;

      const tx = result.transaction;
      const propertyAddress = [tx.propertyAddressLine1, tx.propertyCity, tx.propertyState]
        .filter(Boolean).join(', ');

      const webUrl = process.env.WEB_APP_URL ?? 'http://localhost:3001';
      const txUrl = `${webUrl}/dashboard/transactions/${tx.id}`;

      const html = `<!DOCTYPE html><html><body style="font-family:Arial;background:#f8fafc;padding:32px;">
        <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:40px;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <div style="background:#1d4ed8;color:#fff;font-size:18px;font-weight:700;padding:10px 16px;border-radius:8px;display:inline-block;margin-bottom:24px;">TC</div>
          <h2 style="color:#111827;font-size:20px;margin:0 0 8px;">Transaction Processing Complete</h2>
          <p style="color:#6b7280;font-size:14px;margin:0 0 24px;">
            Your transaction at <strong>${propertyAddress}</strong> has been processed successfully and is ready for review.
          </p>
          <div style="margin:24px 0;">
            <a href="${txUrl}" style="display:inline-block;background:#1d4ed8;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:15px;font-weight:600;">Open Transaction</a>
          </div>
          <p style="color:#6b7280;font-size:13px;margin:0;">Transaction #${tx.transactionNumber}</p>
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
          <p style="color:#9ca3af;font-size:12px;margin:0;text-align:center;">TC Platform — Real Estate Transaction Coordination</p>
        </div></body></html>`;

      const text = `Transaction Processing Complete\n\nYour transaction at ${propertyAddress} has been processed successfully and is ready for review.\n\nOpen: ${txUrl}\n\nTransaction #${tx.transactionNumber}`;

      await this.mailgunService.sendEmail(tcEmail, `Transaction Ready: ${propertyAddress}`, html, text);
      this.logger.log(`Sent completion email to ${tcEmail} for tx=${tx.transactionNumber}`);
    } catch (err) {
      this.logger.warn(`Failed to send completion email: ${(err as Error).message}`);
    }
  }

  /**
   * Re-run disclosure-stage validation for all active disclosure documents in a
   * transaction and patch metadataJson.compliance with the updated results.
   * Useful when existing documents were processed before a validator fix (e.g.
   * BHIA fallback was missing checks).
   *
   * POST /document-extraction/revalidate-disclosures/:transactionId
   */
  @Post('revalidate-disclosures/:transactionId')
  async revalidateDisclosures(@Param('transactionId') transactionId: string) {
    const FORM_CODE_DISCLOSURE_TYPES = [
      'disclosure', 'tbs', 'avds', 'nhd', 'avid', 'bia', 'bhia',
      'tds', 'spq', 'hoa', 'cc&rs', 'other',
    ];

    const allDocs = await this.documentsService.findByTransaction(transactionId);
    const disclosureDocs = allDocs.filter(
      (d) =>
        d.status !== DocumentStatus.SUPERSEDED &&
        d.status !== DocumentStatus.REJECTED &&
        FORM_CODE_DISCLOSURE_TYPES.includes(d.documentType.toLowerCase()),
    );

    let revalidated = 0;
    let skipped = 0;
    const results: Array<{ docId: string; formCode: string; checksCount: number; blockerCount: number; warningCount: number }> = [];

    for (const doc of disclosureDocs) {
      const meta = doc.metadataJson as Record<string, unknown> | null;
      const extraction = meta?.extraction as Record<string, unknown> | undefined;
      const formCode = (doc.formCode ?? (meta?.detectedFormCode as string | undefined) ?? null)?.toUpperCase() ?? null;

      if (!formCode || !extraction) {
        skipped++;
        continue;
      }

      const updatedCompliance = this.rpaComplianceValidator.fromDisclosureExtraction(formCode, extraction);
      await this.documentsService.patchMetadataJson(doc.id, { compliance: updatedCompliance });

      revalidated++;
      results.push({
        docId: doc.id,
        formCode,
        checksCount: updatedCompliance.checks?.length ?? 0,
        blockerCount: updatedCompliance.blockers?.length ?? 0,
        warningCount: updatedCompliance.warnings?.length ?? 0,
      });
    }

    this.logger.log(
      `revalidate-disclosures: tx=${transactionId} revalidated=${revalidated} skipped=${skipped}`,
    );

    return { transactionId, revalidated, skipped, results };
  }

  /**
   * Sends a failure notification to the TC when background processing fails.
   */
  private async notifyTcOnFailure(
    errorMessage: string,
    createdByAccountId: string,
  ): Promise<void> {
    try {
      const account = await this.accountsService.findOne(createdByAccountId);
      if (!account?.user?.email) return;
      const tcEmail = account.user.email;

      const webUrl = process.env.WEB_APP_URL ?? 'http://localhost:3001';
      const transactionsUrl = `${webUrl}/dashboard`;

      const html = `<!DOCTYPE html><html><body style="font-family:Arial;background:#f8fafc;padding:32px;">
        <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:40px;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <div style="background:#dc2626;color:#fff;font-size:18px;font-weight:700;padding:10px 16px;border-radius:8px;display:inline-block;margin-bottom:24px;">TC</div>
          <h2 style="color:#111827;font-size:20px;margin:0 0 8px;">Transaction Processing Failed</h2>
          <p style="color:#6b7280;font-size:14px;margin:0 0 16px;">
            An error occurred while processing your transaction documents.
          </p>
          <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px;margin-bottom:24px;">
            <p style="color:#991b1b;font-size:13px;margin:0;">${errorMessage}</p>
          </div>
          <p style="color:#6b7280;font-size:13px;margin:0 0 24px;">
            Please try uploading your documents again. If the problem persists, verify that the uploaded files are valid PDF documents containing a Residential Purchase Agreement (RPA).
          </p>
          <div style="margin:24px 0;">
            <a href="${transactionsUrl}" style="display:inline-block;background:#1d4ed8;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:15px;font-weight:600;">Go to Dashboard</a>
          </div>
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
          <p style="color:#9ca3af;font-size:12px;margin:0;text-align:center;">TC Platform — Real Estate Transaction Coordination</p>
        </div></body></html>`;

      const text = `Transaction Processing Failed\n\nError: ${errorMessage}\n\nPlease try uploading your documents again.\n\nGo to Dashboard: ${transactionsUrl}`;

      await this.mailgunService.sendEmail(tcEmail, 'Transaction Processing Failed', html, text);
      this.logger.log(`Sent failure email to ${tcEmail}`);
    } catch (err) {
      this.logger.warn(`Failed to send failure email: ${(err as Error).message}`);
    }
  }
}
