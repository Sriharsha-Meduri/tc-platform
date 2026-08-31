import '../env'; // MUST be first — loads .env.{APP_ENV} before TypeORM config is read
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { UserEntity } from '../modules/users/entities/user.entity';
import { AccountEntity } from '../modules/accounts/entities/account.entity';
import { OrganizationEntity } from '../modules/organizations/entities/organization.entity';
import { OrganizationMembershipEntity } from '../modules/organizations/entities/organization-membership.entity';
import { TransactionEntity } from '../modules/transactions/entities/transaction.entity';
import { TransactionStageInstanceEntity } from '../modules/transactions/entities/transaction-stage-instance.entity';
import { ContactEntity } from '../modules/contacts/entities/contact.entity';
import { TransactionPartyEntity } from '../modules/transaction-parties/entities/transaction-party.entity';
import { TransactionJournalEntity } from '../modules/transaction-journals/entities/transaction-journal.entity';
import { TransactionMessageEntity } from '../modules/transaction-messages/entities/transaction-message.entity';
import { TransactionDocumentEntity } from '../modules/transaction-documents/entities/transaction-document.entity';
import { TransactionDocumentSubmissionEntity } from '../modules/transaction-documents/entities/transaction-document-submission.entity';
import { TransactionTaskEntity } from '../modules/transaction-tasks/entities/transaction-task.entity';
import { TransactionEventEntity } from '../modules/transaction-events/entities/transaction-event.entity';
import { AiInteractionEntity } from '../modules/ai-interactions/entities/ai-interaction.entity';
import { TransactionWorkflowTemplateEntity } from '../modules/transaction-workflow-templates/entities/transaction-workflow-template.entity';
import { TransactionWorkflowTemplateStepEntity } from '../modules/transaction-workflow-templates/entities/transaction-workflow-template-step.entity';
import { TransactionWorkflowStepEntity } from '../modules/transaction-workflow-steps/entities/transaction-workflow-step.entity';
import { TransactionFormTemplateEntity } from '../modules/transaction-form-templates/entities/transaction-form-template.entity';
import { TransactionFormTemplateItemEntity } from '../modules/transaction-form-templates/entities/transaction-form-template-item.entity';
import { TransactionAccessGrantEntity } from '../modules/transaction-access-grants/entities/transaction-access-grant.entity';
import { AuditLogEntity } from '../modules/audit-log/audit-log.entity';
import { ExtractionJobEntity } from '../modules/document-extraction/entities/extraction-job.entity';
import { PendingUploadEntity } from '../modules/document-extraction/entities/pending-upload.entity';
import { CustomReminderEntity } from '../modules/reminders/entities/custom-reminder.entity';
import { DocuSignEnvelopeEntity } from '../modules/docusign/entities/docusign-envelope.entity';
import { DocuSignConnectionEntity } from '../modules/docusign/entities/docusign-connection.entity';
import { SharedFieldCoordinateEntity } from '../modules/docusign/entities/shared-field-coordinate.entity';
import { ApprovalRequestEntity } from '../modules/approvals/entities/approval-request.entity';
import { RepairRequestEntity } from '../modules/repair-requests/entities/repair-request.entity';
import { VerificationOfPropertyEntity } from '../modules/verification-of-property/entities/verification-of-property.entity';
import { TitleContactEntity } from '../modules/title-contacts/entities/title-contact.entity';
import { EscrowContactEntity } from '../modules/escrow-contacts/entities/escrow-contact.entity';
import { HomeWarrantyContactEntity } from '../modules/home-warranty-contacts/entities/home-warranty-contact.entity';
import { UploadLinkEntity } from '../modules/upload-links/entities/upload-link.entity';

// Neon and other hosted providers supply a single DATABASE_URL.
// Fall back to individual vars for local Docker dev.
const dbConnection = process.env.DATABASE_URL
  ? {
      url: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    }
  : {
      host:     process.env.DB_HOST     ?? 'localhost',
      port:     parseInt(process.env.DB_PORT ?? '5432'),
      username: process.env.DB_USER     ?? 'tc',
      password: process.env.DB_PASSWORD ?? 'tc_dev',
      database: process.env.DB_NAME     ?? 'tc',
    };

// Production runs compiled JS; local/dev use ts-node with TS source directly.
const migrations = process.env.NODE_ENV === 'production'
  ? ['dist/database/migrations/*.js']
  : ['src/database/migrations/*.ts'];

export const AppDataSource = new DataSource({
  type: 'postgres',
  ...dbConnection,
  entities: [
    UserEntity,
    AccountEntity,
    OrganizationEntity,
    OrganizationMembershipEntity,
    TransactionEntity,
    TransactionStageInstanceEntity,
    ContactEntity,
    TransactionPartyEntity,
    TransactionJournalEntity,
    TransactionMessageEntity,
    TransactionDocumentEntity,
    TransactionDocumentSubmissionEntity,
    TransactionTaskEntity,
    TransactionEventEntity,
    AiInteractionEntity,
    TransactionWorkflowTemplateEntity,
    TransactionWorkflowTemplateStepEntity,
    TransactionWorkflowStepEntity,
    TransactionFormTemplateEntity,
    TransactionFormTemplateItemEntity,
    TransactionAccessGrantEntity,
    AuditLogEntity,
    ExtractionJobEntity,
    PendingUploadEntity,
    CustomReminderEntity,
    DocuSignEnvelopeEntity,
    DocuSignConnectionEntity,
    SharedFieldCoordinateEntity,
    ApprovalRequestEntity,
    RepairRequestEntity,
    VerificationOfPropertyEntity,
    TitleContactEntity,
    EscrowContactEntity,
    HomeWarrantyContactEntity,
    UploadLinkEntity,
  ],
  migrations,
  synchronize: false,
  logging: process.env.APP_ENV !== 'production',
});
