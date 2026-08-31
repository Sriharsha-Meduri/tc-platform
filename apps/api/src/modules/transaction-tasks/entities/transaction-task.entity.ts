import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { ObjectType, Field, ID, registerEnumType } from '@nestjs/graphql';
import { HideField } from '@nestjs/graphql';
import { TransactionEntity } from '../../transactions/entities/transaction.entity';
import { AccountEntity } from '../../accounts/entities/account.entity';
import { TransactionWorkflowStepEntity } from '../../transaction-workflow-steps/entities/transaction-workflow-step.entity';

export enum TaskStatus {
  TODO        = 'todo',
  IN_PROGRESS = 'in_progress',
  BLOCKED     = 'blocked',
  DONE        = 'done',
  WAIVED      = 'waived',
}
export enum TaskPriority {
  LOW    = 'low',
  NORMAL = 'normal',
  HIGH   = 'high',
  URGENT = 'urgent',
}

registerEnumType(TaskStatus,   { name: 'TaskStatus' });
registerEnumType(TaskPriority, { name: 'TaskPriority' });

@ObjectType()
@Entity('transaction_tasks')
@Index(['transactionId'])
@Index(['assignedAccountId'])
@Index(['status'])
@Index(['dueAt'])
export class TransactionTaskEntity {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  transactionId: string;

  @Field(() => TransactionEntity)
  @ManyToOne(() => TransactionEntity, (t) => t.tasks, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'transactionId' })
  transaction: TransactionEntity;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', nullable: true })
  templateKey: string | null;

  @Field()
  @Column()
  title: string;

  @Field(() => String, { nullable: true })
  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Field(() => TaskStatus)
  @Column({ type: 'varchar', default: TaskStatus.TODO })
  status: TaskStatus;

  @Field(() => TaskPriority)
  @Column({ type: 'varchar', default: TaskPriority.NORMAL })
  priority: TaskPriority;

  @Column({ type: 'varchar', nullable: true })
  assignedAccountId: string | null;

  @Field(() => AccountEntity, { nullable: true })
  @ManyToOne(() => AccountEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'assignedAccountId' })
  assignedAccount: AccountEntity | null;

  // Self-referential dependency
  @Column({ type: 'varchar', nullable: true })
  dependsOnTaskId: string | null;

  @Field(() => TransactionTaskEntity, { nullable: true })
  @ManyToOne(() => TransactionTaskEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'dependsOnTaskId' })
  dependsOnTask: TransactionTaskEntity | null;

  @Field(() => Date, { nullable: true })
  @Column({ type: 'timestamptz', nullable: true })
  dueAt: Date | null;

  @Field(() => Date, { nullable: true })
  @Column({ type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @Column({ type: 'varchar', nullable: true })
  createdByAccountId: string | null;

  @Field(() => AccountEntity, { nullable: true })
  @ManyToOne(() => AccountEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'createdByAccountId' })
  createdByAccount: AccountEntity | null;

  // Optional: scopes this task to a specific workflow step
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
