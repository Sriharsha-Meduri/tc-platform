import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { TransactionBlockerOverrideEntity } from './entities/transaction-blocker-override.entity';
import { isBlockerOverridden, hasActiveBlockers, effectiveCheckStatus, partitionBlockers } from './blocker-override.util';
import type { ComplianceCheck } from '../document-extraction/compliance-result.types';

export interface OverrideBlockerInput {
  transactionId: string;
  blockerId: string;
  documentId?: string | null;
  formCode?: string | null;
  overriddenByAccountId: string;
  reason?: string | null;
}

/**
 * The single write/read path for blocker overrides — every consumer that
 * needs to know "is this blocker overridden?" goes through
 * findForTransaction() once per request and the pure isBlockerOverridden
 * (re-exported below) helper, never its own independent flag or query.
 */
@Injectable()
export class BlockerOverrideService {
  private readonly logger = new Logger(BlockerOverrideService.name);

  constructor(
    @InjectRepository(TransactionBlockerOverrideEntity)
    private readonly overridesRepo: Repository<TransactionBlockerOverrideEntity>,
  ) {}

  /** All override records for a transaction — fetch once per request, then resolve as many blockers/documents against it as needed via the pure helpers below. */
  async findForTransaction(transactionId: string): Promise<TransactionBlockerOverrideEntity[]> {
    return this.overridesRepo.find({ where: { transactionId } });
  }

  /**
   * Records a blocker as overridden. Idempotent — a second override of the
   * same (transactionId, blockerId, documentId) scope is a no-op returning
   * the existing record, so re-clicking Override never creates duplicate
   * history rows; the first override's who/when/reason is what's preserved.
   */
  async override(input: OverrideBlockerInput): Promise<TransactionBlockerOverrideEntity> {
    const documentId = input.documentId ?? null;
    const formCode = input.formCode ?? null;

    const existing = await this.overridesRepo.findOne({
      where: {
        transactionId: input.transactionId,
        blockerId: input.blockerId,
        documentId: documentId ?? IsNull(),
        formCode: formCode ?? IsNull(),
      },
    });
    if (existing) return existing;

    const record = this.overridesRepo.create({
      transactionId: input.transactionId,
      blockerId: input.blockerId,
      documentId,
      formCode,
      status: 'OVERRIDDEN',
      overriddenByAccountId: input.overriddenByAccountId,
      overriddenAt: new Date(),
      reason: input.reason ?? null,
    });
    const saved = await this.overridesRepo.save(record);
    this.logger.log(`Blocker ${input.blockerId} overridden for transaction ${input.transactionId}${documentId ? ` (document ${documentId})` : ''} by account ${input.overriddenByAccountId}`);
    return saved;
  }

  /** True when the given blocker is overridden anywhere within this pre-fetched set — see blocker-override.util.ts for the scoping rule. */
  isOverridden(
    overrides: readonly TransactionBlockerOverrideEntity[],
    blockerId: string,
    scope: { documentId?: string | null; formCode?: string | null } = {},
  ): boolean {
    return isBlockerOverridden(overrides, blockerId, scope);
  }

  /** Override-aware replacement for a bare `blockers.length > 0` check. */
  hasActiveBlockers<T extends { code: string }>(
    blockers: readonly T[] | undefined,
    overrides: readonly TransactionBlockerOverrideEntity[],
    scope: { documentId?: string | null; formCode?: string | null } = {},
  ): boolean {
    return hasActiveBlockers(blockers, overrides, scope);
  }

  /** Splits a blockers array into active vs. overridden — used where callers need to report what's still outstanding, e.g. the submission-gate error message. */
  partitionBlockers<T extends { code: string }>(
    blockers: readonly T[],
    overrides: readonly TransactionBlockerOverrideEntity[],
    scope: { documentId?: string | null; formCode?: string | null } = {},
  ): { active: T[]; overridden: T[] } {
    return partitionBlockers(blockers, overrides, scope);
  }

  /** Override-aware status for a single compliance check row — see effectiveCheckStatus. */
  effectiveCheckStatus(
    check: ComplianceCheck,
    overrides: readonly TransactionBlockerOverrideEntity[],
    scope: { documentId?: string | null; formCode?: string | null } = {},
  ): 'passed' | 'failed' | 'not_applicable' | 'overridden' {
    return effectiveCheckStatus(check, overrides, scope);
  }
}
