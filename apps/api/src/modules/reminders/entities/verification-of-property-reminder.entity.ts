import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { TransactionEntity } from '../../transactions/entities/transaction.entity';
import { TransactionEventEntity } from '../../transaction-events/entities/transaction-event.entity';
import { UploadLinkEntity } from '../../upload-links/entities/upload-link.entity';

export enum VerificationOfPropertyReminderStatus {
  SCHEDULED = 'scheduled',
  SENT      = 'sent',
  CANCELLED = 'cancelled',
  SKIPPED   = 'skipped',
}

/**
 * Tracks the single Buyer Side reminder for the Verification of Property
 * checklist item on the Buyer Agent secure upload link, fired N days
 * (transaction.buyerSideReminderLeadDays, default 3) before Close of Escrow.
 * A dedicated sibling to ContingencyRemovalReminderEntity — same lifecycle
 * (scheduled/sent/cancelled/skipped, cancel+reschedule on change) — but
 * unlike that one, this reminder's email embeds a working secure upload
 * link, minted fresh at fire time (see VerificationOfPropertyReminderSchedulerService).
 */
@Entity('verification_of_property_reminders')
@Index(['transactionId'])
export class VerificationOfPropertyReminderEntity {
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

  @Column({ name: 'deadline_at', type: 'timestamptz' })
  deadlineAt: Date;

  /** Matches the jobId set in Bull: `vp-reminder:{transactionId}:{deadlineAt}` */
  @Column({ name: 'bull_job_id', unique: true })
  bullJobId: string;

  @Column({ name: 'status', type: 'varchar', default: VerificationOfPropertyReminderStatus.SCHEDULED })
  status: VerificationOfPropertyReminderStatus;

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
