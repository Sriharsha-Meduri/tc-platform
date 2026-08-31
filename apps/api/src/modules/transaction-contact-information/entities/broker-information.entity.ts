import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  OneToOne, JoinColumn,
} from 'typeorm';
import { ObjectType, Field, ID, Float } from '@nestjs/graphql';
import { TransactionEntity } from '../../transactions/entities/transaction.entity';

/**
 * 'percentage' — brokerCommissionValue is a percent (0-100) of grossCommission
 * (the Buyer Agent's own calculated commission). 'flat_amount' —
 * brokerCommissionValue is itself the broker's commission dollar amount.
 * Distinct from BuyerCommissionType only in name — kept separate so each
 * entity's own type stays self-contained, matching how this codebase never
 * shares a literal union across unrelated entities.
 */
export type BrokerCommissionType = 'percentage' | 'flat_amount';

/**
 * One row per transaction — the Broker's own secure upload page inputs and
 * the resulting commission split. brokerCommissionAmount and
 * buyerAgentCommissionAmount are server-calculated (see
 * ExternalTransactionInformationService.calculateBrokerSplit), never
 * entered directly, and are recalculated automatically whenever the
 * transaction's final sales price changes and the Buyer Agent's commission
 * is percentage-based (see recalculateCommissionsForContractPriceChange).
 * Stored (not just derived on read) so the CDA Generator and other
 * transaction modules can reuse the dollar amounts without recomputing them.
 */
@ObjectType()
@Entity('broker_information')
export class BrokerInformationEntity {
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
  brokerPaymentAddress: string | null;

  /** 'percentage' | 'flat_amount' — see BrokerCommissionType. */
  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', nullable: true })
  brokerCommissionType: BrokerCommissionType | null;

  /**
   * Percentage (0-100) when brokerCommissionType is 'percentage'; a dollar
   * amount when 'flat_amount'. Same numeric round-trip transformer used
   * throughout this module, for the same reason (equality diffing without
   * casts).
   */
  @Field(() => Float, { nullable: true })
  @Column({ type: 'numeric', nullable: true, transformer: { to: (v: number | null) => v, from: (v: string | null) => (v === null ? null : parseFloat(v)) } })
  brokerCommissionValue: number | null;

  /**
   * Server-calculated: grossCommission × (brokerCommissionValue / 100) when
   * percentage, or brokerCommissionValue itself when flat_amount.
   */
  @Field(() => Float, { nullable: true })
  @Column({ type: 'numeric', nullable: true, transformer: { to: (v: number | null) => v, from: (v: string | null) => (v === null ? null : parseFloat(v)) } })
  brokerCommissionAmount: number | null;

  /** Server-calculated: grossCommission - brokerCommissionAmount. */
  @Field(() => Float, { nullable: true })
  @Column({ type: 'numeric', nullable: true, transformer: { to: (v: number | null) => v, from: (v: string | null) => (v === null ? null : parseFloat(v)) } })
  buyerAgentCommissionAmount: number | null;

  @Field()
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Field()
  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
