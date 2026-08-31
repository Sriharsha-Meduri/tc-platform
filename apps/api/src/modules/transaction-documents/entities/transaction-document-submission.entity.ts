import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  ManyToOne, OneToMany, JoinColumn, Index,
} from 'typeorm';
import { ObjectType, Field, ID, Int, registerEnumType } from '@nestjs/graphql';
import { TransactionEntity } from '../../transactions/entities/transaction.entity';
import { TransactionPartyEntity } from '../../transaction-parties/entities/transaction-party.entity';
import { TransactionDocumentEntity } from './transaction-document.entity';

export enum SubmissionStatus {
  PENDING      = 'pending',       // uploaded, extraction not yet run
  UNDER_REVIEW = 'under_review',  // extraction complete, TC reviewing
  ISSUES_FOUND = 'issues_found',  // extraction flagged missing/invalid fields
  ACCEPTED     = 'accepted',      // all documents in submission approved
  SUPERSEDED   = 'superseded',    // replaced by a newer submission round
}
registerEnumType(SubmissionStatus, { name: 'SubmissionStatus' });

@ObjectType()
@Entity('transaction_document_submissions')
@Index(['transactionId'])
@Index(['status'])
export class TransactionDocumentSubmissionEntity {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'transaction_id' })
  transactionId: string;

  @Field(() => TransactionEntity)
  @ManyToOne(() => TransactionEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'transaction_id' })
  transaction: TransactionEntity;

  // Auto-incremented per transaction: 1, 2, 3…
  @Field(() => Int)
  @Column({ name: 'submission_no', type: 'integer' })
  submissionNo: number;

  @Field(() => SubmissionStatus)
  @Column({ type: 'varchar', default: SubmissionStatus.PENDING })
  status: SubmissionStatus;

  // The party (seller's agent, TC, etc.) who submitted this round
  @Column({ name: 'submitted_by_party_id', type: 'varchar', nullable: true })
  submittedByPartyId: string | null;

  @Field(() => TransactionPartyEntity, { nullable: true })
  @ManyToOne(() => TransactionPartyEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'submitted_by_party_id' })
  submittedByParty: TransactionPartyEntity | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Field(() => [TransactionDocumentEntity], { nullable: true })
  @OneToMany(() => TransactionDocumentEntity, (d) => d.submission, { eager: false })
  documents?: TransactionDocumentEntity[];

  @Field()
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Field()
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
