import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindManyOptions, Not, ArrayContains, In, ILike } from 'typeorm';
import {
  TransactionEntity,
  TransactionStatus,
  TransactionType,
  TransactionSide,
} from './entities/transaction.entity';
import { CreateTransactionInput } from './dto/create-transaction.input';
import { UpdateTransactionInput } from './dto/update-transaction.input';
import { AccountsService } from '../accounts/accounts.service';
import { TransactionAccessGrantsService } from '../transaction-access-grants/transaction-access-grants.service';
import { OrganizationMembershipEntity, MemberRole, MembershipStatus } from '../organizations/entities/organization-membership.entity';
import { TransactionPartyEntity, PartyRole } from '../transaction-parties/entities/transaction-party.entity';
import { Logger } from '@nestjs/common';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditAction } from '../audit-log/audit-log.entity';
import { VerificationOfPropertyReminderSchedulerService } from '../reminders/verification-of-property-reminder-scheduler.service';
import { SellerSideDocumentReminderSchedulerService } from '../reminders/seller-side-document-reminder-scheduler.service';
import { ExternalTransactionInformationService } from '../transaction-contact-information/external-transaction-information.service';
import { CdaGenerationService } from '../cda/cda-generation.service';
import { CdaNotificationService } from '../cda-notification/cda-notification.service';

/** Party roles that count as "assigned agent" or "assigned TC" for QA-delete visibility. */
const QA_AGENT_PARTY_ROLES = [PartyRole.BUYER_AGENT, PartyRole.SELLER_AGENT];
const QA_TC_PARTY_ROLES = [PartyRole.BUYER_TRANSACTION_COORDINATOR, PartyRole.SELLER_TRANSACTION_COORDINATOR];

export interface TransactionFilters {
  organizationId?: string;
  status?: TransactionStatus;
  excludeSoftDeletedForAccountId?: string;
}

export interface TransactionDashboardSummary {
  id: string;
  transactionNumber: string;
  status: string;
  propertyAddressLine1: string | null;
  propertyCity: string | null;
  propertyState: string | null;
  listPrice: number | null;
  contractPrice: number | null;
  closeOfEscrowAt: Date | null;
  offerAcceptedAt: Date | null;
  activeStage: string | null;
  blockerCount: number;
  warningCount: number;
  formCodes: string[];
  createdAt: Date;
}

@Injectable()
export class TransactionsService {
  private readonly logger = new Logger(TransactionsService.name);

  constructor(
    @InjectRepository(TransactionEntity)
    private readonly transactionsRepo: Repository<TransactionEntity>,
    @InjectRepository(OrganizationMembershipEntity)
    private readonly membershipRepo: Repository<OrganizationMembershipEntity>,
    @InjectRepository(TransactionPartyEntity)
    private readonly partiesRepo: Repository<TransactionPartyEntity>,
    private readonly accountsService: AccountsService,
    private readonly accessGrantsService: TransactionAccessGrantsService,
    private readonly auditLogService: AuditLogService,
    private readonly vpReminderScheduler: VerificationOfPropertyReminderSchedulerService,
    private readonly sellerSideReminderScheduler: SellerSideDocumentReminderSchedulerService,
    private readonly externalTransactionInformationService: ExternalTransactionInformationService,
    private readonly cdaGenerationService: CdaGenerationService,
    private readonly cdaNotificationService: CdaNotificationService,
  ) {}

  async findAll(filters?: TransactionFilters): Promise<TransactionEntity[]> {
    const where: Record<string, unknown> = { status: Not(TransactionStatus.CANCELLED) };
    if (filters?.organizationId) where.organizationId = filters.organizationId;
    if (filters?.status) where.status = filters.status;
    const txs = await this.transactionsRepo.find({ where, order: { createdAt: 'DESC' } } as FindManyOptions<TransactionEntity>);

    // Include access-granted transactions for the excluded account
    if (filters?.excludeSoftDeletedForAccountId) {
      const grants = await this.accessGrantsService.findActiveByAccount(filters.excludeSoftDeletedForAccountId);
      const grantIds = new Set(grants.map((g) => g.transactionId));
      const existingIds = new Set(txs.map((t) => t.id));
      if (grantIds.size > 0) {
        const grantedTxs = await this.transactionsRepo.find({
          where: { id: In([...grantIds].filter((id) => !existingIds.has(id))), status: Not(TransactionStatus.CANCELLED) },
          order: { createdAt: 'DESC' } as Record<string, 'DESC'>,
        });
        txs.push(...grantedTxs);
      }
    }

    return txs;
  }

  async findOne(id: string): Promise<TransactionEntity> {
    const tx = await this.transactionsRepo.findOne({ where: { id } });
    if (!tx) throw new NotFoundException(`Transaction ${id} not found`);
    return tx;
  }

  findByOrganization(organizationId: string): Promise<TransactionEntity[]> {
    return this.transactionsRepo.find({
      where: { organizationId, status: Not(TransactionStatus.CANCELLED) },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Resolves the transactions a given account may view/delete for the QA-delete
   * workflow:
   *  - Brokers (active broker_admin membership) — every transaction in their brokerage.
   *  - Agents — transactions where they are the assigned buyer agent (transaction
   *    column) or a buyer/seller agent party.
   *  - Transaction Coordinators — transactions where they are the assigned
   *    coordinator (transaction column) or a buyer/seller TC party.
   *  - Anyone — transactions they created (the floor: you can always manage what
   *    you created, even with no org membership at all, e.g. an independent agent).
   * Unrelated transactions are never included.
   *
   * Filters in memory against {@link canAccountManageTransactionForQa}'s exact
   * rule set (rather than a parallel SQL query) so this list and the delete
   * authorization check can never drift apart — nothing shown here can ever
   * be refused on delete, and vice versa.
   *
   * Outside production, the rule set above is bypassed entirely and every
   * non-cancelled transaction is returned instead (see
   * {@link isQaDeleteUnrestricted}). Local QA testing routinely switches
   * between several seeded dev logins in the same browser across sessions
   * (e.g. alice.tc@sunsetrealty.com one day, admin@tcplatform.com the next)
   * — restricting visibility to `createdByAccountId === accountId` would
   * silently orphan every transaction created under a login other than
   * whichever one happens to be active right now, even though it's the same
   * person testing locally. There's no real security boundary to protect on
   * localhost/dev, so QA-delete simply shows/allows everything there.
   */
  async findQaDeletableTransactions(accountId: string): Promise<TransactionEntity[]> {
    const candidates = await this.transactionsRepo.find({
      where: { status: Not(TransactionStatus.CANCELLED) },
      order: { createdAt: 'DESC' },
    });
    if (this.isQaDeleteUnrestricted()) return candidates;
    const context = await this.resolveQaAccessContext(accountId);
    return candidates.filter((tx) => this.matchesQaAccessContext(tx, accountId, context));
  }

  /** Same rule set as {@link findQaDeletableTransactions}, evaluated against a single transaction. */
  async canAccountManageTransactionForQa(tx: TransactionEntity, accountId: string): Promise<boolean> {
    if (this.isQaDeleteUnrestricted()) return true;
    const context = await this.resolveQaAccessContext(accountId);
    return this.matchesQaAccessContext(tx, accountId, context);
  }

  /** Same non-production check used by NonProductionGuard — never true in production. */
  private isQaDeleteUnrestricted(): boolean {
    return process.env.APP_ENV !== 'production';
  }

  private matchesQaAccessContext(
    tx: TransactionEntity,
    accountId: string,
    context: { brokerOrgIds: string[]; assignedTransactionIds: string[] },
  ): boolean {
    if (tx.createdByAccountId === accountId) return true;
    if (tx.assignedCoordinatorAccountId === accountId) return true;
    if (tx.buyerAgentAccountId === accountId) return true;
    if (context.brokerOrgIds.includes(tx.organizationId)) return true;
    if (context.assignedTransactionIds.includes(tx.id)) return true;
    return false;
  }

  /**
   * Party rows only ever get `displayName`/`email` populated (nothing in the
   * app currently links `TransactionPartyEntity.accountId` to a real account)
   * — so an agent/TC named as a party but never explicitly `accountId`-linked
   * would otherwise be invisible to the party-based QA-delete rule below.
   * Matching by the account's own email against `party.email` (case-insensitive)
   * catches that case; the `accountId` match is kept too in case it's ever
   * populated by a future flow.
   */
  private async resolveQaAccessContext(accountId: string): Promise<{
    brokerOrgIds: string[];
    assignedTransactionIds: string[];
  }> {
    const memberships = await this.membershipRepo.find({
      where: { accountId, status: MembershipStatus.ACTIVE },
    });
    const brokerOrgIds = memberships
      .filter((m) => m.role === MemberRole.BROKER_ADMIN)
      .map((m) => m.organizationId);

    const partyRoles = [...QA_AGENT_PARTY_ROLES, ...QA_TC_PARTY_ROLES];
    const partiesByAccountId = await this.partiesRepo.find({
      where: { accountId, partyRole: In(partyRoles) },
    });

    let partiesByEmail: TransactionPartyEntity[] = [];
    const account = await this.accountsService.findOne(accountId).catch(() => null);
    const email = account?.user?.email;
    if (email) {
      partiesByEmail = await this.partiesRepo.find({
        where: { email: ILike(email), partyRole: In(partyRoles) },
      });
    }

    const assignedTransactionIds = [...new Set(
      [...partiesByAccountId, ...partiesByEmail].map((p) => p.transactionId),
    )];

    return { brokerOrgIds, assignedTransactionIds };
  }

  async create(dto: CreateTransactionInput): Promise<TransactionEntity> {
    const tx = this.transactionsRepo.create({
      organizationId: dto.organizationId,
      transactionNumber: dto.transactionNumber,
      transactionType: dto.transactionType,
      side: dto.side,
      propertyAddressLine1: dto.propertyAddressLine1,
      propertyCity: dto.propertyCity,
      propertyState: dto.propertyState,
      createdByAccountId: dto.createdByAccountId,
      listPrice: dto.listPrice ?? null,
      contractPrice: dto.contractPrice ?? null,
    });
    return this.transactionsRepo.save(tx);
  }

  /**
   * If contractPrice (the final sales price) changes here, cascades the
   * recalculation of any percentage-based buyer commission and its
   * downstream broker split — see
   * ExternalTransactionInformationService.recalculateCommissionsForContractPriceChange.
   * Non-fatal: a recalculation failure must never fail the transaction
   * update itself.
   */
  async update(id: string, dto: UpdateTransactionInput): Promise<TransactionEntity> {
    const tx = await this.findOne(id);
    const contractPriceChanged = dto.contractPrice !== undefined && dto.contractPrice !== tx.contractPrice;
    Object.assign(tx, dto);
    const saved = await this.transactionsRepo.save(tx);
    if (contractPriceChanged) {
      try {
        await this.externalTransactionInformationService.recalculateCommissionsForContractPriceChange(saved);
      } catch (err) {
        this.logger.warn(`Commission recalculation after contractPrice change failed for transaction ${saved.id}: ${(err as Error).message}`);
      }
      // The recalculated commission figures (if anything actually changed) feed
      // straight into the CDA — regenerate it the same way a Buyer Agent/Broker
      // commission save does. Non-fatal for the same reason as the recalculation above.
      try {
        await this.cdaGenerationService.maybeGenerateCda(saved);
      } catch (err) {
        this.logger.warn(`CDA regeneration after contractPrice change failed for transaction ${saved.id}: ${(err as Error).message}`);
      }
      try {
        await this.cdaNotificationService.notifyIfCdaReady(saved);
      } catch (err) {
        this.logger.warn(`CDA-ready notification after contractPrice change failed for transaction ${saved.id}: ${(err as Error).message}`);
      }
    }
    return saved;
  }

  async updateStatus(id: string, status: TransactionStatus): Promise<TransactionEntity> {
    const tx = await this.findOne(id);
    tx.status = status;
    return this.transactionsRepo.save(tx);
  }

  /**
   * Sets the Buyer Side reminder lead time (days before Close of Escrow the
   * Verification of Property reminder fires). Diff-guarded — only writes and
   * audits when the value actually changes — then reschedules any pending
   * (not yet sent) VP reminder against the new lead time.
   */
  async setBuyerSideReminderLeadTime(id: string, leadDays: number): Promise<TransactionEntity> {
    if (!Number.isInteger(leadDays) || leadDays < 0) {
      throw new BadRequestException('leadDays must be a non-negative integer');
    }

    const tx = await this.findOne(id);
    const previousValue = tx.buyerSideReminderLeadDays;
    if (previousValue === leadDays) return tx;

    tx.buyerSideReminderLeadDays = leadDays;
    const saved = await this.transactionsRepo.save(tx);

    await this.auditLogService.log({
      accountId: null,
      action: AuditAction.BUYER_SIDE_REMINDER_LEAD_TIME_UPDATED,
      targetType: 'transaction',
      targetId: saved.id,
      targetDisplayName: saved.transactionNumber,
      description: `Buyer Side reminder lead time changed to ${leadDays} day(s) before Close of Escrow`,
      details: { transactionId: saved.id, previousValue, newValue: leadDays },
    });

    await this.vpReminderScheduler.rescheduleForNewLeadTime(saved.id);

    return saved;
  }

  /**
   * Sets the Seller Side reminder lead time (days before the Seller
   * Disclosures Due date each per-document reminder fires). Diff-guarded —
   * only writes and audits when the value actually changes — then
   * reschedules any pending (not yet sent) reminders against the new lead
   * time.
   */
  async setSellerSideReminderLeadTime(id: string, leadDays: number): Promise<TransactionEntity> {
    if (!Number.isInteger(leadDays) || leadDays < 0) {
      throw new BadRequestException('leadDays must be a non-negative integer');
    }

    const tx = await this.findOne(id);
    const previousValue = tx.sellerSideReminderLeadDays;
    if (previousValue === leadDays) return tx;

    tx.sellerSideReminderLeadDays = leadDays;
    const saved = await this.transactionsRepo.save(tx);

    await this.auditLogService.log({
      accountId: null,
      action: AuditAction.SELLER_SIDE_REMINDER_LEAD_TIME_UPDATED,
      targetType: 'transaction',
      targetId: saved.id,
      targetDisplayName: saved.transactionNumber,
      description: `Seller Side reminder lead time changed to ${leadDays} day(s) before Seller Disclosures Due`,
      details: { transactionId: saved.id, previousValue, newValue: leadDays },
    });

    await this.sellerSideReminderScheduler.rescheduleForNewLeadTime(saved.id);

    return saved;
  }

  /** Soft-delete: marks the transaction as CANCELLED without removing the row. */
  async void(id: string): Promise<TransactionEntity> {
    const tx = await this.findOne(id);
    tx.status = TransactionStatus.CANCELLED;
    return this.transactionsRepo.save(tx);
  }

  /** Per-account soft delete: hides the transaction from the given account only. */
  async softDeleteForAccount(id: string, accountId: string): Promise<TransactionEntity> {
    const tx = await this.findOne(id);
    const current = tx.deletedByAccountIds ?? [];
    if (!current.includes(accountId)) {
      tx.deletedByAccountIds = [...current, accountId];
      await this.transactionsRepo.save(tx);
    }
    return tx;
  }

  /** Restores a per-account soft delete: makes the transaction visible to the given account again. */
  async restoreForAccount(id: string, accountId: string): Promise<TransactionEntity> {
    const tx = await this.findOne(id);
    tx.deletedByAccountIds = (tx.deletedByAccountIds ?? []).filter((a) => a !== accountId);
    return this.transactionsRepo.save(tx);
  }

  async remove(id: string): Promise<void> {
    const tx = await this.findOne(id);
    await this.transactionsRepo.remove(tx);
  }

  async findDashboardSummaries(organizationId?: string, accountId?: string): Promise<TransactionDashboardSummary[]> {
    let transactions = await this.fetchTransactionRows(organizationId, accountId);

    // Include transactions the user has an access grant for
    if (accountId) {
      const grantedTxs = await this.fetchAccessGrantedTransactions(accountId);
      // Merge by ID to avoid duplicates
      const existingIds = new Set(transactions.map((t) => t.id));
      for (const tx of grantedTxs) {
        if (!existingIds.has(tx.id)) {
          transactions.push(tx);
        }
      }
    }

    return transactions
      .filter((tx) => !(tx.deletedByAccountIds ?? []).includes(accountId ?? ''))
      .map((tx) => this.mapToSummary(tx));
  }

  private async fetchTransactionRows(organizationId?: string, accountId?: string): Promise<TransactionEntity[]> {
    const where: Record<string, unknown> = { status: Not(TransactionStatus.CANCELLED) };
    if (organizationId) {
      where.organizationId = organizationId;
    } else if (accountId) {
      where.createdByAccountId = accountId;
    }

    return this.transactionsRepo.find({
      where,
      relations: ['stageInstances', 'documents'],
      order: { createdAt: 'DESC' } as Record<string, 'DESC'>,
    });
  }

  private async fetchAccessGrantedTransactions(accountId: string): Promise<TransactionEntity[]> {
    const grants = await this.accessGrantsService.findActiveByAccount(accountId);
    if (grants.length === 0) return [];
    const ids = grants.map((g) => g.transactionId);
    return this.transactionsRepo.find({
      where: { id: In(ids), status: Not(TransactionStatus.CANCELLED) },
      relations: ['stageInstances', 'documents'],
      order: { createdAt: 'DESC' } as Record<string, 'DESC'>,
    });
  }

  private mapToSummary(tx: TransactionEntity): TransactionDashboardSummary {
    const docs = (tx.documents ?? []).filter((d) => d.status !== 'superseded');
    const activeStage = (tx.stageInstances ?? []).find((si) => si.status === 'active')?.stage ?? null;

    let blockerCount = 0;
    let warningCount = 0;
    const formCodes = new Set<string>();

    for (const doc of docs) {
      const meta = doc.metadataJson as Record<string, unknown> | null;
      if (meta) {
        const compliance = meta.compliance as { blockers?: unknown[]; warnings?: unknown[] } | undefined;
        if (compliance) {
          blockerCount += compliance.blockers?.length ?? 0;
          warningCount += compliance.warnings?.length ?? 0;
        }
        const fc = meta.detectedFormCode as string | undefined;
        if (fc) formCodes.add(fc.toUpperCase());
      }
    }

    return {
      id: tx.id,
      transactionNumber: tx.transactionNumber,
      status: tx.status,
      propertyAddressLine1: tx.propertyAddressLine1,
      propertyCity: tx.propertyCity,
      propertyState: tx.propertyState,
      listPrice: tx.listPrice,
      contractPrice: tx.contractPrice,
      closeOfEscrowAt: tx.closeOfEscrowAt,
      offerAcceptedAt: tx.offerAcceptedAt,
      activeStage,
      blockerCount,
      warningCount,
      formCodes: [...formCodes].sort(),
      createdAt: tx.createdAt,
    };
  }

  private generateTransactionNumber(): string {
    const year   = new Date().getFullYear();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `TXN-${year}-${random}`;
  }

  async createWithAgent(params: {
    organizationId: string;
    createdByAccountId: string;
    buyerAgentEmail: string;
    buyerAgentName: string;
    propertyAddressLine1: string;
    propertyCity: string;
    propertyState: string;
    transactionType?: TransactionType;
    side?: TransactionSide;
  }): Promise<{
    transaction: TransactionEntity;
    buyerAgentNotInSystem: boolean;
  }> {
    // Check if buyer agent email matches a MyTC Agent account — if so, link it
    // immediately so the agent can view the transaction in their portal. Either
    // way, the transaction is created active right away; nothing waits on the
    // agent's account status.
    const agentAccount = await this.accountsService.findAgentByEmail(params.buyerAgentEmail);

    const tx = this.transactionsRepo.create({
      organizationId: params.organizationId,
      transactionNumber: this.generateTransactionNumber(),
      transactionType: params.transactionType ?? TransactionType.PURCHASE,
      side: params.side ?? TransactionSide.BUYER_SIDE,
      propertyAddressLine1: params.propertyAddressLine1,
      propertyCity: params.propertyCity,
      propertyState: params.propertyState,
      createdByAccountId: params.createdByAccountId,
      status: TransactionStatus.ACTIVE,
      buyerAgentAccountId: agentAccount?.id ?? null,
    });

    const saved = await this.transactionsRepo.save(tx);
    return { transaction: saved, buyerAgentNotInSystem: !agentAccount };
  }
}
