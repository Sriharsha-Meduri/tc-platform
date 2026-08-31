import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn, OneToMany, Index,
} from 'typeorm';
import { ObjectType, Field, ID } from '@nestjs/graphql';
import { OrganizationEntity } from '../../organizations/entities/organization.entity';
import { AccountEntity } from '../../accounts/entities/account.entity';
import { TransactionFormTemplateItemEntity } from './transaction-form-template-item.entity';

@ObjectType()
@Entity('transaction_form_templates')
@Index(['organizationId'])
@Index(['stateCode'])
@Index(['transactionType', 'side'])
export class TransactionFormTemplateEntity {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** null = system template available to all orgs; set = org-private custom template */
  @Column({ type: 'varchar', nullable: true })
  organizationId: string | null;

  @Field(() => OrganizationEntity, { nullable: true })
  @ManyToOne(() => OrganizationEntity, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organizationId' })
  organization: OrganizationEntity | null;

  @Field()
  @Column()
  name: string;

  @Field(() => String, { nullable: true })
  @Column({ type: 'text', nullable: true })
  description: string | null;

  /** null = national fallback; set = state-specific (e.g. 'CA', 'IL') */
  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', nullable: true })
  stateCode: string | null;

  /** 'residential' | 'income_property' | 'commercial' | 'land' | 'manufactured_home' | 'new_construction' */
  @Field()
  @Column({ type: 'varchar' })
  transactionType: string;

  /** 'buyer_side' | 'seller_side' | 'dual' | 'listing' */
  @Field()
  @Column({ type: 'varchar' })
  side: string;

  /** true = platform-provided; false = org-created custom template */
  @Field()
  @Column({ default: false })
  isSystem: boolean;

  /** DocuSign server-side template ID applied automatically when creating envelopes */
  @Field(() => String, { nullable: true })
  @Column({ name: 'docusign_template_id', type: 'varchar', nullable: true })
  docusignTemplateId: string | null;

  @Field()
  @Column({ default: true })
  isActive: boolean;

  @Field(() => String, { nullable: true, description: 'YYYY-MM-DD — template visible on/after this date' })
  @Column({ type: 'date', name: 'effective_date', nullable: true })
  effectiveDate?: Date;

  @Field(() => String, { nullable: true, description: 'YYYY-MM-DD — template hidden after this date' })
  @Column({ type: 'date', name: 'retired_date', nullable: true })
  retiredDate?: Date;

  @Column({ type: 'varchar', nullable: true })
  createdByAccountId: string | null;

  @Field(() => AccountEntity, { nullable: true })
  @ManyToOne(() => AccountEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'createdByAccountId' })
  createdByAccount: AccountEntity | null;

  @Field(() => [TransactionFormTemplateItemEntity], { nullable: true })
  @OneToMany(() => TransactionFormTemplateItemEntity, (item) => item.template, { eager: false })
  items?: TransactionFormTemplateItemEntity[];

  @Field()
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Field()
  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
