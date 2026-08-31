import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  OneToOne, JoinColumn,
} from 'typeorm';
import { ObjectType, Field, ID, Float } from '@nestjs/graphql';
import { TransactionEntity } from '../../transactions/entities/transaction.entity';

/**
 * 'percentage' — buyerCommissionValue is a percent (0-100) of the
 * transaction's contractPrice. 'flat_amount' — buyerCommissionValue is
 * itself the gross commission dollar amount. Deliberately not reusing
 * BuyerBrokerCommissionEntity's own 'percentage' | 'flat_fee' union — that
 * table is legacy/no-longer-written-to (see the class doc comment below),
 * and this is a distinct, newly-specified field.
 */
export type BuyerCommissionType = 'percentage' | 'flat_amount';

/**
 * One row per transaction — the Buyer Agent secure upload page's combined
 * "Buyer Broker Commission Information" section (brokerage name, broker
 * name/email, payment address, buyer credits, commission calculation).
 * This is now the single canonical store for that section — the older
 * buyer_broker_commission table's commissionType/commissionValue/notes/
 * brokerageName columns are no longer written to by this flow (kept only
 * for historical data; see buildPublicDto's brokerageName fallback read).
 * Distinct from any seller-side data — nothing here is ever read or
 * written by the Seller Agent or Escrow flows, so it can never overwrite
 * seller-side brokerage information.
 */
@ObjectType()
@Entity('buyer_side_information')
export class BuyerSideInformationEntity {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  transactionId: string;

  @OneToOne(() => TransactionEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'transactionId' })
  transaction: TransactionEntity;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', nullable: true })
  brokerageName: string | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', nullable: true })
  brokerFullName: string | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', nullable: true })
  brokerEmail: string | null;

  /**
   * The mailing/payment address used for commission disbursement and
   * CDA-related workflows — maps onto the CDA generation module's
   * `agentAddress` field (see packages/document-intelligence/src/cda).
   */
  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', nullable: true })
  buyerAgentPaymentAddress: string | null;

  /**
   * A currency amount — dollars and cents. `numeric` columns come back as
   * strings from node-postgres — the transformer keeps this a JS number
   * end-to-end so equality diffing (for audit/no-op detection) works
   * without extra casts, matching BuyerBrokerCommissionEntity.commissionValue.
   */
  @Field(() => Float, { nullable: true })
  @Column({ type: 'numeric', nullable: true, transformer: { to: (v: number | null) => v, from: (v: string | null) => (v === null ? null : parseFloat(v)) } })
  clientCredits: number | null;

  /** 'percentage' | 'flat_amount' — see BuyerCommissionType. */
  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', nullable: true })
  buyerCommissionType: BuyerCommissionType | null;

  /**
   * Percentage (0-100) when buyerCommissionType is 'percentage'; a dollar
   * amount when 'flat_amount'. Same numeric round-trip transformer as
   * clientCredits, for the same reason (equality diffing without casts).
   */
  @Field(() => Float, { nullable: true })
  @Column({ type: 'numeric', nullable: true, transformer: { to: (v: number | null) => v, from: (v: string | null) => (v === null ? null : parseFloat(v)) } })
  buyerCommissionValue: number | null;

  /**
   * Server-calculated, never entered directly: contractPrice ×
   * (buyerCommissionValue / 100) when percentage, or buyerCommissionValue
   * itself when flat_amount — see ExternalTransactionInformationService's
   * calculateGrossCommission. Null whenever it can't yet be computed (type
   * or value missing, or the transaction has no contractPrice yet).
   */
  @Field(() => Float, { nullable: true })
  @Column({ type: 'numeric', nullable: true, transformer: { to: (v: number | null) => v, from: (v: string | null) => (v === null ? null : parseFloat(v)) } })
  grossCommission: number | null;

  @Field()
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Field()
  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
