import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DocuSignEnvelopeEntity } from './entities/docusign-envelope.entity';
import { DocuSignConnectionEntity } from './entities/docusign-connection.entity';
import { SharedFieldCoordinateEntity } from './entities/shared-field-coordinate.entity';
import { TransactionDocumentEntity } from '../transaction-documents/entities/transaction-document.entity';
import { TransactionEntity } from '../transactions/entities/transaction.entity';
import { TransactionPartyEntity } from '../transaction-parties/entities/transaction-party.entity';
import { TransactionMessageEntity } from '../transaction-messages/entities/transaction-message.entity';
import { TransactionFormTemplateEntity } from '../transaction-form-templates/entities/transaction-form-template.entity';
import { TransactionFormTemplateItemEntity } from '../transaction-form-templates/entities/transaction-form-template-item.entity';
import { UploadLinkEntity } from '../upload-links/entities/upload-link.entity';
import { AccountsModule } from '../accounts/accounts.module';
import { AuthModule } from '../auth/auth.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { StorageModule } from '../storage/storage.module';
import { TransactionContactInformationModule } from '../transaction-contact-information/transaction-contact-information.module';
import { DocumentPipelineModule } from '../document-extraction/document-pipeline.module';
import { DocuSignService } from './docusign.service';
import { DocuSignOAuthService } from './docusign-oauth.service';
import { FieldAnalysisService } from './field-analysis.service';
import { SignatureLineDetectorService } from './signature-line-detector.service';
import { SharedCoordinatesService } from './shared-coordinates.service';
import { RecipientResolverService } from './recipient-resolver.service';
import { PdfRenderService } from './pdf-render.service';
import { SignedDocumentNotificationService } from './signed-document-notification.service';
import { VpSignedEscrowNotificationService } from './vp-signed-escrow-notification.service';
import { UploadLinkRepository } from '../upload-links/upload-link.repository';
import { DocuSignController } from './docusign.controller';
import { DocuSignWebhookController } from './docusign-webhook.controller';
import { DocuSignWebhookGuard } from './docusign-webhook.guard';

/**
 * VpSignedEscrowNotificationService + UploadLinkRepository are registered
 * here (rather than importing UploadLinksModule, which would be circular —
 * UploadLinksModule already imports this module for its own
 * VerificationOfPropertyBrokerDocusignService) — see
 * VpSignedEscrowNotificationService's own doc comment for the full rationale.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      DocuSignEnvelopeEntity,
      TransactionDocumentEntity,
      TransactionEntity,
      TransactionPartyEntity,
      TransactionMessageEntity,
      TransactionFormTemplateEntity,
      TransactionFormTemplateItemEntity,
      UploadLinkEntity,
      DocuSignConnectionEntity,
      SharedFieldCoordinateEntity,
    ]),
    StorageModule,
    AccountsModule,
    AuthModule,
    AuditLogModule,
    TransactionContactInformationModule,
    DocumentPipelineModule,
  ],
  controllers: [DocuSignController, DocuSignWebhookController],
  providers: [
    DocuSignService, DocuSignOAuthService, FieldAnalysisService, SignatureLineDetectorService,
    SharedCoordinatesService, RecipientResolverService, PdfRenderService,
    SignedDocumentNotificationService, VpSignedEscrowNotificationService, UploadLinkRepository,
    DocuSignWebhookGuard,
  ],
  exports: [
    DocuSignService, DocuSignOAuthService, FieldAnalysisService, SignatureLineDetectorService, SharedCoordinatesService, RecipientResolverService, PdfRenderService,
    VpSignedEscrowNotificationService,
  ],
})
export class DocuSignModule {}
