import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { TransactionEntity } from '../../transactions/entities/transaction.entity';
import { TransactionEventEntity } from '../../transaction-events/entities/transaction-event.entity';
import { UploadLinkEntity } from '../../upload-links/entities/upload-link.entity';

export enum ContingencyRemovalReminderStatus {
  SCHEDULED = 'scheduled',
  SENT      = 'sent',
  CANCELLED = 'cancelled',
  SKIPPED   = 'skipped',
}

export type ContingencyType = 'inspection' | 'loan' | 'appraisal';

/**
 * Tracks the single "1 day before deadline" reminder for one contingency
 * type on one transaction — a dedicated, purpose-built sibling to
 * TransactionEventReminderEntity's generic multi-offset reminders. This one
 * replies in the Buyer Agent upload-link email thread rather than notifying
 * a broad recipient list, and supports cancel/reschedule when the negotiated
 * deadline changes (the generic reminders only ever schedule for brand-new
 * events, never reschedule an existing one).
 */
@Entity('contingency_removal_reminders')
@Index(['transactionId'])
@Index(['transactionId', 'contingencyType'])
export class ContingencyRemovalReminderEntity {
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

  @Column({ name: 'contingency_type', type: 'varchar' })
  contingencyType: ContingencyType;

  @Column({ name: 'deadline_at', type: 'timestamptz' })
  deadlineAt: Date;

  /** Matches the jobId set in Bull: `contingency-reminder:{transactionEventId}` */
  @Column({ name: 'bull_job_id', unique: true })
  bullJobId: string;

  @Column({ name: 'status', type: 'varchar', default: ContingencyRemovalReminderStatus.SCHEDULED })
  status: ContingencyRemovalReminderStatus;

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
