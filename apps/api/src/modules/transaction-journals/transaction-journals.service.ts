import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  TransactionJournalEntity,
  JournalType,
  JournalSource,
} from './entities/transaction-journal.entity';
import { CreateTransactionJournalInput } from './dto/create-transaction-journal.input';

@Injectable()
export class TransactionJournalsService {
  constructor(
    @InjectRepository(TransactionJournalEntity)
    private readonly journalsRepo: Repository<TransactionJournalEntity>,
  ) {}

  findByTransaction(transactionId: string, limit?: number): Promise<TransactionJournalEntity[]> {
    return this.journalsRepo.find({
      where: { transactionId },
      order: { eventAt: 'DESC' },
      ...(limit ? { take: limit } : {}),
    });
  }

  async create(dto: CreateTransactionJournalInput): Promise<TransactionJournalEntity> {
    const entry = this.journalsRepo.create({
      transactionId: dto.transactionId,
      journalType: dto.journalType,
      source: dto.source,
      eventAt: new Date(dto.eventAt),
      title: dto.title,
      body: dto.body ?? null,
      actorAccountId: dto.actorAccountId ?? null,
    });
    return this.journalsRepo.save(entry);
  }

  async createEntry(
    transactionId: string,
    type: JournalType,
    source: JournalSource,
    title: string,
    body?: string,
    actorAccountId?: string,
    relatedEntityType?: string,
    relatedEntityId?: string,
    metadata?: Record<string, unknown>,
  ): Promise<TransactionJournalEntity> {
    const entry = this.journalsRepo.create({
      transactionId,
      journalType: type,
      source,
      eventAt: new Date(),
      title,
      body: body ?? null,
      actorAccountId: actorAccountId ?? null,
      relatedEntityType: relatedEntityType ?? null,
      relatedEntityId: relatedEntityId ?? null,
      metadataJson: metadata ?? null,
    });
    return this.journalsRepo.save(entry);
  }
}
