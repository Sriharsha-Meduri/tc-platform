import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DEADLINE_REMINDER_QUEUE } from './reminder.constants';
import { ReminderProcessor } from './reminder.processor';
import { ReminderController } from './reminder.controller';
import { ReminderSchedulerService } from './reminder-scheduler.service';
import { ContingencyRemovalReminderSchedulerService } from './contingency-removal-reminder-scheduler.service';
import { VerificationOfPropertyReminderSchedulerService } from './verification-of-property-reminder-scheduler.service';
import { SellerSideDocumentReminderSchedulerService } from './seller-side-document-reminder-scheduler.service';
import { NoticeToPerformReminderSchedulerService } from './notice-to-perform-reminder-scheduler.service';
import { TransactionEventReminderEntity } from './entities/transaction-event-reminder.entity';
import { CustomReminderEntity } from './entities/custom-reminder.entity';
import { ContingencyRemovalReminderEntity } from './entities/contingency-removal-reminder.entity';
import { VerificationOfPropertyReminderEntity } from './entities/verification-of-property-reminder.entity';
import { SellerSideDocumentReminderEntity } from './entities/seller-side-document-reminder.entity';
import { NoticeToPerformReminderEntity } from './entities/notice-to-perform-reminder.entity';
import { TransactionEntity } from '../transactions/entities/transaction.entity';
import { TransactionPartyEntity } from '../transaction-parties/entities/transaction-party.entity';
import { TransactionMessageEntity } from '../transaction-messages/entities/transaction-message.entity';
import { TransactionEventEntity } from '../transaction-events/entities/transaction-event.entity';
import { TransactionDocumentEntity } from '../transaction-documents/entities/transaction-document.entity';
import { UploadLinkEntity } from '../upload-links/entities/upload-link.entity';
import { UploadLinkRepository } from '../upload-links/upload-link.repository';
import { AuthModule } from '../auth/auth.module';
import { TransactionClockModule } from '../transaction-clock/transaction-clock.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { TransactionFormTemplatesModule } from '../transaction-form-templates/transaction-form-templates.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: DEADLINE_REMINDER_QUEUE }),
    TypeOrmModule.forFeature([
      TransactionEventReminderEntity,
      CustomReminderEntity,
      ContingencyRemovalReminderEntity,
      VerificationOfPropertyReminderEntity,
      SellerSideDocumentReminderEntity,
      NoticeToPerformReminderEntity,
      TransactionEntity,
      TransactionPartyEntity,
      TransactionMessageEntity,
      TransactionEventEntity,
      TransactionDocumentEntity,
      UploadLinkEntity,
    ]),
    AuthModule,
    TransactionClockModule,
    AuditLogModule,
    // TransactionFormTemplatesModule has no import path back to ReminderModule (or
    // UploadLinksModule) anywhere in its own dependency graph — confirmed safe, no cycle.
    // Needed so SellerSideDocumentReminderSchedulerService can resolve the required CAR-form
    // items for a transaction without duplicating that resolution logic here.
    TransactionFormTemplatesModule,
  ],
  controllers: [ReminderController],
  providers: [
    ReminderProcessor,
    ReminderSchedulerService,
    ContingencyRemovalReminderSchedulerService,
    VerificationOfPropertyReminderSchedulerService,
    SellerSideDocumentReminderSchedulerService,
    NoticeToPerformReminderSchedulerService,
    // UploadLinkRepository has no dependency on UploadLinksModule's own providers — just the
    // UploadLinkEntity repo already registered above — so it can be provided here directly,
    // giving the reminder processor a way to regenerate a link's token without ReminderModule
    // importing UploadLinksModule (which would create a circular module dependency, since
    // UploadLinksModule already imports ReminderModule).
    UploadLinkRepository,
  ],
  exports: [
    ReminderSchedulerService,
    ContingencyRemovalReminderSchedulerService,
    VerificationOfPropertyReminderSchedulerService,
    SellerSideDocumentReminderSchedulerService,
    NoticeToPerformReminderSchedulerService,
  ],
})
export class ReminderModule {}
