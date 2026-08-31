import { Injectable, Logger, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Like, Not } from 'typeorm';
import { TransactionEntity, TransactionStatus } from './entities/transaction.entity';
import { TransactionStage } from './entities/transaction-stage-instance.entity';
import { TransactionStageInstancesService } from './transaction-stage-instances.service';
import { TransactionPartyEntity, PartyRole } from '../transaction-parties/entities/transaction-party.entity';
import { TransactionEventEntity, EventType } from '../transaction-events/entities/transaction-event.entity';
import { TransactionMessageEntity, MessageChannel, MessageDirection, MessageStatus } from '../transaction-messages/entities/transaction-message.entity';
import { TransactionDocumentEntity, DocumentStatus } from '../transaction-documents/entities/transaction-document.entity';
import { TransactionFormTemplatesService } from '../transaction-form-templates/transaction-form-templates.service';
import { getTransactionCoordinatorContact } from './transaction-coordinator-contact.util';
import { MailgunService } from '../auth/mailgun.service';
import { EmailTemplateService } from '../auth/email-template.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditAction } from '../audit-log/audit-log.entity';

const INACTIVE_DOCUMENT_STATUSES = [DocumentStatus.SUPERSEDED, DocumentStatus.REJECTED, DocumentStatus.EXPIRED, DocumentStatus.REQUESTED];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface TimelineRow {
  label: string;
  deadline: string;
  timeframe: string;
  status: string;
}

/** The full set of milestones the timeline table must always list, in display order. */
const TIMELINE_MILESTONES: Array<{ type: EventType; label: string; timeframe: string }> = [
  { type: EventType.OFFER_ACCEPTED,  label: 'Acceptance Date',                 timeframe: '—' },
  { type: EventType.EMD_DUE,         label: 'EMD to Be in Escrow',             timeframe: 'Business days per contract' },
  { type: EventType.DISCLOSURES_DUE, label: 'Disclosures to Be Delivered',     timeframe: 'Per contract' },
  { type: EventType.INSPECTION,      label: 'Inspection Contingency',         timeframe: 'Calendar days per contract' },
  { type: EventType.APPRAISAL,       label: 'Appraisal/Insurance Contingency', timeframe: 'Calendar days per contract' },
  { type: EventType.LOAN_COMMITMENT, label: 'Loan Contingency',                timeframe: 'Calendar days per contract' },
  { type: EventType.CLOSING,         label: 'Close of Escrow (COE)',           timeframe: 'Per contract' },
  { type: EventType.POSSESSION,      label: 'Possession',                      timeframe: 'Per contract' },
];

interface RecipientInfo {
  partyId: string;
  email: string;
  name: string;
  role: string;
}

interface OmittedRecipient {
  role: string;
  reason: string;
}

/** Exported so other senders (e.g. the signed-document notification, which replies onto this thread) can find it by subject without duplicating the literal. */
export const WELCOME_EMAIL_SUBJECT_PREFIX = 'Welcome to Escrow & Transaction Timeline';
/**
 * Deliberately distinct from WELCOME_EMAIL_SUBJECT_PREFIX (not just a
 * different suffix) so the two emails' own `Like('${prefix}%')` idempotency
 * checks can never match each other's message rows — sendWelcomeEmails and
 * sendBuyerWelcomeEmail are independent sends with independent "already
 * sent" tracking. Also exported for the same reason as above.
 */
export const BUYER_WELCOME_EMAIL_SUBJECT_PREFIX = 'Welcome to Your Transaction & Timeline';
const SUBJECT_PREFIX = WELCOME_EMAIL_SUBJECT_PREFIX;
const BUYER_SUBJECT_PREFIX = BUYER_WELCOME_EMAIL_SUBJECT_PREFIX;

export function isValidEmail(email: string | null | undefined): email is string {
  return !!email && EMAIL_PATTERN.test(email.trim());
}

/** Keeps the first occurrence of each email (case-insensitive) — the ordering callers pass in determines precedence. */
function dedupeByEmail(recipients: RecipientInfo[]): RecipientInfo[] {
  const seen = new Set<string>();
  const out: RecipientInfo[] = [];
  for (const r of recipients) {
    const key = r.email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

@Injectable()
export class TransactionWelcomeEmailService {
  private readonly logger = new Logger(TransactionWelcomeEmailService.name);

  constructor(
    @InjectRepository(TransactionEntity)
    private readonly transactionsRepo: Repository<TransactionEntity>,
    @InjectRepository(TransactionPartyEntity)
    private readonly partiesRepo: Repository<TransactionPartyEntity>,
    @InjectRepository(TransactionEventEntity)
    private readonly eventsRepo: Repository<TransactionEventEntity>,
    @InjectRepository(TransactionMessageEntity)
    private readonly messagesRepo: Repository<TransactionMessageEntity>,
    @InjectRepository(TransactionDocumentEntity)
    private readonly documentsRepo: Repository<TransactionDocumentEntity>,
    private readonly mailgunService: MailgunService,
    private readonly emailTemplateService: EmailTemplateService,
    private readonly stageInstancesService: TransactionStageInstancesService,
    private readonly formTemplatesService: TransactionFormTemplatesService,
    private readonly auditLogService: AuditLogService,
  ) {}

  /**
   * Sends one shared "Welcome to Escrow & Transaction Timeline" email —
   * welcome copy plus the full deadline table — via real To/Cc headers so
   * every recipient sees who else was addressed:
   *
   *   To:  Buyer Agent, Seller Agent
   *   Cc:  Seller Transaction Coordinator (optional)
   *
   * Buyers and Sellers are never recipients of this email — only the two
   * agents (always required) and, optionally, the Seller Transaction
   * Coordinator. No code path here may re-introduce Buyer/Seller party rows
   * into the To/Cc candidate lists.
   *
   * Buyer Agent and Seller Agent are both required — if either is missing a
   * valid email, the send is stopped entirely with a validation error.
   * Seller Transaction Coordinator is the only optional recipient: if absent
   * or invalid, it's simply omitted (and logged) and the rest of the send
   * proceeds.
   *
   * Waits until required documents are uploaded so the deadlines shown are
   * accurate (deferring the whole email, not just the table, until then),
   * and never re-sends once a copy has already gone out for this
   * transaction, so re-checks — e.g. after a later document upload — never
   * double-send.
   */
  async sendWelcomeEmails(transactionId: string): Promise<string[]> {
    const tx = await this.transactionsRepo.findOne({
      where: { id: transactionId },
      relations: ['createdByAccount', 'createdByAccount.user', 'buyerAgentAccount', 'buyerAgentAccount.user'],
    });
    if (!tx) throw new NotFoundException(`Transaction ${transactionId} not found`);

    // Draft transactions already have party rows with real emails (extracted from the
    // uploaded contract) — never send to them before the TC/agent has actually submitted.
    // Document-upload re-checks (see document-extraction.controller.ts) can otherwise
    // fire this during in-progress draft review, well before submission is confirmed.
    if (tx.status === TransactionStatus.DRAFT) return [];

    const documentsComplete = await this.documentsComplete(tx);
    if (!documentsComplete) {
      this.logger.log(`Transaction ${tx.transactionNumber}: required documents not yet uploaded — welcome email deferred`);
      return [];
    }

    const alreadySent = await this.messagesRepo.findOne({
      where: { transactionId, subject: Like(`${SUBJECT_PREFIX}%`), status: MessageStatus.SENT },
    });
    if (alreadySent) return [];

    const parties = await this.partiesRepo.find({ where: { transactionId } });
    const buyerAgent = parties.find((p) => p.partyRole === PartyRole.BUYER_AGENT) ?? null;
    const sellerAgent = parties.find((p) => p.partyRole === PartyRole.SELLER_AGENT) ?? null;
    const sellerTc = parties.find((p) => p.partyRole === PartyRole.SELLER_TRANSACTION_COORDINATOR) ?? null;

    // ── Required-recipient validation — Buyer Agent and Seller Agent only.
    // Buyers/Sellers are never recipients of this email, so their emails
    // (or absence thereof) never factor into this check. ──
    const missing: string[] = [];
    if (!buyerAgent || !isValidEmail(buyerAgent.email)) missing.push('Buyer Agent');
    if (!sellerAgent || !isValidEmail(sellerAgent.email)) missing.push('Seller Agent');

    if (missing.length > 0) {
      throw new UnprocessableEntityException({
        code: 'WELCOME_EMAIL_MISSING_REQUIRED_EMAIL',
        message: `Cannot send the Welcome to Escrow email — missing a valid email address for: ${missing.join(', ')}.`,
      });
    }

    // ── Build To (required — both agents) ──
    const toCandidates: RecipientInfo[] = [
      { partyId: buyerAgent!.id, email: buyerAgent!.email!, name: buyerAgent!.displayName, role: 'Buyer Agent' },
      { partyId: sellerAgent!.id, email: sellerAgent!.email!, name: sellerAgent!.displayName, role: 'Seller Agent' },
    ];
    const to = dedupeByEmail(toCandidates);

    // ── Build Cc (optional Seller TC only) ──
    const ccCandidates: RecipientInfo[] = [];

    const omitted: OmittedRecipient[] = [];
    if (sellerTc) {
      if (isValidEmail(sellerTc.email)) {
        ccCandidates.push({ partyId: sellerTc.id, email: sellerTc.email!, name: sellerTc.displayName, role: 'Seller Transaction Coordinator' });
      } else {
        omitted.push({ role: 'Seller Transaction Coordinator', reason: 'no valid email on file' });
        this.logger.log(`Transaction ${tx.transactionNumber}: Seller Transaction Coordinator omitted from welcome email — no valid email on file`);
      }
    }

    const toEmailKeys = new Set(to.map((r) => r.email.toLowerCase()));
    // Cc is deduped within itself, then anything already in To is dropped —
    // no recipient appears in both fields.
    const cc = dedupeByEmail(ccCandidates).filter((r) => !toEmailKeys.has(r.email.toLowerCase()));

    const events = await this.eventsRepo.find({ where: { transactionId }, order: { eventDate: 'ASC' } });
    const rows = this.buildTimelineRows(events);

    // TC identity must come from the myTC account that created the transaction
    // (the logged-in TC who submitted it) — never a manually entered value
    // or an optional, separately-assignable field like assignedCoordinatorAccount.
    // The email shown to parties is the transaction-specific Mailgun address,
    // never the TC's myTC login email (see getTransactionCoordinatorContact).
    const contact = getTransactionCoordinatorContact(tx, tx.createdByAccount, this.logger);
    const buyerAgentName = tx.buyerAgentAccount?.displayName ?? buyerAgent?.displayName ?? null;

    const propertyAddress = [tx.propertyAddressLine1, tx.propertyCity, tx.propertyState]
      .filter(Boolean).join(', ') || tx.propertyAddressLine1 || 'the property';

    const fromAddress = tx.outboundEmailAddress
      ? `TC Platform <${tx.outboundEmailAddress}>`
      : `TC Platform <noreply@txn.mytcapp.net>`;

    const subject = `${SUBJECT_PREFIX} – ${propertyAddress}`;
    // Never falls back to placeholder text like "Not specified" — every
    // optional field here is either a real value or null, and the templates
    // omit the corresponding line entirely when a field is null.
    const ctx = {
      propertyAddress,
      txNumber: tx.transactionNumber,
      transactionId: tx.id,
      tcName: contact.name,
      buyerAgentName: buyerAgentName || 'your agent',
      tcPhone: contact.phone,
      transactionEmail: contact.email,
      rows,
    };

    const html = this.emailTemplateService.render('transaction-welcome.html.hbs', ctx);
    const text = this.emailTemplateService.render('transaction-welcome.text.hbs', ctx);

    const toEmails = to.map((r) => r.email);
    const ccEmails = cc.map((r) => r.email);

    try {
      const mailResult = await this.mailgunService.sendEmail(toEmails, subject, html, text, fromAddress, ccEmails.length ? ccEmails : undefined);

      await this.messagesRepo.save(
        this.messagesRepo.create({
          transactionId: tx.id,
          channel: MessageChannel.EMAIL,
          direction: MessageDirection.OUTBOUND,
          status: MessageStatus.SENT,
          subject,
          bodyText: text,
          bodyHtml: html,
          providerName: 'mailgun',
          providerMessageId: mailResult?.messageId ?? null,
          stage: TransactionStage.CONTRACT,
          sentAt: new Date(),
          metadataJson: {
            to: toEmails,
            cc: ccEmails,
            toDetail: to,
            ccDetail: cc,
            omitted,
          },
        }),
      );

      await this.stageInstancesService.activateStage(transactionId, TransactionStage.DISCLOSURES);
      this.logger.log(`Transaction ${tx.transactionNumber} DISCLOSURES stage activated`);
      this.logger.log(`Welcome email sent for transaction ${tx.transactionNumber} — to: ${toEmails.join(', ')}; cc: ${ccEmails.join(', ') || 'none'}`);

      await this.auditLogService.log({
        action: AuditAction.WELCOME_TIMELINE_EMAIL_SENT,
        targetType: 'transaction',
        targetId: transactionId,
        description: `Welcome to Escrow & Transaction Timeline email sent for transaction ${tx.transactionNumber}`,
        details: { to: toEmails, cc: ccEmails, status: 'sent', providerMessageId: mailResult?.messageId ?? null },
      });

      return [...toEmails, ...ccEmails];
    } catch (err) {
      const message = (err as Error).message;
      this.logger.error(`Failed to send welcome email for transaction ${tx.transactionNumber}: ${message}`);

      await this.messagesRepo.save(
        this.messagesRepo.create({
          transactionId: tx.id,
          channel: MessageChannel.EMAIL,
          direction: MessageDirection.OUTBOUND,
          status: MessageStatus.FAILED,
          subject,
          bodyText: text,
          bodyHtml: html,
          stage: TransactionStage.CONTRACT,
          metadataJson: { to: toEmails, cc: ccEmails, omitted, error: message },
        }),
      );

      await this.auditLogService.log({
        action: AuditAction.WELCOME_TIMELINE_EMAIL_SENT,
        targetType: 'transaction',
        targetId: transactionId,
        description: `Welcome to Escrow & Transaction Timeline email failed to send for transaction ${tx.transactionNumber}`,
        details: { to: toEmails, cc: ccEmails, status: 'failed', providerMessageId: null, error: message },
      });

      return [];
    }
  }

  /**
   * The Buyer-facing counterpart to sendWelcomeEmails above — same Welcome +
   * Timeline copy, same template, same timeline-building/filtering rules,
   * but addressed directly to the Buyer(s) instead of the agents:
   *
   *   To:  every Buyer party row with a valid email (all of them, when there
   *        is more than one)
   *   Cc:  Buyer Agent (only when they have a valid email — omitted, not
   *        fatal, otherwise)
   *
   * A genuinely separate email from sendWelcomeEmails (agent-facing) and from
   * the Buyer Agent's own secure upload-link email — Sellers, the Seller
   * Agent, and the Seller Transaction Coordinator are never recipients here,
   * and this never re-uses sendWelcomeEmails' own idempotency check (see
   * BUYER_SUBJECT_PREFIX).
   *
   * Skipped (logged, not thrown) when there is no Buyer with a valid email —
   * there is nobody to send to, and unlike Buyer Agent/Seller Agent on the
   * agent-facing email, a missing Buyer email is not treated as a hard
   * validation failure here, since Buyer emails are ordinary submission data
   * rather than fields the UI always forces the submitter to supply.
   */
  async sendBuyerWelcomeEmail(transactionId: string): Promise<string[]> {
    const tx = await this.transactionsRepo.findOne({
      where: { id: transactionId },
      relations: ['createdByAccount', 'createdByAccount.user', 'buyerAgentAccount'],
    });
    if (!tx) throw new NotFoundException(`Transaction ${transactionId} not found`);

    const alreadySent = await this.messagesRepo.findOne({
      where: { transactionId, subject: Like(`${BUYER_SUBJECT_PREFIX}%`), status: MessageStatus.SENT },
    });
    if (alreadySent) return [];

    const parties = await this.partiesRepo.find({ where: { transactionId } });
    const buyers = parties.filter((p) => p.partyRole === PartyRole.BUYER && isValidEmail(p.email));
    const buyerAgent = parties.find((p) => p.partyRole === PartyRole.BUYER_AGENT) ?? null;

    if (buyers.length === 0) {
      this.logger.log(`Transaction ${tx.transactionNumber}: no Buyer with a valid email — Buyer welcome email skipped`);
      return [];
    }

    // ── Build To (every Buyer with a valid email) ──
    const toCandidates: RecipientInfo[] = buyers.map((b) => ({ partyId: b.id, email: b.email!, name: b.displayName, role: 'Buyer' }));
    const to = dedupeByEmail(toCandidates);

    // ── Build Cc (optional Buyer Agent only) ──
    const ccCandidates: RecipientInfo[] = [];
    const omitted: OmittedRecipient[] = [];
    if (buyerAgent && isValidEmail(buyerAgent.email)) {
      ccCandidates.push({ partyId: buyerAgent.id, email: buyerAgent.email!, name: buyerAgent.displayName, role: 'Buyer Agent' });
    } else {
      omitted.push({ role: 'Buyer Agent', reason: 'no valid email on file' });
      this.logger.log(`Transaction ${tx.transactionNumber}: Buyer Agent omitted from Buyer welcome email cc — no valid email on file`);
    }

    const toEmailKeys = new Set(to.map((r) => r.email.toLowerCase()));
    const cc = dedupeByEmail(ccCandidates).filter((r) => !toEmailKeys.has(r.email.toLowerCase()));

    const events = await this.eventsRepo.find({ where: { transactionId }, order: { eventDate: 'ASC' } });
    const rows = this.buildTimelineRows(events);

    // Same TC-identity sourcing as sendWelcomeEmails — the myTC account that
    // created the transaction, never a manually entered or optional value. The
    // email shown to parties is the transaction Mailgun address, never the TC's
    // myTC login email.
    const contact = getTransactionCoordinatorContact(tx, tx.createdByAccount, this.logger);
    const buyerAgentName = tx.buyerAgentAccount?.displayName ?? buyerAgent?.displayName ?? null;

    const propertyAddress = [tx.propertyAddressLine1, tx.propertyCity, tx.propertyState]
      .filter(Boolean).join(', ') || tx.propertyAddressLine1 || 'the property';

    // Transaction-specific Mailgun address, never the TC's personal account
    // email — same convention as every other outbound send in this app.
    const fromAddress = tx.outboundEmailAddress
      ? `TC Platform <${tx.outboundEmailAddress}>`
      : `TC Platform <noreply@txn.mytcapp.net>`;

    const subject = `${BUYER_SUBJECT_PREFIX} – ${propertyAddress}`;
    const ctx = {
      propertyAddress,
      txNumber: tx.transactionNumber,
      transactionId: tx.id,
      tcName: contact.name,
      buyerAgentName: buyerAgentName || 'your agent',
      tcPhone: contact.phone,
      transactionEmail: contact.email,
      rows,
    };

    const html = this.emailTemplateService.render('transaction-welcome.html.hbs', ctx);
    const text = this.emailTemplateService.render('transaction-welcome.text.hbs', ctx);

    const toEmails = to.map((r) => r.email);
    const ccEmails = cc.map((r) => r.email);

    try {
      const mailResult = await this.mailgunService.sendEmail(toEmails, subject, html, text, fromAddress, ccEmails.length ? ccEmails : undefined);

      await this.messagesRepo.save(
        this.messagesRepo.create({
          transactionId: tx.id,
          channel: MessageChannel.EMAIL,
          direction: MessageDirection.OUTBOUND,
          status: MessageStatus.SENT,
          subject,
          bodyText: text,
          bodyHtml: html,
          providerName: 'mailgun',
          providerMessageId: mailResult?.messageId ?? null,
          stage: TransactionStage.CONTRACT,
          sentAt: new Date(),
          metadataJson: {
            type: 'buyer_welcome_timeline',
            to: toEmails,
            cc: ccEmails,
            toDetail: to,
            ccDetail: cc,
            omitted,
          },
        }),
      );

      this.logger.log(`Buyer welcome email sent for transaction ${tx.transactionNumber} — to: ${toEmails.join(', ')}; cc: ${ccEmails.join(', ') || 'none'}`);

      await this.auditLogService.log({
        action: AuditAction.BUYER_WELCOME_TIMELINE_EMAIL_SENT,
        targetType: 'transaction',
        targetId: transactionId,
        description: `Buyer Welcome & Transaction Timeline email sent for transaction ${tx.transactionNumber}`,
        details: { to: toEmails, cc: ccEmails, status: 'sent', providerMessageId: mailResult?.messageId ?? null },
      });

      return [...toEmails, ...ccEmails];
    } catch (err) {
      const message = (err as Error).message;
      this.logger.error(`Failed to send Buyer welcome email for transaction ${tx.transactionNumber}: ${message}`);

      await this.messagesRepo.save(
        this.messagesRepo.create({
          transactionId: tx.id,
          channel: MessageChannel.EMAIL,
          direction: MessageDirection.OUTBOUND,
          status: MessageStatus.FAILED,
          subject,
          bodyText: text,
          bodyHtml: html,
          stage: TransactionStage.CONTRACT,
          metadataJson: { type: 'buyer_welcome_timeline', to: toEmails, cc: ccEmails, omitted, error: message },
        }),
      );

      await this.auditLogService.log({
        action: AuditAction.BUYER_WELCOME_TIMELINE_EMAIL_SENT,
        targetType: 'transaction',
        targetId: transactionId,
        description: `Buyer Welcome & Transaction Timeline email failed to send for transaction ${tx.transactionNumber}`,
        details: { to: toEmails, cc: ccEmails, status: 'failed', providerMessageId: null, error: message },
      });

      return [];
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  /**
   * A transaction with no resolvable form template has nothing to gate on —
   * treated as complete so the welcome/timeline email isn't blocked indefinitely.
   */
  private async documentsComplete(tx: TransactionEntity): Promise<boolean> {
    const template = await this.formTemplatesService.resolveForTransaction({
      organizationId: tx.organizationId,
      stateCode: tx.propertyState,
      transactionType: tx.transactionType,
      side: tx.side,
    });
    if (!template) return true;

    const requiredFormCodes = (template.items ?? [])
      .filter((item) => item.isRequired)
      .map((item) => item.formCode);
    if (requiredFormCodes.length === 0) return true;

    const uploadedDocs = await this.documentsRepo.find({
      where: { transactionId: tx.id, status: Not(In(INACTIVE_DOCUMENT_STATUSES)) },
    });
    const uploadedFormCodes = new Set(uploadedDocs.map((d) => d.formCode).filter(Boolean));

    return requiredFormCodes.every((code) => uploadedFormCodes.has(code));
  }

  /**
   * Includes only milestones whose deadline has been confidently resolved
   * from the final negotiated contract terms — i.e. a real `transaction_events`
   * row with a real date already exists (seeded by `EventSeederService` from
   * `FinalTermsService`/`resolveFinalNegotiatedTerms`, which never fabricates
   * a deadline). A milestone is skipped entirely, never shown with
   * placeholder text, when either:
   *   - the contract specifies no such contingency (waived/removed — the
   *     resolver reports no deadline and the seeder never creates an event), or
   *   - the deadline genuinely can't yet be determined (e.g. acceptance date
   *     not yet known).
   * This affects only what the Welcome Email displays — the underlying
   * event/contingency data in the application is untouched either way.
   */
  private buildTimelineRows(events: TransactionEventEntity[]): TimelineRow[] {
    const eventMap = new Map<EventType, TransactionEventEntity>();
    for (const e of events) eventMap.set(e.eventType as EventType, e);

    const rows: TimelineRow[] = [];
    for (const { type, label, timeframe } of TIMELINE_MILESTONES) {
      const event = eventMap.get(type);
      if (!event?.eventDate) continue;
      rows.push({
        label,
        deadline: this.formatDate(event.eventDate),
        timeframe,
        status: this.remainingDaysStatus(event.eventDate),
      });
    }
    return rows;
  }

  /** "N days remaining" / "Due today" / "Past due by N days", relative to today. */
  private remainingDaysStatus(eventDate: Date): string {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(eventDate);
    target.setHours(0, 0, 0, 0);

    const diffDays = Math.round((target.getTime() - today.getTime()) / 86400000);
    if (diffDays > 0) return `${diffDays} day${diffDays === 1 ? '' : 's'} remaining`;
    if (diffDays === 0) return 'Due today';
    const overdue = Math.abs(diffDays);
    return `Past due by ${overdue} day${overdue === 1 ? '' : 's'}`;
  }

  private formatDate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${m}-${day}-${y}`;
  }
}
