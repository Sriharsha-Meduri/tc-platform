import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BrokerInformationEntity, BrokerCommissionType } from './entities/broker-information.entity';
import { upsertWithDiff, UpsertDiffResult } from './upsert-diff.util';

export interface BrokerInformationInput {
  brokerPaymentAddress?: string | null;
  brokerCommissionType?: BrokerCommissionType | null;
  brokerCommissionValue?: number | null;
  /**
   * Server-calculated by ExternalTransactionInformationService before this
   * input reaches upsert — never accepted directly from a client request
   * body (SaveTransactionInformationDto has no brokerCommissionAmount
   * field; see ExternalTransactionInformationService.calculateBrokerSplit).
   */
  brokerCommissionAmount?: number | null;
  buyerAgentCommissionAmount?: number | null;
}

@Injectable()
export class BrokerInformationService {
  constructor(
    @InjectRepository(BrokerInformationEntity)
    private readonly repo: Repository<BrokerInformationEntity>,
  ) {}

  async findByTransaction(transactionId: string): Promise<BrokerInformationEntity | null> {
    return this.repo.findOne({ where: { transactionId } });
  }

  async upsert(transactionId: string, input: BrokerInformationInput): Promise<UpsertDiffResult<BrokerInformationEntity>> {
    return upsertWithDiff(this.repo, transactionId, input as Partial<BrokerInformationEntity>);
  }
}
