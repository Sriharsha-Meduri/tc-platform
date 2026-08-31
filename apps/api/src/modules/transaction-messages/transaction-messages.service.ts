import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TransactionMessageEntity, MessageStatus } from './entities/transaction-message.entity';
import { CreateTransactionMessageInput } from './dto/create-transaction-message.input';

@Injectable()
export class TransactionMessagesService {
  constructor(
    @InjectRepository(TransactionMessageEntity)
    private readonly messagesRepo: Repository<TransactionMessageEntity>,
  ) {}

  findByTransaction(transactionId: string): Promise<TransactionMessageEntity[]> {
    return this.messagesRepo.find({ where: { transactionId }, order: { createdAt: 'DESC' } });
  }

  findByThread(threadKey: string): Promise<TransactionMessageEntity[]> {
    return this.messagesRepo.find({ where: { threadKey }, order: { createdAt: 'ASC' } });
  }

  findByProviderMessageId(providerMessageId: string): Promise<TransactionMessageEntity[]> {
    return this.messagesRepo.find({
      where: { providerMessageId },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<TransactionMessageEntity> {
    const msg = await this.messagesRepo.findOne({ where: { id } });
    if (!msg) throw new NotFoundException(`TransactionMessage ${id} not found`);
    return msg;
  }

  async create(dto: CreateTransactionMessageInput): Promise<TransactionMessageEntity> {
    const msg = this.messagesRepo.create({
      transactionId: dto.transactionId,
      channel: dto.channel,
      direction: dto.direction,
      subject: dto.subject ?? null,
      bodyText: dto.bodyText ?? null,
      senderPartyId: dto.senderPartyId ?? null,
      recipientPartyId: dto.recipientPartyId ?? null,
      providerName: dto.providerName ?? null,
      providerMessageId: dto.providerMessageId ?? null,
      providerThreadId: dto.providerThreadId ?? null,
      threadKey: dto.threadKey ?? null,
      sentAt: dto.sentAt ? new Date(dto.sentAt) : null,
      receivedAt: dto.receivedAt ? new Date(dto.receivedAt) : null,
      stage: dto.stage ?? null,
      metadataJson: dto.metadataJson ? JSON.parse(dto.metadataJson) : null,
    });
    return this.messagesRepo.save(msg);
  }

  async updateStatus(id: string, status: MessageStatus): Promise<TransactionMessageEntity> {
    const msg = await this.findOne(id);
    msg.status = status;
    return this.messagesRepo.save(msg);
  }

  async remove(id: string): Promise<void> {
    const msg = await this.findOne(id);
    await this.messagesRepo.remove(msg);
  }

  async patchMetadataJson(id: string, patch: Record<string, unknown>): Promise<void> {
    const msg = await this.messagesRepo.findOne({ where: { id } });
    if (!msg) return;
    const current = (msg.metadataJson as Record<string, unknown>) ?? {};
    msg.metadataJson = { ...current, ...patch };
    await this.messagesRepo.save(msg);
  }
}
