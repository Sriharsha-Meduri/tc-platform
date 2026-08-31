import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { ObjectType, Field, ID, registerEnumType } from '@nestjs/graphql';
import { HideField } from '@nestjs/graphql';
import { TransactionEntity } from '../../transactions/entities/transaction.entity';
import { TransactionPartyEntity } from '../../transaction-parties/entities/transaction-party.entity';
import { TransactionWorkflowStepEntity } from '../../transaction-workflow-steps/entities/transaction-workflow-step.entity';

export enum MessageChannel {
  EMAIL   = 'email',
  SMS     = 'sms',
  IN_APP  = 'in_app',
  AI_CHAT = 'ai_chat',
}
export enum MessageDirection {
  INBOUND  = 'inbound',
  OUTBOUND = 'outbound',
  INTERNAL = 'internal',
}
export enum MessageStatus {
  QUEUED    = 'queued',
  SENT      = 'sent',
  DELIVERED = 'delivered',
  FAILED    = 'failed',
  RECEIVED  = 'received',
  READ      = 'read',
}

registerEnumType(MessageChannel,   { name: 'MessageChannel' });
registerEnumType(MessageDirection, { name: 'MessageDirection' });
registerEnumType(MessageStatus,    { name: 'MessageStatus' });

@ObjectType()
@Entity('transaction_messages')
@Index(['transactionId'])
@Index(['channel'])
@Index(['threadKey'])
export class TransactionMessageEntity {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  transactionId: string;

  @Field(() => TransactionEntity)
  @ManyToOne(() => TransactionEntity, (t) => t.messages, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'transactionId' })
  transaction: TransactionEntity;

  @Field(() => MessageChannel)
  @Column({ type: 'varchar' })
  channel: MessageChannel;

  @Field(() => MessageDirection)
  @Column({ type: 'varchar' })
  direction: MessageDirection;

  @Column({ type: 'varchar', nullable: true })
  senderPartyId: string | null;

  @Field(() => TransactionPartyEntity, { nullable: true })
  @ManyToOne(() => TransactionPartyEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'senderPartyId' })
  senderParty: TransactionPartyEntity | null;

  @Column({ type: 'varchar', nullable: true })
  recipientPartyId: string | null;

  @Field(() => TransactionPartyEntity, { nullable: true })
  @ManyToOne(() => TransactionPartyEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'recipientPartyId' })
  recipientParty: TransactionPartyEntity | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', nullable: true })
  subject: string | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'text', nullable: true })
  bodyText: string | null;

  @HideField()
  @Column({ type: 'text', nullable: true })
  bodyHtml: string | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', nullable: true })
  providerName: string | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', nullable: true })
  providerMessageId: string | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', nullable: true })
  providerThreadId: string | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', nullable: true })
  threadKey: string | null;

  @Field(() => MessageStatus)
  @Column({ type: 'varchar', default: MessageStatus.RECEIVED })
  status: MessageStatus;

  @Field(() => Date, { nullable: true })
  @Column({ type: 'timestamptz', nullable: true })
  sentAt: Date | null;

  @Field(() => Date, { nullable: true })
  @Column({ type: 'timestamptz', nullable: true })
  receivedAt: Date | null;

  /**
   * Transaction stage that was active when this message was sent or received.
   * Stamped at write time by the service creating the message.
   * Used by the swimlane UI to filter messages per stage tab.
   */
  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', nullable: true })
  stage: string | null;

  // Optional: scopes this message to a specific workflow step
  @Column({ type: 'varchar', nullable: true })
  workflowStepId: string | null;

  @Field(() => TransactionWorkflowStepEntity, { nullable: true })
  @ManyToOne(() => TransactionWorkflowStepEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'workflowStepId' })
  workflowStep: TransactionWorkflowStepEntity | null;

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
