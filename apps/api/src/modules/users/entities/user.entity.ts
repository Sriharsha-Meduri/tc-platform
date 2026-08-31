import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { ObjectType, Field, ID, registerEnumType } from '@nestjs/graphql';
import { HideField } from '@nestjs/graphql';

export enum UserStatus {
  PENDING   = 'pending',
  ACTIVE    = 'active',
  INACTIVE  = 'inactive',
  SUSPENDED = 'suspended',
}
registerEnumType(UserStatus, { name: 'UserStatus' });

export enum UserRole {
  AGENT                   = 'agent',
  TRANSACTION_COORDINATOR = 'transaction_coordinator',
  BROKER_ADMIN            = 'broker_admin',
  SUPPORT_ADMIN           = 'support_admin',
}
registerEnumType(UserRole, { name: 'UserRole' });

@ObjectType()
@Entity('users')
export class UserEntity {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field()
  @Column({ unique: true })
  email: string;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', nullable: true })
  phone: string | null;

  @HideField()
  @Column()
  passwordHash: string;

  @Field(() => UserStatus)
  @Column({ type: 'varchar', default: UserStatus.ACTIVE })
  status: UserStatus;

  @Field(() => [UserRole])
  @Column('text', { array: true, default: [] })
  roles: UserRole[];

  @Field(() => Date, { nullable: true })
  @Column({ type: 'timestamptz', nullable: true })
  emailVerifiedAt: Date | null;

  @HideField()
  @Column({ type: 'varchar', nullable: true })
  verificationToken: string | null;

  @HideField()
  @Column({ type: 'timestamptz', nullable: true })
  verificationTokenExpiresAt: Date | null;

  @Field(() => Date, { nullable: true })
  @Column({ type: 'timestamptz', nullable: true })
  lastLoginAt: Date | null;

  @Field()
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Field()
  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
