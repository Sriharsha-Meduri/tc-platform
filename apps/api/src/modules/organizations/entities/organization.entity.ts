import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { ObjectType, Field, ID, registerEnumType } from '@nestjs/graphql';
import { HideField } from '@nestjs/graphql';
import { OrganizationMembershipEntity } from './organization-membership.entity';
import { TransactionEntity } from '../../transactions/entities/transaction.entity';

export enum OrgType {
  BROKERAGE                     = 'brokerage',
  TEAM                          = 'team',
  TRANSACTION_COORDINATION_CO   = 'transaction_coordination_company',
  TITLE_COMPANY                 = 'title_company',
  ESCROW_COMPANY                = 'escrow_company',
  LENDER                        = 'lender',
  LAW_FIRM                      = 'law_firm',
}
registerEnumType(OrgType, { name: 'OrgType' });

export enum OrgStatus {
  PENDING_APPROVAL = 'pending_approval',
  ACTIVE           = 'active',
  INACTIVE         = 'inactive',
  SUSPENDED        = 'suspended',
}
registerEnumType(OrgStatus, { name: 'OrgStatus' });

@ObjectType()
@Entity('real_estate_organizations')
export class OrganizationEntity {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field()
  @Column()
  name: string;

  @Field(() => OrgType)
  @Column({ type: 'varchar' })
  type: OrgType;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', nullable: true })
  licenseNumber: string | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', nullable: true })
  emailDomain: string | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', nullable: true })
  phone: string | null;

  @Field(() => OrgStatus)
  @Column({ type: 'varchar', default: OrgStatus.ACTIVE })
  status: OrgStatus;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', nullable: true })
  addressLine1: string | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', nullable: true })
  addressLine2: string | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', nullable: true })
  city: string | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', nullable: true })
  state: string | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', nullable: true })
  postalCode: string | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', nullable: true })
  country: string | null;

  @HideField()
  @Column({ type: 'jsonb', nullable: true })
  metadataJson: Record<string, unknown> | null;

  @Field(() => [OrganizationMembershipEntity], { nullable: true })
  @OneToMany(() => OrganizationMembershipEntity, (m) => m.organization, { eager: false })
  memberships?: OrganizationMembershipEntity[];

  @Field(() => [TransactionEntity], { nullable: true })
  @OneToMany(() => TransactionEntity, (t) => t.organization, { eager: false })
  transactions?: TransactionEntity[];

  @Field()
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Field()
  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
