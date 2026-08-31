import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TransactionEntity, TransactionSide } from '../transactions/entities/transaction.entity';
import { UploadLinkEntity, UploadLinkStatus } from './entities/upload-link.entity';
import {
  UploadLinkPurpose, BUYER_AGENT_TRANSACTION_DOCUMENT_UPLOAD, SELLER_AGENT_TRANSACTION_DOCUMENT_UPLOAD,
  ESCROW_OFFICER_TRANSACTION_DOCUMENT_UPLOAD, BROKER_TRANSACTION_DOCUMENT_UPLOAD,
} from './upload-link.types';
import { ChecklistCompositionService } from './checklist-composition.service';
import { CdaGenerationService } from '../cda/cda-generation.service';
import { DocuSignEnvelopeEntity, DocuSignEnvelopeStatus } from '../docusign/entities/docusign-envelope.entity';

const ALL_UPLOAD_LINK_PURPOSES: UploadLinkPurpose[] = [
  BUYER_AGENT_TRANSACTION_DOCUMENT_UPLOAD,
  SELLER_AGENT_TRANSACTION_DOCUMENT_UPLOAD,
  ESCROW_OFFICER_TRANSACTION_DOCUMENT_UPLOAD,
  BROKER_TRANSACTION_DOCUMENT_UPLOAD,
];

const NON_TERMINAL_ENVELOPE_STATUSES: ReadonlySet<string> = new Set([
  DocuSignEnvelopeStatus.CREATED,
  DocuSignEnvelopeStatus.SENT,
  DocuSignEnvelopeStatus.DELIVERED,
]);

/**
 * The single shared source of truth for "has this transaction fully
 * satisfied every document/signature/checklist requirement across every
 * upload-link audience" — every upload-link page (Buyer Agent, Seller
 * Agent, Escrow, Broker) reads this same computation, so they always agree.
 * Computed fresh on every call (no caching), mirroring every other
 * checklist method in this codebase (see ChecklistCompositionService's own
 * doc comment) — a stale "completed" banner would be worse than a slightly
 * more expensive read.
 */
@Injectable()
export class TransactionCompletionService {
  constructor(
    @InjectRepository(UploadLinkEntity)
    private readonly uploadLinksRepo: Repository<UploadLinkEntity>,
    @InjectRepository(DocuSignEnvelopeEntity)
    private readonly envelopeRepo: Repository<DocuSignEnvelopeEntity>,
    private readonly checklistComposition: ChecklistCompositionService,
    private readonly cdaGenerationService: CdaGenerationService,
  ) {}

  private findActiveLink(transactionId: string, purpose: UploadLinkPurpose): Promise<UploadLinkEntity | null> {
    return this.uploadLinksRepo.findOne({
      where: { transactionId, purpose, status: UploadLinkStatus.ACTIVE },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * True only when every one of the following holds:
   * - Every purpose's checklist (Buyer Agent, Seller Agent, Escrow, Broker)
   *   reports `allRequiredSubmitted` — which is already override-aware and
   *   already excludes any document still carrying an active (non-overridden)
   *   compliance blocker, so "documents uploaded" and "validation blockers
   *   passed" are both covered by this one signal per purpose.
   * - On a buyer-side transaction, the Broker leg specifically also has an
   *   actual signed CDA on file — the Broker checklist is vacuously
   *   `allRequiredSubmitted: true` with zero items before a CDA even exists
   *   (see getBrokerChecklistStatus), so that alone can't be trusted as
   *   "the Broker's part is done." Seller-side transactions have no
   *   CDA/Broker flow at all, so nothing further is required there.
   * - No DocuSign envelope for the transaction is still in a non-terminal
   *   state (created/sent/delivered) — i.e. no signature request is still
   *   outstanding. Declined/voided/failed envelopes don't block completion
   *   on their own; they only matter if they leave a checklist item
   *   unsubmitted, which the checklist checks above already catch.
   */
  async isTransactionCompleted(transaction: TransactionEntity): Promise<boolean> {
    for (const purpose of ALL_UPLOAD_LINK_PURPOSES) {
      const link = await this.findActiveLink(transaction.id, purpose);
      const checklist = await this.checklistComposition.composeForPurpose(purpose, link, transaction);
      if (!checklist.allRequiredSubmitted) return false;
    }

    if (transaction.side === TransactionSide.BUYER_SIDE) {
      const signedCda = await this.cdaGenerationService.getSignedCdaForTransaction(transaction);
      if (!signedCda) return false;
    }

    const envelopes = await this.envelopeRepo.find({ where: { transactionId: transaction.id } });
    if (envelopes.some((e) => NON_TERMINAL_ENVELOPE_STATUSES.has(e.status))) return false;

    return true;
  }
}
