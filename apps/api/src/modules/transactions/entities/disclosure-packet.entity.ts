import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  OneToOne, JoinColumn, Index,
} from 'typeorm';
import { ObjectType, Field, ID, registerEnumType } from '@nestjs/graphql';
import { TransactionEntity } from './transaction.entity';

/**
 * The seller disclosure packet lifecycle (Lane B of the Listing TC workflow):
 * the packet is sent to the seller, the seller completes it, the Listing TC
 * reviews it, and the reviewed packet is forwarded to the buyer side. One
 * packet per transaction.
 */
export enum DisclosurePacketStatus {
  /** Sent to the seller for completion (the seller-agent upload link is out). */
  SENT_TO_SELLER   = 'sent_to_seller',
  /** Seller has returned the completed disclosures; awaiting TC review. */
  SELLER_COMPLETED = 'seller_completed',
  /** Listing TC has reviewed the disclosures for completeness. */
  TC_REVIEWED      = 'tc_reviewed',
  /** Reviewed packet forwarded to the Buyer TC and Buyer Agent. */
  SENT_TO_BUYER    = 'sent_to_buyer',
}
registerEnumType(DisclosurePacketStatus, { name: 'DisclosurePacketStatus' });

@ObjectType()
@Entity('disclosure_packets')
@Index(['status'])
export class DisclosurePacketEntity {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  transactionId: string;

  @OneToOne(() => TransactionEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'transactionId' })
  transaction: TransactionEntity;

  @Field(() => DisclosurePacketStatus)
  @Column({ type: 'varchar', default: DisclosurePacketStatus.SENT_TO_SELLER })
  status: DisclosurePacketStatus;

  @Field(() => Date, { nullable: true })
  @Column({ type: 'timestamptz', nullable: true })
  sentToSellerAt: Date | null;

  @Field(() => Date, { nullable: true })
  @Column({ type: 'timestamptz', nullable: true })
  sellerCompletedAt: Date | null;

  @Field(() => Date, { nullable: true })
  @Column({ type: 'timestamptz', nullable: true })
  reviewedAt: Date | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', nullable: true })
  reviewedByAccountId: string | null;

  @Field(() => Date, { nullable: true })
  @Column({ type: 'timestamptz', nullable: true })
  forwardedAt: Date | null;

  /** Snapshot of who the reviewed packet was forwarded to (emails + document titles). */
  @Column({ type: 'jsonb', nullable: true })
  forwardedTo: Record<string, unknown> | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'text', nullable: true })
  reviewNotes: string | null;

  @Field()
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Field()
  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
