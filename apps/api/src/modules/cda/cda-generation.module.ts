import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransactionPartyEntity } from '../transaction-parties/entities/transaction-party.entity';
import { TransactionContactInformationModule } from '../transaction-contact-information/transaction-contact-information.module';
import { TransactionDocumentsModule } from '../transaction-documents/transaction-documents.module';
import { StorageModule } from '../storage/storage.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { CdaGenerationService } from './cda-generation.service';

/**
 * Deliberately its own module (not folded into TransactionContactInformationModule)
 * since it depends on TransactionDocumentsModule and StorageModule, which
 * TransactionContactInformationModule does not — keeping those dependencies out of
 * the smaller, more-widely-imported module avoids widening its own dependency surface.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([TransactionPartyEntity]),
    TransactionContactInformationModule,
    TransactionDocumentsModule,
    StorageModule,
    AuditLogModule,
  ],
  providers: [CdaGenerationService],
  exports: [CdaGenerationService],
})
export class CdaGenerationModule {}
