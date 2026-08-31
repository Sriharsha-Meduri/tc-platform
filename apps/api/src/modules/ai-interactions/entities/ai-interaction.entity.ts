import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { ObjectType, Field, ID, Int, Float, registerEnumType } from '@nestjs/graphql';
import { HideField } from '@nestjs/graphql';
import { TransactionEntity } from '../../transactions/entities/transaction.entity';
import { AccountEntity } from '../../accounts/entities/account.entity';

export enum AiInteractionStatus {
  SUCCESS   = 'success',
  FAILED    = 'failed',
  MODERATED = 'moderated',
}
registerEnumType(AiInteractionStatus, { name: 'AiInteractionStatus' });

@ObjectType()
@Entity('ai_interactions')
@Index(['transactionId'])
@Index(['actorAccountId'])
export class AiInteractionEntity {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', nullable: true })
  transactionId: string | null;

  @Field(() => TransactionEntity, { nullable: true })
  @ManyToOne(() => TransactionEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'transactionId' })
  transaction: TransactionEntity | null;

  @Column({ type: 'varchar', nullable: true })
  actorAccountId: string | null;

  @Field(() => AccountEntity, { nullable: true })
  @ManyToOne(() => AccountEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'actorAccountId' })
  actorAccount: AccountEntity | null;

  @Field()
  @Column()
  modelName: string;

  @Field()
  @Column()
  feature: string;           // e.g. 'transaction_summary', 'draft_email', 'action_suggestions'

  @HideField()
  @Column({ type: 'text' })
  promptText: string;

  @Field(() => String, { nullable: true })
  @Column({ type: 'text', nullable: true })
  responseText: string | null;

  @Field(() => Int, { nullable: true })
  @Column({ type: 'integer', nullable: true })
  promptTokens: number | null;

  @Field(() => Int, { nullable: true })
  @Column({ type: 'integer', nullable: true })
  completionTokens: number | null;

  @Field(() => Float, { nullable: true })
  @Column({ type: 'numeric', precision: 10, scale: 6, nullable: true })
  costUsd: number | null;

  @Field(() => AiInteractionStatus)
  @Column({ type: 'varchar', default: AiInteractionStatus.SUCCESS })
  status: AiInteractionStatus;

  @Field(() => String, { nullable: true })
  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;

  @HideField()
  @Column({ type: 'jsonb', nullable: true })
  toolCallsJson: Record<string, unknown>[] | null;

  @HideField()
  @Column({ type: 'jsonb', nullable: true })
  metadataJson: Record<string, unknown> | null;

  @Field()
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
