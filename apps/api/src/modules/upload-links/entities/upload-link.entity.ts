import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { ObjectType, Field, ID, Int, registerEnumType, HideField } from '@nestjs/graphql';
import { TransactionEntity } from '../../transactions/entities/transaction.entity';
import { TransactionPartyEntity } from '../../transaction-parties/entities/transaction-party.entity';
import { AccountEntity } from '../../accounts/entities/account.entity';

export enum UploadLinkStatus {
  ACTIVE   = 'active',
  REVOKED  = 'revoked',
  /** Superseded by a regenerated link — the new link's id is in `replacedByUploadLinkId`. */
  REPLACED = 'replaced',
}
registerEnumType(UploadLinkStatus, { name: 'UploadLinkStatus' });

/**
 * A secure, no-login, single-transaction document-upload link.
 *
 * The bearer secret is the raw token embedded in the emailed URL — it is never
 * persisted. Only `tokenHash` (sha256 of the token) is stored, so a leaked DB
 * row can't be used to forge a valid link. "Expired" is intentionally not a
 * stored status — it's derived from `status === ACTIVE && expiresAt < now()`.
 */
@ObjectType()
@Entity('upload_links')
@Index(['transactionId'])
@Index(['recipientPartyId'])
export class UploadLinkEntity {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  transactionId: string;

  @Field(() => TransactionEntity)
  @ManyToOne(() => TransactionEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'transactionId' })
  transaction: TransactionEntity;

  @Column({ type: 'uuid', nullable: true })
  recipientPartyId: string | null;

  @Field(() => TransactionPartyEntity, { nullable: true })
  @ManyToOne(() => TransactionPartyEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'recipientPartyId' })
  recipientParty: TransactionPartyEntity | null;

  /** Mirrors PartyRole — kept as a plain string so this module isn't hard-coded to any one role. */
  @Field()
  @Column({ type: 'varchar' })
  recipientRole: string;

  @Field()
  @Column({ type: 'varchar' })
  recipientName: string;

  @Field()
  @Column({ type: 'varchar' })
  recipientEmail: string;

  /** e.g. 'document_upload' — what this link authorizes the recipient to do. */
  @Field()
  @Column({ type: 'varchar' })
  purpose: string;

  /**
   * Optional secondary recipient CC'd on the delivery email (e.g. the Seller
   * Transaction Coordinator on the Seller Agent's link) — they use this same
   * link/token, not a separate one, so their identity travels with the link
   * itself for both the email send and later audit attribution.
   */
  @Column({ type: 'uuid', nullable: true })
  ccPartyId: string | null;

  @Field(() => TransactionPartyEntity, { nullable: true })
  @ManyToOne(() => TransactionPartyEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'ccPartyId' })
  ccParty: TransactionPartyEntity | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', nullable: true })
  ccRole: string | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', nullable: true })
  ccName: string | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', nullable: true })
  ccEmail: string | null;

  /** sha256(token) — the raw token itself is never persisted. */
  @HideField()
  @Column({ type: 'varchar', unique: true })
  tokenHash: string;

  @Field(() => UploadLinkStatus)
  @Column({ type: 'varchar', default: UploadLinkStatus.ACTIVE })
  status: UploadLinkStatus;

  @Field()
  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Field(() => Date, { nullable: true })
  @Column({ type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @Column({ type: 'uuid', nullable: true })
  replacedByUploadLinkId: string | null;

  @Column({ type: 'uuid', nullable: true })
  createdByAccountId: string | null;

  @Field(() => AccountEntity, { nullable: true })
  @ManyToOne(() => AccountEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'createdByAccountId' })
  createdByAccount: AccountEntity | null;

  /** Stamped once the link-request email has actually been sent — retries check this before re-sending. */
  @Field(() => Date, { nullable: true })
  @Column({ type: 'timestamptz', nullable: true })
  emailSentAt: Date | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', nullable: true })
  emailMessageId: string | null;

  @Field(() => Date, { nullable: true })
  @Column({ type: 'timestamptz', nullable: true })
  firstAccessedAt: Date | null;

  @Field(() => Date, { nullable: true })
  @Column({ type: 'timestamptz', nullable: true })
  lastAccessedAt: Date | null;

  @Field(() => Int)
  @Column({ type: 'integer', default: 0 })
  uploadCount: number;

  /** Stamped once, the first time the Seller Agent checklist becomes complete — the idempotency guard so the DocuSign confirmation-request email is never re-sent. Seller Agent links only. */
  @Field(() => Date, { nullable: true })
  @Column({ type: 'timestamptz', nullable: true })
  docusignConfirmationRequestedAt: Date | null;

  /** Stamped when the Seller (via the emailed link, or directly on this same page) confirms sending their documents to the Buyer for signature. */
  @Field(() => Date, { nullable: true })
  @Column({ type: 'timestamptz', nullable: true })
  docusignConfirmedAt: Date | null;

  /** Stamped the last time a "CDA is ready" reply email was sent to this link's recipient — Buyer Agent and Broker links only. */
  @Field(() => Date, { nullable: true })
  @Column({ type: 'timestamptz', nullable: true })
  cdaNotifiedAt: Date | null;

  /** A content fingerprint of the CDA this recipient was last notified about — compared against the current CDA's own fingerprint so a regeneration with unchanged financial content never re-sends the notification. */
  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', nullable: true })
  cdaNotifiedContentHash: string | null;

  @Field()
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
