import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TransactionWorkflowTemplateEntity } from '../transaction-workflow-templates/entities/transaction-workflow-template.entity';
import { TransactionWorkflowTemplateStepEntity } from '../transaction-workflow-templates/entities/transaction-workflow-template-step.entity';
import { TransactionWorkflowStepEntity, WorkflowStepStatus } from './entities/transaction-workflow-step.entity';
import { TransactionEntity, TransactionStatus } from '../transactions/entities/transaction.entity';
import {
  TransactionStageInstanceEntity,
  TransactionStage,
  StageInstanceStatus,
} from '../transactions/entities/transaction-stage-instance.entity';
import { TransactionPartyEntity } from '../transaction-parties/entities/transaction-party.entity';
import { TransactionJournalEntity, JournalType, JournalSource } from '../transaction-journals/entities/transaction-journal.entity';
import { MailgunService } from '../auth/mailgun.service';
import { InitWorkflowDto } from './dto/init-workflow.dto';

export interface InitWorkflowResult {
  stepsCreated: number;
  templateName: string;
  transaction: TransactionEntity;
}

/** Parse "YYYY-MM-DD" as local date to avoid UTC timezone offset shifting the day. */
function parseLocalDate(value: string): Date {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d);
}

@Injectable()
export class InitWorkflowService {
  private readonly logger = new Logger(InitWorkflowService.name);

  constructor(
    @InjectRepository(TransactionWorkflowTemplateEntity)
    private readonly templatesRepo: Repository<TransactionWorkflowTemplateEntity>,
    @InjectRepository(TransactionWorkflowTemplateStepEntity)
    private readonly templateStepsRepo: Repository<TransactionWorkflowTemplateStepEntity>,
    @InjectRepository(TransactionWorkflowStepEntity)
    private readonly workflowStepsRepo: Repository<TransactionWorkflowStepEntity>,
    @InjectRepository(TransactionEntity)
    private readonly transactionsRepo: Repository<TransactionEntity>,
    @InjectRepository(TransactionPartyEntity)
    private readonly partiesRepo: Repository<TransactionPartyEntity>,
    @InjectRepository(TransactionJournalEntity)
    private readonly journalsRepo: Repository<TransactionJournalEntity>,
    @InjectRepository(TransactionStageInstanceEntity)
    private readonly stageInstancesRepo: Repository<TransactionStageInstanceEntity>,
    private readonly mailgunService: MailgunService,
  ) {}

  async initWorkflow(transactionId: string, dto: InitWorkflowDto): Promise<InitWorkflowResult> {
    const tx = await this.transactionsRepo.findOne({ where: { id: transactionId } });
    if (!tx) throw new NotFoundException(`Transaction ${transactionId} not found`);

    if (tx.status !== TransactionStatus.DRAFT) {
      throw new BadRequestException(`Workflow already initiated — transaction status is "${tx.status}"`);
    }

    // 1. Resolve template
    const stateCode = dto.stateCode ?? tx.propertyState;
    const template = await this.resolveTemplate(tx.organizationId, tx.transactionType, tx.side, stateCode);
    if (!template) {
      throw new NotFoundException(
        `No active workflow template found for type="${tx.transactionType}" side="${tx.side}" state="${stateCode}"`,
      );
    }

    // 2. Load template steps ordered by sortOrder
    const templateSteps = await this.templateStepsRepo.find({
      where: { templateId: template.id },
      order: { sortOrder: 'ASC' },
    });

    // 3. Filter: mandatory steps always included; optional only if listed in dto
    const optionalKeys = new Set(dto.optionalStepKeys ?? []);
    const stepsToCreate = templateSteps.filter((s) => !s.isOptional || optionalKeys.has(s.stepKey));

    // 4. Compute reference date for dueAt (offerAcceptedAt from DTO > transaction > null)
    const refDate: Date | null = dto.offerAcceptedAt
      ? parseLocalDate(dto.offerAcceptedAt)
      : tx.offerAcceptedAt ?? null;

    // 5. Instantiate workflow steps
    const instances = stepsToCreate.map((s) =>
      this.workflowStepsRepo.create({
        transactionId,
        templateStepId: s.id,
        stepKey:         s.stepKey,
        stepName:        s.stepName,
        category:        s.category,
        responsibleRole: s.responsibleRole,
        sortOrder:       s.sortOrder,
        isOptional:      s.isOptional,
        status:          WorkflowStepStatus.PENDING,
        dueAt:           refDate && s.defaultDurationDays != null
                           ? this.addDays(refDate, s.defaultDurationDays)
                           : null,
      }),
    );
    await this.workflowStepsRepo.save(instances);

    // 6. Activate the transaction and CONTRACT stage instance
    tx.status = TransactionStatus.ACTIVE;
    if (dto.offerAcceptedAt && !tx.offerAcceptedAt) {
      tx.offerAcceptedAt = parseLocalDate(dto.offerAcceptedAt);
    }
    await this.transactionsRepo.save(tx);
    await this.stageInstancesRepo.save(
      this.stageInstancesRepo.create({
        transactionId,
        stage: TransactionStage.CONTRACT,
        status: StageInstanceStatus.ACTIVE,
        startedAt: new Date(),
        createdByAccountId: dto.initiatedByAccountId ?? null,
      }),
    );

    // 7. Write journal entry
    await this.journalsRepo.save(
      this.journalsRepo.create({
        transactionId,
        journalType:    JournalType.SYSTEM_EVENT,
        source:         JournalSource.UI,
        eventAt:        new Date(),
        title:          `Workflow initiated — ${instances.length} steps from template "${template.name}"`,
        body:           `State: ${stateCode} | Template version: ${template.version}`,
        actorAccountId: dto.initiatedByAccountId ?? null,
      }),
    );

    // 8. Send intro emails to parties (non-blocking — errors are logged, not thrown)
    await this.sendIntroEmails(tx).catch((err) =>
      this.logger.error('Intro email send failed', err),
    );

    this.logger.log(
      `Workflow initiated for ${transactionId}: ${instances.length} steps from "${template.name}"`,
    );

    return { stepsCreated: instances.length, templateName: template.name, transaction: tx };
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  /**
   * Priority: org+state > org+national > system+state > system+national.
   * A template whose stateCode doesn't match (and isn't null) is excluded.
   */
  private async resolveTemplate(
    organizationId: string,
    transactionType: string,
    side: string,
    stateCode: string | null,
  ): Promise<TransactionWorkflowTemplateEntity | null> {
    const candidates = await this.templatesRepo
      .createQueryBuilder('t')
      .where('t.transactionType = :type AND t.side = :side AND t.isActive = true', { type: transactionType, side })
      .andWhere('(t.organizationId = :orgId OR t.organizationId IS NULL)', { orgId: organizationId })
      .andWhere('(t.stateCode = :state OR t.stateCode IS NULL)', { state: stateCode })
      .getMany();

    if (!candidates.length) return null;

    // Score each candidate — higher wins
    const scored = candidates.map((t) => {
      const orgScore   = t.organizationId === organizationId ? 2 : 0;
      const stateScore = t.stateCode      === stateCode      ? 2 : 0;
      return { template: t, score: orgScore + stateScore };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored[0].template;
  }

  private async sendIntroEmails(tx: TransactionEntity): Promise<void> {
    const parties = await this.partiesRepo.find({ where: { transactionId: tx.id } });
    const address = [tx.propertyAddressLine1, tx.propertyCity, tx.propertyState].filter(Boolean).join(', ');

    for (const party of parties) {
      const email = party.email;
      if (!email) continue;

      const html = this.buildIntroHtml(party.displayName, address, tx.transactionNumber);
      const text = `Hi ${party.displayName},\n\nYou have been added as ${party.partyRole.replace(/_/g, ' ')} on transaction ${tx.transactionNumber} for ${address}.\n\nThe workflow has been initiated. You will receive further communication as the transaction progresses.`;

      await this.mailgunService.sendEmail(
        email,
        `Transaction ${tx.transactionNumber} — Workflow Initiated`,
        html,
        text,
      );
    }
  }

  private buildIntroHtml(displayName: string, address: string, txNumber: string): string {
    return `
<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;background:#f8fafc;margin:0;padding:32px;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:40px;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
    <div style="text-align:center;margin-bottom:32px;">
      <div style="display:inline-block;background:#1d4ed8;color:#fff;font-size:22px;font-weight:700;padding:12px 20px;border-radius:10px;">TC</div>
    </div>
    <h2 style="color:#111827;margin:0 0 8px;">Transaction Workflow Initiated</h2>
    <p style="color:#6b7280;margin:0 0 24px;">Hi ${displayName},</p>
    <p style="color:#374151;margin:0 0 16px;">
      You have been added as a party on the following transaction and the workflow has been initiated:
    </p>
    <div style="background:#f1f5f9;border-radius:8px;padding:16px;margin:0 0 24px;">
      <div style="font-weight:600;color:#111827;">${txNumber}</div>
      <div style="color:#6b7280;font-size:14px;margin-top:4px;">${address}</div>
    </div>
    <p style="color:#6b7280;font-size:13px;margin:24px 0 0;text-align:center;">
      You will receive further updates as this transaction progresses.
    </p>
  </div>
</body>
</html>`;
  }

  private addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }
}
