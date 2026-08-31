import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { ObjectType, Field, ID, registerEnumType } from '@nestjs/graphql';
import { TransactionEntity } from '../../transactions/entities/transaction.entity';
import { AccountEntity } from '../../accounts/entities/account.entity';

export enum AccessLevel {
  READ       = 'read',        // view-only — see transaction, parties, documents, messages
  COLLABORATE = 'collaborate', // read + add tasks, upload documents, send messages
  MANAGE     = 'manage',      // full access — same as an org member on this transaction
}
registerEnumType(AccessLevel, { name: 'AccessLevel' });

@ObjectType()
@Entity('transaction_access_grants')
@Index(['transactionId'])
@Index(['accountId'])
@Index(['transactionId', 'accountId'], { unique: true })
export class TransactionAccessGrantEntity {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  transactionId: string;

  @Field(() => TransactionEntity)
  @ManyToOne(() => TransactionEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'transactionId' })
  transaction: TransactionEntity;

  @Column()
  accountId: string;

  @Field(() => AccountEntity)
  @ManyToOne(() => AccountEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'accountId' })
  account: AccountEntity;

  @Column({ type: 'varchar', nullable: true })
  grantedByAccountId: string | null;

  @Field(() => AccountEntity, { nullable: true })
  @ManyToOne(() => AccountEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'grantedByAccountId' })
  grantedByAccount: AccountEntity | null;

  @Field(() => AccessLevel)
  @Column({ type: 'varchar', default: AccessLevel.COLLABORATE })
  accessLevel: AccessLevel;

  @Field()
  @CreateDateColumn({ type: 'timestamptz' })
  grantedAt: Date;

  @Field(() => Date, { nullable: true })
  @Column({ type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  @Field(() => Date, { nullable: true })
  @Column({ type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @Field()
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
