import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn, Index, Unique,
} from 'typeorm';
import { ObjectType, Field, ID, registerEnumType } from '@nestjs/graphql';
import { TransactionEntity } from './transaction.entity';
import { AccountEntity } from '../../accounts/entities/account.entity';

export enum TransactionStage {
  INTAKE      = 'intake',
  CONTRACT    = 'contract',
  DISCLOSURES = 'disclosures',
  INSPECTION  = 'inspection',
  APPRAISAL   = 'appraisal',
  LOAN        = 'loan',
  ESCROW      = 'escrow',
  CLOSING     = 'closing',
  POST_CLOSE  = 'post_close',
}

export enum StageInstanceStatus {
  PENDING   = 'pending',
  ACTIVE    = 'active',
  COMPLETED = 'completed',
  WAIVED    = 'waived',
}

registerEnumType(TransactionStage,    { name: 'TransactionStage' });
registerEnumType(StageInstanceStatus, { name: 'StageInstanceStatus' });

/** Sort order for the 9 stages — used to order instances in queries. */
export const STAGE_SORT_ORDER: Record<TransactionStage, number> = {
  [TransactionStage.INTAKE]:      1,
  [TransactionStage.CONTRACT]:    2,
  [TransactionStage.DISCLOSURES]: 3,
  [TransactionStage.INSPECTION]:  4,
  [TransactionStage.APPRAISAL]:   5,
  [TransactionStage.LOAN]:        6,
  [TransactionStage.ESCROW]:      7,
  [TransactionStage.CLOSING]:     8,
  [TransactionStage.POST_CLOSE]:  9,
};

@ObjectType()
@Entity('transaction_stage_instances')
@Unique(['transactionId', 'stage'])
@Index(['transactionId'])
@Index(['status'])
export class TransactionStageInstanceEntity {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  transactionId: string;

  @Field(() => TransactionEntity)
  @ManyToOne(() => TransactionEntity, (t) => t.stageInstances, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'transactionId' })
  transaction: TransactionEntity;

  @Field(() => TransactionStage)
  @Column({ type: 'varchar' })
  stage: TransactionStage;

  @Field(() => StageInstanceStatus)
  @Column({ type: 'varchar', default: StageInstanceStatus.PENDING })
  status: StageInstanceStatus;

  @Field(() => Date, { nullable: true })
  @Column({ type: 'timestamptz', nullable: true })
  startedAt: Date | null;

  @Field(() => Date, { nullable: true })
  @Column({ type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @Field(() => Date, { nullable: true })
  @Column({ type: 'timestamptz', nullable: true })
  waivedAt: Date | null;

  @Column({ type: 'varchar', nullable: true })
  createdByAccountId: string | null;

  @Field(() => AccountEntity, { nullable: true })
  @ManyToOne(() => AccountEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'createdByAccountId' })
  createdByAccount: AccountEntity | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Field()
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Field()
  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
