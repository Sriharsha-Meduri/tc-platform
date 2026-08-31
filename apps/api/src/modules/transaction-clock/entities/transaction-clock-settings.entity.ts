import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  OneToOne, JoinColumn,
} from 'typeorm';
import { ObjectType, Field, ID } from '@nestjs/graphql';
import { TransactionEntity } from '../../transactions/entities/transaction.entity';

@ObjectType()
@Entity('transaction_clock_settings')
export class TransactionClockSettingsEntity {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  transactionId: string;

  @OneToOne(() => TransactionEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'transactionId' })
  transaction: TransactionEntity;

  /**
   * IANA timezone string for the transaction's property location.
   * Derived from propertyState at creation time.
   * Used for all date display and day-of deadline calculations.
   * e.g. 'America/Los_Angeles', 'America/New_York'
   */
  @Field()
  @Column({ type: 'varchar', default: 'America/Los_Angeles' })
  timezone: string;

  /**
   * Offset from real Date.now() in milliseconds.
   * NULL = real time (production default).
   * Set via PATCH /transactions/:id/clock to simulate a different point in time.
   * e.g. +432000000 = 5 days ahead, -86400000 = 1 day behind.
   */
  @Field(() => String, { nullable: true })
  @Column({ type: 'bigint', nullable: true })
  virtualClockOffsetMs: string | null;

  @Field()
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Field()
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
