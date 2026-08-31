import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { TransactionEntity } from '../../transactions/entities/transaction.entity';

export enum DocuSignEnvelopeStatus {
  CREATED = 'created',
  SENT = 'sent',
  DELIVERED = 'delivered',
  COMPLETED = 'completed',
  DECLINED = 'declined',
  VOIDED = 'voided',
  /** The DocuSign API call itself failed — no envelope was actually created on DocuSign's side. */
  FAILED = 'send_failed',
}

@Entity('docusign_envelopes')
@Index(['transactionId'])
@Index(['envelopeId'])
export class DocuSignEnvelopeEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  transactionId: string;

  @ManyToOne(() => TransactionEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'transactionId' })
  transaction: TransactionEntity;

  @Column({ type: 'varchar', nullable: true })
  envelopeId: string | null;

  @Column({ type: 'varchar', default: 'created' })
  status: string;

  @Column({ type: 'varchar' })
  subject: string;

  @Column({ type: 'text', nullable: true })
  message: string | null;

  @Column({ type: 'jsonb', nullable: true })
  signers: Array<{ name: string; email: string; recipientId?: string; status?: string }> | null;

  @Column({ type: 'jsonb', nullable: true })
  documentIds: string[] | null;

  @Column({ type: 'timestamptz', nullable: true })
  sentAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  deliveredAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  /**
   * Set exactly once, atomically, by the completion handler that wins the
   * claim race for this envelope — the real idempotency barrier for signed
   * document promotion. A non-null value means post-completion processing
   * (signed PDF promotion) has already run or is in progress; every other
   * concurrent/repeated sync (cron, manual, another Fly machine) must skip it.
   */
  @Column({ type: 'timestamptz', nullable: true })
  completedProcessedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  lastStatusCheckedAt: Date | null;

  @Column({ type: 'varchar', nullable: true })
  error: string | null;

  @Column({ type: 'jsonb', nullable: true })
  signingUrls: Array<{ name: string; email: string; signing_url: string }> | null;

  @Column({ type: 'varchar', nullable: true })
  envelopeUri: string | null;

  /** View-only recipients (e.g. the Buyer Agent CC'd on a Seller-side send) — parallel structure to `signers`, never assigned signature/initial tabs. */
  @Column({ type: 'jsonb', nullable: true })
  ccRecipients: Array<{ name: string; email: string; recipientId?: string }> | null;

  /** The upload link this envelope originated from, when created via a link-scoped workflow (e.g. the Seller Agent's own "send to buyer" flow) — null for envelopes created from the authenticated dashboard. */
  @Column({ type: 'uuid', nullable: true })
  uploadLinkId: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
