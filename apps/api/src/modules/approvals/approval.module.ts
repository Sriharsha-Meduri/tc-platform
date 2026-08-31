import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApprovalRequestEntity } from './entities/approval-request.entity';
import { TransactionPartyEntity } from '../transaction-parties/entities/transaction-party.entity';
import { TransactionEntity } from '../transactions/entities/transaction.entity';
import { TransactionDocumentEntity } from '../transaction-documents/entities/transaction-document.entity';
import { TransactionMessageEntity } from '../transaction-messages/entities/transaction-message.entity';
import { AuthModule } from '../auth/auth.module';
import { AccountsModule } from '../accounts/accounts.module';
import { DocuSignModule } from '../docusign/docusign.module';
import { ApprovalService } from './approval.service';
import { ApprovalController } from './approval.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([ApprovalRequestEntity, TransactionPartyEntity, TransactionEntity, TransactionDocumentEntity, TransactionMessageEntity]),
    AuthModule,
    AccountsModule,
    DocuSignModule,
  ],
  controllers: [ApprovalController],
  providers: [ApprovalService],
  exports: [ApprovalService],
})
export class ApprovalModule {}
