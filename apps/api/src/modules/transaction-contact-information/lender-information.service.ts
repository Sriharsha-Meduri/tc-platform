import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LenderInformationEntity } from './entities/lender-information.entity';
import { upsertWithDiff, UpsertDiffResult } from './upsert-diff.util';

export interface LenderInformationInput {
  lenderName?: string | null;
  lenderEmail?: string | null;
}

@Injectable()
export class LenderInformationService {
  constructor(
    @InjectRepository(LenderInformationEntity)
    private readonly repo: Repository<LenderInformationEntity>,
  ) {}

  async findByTransaction(transactionId: string): Promise<LenderInformationEntity | null> {
    return this.repo.findOne({ where: { transactionId } });
  }

  async upsert(transactionId: string, input: LenderInformationInput): Promise<UpsertDiffResult<LenderInformationEntity>> {
    return upsertWithDiff(this.repo, transactionId, input as Partial<LenderInformationEntity>);
  }
}
