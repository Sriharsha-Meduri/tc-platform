import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransactionEntity } from '../transactions/entities/transaction.entity';
import { TransactionPartyEntity } from '../transaction-parties/entities/transaction-party.entity';
import { TransactionDocumentEntity } from '../transaction-documents/entities/transaction-document.entity';
import { TransactionMessageEntity } from '../transaction-messages/entities/transaction-message.entity';
import { DocuSignEnvelopeEntity } from '../docusign/entities/docusign-envelope.entity';
import { UploadLinkEntity } from '../upload-links/entities/upload-link.entity';
import { AccountsModule } from '../accounts/accounts.module';
import { TransactionAuthorizationModule } from '../transaction-authorization/transaction-authorization.module';
import { TransactionFormTemplatesModule } from '../transaction-form-templates/transaction-form-templates.module';
import { TransactionContactInformationModule } from '../transaction-contact-information/transaction-contact-information.module';
import { BlockerOverridesModule } from '../blocker-overrides/blocker-overrides.module';
import { CdaGenerationModule } from '../cda/cda-generation.module';
import { UploadLinksModule } from '../upload-links/upload-links.module';
import { TransactionDocumentsModule } from '../transaction-documents/transaction-documents.module';
import { TransactionWorkspaceService } from './transaction-workspace.service';
import { TransactionWorkspaceController } from './transaction-workspace.controller';

/**
 * The backend for the simplified post-Draft swimlane. Registers its own
 * entity repos directly (rather than importing TransactionsModule /
 * TransactionPartiesModule) — this is a brand new leaf-ward module, so it's
 * free to depend on any of those, but keeping it to direct entity
 * registrations avoids any question of transitive-cycle risk as this module
 * grows across phases. UploadLinksModule/CdaGenerationModule/
 * TransactionDocumentsModule are imported so the per-side checklist,
 * CDA/signed-CDA, and visibility-scoped document data are the exact same
 * data sources the external upload-link pages use — see
 * ChecklistCompositionService's own doc comment on this point. No cycle: nothing
 * imports TransactionWorkspaceModule except AppModule.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      TransactionEntity, TransactionPartyEntity, TransactionDocumentEntity,
      TransactionMessageEntity, DocuSignEnvelopeEntity, UploadLinkEntity,
    ]),
    AccountsModule,
    TransactionAuthorizationModule,
    TransactionFormTemplatesModule,
    TransactionContactInformationModule,
    BlockerOverridesModule,
    CdaGenerationModule,
    UploadLinksModule,
    TransactionDocumentsModule,
  ],
  controllers: [TransactionWorkspaceController],
  providers: [TransactionWorkspaceService],
  exports: [TransactionWorkspaceService],
})
export class TransactionWorkspaceModule {}
