import { Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransactionEntity } from '../transactions/entities/transaction.entity';
import { TransactionsModule } from '../transactions/transactions.module';
import { UploadLinksModule } from '../upload-links/upload-links.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { AccountsModule } from '../accounts/accounts.module';
import { AdminTestingController } from './admin-testing.controller';
import { AdminTestOrchestratorService } from './admin-test-orchestrator.service';
import { AdminTestRunStore } from './admin-test-run.store';
import { TestDocumentProvisioningService } from './test-document-provisioning.service';
import { ExternalApiMockInterceptor } from './external-api-mock-interceptor';

/**
 * Admin Buyer Transaction Test Center — only registered outside production
 * (see app.module.ts: `...(process.env.APP_ENV !== 'production' ? [AdminTestingModule] : [])`).
 * AdminTestingController additionally carries a NonProductionGuard for
 * defense-in-depth in case this module were ever accidentally imported
 * unconditionally elsewhere.
 *
 * Never reimplements business logic. Every action in this module drives the
 * exact same injectable services the real controllers use — ContractSubmissionService,
 * ExternalDocumentUploadService, UploadLinkService, etc — imported here via
 * TransactionsModule/UploadLinksModule's already-exported providers (some of
 * those exports were deliberately widened for this module; see the doc
 * comments on UploadLinksModule and DocuSignModule). Only the two external
 * SaaS boundaries (DocuSign, Mailgun) are ever swapped for a mock, via
 * ExternalApiMockInterceptor's AsyncLocalStorage-scoped fetch wrapper — never
 * a parallel/fake implementation of any myTC domain logic.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([TransactionEntity]),
    TransactionsModule,
    UploadLinksModule,
    OrganizationsModule,
    AccountsModule,
  ],
  controllers: [AdminTestingController],
  providers: [AdminTestOrchestratorService, AdminTestRunStore, TestDocumentProvisioningService, ExternalApiMockInterceptor],
})
export class AdminTestingModule implements OnModuleInit {
  constructor(private readonly mockInterceptor: ExternalApiMockInterceptor) {}

  onModuleInit(): void {
    this.mockInterceptor.install();
  }
}
