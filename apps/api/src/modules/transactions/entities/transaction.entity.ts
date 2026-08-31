import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn, OneToMany, Index,
} from 'typeorm';
import { ObjectType, Field, ID, Float, Int, registerEnumType, HideField } from '@nestjs/graphql';
import { OrganizationEntity } from '../../organizations/entities/organization.entity';
import { AccountEntity } from '../../accounts/entities/account.entity';
import { TransactionFormTemplateEntity } from '../../transaction-form-templates/entities/transaction-form-template.entity';
import { TransactionPartyEntity } from '../../transaction-parties/entities/transaction-party.entity';
import { TransactionTaskEntity } from '../../transaction-tasks/entities/transaction-task.entity';
import { TransactionEventEntity } from '../../transaction-events/entities/transaction-event.entity';
import { TransactionJournalEntity } from '../../transaction-journals/entities/transaction-journal.entity';
import { TransactionMessageEntity } from '../../transaction-messages/entities/transaction-message.entity';
import { TransactionDocumentEntity } from '../../transaction-documents/entities/transaction-document.entity';
import { TransactionStageInstanceEntity } from './transaction-stage-instance.entity';
import { RepairRequestEntity } from '../../repair-requests/entities/repair-request.entity';

export enum TransactionType {
  PURCHASE = 'purchase',
  SALE     = 'sale',
  LEASE    = 'lease',
}
export enum TransactionSide {
  BUYER_SIDE  = 'buyer_side',
  SELLER_SIDE = 'seller_side',
  DUAL        = 'dual',
}

/**
 * Which side of the transaction the coordinating party/TC represents.
 * Distinct from `TransactionSide` (agency representation) — a buyer-side
 * transaction is coordinated on behalf of the buyer, a seller-side transaction
 * on behalf of the seller. New transactions default to BUYER; legacy rows have
 * NULL and are treated as BUYER at the application layer.
 */
export enum CoordinatorSide {
  BUYER  = 'BUYER',
  SELLER = 'SELLER',
}
export enum TransactionStatus {
  DRAFT                         = 'draft',
  ACTIVE                        = 'active',
  UNDER_CONTRACT                = 'under_contract',
  PENDING_CLOSE                 = 'pending_close',
  CLOSED                        = 'closed',
  CANCELLED                     = 'cancelled',
  ARCHIVED                      = 'archived',
  SELLER_RESPONSE_REJECTED      = 'seller_response_rejected',
  INSPECTION_CONTINGENCY_REMOVED = 'inspection_contingency_removed',
}

registerEnumType(TransactionType,   { name: 'TransactionType' });
registerEnumType(TransactionSide,   { name: 'TransactionSide' });
registerEnumType(CoordinatorSide,   { name: 'CoordinatorSide' });
registerEnumType(TransactionStatus, { name: 'TransactionStatus' });

@ObjectType()
@Entity('real_estate_transactions')
@Index(['organizationId'])
@Index(['status'])
export class TransactionEntity {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  organizationId: string;

  @Field(() => OrganizationEntity)
  @ManyToOne(() => OrganizationEntity, (o) => o.transactions, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'organizationId' })
  organization: OrganizationEntity;

  @Field()
  @Column({ unique: true })
  transactionNumber: string;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', nullable: true })
  externalRef: string | null;

  @Field(() => TransactionType)
  @Column({ type: 'varchar' })
  transactionType: TransactionType;

  @Field(() => TransactionSide)
  @Column({ type: 'varchar' })
  side: TransactionSide;

  /**
   * Which side of the transaction is being coordinated ('BUYER' | 'SELLER').
   * NULL on legacy rows — resolve to BUYER at the application layer.
   */
  @Field(() => CoordinatorSide, { nullable: true })
  @Column({ name: 'transaction_side', type: 'varchar', nullable: true })
  transactionSide: CoordinatorSide | null;

  @Field(() => TransactionStatus)
  @Column({ type: 'varchar', default: TransactionStatus.DRAFT })
  status: TransactionStatus;

  // ── Property ─────────────────────────────────────────────────────────────
  @Field()
  @Column()
  propertyAddressLine1: string;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', nullable: true })
  propertyAddressLine2: string | null;

  @Field()
  @Column()
  propertyCity: string;

  @Field()
  @Column()
  propertyState: string;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', nullable: true })
  propertyPostalCode: string | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', nullable: true })
  propertyCounty: string | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', nullable: true })
  apn: string | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', nullable: true })
  mlsNumber: string | null;

  /**
   * The From address used for all outbound emails on this transaction.
   * Format: {8-char-org-prefix}-{sanitized-street}-{zip}@txn.mytcapp.net
   * Set once at creation, never mutated — Mailgun routing rules depend on this being stable.
   * Null when the property address was not available at creation time.
   */
  @Field(() => String, { nullable: true })
  @Column({ name: 'outbound_email_address', type: 'varchar', nullable: true })
  outboundEmailAddress: string | null;

  /**
   * Days before a Buyer Side deadline (currently: Verification of Property, tied to Close of
   * Escrow) to send a reminder. Null means "use the default" (3 days) — resolved in code, not
   * defaulted at the DB level, so an explicit 3 and "using the default" stay distinguishable.
   */
  @Field(() => Int, { nullable: true })
  @Column({ name: 'buyer_side_reminder_lead_days', type: 'integer', nullable: true })
  buyerSideReminderLeadDays: number | null;

  /**
   * Days before the Seller Side deadline (Seller Disclosures Due) to send a per-document
   * reminder. Null means "use the default" (3 days) — resolved in code, not defaulted at the
   * DB level, so an explicit 3 and "using the default" stay distinguishable.
   */
  @Field(() => Int, { nullable: true })
  @Column({ name: 'seller_side_reminder_lead_days', type: 'integer', nullable: true })
  sellerSideReminderLeadDays: number | null;

  @Field(() => Float, { nullable: true })
  @Column({ type: 'numeric', precision: 5, scale: 2, nullable: true })
  bedrooms: number | null;

  @Field(() => Float, { nullable: true })
  @Column({ type: 'numeric', precision: 5, scale: 2, nullable: true })
  bathrooms: number | null;

  @Field(() => Int, { nullable: true })
  @Column({ type: 'integer', nullable: true })
  squareFeet: number | null;

  @Field(() => Int, { nullable: true })
  @Column({ type: 'integer', nullable: true })
  lotSizeSqft: number | null;

  @Field(() => Int, { nullable: true })
  @Column({ type: 'integer', nullable: true })
  yearBuilt: number | null;

  // ── Financials ────────────────────────────────────────────────────────────
  // `numeric` columns come back as strings from node-postgres — the transformer keeps
  // these JS numbers end-to-end, matching every other numeric column in this codebase
  // (see e.g. BuyerSideInformationEntity.grossCommission) so callers can do arithmetic
  // or strict equality comparisons on them without an extra parseFloat/cast.
  @Field(() => Float, { nullable: true })
  @Column({ type: 'numeric', precision: 14, scale: 2, nullable: true, transformer: { to: (v: number | null) => v, from: (v: string | null) => (v === null ? null : parseFloat(v)) } })
  listPrice: number | null;

  @Field(() => Float, { nullable: true })
  @Column({ type: 'numeric', precision: 14, scale: 2, nullable: true, transformer: { to: (v: number | null) => v, from: (v: string | null) => (v === null ? null : parseFloat(v)) } })
  contractPrice: number | null;

  @Field(() => Float, { nullable: true })
  @Column({ type: 'numeric', precision: 14, scale: 2, nullable: true, transformer: { to: (v: number | null) => v, from: (v: string | null) => (v === null ? null : parseFloat(v)) } })
  earnestMoneyAmount: number | null;

  @Field(() => Float, { nullable: true })
  @Column({ type: 'numeric', precision: 14, scale: 2, nullable: true, transformer: { to: (v: number | null) => v, from: (v: string | null) => (v === null ? null : parseFloat(v)) } })
  commissionAmount: number | null;

  // ── Key dates ─────────────────────────────────────────────────────────────
  @Field(() => Date, { nullable: true })
  @Column({ type: 'timestamptz', nullable: true })
  offerAcceptedAt: Date | null;

  @Field(() => Date, { nullable: true })
  @Column({ type: 'timestamptz', nullable: true })
  openEscrowAt: Date | null;

  @Field(() => Date, { nullable: true })
  @Column({ type: 'timestamptz', nullable: true })
  inspectionDeadlineAt: Date | null;

  @Field(() => Date, { nullable: true })
  @Column({ type: 'timestamptz', nullable: true })
  financeDeadlineAt: Date | null;

  @Field(() => Date, { nullable: true })
  @Column({ type: 'timestamptz', nullable: true })
  appraisalDeadlineAt: Date | null;

  @Field(() => Date, { nullable: true })
  @Column({ type: 'timestamptz', nullable: true })
  closeOfEscrowAt: Date | null;

  @Field(() => Date, { nullable: true })
  @Column({ type: 'timestamptz', nullable: true })
  closedAt: Date | null;

  @Field(() => Date, { nullable: true })
  @Column({ type: 'timestamptz', nullable: true })
  cancelledAt: Date | null;

  // ── Ownership ─────────────────────────────────────────────────────────────
  @Column()
  createdByAccountId: string;

  @Field(() => AccountEntity)
  @ManyToOne(() => AccountEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'createdByAccountId' })
  createdByAccount: AccountEntity;

  @HideField()
  @Column({ type: 'text', array: true, default: [] })
  deletedByAccountIds: string[];

  @Column({ type: 'varchar', nullable: true })
  assignedCoordinatorAccountId: string | null;

  @Field(() => AccountEntity, { nullable: true })
  @ManyToOne(() => AccountEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'assignedCoordinatorAccountId' })
  assignedCoordinatorAccount: AccountEntity | null;

  @Column({ name: 'buyer_agent_account_id', type: 'uuid', nullable: true })
  buyerAgentAccountId: string | null;

  @Field(() => AccountEntity, { nullable: true })
  @ManyToOne(() => AccountEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'buyer_agent_account_id' })
  buyerAgentAccount: AccountEntity | null;

  @Column({ name: 'form_template_id', type: 'uuid', nullable: true })
  formTemplateId: string | null;

  @Field(() => TransactionFormTemplateEntity, { nullable: true })
  @ManyToOne(() => TransactionFormTemplateEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'form_template_id' })
  formTemplate: TransactionFormTemplateEntity | null;

  @HideField()
  @Column({ type: 'jsonb', nullable: true })
  summaryJson: Record<string, unknown> | null;

  /**
   * True for transactions created by the Admin Buyer Transaction Test Center
   * (`apps/api/src/modules/admin-testing/`) — never set by any real user-facing
   * flow. Lets dashboards/reporting exclude test data and lets the swimlane
   * visually flag a transaction as synthetic.
   */
  @Field(() => Boolean, { nullable: true })
  @Column({ type: 'boolean', default: false })
  isTestData: boolean;

  /** 'mock' | 'real' — which Test Center mode created this transaction. Null for real transactions. */
  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', nullable: true })
  testMode: 'mock' | 'real' | null;

  // ── Relations ─────────────────────────────────────────────────────────────
  @Field(() => [TransactionPartyEntity], { nullable: true })
  @OneToMany(() => TransactionPartyEntity, (p) => p.transaction, { eager: false })
  parties?: TransactionPartyEntity[];

  @Field(() => [TransactionTaskEntity], { nullable: true })
  @OneToMany(() => TransactionTaskEntity, (t) => t.transaction, { eager: false })
  tasks?: TransactionTaskEntity[];

  @Field(() => [TransactionEventEntity], { nullable: true })
  @OneToMany(() => TransactionEventEntity, (e) => e.transaction, { eager: false })
  events?: TransactionEventEntity[];

  @Field(() => [TransactionJournalEntity], { nullable: true })
  @OneToMany(() => TransactionJournalEntity, (j) => j.transaction, { eager: false })
  journals?: TransactionJournalEntity[];

  @Field(() => [TransactionMessageEntity], { nullable: true })
  @OneToMany(() => TransactionMessageEntity, (m) => m.transaction, { eager: false })
  messages?: TransactionMessageEntity[];

  @Field(() => [TransactionDocumentEntity], { nullable: true })
  @OneToMany(() => TransactionDocumentEntity, (d) => d.transaction, { eager: false })
  documents?: TransactionDocumentEntity[];

  @Field(() => [TransactionStageInstanceEntity], { nullable: true })
  @OneToMany(() => TransactionStageInstanceEntity, (s) => s.transaction, { eager: false })
  stageInstances?: TransactionStageInstanceEntity[];

  @Field(() => [RepairRequestEntity], { nullable: true })
  @OneToMany(() => RepairRequestEntity, (r) => r.transaction, { eager: false })
  repairRequests?: RepairRequestEntity[];

  @Field()
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Field()
  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
