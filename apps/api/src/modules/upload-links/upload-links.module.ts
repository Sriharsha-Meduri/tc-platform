import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UploadLinkEntity } from './entities/upload-link.entity';
import { TransactionEntity } from '../transactions/entities/transaction.entity';
import { TransactionPartyEntity } from '../transaction-parties/entities/transaction-party.entity';
import { TransactionMessageEntity } from '../transaction-messages/entities/transaction-message.entity';
import { DocuSignEnvelopeEntity } from '../docusign/entities/docusign-envelope.entity';
import { StorageModule } from '../storage/storage.module';
import { TransactionDocumentsModule } from '../transaction-documents/transaction-documents.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { AccountsModule } from '../accounts/accounts.module';
import { AuthModule } from '../auth/auth.module';
import { DocumentPipelineModule } from '../document-extraction/document-pipeline.module';
import { TransactionContactInformationModule } from '../transaction-contact-information/transaction-contact-information.module';
import { TransactionFormTemplatesModule } from '../transaction-form-templates/transaction-form-templates.module';
import { DocuSignModule } from '../docusign/docusign.module';
import { ReminderModule } from '../reminders/reminder.module';
import { BlockerOverridesModule } from '../blocker-overrides/blocker-overrides.module';
import { UploadLinkRepository } from './upload-link.repository';
import { UploadLinkService } from './upload-link.service';
import { UploadLinkEmailService } from './upload-link-email.service';
import { FileValidationService } from './file-validation.service';
import { TransactionDocumentStorageService } from './transaction-document-storage.service';
import { UploadAuditService } from './upload-audit.service';
import { ExternalDocumentUploadService } from './external-document-upload.service';
import { SellerAgentDocusignService } from './seller-agent-docusign.service';
import { SellerAgentDocumentDocusignService } from './seller-agent-document-docusign.service';
import { BuyerAgentChecklistValidationService } from './buyer-agent-checklist-validation.service';
import { UploadLinkController } from './upload-link.controller';
import { EscrowOnboardingService } from '../escrow-onboarding/escrow-onboarding.service';
import { EscrowOnboardingController } from '../escrow-onboarding/escrow-onboarding.controller';
import { BrokerOnboardingService } from '../broker-onboarding/broker-onboarding.service';
import { CdaGenerationModule } from '../cda/cda-generation.module';
import { CdaNotificationService } from '../cda-notification/cda-notification.service';
import { SignedCdaUploadService } from '../signed-cda-upload/signed-cda-upload.service';
import { ChecklistCompositionService } from './checklist-composition.service';
import { VerificationOfPropertyBrokerDocusignService } from './verification-of-property-broker-docusign.service';
import { TransactionCompletionService } from './transaction-completion.service';

/**
 * Deliberately does NOT import TransactionsModule — it only needs direct repo
 * access (registered above via TypeOrmModule.forFeature), so TransactionsModule
 * can import this module one-directionally with no forwardRef circularity.
 *
 * EscrowOnboardingService/Controller are registered directly here (not their
 * own module) so UploadLinkController can inject EscrowOnboardingService to
 * auto-trigger the escrow welcome email right after a successful Seller
 * Agent escrow-info save — that dependency would otherwise be circular,
 * since EscrowOnboardingService itself needs UploadLinkService/UploadLinkEmailService.
 * BrokerOnboardingService is registered here for the identical reason, for the
 * Buyer Agent's broker-info save. CdaNotificationService is registered here for
 * the same circularity reason too — it needs UploadLinkService/UploadLinkEmailService,
 * SignedCdaUploadService is registered here for the identical reason, for the
 * Broker's signed-CDA upload — it needs UploadLinkService/FileValidationService.
 * and is called both from UploadLinkController (this module) and from
 * TransactionsService (which already imports this module).
 * VerificationOfPropertyBrokerDocusignService is registered here for the same
 * circularity reason — it needs UploadLinkService/UploadLinkEmailService, and
 * is called from ExternalDocumentUploadService (also this module) right after
 * a VP document uploaded through the Buyer Agent Upload Link passes validation.
 *
 * ChecklistCompositionService is exported (not just provided) so
 * TransactionWorkspaceModule can import this module and call the exact same
 * checklist-plus-enrichment composition the external upload-link pages use —
 * the internal myTC swimlane's single source of truth for "the exact checklist
 * shown on the upload-link page," never a separate reimplementation.
 *
 * ExternalDocumentUploadService, BrokerOnboardingService, EscrowOnboardingService,
 * VerificationOfPropertyBrokerDocusignService, and SignedCdaUploadService are
 * additionally exported (widened from provider-only) so the Admin Buyer
 * Transaction Test Center (`apps/api/src/modules/admin-testing/`) can drive
 * the exact same document-upload/info-save/DocuSign/signed-CDA-upload logic
 * the real upload-link pages use — no reimplementation there either.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([UploadLinkEntity, TransactionEntity, TransactionPartyEntity, TransactionMessageEntity, DocuSignEnvelopeEntity]),
    StorageModule,
    TransactionDocumentsModule,
    AuditLogModule,
    AccountsModule,
    AuthModule,
    DocumentPipelineModule,
    TransactionContactInformationModule,
    TransactionFormTemplatesModule,
    DocuSignModule,
    ReminderModule,
    BlockerOverridesModule,
    CdaGenerationModule,
  ],
  controllers: [UploadLinkController, EscrowOnboardingController],
  providers: [
    UploadLinkRepository,
    UploadLinkService,
    UploadLinkEmailService,
    FileValidationService,
    TransactionDocumentStorageService,
    UploadAuditService,
    ExternalDocumentUploadService,
    SellerAgentDocusignService,
    SellerAgentDocumentDocusignService,
    BuyerAgentChecklistValidationService,
    EscrowOnboardingService,
    BrokerOnboardingService,
    CdaNotificationService,
    SignedCdaUploadService,
    ChecklistCompositionService,
    VerificationOfPropertyBrokerDocusignService,
    TransactionCompletionService,
  ],
  exports: [
    UploadLinkService, UploadLinkEmailService, CdaNotificationService, ChecklistCompositionService, TransactionCompletionService,
    ExternalDocumentUploadService, BrokerOnboardingService, EscrowOnboardingService, VerificationOfPropertyBrokerDocusignService, SignedCdaUploadService,
  ],
})
export class UploadLinksModule {}
