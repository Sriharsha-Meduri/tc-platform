import { Resolver, Query, Mutation, Args } from '@nestjs/graphql';
import { AccountsService } from './accounts.service';
import { AccountEntity } from './entities/account.entity';
import { CreateAccountInput } from './dto/create-account.input';
import { UpdateAccountInput } from './dto/update-account.input';

@Resolver(() => AccountEntity)
export class AccountsResolver {
  constructor(private readonly accountsService: AccountsService) {}

  @Query(() => [AccountEntity], { name: 'accounts' })
  findAll() {
    return this.accountsService.findAll();
  }

  @Query(() => AccountEntity, { name: 'account' })
  findOne(@Args('id') id: string) {
    return this.accountsService.findOne(id);
  }

  @Query(() => AccountEntity, { name: 'accountByUserId', nullable: true })
  findByUserId(@Args('userId') userId: string) {
    return this.accountsService.findByUserId(userId);
  }

  @Mutation(() => AccountEntity)
  createAccount(@Args('input') input: CreateAccountInput) {
    return this.accountsService.create(input);
  }

  @Mutation(() => AccountEntity)
  updateAccount(@Args('id') id: string, @Args('input') input: UpdateAccountInput) {
    return this.accountsService.update(id, input);
  }
}
