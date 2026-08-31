import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RepairRequestEntity } from './entities/repair-request.entity';
import { RepairRequestsService } from './repair-requests.service';
import { RepairRequestsController } from './repair-requests.controller';
import { TransactionDocumentEntity } from '../transaction-documents/entities/transaction-document.entity';
import { TransactionEntity } from '../transactions/entities/transaction.entity';
import { TransactionPartyEntity } from '../transaction-parties/entities/transaction-party.entity';
import { TransactionMessageEntity } from '../transaction-messages/entities/transaction-message.entity';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { DocuSignModule } from '../docusign/docusign.module';
import { ApprovalModule } from '../approvals/approval.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      RepairRequestEntity,
      TransactionDocumentEntity,
      TransactionEntity,
      TransactionPartyEntity,
      TransactionMessageEntity,
    ]),
    AuditLogModule,
    DocuSignModule,
    ApprovalModule,
    AuthModule,
  ],
  controllers: [RepairRequestsController],
  providers: [RepairRequestsService],
  exports: [RepairRequestsService],
})
export class RepairRequestsModule {}
