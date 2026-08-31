import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransactionDocumentEntity } from './entities/transaction-document.entity';
import { TransactionDocumentSubmissionEntity } from './entities/transaction-document-submission.entity';
import { TransactionEntity } from '../transactions/entities/transaction.entity';
import { TransactionDocumentsService } from './transaction-documents.service';
import { TransactionDocumentsController } from './transaction-documents.controller';
import { TransactionDocumentsResolver } from './transaction-documents.resolver';
import { StorageModule } from '../storage/storage.module';
import { AccountsModule } from '../accounts/accounts.module';
import { TransactionAuthorizationModule } from '../transaction-authorization/transaction-authorization.module';
import { BlockerOverridesModule } from '../blocker-overrides/blocker-overrides.module';

/**
 * Registers TransactionEntity's repo directly (rather than importing
 * TransactionsModule) so document access-checking can resolve the owning
 * transaction without creating a cycle — TransactionsModule already
 * transitively depends on this module via TransactionFormTemplatesModule/
 * UploadLinksModule.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([TransactionDocumentEntity, TransactionDocumentSubmissionEntity, TransactionEntity]),
    StorageModule,
    AccountsModule,
    TransactionAuthorizationModule,
    BlockerOverridesModule,
  ],
  controllers: [TransactionDocumentsController],
  providers: [TransactionDocumentsResolver, TransactionDocumentsService],
  exports: [TransactionDocumentsService],
})
export class TransactionDocumentsModule {}
