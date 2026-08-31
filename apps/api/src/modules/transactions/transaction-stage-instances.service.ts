import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  TransactionStageInstanceEntity,
  TransactionStage,
  StageInstanceStatus,
  STAGE_SORT_ORDER,
} from './entities/transaction-stage-instance.entity';

@Injectable()
export class TransactionStageInstancesService {
  constructor(
    @InjectRepository(TransactionStageInstanceEntity)
    private readonly repo: Repository<TransactionStageInstanceEntity>,
  ) {}

  getForTransaction(transactionId: string): Promise<TransactionStageInstanceEntity[]> {
    return this.repo.find({
      where: { transactionId },
      order: { createdAt: 'ASC' },
    }).then((instances) =>
      instances.sort(
        (a, b) =>
          (STAGE_SORT_ORDER[a.stage] ?? 99) - (STAGE_SORT_ORDER[b.stage] ?? 99),
      ),
    );
  }

  async getActiveStages(transactionId: string): Promise<string[]> {
    const instances = await this.repo.find({
      where: { transactionId, status: StageInstanceStatus.ACTIVE },
    });
    return instances.map((i) => i.stage);
  }

  /**
   * Creates or re-activates a stage instance. Idempotent — calling on an already-active
   * instance is a no-op (returns the existing row).
   */
  async activateStage(
    transactionId: string,
    stage: TransactionStage | string,
    accountId?: string,
  ): Promise<TransactionStageInstanceEntity> {
    const stageKey = stage as TransactionStage;
    let instance = await this.repo.findOne({ where: { transactionId, stage: stageKey } });

    if (!instance) {
      instance = this.repo.create({
        transactionId,
        stage: stageKey,
        status: StageInstanceStatus.ACTIVE,
        startedAt: new Date(),
        createdByAccountId: accountId ?? null,
      });
    } else if (instance.status !== StageInstanceStatus.ACTIVE) {
      instance.status = StageInstanceStatus.ACTIVE;
      instance.startedAt = instance.startedAt ?? new Date();
      instance.completedAt = null;
      instance.waivedAt = null;
    }

    return this.repo.save(instance);
  }

  async completeStage(
    transactionId: string,
    stage: TransactionStage | string,
  ): Promise<TransactionStageInstanceEntity> {
    const instance = await this.repo.findOne({
      where: { transactionId, stage: stage as TransactionStage },
    });
    if (!instance) throw new NotFoundException(`Stage instance "${stage}" not found for transaction ${transactionId}`);
    if (instance.status !== StageInstanceStatus.ACTIVE) {
      throw new BadRequestException(`Stage "${stage}" is not active — cannot complete`);
    }
    instance.status = StageInstanceStatus.COMPLETED;
    instance.completedAt = new Date();
    return this.repo.save(instance);
  }

  async waiveStage(
    transactionId: string,
    stage: TransactionStage | string,
  ): Promise<TransactionStageInstanceEntity> {
    const instance = await this.repo.findOne({
      where: { transactionId, stage: stage as TransactionStage },
    });
    if (!instance) throw new NotFoundException(`Stage instance "${stage}" not found for transaction ${transactionId}`);
    instance.status = StageInstanceStatus.WAIVED;
    instance.waivedAt = new Date();
    return this.repo.save(instance);
  }

  async updateStatus(
    instanceId: string,
    status: StageInstanceStatus,
  ): Promise<TransactionStageInstanceEntity> {
    const instance = await this.repo.findOne({ where: { id: instanceId } });
    if (!instance) throw new NotFoundException(`Stage instance ${instanceId} not found`);

    instance.status = status;
    if (status === StageInstanceStatus.ACTIVE && !instance.startedAt) {
      instance.startedAt = new Date();
    }
    if (status === StageInstanceStatus.COMPLETED) instance.completedAt = new Date();
    if (status === StageInstanceStatus.WAIVED)    instance.waivedAt    = new Date();

    return this.repo.save(instance);
  }
}
