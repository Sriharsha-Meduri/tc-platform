import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { TransactionEntity } from '../../transactions/entities/transaction.entity';
import { AccountEntity } from '../../accounts/entities/account.entity';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';
export type ApprovalType = 'buyer_agent_contingency_removal' | 'buyer_agent_association';

@Entity('approval_requests')
export class ApprovalRequestEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  transactionId: string;

  @ManyToOne(() => TransactionEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'transactionId' })
  transaction: TransactionEntity;

  @Column({ type: 'varchar' })
  type: ApprovalType;

  @Column({ type: 'varchar', default: 'pending' })
  status: ApprovalStatus;

  @Column({ type: 'uuid', nullable: true })
  requestedBy: string | null;

  @ManyToOne(() => AccountEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'requestedBy' })
  requestedByAccount: AccountEntity;

  @CreateDateColumn({ type: 'timestamptz' })
  requestedAt: Date;

  @Column({ type: 'uuid', nullable: true })
  respondedBy: string | null;

  @ManyToOne(() => AccountEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'respondedBy' })
  respondedByAccount: AccountEntity;

  @Column({ type: 'timestamptz', nullable: true })
  respondedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  comments: string | null;

  @Column({ type: 'jsonb', nullable: true, default: {} })
  contingencyStatus: Record<string, 'pending' | 'approved' | 'rejected'> | null;

  @Column({ type: 'jsonb', nullable: true })
  emailInfo: { messageId?: string; sentAt?: string; openedAt?: string | null } | null;
}
