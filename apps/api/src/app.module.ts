import { Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { join } from 'path';
import { AdminModule } from './admin/admin.module';
import { ReminderModule } from './modules/reminders/reminder.module';
import { UsersModule } from './modules/users/users.module';
import { AccountsModule } from './modules/accounts/accounts.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { TransactionsModule } from './modules/transactions/transactions.module';
import { TransactionPartiesModule } from './modules/transaction-parties/transaction-parties.module';
import { TransactionJournalsModule } from './modules/transaction-journals/transaction-journals.module';
import { TransactionMessagesModule } from './modules/transaction-messages/transaction-messages.module';
import { TransactionDocumentsModule } from './modules/transaction-documents/transaction-documents.module';
import { TransactionTasksModule } from './modules/transaction-tasks/transaction-tasks.module';
import { AiInteractionsModule } from './modules/ai-interactions/ai-interactions.module';
import { DocumentExtractionModule } from './modules/document-extraction/document-extraction.module';
import { AuthModule } from './modules/auth/auth.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { TransactionWorkflowStepsModule } from './modules/transaction-workflow-steps/transaction-workflow-steps.module';
import { TransactionFormTemplatesModule } from './modules/transaction-form-templates/transaction-form-templates.module';
import { TransactionAccessGrantsModule } from './modules/transaction-access-grants/transaction-access-grants.module';
import { AuditLogModule } from './modules/audit-log/audit-log.module';
import { DocuSignModule } from './modules/docusign/docusign.module';
import { BlockerOverridesModule } from './modules/blocker-overrides/blocker-overrides.module';
import { ApprovalModule } from './modules/approvals/approval.module';
import { RepairRequestsModule } from './modules/repair-requests/repair-requests.module';
import { VerificationOfPropertyModule } from './modules/verification-of-property/verification-of-property.module';
import { TitleContactsModule } from './modules/title-contacts/title-contacts.module';
import { EscrowContactsModule } from './modules/escrow-contacts/escrow-contacts.module';
import { HomeWarrantyContactsModule } from './modules/home-warranty-contacts/home-warranty-contacts.module';
import { UploadLinksModule } from './modules/upload-links/upload-links.module';
import { TransactionAuthorizationModule } from './modules/transaction-authorization/transaction-authorization.module';
import { TransactionWorkspaceModule } from './modules/transaction-workspace/transaction-workspace.module';
import { DevModule } from './modules/dev/dev.module';
import { AdminTestingModule } from './modules/admin-testing/admin-testing.module';

@Module({
  imports: [
    // ── Bull / Redis (Upstash) ────────────────────────────────────────────────
    BullModule.forRootAsync({
      useFactory: () => {
        const redisUrl = process.env.REDIS_URL;
        if (!redisUrl) {
          return { redis: { host: 'localhost', port: 6379 } };
        }
        // Parse rediss:// URL — Upstash uses TLS on port 6379
        const url = new URL(redisUrl);
        return {
          redis: {
            host: url.hostname,
            port: parseInt(url.port || '6379'),
            password: url.password,
            tls: url.protocol === 'rediss:' ? {} : undefined,
          },
          settings: {
            stalledInterval: 300_000,
            guardInterval: 300_000,
          },
          defaultJobOptions: {
            removeOnComplete: true,
            removeOnFail: 50,
          },
        };
      },
    }),

    // ── Scheduling ─────────────────────────────────────────────────────────
    ScheduleModule.forRoot(),

    // ── Rate limiting (applied selectively via @Throttle on public routes) ───
    ThrottlerModule.forRoot([{
      ttl: 60_000,
      limit: 20,
    }]),

    // ── Database ─────────────────────────────────────────────────────────────
    TypeOrmModule.forRoot({
      type: 'postgres',
      // Neon / hosted Postgres supplies a single URL; local Docker uses individual vars.
      ...(process.env.DATABASE_URL
        ? { url: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } }
        : {
            host:     process.env.DB_HOST     ?? 'localhost',
            port:     parseInt(process.env.DB_PORT ?? '5432'),
            username: process.env.DB_USER     ?? 'tc',
            password: process.env.DB_PASSWORD ?? 'tc_dev',
            database: process.env.DB_NAME     ?? 'tc',
          }),
      autoLoadEntities: true,
      migrations: [join(__dirname, 'database', 'migrations', '*{.ts,.js}')],
      migrationsRun: process.env.APP_ENV !== 'dev',
      synchronize: false,
      logging: process.env.APP_ENV === 'local',
    }),

    // ── GraphQL ───────────────────────────────────────────────────────────────
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: join(process.cwd(), 'src/schema.gql'),
      sortSchema: true,
      playground: process.env.NODE_ENV !== 'production',
    }),

    // ── Feature modules ───────────────────────────────────────────────────────
    AuthModule,
    UsersModule,
    AccountsModule,
    OrganizationsModule,
    TransactionsModule,
    TransactionPartiesModule,
    TransactionJournalsModule,
    TransactionMessagesModule,
    TransactionDocumentsModule,
    TransactionTasksModule,
    AiInteractionsModule,
    DocumentExtractionModule,
    TransactionWorkflowStepsModule,
    TransactionFormTemplatesModule,
    TransactionAccessGrantsModule,

    // ── Audit Log ─────────────────────────────────────────────────────────────
    AuditLogModule,

    // ── eSignature (DocuSign) ─────────────────────────────────────────────────
    DocuSignModule,

    // ── Centralized compliance-blocker overrides ─────────────────────────────
    BlockerOverridesModule,

    // ── Approvals ──────────────────────────────────────────────────────────────
    ApprovalModule,

    // ── Repair Requests ─────────────────────────────────────────────────────
    RepairRequestsModule,

    // ── Verification of Property ──────────────────────────────────────────────
    VerificationOfPropertyModule,

    // ── Title Contacts ────────────────────────────────────────────────────────
    TitleContactsModule,

    // ── Escrow Contacts ──────────────────────────────────────────────────────
    EscrowContactsModule,

    // ── Home Warranty Contacts ──────────────────────────────────────────────
    HomeWarrantyContactsModule,

    // ── Secure document-upload links ──────────────────────────────────────────
    UploadLinksModule,

    // ── Reusable per-transaction authorization ──────────────────────────────
    TransactionAuthorizationModule,

    // ── Simplified post-Draft swimlane ───────────────────────────────────────
    TransactionWorkspaceModule,

    // ── Reminders ─────────────────────────────────────────────────────────────
    ReminderModule,

    // ── Webhooks ──────────────────────────────────────────────────────────────
    WebhooksModule,

    // ── Admin UI ──────────────────────────────────────────────────────────────
    AdminModule,

    // ── Dev / testing — not registered in production ──────────────────────────
    ...(process.env.APP_ENV !== 'production' ? [DevModule, AdminTestingModule] : []),
  ],
})
export class AppModule {}
