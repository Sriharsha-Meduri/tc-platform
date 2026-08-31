import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransactionTaskEntity } from './entities/transaction-task.entity';

@Module({
  imports: [TypeOrmModule.forFeature([TransactionTaskEntity])],
  exports: [TypeOrmModule],
})
export class TransactionTasksModule {}
