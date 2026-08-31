import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TransactionPartyEntity } from './entities/transaction-party.entity';
import { CreateTransactionPartyInput } from './dto/create-transaction-party.input';
import { UpdateTransactionPartyInput } from './dto/update-transaction-party.input';

@Injectable()
export class TransactionPartiesService {
  constructor(
    @InjectRepository(TransactionPartyEntity)
    private readonly partiesRepo: Repository<TransactionPartyEntity>,
  ) {}

  findByTransaction(transactionId: string): Promise<TransactionPartyEntity[]> {
    return this.partiesRepo.find({ where: { transactionId } });
  }

  findAgentsAndCoordinators(): Promise<TransactionPartyEntity[]> {
    return this.partiesRepo
      .createQueryBuilder('p')
      .innerJoinAndSelect('p.transaction', 'tx')
      .where('p.party_role IN (:...roles)', {
        roles: [
          'buyer_agent', 'buyer_agent_representative',
          'seller_agent', 'seller_agent_representative',
          'buyer_transaction_coordinator', 'seller_transaction_coordinator',
        ],
      })
      .orderBy('tx.transaction_number', 'ASC')
      .addOrderBy('p.party_role', 'ASC')
      .getMany();
  }

  async findOne(id: string): Promise<TransactionPartyEntity> {
    const party = await this.partiesRepo.findOne({ where: { id } });
    if (!party) throw new NotFoundException(`TransactionParty ${id} not found`);
    return party;
  }

  async create(dto: CreateTransactionPartyInput): Promise<TransactionPartyEntity> {
    const party = this.partiesRepo.create({
      transactionId: dto.transactionId,
      partyRole: dto.partyRole,
      displayName: dto.displayName,
      email: dto.email ?? null,
      phone: dto.phone ?? null,
      contactId: dto.contactId ?? null,
      organizationId: dto.organizationId ?? null,
      isPrimary: dto.isPrimary ?? false,
    });
    return this.partiesRepo.save(party);
  }

  async update(id: string, dto: UpdateTransactionPartyInput): Promise<TransactionPartyEntity> {
    const party = await this.findOne(id);
    Object.assign(party, dto);
    return this.partiesRepo.save(party);
  }

  async remove(id: string): Promise<void> {
    const party = await this.findOne(id);
    await this.partiesRepo.remove(party);
  }
}
