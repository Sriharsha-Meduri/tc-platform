import { Resolver, Query, Mutation, Args } from '@nestjs/graphql';
import { TransactionsService } from './transactions.service';
import { TransactionEntity, TransactionStatus } from './entities/transaction.entity';
import { CreateTransactionInput } from './dto/create-transaction.input';
import { UpdateTransactionInput } from './dto/update-transaction.input';

@Resolver(() => TransactionEntity)
export class TransactionsResolver {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Query(() => [TransactionEntity], { name: 'transactions' })
  findAll() {
    return this.transactionsService.findAll();
  }

  @Query(() => TransactionEntity, { name: 'transaction' })
  findOne(@Args('id') id: string) {
    return this.transactionsService.findOne(id);
  }

  @Query(() => [TransactionEntity], { name: 'transactionsByOrganization' })
  findByOrganization(@Args('organizationId') organizationId: string) {
    return this.transactionsService.findByOrganization(organizationId);
  }

  @Mutation(() => TransactionEntity)
  createTransaction(@Args('input') input: CreateTransactionInput) {
    return this.transactionsService.create(input);
  }

  @Mutation(() => TransactionEntity)
  updateTransaction(@Args('id') id: string, @Args('input') input: UpdateTransactionInput) {
    return this.transactionsService.update(id, input);
  }

  @Mutation(() => TransactionEntity)
  updateTransactionStatus(
    @Args('id') id: string,
    @Args('status', { type: () => TransactionStatus }) status: TransactionStatus,
  ) {
    return this.transactionsService.updateStatus(id, status);
  }

}
