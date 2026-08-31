import { Injectable } from '@nestjs/common';
import { UploadLinkEntity } from './entities/upload-link.entity';
import { SELLER_AGENT_TRANSACTION_DOCUMENT_UPLOAD, UploadLinkPurpose } from './upload-link.types';
import { TransactionEntity } from '../transactions/entities/transaction.entity';
import { DocumentChecklistStatus } from '../transaction-form-templates/transaction-form-templates.service';
import { ExternalTransactionInformationService } from '../transaction-contact-information/external-transaction-information.service';
import { SellerAgentDocumentDocusignService } from './seller-agent-document-docusign.service';
import { BuyerAgentChecklistValidationService } from './buyer-agent-checklist-validation.service';
import { UploadLinkRepository } from './upload-link.repository';

/**
 * The single "checklist + per-item enrichment" composition behind both the
 * external upload-link checklist route and the internal myTC swimlane —
 * the exact requirement that both surfaces read the same data source and
 * checklist configuration, with zero duplicated business logic. Lives in
 * UploadLinksModule (not TransactionContactInformationModule) because the
 * enrichment step needs SellerAgentDocumentDocusignService/
 * BuyerAgentChecklistValidationService, which themselves live here to avoid
 * a circular module dependency back onto TransactionContactInformationModule
 * — see upload-link.controller.ts's own comment on the same point.
 */
@Injectable()
export class ChecklistCompositionService {
  constructor(
    private readonly externalTransactionInformationService: ExternalTransactionInformationService,
    private readonly sellerAgentDocumentDocusignService: SellerAgentDocumentDocusignService,
    private readonly buyerAgentChecklistValidationService: BuyerAgentChecklistValidationService,
    private readonly uploadLinkRepo: UploadLinkRepository,
  ) {}

  /** Byte-for-byte what GET upload-links/token/:token/checklist returns for this link. */
  async composeForLink(link: UploadLinkEntity, transaction: TransactionEntity): Promise<DocumentChecklistStatus> {
    return this.composeForPurpose(link.purpose as UploadLinkPurpose, link, transaction);
  }

  /**
   * Same composition for an internal, already-authorized caller — `link` may be
   * null when no upload link has been minted yet for this purpose (Escrow/Broker
   * links are minted lazily). The Seller Agent's DocuSign enrichment is deeply
   * link-scoped (envelope lookups, the per-document security boundary) and
   * meaningless with nothing uploaded yet, so a null link always falls back to
   * the plain validation enrichment every other purpose gets — correct either
   * way, since a checklist built with no link has no matchedDocument on any
   * item for DocuSign detail to attach to regardless.
   */
  async composeForPurpose(purpose: UploadLinkPurpose, link: UploadLinkEntity | null, transaction: TransactionEntity): Promise<DocumentChecklistStatus> {
    const checklist = link
      ? await this.externalTransactionInformationService.getDocumentChecklist(link, transaction)
      : await this.externalTransactionInformationService.getDocumentChecklistForPurpose(purpose, transaction);

    if (link && purpose === SELLER_AGENT_TRANSACTION_DOCUMENT_UPLOAD) {
      return this.sellerAgentDocumentDocusignService.enrichChecklistWithDocusignInfo(link, transaction, checklist);
    }
    return this.buyerAgentChecklistValidationService.enrichChecklistWithValidation(link, transaction, checklist);
  }

  /**
   * A minimal, purpose-agnostic read of "has the Seller Agent submitted every
   * required document yet" — for another side's page (currently the Buyer
   * Agent link) to show its own pending-DocuSign notice without exposing the
   * Seller Agent's document names or checklist item labels. Resolves the
   * Seller Agent's own current active link the same way the swimlane does
   * (findMostRecentActiveByPurpose), then runs the exact same composition as
   * their own checklist route — so this can never drift from what the Seller
   * Agent Upload Link or the transaction swimlane itself shows.
   */
  async getSellerAgentStatusSummary(transaction: TransactionEntity): Promise<{ allRequiredSubmitted: boolean }> {
    const sellerAgentLink = await this.uploadLinkRepo.findMostRecentActiveByPurpose(transaction.id, SELLER_AGENT_TRANSACTION_DOCUMENT_UPLOAD);
    const checklist = await this.composeForPurpose(SELLER_AGENT_TRANSACTION_DOCUMENT_UPLOAD, sellerAgentLink, transaction);
    return { allRequiredSubmitted: checklist.allRequiredSubmitted };
  }
}
