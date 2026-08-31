import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  OneToOne, JoinColumn,
} from 'typeorm';
import { ObjectType, Field, ID } from '@nestjs/graphql';
import { TransactionEntity } from '../../transactions/entities/transaction.entity';

/** One row per transaction — whether the property is subject to an HOA, captured via the Seller Agent secure upload page. */
@ObjectType()
@Entity('hoa_information')
export class HoaInformationEntity {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  transactionId: string;

  @OneToOne(() => TransactionEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'transactionId' })
  transaction: TransactionEntity;

  /** Tri-state: null = not yet answered. */
  @Field(() => Boolean, { nullable: true })
  @Column({ type: 'boolean', nullable: true })
  hasHoa: boolean | null;

  @Field()
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Field()
  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
