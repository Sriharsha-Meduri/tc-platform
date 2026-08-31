import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  OneToOne, JoinColumn,
} from 'typeorm';
import { ObjectType, Field, ID } from '@nestjs/graphql';
import { TransactionEntity } from '../../transactions/entities/transaction.entity';

/** One row per transaction — escrow contact captured via the Seller Agent secure upload page. */
@ObjectType()
@Entity('escrow_information')
export class EscrowInformationEntity {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  transactionId: string;

  @OneToOne(() => TransactionEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'transactionId' })
  transaction: TransactionEntity;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', nullable: true })
  escrowContactName: string | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', nullable: true })
  escrowEmail: string | null;

  /** Escrow/file number — entered by the Escrow Officer on their own secure upload page. */
  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', nullable: true })
  escrowNumber: string | null;

  /** Answered by the Escrow Officer on their own secure upload page — tri-state: not yet answered / yes / no. */
  @Field(() => Boolean, { nullable: true })
  @Column({ type: 'boolean', nullable: true })
  willSendDocumentsToBuyer: boolean | null;

  @Field()
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Field()
  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
