import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransactionJournalEntity } from './entities/transaction-journal.entity';
import { TransactionJournalsService } from './transaction-journals.service';

@Module({
  imports: [TypeOrmModule.forFeature([TransactionJournalEntity])],
  providers: [TransactionJournalsService],
  exports: [TransactionJournalsService],
})
export class TransactionJournalsModule {}
