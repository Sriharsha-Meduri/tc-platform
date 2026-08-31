import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { TransactionEntity } from '../../transactions/entities/transaction.entity';

export enum CustomReminderStatus {
  SCHEDULED = 'scheduled',
  SENT      = 'sent',
  CANCELLED = 'cancelled',
}

@Entity('custom_reminders')
@Index(['transactionId'])
export class CustomReminderEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'transaction_id' })
  transactionId: string;

  @ManyToOne(() => TransactionEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'transaction_id' })
  transaction: TransactionEntity;

  /** ISO date-time when the reminder should fire */
  @Column({ name: 'fire_at', type: 'timestamptz' })
  fireAt: Date;

  /** Email subject line */
  @Column({ type: 'varchar' })
  subject: string;

  /** Optional custom message body */
  @Column({ type: 'text', nullable: true })
  message: string | null;

  /** Selected recipient roles at creation time (e.g. ['buyer', 'seller']) */
  @Column({ type: 'jsonb', nullable: true })
  recipients: string[] | null;

  /** Matches the jobId set in Bull: `custom-reminder:{id}` */
  @Column({ name: 'bull_job_id', unique: true })
  bullJobId: string;

  @Column({ type: 'varchar', default: CustomReminderStatus.SCHEDULED })
  status: CustomReminderStatus;

  @Column({ name: 'sent_at', type: 'timestamptz', nullable: true })
  sentAt: Date | null;

  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true })
  cancelledAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
