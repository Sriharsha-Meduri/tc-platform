import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { TransactionEntity } from '../../transactions/entities/transaction.entity';
import { TransactionEventEntity } from '../../transaction-events/entities/transaction-event.entity';
import type { ContingencyType } from './contingency-removal-reminder.entity';

export enum NoticeToPerformReminderStatus {
  SCHEDULED = 'scheduled',
  SENT      = 'sent',
  CANCELLED = 'cancelled',
  SKIPPED   = 'skipped',
}

/**
 * One row per scheduled Notice to Perform (NTP) prompt. Fires after a
 * contingency deadline passes without the contingency being removed, prompting
 * the Listing TC to consider issuing an NTP. Seller-side only.
 */
@Entity('notice_to_perform_reminders')
@Index(['transactionId'])
@Index(['transactionId', 'contingencyType'])
export class NoticeToPerformReminderEntity {
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

  @Column({ name: 'contingency_type', type: 'varchar' })
  contingencyType: ContingencyType;

  /** The contingency deadline the NTP window is measured from. */
  @Column({ name: 'deadline_at', type: 'timestamptz' })
  deadlineAt: Date;

  /** When the NTP prompt fires (deadline + NTP days). */
  @Column({ name: 'fire_at', type: 'timestamptz' })
  fireAt: Date;

  /** The Listing TC email the prompt is sent to. */
  @Column({ name: 'recipient_email', type: 'varchar' })
  recipientEmail: string;

  @Column({ name: 'bull_job_id', unique: true })
  bullJobId: string;

  @Column({ name: 'status', type: 'varchar', default: NoticeToPerformReminderStatus.SCHEDULED })
  status: NoticeToPerformReminderStatus;

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
