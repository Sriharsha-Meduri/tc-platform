import { Resolver, Query, Mutation, Args } from '@nestjs/graphql';
import { TransactionPartiesService } from './transaction-parties.service';
import { TransactionPartyEntity } from './entities/transaction-party.entity';
import { CreateTransactionPartyInput } from './dto/create-transaction-party.input';
import { UpdateTransactionPartyInput } from './dto/update-transaction-party.input';

@Resolver(() => TransactionPartyEntity)
export class TransactionPartiesResolver {
  constructor(private readonly transactionPartiesService: TransactionPartiesService) {}

  @Query(() => [TransactionPartyEntity], { name: 'transactionParties' })
  findByTransaction(@Args('transactionId') transactionId: string) {
    return this.transactionPartiesService.findByTransaction(transactionId);
  }

  @Query(() => TransactionPartyEntity, { name: 'transactionParty' })
  findOne(@Args('id') id: string) {
    return this.transactionPartiesService.findOne(id);
  }

  @Mutation(() => TransactionPartyEntity)
  createTransactionParty(@Args('input') input: CreateTransactionPartyInput) {
    return this.transactionPartiesService.create(input);
  }

  @Mutation(() => TransactionPartyEntity)
  updateTransactionParty(@Args('id') id: string, @Args('input') input: UpdateTransactionPartyInput) {
    return this.transactionPartiesService.update(id, input);
  }

  @Mutation(() => Boolean)
  async removeTransactionParty(@Args('id') id: string) {
    await this.transactionPartiesService.remove(id);
    return true;
  }
}
