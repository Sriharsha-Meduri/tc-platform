import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { ObjectType, Field, ID, Int } from '@nestjs/graphql';
import { TransactionFormTemplateEntity } from './transaction-form-template.entity';

@ObjectType()
@Entity('transaction_form_template_items')
@Index(['templateId'])
@Index(['templateId', 'sortOrder'])
export class TransactionFormTemplateItemEntity {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  templateId: string;

  @Field(() => TransactionFormTemplateEntity)
  @ManyToOne(() => TransactionFormTemplateEntity, (t) => t.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'templateId' })
  template: TransactionFormTemplateEntity;

  /** CAR form code, e.g. 'RPA', 'TDS', 'CR-B' */
  @Field()
  @Column({ type: 'varchar' })
  formCode: string;

  @Field()
  @Column({ type: 'varchar' })
  formName: string;

  /** Form category for grouping in UI */
  @Field()
  @Column({ type: 'varchar' })
  category: string;

  @Field()
  @Column({ default: true })
  isRequired: boolean;

  @Field(() => Int)
  @Column({ default: 100 })
  sortOrder: number;

  /** Transaction stage this form belongs to, e.g. 'CONTRACT', 'DISCLOSURES' */
  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', nullable: true })
  stage: string | null;

  /** DocuSign server-side template ID applied automatically when this form is sent */
  @Field(() => String, { nullable: true })
  @Column({ name: 'docusign_template_id', type: 'varchar', nullable: true })
  docusignTemplateId: string | null;

  @Field()
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Field()
  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
