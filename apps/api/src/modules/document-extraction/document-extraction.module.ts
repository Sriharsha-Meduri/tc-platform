import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DocumentExtractionController } from './document-extraction.controller';
import { DisclosureAnalysisController } from './disclosure-analysis.controller';
import { ExtractionJobStore } from './extraction-job.store';
import { ExtractionJobEntity } from './entities/extraction-job.entity';
import { PendingUploadEntity } from './entities/pending-upload.entity';
import { TransactionPartyEntity } from '../transaction-parties/entities/transaction-party.entity';
import { TransactionMessageEntity } from '../transaction-messages/entities/transaction-message.entity';
import { PendingUploadsService } from './pending-uploads.service';
import { StageReasoningService } from './stage-reasoning.service';
import { DocumentPipelineModule } from './document-pipeline.module';
import { AiInteractionsModule } from '../ai-interactions/ai-interactions.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { StorageModule } from '../storage/storage.module';
import { TransactionDocumentsModule } from '../transaction-documents/transaction-documents.module';
import { AuthModule } from '../auth/auth.module';
import { AccountsModule } from '../accounts/accounts.module';
import { RepairRequestsModule } from '../repair-requests/repair-requests.module';
import { VerificationOfPropertyModule } from '../verification-of-property/verification-of-property.module';

@Module({
  imports: [
    DocumentPipelineModule, AiInteractionsModule, TransactionsModule, StorageModule,
    TransactionDocumentsModule, AuthModule, AccountsModule, RepairRequestsModule, VerificationOfPropertyModule,
    TypeOrmModule.forFeature([ExtractionJobEntity, PendingUploadEntity, TransactionPartyEntity, TransactionMessageEntity]),
  ],
  controllers: [DocumentExtractionController, DisclosureAnalysisController],
  providers: [
    ExtractionJobStore,
    StageReasoningService,
    PendingUploadsService,
  ],
  exports: [
    DocumentPipelineModule,
    StageReasoningService,
  ],
})
export class DocumentExtractionModule {}
