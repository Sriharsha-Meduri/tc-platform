import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RepairRequestEntity, RepairRequestType, RepairReviewStatus } from './entities/repair-request.entity';
import { TransactionDocumentEntity } from '../transaction-documents/entities/transaction-document.entity';
import { TransactionEntity, TransactionStatus } from '../transactions/entities/transaction.entity';
import { TransactionPartyEntity, PartyRole } from '../transaction-parties/entities/transaction-party.entity';
import { TransactionMessageEntity } from '../transaction-messages/entities/transaction-message.entity';
import { MessageDirection, MessageChannel } from '../transaction-messages/entities/transaction-message.entity';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditAction } from '../audit-log/audit-log.entity';
import { DocuSignService } from '../docusign/docusign.service';
import { ApprovalService } from '../approvals/approval.service';
import { MailgunService } from '../auth/mailgun.service';
import { AccountEntity } from '../accounts/entities/account.entity';

export interface CreateRepairRequestInput {
  transactionId: string;
  rrDocumentId?: string;
  uploadedByAccountId?: string;
}

export interface ReceiveRrrrInput {
  transactionId: string;
  rrrrDocumentId: string;
  uploadedByAccountId?: string;
}

export interface ReviewInput {
  repairRequestId: string;
  reviewerAccountId: string;
  notes?: string;
}

@Injectable()
export class RepairRequestsService {
  private readonly logger = new Logger(RepairRequestsService.name);

  constructor(
    @InjectRepository(RepairRequestEntity)
    private readonly repo: Repository<RepairRequestEntity>,
    @InjectRepository(TransactionDocumentEntity)
    private readonly docRepo: Repository<TransactionDocumentEntity>,
    @InjectRepository(TransactionEntity)
    private readonly txRepo: Repository<TransactionEntity>,
    @InjectRepository(TransactionPartyEntity)
    private readonly partyRepo: Repository<TransactionPartyEntity>,
    @InjectRepository(TransactionMessageEntity)
    private readonly messageRepo: Repository<TransactionMessageEntity>,
    private readonly auditLog: AuditLogService,
    private readonly docusignService: DocuSignService,
    private readonly approvalService: ApprovalService,
    private readonly mailgunService: MailgunService,
  ) {}

  async findByTransaction(transactionId: string): Promise<RepairRequestEntity[]> {
    return this.repo.find({
      where: { transactionId },
      order: { createdAt: 'DESC' },
    });
  }

  async findById(id: string): Promise<RepairRequestEntity | null> {
    return this.repo.findOne({ where: { id } });
  }

  async findPendingByTransaction(transactionId: string): Promise<RepairRequestEntity | null> {
    return this.repo.findOne({
      where: { transactionId, status: RepairReviewStatus.PENDING },
      order: { createdAt: 'DESC' },
    });
  }

  async createRepairRequest(input: CreateRepairRequestInput): Promise<RepairRequestEntity> {
    const tx = await this.txRepo.findOne({ where: { id: input.transactionId } });
    if (!tx) throw new NotFoundException('Transaction not found');

    const existing = await this.findPendingByTransaction(input.transactionId);
    if (existing) {
      if (input.rrDocumentId) {
        existing.rrDocumentId = input.rrDocumentId;
        await this.repo.save(existing);
        await this.logAction(AuditAction.REPAIR_REQUEST_UPLOADED, tx, input.uploadedByAccountId,
          `Updated existing pending RR with new document`, { rrDocumentId: input.rrDocumentId });
      }
      return existing;
    }

    const entity = this.repo.create({
      transactionId: input.transactionId,
      requestType: RepairRequestType.RR,
      rrDocumentId: input.rrDocumentId ?? null,
      status: RepairReviewStatus.PENDING,
    });

    const saved = await this.repo.save(entity);

    await this.logAction(AuditAction.REPAIR_REQUEST_UPLOADED, tx, input.uploadedByAccountId,
      `Request for Repairs (RR) created for transaction`, { rrDocumentId: input.rrDocumentId });

    this.logger.log(`RR created for tx=${input.transactionId.slice(0, 8)} id=${saved.id.slice(0, 8)}`);
    return saved;
  }

  async receiveRrrr(input: ReceiveRrrrInput): Promise<RepairRequestEntity> {
    const pr = await this.findPendingByTransaction(input.transactionId);
    if (!pr) {
      throw new NotFoundException(
        'No pending repair request found. Upload an RR before the RRRR response.',
      );
    }

    if (pr.status !== RepairReviewStatus.PENDING) {
      throw new BadRequestException('This repair request has already been resolved.');
    }

    pr.rrrrDocumentId = input.rrrrDocumentId;
    const saved = await this.repo.save(pr);

    const tx = await this.txRepo.findOne({ where: { id: input.transactionId } });
    await this.logAction(AuditAction.REPAIR_REQUEST_RESPONSE_RECEIVED, tx, input.uploadedByAccountId,
      `Response to Request for Repairs (RRRR) received`, { rrrrDocumentId: input.rrrrDocumentId });

    // Notify buyer agent
    await this.notifyBuyerAgent(input.transactionId, saved);

    this.logger.log(`RRRR received for tx=${input.transactionId.slice(0, 8)} pr=${pr.id.slice(0, 8)}`);
    return saved;
  }

  async approve(input: ReviewInput): Promise<RepairRequestEntity> {
    const pr = await this.repo.findOne({ where: { id: input.repairRequestId } });
    if (!pr) throw new NotFoundException('Repair request not found');
    if (pr.status !== RepairReviewStatus.PENDING) {
      throw new BadRequestException('This repair request has already been resolved.');
    }

    const tx = await this.txRepo.findOne({ where: { id: pr.transactionId } });
    if (!tx) throw new NotFoundException('Transaction not found');

    // Buyer agent approval gate (configurable: set REQUIRE_BUYER_AGENT_APPROVAL=false to bypass)
    if (process.env.REQUIRE_BUYER_AGENT_APPROVAL !== 'false') {
      const latest = await this.approvalService.getForTransaction(pr.transactionId);
      const approval = latest.find(
        (r) => r.type === 'buyer_agent_contingency_removal' && r.status !== 'rejected',
      );

      if (!approval) {
        throw new BadRequestException('Buyer agent approval has not been requested.');
      }

      // Check if overall status is approved or at least one contingency is approved
      const cs = approval.contingencyStatus;
      const anyApproved = cs ? Object.values(cs).some((v) => v === 'approved') : false;
      const overallApproved = approval.status === 'approved' || anyApproved;

      if (!overallApproved) {
        throw new BadRequestException(
          approval.status === 'pending'
            ? 'Buyer agent approval is still pending.'
            : 'Buyer agent approval has not been requested.',
        );
      }
    }

    // Generate and send Contingency Removal via DocuSign
    let crDocId: string | null = null;
    let envelopeId: string | null = null;

    try {
      // Find buyer's CR form document (CR-B) or generate from RPA
      const crDoc = await this.findOrCreateCrDocument(pr);
      crDocId = crDoc?.id ?? null;

      if (crDocId) {
        // Send CR to buyer via DocuSign
        const buyerParty = await this.findParty(tx.id, 'buyer');
        const buyerAgentParty = await this.findParty(tx.id, 'buyer_agent');

        const signer = buyerParty?.email
          ? { name: buyerParty.displayName, email: buyerParty.email, role: 'Buyer' }
          : buyerAgentParty?.email
            ? { name: buyerAgentParty.displayName, email: buyerAgentParty.email, role: 'Buyer Agent' }
            : null;

        if (signer) {
          const propertyAddress = this.formatAddress(tx);
          const env = await this.docusignService.createEnvelope({
            transactionId: tx.id,
            documentIds: [crDocId],
            signers: [signer],
            emailSubject: `Contingency Removal – ${propertyAddress}`,
            emailBody: 'Please sign the Contingency Removal form to remove your inspection contingency.',
          });
          envelopeId = env.envelopeId;
          pr.docusignEnvelopeId = envelopeId;
        }
      }
    } catch (err) {
      this.logger.error(`DocuSign CR creation failed: ${(err as Error).message}`);
    }

    pr.status = RepairReviewStatus.APPROVED;
    pr.reviewerAccountId = input.reviewerAccountId;
    pr.buyerNotes = input.notes ?? null;
    pr.crDocumentId = crDocId;
    const saved = await this.repo.save(pr);

    await this.logAction(AuditAction.REPAIR_REQUEST_APPROVED, tx, input.reviewerAccountId,
      `RRRR approved — Inspection Contingency Removal initiated`,
      { reviewerAccountId: input.reviewerAccountId, crDocumentId: crDocId, docusignEnvelopeId: envelopeId });

    // Update transaction status to signal inspection contingency removal
    await this.txRepo.update(tx.id, {
      status: TransactionStatus.INSPECTION_CONTINGENCY_REMOVED,
    });

    // Create system message for the swimlane
    await this.createSystemMessage(tx, `Inspection contingency removal initiated. ${envelopeId ? 'CR sent via DocuSign for electronic signature.' : ''}`);

    this.logger.log(`RR approved for tx=${tx.id.slice(0, 8)} pr=${pr.id.slice(0, 8)}`);
    return saved;
  }

  async reject(input: ReviewInput): Promise<RepairRequestEntity> {
    const pr = await this.repo.findOne({ where: { id: input.repairRequestId } });
    if (!pr) throw new NotFoundException('Repair request not found');
    if (pr.status !== RepairReviewStatus.PENDING) {
      throw new BadRequestException('This repair request has already been resolved.');
    }

    pr.status = RepairReviewStatus.REJECTED;
    pr.reviewerAccountId = input.reviewerAccountId;
    pr.buyerNotes = input.notes ?? null;
    const saved = await this.repo.save(pr);

    const tx = await this.txRepo.findOne({ where: { id: pr.transactionId } });
    if (tx) {
      await this.logAction(AuditAction.REPAIR_REQUEST_REJECTED, tx, input.reviewerAccountId,
        `RRRR rejected — Seller Response Rejected`,
        { reviewerAccountId: input.reviewerAccountId, notes: input.notes });

      await this.txRepo.update(tx.id, {
        status: TransactionStatus.SELLER_RESPONSE_REJECTED,
      });

      await this.createSystemMessage(tx, 'Seller\'s response to repair request has been rejected. A revised RR or additional changes may be needed.');
    }

    this.logger.log(`RR rejected for tx=${pr.transactionId.slice(0, 8)}`);
    return saved;
  }

  async requestChanges(input: ReviewInput): Promise<RepairRequestEntity> {
    const pr = await this.repo.findOne({ where: { id: input.repairRequestId } });
    if (!pr) throw new NotFoundException('Repair request not found');
    if (pr.status !== RepairReviewStatus.PENDING) {
      throw new BadRequestException('This repair request has already been resolved.');
    }

    pr.status = RepairReviewStatus.CHANGES_REQUESTED;
    pr.reviewerAccountId = input.reviewerAccountId;
    pr.buyerNotes = input.notes ?? null;
    const saved = await this.repo.save(pr);

    const tx = await this.txRepo.findOne({ where: { id: pr.transactionId } });
    if (tx) {
      await this.logAction(AuditAction.REPAIR_REQUEST_CHANGES_REQUESTED, tx, input.reviewerAccountId,
        `Changes requested on RRRR response`,
        { reviewerAccountId: input.reviewerAccountId, notes: input.notes });

      await this.createSystemMessage(tx, 'Buyer agent has requested changes to the seller\'s repair response. Awaiting revised response.');
    }

    return saved;
  }

  async findDocumentsForRepairRequest(pr: RepairRequestEntity): Promise<{
    rr: TransactionDocumentEntity | null;
    rrrr: TransactionDocumentEntity | null;
    cr: TransactionDocumentEntity | null;
  }> {
    const [rr, rrrr, cr] = await Promise.all([
      pr.rrDocumentId ? this.docRepo.findOne({ where: { id: pr.rrDocumentId } }) : null,
      pr.rrrrDocumentId ? this.docRepo.findOne({ where: { id: pr.rrrrDocumentId } }) : null,
      pr.crDocumentId ? this.docRepo.findOne({ where: { id: pr.crDocumentId } }) : null,
    ]);

    return { rr, rrrr, cr };
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private async findOrCreateCrDocument(pr: RepairRequestEntity): Promise<TransactionDocumentEntity | null> {
    // Check if a CR-B document already exists for this stage
    const existing = await this.docRepo.findOne({
      where: {
        transactionId: pr.transactionId,
        formCode: 'CR-B',
      },
      order: { createdAt: 'DESC' },
    });

    if (existing && existing.storageKey) return existing;

    // Check for CR in metadata of the RRRR doc or any inspection doc
    if (pr.rrrrDocumentId) {
      const rrrrDoc = await this.docRepo.findOne({ where: { id: pr.rrrrDocumentId } });
      if (rrrrDoc?.storageKey) return rrrrDoc;
    }

    // Fallback: return the RR document as a reference
    if (pr.rrDocumentId) {
      const rrDoc = await this.docRepo.findOne({ where: { id: pr.rrDocumentId } });
      if (rrDoc?.storageKey) return rrDoc;
    }

    return null;
  }

  private async findParty(transactionId: string, role: string): Promise<TransactionPartyEntity | null> {
    return this.partyRepo.findOne({
      where: { transactionId, partyRole: role as PartyRole, isPrimary: true },
    });
  }

  private formatAddress(tx: TransactionEntity): string {
    const parts = [tx.propertyAddressLine1];
    if (tx.propertyAddressLine2) parts.push(tx.propertyAddressLine2);
    parts.push(`${tx.propertyCity}, ${tx.propertyState}`);
    if (tx.propertyPostalCode) parts[parts.length - 1] += ` ${tx.propertyPostalCode}`;
    return parts.join(', ');
  }

  private async notifyBuyerAgent(transactionId: string, pr: RepairRequestEntity): Promise<void> {
    try {
      const buyerAgentParty = await this.findParty(transactionId, 'buyer_agent');
      const buyerParty = await this.findParty(transactionId, 'buyer');
      const tx = await this.txRepo.findOne({ where: { id: transactionId } });

      const recipientEmail = buyerAgentParty?.email ?? buyerParty?.email;
      const recipientName = buyerAgentParty?.displayName ?? buyerParty?.displayName ?? 'Buyer Agent';

      if (recipientEmail && tx) {
        const propertyAddress = this.formatAddress(tx);

        const notificationHtml = `
<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;background:#f8fafc;margin:0;padding:32px;">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:40px;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
    <div style="text-align:center;margin-bottom:32px;">
      <div style="display:inline-block;background:#1d4ed8;color:#fff;font-size:22px;font-weight:700;padding:12px 20px;border-radius:10px;">TC</div>
    </div>
    <h2 style="color:#111827;margin:0 0 8px;">Seller's Repair Response Received</h2>
    <p style="color:#6b7280;margin:0 0 16px;">The seller has responded to your Request for Repairs for:</p>
    <p style="color:#111827;font-weight:600;margin:0 0 24px;">${propertyAddress}</p>
    <p style="color:#6b7280;margin:0 0 24px;">Please review the Response to Request for Repairs (RRRR) and either approve or reject the seller's response from the transaction dashboard.</p>
    <p style="color:#9ca3af;font-size:13px;margin:24px 0 0;text-align:center;">
      Transaction #${tx.transactionNumber}
    </p>
  </div>
</body>
</html>`;

        await this.mailgunService.sendEmail(
          recipientEmail,
          `Seller's Repair Response Received — ${propertyAddress}`,
          notificationHtml,
          `The seller has responded to your Request for Repairs. Please review the RRRR and approve or reject from the transaction dashboard.`,
          tx.outboundEmailAddress ?? undefined,
        );

        await this.createSystemMessage(tx,
          `Seller's Response to Request for Repairs (RRRR) received. ${recipientName} has been notified for review.`);
      }
    } catch (err) {
      this.logger.error(`Failed to notify buyer agent: ${(err as Error).message}`);
    }
  }

  private async createSystemMessage(tx: TransactionEntity, content: string): Promise<void> {
    try {
      const msg = this.messageRepo.create({
        transactionId: tx.id,
        channel: MessageChannel.IN_APP,
        direction: MessageDirection.INTERNAL,
        subject: 'System Notification',
        bodyHtml: `<p>${content}</p>`,
        bodyText: content,
        stage: 'inspection',
      });
      await this.messageRepo.save(msg);
    } catch (err) {
      this.logger.error(`Failed to create system message: ${(err as Error).message}`);
    }
  }

  private async logAction(
    action: AuditAction,
    tx: TransactionEntity | null,
    accountId: string | undefined,
    description: string,
    details?: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.auditLog.log({
        accountId: accountId ?? null,
        action,
        targetType: 'repair_request',
        targetId: tx?.id ?? null,
        targetDisplayName: tx?.transactionNumber ?? null,
        description,
        details: details ?? null,
      });
    } catch (err) {
      this.logger.error(`Audit log write failed: ${(err as Error).message}`);
    }
  }
}
