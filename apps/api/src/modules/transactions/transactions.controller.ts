import { Body, Controller, Delete, Get, Param, Patch, Post, Req, HttpCode, HttpStatus, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { Request } from 'express';
import { TransactionsService, TransactionDashboardSummary } from './transactions.service';
import { TransactionEntity, TransactionStatus } from './entities/transaction.entity';
import { TransactionDocumentEntity, DocumentStatus } from '../transaction-documents/entities/transaction-document.entity';
import { BlockerOverrideService } from '../blocker-overrides/blocker-override.service';
import { TransactionStage, StageInstanceStatus } from './entities/transaction-stage-instance.entity';
import { CreateTransactionInput } from './dto/create-transaction.input';
import { UpdateTransactionInput } from './dto/update-transaction.input';
import { TransactionStageInstancesService } from './transaction-stage-instances.service';
import { InitWorkflowService } from '../transaction-workflow-steps/init-workflow.service';
import { InitWorkflowDto } from '../transaction-workflow-steps/dto/init-workflow.dto';
import { ContractSubmissionService, SubmitContractDto } from './contract-submission.service';
import { EventSeederService } from './event-seeder.service';
import { VoidNotifyService, VoidNotifyDto } from './void-notify.service';
import { TransactionClockService, SetClockDto } from '../transaction-clock/transaction-clock.service';
import { ReminderSchedulerService } from '../reminders/reminder-scheduler.service';
import { DEFAULT_BUYER_SIDE_REMINDER_LEAD_DAYS } from '../reminders/verification-of-property-reminder-scheduler.service';
import { DEFAULT_SELLER_SIDE_REMINDER_LEAD_DAYS } from '../reminders/seller-side-document-reminder-scheduler.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditAction } from '../audit-log/audit-log.entity';
import { AccountsService } from '../accounts/accounts.service';
import { MembershipStatus } from '../organizations/entities/organization-membership.entity';
import { OrganizationMembershipEntity } from '../organizations/entities/organization-membership.entity';

@Controller('transactions')
export class TransactionsController {
  constructor(
    private readonly transactionsService: TransactionsService,
    private readonly stageInstancesService: TransactionStageInstancesService,
    private readonly initWorkflowService: InitWorkflowService,
    private readonly contractSubmissionService: ContractSubmissionService,
    private readonly eventSeederService: EventSeederService,
    private readonly voidNotifyService: VoidNotifyService,
    private readonly transactionClockService: TransactionClockService,
    private readonly reminderSchedulerService: ReminderSchedulerService,
    private readonly auditLogService: AuditLogService,
    private readonly accountsService: AccountsService,
    @InjectRepository(OrganizationMembershipEntity)
    private readonly membershipRepo: Repository<OrganizationMembershipEntity>,
    @InjectRepository(TransactionEntity)
    private readonly transactionsRepo: Repository<TransactionEntity>,
    @InjectRepository(TransactionDocumentEntity)
    private readonly documentsRepo: Repository<TransactionDocumentEntity>,
    private readonly blockerOverrideService: BlockerOverrideService,
  ) {}

  @Get()
  async findAll(@Req() req: Request) {
    const userId = (req.user as { userId?: string })?.userId;
    if (userId) {
      const account = await this.accountsService.findByUserId(userId);
      if (account) {
        const membership = await this.membershipRepo.findOne({
          where: { accountId: account.id, status: MembershipStatus.ACTIVE },
        });
        if (membership) {
          return this.transactionsService.findAll({ organizationId: membership.organizationId });
        }
      }
    }
    return this.transactionsService.findAll();
  }

  @Get('organization/:orgId')
  findByOrganization(@Param('orgId') orgId: string) {
    return this.transactionsService.findByOrganization(orgId);
  }

  /** Dashboard-friendly summary with active stage, blocker/warning counts, and form codes per transaction. */
  @Get('summary')
  async getSummary(@Req() req: Request): Promise<TransactionDashboardSummary[]> {
    const userId = (req.user as { userId?: string })?.userId;
    if (userId) {
      const account = await this.accountsService.findByUserId(userId);
      if (account) {
        const membership = await this.membershipRepo.findOne({
          where: { accountId: account.id, status: MembershipStatus.ACTIVE },
        });
        if (membership) {
          return this.transactionsService.findDashboardSummaries(membership.organizationId);
        }
        // Independent agent — only show transactions they created
        return this.transactionsService.findDashboardSummaries(undefined, account.id);
      }
    }
    return this.transactionsService.findDashboardSummaries();
  }

  /**
   * Transactions the authenticated account may view/delete via the QA-delete
   * workflow — brokers see their whole brokerage, agents and TCs see only
   * transactions they're assigned to, everyone sees what they created.
   * Unrelated transactions are never returned.
   */
  @Get('qa-deletable')
  async getQaDeletable(@Req() req: Request) {
    const userId = (req.user as { userId?: string })?.userId;
    if (!userId) throw new BadRequestException('Authentication required');
    const account = await this.accountsService.findByUserId(userId);
    if (!account) throw new NotFoundException('Account not found');
    return this.transactionsService.findQaDeletableTransactions(account.id);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.transactionsService.findOne(id);
  }

  @Post('create-with-agent')
  async createWithAgent(@Req() req: Request, @Body() body: Record<string, unknown>) {
    const userId = (req.user as { userId?: string })?.userId;
    if (!userId) throw new BadRequestException('Authentication required');

    const account = await this.accountsService.findByUserId(userId);
    if (!account) throw new NotFoundException('Account not found');

    const buyerAgentEmail = String(body.buyerAgentEmail ?? '').trim();
    const buyerAgentName = String(body.buyerAgentName ?? '').trim();
    const propertyAddressLine1 = String(body.propertyAddressLine1 ?? '').trim();
    const propertyCity = String(body.propertyCity ?? '').trim();
    const propertyState = String(body.propertyState ?? '').trim();

    if (!buyerAgentEmail) {
      throw new BadRequestException('buyerAgentEmail is required');
    }

    const result = await this.transactionsService.createWithAgent({
      organizationId: String(body.organizationId ?? ''),
      createdByAccountId: account.id,
      buyerAgentEmail,
      buyerAgentName,
      propertyAddressLine1: propertyAddressLine1 || 'TBD',
      propertyCity: propertyCity || 'TBD',
      propertyState: propertyState || 'CA',
    });

    await this.auditLogService.log({
      action: AuditAction.TRANSACTION_CREATED,
      targetType: 'transaction',
      targetId: result.transaction.id,
      targetDisplayName: result.transaction.transactionNumber ?? result.transaction.id,
      description: `Transaction created: ${result.transaction.transactionNumber ?? result.transaction.id}`,
      details: { userId, organizationId: body.organizationId },
    });

    return result;
  }

  /**
   * Persists blocker overrides centrally (TransactionBlockerOverrideEntity) —
   * the single source of truth every consumer (Draft Session, the compliance
   * section, the Documents swimlane, and the Buyer/Seller Agent + Escrow
   * upload-link checklists) resolves through, never a per-screen flag.
   *
   * With no body (the existing "Override & Continue" bulk call), every
   * blocker currently present — across every active document, plus the
   * Draft Session's own transaction-level compliance snapshot for blockers
   * not yet tied to a persisted document — is overridden individually. Pass
   * `{ blockerId, documentId }` to override just one specific blocker
   * occurrence instead.
   */
  @Post(':id/override-blockers')
  async overrideBlockers(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: { blockerId?: string; documentId?: string; reason?: string } = {},
  ) {
    const userId = (req.user as { userId?: string })?.userId;
    if (!userId) throw new BadRequestException('Authentication required');

    const account = await this.accountsService.findByUserId(userId);
    if (!account) throw new NotFoundException('Account not found');

    const tx = await this.transactionsService.findOne(id);

    const docs = await this.documentsRepo.find({
      where: { transactionId: id, status: Not(DocumentStatus.SUPERSEDED) },
    });

    const toOverride: Array<{ blockerId: string; documentId: string | null; formCode: string | null }> = [];
    for (const doc of docs) {
      const meta = doc.metadataJson as { compliance?: { blockers?: Array<{ code: string }> } } | null;
      for (const b of meta?.compliance?.blockers ?? []) {
        if (body.blockerId && b.code !== body.blockerId) continue;
        if (body.documentId && doc.id !== body.documentId) continue;
        toOverride.push({ blockerId: b.code, documentId: doc.id, formCode: doc.formCode });
      }
    }

    // Draft Session blockers not yet tied to a persisted document — the same
    // transaction-level compliance snapshot the legacy endpoint fell back to,
    // now overridden per-blocker instead of as one blanket flag.
    const summary = (tx.summaryJson as Record<string, unknown>) ?? {};
    const summaryBlockers = (summary.compliance as { blockers?: Array<{ code: string }> } | undefined)?.blockers ?? [];
    for (const b of summaryBlockers) {
      if (body.blockerId && b.code !== body.blockerId) continue;
      if (body.documentId) continue; // a summary-level blocker has no documentId to match against
      if (toOverride.some((o) => o.blockerId === b.code)) continue; // already captured via a document above
      toOverride.push({ blockerId: b.code, documentId: null, formCode: null });
    }

    if (toOverride.length === 0) {
      throw new BadRequestException('No blockers to override');
    }

    for (const target of toOverride) {
      await this.blockerOverrideService.override({
        transactionId: id,
        blockerId: target.blockerId,
        documentId: target.documentId,
        formCode: target.formCode,
        overriddenByAccountId: account.id,
        reason: body.reason,
      });
    }

    await this.auditLogService.log({
      action: AuditAction.BLOCKER_OVERRIDDEN,
      targetType: 'transaction',
      targetId: tx.id,
      targetDisplayName: tx.transactionNumber ?? tx.id,
      description: `${toOverride.length} blocker${toOverride.length !== 1 ? 's' : ''} overridden by ${account.displayName}`,
      details: {
        userId,
        accountId: account.id,
        blockerIds: toOverride.map((o) => o.blockerId),
        documentIds: toOverride.map((o) => o.documentId).filter((d): d is string => !!d),
      },
    });

    return { success: true, overriddenCount: toOverride.length };
  }

  @Post()
  async create(@Req() req: Request, @Body() dto: CreateTransactionInput) {
    const tx = await this.transactionsService.create(dto);
    await this.auditLogService.log({
      action: AuditAction.TRANSACTION_CREATED,
      targetType: 'transaction',
      targetId: tx.id,
      targetDisplayName: tx.transactionNumber ?? tx.id,
      description: `Transaction created: ${tx.transactionNumber ?? tx.id}`,
      details: { userId: (req.user as { userId?: string })?.userId ?? null, organizationId: dto.organizationId },
    });
    return tx;
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateTransactionInput) {
    return this.transactionsService.update(id, dto);
  }

  @Patch(':id/status')
  async updateStatus(@Req() req: Request, @Param('id') id: string, @Body('status') status: TransactionStatus) {
    const tx = await this.transactionsService.updateStatus(id, status);
    await this.auditLogService.log({
      action: AuditAction.TRANSACTION_STATUS_CHANGED,
      targetType: 'transaction',
      targetId: tx.id,
      targetDisplayName: tx.transactionNumber ?? tx.id,
      description: `Transaction ${tx.transactionNumber ?? tx.id} status changed to ${status}`,
      details: { userId: (req.user as { userId?: string })?.userId ?? null, newStatus: status },
    });
    return tx;
  }

  @Patch(':id/escrow-email')
  async setEscrowEmail(
    @Param('id') id: string,
    @Body('email') email: string | null,
  ) {
    const tx = await this.transactionsService.findOne(id);
    if (!tx) throw new NotFoundException('Transaction not found');

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (email && !emailPattern.test(email)) {
      throw new BadRequestException('Invalid email address format');
    }

    const current = (tx.summaryJson as Record<string, unknown>) ?? {};
    const updated = { ...current, escrowEmail: email || undefined };
    tx.summaryJson = updated as Record<string, unknown>;
    await this.transactionsRepo.save(tx);

    if (email) {
      await this.stageInstancesService.activateStage(id, TransactionStage.ESCROW);
    }

    return { escrowEmail: email, summaryJson: updated };
  }

  @Get(':id/escrow-email')
  async getEscrowEmail(@Param('id') id: string) {
    const tx = await this.transactionsService.findOne(id);
    if (!tx) throw new NotFoundException('Transaction not found');
    const summary = (tx.summaryJson as Record<string, unknown>) ?? {};
    return { escrowEmail: (summary.escrowEmail as string) ?? null };
  }

  @Patch(':id/escrow-number')
  async setEscrowNumber(
    @Param('id') id: string,
    @Body('number') number: string | null,
  ) {
    const tx = await this.transactionsService.findOne(id);
    if (!tx) throw new NotFoundException('Transaction not found');
    const summary = (tx.summaryJson as Record<string, unknown>) ?? {};
    const updated = { ...summary, escrowNumber: number || undefined };
    tx.summaryJson = updated as Record<string, unknown>;
    await this.transactionsRepo.save(tx);

    if (number) {
      await this.stageInstancesService.activateStage(id, TransactionStage.ESCROW);
    }

    return { escrowNumber: number };
  }

  @Get(':id/escrow-number')
  async getEscrowNumber(@Param('id') id: string) {
    const tx = await this.transactionsService.findOne(id);
    if (!tx) throw new NotFoundException('Transaction not found');
    const summary = (tx.summaryJson as Record<string, unknown>) ?? {};
    return { escrowNumber: (summary.escrowNumber as string) ?? null };
  }

  @Patch(':id/reminder-config')
  async setReminderConfig(
    @Param('id') id: string,
    @Body() config: { inspection?: boolean; appraisal?: boolean; loan?: boolean; startDays?: number },
  ) {
    const tx = await this.transactionsService.findOne(id);
    if (!tx) throw new NotFoundException('Transaction not found');
    const summary = (tx.summaryJson as Record<string, unknown>) ?? {};
    const reminderConfig = (summary.reminderConfig as Record<string, unknown>) ?? {};
    if (config.inspection !== undefined) reminderConfig.inspection = config.inspection;
    if (config.appraisal !== undefined) reminderConfig.appraisal = config.appraisal;
    if (config.loan !== undefined) reminderConfig.loan = config.loan;
    if (config.startDays !== undefined) reminderConfig.startDays = config.startDays;
    tx.summaryJson = { ...summary, reminderConfig } as Record<string, unknown>;
    await this.transactionsRepo.save(tx);
    return { reminderConfig };
  }

  @Get(':id/reminder-config')
  async getReminderConfig(@Param('id') id: string) {
    const tx = await this.transactionsService.findOne(id);
    if (!tx) throw new NotFoundException('Transaction not found');
    const summary = (tx.summaryJson as Record<string, unknown>) ?? {};
    const config = (summary.reminderConfig as Record<string, unknown>) ?? {};
    return {
      inspection: (config.inspection as boolean) ?? true,
      appraisal: (config.appraisal as boolean) ?? true,
      loan: (config.loan as boolean) ?? true,
      startDays: (config.startDays as number) ?? 3,
    };
  }

  @Patch(':id/buyer-side-reminder-settings')
  async setBuyerSideReminderSettings(
    @Param('id') id: string,
    @Body() body: { leadDays: number },
  ) {
    const tx = await this.transactionsService.setBuyerSideReminderLeadTime(id, body.leadDays);
    return { buyerSideReminderLeadDays: tx.buyerSideReminderLeadDays };
  }

  @Get(':id/buyer-side-reminder-settings')
  async getBuyerSideReminderSettings(@Param('id') id: string) {
    const tx = await this.transactionsService.findOne(id);
    if (!tx) throw new NotFoundException('Transaction not found');
    return { buyerSideReminderLeadDays: tx.buyerSideReminderLeadDays ?? DEFAULT_BUYER_SIDE_REMINDER_LEAD_DAYS };
  }

  @Patch(':id/seller-side-reminder-settings')
  async setSellerSideReminderSettings(
    @Param('id') id: string,
    @Body() body: { leadDays: number },
  ) {
    const tx = await this.transactionsService.setSellerSideReminderLeadTime(id, body.leadDays);
    return { sellerSideReminderLeadDays: tx.sellerSideReminderLeadDays };
  }

  @Get(':id/seller-side-reminder-settings')
  async getSellerSideReminderSettings(@Param('id') id: string) {
    const tx = await this.transactionsService.findOne(id);
    if (!tx) throw new NotFoundException('Transaction not found');
    return { sellerSideReminderLeadDays: tx.sellerSideReminderLeadDays ?? DEFAULT_SELLER_SIDE_REMINDER_LEAD_DAYS };
  }

  @Get(':id/stages')
  listStages(@Param('id') id: string) {
    return this.stageInstancesService.getForTransaction(id);
  }

  @Post(':id/stages')
  activateStage(
    @Param('id') id: string,
    @Body('stage') stage: TransactionStage,
    @Body('notes') _notes?: string,
  ) {
    return this.stageInstancesService.activateStage(id, stage);
  }

  @Patch(':id/stages/:stageId')
  updateStageStatus(
    @Param('stageId') stageId: string,
    @Body('status') status: StageInstanceStatus,
  ) {
    return this.stageInstancesService.updateStatus(stageId, status);
  }

  /**
   * Deletes (voids) a transaction via the QA-delete workflow.
   * Only permitted for: brokers deleting a transaction in their own
   * brokerage, agents/TCs deleting a transaction they're assigned to, or
   * the account that created the transaction — the same rule set as
   * {@link getQaDeletable}, so nothing deletable here was ever hidden from
   * the list, and nothing listed is refused here.
   */
  @Delete(':id')
  async remove(@Req() req: Request, @Param('id') id: string) {
    const userId = (req.user as { userId?: string })?.userId;
    if (!userId) throw new BadRequestException('Authentication required');

    const account = await this.accountsService.findByUserId(userId);
    if (!account) throw new NotFoundException('Account not found');

    const tx = await this.transactionsService.findOne(id);

    const isAuthorized = await this.transactionsService.canAccountManageTransactionForQa(tx, account.id);
    if (!isAuthorized) {
      throw new BadRequestException('You are not authorized to delete this transaction');
    }

    const deletedAt = new Date();
    await this.transactionsService.void(id);
    await this.auditLogService.log({
      action: AuditAction.TRANSACTION_DELETED,
      targetType: 'transaction',
      targetId: tx.id,
      targetDisplayName: tx.transactionNumber ?? tx.id,
      description: `Transaction ${tx.transactionNumber ?? tx.id} deleted by ${account.displayName} (${account.id})`,
      details: {
        userId,
        accountId: account.id,
        accountDisplayName: account.displayName,
        transactionId: tx.id,
        transactionNumber: tx.transactionNumber ?? null,
        deletedAt: deletedAt.toISOString(),
      },
    });
    return { success: true };
  }

  /** Restore a per-account soft-deleted transaction for the authenticated user. */
  @Patch(':id/restore')
  async restore(@Req() req: Request, @Param('id') id: string) {
    const userId = (req.user as { userId?: string })?.userId;
    if (!userId) throw new BadRequestException('Authentication required');

    const account = await this.accountsService.findByUserId(userId);
    if (!account) throw new NotFoundException('Account not found');

    await this.transactionsService.restoreForAccount(id, account.id);
    return { success: true };
  }

  /** Voids the transaction: marks it as CANCELLED. Only the creator or assigned coordinator may void. */
  @Patch(':id/void')
  async void(@Req() req: Request, @Param('id') id: string) {
    const userId = (req.user as { userId?: string })?.userId;
    if (userId) {
      const account = await this.accountsService.findByUserId(userId);
      if (account) {
        const tx = await this.transactionsService.findOne(id);
        if (tx.createdByAccountId !== account.id && tx.assignedCoordinatorAccountId !== account.id) {
          throw new BadRequestException('You can only void transactions that you created or are assigned as coordinator');
        }
      }
    }
    const tx = await this.transactionsService.void(id);
    await this.auditLogService.log({
      action: AuditAction.TRANSACTION_STATUS_CHANGED,
      targetType: 'transaction',
      targetId: tx.id,
      targetDisplayName: tx.transactionNumber ?? tx.id,
      description: `Transaction ${tx.transactionNumber ?? tx.id} voided (CANCELLED)`,
      details: { userId: (req.user as { userId?: string })?.userId ?? null, newStatus: TransactionStatus.CANCELLED },
    });
    return tx;
  }

  /**
   * Voids the transaction and sends a templated notification email to the agent.
   * The email body is rendered server-side from contract-voided.html.hbs using
   * extraction data stored in the transaction document's metadataJson.
   */
  @Post(':id/void-notify')
  async voidAndNotify(@Req() req: Request, @Param('id') id: string, @Body() dto: VoidNotifyDto) {
    const tx = await this.voidNotifyService.voidAndNotify(id, dto);
    await this.auditLogService.log({
      action: AuditAction.TRANSACTION_STATUS_CHANGED,
      targetType: 'transaction',
      targetId: tx.id,
      targetDisplayName: tx.transactionNumber ?? tx.id,
      description: `Transaction ${tx.transactionNumber ?? tx.id} voided with notification`,
      details: { userId: (req.user as { userId?: string })?.userId ?? null, toEmail: dto.toEmail ?? null },
    });
    return tx;
  }

  /**
   * Confirms party details, creates submission #1, advances to CONTRACT stage,
   * and sends welcome emails to all parties from the transaction's outbound address.
   */
  @Post(':id/submit-contract')
  async submitContract(@Req() req: Request, @Param('id') id: string, @Body() dto: SubmitContractDto) {
    const userId = (req.user as { userId?: string })?.userId ?? null;
    const roles = (req.user as { roles?: string[] })?.roles ?? [];
    const result = await this.contractSubmissionService.submitContract(id, dto, roles);
    await this.auditLogService.log({
      action: AuditAction.TRANSACTION_SUBMITTED,
      targetType: 'transaction',
      targetId: id,
      description: `Transaction ${id} submitted (DRAFT → ACTIVE)`,
      details: { userId, emailsSent: result.emailsSent },
    });
    return result;
  }

  /**
   * Initiates the workflow for a draft transaction.
   * Resolves the best matching template (org → state → national fallback),
   * copies steps, computes due dates, activates the transaction, sends
   * intro emails to all parties, and seeds transaction events + reminders
   * from the contract extraction data stored on the document.
   */
  @Post(':id/init-workflow')
  async initWorkflow(@Req() req: Request, @Param('id') id: string, @Body() dto: InitWorkflowDto) {
    const result = await this.initWorkflowService.initWorkflow(id, dto);
    const txId = result.transaction.id;
    await this.eventSeederService.seedFromExtraction(txId);
    await this.auditLogService.log({
      action: AuditAction.TRANSACTION_STATUS_CHANGED,
      targetType: 'transaction',
      targetId: txId,
      targetDisplayName: result.transaction.transactionNumber ?? txId,
      description: `Workflow initiated for transaction ${result.transaction.transactionNumber ?? txId}`,
      details: {
        userId: (req.user as { userId?: string })?.userId ?? null,
        templateName: result.templateName,
        stepsCreated: result.stepsCreated,
      },
    });
    return result;
  }

  /** Returns clock settings (timezone + virtual clock offset) for a transaction. */
  @Get(':id/clock')
  getClock(@Param('id') id: string) {
    return this.transactionClockService.findByTransaction(id);
  }

  /**
   * Sets or resets the virtual clock for a transaction.
   * Pass { virtualNow: "2026-06-01T10:00:00Z" } to advance time.
   * Pass { virtualNow: null } to reset to real time.
   * All scheduled reminder jobs for this transaction are rescheduled automatically.
   */
  @Patch(':id/clock')
  async setClock(@Param('id') id: string, @Body() dto: SetClockDto) {
    const clockSettings = await this.transactionClockService.setClock(id, dto);
    await this.reminderSchedulerService.rescheduleForTransaction(id, clockSettings);
    return clockSettings;
  }

  /** Returns all reminders for a transaction with event context and cancellability flag. */
  @Get(':id/reminders')
  listReminders(@Param('id') id: string) {
    return this.reminderSchedulerService.listByTransaction(id);
  }

  /** Cancels a single scheduled reminder. Rejects if within the cutoff window. */
  @Delete(':id/reminders/:reminderId')
  @HttpCode(HttpStatus.NO_CONTENT)
  cancelReminder(
    @Param('reminderId') reminderId: string,
    @Body('reason') reason: string,
  ) {
    return this.reminderSchedulerService.cancelOne(reminderId, reason ?? 'Voided by user');
  }

  /** Creates a custom one-off notification reminder for this transaction. */
  @Post(':id/custom-reminders')
  async createCustomReminder(
    @Param('id') id: string,
    @Body('fireAt') fireAt: string,
    @Body('subject') subject: string,
    @Body('message') message: string | undefined,
    @Body('recipients') recipients: string[] | undefined,
  ) {
    const fireDate = new Date(fireAt);
    if (isNaN(fireDate.getTime())) {
      throw new BadRequestException('Invalid fireAt date');
    }
    if (!subject || typeof subject !== 'string' || subject.trim().length === 0) {
      throw new BadRequestException('subject is required');
    }
    return this.reminderSchedulerService.scheduleCustomReminder(
      id, fireDate, subject.trim(), message?.trim() ?? null, recipients,
    );
  }

  /** Cancels a pending custom reminder. Rejects if within the cutoff window. */
  @Delete(':id/custom-reminders/:reminderId')
  @HttpCode(HttpStatus.NO_CONTENT)
  cancelCustomReminder(
    @Param('reminderId') reminderId: string,
    @Body('reason') reason: string,
  ) {
    return this.reminderSchedulerService.cancelOneCustom(
      reminderId, reason ?? 'Voided by user',
    );
  }

}
