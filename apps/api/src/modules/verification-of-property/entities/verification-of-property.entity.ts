import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { ObjectType, Field, ID, registerEnumType, HideField } from '@nestjs/graphql';
import { TransactionEntity } from '../../transactions/entities/transaction.entity';
import { TransactionDocumentEntity } from '../../transaction-documents/entities/transaction-document.entity';
import { AccountEntity } from '../../accounts/entities/account.entity';

export enum VpStatus {
  SCHEDULED           = 'scheduled',
  REMINDER_SENT       = 'reminder_sent',
  WAITING_FOR_FORM    = 'waiting_for_form',
  FORM_RECEIVED       = 'form_received',
  VALIDATED           = 'validated',
  READY_FOR_DOCUSIGN  = 'ready_for_docusign',
  SENT_VIA_DOCUSIGN   = 'sent_via_docusign',
  FULLY_EXECUTED      = 'fully_executed',
}

export const VP_STATUS_LABELS: Record<VpStatus, string> = {
  [VpStatus.SCHEDULED]:          'Verification Date Scheduled',
  [VpStatus.REMINDER_SENT]:      'Reminder Email Sent',
  [VpStatus.WAITING_FOR_FORM]:   'Waiting for Verification of Property Form',
  [VpStatus.FORM_RECEIVED]:      'Verification of Property Form Received',
  [VpStatus.VALIDATED]:          'Document Validated',
  [VpStatus.READY_FOR_DOCUSIGN]: 'Ready to Send via DocuSign',
  [VpStatus.SENT_VIA_DOCUSIGN]:  'Sent via DocuSign',
  [VpStatus.FULLY_EXECUTED]:     'Fully Executed',
};

export const VP_STATUS_ORDER: VpStatus[] = [
  VpStatus.SCHEDULED,
  VpStatus.REMINDER_SENT,
  VpStatus.WAITING_FOR_FORM,
  VpStatus.FORM_RECEIVED,
  VpStatus.VALIDATED,
  VpStatus.READY_FOR_DOCUSIGN,
  VpStatus.SENT_VIA_DOCUSIGN,
  VpStatus.FULLY_EXECUTED,
];

registerEnumType(VpStatus, { name: 'VpStatus' });

@ObjectType()
@Entity('verification_of_property')
@Index(['transactionId'], { unique: true })
@Index(['status'])
export class VerificationOfPropertyEntity {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  transactionId: string;

  @Field(() => TransactionEntity)
  @ManyToOne(() => TransactionEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'transactionId' })
  transaction: TransactionEntity;

  @Field(() => VpStatus)
  @Column({ type: 'varchar', default: VpStatus.SCHEDULED })
  status: VpStatus;

  @Field(() => Date, { nullable: true })
  @Column({ type: 'timestamptz', nullable: true })
  scheduledDate: Date | null;

  @Field(() => Date, { nullable: true })
  @Column({ type: 'timestamptz', nullable: true })
  reminderSentAt: Date | null;

  @Field(() => Date, { nullable: true })
  @Column({ type: 'timestamptz', nullable: true })
  documentReceivedAt: Date | null;

  @Field(() => Date, { nullable: true })
  @Column({ type: 'timestamptz', nullable: true })
  validatedAt: Date | null;

  @Field(() => Date, { nullable: true })
  @Column({ type: 'timestamptz', nullable: true })
  sentForSignatureAt: Date | null;

  @Field(() => Date, { nullable: true })
  @Column({ type: 'timestamptz', nullable: true })
  fullyExecutedAt: Date | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', nullable: true })
  docusignEnvelopeId: string | null;

  @Column({ type: 'varchar', nullable: true })
  vopDocumentId: string | null;

  @Field(() => TransactionDocumentEntity, { nullable: true })
  @ManyToOne(() => TransactionDocumentEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'vopDocumentId' })
  vopDocument: TransactionDocumentEntity | null;

  @Column({ type: 'varchar', nullable: true })
  createdByAccountId: string | null;

  @Field(() => AccountEntity, { nullable: true })
  @ManyToOne(() => AccountEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'createdByAccountId' })
  createdByAccount: AccountEntity | null;

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
