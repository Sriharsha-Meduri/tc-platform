import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { UploadLinkEntity } from '../upload-links/entities/upload-link.entity';
import { UploadLinkPurpose, BUYER_AGENT_TRANSACTION_DOCUMENT_UPLOAD, SELLER_AGENT_TRANSACTION_DOCUMENT_UPLOAD, ESCROW_OFFICER_TRANSACTION_DOCUMENT_UPLOAD, BROKER_TRANSACTION_DOCUMENT_UPLOAD } from '../upload-links/upload-link.types';
import { TransactionEntity } from '../transactions/entities/transaction.entity';
import { TransactionDocumentsService } from '../transaction-documents/transaction-documents.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditAction } from '../audit-log/audit-log.entity';
import { isValidEmail } from '../transactions/transaction-welcome-email.service';
import { LenderInformationService, LenderInformationInput } from './lender-information.service';
import { EscrowInformationService, EscrowInformationInput } from './escrow-information.service';
import { HoaInformationService, HoaInformationInput } from './hoa-information.service';
import { BrokerCommissionService } from './broker-commission.service';
import { BuyerSideInformationService, BuyerSideInformationInput } from './buyer-side-information.service';
import { BuyerCommissionType } from './entities/buyer-side-information.entity';
import { BrokerInformationService, BrokerInformationInput } from './broker-information.service';
import { BrokerCommissionType } from './entities/broker-information.entity';
import { UpsertDiffResult } from './upsert-diff.util';
import { TransactionFormTemplatesService, DocumentChecklistStatus } from '../transaction-form-templates/transaction-form-templates.service';

/**
 * Buyer Agent, Seller Agent, and Broker links can each save transaction info, but not the
 * same fields — see the per-field gating in saveTransactionInformation: lender and buyer
 * commission are Buyer-Agent-only, escrow and HOA are Seller-Agent-only, broker's own
 * payment address/commission split is Broker-only.
 */
const SUPPORTED_PURPOSES: ReadonlySet<UploadLinkPurpose> = new Set([
  BUYER_AGENT_TRANSACTION_DOCUMENT_UPLOAD,
  SELLER_AGENT_TRANSACTION_DOCUMENT_UPLOAD,
  BROKER_TRANSACTION_DOCUMENT_UPLOAD,
]);

const INVALID_LINK_MESSAGE = 'This upload link is invalid or has expired.';

/**
 * A valid decimal/currency amount — non-negative, at most 2 decimal places
 * (e.g. 0, 500, 500.00, 1250.50). Mirrors the frontend's CURRENCY_PATTERN
 * (`^\d+(\.\d{1,2})?$`) applied to the raw input string; here the value has
 * already been parsed to a JS number by JSON, so this instead checks the
 * numeric properties directly — rejecting non-finite values, negatives, and
 * anything with sub-cent precision (which a regex on the original string
 * would have caught as "more than 2 decimal places").
 */
function isValidCurrencyAmount(value: number): boolean {
  if (!Number.isFinite(value) || value < 0) return false;
  const cents = Math.round(value * 100);
  return Math.abs(cents / 100 - value) < 1e-9;
}

/** Distinct from the document-upload UPLOAD_SOURCE_BY_PURPOSE tag — this feature has its own required literal per purpose. */
const INFO_UPDATE_SOURCE_BY_PURPOSE: Record<string, string> = {
  document_upload: 'buyer_agent_secure_upload_link',
  seller_agent_document_upload: 'seller_agent_secure_upload_link',
  broker_document_upload: 'broker_secure_upload_link',
};

export interface SaveTransactionInformationDto {
  lender?: LenderInformationInput;
  escrow?: EscrowInformationInput;
  hoa?: HoaInformationInput;
  buyerSide?: BuyerSideInformationInput;
  broker?: BrokerInformationInput;
}

export interface PublicTransactionInformationDto {
  lender: { lenderName: string | null; lenderEmail: string | null };
  escrow: { escrowContactName: string | null; escrowEmail: string | null };
  hoa: { hasHoa: boolean | null };
  /**
   * The Buyer Agent link's single "Buyer Broker Commission Information"
   * section — merged from what used to be two separate sections (commission
   * terms + buyer-side brokerage info). brokerageName is the one field that
   * existed in both of the old sections; buildPublicDto falls back to the
   * older buyer_broker_commission table's value so a section that was only
   * ever filled in on one side doesn't appear to lose data after the merge.
   * Every other field here only ever lived in buyer_side_information.
   */
  buyerSide: {
    brokerageName: string | null;
    brokerFullName: string | null;
    brokerEmail: string | null;
    buyerAgentPaymentAddress: string | null;
    clientCredits: number | null;
    buyerCommissionType: BuyerCommissionType | null;
    buyerCommissionValue: number | null;
    /** Server-calculated — see calculateGrossCommission. Null until both a commission type+value and the transaction's contractPrice are available. */
    grossCommission: number | null;
  };
  /**
   * The Broker link's own "Broker Commission" section. finalSalesPrice and
   * grossCommission are retrieved, read-only values (the transaction's
   * contractPrice and the Buyer Agent's own calculated grossCommission,
   * respectively) — the Broker never edits either, only sees them so the
   * commission split below makes sense. brokerCommissionAmount and
   * buyerAgentCommissionAmount are server-calculated — see calculateBrokerSplit.
   */
  broker: {
    finalSalesPrice: number | null;
    grossCommission: number | null;
    brokerPaymentAddress: string | null;
    brokerCommissionType: BrokerCommissionType | null;
    brokerCommissionValue: number | null;
    brokerCommissionAmount: number | null;
    buyerAgentCommissionAmount: number | null;
  };
}

interface ExtractionFallback {
  lenderName: string | null;
  lenderEmail: string | null;
  escrowContactName: string | null;
  escrowEmail: string | null;
}

@Injectable()
export class ExternalTransactionInformationService {
  constructor(
    private readonly documentsService: TransactionDocumentsService,
    private readonly auditLogService: AuditLogService,
    private readonly lenderInformationService: LenderInformationService,
    private readonly escrowInformationService: EscrowInformationService,
    private readonly hoaInformationService: HoaInformationService,
    private readonly brokerCommissionService: BrokerCommissionService,
    private readonly buyerSideInformationService: BuyerSideInformationService,
    private readonly brokerInformationService: BrokerInformationService,
    private readonly formTemplatesService: TransactionFormTemplatesService,
  ) {}

  /**
   * The caller (UploadLinkController, which already has UploadLinkService from
   * UploadLinksModule) resolves+validates the token first and passes the result in —
   * this module deliberately does not depend on UploadLinksModule/UploadLinkService
   * itself, so UploadLinksModule can import this module one-directionally with no
   * circularity. Every failure mode here still collapses to the same generic message
   * validateUploadToken itself uses, so a purpose mismatch doesn't leak information.
   */
  private assertSupportedPurpose(link: UploadLinkEntity): void {
    if (!SUPPORTED_PURPOSES.has(link.purpose as UploadLinkPurpose)) {
      throw new NotFoundException(INVALID_LINK_MESSAGE);
    }
  }

  /**
   * Lender and buyerSide (the merged "Buyer Broker Commission Information"
   * section) are Buyer-Agent-only; escrow and HOA are Seller-Agent-only —
   * moved off the Buyer Agent workflow entirely so the Seller Agent
   * identifies escrow contact info and whether HOA applies. broker (payment
   * address + the broker's own commission split) is Broker-only. A field
   * submitted from the wrong link is rejected outright rather than silently
   * dropped — this is also what guarantees buyerSide can never overwrite
   * seller-side data: it is never even reachable from the Seller Agent link.
   */
  private assertFieldsAllowedForPurpose(link: UploadLinkEntity, dto: SaveTransactionInformationDto): void {
    const isBuyerAgent = link.purpose === BUYER_AGENT_TRANSACTION_DOCUMENT_UPLOAD;
    const isSellerAgent = link.purpose === SELLER_AGENT_TRANSACTION_DOCUMENT_UPLOAD;
    const isBroker = link.purpose === BROKER_TRANSACTION_DOCUMENT_UPLOAD;

    if ((dto.lender !== undefined || dto.buyerSide !== undefined) && !isBuyerAgent) {
      throw new BadRequestException('Lender and buyer broker commission information can only be submitted from the Buyer Agent upload link.');
    }
    if ((dto.escrow !== undefined || dto.hoa !== undefined) && !isSellerAgent) {
      throw new BadRequestException('Escrow and HOA information can only be submitted from the Seller Agent upload link.');
    }
    if (dto.broker !== undefined && !isBroker) {
      throw new BadRequestException('Broker commission information can only be submitted from the Broker upload link.');
    }
  }

  /**
   * Best-effort prepopulation from already-extracted document data — only escrow
   * officer name/email and lender company name/email are ever available this way
   * today (populated by the AcroForm mapper for RPA uploads); HOA and commission
   * have no extraction source yet and simply start blank.
   */
  private async getExtractionFallback(transactionId: string): Promise<ExtractionFallback> {
    const docs = await this.documentsService.findActiveByTransaction(transactionId);
    const sorted = [...docs].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const fallback: ExtractionFallback = { lenderName: null, lenderEmail: null, escrowContactName: null, escrowEmail: null };

    for (const doc of sorted) {
      const meta = doc.metadataJson as Record<string, unknown> | null;
      const extraction = meta?.extraction as Record<string, unknown> | undefined;
      const parties = extraction?.parties as Record<string, unknown> | undefined;
      if (!parties) continue;

      if (!fallback.lenderName && !fallback.lenderEmail) {
        const lender = (parties.lenders as Array<Record<string, unknown>> | undefined)?.[0];
        if (lender) {
          fallback.lenderName = (lender.contactName as string) || (lender.companyName as string) || null;
          fallback.lenderEmail = (lender.email as string) || null;
        }
      }
      if (!fallback.escrowContactName && !fallback.escrowEmail) {
        const escrow = (parties.escrowCompanies as Array<Record<string, unknown>> | undefined)?.[0];
        if (escrow) {
          fallback.escrowContactName = (escrow.contactName as string) || (escrow.companyName as string) || null;
          fallback.escrowEmail = (escrow.email as string) || null;
        }
      }
      if ((fallback.lenderName || fallback.lenderEmail) && (fallback.escrowContactName || fallback.escrowEmail)) break;
    }

    return fallback;
  }

  async getPrefillData(link: UploadLinkEntity, transaction: TransactionEntity): Promise<PublicTransactionInformationDto> {
    this.assertSupportedPurpose(link);
    return this.buildPublicDto(transaction);
  }

  /**
   * The document-checklist sidebar's data source. Deliberately its own gate,
   * separate from assertSupportedPurpose (which covers the Transaction Information
   * form) — the checklist is available to the Buyer Agent, Seller Agent, Escrow
   * Officer, and Broker links, each getting its own purpose-appropriate
   * computation. The Broker's own checklist (getBrokerChecklistStatus) is empty
   * until a CDA exists — see that method's own doc comment.
   */
  async getDocumentChecklist(link: UploadLinkEntity, transaction: TransactionEntity): Promise<DocumentChecklistStatus> {
    const purpose = link.purpose as UploadLinkPurpose;
    if (purpose !== SELLER_AGENT_TRANSACTION_DOCUMENT_UPLOAD && purpose !== ESCROW_OFFICER_TRANSACTION_DOCUMENT_UPLOAD && purpose !== BROKER_TRANSACTION_DOCUMENT_UPLOAD) {
      this.assertSupportedPurpose(link);
    }
    return this.buildChecklist(purpose, link.id, transaction);
  }

  /**
   * Same composition as getDocumentChecklist, for an internal (already-authorized,
   * not token-holding) caller that hasn't necessarily resolved an active upload
   * link for this purpose yet — e.g. the myTC swimlane, viewing a side before its
   * link has been minted. Skips the recently-rejected-form-codes lookup (nothing
   * to look up without a link id), which only ever affects 'reupload_required'
   * status, never which items appear.
   */
  async getDocumentChecklistForPurpose(purpose: UploadLinkPurpose, transaction: TransactionEntity): Promise<DocumentChecklistStatus> {
    return this.buildChecklist(purpose, null, transaction);
  }

  private async buildChecklist(purpose: UploadLinkPurpose, uploadLinkId: string | null, transaction: TransactionEntity): Promise<DocumentChecklistStatus> {
    if (purpose === SELLER_AGENT_TRANSACTION_DOCUMENT_UPLOAD) {
      const rejectedFormCodes = uploadLinkId ? await this.getRecentlyRejectedFormCodes(uploadLinkId) : new Set<string>();
      return this.formTemplatesService.getSellerAgentChecklistStatus(transaction, uploadLinkId, rejectedFormCodes);
    }
    if (purpose === ESCROW_OFFICER_TRANSACTION_DOCUMENT_UPLOAD) {
      return this.formTemplatesService.getEscrowChecklistStatus(transaction);
    }
    if (purpose === BROKER_TRANSACTION_DOCUMENT_UPLOAD) {
      return this.formTemplatesService.getBrokerChecklistStatus(transaction);
    }
    const rejectedBuyerAgentFormCodes = uploadLinkId ? await this.getRecentlyRejectedBuyerAgentFormCodes(uploadLinkId) : new Set<string>();
    return this.formTemplatesService.getChecklistStatus(transaction, rejectedBuyerAgentFormCodes);
  }

  /** Form codes the synchronous validation gate rejected for this upload link, recent-first — drives the checklist's 'reupload_required' status. */
  private async getRecentlyRejectedFormCodes(uploadLinkId: string): Promise<ReadonlySet<string>> {
    const events = await this.auditLogService.findByTarget('upload_link', uploadLinkId);
    const formCodes = events
      .filter((e) => e.action === AuditAction.SELLER_AGENT_DOCUMENT_VALIDATION_FAILED)
      .map((e) => (e.detailsJson as Record<string, unknown> | null)?.detectedFormCode as string | null)
      .filter((code): code is string => !!code);
    return new Set(formCodes);
  }

  /** Form codes (RR/RRRR) the Buyer Agent's synchronous validation gate rejected for this upload link, recent-first — drives the optional-checklist items' 'reupload_required' status. */
  private async getRecentlyRejectedBuyerAgentFormCodes(uploadLinkId: string): Promise<ReadonlySet<string>> {
    const events = await this.auditLogService.findByTarget('upload_link', uploadLinkId);
    const formCodes = events
      .filter((e) => e.action === AuditAction.BUYER_AGENT_DOCUMENT_VALIDATION_FAILED)
      .map((e) => (e.detailsJson as Record<string, unknown> | null)?.detectedFormCode as string | null)
      .filter((code): code is string => !!code);
    return new Set(formCodes);
  }

  /**
   * Takes the full transaction (not just its id) so the Broker section can
   * expose finalSalesPrice (transaction.contractPrice) as a retrieved,
   * read-only value alongside the Buyer Agent's own calculated
   * grossCommission — both callers already have the transaction in scope.
   */
  private async buildPublicDto(transaction: TransactionEntity): Promise<PublicTransactionInformationDto> {
    const transactionId = transaction.id;
    const [lender, escrow, hoa, commission, buyerSide, broker] = await Promise.all([
      this.lenderInformationService.findByTransaction(transactionId),
      this.escrowInformationService.findByTransaction(transactionId),
      this.hoaInformationService.findByTransaction(transactionId),
      this.brokerCommissionService.findByTransaction(transactionId),
      this.buyerSideInformationService.findByTransaction(transactionId),
      this.brokerInformationService.findByTransaction(transactionId),
    ]);

    const fallback = (!lender?.lenderName && !lender?.lenderEmail) || (!escrow?.escrowContactName && !escrow?.escrowEmail)
      ? await this.getExtractionFallback(transactionId)
      : null;

    return {
      lender: {
        lenderName: lender?.lenderName ?? fallback?.lenderName ?? null,
        lenderEmail: lender?.lenderEmail ?? fallback?.lenderEmail ?? null,
      },
      escrow: {
        escrowContactName: escrow?.escrowContactName ?? fallback?.escrowContactName ?? null,
        escrowEmail: escrow?.escrowEmail ?? fallback?.escrowEmail ?? null,
      },
      hoa: {
        hasHoa: hoa?.hasHoa ?? null,
      },
      buyerSide: {
        // Falls back to the pre-merge commission section's own brokerage
        // name only when the merged section's own value was never set —
        // this is the "preserve existing saved values when merging" path.
        brokerageName: buyerSide?.brokerageName ?? commission?.brokerageName ?? null,
        brokerFullName: buyerSide?.brokerFullName ?? null,
        brokerEmail: buyerSide?.brokerEmail ?? null,
        buyerAgentPaymentAddress: buyerSide?.buyerAgentPaymentAddress ?? null,
        clientCredits: buyerSide?.clientCredits ?? null,
        buyerCommissionType: buyerSide?.buyerCommissionType ?? null,
        buyerCommissionValue: buyerSide?.buyerCommissionValue ?? null,
        grossCommission: buyerSide?.grossCommission ?? null,
      },
      broker: {
        finalSalesPrice: transaction.contractPrice ?? null,
        grossCommission: buyerSide?.grossCommission ?? null,
        brokerPaymentAddress: broker?.brokerPaymentAddress ?? null,
        brokerCommissionType: broker?.brokerCommissionType ?? null,
        brokerCommissionValue: broker?.brokerCommissionValue ?? null,
        brokerCommissionAmount: broker?.brokerCommissionAmount ?? null,
        buyerAgentCommissionAmount: broker?.buyerAgentCommissionAmount ?? null,
      },
    };
  }

  /**
   * contractPrice × (buyerCommissionValue / 100) when percentage, or
   * buyerCommissionValue itself when flat_amount. Returns null (rather than
   * throwing) whenever the calculation can't be completed yet — a missing
   * type/value or a transaction with no contractPrice set — since this
   * section is fillable incrementally and a partial save must still
   * succeed. `type`/`value` are read from whichever value is about to be
   * persisted (the incoming dto field when provided, otherwise the
   * previously-saved one), so saving an unrelated field (e.g. brokerageName)
   * without resubmitting the commission fields doesn't null out an
   * already-computed grossCommission.
   */
  private calculateGrossCommission(
    type: BuyerCommissionType | null | undefined,
    value: number | null | undefined,
    contractPrice: number | null | undefined,
  ): number | null {
    if (!type || value === null || value === undefined || contractPrice === null || contractPrice === undefined) return null;
    if (type === 'flat_amount') return value;
    return Math.round(contractPrice * (value / 100) * 100) / 100;
  }

  /**
   * grossCommission × (brokerCommissionValue / 100) when percentage, or
   * brokerCommissionValue itself when flat_amount — the broker's own cut of
   * the Buyer Agent's calculated grossCommission. buyerAgentCommissionAmount
   * is always grossCommission minus that cut. Both null (rather than
   * throwing) whenever the calculation can't be completed yet — a missing
   * broker type/value, or no grossCommission available yet (the Buyer Agent
   * hasn't saved their own commission section, or the transaction has no
   * final sales price) — mirroring calculateGrossCommission's "partial save
   * must still succeed" behavior.
   */
  private calculateBrokerSplit(
    type: BrokerCommissionType | null | undefined,
    value: number | null | undefined,
    grossCommission: number | null | undefined,
  ): { brokerCommissionAmount: number | null; buyerAgentCommissionAmount: number | null } {
    if (!type || value === null || value === undefined || grossCommission === null || grossCommission === undefined) {
      return { brokerCommissionAmount: null, buyerAgentCommissionAmount: null };
    }
    const brokerCommissionAmount = type === 'flat_amount' ? value : Math.round(grossCommission * (value / 100) * 100) / 100;
    const buyerAgentCommissionAmount = Math.round((grossCommission - brokerCommissionAmount) * 100) / 100;
    return { brokerCommissionAmount, buyerAgentCommissionAmount };
  }

  private validate(dto: SaveTransactionInformationDto): void {
    if (dto.lender?.lenderEmail && !isValidEmail(dto.lender.lenderEmail)) {
      throw new BadRequestException('Lender email is not a valid email address.');
    }
    if (dto.escrow?.escrowEmail && !isValidEmail(dto.escrow.escrowEmail)) {
      throw new BadRequestException('Escrow email is not a valid email address.');
    }
    if (dto.buyerSide?.brokerEmail && !isValidEmail(dto.buyerSide.brokerEmail)) {
      throw new BadRequestException('Enter a valid broker email address.');
    }
    if (dto.buyerSide?.clientCredits !== undefined && dto.buyerSide.clientCredits !== null && !isValidCurrencyAmount(dto.buyerSide.clientCredits)) {
      throw new BadRequestException('Buyer Credit(s) must be a valid, non-negative dollar amount with at most 2 decimal places.');
    }
    if (
      dto.buyerSide?.buyerCommissionType !== undefined
      && dto.buyerSide.buyerCommissionType !== null
      && dto.buyerSide.buyerCommissionType !== 'percentage'
      && dto.buyerSide.buyerCommissionType !== 'flat_amount'
    ) {
      throw new BadRequestException("Buyer commission type must be 'percentage' or 'flat_amount'.");
    }
    if (dto.buyerSide?.buyerCommissionValue !== undefined && dto.buyerSide.buyerCommissionValue !== null) {
      if (!isValidCurrencyAmount(dto.buyerSide.buyerCommissionValue)) {
        throw new BadRequestException('Buyer commission value must be a valid, non-negative number with at most 2 decimal places.');
      }
      if (dto.buyerSide.buyerCommissionType === 'percentage' && dto.buyerSide.buyerCommissionValue > 100) {
        throw new BadRequestException('Buyer commission percentage cannot exceed 100.');
      }
    }
    if (
      dto.broker?.brokerCommissionType !== undefined
      && dto.broker.brokerCommissionType !== null
      && dto.broker.brokerCommissionType !== 'percentage'
      && dto.broker.brokerCommissionType !== 'flat_amount'
    ) {
      throw new BadRequestException("Broker commission type must be 'percentage' or 'flat_amount'.");
    }
    if (dto.broker?.brokerCommissionValue !== undefined && dto.broker.brokerCommissionValue !== null) {
      if (!isValidCurrencyAmount(dto.broker.brokerCommissionValue)) {
        throw new BadRequestException('Broker commission value must be a valid, non-negative number with at most 2 decimal places.');
      }
      if (dto.broker.brokerCommissionType === 'percentage' && dto.broker.brokerCommissionValue > 100) {
        throw new BadRequestException('Broker commission percentage cannot exceed 100.');
      }
    }
  }

  /**
   * Transaction information can be submitted at any point, regardless of
   * which (if any) required documents have been uploaded yet — the Buyer/Seller
   * Agent may fill this in incrementally and come back later. Document
   * completeness is tracked separately by the checklist/required-documents
   * displays; it is never a gate on this save.
   */
  async saveTransactionInformation(link: UploadLinkEntity, transaction: TransactionEntity, dto: SaveTransactionInformationDto): Promise<PublicTransactionInformationDto> {
    this.assertSupportedPurpose(link);
    this.assertFieldsAllowedForPurpose(link, dto);
    this.validate(dto);

    const updateSource = INFO_UPDATE_SOURCE_BY_PURPOSE[link.purpose] ?? 'buyer_agent_secure_upload_link';

    const results: Array<{ action: AuditAction; targetType: string; diff: UpsertDiffResult<unknown> }> = [];

    if (dto.lender !== undefined) {
      const diff = await this.lenderInformationService.upsert(transaction.id, dto.lender);
      results.push({ action: AuditAction.LENDER_INFO_UPDATED, targetType: 'lender_information', diff });
    }
    if (dto.escrow !== undefined) {
      const diff = await this.escrowInformationService.upsert(transaction.id, dto.escrow);
      results.push({ action: AuditAction.ESCROW_INFO_UPDATED, targetType: 'escrow_information', diff });
    }
    if (dto.hoa !== undefined) {
      const diff = await this.hoaInformationService.upsert(transaction.id, dto.hoa);
      results.push({ action: AuditAction.HOA_INFO_UPDATED, targetType: 'hoa_information', diff });
    }
    // The merged "Buyer Broker Commission Information" section writes only
    // to buyer_side_information going forward — buyer_broker_commission is
    // no longer written here (see buildPublicDto's brokerageName fallback
    // read for why the service/entity are still kept around).
    if (dto.buyerSide !== undefined) {
      // grossCommission depends on both the commission type and value, so a
      // save that only resubmits one of the two (or neither) must fall back
      // to the previously-saved value for the other rather than recomputing
      // against `undefined`/null and wiping out an already-computed figure.
      const existing = await this.buyerSideInformationService.findByTransaction(transaction.id);
      const resolvedType = dto.buyerSide.buyerCommissionType !== undefined
        ? dto.buyerSide.buyerCommissionType
        : (existing?.buyerCommissionType ?? null);
      const resolvedValue = dto.buyerSide.buyerCommissionValue !== undefined
        ? dto.buyerSide.buyerCommissionValue
        : (existing?.buyerCommissionValue ?? null);
      const grossCommission = this.calculateGrossCommission(resolvedType, resolvedValue, transaction.contractPrice);
      const diff = await this.buyerSideInformationService.upsert(transaction.id, { ...dto.buyerSide, grossCommission });
      results.push({ action: AuditAction.BUYER_SIDE_INFO_UPDATED, targetType: 'buyer_side_information', diff });
    }
    if (dto.broker !== undefined) {
      // Same fallback-merge pattern as buyerSide above: resolve type/value from
      // whichever the incoming dto provides, else the previously-saved row, so a
      // save that only resubmits the payment address doesn't null out an
      // already-computed split.
      const existingBroker = await this.brokerInformationService.findByTransaction(transaction.id);
      const resolvedBrokerType = dto.broker.brokerCommissionType !== undefined
        ? dto.broker.brokerCommissionType
        : (existingBroker?.brokerCommissionType ?? null);
      const resolvedBrokerValue = dto.broker.brokerCommissionValue !== undefined
        ? dto.broker.brokerCommissionValue
        : (existingBroker?.brokerCommissionValue ?? null);
      const buyerSideForGross = await this.buyerSideInformationService.findByTransaction(transaction.id);
      const { brokerCommissionAmount, buyerAgentCommissionAmount } = this.calculateBrokerSplit(
        resolvedBrokerType, resolvedBrokerValue, buyerSideForGross?.grossCommission ?? null,
      );
      const diff = await this.brokerInformationService.upsert(transaction.id, { ...dto.broker, brokerCommissionAmount, buyerAgentCommissionAmount });
      results.push({ action: AuditAction.BROKER_INFO_UPDATED, targetType: 'broker_information', diff });
    }

    for (const { action, targetType, diff } of results) {
      if (!diff.hadChanges) continue;
      await this.auditLogService.log({
        accountId: null,
        action,
        targetType,
        targetId: transaction.id,
        targetDisplayName: transaction.transactionNumber,
        description: `${targetType.replace(/_/g, ' ')} updated via secure upload link by ${link.recipientName} (${link.recipientRole}) — identity attributed to the link's token, not an authenticated login`,
        details: {
          transactionId: transaction.id,
          uploadLinkId: link.id,
          recipientPartyId: link.recipientPartyId,
          recipientEmail: link.recipientEmail,
          changedFields: diff.changedFields,
          previousValues: diff.previousValues,
          updatedValues: Object.fromEntries(diff.changedFields.map((f) => [f, (diff.entity as Record<string, unknown> | null)?.[f] ?? null])),
          updateSource,
          updatedAtUtc: new Date().toISOString(),
        },
      });
    }

    return this.buildPublicDto(transaction);
  }

  /**
   * Called by TransactionsService.update() whenever the transaction's
   * contractPrice (the final sales price) changes. Cascades: Sales Price →
   * Gross Commission → Broker Commission → Buyer Agent Commission.
   * grossCommission is only recalculated when the Buyer Agent's own
   * commission is percentage-based — a flat-amount buyer commission is
   * unaffected by the sales price, exactly like a normal save (see
   * calculateGrossCommission). The broker split is always recomputed from
   * whatever grossCommission ends up being (whether it changed or not),
   * since both brokerCommissionAmount and buyerAgentCommissionAmount depend
   * on it regardless of the broker's own commission type. Every write goes
   * through the same diff-guarded upsert a normal save uses, so a price
   * "change" that doesn't actually move any commission figure (e.g. the
   * Buyer Agent has a flat-amount commission and no broker split is set
   * yet) writes nothing and logs nothing.
   */
  async recalculateCommissionsForContractPriceChange(transaction: TransactionEntity): Promise<void> {
    const buyerSide = await this.buyerSideInformationService.findByTransaction(transaction.id);
    let grossCommission = buyerSide?.grossCommission ?? null;

    if (buyerSide?.buyerCommissionType === 'percentage' && buyerSide.buyerCommissionValue !== null) {
      const recalculated = this.calculateGrossCommission(buyerSide.buyerCommissionType, buyerSide.buyerCommissionValue, transaction.contractPrice);
      const diff = await this.buyerSideInformationService.upsert(transaction.id, { grossCommission: recalculated });
      if (diff.hadChanges) {
        await this.logRecalculationAudit(transaction, AuditAction.BUYER_SIDE_INFO_UPDATED, 'buyer_side_information', diff);
      }
      grossCommission = recalculated;
    }

    const broker = await this.brokerInformationService.findByTransaction(transaction.id);
    if (broker?.brokerCommissionType && broker.brokerCommissionValue !== null) {
      const { brokerCommissionAmount, buyerAgentCommissionAmount } = this.calculateBrokerSplit(
        broker.brokerCommissionType, broker.brokerCommissionValue, grossCommission,
      );
      const diff = await this.brokerInformationService.upsert(transaction.id, { brokerCommissionAmount, buyerAgentCommissionAmount });
      if (diff.hadChanges) {
        await this.logRecalculationAudit(transaction, AuditAction.BROKER_INFO_UPDATED, 'broker_information', diff);
      }
    }
  }

  private async logRecalculationAudit(
    transaction: TransactionEntity,
    action: AuditAction,
    targetType: string,
    diff: UpsertDiffResult<unknown>,
  ): Promise<void> {
    await this.auditLogService.log({
      accountId: null,
      action,
      targetType,
      targetId: transaction.id,
      targetDisplayName: transaction.transactionNumber,
      description: `${targetType.replace(/_/g, ' ')} automatically recalculated after the transaction's final sales price changed`,
      details: {
        transactionId: transaction.id,
        changedFields: diff.changedFields,
        previousValues: diff.previousValues,
        updatedValues: Object.fromEntries(diff.changedFields.map((f) => [f, (diff.entity as Record<string, unknown> | null)?.[f] ?? null])),
        updateSource: 'contract_price_change_recalculation',
        updatedAtUtc: new Date().toISOString(),
      },
    });
  }
}
