import { Processor, Process } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job } from 'bull';
import { MailgunService } from '../auth/mailgun.service';
import { EmailTemplateService } from '../auth/email-template.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditAction } from '../audit-log/audit-log.entity';
import { TransactionEventReminderEntity, ReminderStatus } from './entities/transaction-event-reminder.entity';
import { CustomReminderEntity, CustomReminderStatus } from './entities/custom-reminder.entity';
import { ContingencyRemovalReminderEntity, ContingencyRemovalReminderStatus, ContingencyType } from './entities/contingency-removal-reminder.entity';
import { VerificationOfPropertyReminderEntity, VerificationOfPropertyReminderStatus } from './entities/verification-of-property-reminder.entity';
import { SellerSideDocumentReminderEntity, SellerSideDocumentReminderStatus } from './entities/seller-side-document-reminder.entity';
import { TransactionMessageEntity, MessageChannel, MessageDirection, MessageStatus } from '../transaction-messages/entities/transaction-message.entity';
import { TransactionDocumentEntity } from '../transaction-documents/entities/transaction-document.entity';
import { UploadLinkRepository } from '../upload-links/upload-link.repository';
import { DEADLINE_REMINDER_QUEUE, DeadlineReminderJobData, OffsetReminderJobData, CustomReminderJobData, ContingencyRemovalReminderJobData, VerificationOfPropertyReminderJobData, SellerSideDocumentReminderJobData } from './reminder.constants';

/** Event types that map to contingency stages where CR-B forms are required. */
const CONTINGENCY_EVENT_TYPES = new Set(['INSPECTION', 'APPRAISAL', 'LOAN_COMMITMENT']);

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

@Processor(DEADLINE_REMINDER_QUEUE)
export class ReminderProcessor {
  private readonly logger = new Logger(ReminderProcessor.name);

  constructor(
    private readonly mailgunService: MailgunService,
    private readonly emailTemplateService: EmailTemplateService,

    @InjectRepository(TransactionEventReminderEntity)
    private readonly remindersRepo: Repository<TransactionEventReminderEntity>,

    @InjectRepository(CustomReminderEntity)
    private readonly customRemindersRepo: Repository<CustomReminderEntity>,

    @InjectRepository(ContingencyRemovalReminderEntity)
    private readonly contingencyRemindersRepo: Repository<ContingencyRemovalReminderEntity>,

    @InjectRepository(VerificationOfPropertyReminderEntity)
    private readonly vpRemindersRepo: Repository<VerificationOfPropertyReminderEntity>,

    @InjectRepository(SellerSideDocumentReminderEntity)
    private readonly sellerSideRemindersRepo: Repository<SellerSideDocumentReminderEntity>,

    @InjectRepository(TransactionMessageEntity)
    private readonly messagesRepo: Repository<TransactionMessageEntity>,

    @InjectRepository(TransactionDocumentEntity)
    private readonly documentsRepo: Repository<TransactionDocumentEntity>,

    private readonly uploadLinkRepo: UploadLinkRepository,
    private readonly auditLogService: AuditLogService,
  ) {}

  @Process()
  async handleDeadlineReminder(job: Job<DeadlineReminderJobData>): Promise<void> {
    const data = job.data;
    const jobId = job.opts.jobId as string ?? job.id.toString();

    if (data.reminderType === 'custom') {
      await this.handleCustomReminder(data, jobId);
    } else if (data.reminderType === 'contingency_removal') {
      await this.handleContingencyRemovalReminder(data, jobId);
    } else if (data.reminderType === 'verification_of_property') {
      await this.handleVerificationOfPropertyReminder(data, jobId);
    } else if (data.reminderType === 'seller_side_document') {
      await this.handleSellerSideDocumentReminder(data, jobId);
    } else {
      await this.handleOffsetReminder(data, jobId);
    }
  }

  private async handleSellerSideDocumentReminder(data: SellerSideDocumentReminderJobData, jobId: string): Promise<void> {
    this.logger.log(`Processing seller-side reminder job ${jobId}: ${data.formName} for ${data.transactionNumber}`);

    // ── DB gate — source of truth check ────────────────────────────────────────
    const reminder = await this.sellerSideRemindersRepo.findOne({ where: { bullJobId: jobId } });

    if (!reminder) {
      this.logger.warn(`No DB record found for seller-side reminder job ${jobId} — skipping (orphaned job)`);
      return;
    }

    if (reminder.status !== SellerSideDocumentReminderStatus.SCHEDULED) {
      this.logger.log(`Seller-side reminder ${jobId} is ${reminder.status} — skipping email send`);
      return;
    }

    // ── Fire-time re-check — skip if the document has since been validated ──
    const doc = await this.documentsRepo.findOne({
      where: { transactionId: data.transactionId, formCode: data.formCode, analysisStatus: 'completed' },
    });
    if (doc) {
      this.logger.log(`Seller-side reminder ${jobId} skipped — ${data.formCode} already validated`);
      await this.sellerSideRemindersRepo.update(reminder.id, {
        status: SellerSideDocumentReminderStatus.SKIPPED,
        cancelledReason: 'Document already validated at fire time',
        cancelledAt: new Date(),
      });
      return;
    }

    // ── Regenerate the Seller Agent upload link — raw tokens are never persisted,
    // so a fresh one must be minted now, at fire time, to embed a working URL. ──
    const existingLink = await this.uploadLinkRepo.findById(data.uploadLinkId);
    if (!existingLink) {
      this.logger.warn(`Seller-side reminder ${jobId} skipped — upload link ${data.uploadLinkId} no longer exists`);
      await this.sellerSideRemindersRepo.update(reminder.id, {
        status: SellerSideDocumentReminderStatus.SKIPPED,
        cancelledReason: 'Upload link no longer exists at fire time',
        cancelledAt: new Date(),
      });
      return;
    }

    const { link: newLink, token } = await this.uploadLinkRepo.regenerate(existingLink);
    const webUrl = process.env.WEB_APP_URL ?? 'http://localhost:3001';
    const uploadUrl = `${webUrl}/upload-link/${token}`;

    const deadlineMs = new Date(data.deadline).getTime();
    const remainingDays = Math.round((deadlineMs - Date.now()) / ONE_DAY_MS);
    const remainingTimeDisplay = remainingDays > 0
      ? `${remainingDays} day${remainingDays === 1 ? '' : 's'} remaining`
      : remainingDays === 0
        ? 'Due today'
        : `Past due by ${Math.abs(remainingDays)} day${Math.abs(remainingDays) === 1 ? '' : 's'}`;

    const subject = `Reminder: ${data.formName} — ${data.propertyAddress}`;
    const ctx = {
      recipientName: data.recipientName,
      propertyAddress: data.propertyAddress,
      formName: data.formName,
      deadlineDisplay: new Date(data.deadline).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
      remainingTimeDisplay,
      uploadUrl,
    };

    const htmlBody = this.emailTemplateService.render('seller-side-document-reminder.html.hbs', ctx);
    const textBody = this.emailTemplateService.render('seller-side-document-reminder.text.hbs', ctx);

    try {
      const mailResult = await this.mailgunService.sendEmail(
        data.recipientEmail, subject, htmlBody, textBody, data.fromAddress,
        data.ccEmail ?? undefined, newLink.emailMessageId ?? undefined,
      );

      await this.messagesRepo.save(
        this.messagesRepo.create({
          transactionId:     data.transactionId,
          channel:           MessageChannel.EMAIL,
          direction:         MessageDirection.OUTBOUND,
          status:            MessageStatus.SENT,
          subject,
          bodyText:          textBody,
          bodyHtml:          htmlBody,
          providerName:      'mailgun',
          providerMessageId: mailResult?.messageId ?? null,
          providerThreadId:  newLink.emailMessageId,
          threadKey:         newLink.emailMessageId,
          stage:             data.transactionStage,
          sentAt:            new Date(),
          metadataJson: {
            to: data.recipientEmail,
            type: 'seller_side_document_reminder',
            formCode: data.formCode,
            transactionEventId: data.transactionEventId,
            uploadLinkId: newLink.id,
            ...(data.ccEmail ? { cc: data.ccEmail } : {}),
          },
        }),
      );

      await this.sellerSideRemindersRepo.update(reminder.id, {
        status: SellerSideDocumentReminderStatus.SENT,
        sentAt: new Date(),
      });

      await this.auditLogService.log({
        accountId: null,
        action: AuditAction.SELLER_SIDE_DOCUMENT_REMINDER_SENT,
        targetType: 'transaction',
        targetId: data.transactionId,
        targetDisplayName: data.transactionNumber,
        description: `Seller Side reminder sent to ${data.recipientEmail} for ${data.formName} (deadline approaching)`,
        details: {
          transactionId: data.transactionId,
          uploadLinkId: newLink.id,
          formCode: data.formCode,
          deadline: data.deadline,
        },
      });

      this.logger.log(`Seller-side reminder sent to ${data.recipientEmail} for ${data.formCode} — job ${jobId}`);
    } catch (err) {
      this.logger.error(`Failed to send seller-side reminder for job ${jobId}: ${(err as Error).message}`);
    }
  }

  private async handleVerificationOfPropertyReminder(data: VerificationOfPropertyReminderJobData, jobId: string): Promise<void> {
    this.logger.log(`Processing VP reminder job ${jobId}: ${data.deadlineLabel} for ${data.transactionNumber}`);

    // ── DB gate — source of truth check ────────────────────────────────────────
    const reminder = await this.vpRemindersRepo.findOne({ where: { bullJobId: jobId } });

    if (!reminder) {
      this.logger.warn(`No DB record found for VP reminder job ${jobId} — skipping (orphaned job)`);
      return;
    }

    if (reminder.status !== VerificationOfPropertyReminderStatus.SCHEDULED) {
      this.logger.log(`VP reminder ${jobId} is ${reminder.status} — skipping email send`);
      return;
    }

    // ── Fire-time re-check — skip if VP has since been uploaded and validated ──
    const vpDoc = await this.documentsRepo.findOne({
      where: { transactionId: data.transactionId, formCode: 'VP', analysisStatus: 'completed' },
    });
    if (vpDoc) {
      this.logger.log(`VP reminder ${jobId} skipped — Verification of Property already validated`);
      await this.vpRemindersRepo.update(reminder.id, {
        status: VerificationOfPropertyReminderStatus.SKIPPED,
        cancelledReason: 'Verification of Property already validated at fire time',
        cancelledAt: new Date(),
      });
      return;
    }

    // ── Regenerate the Buyer Agent upload link — raw tokens are never persisted,
    // so a fresh one must be minted now, at fire time, to embed a working URL. ──
    const existingLink = await this.uploadLinkRepo.findById(data.uploadLinkId);
    if (!existingLink) {
      this.logger.warn(`VP reminder ${jobId} skipped — upload link ${data.uploadLinkId} no longer exists`);
      await this.vpRemindersRepo.update(reminder.id, {
        status: VerificationOfPropertyReminderStatus.SKIPPED,
        cancelledReason: 'Upload link no longer exists at fire time',
        cancelledAt: new Date(),
      });
      return;
    }

    const { link: newLink, token } = await this.uploadLinkRepo.regenerate(existingLink);
    const webUrl = process.env.WEB_APP_URL ?? 'http://localhost:3001';
    const uploadUrl = `${webUrl}/upload-link/${token}`;

    const deadlineMs = new Date(data.deadline).getTime();
    const remainingDays = Math.round((deadlineMs - Date.now()) / ONE_DAY_MS);
    const remainingTimeDisplay = remainingDays > 0
      ? `${remainingDays} day${remainingDays === 1 ? '' : 's'} remaining`
      : remainingDays === 0
        ? 'Due today'
        : `Past due by ${Math.abs(remainingDays)} day${Math.abs(remainingDays) === 1 ? '' : 's'}`;

    const subject = `Reminder: Verification of Property — ${data.propertyAddress}`;
    const ctx = {
      recipientName: data.recipientName,
      propertyAddress: data.propertyAddress,
      deadlineLabel: data.deadlineLabel,
      deadlineDisplay: new Date(data.deadline).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
      remainingTimeDisplay,
      uploadUrl,
    };

    const htmlBody = this.emailTemplateService.render('verification-of-property-reminder.html.hbs', ctx);
    const textBody = this.emailTemplateService.render('verification-of-property-reminder.text.hbs', ctx);

    try {
      const mailResult = await this.mailgunService.sendEmail(
        data.recipientEmail, subject, htmlBody, textBody, data.fromAddress,
        data.ccEmail ?? undefined, newLink.emailMessageId ?? undefined,
      );

      await this.messagesRepo.save(
        this.messagesRepo.create({
          transactionId:     data.transactionId,
          channel:           MessageChannel.EMAIL,
          direction:         MessageDirection.OUTBOUND,
          status:            MessageStatus.SENT,
          subject,
          bodyText:          textBody,
          bodyHtml:          htmlBody,
          providerName:      'mailgun',
          providerMessageId: mailResult?.messageId ?? null,
          providerThreadId:  newLink.emailMessageId,
          threadKey:         newLink.emailMessageId,
          stage:             data.transactionStage,
          sentAt:            new Date(),
          metadataJson: {
            to: data.recipientEmail,
            type: 'verification_of_property_reminder',
            transactionEventId: data.transactionEventId,
            uploadLinkId: newLink.id,
            ...(data.ccEmail ? { cc: data.ccEmail } : {}),
          },
        }),
      );

      await this.vpRemindersRepo.update(reminder.id, {
        status: VerificationOfPropertyReminderStatus.SENT,
        sentAt: new Date(),
      });

      await this.auditLogService.log({
        accountId: null,
        action: AuditAction.BUYER_SIDE_VP_CHECKLIST_REMINDER_SENT,
        targetType: 'transaction',
        targetId: data.transactionId,
        targetDisplayName: data.transactionNumber,
        description: `Verification of Property reminder sent to ${data.recipientEmail} (${data.deadlineLabel} approaching)`,
        details: {
          transactionId: data.transactionId,
          uploadLinkId: newLink.id,
          deadline: data.deadline,
        },
      });

      this.logger.log(`VP reminder sent to ${data.recipientEmail} — job ${jobId}`);
    } catch (err) {
      this.logger.error(`Failed to send VP reminder for job ${jobId}: ${(err as Error).message}`);
    }
  }

  private async handleContingencyRemovalReminder(data: ContingencyRemovalReminderJobData, jobId: string): Promise<void> {
    this.logger.log(`Processing contingency removal reminder job ${jobId}: ${data.contingencyLabel} for ${data.transactionNumber}`);

    // ── DB gate — source of truth check ────────────────────────────────────────
    const reminder = await this.contingencyRemindersRepo.findOne({ where: { bullJobId: jobId } });

    if (!reminder) {
      this.logger.warn(`No DB record found for contingency reminder job ${jobId} — skipping (orphaned job)`);
      return;
    }

    if (reminder.status !== ContingencyRemovalReminderStatus.SCHEDULED) {
      this.logger.log(`Contingency reminder ${jobId} is ${reminder.status} — skipping email send`);
      return;
    }

    // ── Fire-time re-check — skip if the contingency has since been satisfied ──
    if (await this.isContingencyAlreadySatisfied(data.transactionId, data.contingencyType)) {
      this.logger.log(`Contingency reminder ${jobId} skipped — ${data.contingencyType} contingency already satisfied by a validated CR-B`);
      await this.contingencyRemindersRepo.update(reminder.id, {
        status: ContingencyRemovalReminderStatus.SKIPPED,
        cancelledReason: 'Contingency already satisfied by a validated CR-B at fire time',
        cancelledAt: new Date(),
      });
      return;
    }

    const deadlineMs = new Date(data.deadline).getTime();
    const remainingDays = Math.round((deadlineMs - Date.now()) / ONE_DAY_MS);
    const remainingTimeDisplay = remainingDays > 0
      ? `${remainingDays} day${remainingDays === 1 ? '' : 's'} remaining`
      : remainingDays === 0
        ? 'Due today'
        : `Past due by ${Math.abs(remainingDays)} day${Math.abs(remainingDays) === 1 ? '' : 's'}`;

    const subject = `Reminder: ${data.contingencyLabel} — ${data.propertyAddress}`;
    const ctx = {
      recipientName: data.recipientName,
      propertyAddress: data.propertyAddress,
      contingencyLabel: data.contingencyLabel,
      deadlineDisplay: new Date(data.deadline).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
      contractTimeframe: data.contractTimeframe,
      remainingTimeDisplay,
    };

    const htmlBody = this.emailTemplateService.render('contingency-removal-reminder.html.hbs', ctx);
    const textBody = this.emailTemplateService.render('contingency-removal-reminder.text.hbs', ctx);

    try {
      const mailResult = await this.mailgunService.sendEmail(
        data.recipientEmail, subject, htmlBody, textBody, data.fromAddress,
        data.ccEmail ?? undefined, data.emailMessageId ?? undefined,
      );

      await this.messagesRepo.save(
        this.messagesRepo.create({
          transactionId:     data.transactionId,
          channel:           MessageChannel.EMAIL,
          direction:         MessageDirection.OUTBOUND,
          status:            MessageStatus.SENT,
          subject,
          bodyText:          textBody,
          bodyHtml:          htmlBody,
          providerName:      'mailgun',
          providerMessageId: mailResult?.messageId ?? null,
          providerThreadId:  data.emailMessageId,
          threadKey:         data.emailMessageId,
          stage:             data.transactionStage,
          sentAt:            new Date(),
          metadataJson: {
            to: data.recipientEmail,
            type: 'contingency_removal_reminder',
            contingencyType: data.contingencyType,
            transactionEventId: data.transactionEventId,
            ...(data.ccEmail ? { cc: data.ccEmail } : {}),
          },
        }),
      );

      await this.contingencyRemindersRepo.update(reminder.id, {
        status: ContingencyRemovalReminderStatus.SENT,
        sentAt: new Date(),
      });

      this.logger.log(`Contingency removal reminder sent to ${data.recipientEmail} for ${data.contingencyType} — job ${jobId}`);
    } catch (err) {
      this.logger.error(`Failed to send contingency removal reminder for job ${jobId}: ${(err as Error).message}`);
    }
  }

  /** Checks whether any completed CR-B document already accounts for this specific contingency type. */
  private async isContingencyAlreadySatisfied(transactionId: string, contingencyType: ContingencyType): Promise<boolean> {
    const crbDocs = await this.documentsRepo.find({
      where: { transactionId, formCode: 'CR-B', analysisStatus: 'completed' },
    });

    return crbDocs.some((doc) => {
      const extraction = (doc.metadataJson as Record<string, unknown> | null)?.extraction as Record<string, unknown> | undefined;
      const removed = extraction?.['contingencies_removed'] as Record<string, unknown> | undefined;
      return !!removed && (removed[contingencyType] === true || removed['all_contingencies'] === true);
    });
  }

  private async handleOffsetReminder(data: OffsetReminderJobData, jobId: string): Promise<void> {
    this.logger.log(
      `Processing offset reminder job ${jobId}: ${data.eventLabel} for ${data.transactionNumber} ` +
      `(${data.offsetDisplay} before)`,
    );

    // ── DB gate — source of truth check ────────────────────────────────────────
    const reminder = await this.remindersRepo.findOne({ where: { bullJobId: jobId } });

    if (!reminder) {
      this.logger.warn(`No DB record found for job ${jobId} — skipping (orphaned job)`);
      return;
    }

    if (reminder.status !== ReminderStatus.SCHEDULED) {
      this.logger.log(`Reminder ${jobId} is ${reminder.status} — skipping email send`);
      return;
    }

    // ── Contingency document check — skip reminder if CR-B already uploaded ──
    if (data.eventType && CONTINGENCY_EVENT_TYPES.has(data.eventType)) {
      const crDoc = await this.documentsRepo.findOne({
        where: { transactionId: data.transactionId, formCode: 'CR-B' },
      });
      if (crDoc) {
        this.logger.log(
          `Reminder ${jobId} skipped — CR-B document already uploaded for ${data.eventType} contingency`,
        );
        await this.remindersRepo.update(reminder.id, {
          status: ReminderStatus.SKIPPED,
          cancelledReason: `CR-B document uploaded — ${data.eventType} contingency fulfilled`,
          cancelledAt: new Date(),
        });
        await this.remindersRepo.update(
          { transactionEventId: reminder.transactionEventId, status: ReminderStatus.SCHEDULED },
          { status: ReminderStatus.SKIPPED, cancelledReason: `CR-B document uploaded — ${data.eventType} contingency fulfilled`, cancelledAt: new Date() },
        );
        return;
      }
    }

    // ── Send emails ─────────────────────────────────────────────────────────────
    const isNow = data.offsetLabel === '0d' || data.offsetLabel === '0h' || data.offsetLabel === '0m';
    const subject = isNow
      ? `Today: ${data.eventLabel} — ${data.propertyAddress}`
      : `Reminder: ${data.eventLabel} in ${data.offsetDisplay} — ${data.propertyAddress}`;

    let sendCount = 0;
    for (const recipient of data.recipients) {
      try {
        const ctx = {
          name: recipient.name,
          role: recipient.role,
          eventLabel: data.eventLabel,
          eventDate: new Date(data.eventDate).toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          }),
          offsetLabel: data.offsetLabel,
          offsetDisplay: data.offsetDisplay,
          isToday: isNow,
          address: data.propertyAddress,
          txNumber: data.transactionNumber,
        };

        const htmlBody = this.emailTemplateService.render('deadline-reminder.html.hbs', ctx);
        const textBody = this.emailTemplateService.render('deadline-reminder.text.hbs', ctx);

        const mailResult = await this.mailgunService.sendEmail(
          recipient.email,
          subject,
          htmlBody,
          textBody,
          data.fromAddress,
        );

        await this.messagesRepo.save(
          this.messagesRepo.create({
            transactionId:     data.transactionId,
            channel:           MessageChannel.EMAIL,
            direction:         MessageDirection.OUTBOUND,
            status:            MessageStatus.SENT,
            subject,
            bodyText:          textBody,
            providerName:      'mailgun',
            providerMessageId: mailResult?.messageId ?? null,
            recipientPartyId:  recipient.partyId,
            stage:             data.transactionStage,
            sentAt:            new Date(),
            metadataJson:      { to: recipient.email, role: recipient.role, eventType: data.eventType, offsetLabel: data.offsetLabel },
          }),
        );

        sendCount++;
      } catch (err) {
        this.logger.error(
          `Failed to send reminder to ${recipient.email} for job ${jobId}: ${(err as Error).message}`,
        );
      }
    }

    await this.remindersRepo.update(reminder.id, {
      status: ReminderStatus.SENT,
      sentAt: new Date(),
    });

    this.logger.log(
      `Offset reminder job ${jobId} complete — emailed ${sendCount}/${data.recipients.length} recipient(s)`,
    );
  }

  private async handleCustomReminder(data: CustomReminderJobData, jobId: string): Promise<void> {
    this.logger.log(
      `Processing custom reminder job ${jobId}: "${data.customSubject}" for ${data.transactionNumber}`,
    );

    // ── DB gate — source of truth check ────────────────────────────────────────
    const reminder = await this.customRemindersRepo.findOne({ where: { bullJobId: jobId } });

    if (!reminder) {
      this.logger.warn(`No DB record found for custom job ${jobId} — skipping (orphaned job)`);
      return;
    }

    if (reminder.status !== CustomReminderStatus.SCHEDULED) {
      this.logger.log(`Custom reminder ${jobId} is ${reminder.status} — skipping email send`);
      return;
    }

    // ── Send emails ─────────────────────────────────────────────────────────────
    const subject = `Reminder: ${data.customSubject} — ${data.propertyAddress}`;
    const messageBody = data.customMessage
      ? `\n\n${data.customMessage}`
      : '';

    let sendCount = 0;
    for (const recipient of data.recipients) {
      try {
        const ctx = {
          name: recipient.name,
          role: recipient.role,
          subject: data.customSubject,
          message: data.customMessage,
          address: data.propertyAddress,
          txNumber: data.transactionNumber,
        };

        const htmlBody = this.emailTemplateService.render('custom-reminder.html.hbs', ctx);
        const textBody = [
          `Hi ${recipient.name},`,
          '',
          data.customSubject,
          ...(data.customMessage ? ['', data.customMessage] : []),
          '',
          `Transaction: ${data.transactionNumber}`,
          `Property: ${data.propertyAddress}`,
        ].join('\n');

        const mailResult = await this.mailgunService.sendEmail(
          recipient.email,
          subject,
          htmlBody,
          textBody,
          data.fromAddress,
        );

        await this.messagesRepo.save(
          this.messagesRepo.create({
            transactionId:     data.transactionId,
            channel:           MessageChannel.EMAIL,
            direction:         MessageDirection.OUTBOUND,
            status:            MessageStatus.SENT,
            subject,
            bodyText:          textBody,
            providerName:      'mailgun',
            providerMessageId: mailResult?.messageId ?? null,
            recipientPartyId:  recipient.partyId,
            stage:             '',
            sentAt:            new Date(),
            metadataJson:      { to: recipient.email, role: recipient.role, type: 'custom-reminder', customReminderId: data.customReminderId },
          }),
        );

        sendCount++;
      } catch (err) {
        this.logger.error(
          `Failed to send custom reminder to ${recipient.email} for job ${jobId}: ${(err as Error).message}`,
        );
      }
    }

    await this.customRemindersRepo.update(reminder.id, {
      status: CustomReminderStatus.SENT,
      sentAt: new Date(),
    });

    this.logger.log(
      `Custom reminder job ${jobId} complete — emailed ${sendCount}/${data.recipients.length} recipient(s)`,
    );
  }
}
