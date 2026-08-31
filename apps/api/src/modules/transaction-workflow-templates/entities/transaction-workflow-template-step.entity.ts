import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { ObjectType, Field, ID, Int } from '@nestjs/graphql';
import { HideField } from '@nestjs/graphql';
import { TransactionWorkflowTemplateEntity } from './transaction-workflow-template.entity';

@ObjectType()
@Entity('transaction_workflow_template_steps')
@Index(['templateId'])
@Index(['templateId', 'sortOrder'])
export class TransactionWorkflowTemplateStepEntity {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  templateId: string;

  @Field(() => TransactionWorkflowTemplateEntity)
  @ManyToOne(() => TransactionWorkflowTemplateEntity, (t) => t.steps, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'templateId' })
  template: TransactionWorkflowTemplateEntity;

  // Machine-readable key — stable for code logic and unique within a template
  @Field()
  @Column({ type: 'varchar' })
  stepKey: string;

  @Field()
  @Column()
  stepName: string;

  @Field(() => String, { nullable: true })
  @Column({ type: 'text', nullable: true })
  description: string | null;

  // disclosure | inspection | financial | closing | post_close
  @Field()
  @Column({ type: 'varchar' })
  category: string;

  // The party role primarily responsible (buyer_agent, seller_agent, escrow_officer …)
  @Field()
  @Column({ type: 'varchar' })
  responsibleRole: string;

  // Gaps of 1000 (1000, 2000 …) allow inserting steps without renumbering
  @Field(() => Int)
  @Column()
  sortOrder: number;

  @Field()
  @Column({ default: false })
  isOptional: boolean;

  // Days from a reference date (offer_accepted_at or close_of_escrow_at) to auto-compute dueAt
  @Field(() => Int, { nullable: true })
  @Column({ type: 'integer', nullable: true })
  defaultDurationDays: number | null;

  // JSON array of stepKey strings that must be completed/waived before this step starts
  @HideField()
  @Column({ type: 'jsonb', nullable: true })
  prerequisiteKeys: string[] | null;

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
