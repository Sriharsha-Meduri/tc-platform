import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Queue } from 'bull';
import { TransactionEntity, CoordinatorSide } from '../transactions/entities/transaction.entity';
import { TransactionStage } from '../transactions/entities/transaction-stage-instance.entity';
import { TransactionPartyEntity, PartyRole } from '../transaction-parties/entities/transaction-party.entity';
import { isValidEmail } from '../transactions/transaction-welcome-email.service';
import {
  NoticeToPerformReminderEntity,
  NoticeToPerformReminderStatus,
} from './entities/notice-to-perform-reminder.entity';
import type { ContingencyType } from './entities/contingency-removal-reminder.entity';
import type { ContingencyEventCandidate } from './contingency-removal-reminder-scheduler.service';
import { DEADLINE_REMINDER_QUEUE, NoticeToPerformReminderJobData } from './reminder.constants';
import { TransactionClockService, resolveNow } from '../transaction-clock/transaction-clock.service';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Default days after a contingency deadline to prompt the Listing TC about an
 * NTP. The C.A.R. RPA default is 2 calendar days. The per-contract extracted
 * value (buyer/seller_notice_to_perform_days) is not yet plumbed through
 * FinalTerms; until it is, this default is used.
 */
export const DEFAULT_NTP_DAYS = 2;

const CONTINGENCY_LABELS: Record<ContingencyType, string> = {
  inspection: 'Inspection Contingency',
  loan: 'Loan Contingency',
  appraisal: 'Appraisal Contingency',
};

/**
 * Schedules a Notice to Perform (NTP) prompt to the Listing TC for each
 * contingency that could still go unremoved. Fires NTP-days AFTER the deadline.
 * Seller-side only: this scheduler no-ops for buyer-side and legacy transactions.
 * Mirrors ContingencyRemovalReminderSchedulerService: idempotent insert keyed
 * by a unique bull_job_id, reschedules on deadline change, cancels when waived.
 */
@Injectable()
export class NoticeToPerformReminderSchedulerService {
  private readonly logger = new Logger(NoticeToPerformReminderSchedulerService.name);

  constructor(
    @InjectQueue(DEADLINE_REMINDER_QUEUE)
    private readonly reminderQueue: Queue<NoticeToPerformReminderJobData>,
    @InjectRepository(NoticeToPerformReminderEntity)
    private readonly remindersRepo: Repository<NoticeToPerformReminderEntity>,
    @InjectRepository(TransactionEntity)
    private readonly transactionsRepo: Repository<TransactionEntity>,
    @InjectRepository(TransactionPartyEntity)
    private readonly partiesRepo: Repository<TransactionPartyEntity>,
    private readonly clockService: TransactionClockService,
  ) {}

  async scheduleOrReschedule(transactionId: string, candidates: ContingencyEventCandidate[]): Promise<void> {
    if (candidates.length === 0) return;

    const [tx, clockSettings, parties] = await Promise.all([
      this.transactionsRepo.findOne({
        where: { id: transactionId },
        relations: ['createdByAccount', 'createdByAccount.user'],
      }),
      this.clockService.findByTransaction(transactionId),
      this.partiesRepo.find({ where: { transactionId } }),
    ]);
    if (!tx) {
      this.logger.warn(`NTP scheduler: transaction ${transactionId} not found`);
      return;
    }

    // NTP prompts are a seller-side (Listing TC) concern. Skip buyer-side and
    // legacy (null → buyer) transactions.
    if (tx.transactionSide !== CoordinatorSide.SELLER) return;

    const recipientEmail = this.resolveListingTcEmail(tx, parties);
    if (!recipientEmail) {
      this.logger.debug(`NTP scheduler: no valid Listing TC email for tx ${tx.transactionNumber}, skipping`);
      return;
    }

    const propertyAddress = [tx.propertyAddressLine1, tx.propertyCity, tx.propertyState]
      .filter(Boolean).join(', ') || 'Unknown property';
    const fromAddress = tx.outboundEmailAddress
      ? `TC Platform <${tx.outboundEmailAddress}>`
      : `TC Platform <noreply@txn.mytcapp.net>`;
    const now = resolveNow(clockSettings);

    for (const { contingencyType, event, waived } of candidates) {
      if (waived) {
        await this.cancelScheduled(transactionId, contingencyType, 'Contingency waived or removed by the negotiated contract terms');
        continue;
      }
      if (!event) continue;

      const fireAt = new Date(event.eventDate.getTime() + DEFAULT_NTP_DAYS * ONE_DAY_MS);

      const existing = await this.remindersRepo.findOne({
        where: { transactionId, contingencyType, status: NoticeToPerformReminderStatus.SCHEDULED },
      });
      if (existing && existing.fireAt.getTime() === fireAt.getTime()) continue;
      if (existing) await this.cancelRow(existing, 'Negotiated deadline changed, rescheduling');

      const delayMs = fireAt.getTime() - now;
      if (delayMs <= 0) {
        this.logger.debug(`NTP fire time already passed for ${contingencyType} on tx ${tx.transactionNumber}, skipping`);
        continue;
      }

      const jobId = `ntp-reminder:${event.id}:${fireAt.getTime()}`;
      const jobData: NoticeToPerformReminderJobData = {
        reminderType: 'notice_to_perform',
        transactionId,
        transactionNumber: tx.transactionNumber,
        propertyAddress,
        transactionEventId: event.id,
        contingencyType,
        contingencyLabel: CONTINGENCY_LABELS[contingencyType],
        deadline: event.eventDate.toISOString(),
        ntpDays: DEFAULT_NTP_DAYS,
        recipientEmail,
        recipientName: tx.createdByAccount?.displayName ?? 'Transaction Coordinator',
        fromAddress,
        transactionStage: TransactionStage.INSPECTION,
      };

      await this.remindersRepo
        .createQueryBuilder()
        .insert()
        .into(NoticeToPerformReminderEntity)
        .values({
          transactionId,
          transactionEventId: event.id,
          contingencyType,
          deadlineAt: event.eventDate,
          fireAt,
          recipientEmail,
          bullJobId: jobId,
          status: NoticeToPerformReminderStatus.SCHEDULED,
        })
        .orIgnore()
        .execute();

      try {
        await this.reminderQueue.add(jobData, { delay: delayMs, jobId, removeOnComplete: true, removeOnFail: 50 });
        this.logger.log(`Scheduled NTP prompt for ${contingencyType} on tx ${tx.transactionNumber}, fires ${fireAt.toISOString()}`);
      } catch (err) {
        this.logger.error(`Failed to enqueue NTP job ${jobId}: ${(err as Error).message}`);
      }
    }
  }

  async cancelForSatisfiedContingencies(transactionId: string, types: ContingencyType[]): Promise<void> {
    for (const type of types) {
      await this.cancelScheduled(transactionId, type, 'Contingency satisfied by an uploaded and validated CR-B');
    }
  }

  private resolveListingTcEmail(tx: TransactionEntity, parties: TransactionPartyEntity[]): string | null {
    const sellerTc = parties.find((p) => p.partyRole === PartyRole.SELLER_TRANSACTION_COORDINATOR);
    if (sellerTc && isValidEmail(sellerTc.email)) return sellerTc.email!;
    const creatorEmail = tx.createdByAccount?.user?.email ?? null;
    if (isValidEmail(creatorEmail)) return creatorEmail!;
    return null;
  }

  private async cancelScheduled(transactionId: string, contingencyType: ContingencyType, reason: string): Promise<void> {
    const existing = await this.remindersRepo.findOne({
      where: { transactionId, contingencyType, status: NoticeToPerformReminderStatus.SCHEDULED },
    });
    if (!existing) return;
    await this.cancelRow(existing, reason);
  }

  private async cancelRow(row: NoticeToPerformReminderEntity, reason: string): Promise<void> {
    await this.remindersRepo.update(row.id, {
      status: NoticeToPerformReminderStatus.CANCELLED,
      cancelledReason: reason,
      cancelledAt: new Date(),
    });
    const job = await this.reminderQueue.getJob(row.bullJobId);
    if (job) await job.remove();
  }
}
