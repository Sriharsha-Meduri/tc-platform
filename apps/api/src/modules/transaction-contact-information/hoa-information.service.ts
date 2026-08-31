import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HoaInformationEntity } from './entities/hoa-information.entity';
import { upsertWithDiff, UpsertDiffResult } from './upsert-diff.util';

export interface HoaInformationInput {
  hasHoa?: boolean | null;
}

@Injectable()
export class HoaInformationService {
  constructor(
    @InjectRepository(HoaInformationEntity)
    private readonly repo: Repository<HoaInformationEntity>,
  ) {}

  async findByTransaction(transactionId: string): Promise<HoaInformationEntity | null> {
    return this.repo.findOne({ where: { transactionId } });
  }

  async upsert(transactionId: string, input: HoaInformationInput): Promise<UpsertDiffResult<HoaInformationEntity>> {
    return upsertWithDiff(this.repo, transactionId, input as Partial<HoaInformationEntity>);
  }
}
