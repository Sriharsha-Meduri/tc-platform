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
import { SELLER_AGENT_TRANSACTION_DOCUMENT_UPLOAD } from '../upload-links/upload-link.types';
import { TransactionFormTemplatesService } from '../transaction-form-templates/transaction-form-templates.service';
import {
  SellerSideDocumentReminderEntity,
  SellerSideDocumentReminderStatus,
} from './entities/seller-side-document-reminder.entity';
import { DEADLINE_REMINDER_QUEUE, SellerSideDocumentReminderJobData } from './reminder.constants';
import { TransactionClockService, resolveNow } from '../transaction-clock/transaction-clock.service';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/** How many days before the Seller Disclosures Due date to remind, when the transaction hasn't set its own value. */
export const DEFAULT_SELLER_SIDE_REMINDER_LEAD_DAYS = 3;

export function resolveSellerSideReminderLeadDays(leadDays: number | null | undefined): number {
  return leadDays ?? DEFAULT_SELLER_SIDE_REMINDER_LEAD_DAYS;
}

/**
 * Schedules/cancels one reminder per required Seller Agent CAR-form document
 * (a dedicated sibling to ContingencyRemovalReminderSchedulerService and
 * VerificationOfPropertyReminderSchedulerService, not a generalization of
 * either) — combines CR-B's "multiple items, one scheduler" shape with VP's
 * "embed a working link, regenerated at fire time" shape. All items share
 * the same deadline (Seller Disclosures Due — there is only one seller-side
 * deadline today), but each required form code gets its own row/job so it
 * can be independently satisfied and cancelled.
 */
@Injectable()
export class SellerSideDocumentReminderSchedulerService {
  private readonly logger = new Logger(SellerSideDocumentReminderSchedulerService.name);

  constructor(
    @InjectQueue(DEADLINE_REMINDER_QUEUE)
    private readonly reminderQueue: Queue<SellerSideDocumentReminderJobData>,

    @InjectRepository(SellerSideDocumentReminderEntity)
    private readonly remindersRepo: Repository<SellerSideDocumentReminderEntity>,

    @InjectRepository(UploadLinkEntity)
    private readonly uploadLinksRepo: Repository<UploadLinkEntity>,

    @InjectRepository(TransactionEntity)
    private readonly transactionsRepo: Repository<TransactionEntity>,

    @InjectRepository(TransactionDocumentEntity)
    private readonly documentsRepo: Repository<TransactionDocumentEntity>,

    @InjectRepository(TransactionEventEntity)
    private readonly eventsRepo: Repository<TransactionEventEntity>,

    private readonly formTemplatesService: TransactionFormTemplatesService,

    private readonly clockService: TransactionClockService,
  ) {}

  /**
   * Called from EventSeederService right after the DISCLOSURES_DUE
   * `transaction_events` row is created or updated — re-evaluates every
   * required Seller Agent form code against the current deadline and
   * satisfaction state every time this runs (cheap and idempotent), same
   * "runs even when nothing changed" reasoning as the sibling schedulers.
   */
  async scheduleOrReschedule(transactionId: string, disclosuresDueEvent: TransactionEventEntity | null): Promise<void> {
    if (!disclosuresDueEvent) return; // no Seller Disclosures deadline has ever resolved — never fabricate one

    const link = await this.findActiveSellerAgentLink(transactionId);
    if (!link) {
      this.logger.debug(`No active Seller Agent upload link for transaction ${transactionId} — skipping seller-side reminder scheduling`);
      return;
    }

    const tx = await this.transactionsRepo.findOne({ where: { id: transactionId } });
    if (!tx) {
      this.logger.warn(`Transaction ${transactionId} not found — skipping seller-side reminder scheduling`);
      return;
    }

    const template = await this.formTemplatesService.resolveForTransaction({
      organizationId: tx.organizationId ?? undefined,
      stateCode: tx.propertyState ?? undefined,
      transactionType: tx.transactionType,
      side: tx.side,
    });
    const requiredItems = (template?.items ?? []).filter((i) => i.isRequired);
    if (requiredItems.length === 0) return;

    const leadDays = resolveSellerSideReminderLeadDays(tx.sellerSideReminderLeadDays);
    const clockSettings = await this.clockService.findByTransaction(transactionId);
    const now = resolveNow(clockSettings);

    const propertyAddress = [tx.propertyAddressLine1, tx.propertyCity, tx.propertyState]
      .filter(Boolean).join(', ') || 'Unknown property';
    const fromAddress = tx.outboundEmailAddress
      ? `TC Platform <${tx.outboundEmailAddress}>`
      : `TC Platform <noreply@txn.mytcapp.net>`;

    for (const item of requiredItems) {
      if (await this.isFormAlreadySatisfied(transactionId, item.formCode)) {
        await this.cancelScheduled(transactionId, item.formCode, 'Document already uploaded and validated');
        continue;
      }

      const existing = await this.remindersRepo.findOne({
        where: { transactionId, formCode: item.formCode, status: SellerSideDocumentReminderStatus.SCHEDULED },
      });

      if (existing && existing.deadlineAt.getTime() === disclosuresDueEvent.eventDate.getTime()) {
        continue; // unchanged — already scheduled correctly, idempotent no-op
      }

      if (existing) {
        await this.cancelRow(existing, 'Seller Disclosures due date changed — rescheduling');
      }

      const fireMs = disclosuresDueEvent.eventDate.getTime() - leadDays * ONE_DAY_MS;
      const delayMs = fireMs - now;

      if (delayMs <= 0) {
        this.logger.debug(`Skipping past seller-side reminder for ${item.formCode} on transaction ${transactionId} — fire time already passed`);
        continue;
      }

      const jobId = `seller-side-reminder:${transactionId}:${item.formCode}:${disclosuresDueEvent.eventDate.getTime()}`;
      const jobData: SellerSideDocumentReminderJobData = {
        reminderType: 'seller_side_document',
        transactionId,
        transactionNumber: tx.transactionNumber,
        propertyAddress,
        transactionEventId: disclosuresDueEvent.id,
        formCode: item.formCode,
        formName: item.formName,
        deadline: disclosuresDueEvent.eventDate.toISOString(),
        recipientEmail: link.recipientEmail,
        recipientName: link.recipientName,
        ccEmail: link.ccEmail ?? null,
        uploadLinkId: link.id,
        fromAddress,
        transactionStage: TransactionStage.DISCLOSURES,
      };

      await this.remindersRepo
        .createQueryBuilder()
        .insert()
        .into(SellerSideDocumentReminderEntity)
        .values({
          transactionId,
          uploadLinkId: link.id,
          transactionEventId: disclosuresDueEvent.id,
          formCode: item.formCode,
          formName: item.formName,
          deadlineAt: disclosuresDueEvent.eventDate,
          bullJobId: jobId,
          status: SellerSideDocumentReminderStatus.SCHEDULED,
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
        this.logger.debug(`Scheduled seller-side reminder ${jobId} — fires in ${Math.round(delayMs / 60_000)}m`);
      } catch (err) {
        this.logger.warn(`Failed to enqueue seller-side reminder ${jobId}: ${(err as Error).message} — DB row remains SCHEDULED for later re-enqueue`);
      }
    }
  }

  /** Cancels the pending reminder for one form code — called when an upload validates that document. */
  async cancelIfSatisfied(transactionId: string, formCode: string): Promise<void> {
    await this.cancelScheduled(transactionId, formCode, 'Document satisfied by an uploaded and validated document');
  }

  /**
   * Re-derives the current DISCLOSURES_DUE event and re-runs schedule/cancel
   * for every required form code with a new lead time — called by the Seller
   * Side reminder-settings endpoint after a lead-time change. Only ever
   * touches `SCHEDULED` rows (via scheduleOrReschedule's own idempotent
   * logic) — an already-`SENT` reminder is never revisited.
   */
  async rescheduleForNewLeadTime(transactionId: string): Promise<void> {
    const disclosuresDueEvent = await this.eventsRepo.findOne({
      where: { transactionId, eventType: EventType.DISCLOSURES_DUE },
    });
    await this.scheduleOrReschedule(transactionId, disclosuresDueEvent);
  }

  private async findActiveSellerAgentLink(transactionId: string): Promise<UploadLinkEntity | null> {
    return this.uploadLinksRepo.findOne({
      where: {
        transactionId,
        purpose: SELLER_AGENT_TRANSACTION_DOCUMENT_UPLOAD,
        status: UploadLinkStatus.ACTIVE,
        expiresAt: MoreThan(new Date()),
      },
      order: { createdAt: 'DESC' },
    });
  }

  private async isFormAlreadySatisfied(transactionId: string, formCode: string): Promise<boolean> {
    const doc = await this.documentsRepo.findOne({
      where: { transactionId, formCode, analysisStatus: 'completed' },
    });
    return !!doc;
  }

  private async cancelScheduled(transactionId: string, formCode: string, reason: string): Promise<void> {
    const existing = await this.remindersRepo.findOne({
      where: { transactionId, formCode, status: SellerSideDocumentReminderStatus.SCHEDULED },
    });
    if (!existing) return;
    await this.cancelRow(existing, reason);
  }

  private async cancelRow(row: SellerSideDocumentReminderEntity, reason: string): Promise<void> {
    await this.remindersRepo.update(row.id, {
      status: SellerSideDocumentReminderStatus.CANCELLED,
      cancelledReason: reason,
      cancelledAt: new Date(),
    });
    const job = await this.reminderQueue.getJob(row.bullJobId);
    if (job) await job.remove();
    this.logger.debug(`Cancelled seller-side reminder ${row.bullJobId}: ${reason}`);
  }
}
