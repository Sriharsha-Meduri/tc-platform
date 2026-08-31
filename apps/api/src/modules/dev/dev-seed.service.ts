import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  TransactionEntity,
  TransactionStatus,
  TransactionType,
  TransactionSide,
} from '../transactions/entities/transaction.entity';
import {
  TransactionStageInstanceEntity,
  TransactionStage,
  StageInstanceStatus,
} from '../transactions/entities/transaction-stage-instance.entity';
import { TransactionPartyEntity, PartyRole } from '../transaction-parties/entities/transaction-party.entity';
import { TransactionDocumentEntity, DocumentStatus } from '../transaction-documents/entities/transaction-document.entity';
import { OrganizationEntity } from '../organizations/entities/organization.entity';
import { AccountEntity } from '../accounts/entities/account.entity';
import { TransactionClockService } from '../transaction-clock/transaction-clock.service';
import { buildOutboundEmailAddress } from '../transactions/transaction-draft.service';
import { SeedTransactionPayload, SeedTransactionResult } from './dev-seed.dto';

@Injectable()
export class DevSeedService {
  private readonly logger = new Logger(DevSeedService.name);

  constructor(
    @InjectRepository(TransactionEntity)
    private readonly txRepo: Repository<TransactionEntity>,

    @InjectRepository(TransactionPartyEntity)
    private readonly partiesRepo: Repository<TransactionPartyEntity>,

    @InjectRepository(TransactionDocumentEntity)
    private readonly docsRepo: Repository<TransactionDocumentEntity>,

    @InjectRepository(OrganizationEntity)
    private readonly orgsRepo: Repository<OrganizationEntity>,

    @InjectRepository(AccountEntity)
    private readonly accountsRepo: Repository<AccountEntity>,

    @InjectRepository(TransactionStageInstanceEntity)
    private readonly stageRepo: Repository<TransactionStageInstanceEntity>,

    private readonly clockService: TransactionClockService,
  ) {}

  async seed(payload: SeedTransactionPayload): Promise<SeedTransactionResult> {
    const { transaction: txDto, contract, parties = [] } = payload;

    // ── 1. Resolve default org and account ────────────────────────────────────
    const [org] = await this.orgsRepo.find({ order: { createdAt: 'ASC' }, take: 1 });
    if (!org) throw new Error('No organization found — run seeds first (pnpm --filter @tc/api seed)');

    const [account] = await this.accountsRepo.find({ order: { createdAt: 'ASC' }, take: 1 });
    if (!account) throw new Error('No account found — run seeds first');

    // ── 2. Normalise enums ────────────────────────────────────────────────────
    const txType = this.resolveType(txDto.type);
    const txSide = this.resolveSide(txDto.side);
    const prop   = txDto.property;

    // ── 3. Create transaction as DRAFT ────────────────────────────────────────
    const txNumber = this.generateNumber();
    const tx = await this.txRepo.save(
      this.txRepo.create({
        organizationId:       org.id,
        transactionNumber:    txNumber,
        transactionType:      txType,
        side:                 txSide,
        status:               TransactionStatus.DRAFT,
        propertyAddressLine1: prop.addressLine1,
        propertyCity:         prop.city,
        propertyState:        prop.state,
        propertyPostalCode:   prop.postalCode   ?? null,
        propertyCounty:       prop.county        ?? null,
        contractPrice:        prop.contractPrice ?? null,
        earnestMoneyAmount:   prop.earnestMoney  ?? null,
        offerAcceptedAt:      new Date(contract.acceptanceDate),
        closeOfEscrowAt:      new Date(contract.closingDate),
        createdByAccountId:   account.id,
        outboundEmailAddress: buildOutboundEmailAddress(org.id, prop.addressLine1, prop.postalCode),
      }),
    );

    this.logger.log(`[dev-seed] Created DRAFT transaction ${txNumber} (${tx.id})`);

    // ── 3b. Create initial CONTRACT stage instance ────────────────────────────
    await this.stageRepo.save(
      this.stageRepo.create({
        transactionId: tx.id,
        stage:         TransactionStage.CONTRACT,
        status:        StageInstanceStatus.ACTIVE,
        startedAt:     new Date(),
      }),
    );

    // ── 4. Create parties ─────────────────────────────────────────────────────
    for (const p of parties) {
      await this.partiesRepo.save(
        this.partiesRepo.create({
          transactionId: tx.id,
          partyRole:     p.role as PartyRole,
          displayName:   p.displayName,
          email:         p.email,
          phone:         p.phone ?? null,
        }),
      );
    }

    // ── 5. Create clock settings (real time — no virtual offset) ──────────────
    await this.clockService.createForTransaction(tx.id, prop.state);

    // ── 6. Synthetic document with extraction metadata ────────────────────────
    // EventSeederService.seedFromExtraction reads metadataJson.extraction.
    // This document is created so that when the user clicks "Initialize Workflow",
    // events and reminders are seeded automatically from these dates.
    await this.docsRepo.save(
      this.docsRepo.create({
        transactionId: tx.id,
        documentType:  'purchase_agreement',
        title:         'Purchase Agreement (seeded)',
        fileName:      'seed-contract.pdf',
        mimeType:      'application/pdf',
        status:        DocumentStatus.UPLOADED,
        metadataJson:  {
          extraction: {
            transaction: {
              offerDate:      null,
              acceptanceDate: contract.acceptanceDate,
              closingDate:    contract.closingDate,
              possessionDate: contract.closingDate,
            },
            contractTerms: {
              disclosuresDueDays:        contract.disclosuresDueDays        ?? null,
              inspectionContingencyDays: contract.inspectionContingencyDays ?? null,
              appraisalContingencyDays:  contract.appraisalContingencyDays  ?? null,
              loanContingencyDays:       contract.loanContingencyDays       ?? null,
            },
          },
        },
      }),
    );

    return {
      transactionId:     tx.id,
      transactionNumber: txNumber,
      status:            'draft',
      nextStep:          `Open /dashboard/transactions/${tx.id} → click "Initialize Workflow"`,
    };
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private generateNumber(): string {
    const year   = new Date().getFullYear();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `TXN-${year}-${random}`;
  }

  private resolveType(raw?: string): TransactionType {
    const map: Record<string, TransactionType> = {
      purchase: TransactionType.PURCHASE,
      sale:     TransactionType.SALE,
      lease:    TransactionType.LEASE,
    };
    return map[raw?.toLowerCase() ?? ''] ?? TransactionType.PURCHASE;
  }

  private resolveSide(raw?: string): TransactionSide {
    const map: Record<string, TransactionSide> = {
      buyer:  TransactionSide.BUYER_SIDE,
      seller: TransactionSide.SELLER_SIDE,
      dual:   TransactionSide.DUAL,
    };
    return map[raw?.toLowerCase() ?? ''] ?? TransactionSide.BUYER_SIDE;
  }
}
