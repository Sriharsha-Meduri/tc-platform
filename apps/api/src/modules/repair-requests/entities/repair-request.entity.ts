import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { ObjectType, Field, ID, registerEnumType, HideField } from '@nestjs/graphql';
import { TransactionEntity } from '../../transactions/entities/transaction.entity';
import { TransactionDocumentEntity } from '../../transaction-documents/entities/transaction-document.entity';
import { AccountEntity } from '../../accounts/entities/account.entity';

export enum RepairRequestType {
  RR   = 'rr',
  RRRR = 'rrrr',
  CR   = 'cr',
}

export enum RepairReviewStatus {
  PENDING          = 'pending',
  APPROVED         = 'approved',
  REJECTED         = 'rejected',
  CHANGES_REQUESTED = 'changes_requested',
}

registerEnumType(RepairRequestType,     { name: 'RepairRequestType' });
registerEnumType(RepairReviewStatus,    { name: 'RepairReviewStatus' });

@ObjectType()
@Entity('repair_requests')
@Index(['transactionId'])
@Index(['status'])
export class RepairRequestEntity {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  transactionId: string;

  @Field(() => TransactionEntity)
  @ManyToOne(() => TransactionEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'transactionId' })
  transaction: TransactionEntity;

  @Field(() => RepairRequestType)
  @Column({ type: 'varchar' })
  requestType: RepairRequestType;

  @Column({ type: 'varchar', nullable: true })
  rrDocumentId: string | null;

  @Field(() => TransactionDocumentEntity, { nullable: true })
  @ManyToOne(() => TransactionDocumentEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'rrDocumentId' })
  rrDocument: TransactionDocumentEntity | null;

  @Column({ type: 'varchar', nullable: true })
  rrrrDocumentId: string | null;

  @Field(() => TransactionDocumentEntity, { nullable: true })
  @ManyToOne(() => TransactionDocumentEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'rrrrDocumentId' })
  rrrrDocument: TransactionDocumentEntity | null;

  @Column({ type: 'varchar', nullable: true })
  crDocumentId: string | null;

  @Field(() => TransactionDocumentEntity, { nullable: true })
  @ManyToOne(() => TransactionDocumentEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'crDocumentId' })
  crDocument: TransactionDocumentEntity | null;

  @Field(() => RepairReviewStatus)
  @Column({ type: 'varchar', default: RepairReviewStatus.PENDING })
  status: RepairReviewStatus;

  @Column({ type: 'varchar', nullable: true })
  reviewerAccountId: string | null;

  @Field(() => AccountEntity, { nullable: true })
  @ManyToOne(() => AccountEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'reviewerAccountId' })
  reviewerAccount: AccountEntity | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'text', nullable: true })
  buyerNotes: string | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', nullable: true })
  docusignEnvelopeId: string | null;

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
