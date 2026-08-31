import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { Queue } from 'bull';
import { TransactionEntity } from '../transactions/entities/transaction.entity';
import { TransactionStage } from '../transactions/entities/transaction-stage-instance.entity';
import { TransactionEventEntity, EventType } from '../transaction-events/entities/transaction-event.entity';
import { TransactionDocumentEntity } from '../transaction-documents/entities/transaction-document.entity';
import { UploadLinkEntity, UploadLinkStatus } from '../upload-links/entities/upload-link.entity';
import { BUYER_AGENT_TRANSACTION_DOCUMENT_UPLOAD } from '../upload-links/upload-link.types';
import {
  VerificationOfPropertyReminderEntity,
  VerificationOfPropertyReminderStatus,
} from './entities/verification-of-property-reminder.entity';
import { DEADLINE_REMINDER_QUEUE, VerificationOfPropertyReminderJobData } from './reminder.constants';
import { TransactionClockService, resolveNow } from '../transaction-clock/transaction-clock.service';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/** How many days before Close of Escrow to remind, when the transaction hasn't set its own value. */
export const DEFAULT_BUYER_SIDE_REMINDER_LEAD_DAYS = 3;

export function resolveBuyerSideReminderLeadDays(leadDays: number | null | undefined): number {
  return leadDays ?? DEFAULT_BUYER_SIDE_REMINDER_LEAD_DAYS;
}

/**
 * Schedules/cancels the single Buyer Side reminder for the Verification of
 * Property checklist item — a dedicated sibling to
 * ContingencyRemovalReminderSchedulerService, not a generalization of it.
 * The one meaningful difference: this reminder's email must include a
 * working secure upload link, which can't be pre-baked into the job payload
 * (the raw token is never persisted) — the link is regenerated fresh at
 * fire time, in the processor, from just the `uploadLinkId` carried here.
 */
@Injectable()
export class VerificationOfPropertyReminderSchedulerService {
  private readonly logger = new Logger(VerificationOfPropertyReminderSchedulerService.name);

  constructor(
    @InjectQueue(DEADLINE_REMINDER_QUEUE)
    private readonly reminderQueue: Queue<VerificationOfPropertyReminderJobData>,

    @InjectRepository(VerificationOfPropertyReminderEntity)
    private readonly remindersRepo: Repository<VerificationOfPropertyReminderEntity>,

    @InjectRepository(UploadLinkEntity)
    private readonly uploadLinksRepo: Repository<UploadLinkEntity>,

    @InjectRepository(TransactionEntity)
    private readonly transactionsRepo: Repository<TransactionEntity>,

    @InjectRepository(TransactionDocumentEntity)
    private readonly documentsRepo: Repository<TransactionDocumentEntity>,

    @InjectRepository(TransactionEventEntity)
    private readonly eventsRepo: Repository<TransactionEventEntity>,

    private readonly clockService: TransactionClockService,
  ) {}

  /**
   * Called from EventSeederService right after the CLOSING `transaction_events`
   * row is created or updated — passed both new and updated events, so a
   * changed Close of Escrow date cancels the obsolete reminder and schedules
   * a new one, matching the contingency-removal scheduler's convention.
   */
  async scheduleOrReschedule(transactionId: string, closingEvent: TransactionEventEntity | null): Promise<void> {
    if (!closingEvent) return; // no Close of Escrow date has ever resolved — never fabricate one

    if (await this.isVpAlreadySatisfied(transactionId)) {
      await this.cancelScheduled(transactionId, 'Verification of Property already validated');
      return;
    }

    const link = await this.findActiveBuyerAgentLink(transactionId);
    if (!link) {
      this.logger.debug(`No active Buyer Agent upload link for transaction ${transactionId} — skipping VP reminder scheduling`);
      return;
    }

    const tx = await this.transactionsRepo.findOne({ where: { id: transactionId } });
    if (!tx) {
      this.logger.warn(`Transaction ${transactionId} not found — skipping VP reminder scheduling`);
      return;
    }

    const existing = await this.remindersRepo.findOne({
      where: { transactionId, status: VerificationOfPropertyReminderStatus.SCHEDULED },
    });

    if (existing && existing.deadlineAt.getTime() === closingEvent.eventDate.getTime()) {
      return; // unchanged — already scheduled correctly, idempotent no-op
    }

    if (existing) {
      await this.cancelRow(existing, 'Close of Escrow date changed — rescheduling');
    }

    const leadDays = resolveBuyerSideReminderLeadDays(tx.buyerSideReminderLeadDays);
    const clockSettings = await this.clockService.findByTransaction(transactionId);
    const now = resolveNow(clockSettings);

    const fireMs = closingEvent.eventDate.getTime() - leadDays * ONE_DAY_MS;
    const delayMs = fireMs - now;

    if (delayMs <= 0) {
      this.logger.debug(`Skipping past VP reminder for transaction ${transactionId} — fire time already passed`);
      return;
    }

    const propertyAddress = [tx.propertyAddressLine1, tx.propertyCity, tx.propertyState]
      .filter(Boolean).join(', ') || 'Unknown property';
    const fromAddress = tx.outboundEmailAddress
      ? `TC Platform <${tx.outboundEmailAddress}>`
      : `TC Platform <noreply@txn.mytcapp.net>`;

    const jobId = `vp-reminder:${transactionId}:${closingEvent.eventDate.getTime()}`;
    const jobData: VerificationOfPropertyReminderJobData = {
      reminderType: 'verification_of_property',
      transactionId,
      transactionNumber: tx.transactionNumber,
      propertyAddress,
      transactionEventId: closingEvent.id,
      deadlineLabel: 'Close of Escrow',
      deadline: closingEvent.eventDate.toISOString(),
      recipientEmail: link.recipientEmail,
      recipientName: link.recipientName,
      ccEmail: link.ccEmail ?? null,
      uploadLinkId: link.id,
      fromAddress,
      transactionStage: TransactionStage.CLOSING,
    };

    await this.remindersRepo
      .createQueryBuilder()
      .insert()
      .into(VerificationOfPropertyReminderEntity)
      .values({
        transactionId,
        uploadLinkId: link.id,
        transactionEventId: closingEvent.id,
        deadlineAt: closingEvent.eventDate,
        bullJobId: jobId,
        status: VerificationOfPropertyReminderStatus.SCHEDULED,
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
      this.logger.debug(`Scheduled VP reminder ${jobId} — fires in ${Math.round(delayMs / 60_000)}m`);
    } catch (err) {
      this.logger.warn(`Failed to enqueue VP reminder ${jobId}: ${(err as Error).message} — DB row remains SCHEDULED for later re-enqueue`);
    }
  }

  /** Cancels any pending reminder — called when a validated VP save satisfies the checklist item. */
  async cancelIfSatisfied(transactionId: string): Promise<void> {
    await this.cancelScheduled(transactionId, 'Verification of Property satisfied by an uploaded and validated form');
  }

  /**
   * Re-derives the current CLOSING event and re-runs schedule/cancel with a new lead time —
   * called by the Buyer Side reminder-settings endpoint after a lead-time change. Only ever
   * touches a `SCHEDULED` row (via scheduleOrReschedule's own idempotent-reschedule logic) —
   * an already-`SENT` reminder is never revisited.
   */
  async rescheduleForNewLeadTime(transactionId: string): Promise<void> {
    const closingEvent = await this.eventsRepo.findOne({ where: { transactionId, eventType: EventType.CLOSING } });
    await this.scheduleOrReschedule(transactionId, closingEvent);
  }

  private async findActiveBuyerAgentLink(transactionId: string): Promise<UploadLinkEntity | null> {
    return this.uploadLinksRepo.findOne({
      where: {
        transactionId,
        purpose: BUYER_AGENT_TRANSACTION_DOCUMENT_UPLOAD,
        status: UploadLinkStatus.ACTIVE,
        expiresAt: MoreThan(new Date()),
      },
      order: { createdAt: 'DESC' },
    });
  }

  private async isVpAlreadySatisfied(transactionId: string): Promise<boolean> {
    const doc = await this.documentsRepo.findOne({
      where: { transactionId, formCode: 'VP', analysisStatus: 'completed' },
    });
    return !!doc;
  }

  private async cancelScheduled(transactionId: string, reason: string): Promise<void> {
    const existing = await this.remindersRepo.findOne({
      where: { transactionId, status: VerificationOfPropertyReminderStatus.SCHEDULED },
    });
    if (!existing) return;
    await this.cancelRow(existing, reason);
  }

  private async cancelRow(row: VerificationOfPropertyReminderEntity, reason: string): Promise<void> {
    await this.remindersRepo.update(row.id, {
      status: VerificationOfPropertyReminderStatus.CANCELLED,
      cancelledReason: reason,
      cancelledAt: new Date(),
    });
    const job = await this.reminderQueue.getJob(row.bullJobId);
    if (job) await job.remove();
    this.logger.debug(`Cancelled VP reminder ${row.bullJobId}: ${reason}`);
  }
}
