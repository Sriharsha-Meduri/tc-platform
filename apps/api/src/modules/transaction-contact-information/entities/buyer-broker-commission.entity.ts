import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  OneToOne, JoinColumn,
} from 'typeorm';
import { ObjectType, Field, ID, Float } from '@nestjs/graphql';
import { TransactionEntity } from '../../transactions/entities/transaction.entity';

export type CommissionType = 'percentage' | 'flat_fee';

/** One row per transaction — buyer broker commission terms captured via the Buyer Agent secure upload page. */
@ObjectType()
@Entity('buyer_broker_commission')
export class BuyerBrokerCommissionEntity {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  transactionId: string;

  @OneToOne(() => TransactionEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'transactionId' })
  transaction: TransactionEntity;

  /** 'percentage' | 'flat_fee' */
  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', nullable: true })
  commissionType: CommissionType | null;

  /**
   * Percentage (0-100) when commissionType is 'percentage'; a dollar amount when 'flat_fee'.
   * `numeric` columns come back as strings from node-postgres — the transformer keeps this a JS
   * number end-to-end so equality diffing (for audit/no-op detection) works without extra casts.
   */
  @Field(() => Float, { nullable: true })
  @Column({ type: 'numeric', nullable: true, transformer: { to: (v: number | null) => v, from: (v: string | null) => (v === null ? null : parseFloat(v)) } })
  commissionValue: number | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', nullable: true })
  brokerageName: string | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Field()
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Field()
  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
