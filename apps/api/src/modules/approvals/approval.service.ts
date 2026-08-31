import { Injectable, Logger, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApprovalRequestEntity, ApprovalStatus, ApprovalType } from './entities/approval-request.entity';
import { MailgunService } from '../auth/mailgun.service';
import { EmailTemplateService } from '../auth/email-template.service';
import { TransactionPartyEntity } from '../transaction-parties/entities/transaction-party.entity';
import { PartyRole } from '../transaction-parties/entities/transaction-party.entity';
import { TransactionEntity } from '../transactions/entities/transaction.entity';
import { TransactionDocumentEntity, DocumentStatus } from '../transaction-documents/entities/transaction-document.entity';
import { TransactionMessageEntity, MessageChannel, MessageDirection, MessageStatus } from '../transaction-messages/entities/transaction-message.entity';
import { DocuSignService } from '../docusign/docusign.service';

export interface CreateApprovalInput {
  transactionId: string;
  type: 'buyer_agent_contingency_removal';
  requestedBy: string;
  contingencies?: string[];
}

@Injectable()
export class ApprovalService {
  private readonly logger = new Logger(ApprovalService.name);

  constructor(
    @InjectRepository(ApprovalRequestEntity)
    private readonly repo: Repository<ApprovalRequestEntity>,
    @InjectRepository(TransactionPartyEntity)
    private readonly partyRepo: Repository<TransactionPartyEntity>,
    @InjectRepository(TransactionEntity)
    private readonly txRepo: Repository<TransactionEntity>,
    private readonly mailgun: MailgunService,
    private readonly emailTemplate: EmailTemplateService,
    @InjectRepository(TransactionDocumentEntity)
    private readonly docRepo: Repository<TransactionDocumentEntity>,
    @InjectRepository(TransactionMessageEntity)
    private readonly messageRepo: Repository<TransactionMessageEntity>,
    private readonly docusignService: DocuSignService,
  ) {}

  async create(input: CreateApprovalInput): Promise<ApprovalRequestEntity> {
    const existing = await this.repo.findOne({
      where: { transactionId: input.transactionId, type: input.type },
      order: { requestedAt: 'DESC' },
    });

    if (existing && existing.status === 'pending') {
      throw new ForbiddenException('An approval request is already pending');
    }

    const entity = this.repo.create({
      transactionId: input.transactionId,
      type: input.type,
      status: 'pending' as ApprovalStatus,
      requestedBy: input.requestedBy,
      contingencyStatus: (input.contingencies ?? []).reduce(
        (acc, c) => ({ ...acc, [c]: 'pending' as const }),
        {} as Record<string, 'pending' | 'approved' | 'rejected'>,
      ),
    });
    const saved = await this.repo.save(entity);
    this.logger.log(`Approval request created: ${saved.id} (${input.type}) for tx ${input.transactionId.slice(0, 8)}`);

    await this.sendApprovalEmail(saved);
    return saved;
  }

  async approve(id: string, accountId: string | null, comments?: string): Promise<ApprovalRequestEntity> {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) throw new NotFoundException('Approval request not found');
    if (entity.status !== 'pending') throw new ForbiddenException('Already responded');

    entity.status = 'approved';
    entity.respondedBy = accountId;
    entity.respondedAt = new Date();
    if (comments) entity.comments = comments;
    // Approve all pending contingencies
    if (entity.contingencyStatus) {
      for (const key of Object.keys(entity.contingencyStatus)) {
        if (entity.contingencyStatus[key] === 'pending') {
          entity.contingencyStatus[key] = 'approved';
        }
      }
    }
    const saved = await this.repo.save(entity);

    await this.triggerAutoDocusign(saved).catch((err) => {
      this.logger.warn(`Auto-DocuSign trigger failed: ${(err as Error).message}`);
    });

    return saved;
  }

  async approveContingencies(id: string, accountId: string | null, selected: string[], comments?: string): Promise<ApprovalRequestEntity> {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) throw new NotFoundException('Approval request not found');
    if (entity.status !== 'pending') throw new ForbiddenException('Already responded');

    if (entity.contingencyStatus) {
      for (const key of Object.keys(entity.contingencyStatus)) {
        if (selected.includes(key)) {
          entity.contingencyStatus[key] = 'approved';
        } else if (entity.contingencyStatus[key] === 'pending') {
          entity.contingencyStatus[key] = 'rejected';
        }
      }
    }

    const allApproved = Object.values(entity.contingencyStatus ?? {}).every((v) => v === 'approved');
    const anyApproved = Object.values(entity.contingencyStatus ?? {}).some((v) => v === 'approved');

    if (allApproved) {
      entity.status = 'approved';
    } else if (!anyApproved) {
      entity.status = 'rejected';
    }
    // If mixed (some approved, some rejected), keep status as 'pending' so rejected ones can be re-requested

    entity.respondedBy = accountId;
    entity.respondedAt = new Date();
    if (comments) entity.comments = comments;
    const saved = await this.repo.save(entity);

    // Auto-trigger DocuSign for approved contingencies with existing CR forms
    if (anyApproved) {
      await this.triggerAutoDocusign(saved).catch((err) => {
        this.logger.warn(`Auto-DocuSign trigger failed: ${(err as Error).message}`);
      });
    }

    return saved;
  }

  async reject(id: string, accountId: string | null, comments?: string): Promise<ApprovalRequestEntity> {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) throw new NotFoundException('Approval request not found');
    if (entity.status !== 'pending') throw new ForbiddenException('Already responded');

    entity.status = 'rejected';
    entity.respondedBy = accountId;
    entity.respondedAt = new Date();
    if (comments) entity.comments = comments;
    return this.repo.save(entity);
  }

  async findById(id: string): Promise<ApprovalRequestEntity | null> {
    return this.repo.findOne({ where: { id } });
  }

  async resendEmail(id: string): Promise<void> {
    const request = await this.repo.findOne({ where: { id } });
    if (!request) throw new NotFoundException('Approval request not found');
    await this.sendApprovalEmail(request);
  }

  async getForTransaction(transactionId: string): Promise<ApprovalRequestEntity[]> {
    return this.repo.find({ where: { transactionId }, order: { requestedAt: 'DESC' } });
  }

  async getLatestStatus(transactionId: string, type: ApprovalType): Promise<ApprovalStatus | null> {
    const latest = await this.repo.findOne({
      where: { transactionId, type },
      order: { requestedAt: 'DESC' },
    });
    return latest?.status ?? null;
  }

  private async sendApprovalEmail(request: ApprovalRequestEntity): Promise<void> {
    const buyerAgent = await this.partyRepo.findOne({
      where: { transactionId: request.transactionId, partyRole: PartyRole.BUYER_AGENT },
    });
    if (!buyerAgent || !buyerAgent.email) {
      this.logger.warn(`No buyer agent email for tx ${request.transactionId}`);
      return;
    }

    const tx = await this.txRepo.findOne({ where: { id: request.transactionId } });
    if (!tx) return;

    const webUrl = process.env.WEB_APP_URL ?? 'http://localhost:3001';
    const approvalUrl = `${webUrl}/approve/${request.id}`;
    const property = tx.propertyAddressLine1 || 'the property';
    const name = buyerAgent.displayName || 'Agent';

    try {
      const ctx = { agentName: name, propertyAddress: property, approvalUrl, transactionId: request.transactionId };
      const html = this.emailTemplate.render('approval-request.html.hbs', ctx);
      const text = this.emailTemplate.render('approval-request.text.hbs', ctx);

      const result = await this.mailgun.sendEmail(
        buyerAgent.email,
        `Approval Needed: Contingency Removal — ${property}`,
        html,
        text,
        tx.outboundEmailAddress ?? undefined,
      );

      if (result?.messageId) {
        request.emailInfo = { messageId: result.messageId, sentAt: new Date().toISOString(), openedAt: null };
        await this.repo.save(request);
      }
      this.logger.log(`Approval email sent to ${buyerAgent.email}`);
    } catch (err) {
      this.logger.error(`Failed to send approval email: ${(err as Error).message}`);
    }
  }

  /**
   * After contingencies are approved, checks for existing CR-B forms and
   * automatically sends them via DocuSign for signature.
   */
  private async triggerAutoDocusign(request: ApprovalRequestEntity): Promise<void> {
    const approved = Object.entries(request.contingencyStatus ?? {})
      .filter(([, v]) => v === 'approved')
      .map(([k]) => k);

    if (approved.length === 0) return;

    const tx = await this.txRepo.findOne({ where: { id: request.transactionId } });
    if (!tx) return;

    // Find CR-B forms uploaded for this transaction
    const crDocs = await this.docRepo.find({
      where: { transactionId: request.transactionId, formCode: 'CR-B' },
      order: { createdAt: 'DESC' },
    });

    if (crDocs.length === 0) {
      this.logger.log(`No CR-B forms found for tx=${request.transactionId.slice(0, 8)} — waiting for upload`);
      await this.createSystemMessage(request.transactionId,
        `Buyer Agent has approved contingencies (${approved.join(', ')}). Waiting for CR-B form upload before sending via DocuSign.`);
      return;
    }

    // Find the buyer party for signing
    const buyerParty = await this.partyRepo.findOne({
      where: { transactionId: request.transactionId, partyRole: PartyRole.BUYER, isPrimary: true },
    });
    const buyerAgentParty = await this.partyRepo.findOne({
      where: { transactionId: request.transactionId, partyRole: PartyRole.BUYER_AGENT, isPrimary: true },
    });

    const signer = buyerParty?.email
      ? { name: buyerParty.displayName, email: buyerParty.email, role: 'Buyer' }
      : buyerAgentParty?.email
        ? { name: buyerAgentParty.displayName, email: buyerAgentParty.email, role: 'Buyer Agent' }
        : null;

    if (!signer) {
      this.logger.warn(`No buyer/buyer agent found for tx=${request.transactionId.slice(0, 8)}`);
      return;
    }

    const propertyAddress = [tx.propertyAddressLine1, tx.propertyCity, tx.propertyState]
      .filter(Boolean).join(', ');

    try {
      for (const crDoc of crDocs) {
        if (!crDoc.storageKey) continue;

        const envelope = await this.docusignService.createEnvelope({
          transactionId: request.transactionId,
          documentIds: [crDoc.id],
          signers: [signer],
          emailSubject: `Contingency Removal — ${propertyAddress}`,
          emailBody: 'Please sign the Contingency Removal form to remove the approved contingencies.',
        });

        await this.messageRepo.save(
          this.messageRepo.create({
            transactionId: request.transactionId,
            channel: MessageChannel.EMAIL,
            direction: MessageDirection.OUTBOUND,
            status: MessageStatus.SENT,
            subject: `Contingency Removal — ${propertyAddress}`,
            bodyText: `Contingency Removal form sent via DocuSign for electronic signature. Envelope: ${envelope.envelopeId}`,
            providerName: 'mailgun',
            providerMessageId: envelope.envelopeId ?? null,
            stage: 'inspection',
            sentAt: new Date(),
            metadataJson: {
              type: 'auto-docusign-cr',
              envelopeId: envelope.envelopeId,
              docId: crDoc.id,
              signer: signer.email,
              approvedContingencies: approved,
            },
          }),
        );

        this.logger.log(
          `Auto-sent CR-B via DocuSign for tx=${request.transactionId.slice(0, 8)} ` +
          `contingencies=${approved.join(',')} envelope=${envelope.envelopeId}`,
        );
      }
    } catch (err) {
      this.logger.error(`Auto-DocuSign failed for tx=${request.transactionId.slice(0, 8)}: ${(err as Error).message}`);
    }
  }

  private async createSystemMessage(transactionId: string, content: string, stage: string = 'inspection'): Promise<void> {
    try {
      await this.messageRepo.save(
        this.messageRepo.create({
          transactionId,
          channel: MessageChannel.IN_APP,
          direction: MessageDirection.INTERNAL,
          subject: 'Contingency Approval',
          bodyHtml: `<p>${content}</p>`,
          bodyText: content,
          stage,
        }),
      );
    } catch (err) {
      this.logger.warn(`Failed to create system message: ${(err as Error).message}`);
    }
  }

}
