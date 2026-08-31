import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const multer = require('multer') as typeof import('multer');
import { TransactionEntity } from '../transactions/entities/transaction.entity';
import { TransactionPartyEntity } from '../transaction-parties/entities/transaction-party.entity';
import { TransactionStageInstanceEntity } from '../transactions/entities/transaction-stage-instance.entity';
import { TransactionMessagesModule } from '../transaction-messages/transaction-messages.module';
import { TransactionJournalsModule } from '../transaction-journals/transaction-journals.module';
import { TransactionDocumentsModule } from '../transaction-documents/transaction-documents.module';
import { DocumentExtractionModule } from '../document-extraction/document-extraction.module';
import { RepairRequestsModule } from '../repair-requests/repair-requests.module';
import { VerificationOfPropertyModule } from '../verification-of-property/verification-of-property.module';
import { MailgunWebhookController } from './mailgun/mailgun-webhook.controller';
import { MailgunWebhookGuard } from './mailgun/mailgun-webhook.guard';
import { MailgunWebhookService } from './mailgun/mailgun-webhook.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([TransactionEntity, TransactionPartyEntity, TransactionStageInstanceEntity]),
    TransactionMessagesModule,
    TransactionJournalsModule,
    TransactionDocumentsModule,
    DocumentExtractionModule,
    RepairRequestsModule,
    VerificationOfPropertyModule,
  ],
  controllers: [MailgunWebhookController],
  providers: [MailgunWebhookGuard, MailgunWebhookService],
})
export class WebhooksModule implements NestModule {
  /**
   * Apply multer as express middleware so the multipart/form-data body is
   * parsed BEFORE guards run. memoryStorage + any() accepts both fields and
   * file attachments (PDFs forwarded by Mailgun as attachment-1, attachment-2…).
   */
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(multer({ storage: multer.memoryStorage() }).any())
      .forRoutes('webhooks/email/inbound');
  }
}
