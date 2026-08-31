import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TransactionFormTemplateEntity } from './entities/transaction-form-template.entity';
import { TransactionFormTemplateItemEntity } from './entities/transaction-form-template-item.entity';
import { CreateFormTemplateInput } from './dto/create-form-template.input';
import { AddFormTemplateItemInput } from './dto/add-form-template-item.input';
import { CAR_FORMS, CarFormMetadata, getCarForm } from './metadata/car-forms.metadata';
import { TransactionEntity } from '../transactions/entities/transaction.entity';
import { TransactionDocumentsService } from '../transaction-documents/transaction-documents.service';
import { DocumentStatus, TransactionDocumentEntity } from '../transaction-documents/entities/transaction-document.entity';
import { ALL_DEDICATED_DOCUMENT_TYPES, REQUIRED_BUYER_AGENT_DOCUMENT_TYPES, REQUIRED_ESCROW_DOCUMENT_TYPES, HOA_DOCUMENT_TYPE } from '../upload-links/upload-link.types';
import { HoaInformationEntity } from '../transaction-contact-information/entities/hoa-information.entity';
import { matchDocumentsToChecklist, matchDocumentsToSellerAgentChecklist, computeValidationStatus, buildDocumentValidation, ChecklistItemDto, ChecklistItemStatus, ChecklistMatchedDocument, DocumentValidationDto, SellerAgentDocumentDocusignDto } from './checklist-matching.util';
import { FinalTermsService } from '../transactions/final-terms.service';
import { addBusinessAdjustedDays } from '../transactions/business-day.util';
import { TransactionClockService, resolveNow } from '../transaction-clock/transaction-clock.service';
import { BlockerOverrideService } from '../blocker-overrides/blocker-override.service';
import type { TransactionBlockerOverrideEntity } from '../blocker-overrides/entities/transaction-blocker-override.entity';
import { isRpaEscrowPage17Completed } from './rpa-escrow-page17.util';
import { CDA_DOCUMENT_TYPE, SIGNED_CDA_DOCUMENT_TYPE } from '../cda/cda.constants';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

type ContingencyType = 'inspection' | 'loan' | 'appraisal';

/** Buyer Agent checklist only: the 3 contingency-removal items, conditionally shown when their contingency applies. */
const CONTINGENCY_REMOVAL_LABELS: Record<ContingencyType, string> = {
  inspection: 'Inspection Contingency Removal',
  loan: 'Loan Contingency Removal',
  appraisal: 'Appraisal Contingency Removal',
};

function parseIsoDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Whether a template item is the Seller Agent's own responsibility to upload —
 * derived from the CAR form registry's `applicableTo` classification (the
 * existing, single curated source of truth for "who is this form relevant to"
 * across all 78 forms), never a separate hard-coded seller-document list. A
 * form code with no registry entry (e.g. a brokerage's own custom form) is
 * never silently hidden — it's included by default rather than dropped for
 * lack of classification.
 */
function isSellerAgentResponsibility(formCode: string): boolean {
  const meta = getCarForm(formCode);
  if (!meta) return true;
  return meta.applicableTo.some((side) => side === 'seller_side' || side === 'both' || side === 'dual_agency');
}

/** First occurrence wins — a template is not expected to have duplicate form codes (assertFormCodeAvailable enforces that at write time), but this is the checklist's own defensive guarantee against ever rendering the same form twice. */
function dedupeByFormCode<T extends { formCode: string }>(items: T[]): T[] {
  const seen = new Map<string, T>();
  for (const item of items) {
    if (!seen.has(item.formCode)) seen.set(item.formCode, item);
  }
  return [...seen.values()];
}

export type { ChecklistItemStatus, ChecklistMatchedDocument, ChecklistItemDto };
export type UnmatchedDocumentStatus = 'uploaded' | 'analyzing' | 'analysis_failed' | 'unknown_form' | 'needs_review' | 'original';

export interface UnmatchedDocumentDto {
  id: string;
  fileName: string | null;
  formType: string | null;
  status: UnmatchedDocumentStatus;
  uploadedAt: Date;
  /** True for the original combined file once it's been split into per-form documents — lets the UI badge it as "Original" rather than an unrecognized upload. */
  isOriginalPackage: boolean;
  /** The original file's document id, for a document that was split out of a combined PDF — null for the original itself and for any document that was never split. */
  sourceDocumentId: string | null;
  /** Seller Agent checklist only, attached post-hoc by SellerAgentDocumentDocusignService.enrichChecklistWithDocusignInfo — null everywhere else. */
  validation?: DocumentValidationDto | null;
  /** Seller Agent checklist only — same enrichment step. */
  docusign?: SellerAgentDocumentDocusignDto | null;
}

export interface DocumentChecklistStatus {
  items: ChecklistItemDto[];
  /** Always-present, never-required items (currently RR/RRRR on the Buyer Agent checklist only) — deliberately excluded from requiredCount/submittedCount/allRequiredSubmitted so their absence can never block anything those drive (welcome-email timing, DocuSign eligibility, etc.). Empty for every checklist that doesn't define any. */
  optionalItems: ChecklistItemDto[];
  unmatchedDocuments: UnmatchedDocumentDto[];
  requiredCount: number;
  submittedCount: number;
  allRequiredSubmitted: boolean;
}

/** Buyer Agent checklist only: RR and RRRR are always shown, on every transaction, regardless of which CAR-form template resolves — optional, so their absence never blocks anything. */
const BUYER_AGENT_OPTIONAL_FORM_ITEMS = [
  { key: 'RR', label: 'Request for Repair', category: 'inspection_repair' },
  { key: 'RRRR', label: "Seller's Response to Buyer's Request for Repair", category: 'inspection_repair' },
];

/**
 * `isOriginalPackage` takes priority over every other signal — once a combined
 * PDF has been split, its original row is a pure "here's the file you
 * uploaded" record (formCode cleared, analysis already complete), never a
 * "needs review"/"unknown form" state, even though its own formCode/analysisStatus
 * values would otherwise map to one of those.
 */
function unmatchedStatusFor(analysisStatus: string | null, formCode: string | null, isOriginalPackage: boolean): UnmatchedDocumentStatus {
  if (isOriginalPackage) return 'original';
  if (analysisStatus === 'analyzing') return 'analyzing';
  if (analysisStatus === 'failed') return 'analysis_failed';
  if (analysisStatus === 'completed') return formCode ? 'unknown_form' : 'needs_review';
  return 'uploaded'; // defensive fallback — not a reachable persisted state, mirrors the same convention used elsewhere
}

@Injectable()
export class TransactionFormTemplatesService {
  constructor(
    @InjectRepository(TransactionFormTemplateEntity)
    private readonly templateRepo: Repository<TransactionFormTemplateEntity>,

    @InjectRepository(TransactionFormTemplateItemEntity)
    private readonly itemRepo: Repository<TransactionFormTemplateItemEntity>,

    @InjectRepository(TransactionDocumentEntity)
    private readonly documentsRepo: Repository<TransactionDocumentEntity>,

    @InjectRepository(HoaInformationEntity)
    private readonly hoaInfoRepo: Repository<HoaInformationEntity>,

    private readonly documentsService: TransactionDocumentsService,
    private readonly clockService: TransactionClockService,
    private readonly blockerOverrideService: BlockerOverrideService,
    private readonly finalTermsService: FinalTermsService,
  ) {}

  // ── Templates ───────────────────────────────────────────────────────────────

  /** List all templates visible to an org: system templates + org's own templates */
  async listForOrg(
    organizationId?: string,
    transactionType?: string,
    side?: string,
    stateCode?: string,
  ): Promise<TransactionFormTemplateEntity[]> {
    const qb = this.templateRepo.createQueryBuilder('t')
      .leftJoinAndSelect('t.items', 'items')
      .where('t.isActive = true')
      .andWhere(
        organizationId
          ? '(t.organizationId IS NULL OR t.organizationId = :orgId)'
          : 't.organizationId IS NULL',
        { orgId: organizationId },
      )
      .andWhere('(t.effective_date IS NULL OR t.effective_date <= CURRENT_DATE)')
      .andWhere('(t.retired_date IS NULL OR t.retired_date > CURRENT_DATE)')
      .orderBy('t.isSystem', 'DESC')
      .addOrderBy('t.name', 'ASC')
      .addOrderBy('items.sortOrder', 'ASC');

    if (transactionType) qb.andWhere('t.transactionType = :transactionType', { transactionType });
    if (side)            qb.andWhere('t.side = :side', { side });
    if (stateCode)       qb.andWhere('(t.stateCode = :stateCode OR t.stateCode IS NULL)', { stateCode });

    return qb.getMany();
  }

  async findById(id: string): Promise<TransactionFormTemplateEntity> {
    const template = await this.templateRepo.findOne({
      where: { id },
      relations: ['items'],
      order: { items: { sortOrder: 'ASC' } },
    });
    if (!template) throw new NotFoundException(`Form template ${id} not found`);
    return template;
  }

  async create(input: CreateFormTemplateInput): Promise<TransactionFormTemplateEntity> {
    const template = this.templateRepo.create({
      ...input,
      isSystem: false,
      isActive: input.isActive ?? true,
    });
    return this.templateRepo.save(template);
  }

  async update(
    id: string,
    patch: { name?: string; description?: string | null; isActive?: boolean; effectiveDate?: string | null; retiredDate?: string | null; docusignTemplateId?: string | null },
  ): Promise<TransactionFormTemplateEntity> {
    const dbPatch: Record<string, unknown> = {};
    if (patch.name !== undefined) dbPatch.name = patch.name;
    if (patch.description !== undefined) dbPatch.description = patch.description;
    if (patch.isActive !== undefined) dbPatch.isActive = patch.isActive;
    if (patch.effectiveDate !== undefined) dbPatch.effectiveDate = patch.effectiveDate || null;
    if (patch.retiredDate !== undefined) dbPatch.retiredDate = patch.retiredDate || null;
    if (patch.docusignTemplateId !== undefined) dbPatch.docusignTemplateId = patch.docusignTemplateId || null;

    await this.templateRepo.update(id, dbPatch);
    return this.findById(id);
  }

  async delete(id: string): Promise<void> {
    await this.templateRepo.delete(id);
  }

  // ── Items ────────────────────────────────────────────────────────────────────

  /**
   * CAR forms catalog for the template builder picker. Filters by transaction
   * side (matching 'both' / 'dual_agency' as applicable) and transaction type.
   */
  listCarForms(params: { side?: string; transactionType?: string }): CarFormMetadata[] {
    let forms = CAR_FORMS;
    if (params.side) {
      const side = params.side === 'dual' ? 'dual_agency' : params.side;
      forms = forms.filter(
        (f) => f.applicableTo.includes(side as CarFormMetadata['applicableTo'][number]) || f.applicableTo.includes('both'),
      );
    }
    if (params.transactionType) {
      forms = forms.filter(
        (f) => f.transactionTypes.includes(params.transactionType as CarFormMetadata['transactionTypes'][number]),
      );
    }
    return forms;
  }

  /** Reject a second item with the same formCode within one template (case-insensitive). */
  private async assertFormCodeAvailable(templateId: string, formCode: string, excludeItemId?: string): Promise<void> {
    const existing = await this.itemRepo
      .createQueryBuilder('item')
      .where('item.templateId = :templateId', { templateId })
      .andWhere('UPPER(item.formCode) = UPPER(:formCode)', { formCode })
      .andWhere(excludeItemId ? 'item.id != :excludeItemId' : '1=1', { excludeItemId })
      .getOne();
    if (existing) {
      throw new ConflictException(`Form ${formCode} is already in this template`);
    }
  }

  async addItem(
    templateId: string,
    input: AddFormTemplateItemInput,
  ): Promise<TransactionFormTemplateItemEntity> {
    // Verify template exists
    await this.findById(templateId);
    await this.assertFormCodeAvailable(templateId, input.formCode);

    const item = this.itemRepo.create({
      templateId,
      formCode:   input.formCode,
      formName:   input.formName,
      category:   input.category,
      isRequired: input.isRequired ?? true,
      sortOrder:  input.sortOrder  ?? 100,
      stage:      input.stage      ?? null,
    });
    return this.itemRepo.save(item);
  }

  async removeItem(templateId: string, itemId: string): Promise<void> {
    await this.itemRepo.delete({ id: itemId, templateId });
  }

  async updateItem(
    templateId: string,
    itemId: string,
    patch: Partial<Pick<TransactionFormTemplateItemEntity, 'formCode' | 'formName' | 'category' | 'isRequired' | 'sortOrder' | 'stage' | 'docusignTemplateId'>>,
  ): Promise<TransactionFormTemplateItemEntity> {
    await this.findById(templateId);
    if (patch.formCode) {
      await this.assertFormCodeAvailable(templateId, patch.formCode, itemId);
    }
    await this.itemRepo.update({ id: itemId, templateId }, patch);
    const item = await this.itemRepo.findOne({ where: { id: itemId, templateId } });
    if (!item) throw new NotFoundException(`Form template item ${itemId} not found in template ${templateId}`);
    return item;
  }

  async reorderItems(
    templateId: string,
    orderedItemIds: string[],
  ): Promise<TransactionFormTemplateItemEntity[]> {
    await Promise.all(
      orderedItemIds.map((id, index) =>
        this.itemRepo.update({ id, templateId }, { sortOrder: (index + 1) * 100 }),
      ),
    );
    const template = await this.findById(templateId);
    return template.items ?? [];
  }

  // ── Form resolution for a transaction ────────────────────────────────────────

  /**
   * Resolve the best matching form template for a transaction's attributes.
   * Preference order: org-specific state > org-specific national > system state > system national.
   */
  async resolveForTransaction(params: {
    organizationId?: string;
    stateCode?: string;
    transactionType: string;
    side: string;
  }): Promise<TransactionFormTemplateEntity | null> {
    const { organizationId, stateCode, transactionType, side } = params;

    const candidates = await this.listForOrg(organizationId, transactionType, side, stateCode);
    if (candidates.length === 0) return null;

    // Score: +4 org match, +2 state match, +1 system template (lower is preferred)
    const scored = candidates.map((t) => {
      let score = 0;
      if (t.organizationId === organizationId) score += 4;
      if (t.stateCode === stateCode)           score += 2;
      if (t.isSystem)                          score += 1;
      return { template: t, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored[0].template;
  }

  /**
   * The transaction's own persisted template selection — the Brokerage Template
   * chosen at transaction setup (`tx.formTemplateId`) — is the source of truth
   * whenever present; only a transaction that was never given an explicit
   * selection falls back to `resolveForTransaction`'s org/state/type/side best
   * match. Re-read (never cached) on every call, so a template swapped mid-
   * transaction is reflected on the very next checklist fetch. Shared by both
   * the Buyer Agent and Seller Agent checklists so neither can silently diverge
   * from the template DocuSign envelope generation already keys off `tx.formTemplateId`
   * for (see docusign.service.ts).
   */
  private async resolveTemplateForTransaction(tx: TransactionEntity): Promise<TransactionFormTemplateEntity | null> {
    if (tx.formTemplateId) {
      const explicit = await this.templateRepo.findOne({
        where: { id: tx.formTemplateId },
        relations: ['items'],
        order: { items: { sortOrder: 'ASC' } },
      });
      if (explicit) return explicit;
    }
    return this.resolveForTransaction({
      organizationId: tx.organizationId ?? undefined,
      stateCode: tx.propertyState ?? undefined,
      transactionType: tx.transactionType,
      side: tx.side,
    });
  }

  /**
   * Per-item document checklist for a transaction — generalizes the same
   * resolve-template → diff-against-uploaded-formCodes match already used
   * (as a boolean) by TransactionWelcomeEmailService.documentsComplete().
   * A CAR-form item only becomes 'submitted' once a matching document has
   * completed analysis; an in-flight document can't be attributed to a
   * specific item until then, so it only ever appears in unmatchedDocuments
   * while analyzing. No resolvable template → the CAR-form items are simply
   * absent (same convention as documentsComplete()). The two dedicated
   * Buyer Agent document types (Lender Prequalification Letter, Buyer Proof
   * of Funds) are always included as required items regardless of template
   * resolution — see dedicatedItems below.
   */
  async getChecklistStatus(tx: TransactionEntity, rejectedFormCodes: ReadonlySet<string> = new Set()): Promise<DocumentChecklistStatus> {
    const template = await this.resolveTemplateForTransaction(tx);

    const requiredItems = (template?.items ?? [])
      .filter((item) => item.isRequired)
      .sort((a, b) => a.sortOrder - b.sortOrder);

    const activeDocs = await this.documentsService.findActiveByTransactionForChecklist(tx.id);
    const specialTypes = new Set(ALL_DEDICATED_DOCUMENT_TYPES);

    // Fetched once and threaded through every matcher below — the single
    // resolution point that makes the Buyer Agent checklist immediately
    // reflect a blocker overridden anywhere else on the transaction.
    const overrides = await this.blockerOverrideService.findForTransaction(tx.id);

    // The Lender Prequalification Letter and Buyer Proof of Funds are always required on
    // the checklist, independent of any resolved CAR-form template — they're tagged
    // deterministically via their own dedicated upload buttons (not automatic form
    // classification), so "submitted" only needs the matching document to be present;
    // analysis, if it ever resolves, only supplies an optional form-type tag, never a gate.
    const dedicatedItems = matchDocumentsToChecklist(
      REQUIRED_BUYER_AGENT_DOCUMENT_TYPES.map((req) => ({ key: req.documentType, label: req.label, category: 'buyer_agent_required_document' })),
      activeDocs,
      'documentType',
      overrides,
    );

    const formTemplateItems = matchDocumentsToChecklist(
      requiredItems.map((reqItem) => ({ key: reqItem.formCode, label: reqItem.formName, category: reqItem.category })),
      activeDocs,
      'formCode',
      overrides,
    );

    // Inspection/Loan/Appraisal Contingency Removal — genuinely required (when the
    // corresponding contingency applies), so folded into `items` alongside the CAR-form
    // and dedicated items above, not into `optionalItems`.
    const contingencyRemovalItems = await this.computeContingencyRemovalItems(tx.id, activeDocs, rejectedFormCodes, overrides);

    // Verification of Property — unconditionally required, with a deadline tied to Close of Escrow.
    const verificationOfPropertyItems = await this.computeVerificationOfPropertyItem(tx.id, activeDocs, rejectedFormCodes, overrides);

    const items: ChecklistItemDto[] = [...dedicatedItems, ...formTemplateItems, ...contingencyRemovalItems, ...verificationOfPropertyItems];

    const requiredFormCodes = new Set(requiredItems.map((i) => i.formCode));
    const optionalFormCodes = new Set(BUYER_AGENT_OPTIONAL_FORM_ITEMS.map((i) => i.key));
    const unmatchedDocuments: UnmatchedDocumentDto[] = activeDocs
      .filter((d) => !specialTypes.has(d.documentType))
      .filter((d) => !(d.formCode && requiredFormCodes.has(d.formCode) && d.analysisStatus === 'completed'))
      .filter((d) => !(d.formCode && optionalFormCodes.has(d.formCode) && d.analysisStatus === 'completed'))
      .filter((d) => d.formCode !== 'CR-B')
      .filter((d) => d.formCode !== 'VP')
      .map((d) => ({
        id: d.id,
        fileName: d.fileName,
        formType: d.formCode,
        status: unmatchedStatusFor(d.analysisStatus, d.formCode, d.isOriginalPackage),
        uploadedAt: d.createdAt,
        isOriginalPackage: d.isOriginalPackage,
        sourceDocumentId: d.sourceDocumentId,
        validation: buildDocumentValidation(d, overrides),
      }));

    const submittedCount = items.filter((i) => i.status === 'submitted').length;

    // RR/RRRR: always shown, never required — reuses the Seller Agent checklist's 4-state
    // matcher (submitted/analyzing/reupload_required/required) purely for its behavior, not
    // its name; kept out of `items` entirely so their presence/absence can never affect
    // requiredCount/submittedCount/allRequiredSubmitted below.
    const optionalItems = matchDocumentsToSellerAgentChecklist(BUYER_AGENT_OPTIONAL_FORM_ITEMS, activeDocs, rejectedFormCodes, overrides);

    return {
      items,
      optionalItems,
      unmatchedDocuments,
      requiredCount: items.length,
      submittedCount,
      allRequiredSubmitted: submittedCount === items.length,
    };
  }

  /**
   * Buyer Agent checklist only: Inspection/Loan/Appraisal Contingency Removal.
   * Each is included only when its contingency actually applies — inspection
   * whenever a day count resolves (the RPA has no "no contingency" checkbox
   * for it, unlike loan/appraisal), loan/appraisal only when not waived by
   * the Final Negotiated Terms resolver (`FinalTermsService.resolve`, the
   * same document-precedence resolver `EventSeederService` uses for its own
   * deadlines). A waived/inapplicable contingency is omitted entirely, never
   * shown as "not required" — there is no such state on this checklist.
   *
   * The deadline is recomputed fresh each call (not read from
   * `transaction_events`) so it's always in sync with the current contract
   * state; when it can't be resolved (missing acceptance date or day count),
   * the item still appears (the contingency does apply) but with
   * `deadlineDisplay: 'N/A — Deadline not found'` — never fabricated.
   *
   * CR-B is one physical, checkbox-driven form that can remove one, several,
   * or all three contingencies at once, so — unlike every other item on this
   * checklist — a single upload can satisfy multiple items here. `submitted`
   * is decided per item by scanning every completed CR-B document for this
   * transaction (not just the most recent), matching whichever one first
   * checked that specific contingency (or "all contingencies").
   */
  async computeContingencyRemovalItems(
    transactionId: string,
    activeDocs: TransactionDocumentEntity[],
    rejectedFormCodes: ReadonlySet<string>,
    overrides: readonly TransactionBlockerOverrideEntity[] = [],
  ): Promise<ChecklistItemDto[]> {
    const finalTerms = await this.finalTermsService.resolve(transactionId);
    if (!finalTerms) return [];

    const acceptanceDate = parseIsoDate(finalTerms.acceptanceDate);
    const termByKey = new Map(finalTerms.terms.map((t) => [t.key, t]));

    const crbDocs = activeDocs.filter((d) => d.formCode === 'CR-B');
    const completedCrbDocs = crbDocs
      .filter((d) => d.analysisStatus === 'completed')
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const hasAnalyzingCrbDoc = crbDocs.some((d) => d.analysisStatus === 'analyzing');

    const contingencies: Array<{ type: ContingencyType; days: number | null; waived: boolean }> = [
      { type: 'inspection', days: termByKey.get('inspection')?.days ?? null, waived: false },
      { type: 'loan', days: termByKey.get('loan')?.days ?? null, waived: termByKey.get('loan')?.status === 'No contingency' },
      { type: 'appraisal', days: termByKey.get('appraisal')?.days ?? null, waived: termByKey.get('appraisal')?.status === 'No contingency' },
    ];

    const clockSettings = await this.clockService.findByTransaction(transactionId);
    const now = resolveNow(clockSettings);

    const items: ChecklistItemDto[] = [];

    for (const c of contingencies) {
      if (c.waived || c.days == null) continue; // doesn't apply — never shown

      const deadline = acceptanceDate ? addBusinessAdjustedDays(acceptanceDate, c.days) : null;

      const matchedDoc = completedCrbDocs.find((d) => {
        const extraction = (d.metadataJson as Record<string, unknown> | null)?.extraction as Record<string, unknown> | undefined;
        const removed = extraction?.['contingencies_removed'] as Record<string, unknown> | undefined;
        return !!removed && (removed[c.type] === true || removed['all_contingencies'] === true);
      });

      const status: ChecklistItemStatus = matchedDoc
        ? 'submitted'
        : hasAnalyzingCrbDoc
          ? 'analyzing'
          : rejectedFormCodes.has('CR-B')
            ? 'reupload_required'
            : 'required';

      const daysRemaining = deadline ? Math.ceil((deadline.getTime() - now) / ONE_DAY_MS) : null;

      items.push({
        formCode: 'CR-B',
        formName: CONTINGENCY_REMOVAL_LABELS[c.type],
        category: 'contingency_performance',
        status,
        matchedDocument: matchedDoc
          ? { id: matchedDoc.id, fileName: matchedDoc.fileName, formType: matchedDoc.formCode, uploadedAt: matchedDoc.createdAt }
          : null,
        uploaded: !!matchedDoc,
        validationStatus: computeValidationStatus(matchedDoc, overrides),
        contingencyType: c.type,
        contractTimeframe: `${c.days} day${c.days === 1 ? '' : 's'} after Acceptance`,
        deadline: deadline ? deadline.toISOString() : null,
        deadlineDisplay: deadline
          ? deadline.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
          : 'N/A — Deadline not found',
        daysRemaining,
        isPastDue: daysRemaining != null && daysRemaining < 0 && status !== 'submitted',
      });
    }

    return items;
  }

  /**
   * Buyer Agent checklist only: Verification of Property — unconditionally
   * required (unlike the contingency-removal items above, there is no
   * "doesn't apply" state for this one). Its deadline is the transaction's
   * Close of Escrow date from the Final Negotiated Terms resolver
   * (`FinalTermsService.resolve`, the same document-precedence resolver used
   * everywhere else) — a stated date, not a contingency day-count offset, so
   * no business-day adjustment is applied. When no contract-family documents
   * exist yet, or the closing date can't be resolved from them, the item
   * still appears (required, unlike contingency items) with
   * `deadlineDisplay: 'N/A — Closing date not found.'` — never fabricated.
   */
  async computeVerificationOfPropertyItem(
    transactionId: string,
    activeDocs: TransactionDocumentEntity[],
    rejectedFormCodes: ReadonlySet<string>,
    overrides: readonly TransactionBlockerOverrideEntity[] = [],
  ): Promise<ChecklistItemDto[]> {
    const finalTerms = await this.finalTermsService.resolve(transactionId);
    const closeOfEscrowValue = finalTerms?.valueTerms.find((t) => t.key === 'closeOfEscrow')?.value as string | undefined;
    const closingDate = closeOfEscrowValue ? parseIsoDate(closeOfEscrowValue) : null;

    const vpDocs = activeDocs.filter((d) => d.formCode === 'VP');
    const completedVpDoc = vpDocs
      .filter((d) => d.analysisStatus === 'completed')
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    const hasAnalyzingVpDoc = vpDocs.some((d) => d.analysisStatus === 'analyzing');

    const status: ChecklistItemStatus = completedVpDoc
      ? 'submitted'
      : hasAnalyzingVpDoc
        ? 'analyzing'
        : rejectedFormCodes.has('VP')
          ? 'reupload_required'
          : 'required';

    const clockSettings = await this.clockService.findByTransaction(transactionId);
    const now = resolveNow(clockSettings);
    const daysRemaining = closingDate ? Math.ceil((closingDate.getTime() - now) / ONE_DAY_MS) : null;

    return [{
      formCode: 'VP',
      formName: 'Verification of Property',
      category: 'closing',
      status,
      matchedDocument: completedVpDoc
        ? { id: completedVpDoc.id, fileName: completedVpDoc.fileName, formType: completedVpDoc.formCode, uploadedAt: completedVpDoc.createdAt }
        : null,
      uploaded: !!completedVpDoc,
      validationStatus: computeValidationStatus(completedVpDoc, overrides),
      contractTimeframe: 'Close of Escrow',
      deadline: closingDate ? closingDate.toISOString() : null,
      deadlineDisplay: closingDate
        ? closingDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
        : 'N/A — Closing date not found.',
      daysRemaining,
      isPastDue: daysRemaining != null && daysRemaining < 0 && status !== 'submitted',
    }];
  }

  /**
   * Seller Agent checklist only: dynamically requires AVID exactly when the
   * most recently completed TDS document (within this same link-scoped
   * `activeDocs` — a TDS is itself a Seller Agent upload, so it's already in
   * scope) has its own Section III checkbox — "See attached Agent Visual
   * Inspection Disclosure (AVID Form)" — selected. The TDS Section III
   * selection is the single source of truth: returns `[]` (no AVID item at
   * all) whenever there's no completed TDS yet, or Section III instead
   * selected "no items for disclosure"/"the following items" — matching
   * `avidRequired: false` for both of those options. Reuses
   * matchDocumentsToSellerAgentChecklist directly for the item's own
   * submitted/analyzing/reupload_required/required status once triggered,
   * exactly like every other item on this checklist — see
   * getSellerAgentChecklistStatus's `item.formCode !== 'AVID'` filter below,
   * which removes AVID as a *static* template item so this dynamic
   * computation is the sole source, never a duplicate.
   */
  private computeAvidRequirement(
    activeDocs: TransactionDocumentEntity[],
    rejectedFormCodes: ReadonlySet<string>,
    overrides: readonly TransactionBlockerOverrideEntity[],
  ): ChecklistItemDto[] {
    const tdsDoc = activeDocs
      .filter((d) => d.formCode === 'TDS' && d.analysisStatus === 'completed')
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    if (!tdsDoc) return [];

    const extraction = (tdsDoc.metadataJson as Record<string, unknown> | null)?.extraction as Record<string, unknown> | undefined;
    const sectionIII = extraction?.['section_III_agents_inspection_disclosure_listing'] as Record<string, unknown> | undefined;
    if (sectionIII?.['see_attached_avid'] !== true) return [];

    const [avidItem] = matchDocumentsToSellerAgentChecklist(
      [{ key: 'AVID', label: 'Agent Visual Inspection Disclosure (AVID)', category: 'disclosure' }],
      activeDocs,
      rejectedFormCodes,
      overrides,
    );
    if (avidItem.status !== 'submitted') {
      avidItem.requirementNote = 'TDS Section III: AVID is selected, but an Agent Visual Inspection Disclosure (AVID) was not provided.';
    }
    return [avidItem];
  }

  /**
   * The Seller Agent's own checklist — generated purely from whichever Brokerage
   * Template (`tx.formTemplateId`, falling back to the org/state/type/side best
   * match) resolves for this transaction, filtered down to the items that are the
   * Seller Agent's own responsibility (no hard-coded seller document list, unlike
   * getChecklistStatus's Buyer-Agent-only dedicated items above): if the template
   * selection or its items change, the very next fetch reflects that, since
   * nothing here is cached or precomputed — a changed template only ever affects
   * what's shown as required/optional, never any document already uploaded
   * (documents are read-only inputs to this computation, never touched by it).
   * Strictly scoped to this ONE upload link's own documents (never the whole
   * transaction), so a Buyer Agent or Escrow Officer upload can never satisfy a
   * Seller Agent checklist item. `rejectedFormCodes` — the caller's set of form
   * codes recently rejected by the synchronous validation gate for this same
   * link — drives the 'reupload_required' status; see matchDocumentsToSellerAgentChecklist.
   * `uploadLinkId: null` — no Seller Agent link has been minted yet — yields
   * every item 'required' and no unmatched documents, rather than throwing.
   *
   * AVID (`item.formCode !== 'AVID'` below) is deliberately excluded from the
   * template-derived items even though it's a static `required: true` item on
   * every default Brokerage Template — computeAvidRequirement above is the
   * sole, dynamic source for it, driven exclusively by the TDS Section III
   * checkbox rather than the template.
   */
  async getSellerAgentChecklistStatus(
    tx: TransactionEntity,
    uploadLinkId: string | null,
    rejectedFormCodes: ReadonlySet<string>,
  ): Promise<DocumentChecklistStatus> {
    const template = await this.resolveTemplateForTransaction(tx);

    const sellerAgentItems = dedupeByFormCode(
      (template?.items ?? []).filter((item) => isSellerAgentResponsibility(item.formCode) && item.formCode !== 'AVID'),
    );

    const requiredItems = sellerAgentItems
      .filter((item) => item.isRequired)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const optionalTemplateItems = sellerAgentItems
      .filter((item) => !item.isRequired)
      .sort((a, b) => a.sortOrder - b.sortOrder);

    const activeDocs = await this.getActiveLinkDocuments(uploadLinkId, tx.id);
    const overrides = await this.blockerOverrideService.findForTransaction(tx.id);

    const templateItems = matchDocumentsToSellerAgentChecklist(
      requiredItems.map((reqItem) => ({ key: reqItem.formCode, label: reqItem.formName, category: reqItem.category })),
      activeDocs,
      rejectedFormCodes,
      overrides,
    );
    const avidItems = this.computeAvidRequirement(activeDocs, rejectedFormCodes, overrides);
    const items = [...templateItems, ...avidItems];
    const optionalItems = matchDocumentsToSellerAgentChecklist(
      optionalTemplateItems.map((reqItem) => ({ key: reqItem.formCode, label: reqItem.formName, category: reqItem.category })),
      activeDocs,
      rejectedFormCodes,
      overrides,
    );

    const requiredFormCodes = new Set([...requiredItems.map((i) => i.formCode), ...avidItems.map((i) => i.formCode)]);
    const optionalFormCodes = new Set(optionalTemplateItems.map((i) => i.formCode));
    const unmatchedDocuments: UnmatchedDocumentDto[] = activeDocs
      .filter((d) => !(d.formCode && requiredFormCodes.has(d.formCode) && (d.analysisStatus === 'completed' || d.analysisStatus === 'analyzing')))
      .filter((d) => !(d.formCode && optionalFormCodes.has(d.formCode) && (d.analysisStatus === 'completed' || d.analysisStatus === 'analyzing')))
      .map((d) => ({
        id: d.id,
        fileName: d.fileName,
        formType: d.formCode,
        status: unmatchedStatusFor(d.analysisStatus, d.formCode, d.isOriginalPackage),
        uploadedAt: d.createdAt,
        isOriginalPackage: d.isOriginalPackage,
        sourceDocumentId: d.sourceDocumentId,
      }));

    const submittedCount = items.filter((i) => i.status === 'submitted').length;

    return {
      items,
      optionalItems,
      unmatchedDocuments,
      requiredCount: items.length,
      submittedCount,
      allRequiredSubmitted: submittedCount === items.length,
    };
  }

  /**
   * The Escrow Officer's own checklist — Signed RPA (CAR-forms formCode match)
   * plus the three dedicated Escrow document types (Escrow Instructions,
   * Preliminary Title Report, Estimated Closing Statement). Transaction-wide,
   * like the Buyer Agent checklist above (not link-scoped) — the RPA and prior
   * documents are almost always uploaded by someone else earlier in the
   * transaction, and a resent/regenerated Escrow link must still see every
   * document already on file. "HOA Documents" is appended only when the
   * Seller Agent answered Yes to the HOA question (HoaInformationEntity) —
   * the Escrow Officer is never asked to upload it when the property has no
   * HOA, matching getHoaRequirement's read-only status on the Escrow page.
   */
  async getEscrowChecklistStatus(tx: TransactionEntity): Promise<DocumentChecklistStatus> {
    const activeDocs = await this.documentsService.findActiveByTransactionForChecklist(tx.id);
    const overrides = await this.blockerOverrideService.findForTransaction(tx.id);

    const rpaItems = matchDocumentsToChecklist(
      [{ key: 'RPA', label: 'Signed RPA', category: 'purchase_agreement' }],
      activeDocs,
      'formCode',
      overrides,
    );

    // "Signed RPA" completion is governed solely by whether the RPA's own
    // logical Page 17 (Escrow Holder Acknowledgment) is completed and
    // signed — never by buyer/seller execution on pages 1-16, nor by the
    // mere fact that an RPA was uploaded. An incomplete Page 17 is never a
    // blocker; it just leaves the item outstanding ('required'), never
    // 'reupload_required' — that state stays reserved for genuine
    // compliance blockers (e.g. a missing buyer/seller signature).
    const rpaItem = rpaItems[0];
    if (rpaItem) {
      const rpaDoc = rpaItem.matchedDocument ? activeDocs.find((d) => d.id === rpaItem.matchedDocument!.id) : undefined;
      const escrowPage17Completed = isRpaEscrowPage17Completed(rpaDoc);
      rpaItem.escrowPage17Completed = escrowPage17Completed;
      if (rpaItem.status === 'submitted' && !escrowPage17Completed) {
        rpaItem.status = 'required';
      }
    }

    const dedicatedItems = matchDocumentsToChecklist(
      REQUIRED_ESCROW_DOCUMENT_TYPES.map((t) => ({ key: t.documentType, label: t.label, category: 'escrow_required_document' })),
      activeDocs,
      'documentType',
      overrides,
    );

    const hoaInfo = await this.hoaInfoRepo.findOne({ where: { transactionId: tx.id } });
    const hoaItems = hoaInfo?.hasHoa === true
      ? matchDocumentsToChecklist(
          [{ key: HOA_DOCUMENT_TYPE, label: 'HOA Documents', category: 'escrow_required_document' }],
          activeDocs,
          'documentType',
          overrides,
        )
      : [];

    const items: ChecklistItemDto[] = [...rpaItems, ...dedicatedItems, ...hoaItems];

    const dedicatedTypes = new Set([...REQUIRED_ESCROW_DOCUMENT_TYPES.map((t) => t.documentType), HOA_DOCUMENT_TYPE, ...ALL_DEDICATED_DOCUMENT_TYPES]);
    const unmatchedDocuments: UnmatchedDocumentDto[] = activeDocs
      .filter((d) => !dedicatedTypes.has(d.documentType))
      .filter((d) => !(d.formCode === 'RPA' && d.analysisStatus === 'completed'))
      .map((d) => ({
        id: d.id,
        fileName: d.fileName,
        formType: d.formCode,
        status: unmatchedStatusFor(d.analysisStatus, d.formCode, d.isOriginalPackage),
        uploadedAt: d.createdAt,
        isOriginalPackage: d.isOriginalPackage,
        sourceDocumentId: d.sourceDocumentId,
        validation: buildDocumentValidation(d, overrides),
      }));

    const submittedCount = items.filter((i) => i.status === 'submitted').length;

    return {
      items,
      optionalItems: [],
      unmatchedDocuments,
      requiredCount: items.length,
      submittedCount,
      allRequiredSubmitted: submittedCount === items.length,
    };
  }

  /**
   * The Broker's own checklist — a single "Sign CDA" item, present only once
   * the CDA has actually been generated (before that, the broker's page has
   * nothing to check off at all, matching its placeholder-until-CDA-exists
   * design). Matched by documentType, like Escrow's dedicated document
   * types above, since a signed CDA is never a CAR-forms formCode match.
   * No unmatchedDocuments/optionalItems — the broker's page has no other
   * document capability, so there's nothing else to ever list here.
   */
  async getBrokerChecklistStatus(tx: TransactionEntity): Promise<DocumentChecklistStatus> {
    const activeDocs = await this.documentsService.findActiveByTransaction(tx.id);
    const cdaExists = activeDocs.some((d) => d.documentType === CDA_DOCUMENT_TYPE);
    if (!cdaExists) {
      return { items: [], optionalItems: [], unmatchedDocuments: [], requiredCount: 0, submittedCount: 0, allRequiredSubmitted: true };
    }

    const items = matchDocumentsToChecklist(
      [{ key: SIGNED_CDA_DOCUMENT_TYPE, label: 'Sign CDA', category: 'commission' }],
      activeDocs,
      'documentType',
    );

    const submittedCount = items.filter((i) => i.status === 'submitted').length;

    return {
      items,
      optionalItems: [],
      unmatchedDocuments: [],
      requiredCount: items.length,
      submittedCount,
      allRequiredSubmitted: submittedCount === items.length,
    };
  }

  /**
   * This link's own documents, excluding superseded/rejected versions — the shared scoping behind both the Seller Agent checklist and the DocuSign envelope document set.
   * `uploadLinkId: null` — no active Seller Agent link has been minted yet (e.g. the internal swimlane
   * viewing a transaction before the Buyer Agent has even started) — returns no documents, so every
   * item comes back 'required' rather than throwing on an invalid uuid lookup.
   */
  private async getActiveLinkDocuments(uploadLinkId: string | null, transactionId: string): Promise<TransactionDocumentEntity[]> {
    if (!uploadLinkId) return [];
    const linkDocs = await this.documentsService.findByUploadLink(uploadLinkId, transactionId);
    return linkDocs.filter((d) => d.status !== DocumentStatus.SUPERSEDED && d.status !== DocumentStatus.REJECTED);
  }

  /**
   * The exact document set a Seller Agent DocuSign send should include: every
   * active document uploaded through this link that has *completed* analysis —
   * by construction (the synchronous validation gate on Seller Agent PDF
   * uploads) this is already "documents that passed validation," covering both
   * checklist-matched required documents and any other/unmatched uploads
   * through the same link. Oldest-first, preserving upload order.
   */
  async getValidatedDocumentsForEnvelope(uploadLinkId: string, transactionId: string): Promise<TransactionDocumentEntity[]> {
    const activeDocs = await this.getActiveLinkDocuments(uploadLinkId, transactionId);
    return activeDocs
      .filter((d) => d.analysisStatus === 'completed')
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  /**
   * The single-document variant of getValidatedDocumentsForEnvelope — the
   * security boundary for per-document DocuSign sending: never resolves a
   * document by a bare id, always scoped to this one upload link's own
   * active, validated documents. Returns null when the id doesn't belong to
   * this link, isn't active (superseded/rejected), or hasn't completed
   * analysis yet.
   */
  async getValidatedDocumentById(uploadLinkId: string, transactionId: string, documentId: string): Promise<TransactionDocumentEntity | null> {
    const activeDocs = await this.getActiveLinkDocuments(uploadLinkId, transactionId);
    const doc = activeDocs.find((d) => d.id === documentId && d.analysisStatus === 'completed');
    return doc ?? null;
  }

  /**
   * The Buyer Agent checklist's equivalent security boundary — that checklist
   * is transaction-scoped rather than link-scoped (a Buyer Agent link has no
   * dedicated "this link's own documents" concept the way the Seller Agent
   * checklist does), so this never resolves a bare id either: only ever a
   * document already present in this transaction's active checklist set.
   * Unlike getValidatedDocumentById, doesn't require completed analysis —
   * used to attach validation-check detail even to a still-analyzing or
   * rejected-and-reuploaded document, not just a fully validated one.
   */
  async getDocumentInActiveSetById(transactionId: string, documentId: string): Promise<TransactionDocumentEntity | null> {
    const activeDocs = await this.documentsService.findActiveByTransactionForChecklist(transactionId);
    return activeDocs.find((d) => d.id === documentId) ?? null;
  }
}
