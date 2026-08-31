import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LenderInformationEntity } from './entities/lender-information.entity';
import { EscrowInformationEntity } from './entities/escrow-information.entity';
import { HoaInformationEntity } from './entities/hoa-information.entity';
import { BuyerBrokerCommissionEntity } from './entities/buyer-broker-commission.entity';
import { BuyerSideInformationEntity } from './entities/buyer-side-information.entity';
import { BrokerInformationEntity } from './entities/broker-information.entity';
import { LenderInformationService } from './lender-information.service';
import { EscrowInformationService } from './escrow-information.service';
import { HoaInformationService } from './hoa-information.service';
import { BrokerCommissionService } from './broker-commission.service';
import { BuyerSideInformationService } from './buyer-side-information.service';
import { BrokerInformationService } from './broker-information.service';
import { ExternalTransactionInformationService } from './external-transaction-information.service';
import { TransactionDocumentsModule } from '../transaction-documents/transaction-documents.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { TransactionFormTemplatesModule } from '../transaction-form-templates/transaction-form-templates.module';

/**
 * Reusable, per-concern "transaction contact information" module — deliberately does not
 * import UploadLinksModule or depend on UploadLinkService. ExternalTransactionInformationService
 * takes an already-resolved UploadLinkEntity/TransactionEntity as plain parameters instead of a
 * raw token; the caller (UploadLinkController, which already has UploadLinkService from
 * UploadLinksModule) does the token validation and passes the result in. This lets
 * UploadLinksModule import this module one-directionally with no circularity, mirroring that
 * module's own "no forwardRef needed" conventions.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([LenderInformationEntity, EscrowInformationEntity, HoaInformationEntity, BuyerBrokerCommissionEntity, BuyerSideInformationEntity, BrokerInformationEntity]),
    TransactionDocumentsModule,
    AuditLogModule,
    TransactionFormTemplatesModule,
  ],
  providers: [
    LenderInformationService,
    EscrowInformationService,
    HoaInformationService,
    BrokerCommissionService,
    BuyerSideInformationService,
    BrokerInformationService,
    ExternalTransactionInformationService,
  ],
  exports: [ExternalTransactionInformationService, EscrowInformationService, LenderInformationService, HoaInformationService, BrokerCommissionService, BuyerSideInformationService, BrokerInformationService],
})
export class TransactionContactInformationModule {}
