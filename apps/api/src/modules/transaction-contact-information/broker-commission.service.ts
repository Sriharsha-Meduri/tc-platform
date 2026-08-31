import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BuyerBrokerCommissionEntity, CommissionType } from './entities/buyer-broker-commission.entity';
import { upsertWithDiff, UpsertDiffResult } from './upsert-diff.util';

export interface BrokerCommissionInput {
  commissionType?: CommissionType | null;
  commissionValue?: number | null;
  brokerageName?: string | null;
  notes?: string | null;
}

@Injectable()
export class BrokerCommissionService {
  constructor(
    @InjectRepository(BuyerBrokerCommissionEntity)
    private readonly repo: Repository<BuyerBrokerCommissionEntity>,
  ) {}

  async findByTransaction(transactionId: string): Promise<BuyerBrokerCommissionEntity | null> {
    return this.repo.findOne({ where: { transactionId } });
  }

  async upsert(transactionId: string, input: BrokerCommissionInput): Promise<UpsertDiffResult<BuyerBrokerCommissionEntity>> {
    return upsertWithDiff(this.repo, transactionId, input as Partial<BuyerBrokerCommissionEntity>);
  }
}
