import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { ObjectType, Field, ID, registerEnumType } from '@nestjs/graphql';
import { HideField } from '@nestjs/graphql';
import { AccountEntity } from '../../accounts/entities/account.entity';
import { OrganizationEntity } from './organization.entity';

export enum MemberRole {
  BROKER_ADMIN             = 'broker_admin',
  AGENT                    = 'agent',
  TRANSACTION_COORDINATOR  = 'transaction_coordinator',
}
registerEnumType(MemberRole, { name: 'MemberRole' });

export enum MemberAccessScope {
  ALL_TRANSACTIONS = 'all_transactions',  // sees every transaction in the org
  ASSIGNED_ONLY    = 'assigned_only',     // sees only transactions they are a party on
}
registerEnumType(MemberAccessScope, { name: 'MemberAccessScope' });

export enum MembershipStatus {
  PENDING  = 'pending',
  ACTIVE   = 'active',
  REJECTED = 'rejected',
}
registerEnumType(MembershipStatus, { name: 'MembershipStatus' });

@ObjectType()
@Entity('organization_memberships')
@Index(['organizationId', 'accountId'], { unique: true })
export class OrganizationMembershipEntity {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  organizationId: string;

  @Field(() => OrganizationEntity)
  @ManyToOne(() => OrganizationEntity, (o) => o.memberships, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organizationId' })
  organization: OrganizationEntity;

  @Column()
  accountId: string;

  @Field(() => AccountEntity)
  @ManyToOne(() => AccountEntity, (a) => a.memberships, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'accountId' })
  account: AccountEntity;

  @Field(() => MemberRole)
  @Column({ type: 'varchar' })
  role: MemberRole;

  // Controls whether this member sees all org transactions or only transactions
  // they are explicitly assigned to as a party.
  @Field(() => MemberAccessScope)
  @Column({ name: 'access_scope', type: 'varchar', default: MemberAccessScope.ASSIGNED_ONLY })
  accessScope: MemberAccessScope;

  @Field(() => MembershipStatus)
  @Column({ type: 'varchar', default: MembershipStatus.ACTIVE })
  status: MembershipStatus;

  @Field()
  @Column({ default: false })
  isPrimary: boolean;

  @HideField()
  @Column({ type: 'jsonb', nullable: true })
  permissionsJson: Record<string, unknown> | null;

  @Field(() => Date, { nullable: true })
  @Column({ type: 'timestamptz', nullable: true })
  joinedAt: Date | null;

  @Field()
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Field()
  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
