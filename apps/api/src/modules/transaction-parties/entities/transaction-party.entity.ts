import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { ObjectType, Field, ID, registerEnumType } from '@nestjs/graphql';
import { HideField } from '@nestjs/graphql';
import { TransactionEntity } from '../../transactions/entities/transaction.entity';
import { ContactEntity } from '../../contacts/entities/contact.entity';
import { OrganizationEntity } from '../../organizations/entities/organization.entity';
import { AccountEntity } from '../../accounts/entities/account.entity';

export enum PartyRole {
  BUYER                          = 'buyer',
  SELLER                         = 'seller',
  BUYER_AGENT                    = 'buyer_agent',
  BUYER_AGENT_REPRESENTATIVE     = 'buyer_agent_representative',
  SELLER_AGENT                   = 'seller_agent',
  SELLER_AGENT_REPRESENTATIVE    = 'seller_agent_representative',
  BUYER_TRANSACTION_COORDINATOR  = 'buyer_transaction_coordinator',
  SELLER_TRANSACTION_COORDINATOR = 'seller_transaction_coordinator',
  LENDER                         = 'lender',
  LOAN_OFFICER                   = 'loan_officer',
  ESCROW_OFFICER                 = 'escrow_officer',
  TITLE_OFFICER                  = 'title_officer',
  ATTORNEY                       = 'attorney',
  INSPECTOR                      = 'inspector',
  APPRAISER                      = 'appraiser',
  OTHER                          = 'other',
}
registerEnumType(PartyRole, { name: 'PartyRole' });

@ObjectType()
@Entity('transaction_parties')
@Index(['transactionId'])
@Index(['partyRole'])
export class TransactionPartyEntity {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  transactionId: string;

  @Field(() => TransactionEntity)
  @ManyToOne(() => TransactionEntity, (t) => t.parties, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'transactionId' })
  transaction: TransactionEntity;

  @Column({ type: 'varchar', nullable: true })
  contactId: string | null;

  @Field(() => ContactEntity, { nullable: true })
  @ManyToOne(() => ContactEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'contactId' })
  contact: ContactEntity | null;

  @Column({ type: 'varchar', nullable: true })
  organizationId: string | null;

  @Field(() => OrganizationEntity, { nullable: true })
  @ManyToOne(() => OrganizationEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'organizationId' })
  organization: OrganizationEntity | null;

  // System user linked to this party (agents, TCs, coordinators who have accounts).
  // External parties (buyers, sellers, lenders) leave this null and use contactId only.
  // Independent contractors (e.g. TC hired for one deal) set this without any org membership.
  @Column({ type: 'varchar', nullable: true })
  accountId: string | null;

  @Field(() => AccountEntity, { nullable: true })
  @ManyToOne(() => AccountEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'accountId' })
  account: AccountEntity | null;

  // Records who delegated work to this party (e.g. Carol's agent party → Alice's TC party).
  // Crosses org boundaries — an agent can delegate to an independent contractor.
  @Column({ type: 'varchar', nullable: true })
  delegatedByPartyId: string | null;

  @Field(() => TransactionPartyEntity, { nullable: true })
  @ManyToOne(() => TransactionPartyEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'delegatedByPartyId' })
  delegatedByParty: TransactionPartyEntity | null;

  @Field(() => PartyRole)
  @Column({ type: 'varchar' })
  partyRole: PartyRole;

  @Field()
  @Column()
  displayName: string;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', nullable: true })
  email: string | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', nullable: true })
  phone: string | null;

  @Field()
  @Column({ default: false })
  isPrimary: boolean;

  @Field(() => String, { nullable: true })
  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @HideField()
  @Column({ type: 'jsonb', nullable: true })
  metadataJson: Record<string, unknown> | null;

  @Field()
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Field()
  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
