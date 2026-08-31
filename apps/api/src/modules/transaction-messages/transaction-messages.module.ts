import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransactionMessageEntity } from './entities/transaction-message.entity';
import { TransactionMessagesService } from './transaction-messages.service';
import { TransactionMessagesController } from './transaction-messages.controller';
import { TransactionMessagesResolver } from './transaction-messages.resolver';

@Module({
  imports: [TypeOrmModule.forFeature([TransactionMessageEntity])],
  controllers: [TransactionMessagesController],
  providers: [TransactionMessagesResolver, TransactionMessagesService],
  exports: [TransactionMessagesService],
})
export class TransactionMessagesModule {}
