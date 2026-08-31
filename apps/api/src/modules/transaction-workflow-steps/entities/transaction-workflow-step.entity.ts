import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { ObjectType, Field, ID, Int } from '@nestjs/graphql';
import { HideField } from '@nestjs/graphql';
import { TransactionEntity } from '../../transactions/entities/transaction.entity';
import { TransactionWorkflowTemplateStepEntity } from '../../transaction-workflow-templates/entities/transaction-workflow-template-step.entity';

export enum WorkflowStepStatus {
  PENDING            = 'pending',
  IN_PROGRESS        = 'in_progress',
  AWAITING_RESPONSE  = 'awaiting_response',
  COMPLETED          = 'completed',
  WAIVED             = 'waived',
  FAILED             = 'failed',
}

@ObjectType()
@Entity('transaction_workflow_steps')
@Index(['transactionId'])
@Index(['transactionId', 'sortOrder'])
@Index(['status'])
export class TransactionWorkflowStepEntity {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  transactionId: string;

  @Field(() => TransactionEntity)
  @ManyToOne(() => TransactionEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'transactionId' })
  transaction: TransactionEntity;

  // null = custom step added ad-hoc to this transaction (not from a template)
  @Column({ type: 'varchar', nullable: true })
  templateStepId: string | null;

  @Field(() => TransactionWorkflowTemplateStepEntity, { nullable: true })
  @ManyToOne(() => TransactionWorkflowTemplateStepEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'templateStepId' })
  templateStep: TransactionWorkflowTemplateStepEntity | null;

  // Copied from template at Init Workflow time — stable for code logic
  @Field()
  @Column({ type: 'varchar' })
  stepKey: string;

  // Copied from template but can be overridden per transaction
  @Field()
  @Column()
  stepName: string;

  @Field()
  @Column({ type: 'varchar' })
  category: string;

  @Field()
  @Column({ type: 'varchar' })
  responsibleRole: string;

  // Copied from template; can be adjusted per transaction for custom ordering
  @Field(() => Int)
  @Column()
  sortOrder: number;

  @Field()
  @Column({ default: false })
  isOptional: boolean;

  @Field(() => String)
  @Column({ type: 'varchar', default: WorkflowStepStatus.PENDING })
  status: WorkflowStepStatus;

  @Field(() => Date, { nullable: true })
  @Column({ type: 'timestamptz', nullable: true })
  dueAt: Date | null;

  @Field(() => Date, { nullable: true })
  @Column({ type: 'timestamptz', nullable: true })
  startedAt: Date | null;

  @Field(() => Date, { nullable: true })
  @Column({ type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @Field(() => Date, { nullable: true })
  @Column({ type: 'timestamptz', nullable: true })
  waivedAt: Date | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'text', nullable: true })
  notes: string | null;

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
