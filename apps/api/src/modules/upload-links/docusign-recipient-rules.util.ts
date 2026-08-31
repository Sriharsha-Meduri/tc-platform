import { Repository } from 'typeorm';
import { TransactionPartyEntity, PartyRole } from '../transaction-parties/entities/transaction-party.entity';
import { isValidEmail } from '../transactions/transaction-welcome-email.service';

/**
 * The Seller Agent's "documents go to the Buyer" recipient rule — every
 * BUYER party as a signer, the single BUYER_AGENT party as view-only CC.
 * Shared between the bulk SellerAgentDocusignService flow and the
 * per-document SellerAgentDocumentDocusignService, so both ever apply the
 * exact same rule, not a duplicated copy of it.
 */
export async function resolveBuyerSideRecipients(
  partiesRepo: Repository<TransactionPartyEntity>,
  transactionId: string,
): Promise<{ buyers: TransactionPartyEntity[]; buyerAgent: TransactionPartyEntity | null }> {
  const parties = await partiesRepo.find({ where: { transactionId } });
  return {
    buyers: parties.filter((p) => p.partyRole === PartyRole.BUYER),
    buyerAgent: parties.find((p) => p.partyRole === PartyRole.BUYER_AGENT) ?? null,
  };
}

/** Mirrors TransactionWelcomeEmailService's own "missing recipients" collect-and-throw pattern. */
export function missingRecipientsFor(buyers: TransactionPartyEntity[], buyerAgent: TransactionPartyEntity | null): string[] {
  const missing: string[] = [];
  if (buyers.length === 0) {
    missing.push('Buyer');
  } else {
    for (const b of buyers) {
      if (!isValidEmail(b.email)) missing.push(`Buyer (${b.displayName || b.id})`);
    }
  }
  if (!buyerAgent || !isValidEmail(buyerAgent.email)) missing.push('Buyer Agent');
  return missing;
}
