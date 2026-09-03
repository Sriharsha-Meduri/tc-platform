import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  OneToOne, JoinColumn,
} from 'typeorm';
import { ObjectType, Field, ID, Float } from '@nestjs/graphql';
import { TransactionEntity } from '../../transactions/entities/transaction.entity';

/**
 * One row per transaction: the seller-side selections a Listing TC captures to
 * open escrow and drive the Escrow Opening email: the seller agent's preferred
 * escrow and title companies, the seller agent commission, the home warranty
 * company (and who pays for it), and the NHD company. Mirrors
 * BuyerSideInformationEntity: one-row-per-transaction, numeric columns
 * round-trip as JS numbers so the upsert diffing works.
 */
@ObjectType()
@Entity('seller_side_information')
export class SellerSideInformationEntity {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  transactionId: string;

  @OneToOne(() => TransactionEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'transactionId' })
  transaction: TransactionEntity;

  /** Seller agent's preferred escrow company (the actual escrow contact/email lives in escrow_information). */
  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', nullable: true })
  preferredEscrowCompany: string | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', nullable: true })
  preferredTitleCompany: string | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', nullable: true })
  titleContactName: string | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', nullable: true })
  titleContactEmail: string | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', nullable: true })
  titleContactPhone: string | null;

  /** Seller agent's gross commission (dollar amount) for this transaction. */
  @Field(() => Float, { nullable: true })
  @Column({
    type: 'numeric', nullable: true,
    transformer: { to: (v: number | null) => v, from: (v: string | null) => (v === null ? null : parseFloat(v)) },
  })
  sellerAgentCommission: number | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', nullable: true })
  homeWarrantyCompany: string | null;

  /** Whether the seller is paying for the home warranty. Tri-state: null = not yet answered. */
  @Field(() => Boolean, { nullable: true })
  @Column({ type: 'boolean', nullable: true })
  sellerPaysHomeWarranty: boolean | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', nullable: true })
  nhdCompany: string | null;

  @Field()
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Field()
  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
