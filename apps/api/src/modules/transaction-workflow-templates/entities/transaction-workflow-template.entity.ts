import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn, OneToMany, Index,
} from 'typeorm';
import { ObjectType, Field, ID, Int } from '@nestjs/graphql';
import { OrganizationEntity } from '../../organizations/entities/organization.entity';
import { AccountEntity } from '../../accounts/entities/account.entity';
import { TransactionWorkflowTemplateStepEntity } from './transaction-workflow-template-step.entity';

@ObjectType()
@Entity('transaction_workflow_templates')
@Index(['organizationId'])
@Index(['stateCode'])
export class TransactionWorkflowTemplateEntity {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // null = system template available to all orgs; set = org-private custom template
  @Column({ type: 'varchar', nullable: true })
  organizationId: string | null;

  @Field(() => OrganizationEntity, { nullable: true })
  @ManyToOne(() => OrganizationEntity, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organizationId' })
  organization: OrganizationEntity | null;

  @Field()
  @Column()
  name: string;

  // null = national fallback; set = state-specific (e.g. 'CA', 'IL', 'NY')
  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', nullable: true })
  stateCode: string | null;

  @Field()
  @Column({ type: 'varchar' })
  transactionType: string;

  @Field()
  @Column({ type: 'varchar' })
  side: string;

  @Field(() => Int)
  @Column({ default: 1 })
  version: number;

  @Field()
  @Column({ default: true })
  isActive: boolean;

  // Marks platform-provided templates — org-created templates are false
  @Field()
  @Column({ default: false })
  isSystem: boolean;

  @Field(() => String, { nullable: true })
  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', nullable: true })
  createdByAccountId: string | null;

  @Field(() => AccountEntity, { nullable: true })
  @ManyToOne(() => AccountEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'createdByAccountId' })
  createdByAccount: AccountEntity | null;

  @Field(() => [TransactionWorkflowTemplateStepEntity], { nullable: true })
  @OneToMany(() => TransactionWorkflowTemplateStepEntity, (s) => s.template, { eager: false })
  steps?: TransactionWorkflowTemplateStepEntity[];

  @Field()
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Field()
  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
