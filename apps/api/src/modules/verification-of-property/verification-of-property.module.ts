import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VerificationOfPropertyEntity } from './entities/verification-of-property.entity';
import { VerificationOfPropertyService } from './verification-of-property.service';
import { VerificationOfPropertyController } from './verification-of-property.controller';
import { TransactionEntity } from '../transactions/entities/transaction.entity';
import { TransactionPartyEntity } from '../transaction-parties/entities/transaction-party.entity';
import { TransactionMessageEntity } from '../transaction-messages/entities/transaction-message.entity';
import { TransactionDocumentEntity } from '../transaction-documents/entities/transaction-document.entity';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { DocuSignModule } from '../docusign/docusign.module';
import { AuthModule } from '../auth/auth.module';
import { TransactionsModule } from '../transactions/transactions.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      VerificationOfPropertyEntity,
      TransactionEntity,
      TransactionPartyEntity,
      TransactionMessageEntity,
      TransactionDocumentEntity,
    ]),
    AuditLogModule,
    DocuSignModule,
    AuthModule,
    TransactionsModule,
  ],
  controllers: [VerificationOfPropertyController],
  providers: [VerificationOfPropertyService],
  exports: [VerificationOfPropertyService],
})
export class VerificationOfPropertyModule {}
