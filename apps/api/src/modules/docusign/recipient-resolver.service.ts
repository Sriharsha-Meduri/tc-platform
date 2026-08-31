import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TransactionPartyEntity } from '../transaction-parties/entities/transaction-party.entity';

export const ROLE_TO_LABEL: Record<string, string> = {
  buyer: 'Buyer',
  seller: 'Seller',
  buyer_agent: 'Buyer Agent',
  seller_agent: 'Seller Agent',
  buyer_agent_representative: 'Buyer Agent Rep',
  seller_agent_representative: 'Seller Agent Rep',
  buyer_transaction_coordinator: 'Buyer TC',
  seller_transaction_coordinator: 'Seller TC',
};

const ROLE_ALIASES: Record<string, string> = {
  buyer_agent: 'buyer',
  seller_agent: 'seller',
  buyer: 'buyer',
  seller: 'seller',
};

@Injectable()
export class RecipientResolverService {
  constructor(
    @InjectRepository(TransactionPartyEntity)
    private readonly partyRepo: Repository<TransactionPartyEntity>,
  ) {}

  /**
   * Find a recommended recipient by party role.
   * Tries primary party first, then any matching party, then role aliases.
   */
  findRecipientByRole(role: string, parties: TransactionPartyEntity[]): TransactionPartyEntity | undefined {
    const direct = parties.find((p) => p.partyRole === role && p.email && p.isPrimary);
    if (direct) return direct;

    const anyMatch = parties.find((p) => p.partyRole === role && p.email);
    if (anyMatch) return anyMatch;

    const fallbackRole = ROLE_ALIASES[role];
    if (fallbackRole) {
      return parties.find((p) => p.partyRole === fallbackRole && p.email);
    }

    return undefined;
  }

  /**
   * Load parties for a transaction.
   */
  async getParties(transactionId: string): Promise<TransactionPartyEntity[]> {
    return this.partyRepo.find({ where: { transactionId } });
  }

  /**
   * Build a deduplicated list of recommended recipients from field metadata.
   */
  buildRecommendedRecipients(
    fields: Array<{ recommendedRecipientRole: string }>,
    parties: TransactionPartyEntity[],
  ): Array<{ role: string; label: string; name: string; email: string }> {
    const seen = new Set<string>();
    const recipients: Array<{ role: string; label: string; name: string; email: string }> = [];

    for (const field of fields) {
      const key = field.recommendedRecipientRole;
      if (seen.has(key)) continue;
      seen.add(key);

      const party = this.findRecipientByRole(key, parties);
      const label = ROLE_TO_LABEL[key] ?? key;

      recipients.push({
        role: key,
        label,
        name: party?.displayName ?? '',
        email: party?.email ?? '',
      });
    }

    return recipients;
  }
}
