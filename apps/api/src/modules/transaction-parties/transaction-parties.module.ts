import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransactionPartyEntity } from './entities/transaction-party.entity';
import { TransactionPartiesService } from './transaction-parties.service';
import { TransactionPartiesController } from './transaction-parties.controller';
import { TransactionPartiesResolver } from './transaction-parties.resolver';

@Module({
  imports: [TypeOrmModule.forFeature([TransactionPartyEntity])],
  controllers: [TransactionPartiesController],
  providers: [TransactionPartiesResolver, TransactionPartiesService],
  exports: [TransactionPartiesService],
})
export class TransactionPartiesModule {}
