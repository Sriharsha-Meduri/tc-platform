import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TransactionMessagesService } from '../../transaction-messages/transaction-messages.service';
import { TransactionJournalsService } from '../../transaction-journals/transaction-journals.service';
import { TransactionDocumentsService } from '../../transaction-documents/transaction-documents.service';
import { DocumentPipelineService } from '../../document-extraction/document-pipeline.service';
import { RepairRequestsService } from '../../repair-requests/repair-requests.service';
import { VerificationOfPropertyService } from '../../verification-of-property/verification-of-property.service';
import { TransactionEntity } from '../../transactions/entities/transaction.entity';
import { TransactionPartyEntity } from '../../transaction-parties/entities/transaction-party.entity';
import { TransactionStageInstanceEntity, StageInstanceStatus, TransactionStage } from '../../transactions/entities/transaction-stage-instance.entity';
import {
  MessageChannel,
  MessageDirection,
  MessageStatus,
} from '../../transaction-messages/entities/transaction-message.entity';
import {
  JournalSource,
  JournalType,
} from '../../transaction-journals/entities/transaction-journal.entity';
import type { MailgunInboundPayload } from './mailgun-payload.dto';
import type { MailgunEventWebhookBody, MailgunEventType } from './mailgun-event-payload.dto';

/**
 * Extracts a transaction ID from a Mailgun recipient address.
 *
 * Convention: route inbound emails to   txn-{uuid}@mg.yourdomain.com
 * Example:    txn-cc6b7798-9643-45aa-b514-a4ac02cbc50c@mg.yourdomain.com
 */
function extractTransactionId(recipient: string): string | null {
  const local = recipient.split('@')[0] ?? '';
  const match = local.match(/^txn-([0-9a-f-]{36})$/i);
  return match ? match[1] : null;
}

/**
 * Maps the current transaction stage to a document type string.
 * Falls back to 'general' for unrecognised stages.
 */
function stageToDocumentType(stage: string): string {
  const map: Record<string, string> = {
    disclosures: 'disclosure',
    inspection:  'inspection_report',
    appraisal:   'appraisal',
    contract:    'purchase_agreement',
    loan:        'loan',
    escrow:      'escrow',
    closing:     'closing',
  };
  return map[stage.toLowerCase()] ?? 'general';
}

const SUPPORTED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/tiff',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

@Injectable()
export class MailgunWebhookService {
  private readonly logger = new Logger(MailgunWebhookService.name);

  constructor(
    @InjectRepository(TransactionEntity)
    private readonly transactionsRepo: Repository<TransactionEntity>,
    @InjectRepository(TransactionStageInstanceEntity)
    private readonly stageInstancesRepo: Repository<TransactionStageInstanceEntity>,
    @InjectRepository(TransactionPartyEntity)
    private readonly partyRepo: Repository<TransactionPartyEntity>,
    private readonly messagesService: TransactionMessagesService,
    private readonly journalsService: TransactionJournalsService,
    private readonly documentsService: TransactionDocumentsService,
    private readonly pipelineService: DocumentPipelineService,
    private readonly repairRequestsService: RepairRequestsService,
    private readonly vpService: VerificationOfPropertyService,
  ) {}

  async processInbound(
    payload: MailgunInboundPayload,
    files: Express.Multer.File[],
  ): Promise<void> {
    const messageId = payload['Message-Id'] ?? null;
    const inReplyTo = payload['In-Reply-To'] ?? null;

    this.logger.log(
      `Inbound email from ${payload.sender} → ${payload.recipient} ` +
      `subject="${payload.subject ?? '(none)'}" attachments=${files.length}`,
    );

    // ── 1. Match to a transaction ─────────────────────────────────────────
    const uuidMatch = extractTransactionId(payload.recipient);
    let transaction: TransactionEntity | null = null;

    if (uuidMatch) {
      transaction = await this.transactionsRepo.findOne({
        where: { id: uuidMatch },
      });
      if (!transaction) {
        this.logger.warn(`Transaction ${uuidMatch} not found for inbound email. Ignoring.`);
        return;
      }
    } else {
      // Fallback: look up transaction by outboundEmailAddress (slug-based format)
      transaction = await this.transactionsRepo.findOne({
        where: { outboundEmailAddress: payload.recipient },
      });
      if (!transaction) {
        this.logger.warn(
          `Cannot resolve transaction from recipient "${payload.recipient}" — ` +
          `address does not match txn-{uuid}@... pattern and no transaction has this outboundEmailAddress. Ignoring.`,
        );
        return;
      }
      this.logger.log(
        `Resolved transaction ${transaction.id} from outboundEmailAddress "${payload.recipient}"`,
      );
    }

    const transactionId = transaction.id;

    // Derive stage label from first active stage instance (fallback: 'general')
    const activeInstance = await this.stageInstancesRepo.findOne({
      where: { transactionId, status: StageInstanceStatus.ACTIVE },
      order: { startedAt: 'ASC' },
    });
    const stage = activeInstance?.stage ?? 'general';

    // ── 2. Persist the message ────────────────────────────────────────────
    const threadKey = inReplyTo ?? messageId ?? undefined;

    // Match sender to a transaction party for swimlane routing
    let senderPartyId: string | null = null;
    try {
      const senderEmail = payload.sender?.toLowerCase();
      if (senderEmail) {
        const party = await this.partyRepo.findOne({
          where: { transactionId, email: senderEmail },
        });
        if (party) {
          senderPartyId = party.id;
          this.logger.log(`Matched sender ${senderEmail} to party ${party.displayName} (${party.partyRole})`);
        }
      }
    } catch (err) {
      // Best-effort — don't fail message creation for party matching
    }

    const message = await this.messagesService.create({
      transactionId,
      channel: MessageChannel.EMAIL,
      direction: MessageDirection.INBOUND,
      subject: payload.subject ?? undefined,
      bodyText: payload['stripped-text'] ?? payload['body-plain'] ?? undefined,
      senderPartyId: senderPartyId ?? undefined,
      providerName: 'mailgun',
      providerMessageId: messageId ?? undefined,
      providerThreadId: inReplyTo ?? undefined,
      threadKey: threadKey ?? undefined,
      receivedAt: new Date(parseInt(payload.timestamp, 10) * 1000).toISOString(),
      stage,
      metadataJson: JSON.stringify({ sender: payload.sender, from: payload.from }),
    });

    this.logger.log(`Saved inbound message ${message.id} on transaction ${transactionId}`);

    // ── 2a. If this is a reply, link to the original outbound message ─────
    let originalMessageId: string | null = null;
    if (inReplyTo) {
      try {
        const originals = await this.messagesService.findByProviderMessageId(inReplyTo);
        const original = originals?.[0] ?? null;
        if (original) {
          originalMessageId = original.id;
          this.logger.log(
            `Reply linked: inbound ${message.id} replies to outbound ${original.id} ` +
            `(providerMessageId=${inReplyTo}) on transaction ${transactionId}`,
          );
        } else {
          this.logger.log(
            `No matching outbound message found for In-Reply-To=${inReplyTo} — ` +
            `reply ${message.id} saved without original link`,
          );
        }
      } catch (err) {
        this.logger.warn(
          `Failed to resolve In-Reply-To=${inReplyTo} for transaction ${transactionId}: ${err}`,
        );
      }
    }

    // ── 3. Journal entry for the email ────────────────────────────────────
    const journalType = originalMessageId ? JournalType.EMAIL_REPLIED : JournalType.EMAIL_RECEIVED;
    const journalDescription = originalMessageId
      ? `Reply received from ${payload.sender} (re: ${payload.subject ?? '(no subject)'})`
      : `Email received from ${payload.sender}`;

    await this.journalsService.createEntry(
      transactionId,
      journalType,
      JournalSource.EMAIL,
      journalDescription,
      payload['stripped-text'] ?? payload['body-plain'] ?? undefined,
      undefined,
      'transaction_message',
      message.id,
      {
        from: payload.from,
        sender: payload.sender,
        recipient: payload.recipient,
        messageId,
        inReplyTo: inReplyTo ?? undefined,
        originalMessageId: originalMessageId ?? undefined,
        attachmentCount: files.length,
      },
    );

    // ── 4. Save attachments to S3 and create document records ─────────────
    if (files.length === 0) return;

    const documentType = stageToDocumentType(stage);
    let savedCount = 0;
    const attachmentResults: Array<{ fileName: string; mimeType: string; detectedFormCode?: string; validated?: boolean }> = [];

    for (const file of files) {
      if (!SUPPORTED_MIME_TYPES.has(file.mimetype)) {
        this.logger.warn(
          `Skipping attachment "${file.originalname}" — unsupported MIME type: ${file.mimetype}`,
        );
        attachmentResults.push({ fileName: file.originalname, mimeType: file.mimetype });
        continue;
      }

      try {
        const doc = await this.documentsService.uploadFile({
          transactionId,
          stage,
          file,
          documentType,
          title: file.originalname,
        });

        this.logger.log(
          `Saved attachment "${file.originalname}" → document ${doc.id}`,
        );

        let detectedFormCode: string | undefined;

        // Fire-and-forget pipeline processing — must not block the webhook response
        if (file.mimetype === 'application/pdf') {
          void this.processAttachment(doc.id, transactionId, file, payload.sender, message.id, stage)
            .then((result) => {
              if (result) {
                attachmentResults.push({
                  fileName: file.originalname,
                  mimeType: file.mimetype,
                  detectedFormCode: result.detectedFormCode,
                  validated: result.validated,
                });
              }
            });
        }
        // For non-PDF files, push result immediately
        if (file.mimetype !== 'application/pdf') {
          attachmentResults.push({
            fileName: file.originalname,
            mimeType: file.mimetype,
          });
        }

        await this.journalsService.createEntry(
          transactionId,
          JournalType.DOCUMENT_UPLOADED,
          JournalSource.EMAIL,
          `Attachment received via email: ${file.originalname}`,
          undefined,
          undefined,
          'transaction_document',
          doc.id,
          {
            sender:       payload.sender,
            fileName:     file.originalname,
            mimeType:     file.mimetype,
            sizeBytes:    file.size,
            documentType,
            stage,
            messageId:    message.id,
          },
        );

        savedCount++;
      } catch (err) {
        this.logger.error(
          `Failed to save attachment "${file.originalname}" for transaction ${transactionId}`,
          err,
        );
      }
    }

    if (savedCount > 0) {
      this.logger.log(
        `Saved ${savedCount}/${files.length} attachment(s) for transaction ${transactionId}`,
      );
    }

    // Patch message metadata with attachment details for the Email Timeline
    if (attachmentResults.length > 0) {
      try {
        await this.messagesService.patchMetadataJson(message.id, { attachments: attachmentResults });
      } catch (err) {
        this.logger.warn(`Failed to patch message metadata: ${(err as Error).message}`);
      }
    }
  }

  /**
   * Background processing of a single PDF attachment. Runs the document
   * intelligence pipeline, patches metadata, activates stages, and triggers
   * auto-detection workflows. Called via fire-and-forget to avoid blocking
   * the webhook response (Mailgun times out after ~10s).
   */
  private async processAttachment(
    docId: string,
    transactionId: string,
    file: Express.Multer.File,
    sender: string,
    messageId: string,
    stage: string,
  ): Promise<{ detectedFormCode?: string; validated?: boolean } | null> {
    try {
      const result = await this.pipelineService.process(file.buffer);
      const detected = result.detectedFormCode ?? undefined;
      let validated = false;

      const metadataPatch: Record<string, unknown> = {
        extraction:    result.extraction as unknown as Record<string, unknown>,
        compliance:    result.compliance as unknown as Record<string, unknown>,
        extractedAt:   new Date().toISOString(),
        pdfSource:     'inbound_email',
        detectedFormCode: result.detectedFormCode,
        formCode:      result.detectedFormCode,
      };

      await this.documentsService.patchMetadataJson(docId, metadataPatch);
      await this.documentsService.update(docId, {
        documentType: result.resolvedDocumentType,
      });

      // Activate the resolved stage if it's not already active
      if (result.resolvedStage && result.resolvedStage !== 'general') {
        const existing = await this.stageInstancesRepo.findOne({
          where: { transactionId, stage: result.resolvedStage as TransactionStage },
        });
        if (!existing) {
          await this.stageInstancesRepo.save(
            this.stageInstancesRepo.create({
              transactionId,
              stage: result.resolvedStage as TransactionStage,
              status: StageInstanceStatus.ACTIVE,
              startedAt: new Date(),
            }),
          );
        }
      }

      // Auto-detect document type and trigger workflow actions
      if (detected) {
        if (detected === 'VP') validated = true;
        await this.handleAutoDetection(transactionId, detected, docId, sender, messageId);
        this.logger.log(
          `Pipeline detected "${detected}" for "${file.originalname}" → stage: ${result.resolvedStage}`,
        );
      }

      this.logger.log(`Extraction complete for "${file.originalname}"`);
      return { detectedFormCode: detected, validated };
    } catch (err) {
      const trace = err instanceof Error ? (err.stack ?? err.message) : String(err);
      this.logger.error(`Pipeline extraction failed for "${file.originalname}": ${trace}`);
      return null;
    }
  }

  /**
   * Processes Mailgun event webhooks (delivered, opened, clicked, failed, etc.)
   * and updates the corresponding transaction_message status.
   */
  async processEvent(payload: MailgunEventWebhookBody): Promise<void> {
    const data = payload['event-data'];
    if (!data?.message?.headers?.['message-id']) {
      this.logger.warn('Event webhook missing message-id — skipping');
      return;
    }

    const messageId = data.message.headers['message-id'];
    const event = data.event;
    const recipient = data.recipient;

    this.logger.log(`Mailgun event: ${event} for ${messageId} → ${recipient}`);

    // Map event type to MessageStatus
    const statusMap: Partial<Record<MailgunEventType, MessageStatus>> = {
      delivered: MessageStatus.DELIVERED,
      failed:    MessageStatus.FAILED,
      opened:    MessageStatus.READ,
    };

    const newStatus = statusMap[event];
    if (!newStatus) return; // accepted, clicked, complained — log metadata only

    try {
      const messages = await this.messagesService.findByProviderMessageId(messageId);
      if (!messages.length) {
        this.logger.warn(`No message found for providerMessageId: ${messageId}`);
        return;
      }

      // Match by recipient when multiple messages share the same ID
      const matched = messages.find((m) => {
        const meta = m.metadataJson as Record<string, unknown> | null;
        return (meta?.to as string)?.toLowerCase() === recipient.toLowerCase();
      }) ?? messages[0];

      await this.messagesService.updateStatus(matched.id, newStatus);

      // Patch metadata with event details
      const metaPatch: Record<string, unknown> = {
        [`${event}At`]: new Date(data.timestamp * 1000).toISOString(),
        eventId: data.id,
      };
      if (data.severity) metaPatch.severity = data.severity;
      if (data.reason) metaPatch.reason = data.reason;
      if (data.ip) metaPatch.ip = data.ip;
      if (data['client-info']) metaPatch.clientInfo = data['client-info'];

      await this.messagesService.patchMetadataJson(matched.id, metaPatch).catch(() => {});

      this.logger.log(`Updated message ${matched.id.slice(0, 8)} status → ${newStatus} (${event})`);
    } catch (err) {
      this.logger.error(`Failed to process Mailgun event: ${(err as Error).message}`);
    }
  }

  // ── Private: document auto-detection dispatch ──────────────────────────────

  /**
   * Dispatch table: maps detected form codes to auto-action handlers.
   * When a document is identified via inbound email attachment, the
   * corresponding handler creates journal entries, system messages,
   * and triggers domain-specific workflows.
   */
  private async handleAutoDetection(
    transactionId: string,
    detectedFormCode: string,
    documentId: string,
    sender: string,
    messageId: string,
  ): Promise<void> {
    const code = detectedFormCode.toUpperCase();

    // VP — Verification of Property
    if (code === 'VP') {
      try {
        const vp = await this.vpService.findByTransaction(transactionId);
        if (vp) {
          await this.vpService.markDocumentReceived(vp.id, documentId);
          await this.vpService.markValidated(vp.id);
          await this.vpService.createSystemMessage(transactionId,
            `Verification of Property (VP) form received via email reply from ${sender}. Document validated and ready for signature.`);
          this.logger.log(`VP auto-detected for tx=${transactionId.slice(0, 8)}`);
        }
      } catch (err) {
        this.logger.warn(`VP auto-detect failed: ${(err as Error).message}`);
      }
      return;
    }

    // RR / RRRR — Repair Requests
    if (code === 'RR') {
      await this.repairRequestsService.createRepairRequest({ transactionId, rrDocumentId: documentId })
        .catch((err: Error) => this.logger.warn(`RR auto-detect failed: ${err.message}`));
      return;
    }
    if (code === 'RRRR') {
      await this.repairRequestsService.receiveRrrr({ transactionId, rrrrDocumentId: documentId })
        .catch((err: Error) => this.logger.warn(`RRRR auto-detect failed: ${err.message}`));
      return;
    }

    // PREQUAL / POF — Qualification documents
    const QUAL_LABELS: Record<string, string> = {
      PREQUAL: 'Lender Prequalification Letter',
      POF: 'Buyer Proof of Funds',
    };
    if (code === 'PREQUAL' || code === 'POF') {
      await this.journalsService.createEntry(
        transactionId, JournalType.SYSTEM_EVENT, JournalSource.EMAIL,
        `${QUAL_LABELS[code] || code} received via email from ${sender}`,
        undefined, undefined, 'transaction_document', documentId,
        { sender, formCode: code, messageId },
      ).catch(() => {});
      this.logger.log(`${code} received via email for tx=${transactionId.slice(0, 8)}`);
      return;
    }

    // Disclosure forms — NHD, AD, TDS, SPQ, AVID, BIA, etc.
    const DISCLOSURE_FORMS = new Set(['NHD', 'AD', 'TDS', 'SPQ', 'AVID', 'BIA', 'SBSA']);
    if (DISCLOSURE_FORMS.has(code)) {
      await this.journalsService.createEntry(
        transactionId, JournalType.SYSTEM_EVENT, JournalSource.EMAIL,
        `Disclosure form (${code}) received via email from ${sender}`,
        undefined, undefined, 'transaction_document', documentId,
        { sender, formCode: code, messageId },
      ).catch(() => {});
      this.logger.log(`Disclosure form ${code} received via email for tx=${transactionId.slice(0, 8)}`);
      return;
    }

    // Counter offers — SCO, BCO, SMCO, BMCO
    if (code === 'SCO' || code === 'BCO' || code === 'SMCO' || code === 'BMCO') {
      await this.journalsService.createEntry(
        transactionId, JournalType.SYSTEM_EVENT, JournalSource.EMAIL,
        `Counter offer (${code}) received via email from ${sender}`,
        undefined, undefined, 'transaction_document', documentId,
        { sender, formCode: code, messageId },
      ).catch(() => {});
      this.logger.log(`Counter offer ${code} received via email for tx=${transactionId.slice(0, 8)}`);
      return;
    }
  }
}
