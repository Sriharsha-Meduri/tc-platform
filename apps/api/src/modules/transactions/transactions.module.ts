import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransactionEntity } from './entities/transaction.entity';
import { TransactionStageInstanceEntity } from './entities/transaction-stage-instance.entity';
import { TransactionsService } from './transactions.service';
import { TransactionStageInstancesService } from './transaction-stage-instances.service';
import { TransactionsController } from './transactions.controller';
import { TransactionsResolver } from './transactions.resolver';
import { TransactionDraftService } from './transaction-draft.service';
import { ContractSubmissionService } from './contract-submission.service';
import { EventSeederService } from './event-seeder.service';
import { FinalTermsService } from './final-terms.service';
import { TransactionWelcomeEmailService } from './transaction-welcome-email.service';
import { EscrowOpeningEmailService } from './escrow-opening-email.service';
import { VoidNotifyService } from './void-notify.service';
import { ContactEntity } from '../contacts/entities/contact.entity';
import { TransactionPartyEntity } from '../transaction-parties/entities/transaction-party.entity';
import { TransactionDocumentEntity } from '../transaction-documents/entities/transaction-document.entity';
import { TransactionDocumentSubmissionEntity } from '../transaction-documents/entities/transaction-document-submission.entity';
import { TransactionMessageEntity } from '../transaction-messages/entities/transaction-message.entity';
import { TransactionEventEntity } from '../transaction-events/entities/transaction-event.entity';
import { TransactionJournalEntity } from '../transaction-journals/entities/transaction-journal.entity';
import { TransactionWorkflowStepsModule } from '../transaction-workflow-steps/transaction-workflow-steps.module';
import { AuthModule } from '../auth/auth.module';
import { AccountsModule } from '../accounts/accounts.module';
import { ReminderModule } from '../reminders/reminder.module';
import { TransactionClockModule } from '../transaction-clock/transaction-clock.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { TransactionAccessGrantsModule } from '../transaction-access-grants/transaction-access-grants.module';
import { TransactionFormTemplatesModule } from '../transaction-form-templates/transaction-form-templates.module';
import { UploadLinksModule } from '../upload-links/upload-links.module';
import { BlockerOverridesModule } from '../blocker-overrides/blocker-overrides.module';
import { TransactionContactInformationModule } from '../transaction-contact-information/transaction-contact-information.module';
import { CdaGenerationModule } from '../cda/cda-generation.module';

import { OrganizationMembershipEntity } from '../organizations/entities/organization-membership.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TransactionEntity,
      TransactionStageInstanceEntity,
      ContactEntity,
      TransactionPartyEntity,
      TransactionDocumentEntity,
      TransactionDocumentSubmissionEntity,
      TransactionMessageEntity,
      TransactionEventEntity,
      TransactionJournalEntity,
      OrganizationMembershipEntity,
    ]),
    TransactionWorkflowStepsModule,
    AuthModule,
    AccountsModule,
    ReminderModule,
    TransactionClockModule,
    AuditLogModule,
    TransactionAccessGrantsModule,
    TransactionFormTemplatesModule,
    UploadLinksModule,
    BlockerOverridesModule,
    TransactionContactInformationModule,
    CdaGenerationModule,
  ],
  controllers: [TransactionsController],
  providers: [TransactionsResolver, TransactionsService, TransactionStageInstancesService, TransactionDraftService, ContractSubmissionService, EventSeederService, TransactionWelcomeEmailService, EscrowOpeningEmailService, VoidNotifyService, FinalTermsService],
  exports: [TransactionsService, TransactionStageInstancesService, TransactionDraftService, ContractSubmissionService, EventSeederService, TransactionWelcomeEmailService, EscrowOpeningEmailService, VoidNotifyService, FinalTermsService],
})
export class TransactionsModule {}
