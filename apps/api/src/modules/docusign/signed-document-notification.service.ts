import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository } from 'typeorm';
import { TransactionEntity } from '../transactions/entities/transaction.entity';
import { TransactionMessageEntity, MessageChannel, MessageDirection, MessageStatus } from '../transaction-messages/entities/transaction-message.entity';
import { WELCOME_EMAIL_SUBJECT_PREFIX, BUYER_WELCOME_EMAIL_SUBJECT_PREFIX } from '../transactions/transaction-welcome-email.service';
import { MailgunService } from '../auth/mailgun.service';
import { EmailTemplateService } from '../auth/email-template.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditAction } from '../audit-log/audit-log.entity';

export interface NotifyDocumentSignedOptions {
  transactionId: string;
  /** The signed document's own id when available (falls back to the original document's id in edge cases where the new row's generated id isn't known yet). */
  documentId: string;
  documentName: string;
  formCode: string | null;
  docusignEnvelopeId: string;
  completedAt: Date;
}

@Injectable()
export class SignedDocumentNotificationService {
  private readonly logger = new Logger(SignedDocumentNotificationService.name);

  constructor(
    @InjectRepository(TransactionEntity)
    private readonly transactionsRepo: Repository<TransactionEntity>,
    @InjectRepository(TransactionMessageEntity)
    private readonly messagesRepo: Repository<TransactionMessageEntity>,
    private readonly mailgunService: MailgunService,
    private readonly emailTemplateService: EmailTemplateService,
    private readonly auditLogService: AuditLogService,
  ) {}

  /**
   * Replies onto whichever Welcome + Timeline email thread(s) already exist
   * for this transaction (the agent-facing thread, the buyer-facing thread,
   * or both) announcing that a document has been fully signed via DocuSign.
   *
   * Recipients always come from the thread's own recorded To/Cc — never from
   * the DocuSign envelope's signers — so this can never introduce a signer
   * into a thread they weren't already part of. If neither welcome thread
   * exists yet (e.g. the document was signed before Submit & Send Email ever
   * ran), nothing is sent: a reply needs a thread and a recipient list to
   * attach itself to, and fabricating one isn't this method's job.
   */
  async notifyDocumentSigned(opts: NotifyDocumentSignedOptions): Promise<void> {
    const [agentThread, buyerThread] = await Promise.all([
      this.messagesRepo.findOne({
        where: { transactionId: opts.transactionId, status: MessageStatus.SENT, subject: Like(`${WELCOME_EMAIL_SUBJECT_PREFIX}%`) },
        order: { createdAt: 'DESC' },
      }),
      this.messagesRepo.findOne({
        where: { transactionId: opts.transactionId, status: MessageStatus.SENT, subject: Like(`${BUYER_WELCOME_EMAIL_SUBJECT_PREFIX}%`) },
        order: { createdAt: 'DESC' },
      }),
    ]);

    const threads = [agentThread, buyerThread].filter((t): t is TransactionMessageEntity => !!t);
    if (threads.length === 0) {
      this.logger.log(`Transaction ${opts.transactionId}: no Welcome email thread found — signed-document notification skipped for document ${opts.documentId}`);
      return;
    }

    const tx = await this.transactionsRepo.findOne({ where: { id: opts.transactionId } });
    if (!tx) {
      this.logger.warn(`Transaction ${opts.transactionId} not found — signed-document notification skipped`);
      return;
    }

    const fromAddress = tx.outboundEmailAddress
      ? `TC Platform <${tx.outboundEmailAddress}>`
      : `TC Platform <noreply@txn.mytcapp.net>`;

    for (const thread of threads) {
      await this.sendReplyForThread(tx, thread, opts, fromAddress);
    }
  }

  private async sendReplyForThread(
    tx: TransactionEntity,
    thread: TransactionMessageEntity,
    opts: NotifyDocumentSignedOptions,
    fromAddress: string,
  ): Promise<void> {
    const { to, cc } = this.recipientsFromThread(thread);
    if (to.length === 0) {
      this.logger.warn(`Transaction ${opts.transactionId}: welcome thread ${thread.id} has no recorded To recipients — signed-document reply skipped for that thread`);
      return;
    }

    const subject = `Re: ${thread.subject}`;
    const propertyAddress = [tx.propertyAddressLine1, tx.propertyCity, tx.propertyState].filter(Boolean).join(', ') || tx.propertyAddressLine1;
    // Never falls back to placeholder text — formCode is either a real value or null, and the templates omit that line entirely when null.
    const ctx = {
      propertyAddress,
      transactionId: tx.id,
      documentName: opts.documentName,
      formCode: opts.formCode,
      completedAt: this.formatDate(opts.completedAt),
    };

    const html = this.emailTemplateService.render('transaction-document-signed.html.hbs', ctx);
    const text = this.emailTemplateService.render('transaction-document-signed.text.hbs', ctx);

    try {
      const mailResult = await this.mailgunService.sendEmail(
        to, subject, html, text, fromAddress,
        cc.length ? cc : undefined,
        thread.providerMessageId ?? undefined,
      );

      await this.messagesRepo.save(
        this.messagesRepo.create({
          transactionId: opts.transactionId,
          channel: MessageChannel.EMAIL,
          direction: MessageDirection.OUTBOUND,
          status: MessageStatus.SENT,
          subject,
          bodyText: text,
          bodyHtml: html,
          providerName: 'mailgun',
          providerMessageId: mailResult?.messageId ?? null,
          stage: thread.stage,
          sentAt: new Date(),
          metadataJson: {
            type: 'document_signed',
            inReplyTo: thread.providerMessageId,
            formCode: opts.formCode,
            documentId: opts.documentId,
            docusignEnvelopeId: opts.docusignEnvelopeId,
            completedAt: opts.completedAt.toISOString(),
            to,
            cc,
          },
        }),
      );

      this.logger.log(`Signed-document notification sent for transaction ${tx.transactionNumber} (thread ${thread.id}) — to: ${to.join(', ')}; cc: ${cc.join(', ') || 'none'}`);

      await this.auditLogService.log({
        action: AuditAction.DOCUMENT_SIGNED_EMAIL_SENT,
        targetType: 'transaction',
        targetId: opts.transactionId,
        description: `Signed-document notification sent for "${opts.documentName}" (transaction ${tx.transactionNumber})`,
        details: {
          to, cc, status: 'sent', providerMessageId: mailResult?.messageId ?? null,
          documentId: opts.documentId, docusignEnvelopeId: opts.docusignEnvelopeId,
        },
      });
    } catch (err) {
      const message = (err as Error).message;
      this.logger.error(`Failed to send signed-document notification for transaction ${tx.transactionNumber} (thread ${thread.id}): ${message}`);

      await this.messagesRepo.save(
        this.messagesRepo.create({
          transactionId: opts.transactionId,
          channel: MessageChannel.EMAIL,
          direction: MessageDirection.OUTBOUND,
          status: MessageStatus.FAILED,
          subject,
          bodyText: text,
          bodyHtml: html,
          stage: thread.stage,
          metadataJson: {
            type: 'document_signed',
            inReplyTo: thread.providerMessageId,
            formCode: opts.formCode,
            documentId: opts.documentId,
            docusignEnvelopeId: opts.docusignEnvelopeId,
            to, cc, error: message,
          },
        }),
      );

      await this.auditLogService.log({
        action: AuditAction.DOCUMENT_SIGNED_EMAIL_SENT,
        targetType: 'transaction',
        targetId: opts.transactionId,
        description: `Signed-document notification failed to send for "${opts.documentName}" (transaction ${tx.transactionNumber})`,
        details: {
          to, cc, status: 'failed', error: message,
          documentId: opts.documentId, docusignEnvelopeId: opts.docusignEnvelopeId,
        },
      });
    }
  }

  /**
   * Prefers the flat to/cc email arrays a thread was saved with; falls back
   * to the name+email toDetail/ccDetail shape some older writers use — same
   * dual-format convention as TransactionWorkspaceService.extractContactList.
   */
  private recipientsFromThread(thread: TransactionMessageEntity): { to: string[]; cc: string[] } {
    const meta = thread.metadataJson as Record<string, unknown> | null;
    return {
      to: this.emailListFrom(meta, 'to', 'toDetail'),
      cc: this.emailListFrom(meta, 'cc', 'ccDetail'),
    };
  }

  private emailListFrom(meta: Record<string, unknown> | null, flatField: string, detailField: string): string[] {
    const flat = meta?.[flatField];
    if (Array.isArray(flat) && flat.every((v) => typeof v === 'string')) return flat as string[];
    const detail = meta?.[detailField];
    if (Array.isArray(detail)) {
      return (detail as Array<{ email?: string }>).map((d) => d.email).filter((e): e is string => !!e);
    }
    return [];
  }

  private formatDate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${m}-${day}-${y}`;
  }
}
