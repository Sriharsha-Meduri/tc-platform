import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SellerSideInformationEntity } from './entities/seller-side-information.entity';
import { upsertWithDiff, UpsertDiffResult } from './upsert-diff.util';

export interface SellerSideInformationInput {
  preferredEscrowCompany?: string | null;
  preferredTitleCompany?: string | null;
  titleContactName?: string | null;
  titleContactEmail?: string | null;
  titleContactPhone?: string | null;
  sellerAgentCommission?: number | null;
  homeWarrantyCompany?: string | null;
  sellerPaysHomeWarranty?: boolean | null;
  nhdCompany?: string | null;
}

@Injectable()
export class SellerSideInformationService {
  constructor(
    @InjectRepository(SellerSideInformationEntity)
    private readonly repo: Repository<SellerSideInformationEntity>,
  ) {}

  async findByTransaction(transactionId: string): Promise<SellerSideInformationEntity | null> {
    return this.repo.findOne({ where: { transactionId } });
  }

  async upsert(
    transactionId: string,
    input: SellerSideInformationInput,
  ): Promise<UpsertDiffResult<SellerSideInformationEntity>> {
    return upsertWithDiff(this.repo, transactionId, input as Partial<SellerSideInformationEntity>);
  }
}
