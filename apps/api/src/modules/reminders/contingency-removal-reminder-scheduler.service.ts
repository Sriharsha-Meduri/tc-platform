import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { Queue } from 'bull';
import { TransactionEntity } from '../transactions/entities/transaction.entity';
import { TransactionStage } from '../transactions/entities/transaction-stage-instance.entity';
import { TransactionEventEntity } from '../transaction-events/entities/transaction-event.entity';
import { UploadLinkEntity, UploadLinkStatus } from '../upload-links/entities/upload-link.entity';
import { BUYER_AGENT_TRANSACTION_DOCUMENT_UPLOAD } from '../upload-links/upload-link.types';
import {
  ContingencyRemovalReminderEntity,
  ContingencyRemovalReminderStatus,
  ContingencyType,
} from './entities/contingency-removal-reminder.entity';
import { DEADLINE_REMINDER_QUEUE, ContingencyRemovalReminderJobData } from './reminder.constants';
import { EVENT_STAGE } from './reminder-scheduler.service';
import { TransactionClockService, resolveNow } from '../transaction-clock/transaction-clock.service';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const CONTINGENCY_LABELS: Record<ContingencyType, string> = {
  inspection: 'Inspection Contingency Removal',
  loan: 'Loan Contingency Removal',
  appraisal: 'Appraisal Contingency Removal',
};

export interface ContingencyEventCandidate {
  contingencyType: ContingencyType;
  /**
   * The persisted `transaction_events` row for this contingency type, if one
   * exists. Null when no deadline has ever resolved (nothing to schedule) —
   * still meaningful when `waived` is true, since a waived contingency needs
   * no event row to cancel an already-scheduled reminder by type.
   */
  event: TransactionEventEntity | null;
  /** True when the contract's final negotiated terms waive/remove this contingency — never scheduled. */
  waived: boolean;
  /** Raw contingency day count, for the email's "contract timeframe" line. Null when unresolved. */
  days: number | null;
}

/**
 * Schedules/cancels the single "1 day before deadline" reminder for each
 * contingency-removal checklist item (inspection/loan/appraisal) on the
 * Buyer Agent secure upload link — a dedicated sibling to
 * ReminderSchedulerService's generic multi-offset reminders, not a
 * generalization of it (different audience: the Buyer Agent, in their
 * upload-link email thread, not a broad party list; different offset:
 * exactly one, at T-1 day; and it reschedules on deadline *changes* to an
 * existing event, which the generic scheduler deliberately does not do).
 */
@Injectable()
export class ContingencyRemovalReminderSchedulerService {
  private readonly logger = new Logger(ContingencyRemovalReminderSchedulerService.name);

  constructor(
    @InjectQueue(DEADLINE_REMINDER_QUEUE)
    private readonly reminderQueue: Queue<ContingencyRemovalReminderJobData>,

    @InjectRepository(ContingencyRemovalReminderEntity)
    private readonly remindersRepo: Repository<ContingencyRemovalReminderEntity>,

    @InjectRepository(UploadLinkEntity)
    private readonly uploadLinksRepo: Repository<UploadLinkEntity>,

    @InjectRepository(TransactionEntity)
    private readonly transactionsRepo: Repository<TransactionEntity>,

    private readonly clockService: TransactionClockService,
  ) {}

  /**
   * Called from EventSeederService right after INSPECTION/APPRAISAL/
   * LOAN_COMMITMENT `transaction_events` rows are created or updated.
   * Unlike the generic scheduler, this is passed BOTH newly-created and
   * updated events, so a changed negotiated deadline cancels the obsolete
   * reminder and schedules a new one — not just a no-op for existing events.
   */
  async scheduleOrReschedule(transactionId: string, candidates: ContingencyEventCandidate[]): Promise<void> {
    if (candidates.length === 0) return;

    const link = await this.uploadLinksRepo.findOne({
      where: {
        transactionId,
        purpose: BUYER_AGENT_TRANSACTION_DOCUMENT_UPLOAD,
        status: UploadLinkStatus.ACTIVE,
        expiresAt: MoreThan(new Date()),
      },
      order: { createdAt: 'DESC' },
    });

    if (!link) {
      this.logger.debug(`No active Buyer Agent upload link for transaction ${transactionId} — skipping contingency reminder scheduling`);
      return;
    }

    const [tx, clockSettings] = await Promise.all([
      this.transactionsRepo.findOne({ where: { id: transactionId } }),
      this.clockService.findByTransaction(transactionId),
    ]);

    if (!tx) {
      this.logger.warn(`Transaction ${transactionId} not found — skipping contingency reminder scheduling`);
      return;
    }

    const propertyAddress = [tx.propertyAddressLine1, tx.propertyCity, tx.propertyState]
      .filter(Boolean).join(', ') || 'Unknown property';
    const fromAddress = tx.outboundEmailAddress
      ? `TC Platform <${tx.outboundEmailAddress}>`
      : `TC Platform <noreply@txn.mytcapp.net>`;
    const now = resolveNow(clockSettings);

    for (const { contingencyType, event, waived, days } of candidates) {
      if (waived) {
        await this.cancelScheduled(transactionId, contingencyType, 'Contingency waived or removed by the negotiated contract terms');
        continue;
      }

      if (!event) continue; // no deadline has ever resolved — never fabricate one

      const existing = await this.remindersRepo.findOne({
        where: { transactionId, contingencyType, status: ContingencyRemovalReminderStatus.SCHEDULED },
      });

      if (existing && existing.deadlineAt.getTime() === event.eventDate.getTime()) {
        continue; // unchanged — already scheduled correctly, idempotent no-op
      }

      if (existing) {
        await this.cancelRow(existing, 'Negotiated deadline changed — rescheduling');
      }

      const fireMs = event.eventDate.getTime() - ONE_DAY_MS;
      const delayMs = fireMs - now;

      if (delayMs <= 0) {
        this.logger.debug(`Skipping past contingency reminder for ${contingencyType} on transaction ${transactionId} — fire time already passed`);
        continue;
      }

      const jobId = `contingency-reminder:${event.id}:${event.eventDate.getTime()}`;
      const jobData: ContingencyRemovalReminderJobData = {
        reminderType: 'contingency_removal',
        transactionId,
        transactionNumber: tx.transactionNumber,
        propertyAddress,
        transactionEventId: event.id,
        contingencyType,
        contingencyLabel: CONTINGENCY_LABELS[contingencyType],
        deadline: event.eventDate.toISOString(),
        contractTimeframe: days != null ? `${days} day${days === 1 ? '' : 's'} after Acceptance` : 'Unknown',
        recipientEmail: link.recipientEmail,
        recipientName: link.recipientName,
        ccEmail: link.ccEmail ?? null,
        emailMessageId: link.emailMessageId ?? null,
        fromAddress,
        transactionStage: EVENT_STAGE[event.eventType] ?? TransactionStage.INSPECTION,
      };

      await this.remindersRepo
        .createQueryBuilder()
        .insert()
        .into(ContingencyRemovalReminderEntity)
        .values({
          transactionId,
          uploadLinkId: link.id,
          transactionEventId: event.id,
          contingencyType,
          deadlineAt: event.eventDate,
          bullJobId: jobId,
          status: ContingencyRemovalReminderStatus.SCHEDULED,
        })
        .orIgnore()
        .execute();

      try {
        await this.reminderQueue.add(jobData, {
          delay: delayMs,
          jobId,
          removeOnComplete: true,
          removeOnFail: 50,
        });
        this.logger.debug(`Scheduled contingency reminder ${jobId} — fires in ${Math.round(delayMs / 60_000)}m`);
      } catch (err) {
        this.logger.warn(`Failed to enqueue contingency reminder ${jobId}: ${(err as Error).message} — DB row remains SCHEDULED for later re-enqueue`);
      }
    }
  }

  /** Cancels any pending reminder for the given contingency types — called when a validated CR-B satisfies them. */
  async cancelForSatisfiedContingencies(transactionId: string, types: ContingencyType[]): Promise<void> {
    for (const type of types) {
      await this.cancelScheduled(transactionId, type, 'Contingency satisfied by an uploaded and validated CR-B');
    }
  }

  private async cancelScheduled(transactionId: string, contingencyType: ContingencyType, reason: string): Promise<void> {
    const existing = await this.remindersRepo.findOne({
      where: { transactionId, contingencyType, status: ContingencyRemovalReminderStatus.SCHEDULED },
    });
    if (!existing) return;
    await this.cancelRow(existing, reason);
  }

  private async cancelRow(row: ContingencyRemovalReminderEntity, reason: string): Promise<void> {
    await this.remindersRepo.update(row.id, {
      status: ContingencyRemovalReminderStatus.CANCELLED,
      cancelledReason: reason,
      cancelledAt: new Date(),
    });
    const job = await this.reminderQueue.getJob(row.bullJobId);
    if (job) await job.remove();
    this.logger.debug(`Cancelled contingency reminder ${row.bullJobId}: ${reason}`);
  }
}
