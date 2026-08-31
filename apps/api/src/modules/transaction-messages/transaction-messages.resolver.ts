import { Resolver, Query, Mutation, Args } from '@nestjs/graphql';
import { TransactionMessagesService } from './transaction-messages.service';
import { TransactionMessageEntity, MessageStatus } from './entities/transaction-message.entity';
import { CreateTransactionMessageInput } from './dto/create-transaction-message.input';

@Resolver(() => TransactionMessageEntity)
export class TransactionMessagesResolver {
  constructor(private readonly transactionMessagesService: TransactionMessagesService) {}

  @Query(() => [TransactionMessageEntity], { name: 'messagesByTransaction' })
  findByTransaction(@Args('transactionId') transactionId: string) {
    return this.transactionMessagesService.findByTransaction(transactionId);
  }

  @Query(() => [TransactionMessageEntity], { name: 'messagesByThread' })
  findByThread(@Args('threadKey') threadKey: string) {
    return this.transactionMessagesService.findByThread(threadKey);
  }

  @Query(() => TransactionMessageEntity, { name: 'message' })
  findOne(@Args('id') id: string) {
    return this.transactionMessagesService.findOne(id);
  }

  @Mutation(() => TransactionMessageEntity)
  createMessage(@Args('input') input: CreateTransactionMessageInput) {
    return this.transactionMessagesService.create(input);
  }

  @Mutation(() => TransactionMessageEntity)
  updateMessageStatus(
    @Args('id') id: string,
    @Args('status', { type: () => MessageStatus }) status: MessageStatus,
  ) {
    return this.transactionMessagesService.updateStatus(id, status);
  }
}
