import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrganizationMembershipEntity } from '../organizations/entities/organization-membership.entity';
import { TransactionPartyEntity } from '../transaction-parties/entities/transaction-party.entity';
import { AccountsModule } from '../accounts/accounts.module';
import { TransactionAccessGrantsModule } from '../transaction-access-grants/transaction-access-grants.module';
import { TransactionAccessService } from './transaction-access.service';

/**
 * A standalone leaf module (only entity registrations + AccountsModule +
 * TransactionAccessGrantsModule, both themselves leaves) so any module —
 * including ones TransactionsModule already transitively depends on, like
 * TransactionDocumentsModule — can import this one-directionally with no
 * circularity risk.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([OrganizationMembershipEntity, TransactionPartyEntity]),
    AccountsModule,
    TransactionAccessGrantsModule,
  ],
  providers: [TransactionAccessService],
  exports: [TransactionAccessService],
})
export class TransactionAuthorizationModule {}
