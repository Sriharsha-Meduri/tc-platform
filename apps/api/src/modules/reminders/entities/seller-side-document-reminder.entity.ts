import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { TransactionEntity } from '../../transactions/entities/transaction.entity';
import { TransactionEventEntity } from '../../transaction-events/entities/transaction-event.entity';
import { UploadLinkEntity } from '../../upload-links/entities/upload-link.entity';

export enum SellerSideDocumentReminderStatus {
  SCHEDULED = 'scheduled',
  SENT      = 'sent',
  CANCELLED = 'cancelled',
  SKIPPED   = 'skipped',
}

/**
 * Tracks one Seller Side reminder per required CAR form on the Seller Agent
 * secure upload link, fired N days (transaction.sellerSideReminderLeadDays,
 * default 3) before the Seller Disclosures Due date. Unlike
 * VerificationOfPropertyReminderEntity (a single item), the Seller Agent
 * checklist can have several required documents — each gets its own row/job
 * so it can be independently satisfied/cancelled — but all of them share the
 * same deadlineAt, since there is only one seller-side deadline today. Like
 * VerificationOfPropertyReminderEntity, this reminder's email embeds a
 * working secure upload link, minted fresh at fire time (see
 * SellerSideDocumentReminderSchedulerService).
 */
@Entity('seller_side_document_reminders')
@Index(['transactionId'])
@Index(['transactionId', 'formCode'])
export class SellerSideDocumentReminderEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'transaction_id' })
  transactionId: string;

  @ManyToOne(() => TransactionEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'transaction_id' })
  transaction: TransactionEntity;

  @Column({ name: 'upload_link_id' })
  uploadLinkId: string;

  @ManyToOne(() => UploadLinkEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'upload_link_id' })
  uploadLink: UploadLinkEntity;

  @Column({ name: 'transaction_event_id' })
  transactionEventId: string;

  @ManyToOne(() => TransactionEventEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'transaction_event_id' })
  transactionEvent: TransactionEventEntity;

  @Column({ name: 'form_code' })
  formCode: string;

  @Column({ name: 'form_name' })
  formName: string;

  @Column({ name: 'deadline_at', type: 'timestamptz' })
  deadlineAt: Date;

  /** Matches the jobId set in Bull: `seller-side-reminder:{transactionId}:{formCode}:{deadlineAt}` */
  @Column({ name: 'bull_job_id', unique: true })
  bullJobId: string;

  @Column({ name: 'status', type: 'varchar', default: SellerSideDocumentReminderStatus.SCHEDULED })
  status: SellerSideDocumentReminderStatus;

  @Column({ name: 'cancelled_reason', type: 'text', nullable: true })
  cancelledReason: string | null;

  @Column({ name: 'sent_at', type: 'timestamptz', nullable: true })
  sentAt: Date | null;

  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true })
  cancelledAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
