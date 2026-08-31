import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { ObjectType, Field, ID, registerEnumType } from '@nestjs/graphql';
import { HideField } from '@nestjs/graphql';
import { TransactionEntity } from '../../transactions/entities/transaction.entity';
import { AccountEntity } from '../../accounts/entities/account.entity';

export enum JournalType {
  NOTE              = 'note',
  STATUS_CHANGE     = 'status_change',
  STAGE_CHANGE      = 'stage_change',
  EMAIL_RECEIVED    = 'email_received',
  EMAIL_SENT        = 'email_sent',
  EMAIL_REPLIED     = 'email_replied',
  SMS_RECEIVED      = 'sms_received',
  SMS_SENT          = 'sms_sent',
  TASK_CREATED      = 'task_created',
  TASK_COMPLETED    = 'task_completed',
  DOCUMENT_UPLOADED = 'document_uploaded',
  DOCUMENT_SIGNED   = 'document_signed',
  DOCUMENT_REJECTED = 'document_rejected',
  DEADLINE_UPDATED  = 'deadline_updated',
  AI_SUMMARY        = 'ai_summary',
  AI_ACTION         = 'ai_action',
  SYSTEM_EVENT      = 'system_event',
}
export enum JournalSource {
  UI      = 'ui',
  EMAIL   = 'email',
  SMS     = 'sms',
  SYSTEM  = 'system',
  AI      = 'ai',
  WEBHOOK = 'webhook',
  IMPORT  = 'import',
}

registerEnumType(JournalType,   { name: 'JournalType' });
registerEnumType(JournalSource, { name: 'JournalSource' });

@ObjectType()
@Entity('transaction_journals')
@Index(['transactionId', 'eventAt'])
@Index(['journalType'])
export class TransactionJournalEntity {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  transactionId: string;

  @Field(() => TransactionEntity)
  @ManyToOne(() => TransactionEntity, (t) => t.journals, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'transactionId' })
  transaction: TransactionEntity;

  @Field(() => JournalType)
  @Column({ type: 'varchar' })
  journalType: JournalType;

  @Field(() => Date)
  @Column({ type: 'timestamptz' })
  eventAt: Date;

  @Column({ type: 'varchar', nullable: true })
  actorAccountId: string | null;

  @Field(() => AccountEntity, { nullable: true })
  @ManyToOne(() => AccountEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'actorAccountId' })
  actorAccount: AccountEntity | null;

  @Field(() => JournalSource)
  @Column({ type: 'varchar' })
  source: JournalSource;

  @Field()
  @Column()
  title: string;

  @Field(() => String, { nullable: true })
  @Column({ type: 'text', nullable: true })
  body: string | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', nullable: true })
  relatedEntityType: string | null;

  @Field(() => ID, { nullable: true })
  @Column({ type: 'uuid', nullable: true })
  relatedEntityId: string | null;

  @HideField()
  @Column({ type: 'jsonb', nullable: true })
  metadataJson: Record<string, unknown> | null;

  @Field()
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
