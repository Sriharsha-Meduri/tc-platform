import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { TransactionEntity } from '../../transactions/entities/transaction.entity';
import { TransactionEventEntity } from '../../transaction-events/entities/transaction-event.entity';

export enum ReminderStatus {
  SCHEDULED = 'scheduled',
  SENT      = 'sent',
  CANCELLED = 'cancelled',
  SKIPPED   = 'skipped',
}

@Entity('transaction_event_reminders')
@Index(['transactionId'])
@Index(['transactionEventId'])
export class TransactionEventReminderEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'transaction_id' })
  transactionId: string;

  @ManyToOne(() => TransactionEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'transaction_id' })
  transaction: TransactionEntity;

  @Column({ name: 'transaction_event_id' })
  transactionEventId: string;

  @ManyToOne(() => TransactionEventEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'transaction_event_id' })
  transactionEvent: TransactionEventEntity;

  /** Matches the jobId set in Bull: `reminder:{transactionEventId}:{label}` e.g. "7d", "30m" */
  @Column({ name: 'bull_job_id', unique: true })
  bullJobId: string;

  /**
   * Raw offset label as parsed from REMINDER_SCHEDULE, e.g. "7d", "3d", "2h", "30m".
   * This is the primary identifier — use this for display and job ID construction.
   */
  @Column({ name: 'offset_label', type: 'varchar' })
  offsetLabel: string;

  /**
   * Legacy int offset in days (7, 3, 0). Kept for historical reference on existing rows.
   * Nullable for rows created after the offset_label migration.
   */
  @Column({ name: 'days_before_deadline', type: 'int', nullable: true })
  daysBeforeDeadline: number | null;

  @Column({ name: 'scheduled_fire_at', type: 'timestamptz' })
  scheduledFireAt: Date;

  @Column({ name: 'status', type: 'varchar', default: ReminderStatus.SCHEDULED })
  status: ReminderStatus;

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
