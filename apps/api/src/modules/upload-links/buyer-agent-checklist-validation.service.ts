import { Injectable } from '@nestjs/common';
import { UploadLinkEntity } from './entities/upload-link.entity';
import { UploadAuditService } from './upload-audit.service';
import { ESCROW_OFFICER_TRANSACTION_DOCUMENT_UPLOAD } from './upload-link.types';
import { TransactionEntity } from '../transactions/entities/transaction.entity';
import { TransactionFormTemplatesService, UnmatchedDocumentDto, DocumentChecklistStatus } from '../transaction-form-templates/transaction-form-templates.service';
import { ChecklistItemDto, buildDocumentValidation } from '../transaction-form-templates/checklist-matching.util';
import { BlockerOverrideService } from '../blocker-overrides/blocker-override.service';

/**
 * The Buyer Agent checklist's counterpart to
 * SellerAgentDocumentDocusignService.enrichChecklistWithDocusignInfo — attaches
 * the same `validation` (per-check breakdown) and `lastRejectionReasons`
 * detail, but without any of the Seller-Agent-only DocuSign fields (the
 * Buyer Agent link has no document-sending flow). Deliberately its own small
 * service rather than a modification of the Seller Agent one, so that
 * service's behavior and tests are left untouched.
 *
 * Unlike the Seller Agent checklist (link-scoped), the Buyer Agent checklist
 * is transaction-scoped — TransactionFormTemplatesService.getDocumentInActiveSetById
 * is the matching security boundary: never a bare id, always resolved from
 * this transaction's own active checklist document set.
 */
@Injectable()
export class BuyerAgentChecklistValidationService {
  constructor(
    private readonly formTemplatesService: TransactionFormTemplatesService,
    private readonly auditService: UploadAuditService,
    private readonly blockerOverrideService: BlockerOverrideService,
  ) {}

  /**
   * `link: null` — an internal caller (the myTC swimlane) composing this purpose's
   * checklist before any upload link has been minted for it yet. There's no link id
   * to look up rejection reasons by, so that lookup is skipped (empty map) rather
   * than attempted against a nonexistent id — every item's `lastRejectionReasons`
   * comes back empty, which is correct: nothing has ever been rejected yet either.
   */
  async enrichChecklistWithValidation(
    link: UploadLinkEntity | null,
    transaction: TransactionEntity,
    checklist: DocumentChecklistStatus,
  ): Promise<DocumentChecklistStatus> {
    const [rejectionReasons, overrides] = await Promise.all([
      link ? this.findRejectionReasons(link) : Promise.resolve(new Map<string, string[]>()),
      this.blockerOverrideService.findForTransaction(transaction.id),
    ]);

    const enrichItem = async (item: ChecklistItemDto): Promise<ChecklistItemDto> => {
      const doc = item.matchedDocument
        ? await this.formTemplatesService.getDocumentInActiveSetById(transaction.id, item.matchedDocument.id)
        : null;

      return {
        ...item,
        validation: buildDocumentValidation(doc, overrides),
        lastRejectionReasons: item.status === 'reupload_required' ? (rejectionReasons.get(item.formCode) ?? []) : null,
      };
    };

    const enrichUnmatched = async (doc: UnmatchedDocumentDto): Promise<UnmatchedDocumentDto> => {
      const fullDoc = await this.formTemplatesService.getDocumentInActiveSetById(transaction.id, doc.id);
      return { ...doc, validation: buildDocumentValidation(fullDoc, overrides) };
    };

    const [items, optionalItems, unmatchedDocuments] = await Promise.all([
      Promise.all(checklist.items.map(enrichItem)),
      Promise.all(checklist.optionalItems.map(enrichItem)),
      Promise.all(checklist.unmatchedDocuments.map(enrichUnmatched)),
    ]);

    return { ...checklist, items, optionalItems, unmatchedDocuments };
  }

  /** Escrow links read their own ESCROW_DOCUMENT_VALIDATION_FAILED trail; every other purpose routed through this service (Buyer Agent, Broker) reads the Buyer Agent one. */
  private findRejectionReasons(link: UploadLinkEntity): Promise<Map<string, string[]>> {
    return link.purpose === ESCROW_OFFICER_TRANSACTION_DOCUMENT_UPLOAD
      ? this.auditService.findMostRecentEscrowRejectionReasons(link.id)
      : this.auditService.findMostRecentBuyerAgentRejectionReasons(link.id);
  }
}
