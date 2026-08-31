import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrganizationMembershipEntity, MembershipStatus } from '../organizations/entities/organization-membership.entity';
import { TransactionPartyEntity } from '../transaction-parties/entities/transaction-party.entity';
import { TransactionEntity } from '../transactions/entities/transaction.entity';
import { AccountsService } from '../accounts/accounts.service';
import { TransactionAccessGrantsService } from '../transaction-access-grants/transaction-access-grants.service';

/**
 * The single reusable implementation of docs/design.md §12's four additive
 * access modes (org-wide / party-based / grant-based / hybrid) for a given
 * (account, transaction) pair. Nothing else in the codebase implements this
 * generically today — GET /transactions/:id and friends only sit behind the
 * global JwtAuthGuard, with no transaction-scoped check. New endpoints that
 * expose per-transaction data to authenticated dashboard users should call
 * this rather than re-deriving access rules inline.
 *
 * Deliberately its own standalone leaf module (not folded into TransactionsModule)
 * — TransactionsModule already transitively depends on TransactionDocumentsModule
 * (via TransactionFormTemplatesModule/UploadLinksModule), so if this service lived
 * there, TransactionDocumentsModule importing it back (needed for the
 * GET /transaction-documents/:id/file access check) would create a cycle.
 */
@Injectable()
export class TransactionAccessService {
  constructor(
    @InjectRepository(OrganizationMembershipEntity)
    private readonly membershipRepo: Repository<OrganizationMembershipEntity>,
    @InjectRepository(TransactionPartyEntity)
    private readonly partiesRepo: Repository<TransactionPartyEntity>,
    private readonly accountsService: AccountsService,
    private readonly accessGrantsService: TransactionAccessGrantsService,
  ) {}

  async canAccountAccessTransaction(accountId: string, tx: TransactionEntity): Promise<boolean> {
    // Direct FK ownership: the account that created the transaction, the coordinator
    // assigned to it, or the buyer agent it's tied to always has access — regardless of
    // whether a matching transaction_parties row exists. These fields are how the
    // transaction itself records its own participants; docs/design.md §12's three modes
    // predate this and only cover party rows, which are frequently created without an
    // accountId link (see the party-based fallback below) — without this check, the
    // account that just created a transaction can be locked out of its own swimlane.
    if (tx.createdByAccountId === accountId) return true;
    if (tx.assignedCoordinatorAccountId === accountId) return true;
    if (tx.buyerAgentAccountId === accountId) return true;

    // Org-wide: an active membership in the transaction's own org grants access.
    // Deliberately scope-independent — assigning a coordinator is optional, so
    // access must not be gated on `assignedCoordinatorAccountId` being set.
    const orgMembership = await this.membershipRepo.findOne({
      where: { accountId, organizationId: tx.organizationId, status: MembershipStatus.ACTIVE },
    });
    if (orgMembership) return true;

    // Party-based: an accountId-linked party row, or (since accountId is rarely populated on
    // party rows today — see TransactionsService.resolveQaAccessContext) a party row whose email
    // matches the account's own email, case-insensitively.
    const partyByAccountId = await this.partiesRepo.findOne({ where: { transactionId: tx.id, accountId } });
    if (partyByAccountId) return true;

    const account = await this.accountsService.findOne(accountId).catch(() => null);
    const email = account?.user?.email;
    if (email) {
      const partyByEmail = await this.partiesRepo
        .createQueryBuilder('p')
        .where('p.transactionId = :transactionId', { transactionId: tx.id })
        .andWhere('LOWER(p.email) = LOWER(:email)', { email })
        .getOne();
      if (partyByEmail) return true;
    }

    // Grant-based: an active (not revoked, not expired) transaction_access_grants row.
    const grants = await this.accessGrantsService.findByTransaction(tx.id);
    const now = new Date();
    const activeGrant = grants.find((g) => g.accountId === accountId && !g.revokedAt && (!g.expiresAt || g.expiresAt > now));
    if (activeGrant) return true;

    return false;
  }
}
