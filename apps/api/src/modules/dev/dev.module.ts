import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DevController } from './dev.controller';
import { DevSeedService } from './dev-seed.service';
import { TransactionEntity } from '../transactions/entities/transaction.entity';
import { TransactionStageInstanceEntity } from '../transactions/entities/transaction-stage-instance.entity';
import { TransactionPartyEntity } from '../transaction-parties/entities/transaction-party.entity';
import { TransactionDocumentEntity } from '../transaction-documents/entities/transaction-document.entity';
import { OrganizationEntity } from '../organizations/entities/organization.entity';
import { AccountEntity } from '../accounts/entities/account.entity';
import { TransactionClockModule } from '../transaction-clock/transaction-clock.module';
import { DocuSignModule } from '../docusign/docusign.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TransactionEntity,
      TransactionStageInstanceEntity,
      TransactionPartyEntity,
      TransactionDocumentEntity,
      OrganizationEntity,
      AccountEntity,
    ]),
    TransactionClockModule,
    DocuSignModule,
  ],
  controllers: [DevController],
  providers: [DevSeedService],
})
export class DevModule {}
