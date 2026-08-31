import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiInteractionEntity } from './entities/ai-interaction.entity';
import { CreateAiInteractionInput } from './dto/create-ai-interaction.input';
import { estimateLlmCostUsd } from '@tc/document-intelligence';

@Injectable()
export class AiInteractionsService {
  constructor(
    @InjectRepository(AiInteractionEntity)
    private readonly interactionsRepo: Repository<AiInteractionEntity>,
  ) {}

  findByTransaction(transactionId: string): Promise<AiInteractionEntity[]> {
    return this.interactionsRepo.find({ where: { transactionId }, order: { createdAt: 'DESC' } });
  }

  /** Returns the most recent row matching transactionId + feature, or null if none exists. */
  findLatestByTransactionAndFeature(
    transactionId: string,
    feature: string,
  ): Promise<AiInteractionEntity | null> {
    return this.interactionsRepo.findOne({
      where: { transactionId, feature },
      order: { createdAt: 'DESC' },
    });
  }

  findByAccount(accountId: string): Promise<AiInteractionEntity[]> {
    return this.interactionsRepo.find({ where: { actorAccountId: accountId }, order: { createdAt: 'DESC' } });
  }

  async findOne(id: string): Promise<AiInteractionEntity> {
    const interaction = await this.interactionsRepo.findOne({ where: { id } });
    if (!interaction) throw new NotFoundException(`AiInteraction ${id} not found`);
    return interaction;
  }

  async create(dto: CreateAiInteractionInput): Promise<AiInteractionEntity> {
    const interaction = this.interactionsRepo.create({
      modelName: dto.modelName,
      feature: dto.feature,
      promptText: dto.promptText,
      responseText: dto.responseText ?? null,
      transactionId: dto.transactionId ?? null,
      actorAccountId: dto.actorAccountId ?? null,
      promptTokens: dto.promptTokens ?? null,
      completionTokens: dto.completionTokens ?? null,
      costUsd: dto.costUsd ?? estimateLlmCostUsd(dto.modelName, dto.promptTokens, dto.completionTokens),
      status: dto.status,
      errorMessage: dto.errorMessage ?? null,
      metadataJson: dto.metadataJson ?? null,
    });
    return this.interactionsRepo.save(interaction);
  }
}
