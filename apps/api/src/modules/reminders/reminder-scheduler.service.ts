import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Queue } from 'bull';
import { TransactionEntity } from '../transactions/entities/transaction.entity';
import { TransactionStage } from '../transactions/entities/transaction-stage-instance.entity';
import { TransactionPartyEntity, PartyRole } from '../transaction-parties/entities/transaction-party.entity';
import { TransactionEventEntity, EventType } from '../transaction-events/entities/transaction-event.entity';
import { TransactionEventReminderEntity, ReminderStatus } from './entities/transaction-event-reminder.entity';
import { CustomReminderEntity, CustomReminderStatus } from './entities/custom-reminder.entity';
import { DEADLINE_REMINDER_QUEUE, DeadlineReminderJobData, CustomReminderJobData } from './reminder.constants';
import { loadReminderSchedule, parseReminderSchedule } from './reminder-offset.util';
import { TransactionClockService, resolveNow } from '../transaction-clock/transaction-clock.service';
import { TransactionClockSettingsEntity } from '../transaction-clock/entities/transaction-clock-settings.entity';

export interface ReminderListItem {
  id: string;
  transactionEventId: string;
  eventType: string;
  eventLabel: string;
  eventDate: string | null;
  transactionStage: string | null;
  offsetLabel: string;
  offsetDisplay: string;
  scheduledFireAt: string;
  status: string;
  sentAt: string | null;
  cancelledAt: string | null;
  /** False when status is not SCHEDULED, fire time is in the past, or within the cutoff window */
  isCancellable: boolean;
}

/** An event that exists but has no reminder rows — all fire times were already past when scheduled */
export interface PastEventItem {
  transactionEventId: string;
  eventType: string;
  eventLabel: string;
  eventDate: string;
  transactionStage: string | null;
}

export interface CustomReminderListItem {
  id: string;
  subject: string;
  message: string | null;
  fireAt: string;
  status: string;
  sentAt: string | null;
  cancelledAt: string | null;
  isCancellable: boolean;
  recipients: string[] | null;
}

export interface ReminderListResponse {
  cutoffMinutes: number;
  reminders: ReminderListItem[];
  /** Events with no reminder rows because every fire time was already past at schedule time */
  pastEvents: PastEventItem[];
  /** User-created one-off custom reminders */
  customReminders: CustomReminderListItem[];
}

/** Roles that receive deadline reminders */
const NOTIFIED_ROLES: PartyRole[] = [
  PartyRole.BUYER_AGENT,
  PartyRole.SELLER_AGENT,
  PartyRole.BUYER_TRANSACTION_COORDINATOR,
  PartyRole.SELLER_TRANSACTION_COORDINATOR,
];

/** Maps event type to the transaction stage it belongs to */
export const EVENT_STAGE: Partial<Record<EventType, TransactionStage>> = {
  [EventType.OFFER_ACCEPTED]:      TransactionStage.CONTRACT,
  [EventType.DISCLOSURES_DUE]:     TransactionStage.DISCLOSURES,
  [EventType.INSPECTION]:          TransactionStage.INSPECTION,
  [EventType.APPRAISAL]:           TransactionStage.APPRAISAL,
  [EventType.LOAN_COMMITMENT]:     TransactionStage.LOAN,
  [EventType.CLOSING]:             TransactionStage.CLOSING,
  [EventType.POSSESSION]:          TransactionStage.CLOSING,
  [EventType.FINAL_WALKTHROUGH]:   TransactionStage.CLOSING,
  [EventType.POST_CLOSE_FOLLOWUP]: TransactionStage.POST_CLOSE,
};

/** Human-readable labels for each event type */
export const EVENT_LABELS: Partial<Record<EventType, string>> = {
  [EventType.OFFER_ACCEPTED]:   'Offer Accepted',
  [EventType.OPEN_ESCROW]:      'Open Escrow',
  [EventType.DISCLOSURES_DUE]:  'Disclosures Due',
  [EventType.INSPECTION]:       'Inspection Contingency',
  [EventType.APPRAISAL]:        'Appraisal Contingency',
  [EventType.LOAN_COMMITMENT]:  'Loan Commitment',
  [EventType.CLOSING]:          'Close of Escrow',
  [EventType.POSSESSION]:       'Possession Date',
  [EventType.FINAL_WALKTHROUGH]: 'Final Walkthrough',
  [EventType.POST_CLOSE_FOLLOWUP]: 'Post-Close Follow-Up',
};

@Injectable()
export class ReminderSchedulerService {
  private readonly logger = new Logger(ReminderSchedulerService.name);

  constructor(
    @InjectQueue(DEADLINE_REMINDER_QUEUE)
    private readonly reminderQueue: Queue<DeadlineReminderJobData>,

    @InjectRepository(TransactionEntity)
    private readonly transactionsRepo: Repository<TransactionEntity>,

    @InjectRepository(TransactionPartyEntity)
    private readonly partiesRepo: Repository<TransactionPartyEntity>,

    @InjectRepository(TransactionEventReminderEntity)
    private readonly remindersRepo: Repository<TransactionEventReminderEntity>,

    @InjectRepository(TransactionEventEntity)
    private readonly eventsRepo: Repository<TransactionEventEntity>,

    @InjectRepository(CustomReminderEntity)
    private readonly customRemindersRepo: Repository<CustomReminderEntity>,

    private readonly clockService: TransactionClockService,
  ) {}

  /**
   * Schedules reminder jobs for a list of newly-seeded events.
   * Offsets are read from REMINDER_SCHEDULE env var (e.g. "7d,3d,0d" for production,
   * "5m,2m,0m" for local testing). Past reminders are silently skipped.
   * Bull jobId deduplication (`reminder:{eventId}:{label}`) prevents double-scheduling.
   */
  async scheduleForEvents(
    events: TransactionEventEntity[],
    transactionId: string,
  ): Promise<void> {
    if (events.length === 0) return;

    const offsets = loadReminderSchedule();
    this.logger.log(
      `Reminder schedule: [${offsets.map((o) => o.label).join(', ')}] (REMINDER_SCHEDULE=${process.env.REMINDER_SCHEDULE ?? '7d,3d,0d (default)'})`,
    );

    // Load transaction, parties, and clock settings in parallel
    const [tx, parties, clockSettings] = await Promise.all([
      this.transactionsRepo.findOne({ where: { id: transactionId } }),
      this.partiesRepo.find({
        where: { transactionId, partyRole: In(NOTIFIED_ROLES) },
      }),
      this.clockService.findByTransaction(transactionId),
    ]);

    if (!tx) {
      this.logger.warn(`Transaction ${transactionId} not found — skipping reminder schedule`);
      return;
    }

    const recipients = parties
      .filter((p) => p.email)
      .map((p) => ({
        name:    p.displayName,
        email:   p.email!,
        role:    this.formatRole(p.partyRole),
        partyId: p.id,
      }));

    if (recipients.length === 0) {
      this.logger.warn(`No parties with emails for transaction ${transactionId} — skipping reminders`);
      return;
    }

    const propertyAddress = [tx.propertyAddressLine1, tx.propertyCity, tx.propertyState]
      .filter(Boolean).join(', ') || 'Unknown property';

    const fromAddress = tx.outboundEmailAddress
      ? `TC Platform <${tx.outboundEmailAddress}>`
      : `TC Platform <noreply@txn.mytcapp.net>`;

    const now = resolveNow(clockSettings);
    let scheduled = 0;

    for (const event of events) {
      const deadlineMs = event.eventDate.getTime();
      const eventLabel = EVENT_LABELS[event.eventType] ?? event.eventType;

      for (const offset of offsets) {
        const fireMs = deadlineMs - offset.ms;
        const delayMs = fireMs - now;

        if (delayMs <= 0) {
          this.logger.debug(
            `Skipping past reminder for ${event.eventType} (${offset.label} before) — fire time already passed`,
          );
          continue;
        }

        const jobId = `reminder:${event.id}:${offset.label}`;
        const jobData: DeadlineReminderJobData = {
          reminderType: 'offset',
          transactionId,
          transactionNumber: tx.transactionNumber,
          propertyAddress,
          eventDate: event.eventDate.toISOString(),
          eventType: event.eventType,
          eventLabel,
          offsetLabel: offset.label,
          offsetDisplay: offset.display,
          recipients,
          fromAddress,
          transactionStage: EVENT_STAGE[event.eventType] ?? TransactionStage.DISCLOSURES,
        };

        // Upsert DB record first — unique constraint on bull_job_id prevents duplicates
        await this.remindersRepo
          .createQueryBuilder()
          .insert()
          .into(TransactionEventReminderEntity)
          .values({
            transactionId,
            transactionEventId: event.id,
            bullJobId: jobId,
            offsetLabel: offset.label,
            scheduledFireAt: new Date(fireMs),
            status: ReminderStatus.SCHEDULED,
          })
          .orIgnore()   // skip if bull_job_id already exists (idempotent re-submit)
          .execute();

        // Enqueue the Bull job — jobId deduplication prevents double-delivery.
        // Best-effort: a queue outage (e.g. Redis unavailable) must not fail
        // the caller's larger flow (contract submission) — the DB row above
        // already recorded intent, and rescheduleForClockChange can re-enqueue
        // any SCHEDULED reminder later.
        try {
          await this.reminderQueue.add(jobData, {
            delay: delayMs,
            jobId,
            removeOnComplete: true,
            removeOnFail: 50,
          });
          scheduled++;
          this.logger.debug(
            `Queued reminder job ${jobId} — fires in ${Math.round(delayMs / 60_000)}m`,
          );
        } catch (err) {
          this.logger.warn(`Failed to enqueue reminder job ${jobId}: ${(err as Error).message} — DB row remains SCHEDULED for later re-enqueue`);
        }
      }
    }

    this.logger.log(
      `Scheduled ${scheduled} reminder job(s) for transaction ${tx.transactionNumber}`,
    );
  }

  /**
   * Rebuilds and re-enqueues all SCHEDULED reminder jobs for a transaction from DB.
   * Called after the virtual clock is changed so jobs fire at the correct delay
   * relative to the new virtual "now". Job data is reconstructed from DB — Redis
   * state is not required (fired jobs are already gone from Redis).
   */
  async rescheduleForTransaction(
    transactionId: string,
    clockSettings: TransactionClockSettingsEntity,
  ): Promise<void> {
    const scheduled = await this.remindersRepo.find({
      where: { transactionId, status: ReminderStatus.SCHEDULED },
    });

    if (scheduled.length === 0) {
      this.logger.debug(`No scheduled reminders to reschedule for transaction ${transactionId}`);
      return;
    }

    const [tx, parties] = await Promise.all([
      this.transactionsRepo.findOne({ where: { id: transactionId } }),
      this.partiesRepo.find({ where: { transactionId, partyRole: In(NOTIFIED_ROLES) } }),
    ]);

    if (!tx) {
      this.logger.warn(`Transaction ${transactionId} not found — skipping reschedule`);
      return;
    }

    const recipients = parties
      .filter((p) => p.email)
      .map((p) => ({
        name:    p.displayName,
        email:   p.email!,
        role:    this.formatRole(p.partyRole),
        partyId: p.id,
      }));

    const propertyAddress = [tx.propertyAddressLine1, tx.propertyCity, tx.propertyState]
      .filter(Boolean).join(', ') || 'Unknown property';
    const fromAddress = tx.outboundEmailAddress
      ? `TC Platform <${tx.outboundEmailAddress}>`
      : `TC Platform <noreply@txn.mytcapp.net>`;

    const virtualNow = resolveNow(clockSettings);
    let rescheduled = 0;

    for (const reminder of scheduled) {
      const event = await this.eventsRepo.findOne({ where: { id: reminder.transactionEventId } });
      if (!event) continue;

      const fireMs  = reminder.scheduledFireAt.getTime();
      const delayMs = Math.max(0, fireMs - virtualNow);
      const eventLabel = EVENT_LABELS[event.eventType as EventType] ?? event.eventType;

      // Parse offsetDisplay from the stored label (e.g. "5m" → "5 minutes")
      const [offsetData] = parseReminderSchedule(reminder.offsetLabel);
      const offsetDisplay = offsetData?.display ?? reminder.offsetLabel;

      // Remove old Bull job if still in delayed queue
      const oldJob = await this.reminderQueue.getJob(reminder.bullJobId);
      if (oldJob) await oldJob.remove();

      const jobData: DeadlineReminderJobData = {
        reminderType: 'offset',
        transactionId,
        transactionNumber: tx.transactionNumber,
        propertyAddress,
        eventDate: event.eventDate.toISOString(),
        eventType: event.eventType,
        eventLabel,
        offsetLabel: reminder.offsetLabel,
        offsetDisplay,
        recipients,
        fromAddress,
        transactionStage: EVENT_STAGE[event.eventType as EventType] ?? TransactionStage.DISCLOSURES,
      };

      try {
        await this.reminderQueue.add(jobData, {
          delay: delayMs,
          jobId: reminder.bullJobId,
          removeOnComplete: true,
          removeOnFail: 50,
        });
        rescheduled++;
        this.logger.debug(
          `Rescheduled reminder ${reminder.bullJobId} — fires in ${Math.round(delayMs / 60_000)}m`,
        );
      } catch (err) {
        this.logger.warn(`Failed to re-enqueue reminder ${reminder.bullJobId}: ${(err as Error).message}`);
      }
    }

    this.logger.log(`Rescheduled ${rescheduled}/${scheduled.length} reminders for transaction ${transactionId}`);
  }

  /**
   * Cancels all scheduled reminders for a given event.
   *
   * Blocks the entire cancellation if ANY reminder is within the cutoff window
   * (default 3 minutes, configurable via REMINDER_CANCEL_CUTOFF_MINUTES).
   * This prevents race conditions where the Bull worker is already picking up the job.
   *
   * On success: marks all scheduled rows as cancelled in the DB, then removes
   * the corresponding delayed jobs from Redis.
   */
  async cancelForEvent(transactionEventId: string, reason: string): Promise<void> {
    const cutoffMinutes = parseInt(process.env.REMINDER_CANCEL_CUTOFF_MINUTES ?? '3', 10);
    const cutoffMs = cutoffMinutes * 60 * 1000;
    const now = Date.now();

    const scheduled = await this.remindersRepo.find({
      where: { transactionEventId, status: ReminderStatus.SCHEDULED },
    });

    if (scheduled.length === 0) {
      this.logger.log(`No scheduled reminders found for event ${transactionEventId} — nothing to cancel`);
      return;
    }

    // Block if any reminder fires within the cutoff window
    const tooClose = scheduled.filter(
      (r) => r.scheduledFireAt.getTime() - now < cutoffMs,
    );

    if (tooClose.length > 0) {
      const soonest = tooClose.reduce((a, b) =>
        a.scheduledFireAt < b.scheduledFireAt ? a : b,
      );
      const minutesAway = Math.round((soonest.scheduledFireAt.getTime() - now) / 60_000);
      const label = minutesAway <= 0
        ? 'is firing now'
        : `fires in ${minutesAway} minute${minutesAway === 1 ? '' : 's'}`;

      throw new BadRequestException(
        `Cannot cancel — the ${soonest.offsetLabel} reminder ${label}. ` +
        `Cancellation must be made at least ${cutoffMinutes} minutes before dispatch.`,
      );
    }

    // Mark all rows cancelled in DB first (safety net for any remaining race window)
    await this.remindersRepo.update(
      { transactionEventId, status: ReminderStatus.SCHEDULED },
      { status: ReminderStatus.CANCELLED, cancelledReason: reason, cancelledAt: new Date() },
    );

    // Remove Bull jobs from Redis — already-fired jobs return null from getJob(), safe to skip
    for (const reminder of scheduled) {
      const job = await this.reminderQueue.getJob(reminder.bullJobId);
      if (job) {
        await job.remove();
        this.logger.debug(`Removed Bull job ${reminder.bullJobId} from Redis`);
      }
    }

    this.logger.log(
      `Cancelled ${scheduled.length} reminder(s) for event ${transactionEventId}: ${reason}`,
    );
  }

  /**
   * Creates a custom one-off reminder and enqueues its Bull job.
   * The job fires at the specified date-time and sends an email with the
   * user-provided subject and optional message body to all notified parties.
   */
  async scheduleCustomReminder(
    transactionId: string,
    fireAt: Date,
    subject: string,
    message: string | null,
    recipientRoles?: string[],
  ): Promise<CustomReminderEntity> {
    if (fireAt.getTime() <= Date.now()) {
      throw new BadRequestException('Reminder fire time must be in the future');
    }

    const [tx, parties, clockSettings] = await Promise.all([
      this.transactionsRepo.findOne({ where: { id: transactionId } }),
      this.partiesRepo.find({
        where: { transactionId, partyRole: In(NOTIFIED_ROLES) },
      }),
      this.clockService.findByTransaction(transactionId),
    ]);

    if (!tx) throw new NotFoundException(`Transaction ${transactionId} not found`);

    // Derive selected parties: default to notified roles, plus any extra recipient roles
    let selectedParties = parties;
    if (recipientRoles && recipientRoles.length > 0) {
      const allParties = await this.partiesRepo.find({
        where: { transactionId },
      });
      selectedParties = allParties.filter((p) =>
        recipientRoles.includes(p.partyRole),
      );
    }

    const recipients = selectedParties
      .filter((p) => p.email)
      .map((p) => ({
        name:    p.displayName,
        email:   p.email!,
        role:    this.formatRole(p.partyRole),
        partyId: p.id,
      }));

    const propertyAddress = [tx.propertyAddressLine1, tx.propertyCity, tx.propertyState]
      .filter(Boolean).join(', ') || 'Unknown property';

    const fromAddress = tx.outboundEmailAddress
      ? `TC Platform <${tx.outboundEmailAddress}>`
      : `TC Platform <noreply@txn.mytcapp.net>`;

    const virtualNow = resolveNow(clockSettings);
    const delayMs = Math.max(0, fireAt.getTime() - virtualNow);

    // Create DB row first
    const entity = this.customRemindersRepo.create({
      transactionId,
      fireAt,
      subject,
      message: message ?? null,
      recipients: recipientRoles ?? null,
      bullJobId: `custom-reminder:${transactionId}:${Date.now()}`,
      status: CustomReminderStatus.SCHEDULED,
    });
    const saved = await this.customRemindersRepo.save(entity);

    // Update bullJobId with the real ID
    saved.bullJobId = `custom-reminder:${saved.id}`;
    await this.customRemindersRepo.save(saved);

    // Enqueue Bull job
    const jobData: CustomReminderJobData = {
      reminderType: 'custom',
      transactionId,
      transactionNumber: tx.transactionNumber,
      propertyAddress,
      customReminderId: saved.id,
      customSubject: subject,
      customMessage: message ?? null,
      fireAt: fireAt.toISOString(),
      recipients,
      fromAddress,
      transactionStage: '', // custom reminders are not stage-specific
    };

    await this.reminderQueue.add(jobData, {
      delay: delayMs,
      jobId: saved.bullJobId,
      removeOnComplete: true,
      removeOnFail: 50,
    });

    this.logger.log(
      `Scheduled custom reminder ${saved.id} for transaction ${tx.transactionNumber} — fires at ${fireAt.toISOString()}`,
    );

    return saved;
  }

  /** Returns all reminders for a transaction with event context and cancellability flag. */
  async listByTransaction(transactionId: string): Promise<ReminderListResponse> {
    const cutoffMinutes = parseInt(process.env.REMINDER_CANCEL_CUTOFF_MINUTES ?? '3', 10);
    const cutoffMs = cutoffMinutes * 60 * 1000;
    const now = Date.now();

    const reminders = await this.remindersRepo.find({
      where: { transactionId },
      relations: ['transactionEvent'],
      order: { scheduledFireAt: 'ASC' },
    });

    const items: ReminderListItem[] = reminders.map((r) => {
      const [offset] = parseReminderSchedule(r.offsetLabel);
      const eventType = r.transactionEvent?.eventType as EventType;
      const fireMs = r.scheduledFireAt.getTime();
      const isCancellable =
        r.status === ReminderStatus.SCHEDULED &&
        fireMs > now &&
        fireMs - now >= cutoffMs;

      return {
        id: r.id,
        transactionEventId: r.transactionEventId,
        eventType: eventType ?? '',
        eventLabel: EVENT_LABELS[eventType] ?? eventType ?? '',
        eventDate: r.transactionEvent?.eventDate?.toISOString() ?? null,
        transactionStage: (EVENT_STAGE[eventType] as string) ?? null,
        offsetLabel: r.offsetLabel,
        offsetDisplay: offset?.display ?? r.offsetLabel,
        scheduledFireAt: r.scheduledFireAt.toISOString(),
        status: r.status,
        sentAt: r.sentAt?.toISOString() ?? null,
        cancelledAt: r.cancelledAt?.toISOString() ?? null,
        isCancellable,
      };
    });

    // Find events that have no reminder rows at all — deadline was already past when scheduled
    const eventIdsWithReminders = new Set(reminders.map((r) => r.transactionEventId));
    const allEvents = await this.eventsRepo.find({ where: { transactionId } });
    const pastEvents: PastEventItem[] = allEvents
      .filter((e) => !eventIdsWithReminders.has(e.id))
      .map((e) => {
        const eventType = e.eventType as EventType;
        return {
          transactionEventId: e.id,
          eventType,
          eventLabel: EVENT_LABELS[eventType] ?? eventType,
          eventDate: e.eventDate.toISOString(),
          transactionStage: (EVENT_STAGE[eventType] as string) ?? null,
        };
      });

    // Load custom reminders
    const customReminders = await this.customRemindersRepo.find({
      where: { transactionId },
      order: { fireAt: 'ASC' },
    });

    const customItems: CustomReminderListItem[] = customReminders.map((r) => {
      const fireMs = r.fireAt.getTime();
      const isCancellable =
        r.status === CustomReminderStatus.SCHEDULED &&
        fireMs > now &&
        fireMs - now >= cutoffMs;

      return {
        id: r.id,
        subject: r.subject,
        message: r.message,
        fireAt: r.fireAt.toISOString(),
        status: r.status,
        sentAt: r.sentAt?.toISOString() ?? null,
        cancelledAt: r.cancelledAt?.toISOString() ?? null,
        isCancellable,
        recipients: r.recipients,
      };
    });

    return { cutoffMinutes, reminders: items, pastEvents, customReminders: customItems };
  }

  /** Cancels a single reminder. Rejects if the reminder is within the cutoff window. */
  async cancelOne(reminderId: string, reason: string): Promise<void> {
    const cutoffMinutes = parseInt(process.env.REMINDER_CANCEL_CUTOFF_MINUTES ?? '3', 10);
    const cutoffMs = cutoffMinutes * 60 * 1000;
    const now = Date.now();

    const reminder = await this.remindersRepo.findOne({ where: { id: reminderId } });
    if (!reminder) throw new NotFoundException(`Reminder ${reminderId} not found`);
    if (reminder.status !== ReminderStatus.SCHEDULED) {
      throw new BadRequestException(`Cannot cancel a reminder with status "${reminder.status}"`);
    }

    const timeUntilFire = reminder.scheduledFireAt.getTime() - now;
    if (timeUntilFire < cutoffMs) {
      const minutesAway = Math.round(timeUntilFire / 60_000);
      const label = minutesAway <= 0
        ? 'is firing now'
        : `fires in ${minutesAway} minute${minutesAway === 1 ? '' : 's'}`;
      throw new BadRequestException(
        `Cannot cancel — this reminder ${label}. ` +
        `Cancellation must be made at least ${cutoffMinutes} minutes before dispatch.`,
      );
    }

    await this.remindersRepo.update(
      { id: reminderId },
      { status: ReminderStatus.CANCELLED, cancelledReason: reason, cancelledAt: new Date() },
    );

    const job = await this.reminderQueue.getJob(reminder.bullJobId);
    if (job) await job.remove();

    this.logger.log(`Cancelled reminder ${reminderId}: ${reason}`);
  }

  /** Cancels a single custom reminder. Rejects if within the cutoff window. */
  async cancelOneCustom(reminderId: string, reason: string): Promise<void> {
    const cutoffMinutes = parseInt(process.env.REMINDER_CANCEL_CUTOFF_MINUTES ?? '3', 10);
    const cutoffMs = cutoffMinutes * 60 * 1000;
    const now = Date.now();

    const reminder = await this.customRemindersRepo.findOne({ where: { id: reminderId } });
    if (!reminder) throw new NotFoundException(`Custom reminder ${reminderId} not found`);
    if (reminder.status !== CustomReminderStatus.SCHEDULED) {
      throw new BadRequestException(`Cannot cancel a custom reminder with status "${reminder.status}"`);
    }

    const timeUntilFire = reminder.fireAt.getTime() - now;
    if (timeUntilFire < cutoffMs) {
      const minutesAway = Math.round(timeUntilFire / 60_000);
      const label = minutesAway <= 0
        ? 'is firing now'
        : `fires in ${minutesAway} minute${minutesAway === 1 ? '' : 's'}`;
      throw new BadRequestException(
        `Cannot cancel — this reminder ${label}. ` +
        `Cancellation must be made at least ${cutoffMinutes} minutes before dispatch.`,
      );
    }

    await this.customRemindersRepo.update(
      { id: reminderId },
      { status: CustomReminderStatus.CANCELLED, cancelledAt: new Date() },
    );

    const job = await this.reminderQueue.getJob(reminder.bullJobId);
    if (job) await job.remove();

    this.logger.log(`Cancelled custom reminder ${reminderId}: ${reason}`);
  }

  private formatRole(role: PartyRole): string {
    return role
      .split('_')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }
}
