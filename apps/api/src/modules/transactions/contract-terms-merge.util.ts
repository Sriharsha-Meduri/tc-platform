import { In, Not, Repository } from 'typeorm';
import { TransactionDocumentEntity, DocumentStatus } from '../transaction-documents/entities/transaction-document.entity';

export const INACTIVE_DOCUMENT_STATUSES = [DocumentStatus.SUPERSEDED, DocumentStatus.REJECTED, DocumentStatus.EXPIRED];

/**
 * Loads every contract-family document (RPA plus any counter-offers, addenda,
 * and amendments — SCO/BCO/SMCO/BMCO) for a transaction, oldest first — the
 * same query `EventSeederService` uses to compute deadlines, reused here so
 * every caller that needs "the final negotiated terms" reads the identical
 * document set.
 */
export function findContractFamilyDocuments(
  documentsRepo: Repository<TransactionDocumentEntity>,
  transactionId: string,
): Promise<TransactionDocumentEntity[]> {
  return documentsRepo.find({
    where: {
      transactionId,
      documentType: 'purchase_agreement',
      status: Not(In(INACTIVE_DOCUMENT_STATUSES)),
    },
    order: { createdAt: 'ASC' },
  });
}

