import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransactionAccessGrantEntity } from './entities/transaction-access-grant.entity';
import { TransactionAccessGrantsService } from './transaction-access-grants.service';
import { TransactionAccessGrantsController } from './transaction-access-grants.controller';
import { AccountsModule } from '../accounts/accounts.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([TransactionAccessGrantEntity]),
    AccountsModule,
  ],
  controllers: [TransactionAccessGrantsController],
  providers: [TransactionAccessGrantsService],
  exports: [TransactionAccessGrantsService],
})
export class TransactionAccessGrantsModule {}
