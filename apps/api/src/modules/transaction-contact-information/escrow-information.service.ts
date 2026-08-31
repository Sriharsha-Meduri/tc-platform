import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EscrowInformationEntity } from './entities/escrow-information.entity';
import { upsertWithDiff, UpsertDiffResult } from './upsert-diff.util';

export interface EscrowInformationInput {
  escrowContactName?: string | null;
  escrowEmail?: string | null;
  escrowNumber?: string | null;
  willSendDocumentsToBuyer?: boolean | null;
}

@Injectable()
export class EscrowInformationService {
  constructor(
    @InjectRepository(EscrowInformationEntity)
    private readonly repo: Repository<EscrowInformationEntity>,
  ) {}

  async findByTransaction(transactionId: string): Promise<EscrowInformationEntity | null> {
    return this.repo.findOne({ where: { transactionId } });
  }

  async upsert(transactionId: string, input: EscrowInformationInput): Promise<UpsertDiffResult<EscrowInformationEntity>> {
    return upsertWithDiff(this.repo, transactionId, input as Partial<EscrowInformationEntity>);
  }
}
