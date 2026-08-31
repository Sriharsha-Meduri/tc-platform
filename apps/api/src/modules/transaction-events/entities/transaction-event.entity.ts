import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { ObjectType, Field, ID, registerEnumType } from '@nestjs/graphql';
import { HideField } from '@nestjs/graphql';
import { TransactionEntity } from '../../transactions/entities/transaction.entity';
import { AccountEntity } from '../../accounts/entities/account.entity';

export enum EventType {
  OFFER_ACCEPTED            = 'offer_accepted',
  OPEN_ESCROW               = 'open_escrow',
  EMD_DUE                   = 'emd_due',
  DISCLOSURES_DUE           = 'disclosures_due',
  INSPECTION                = 'inspection',
  APPRAISAL                 = 'appraisal',
  LOAN_COMMITMENT           = 'loan_commitment',
  CONTINGENCY_DEADLINE      = 'contingency_deadline',
  FINAL_WALKTHROUGH         = 'final_walkthrough',
  CLOSING                   = 'closing',
  POSSESSION                = 'possession',
  POST_CLOSE_FOLLOWUP       = 'post_close_followup',
}
export enum EventStatus {
  SCHEDULED   = 'scheduled',
  COMPLETED   = 'completed',
  CANCELLED   = 'cancelled',
  MISSED      = 'missed',
  RESCHEDULED = 'rescheduled',
}

registerEnumType(EventType,   { name: 'EventType' });
registerEnumType(EventStatus, { name: 'EventStatus' });

@ObjectType()
@Entity('transaction_events')
@Index(['transactionId'])
@Index(['eventDate'])
export class TransactionEventEntity {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  transactionId: string;

  @Field(() => TransactionEntity)
  @ManyToOne(() => TransactionEntity, (t) => t.events, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'transactionId' })
  transaction: TransactionEntity;

  @Field(() => EventType)
  @Column({ type: 'varchar' })
  eventType: EventType;

  @Field(() => Date)
  @Column({ type: 'timestamptz' })
  eventDate: Date;

  @Field(() => EventStatus)
  @Column({ type: 'varchar', default: EventStatus.SCHEDULED })
  status: EventStatus;

  @Field(() => String, { nullable: true })
  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'varchar', nullable: true })
  createdByAccountId: string | null;

  @Field(() => AccountEntity, { nullable: true })
  @ManyToOne(() => AccountEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'createdByAccountId' })
  createdByAccount: AccountEntity | null;

  @HideField()
  @Column({ type: 'jsonb', nullable: true })
  metadataJson: Record<string, unknown> | null;

  @Field()
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Field()
  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
