import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BuyerSideInformationEntity, BuyerCommissionType } from './entities/buyer-side-information.entity';
import { upsertWithDiff, UpsertDiffResult } from './upsert-diff.util';

export interface BuyerSideInformationInput {
  brokerageName?: string | null;
  brokerFullName?: string | null;
  brokerEmail?: string | null;
  /** The mailing/payment address used for commission disbursement and CDA-related workflows. */
  buyerAgentPaymentAddress?: string | null;
  clientCredits?: number | null;
  buyerCommissionType?: BuyerCommissionType | null;
  buyerCommissionValue?: number | null;
  /**
   * Server-calculated by ExternalTransactionInformationService before this
   * input reaches upsert — never accepted directly from a client request
   * body (SaveTransactionInformationDto has no grossCommission field; see
   * ExternalTransactionInformationService.saveTransactionInformation).
   */
  grossCommission?: number | null;
}

@Injectable()
export class BuyerSideInformationService {
  constructor(
    @InjectRepository(BuyerSideInformationEntity)
    private readonly repo: Repository<BuyerSideInformationEntity>,
  ) {}

  async findByTransaction(transactionId: string): Promise<BuyerSideInformationEntity | null> {
    return this.repo.findOne({ where: { transactionId } });
  }

  async upsert(transactionId: string, input: BuyerSideInformationInput): Promise<UpsertDiffResult<BuyerSideInformationEntity>> {
    return upsertWithDiff(this.repo, transactionId, input as Partial<BuyerSideInformationEntity>);
  }
}
