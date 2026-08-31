import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransactionFormTemplateEntity } from './entities/transaction-form-template.entity';
import { TransactionFormTemplateItemEntity } from './entities/transaction-form-template-item.entity';
import { TransactionFormTemplatesService } from './transaction-form-templates.service';
import { TransactionFormTemplatesController } from './transaction-form-templates.controller';
import { AccountsModule } from '../accounts/accounts.module';
import { OrganizationMembershipEntity } from '../organizations/entities/organization-membership.entity';
import { TransactionDocumentsModule } from '../transaction-documents/transaction-documents.module';
import { TransactionDocumentEntity } from '../transaction-documents/entities/transaction-document.entity';
import { TransactionClockModule } from '../transaction-clock/transaction-clock.module';
import { HoaInformationEntity } from '../transaction-contact-information/entities/hoa-information.entity';
import { BlockerOverridesModule } from '../blocker-overrides/blocker-overrides.module';
import { FinalTermsService } from '../transactions/final-terms.service';

/**
 * Registers HoaInformationEntity for direct repo access (the Escrow checklist's
 * conditional "HOA Documents" item needs to read hasHoa) rather than importing
 * TransactionContactInformationModule — that module already imports this one
 * (for ExternalTransactionInformationService's checklist calls), so importing
 * it back here would be circular.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      TransactionFormTemplateEntity,
      TransactionFormTemplateItemEntity,
      OrganizationMembershipEntity,
      TransactionDocumentEntity,
      HoaInformationEntity,
    ]),
    AccountsModule,
    TransactionDocumentsModule,
    TransactionClockModule,
    BlockerOverridesModule,
  ],
  controllers: [TransactionFormTemplatesController],
  providers: [TransactionFormTemplatesService, FinalTermsService],
  exports: [TransactionFormTemplatesService],
})
export class TransactionFormTemplatesModule {}
