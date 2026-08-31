import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { HideField } from '@nestjs/graphql';
import { AccountEntity } from '../../accounts/entities/account.entity';

@Entity('docusign_connections')
@Index(['accountId'])
export class DocuSignConnectionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', unique: true })
  accountId: string;

  @ManyToOne(() => AccountEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'accountId' })
  account: AccountEntity;

  @Column({ type: 'varchar', name: 'docusignUserId' })
  docusignAccountName: string;

  @Column({ type: 'varchar', name: 'accountEmail' })
  docusignEmail: string;

  @Column({ type: 'varchar' })
  docusignAccountId: string;

  @Column({ type: 'varchar', name: 'baseUri' })
  docusignBaseUri: string;

  @HideField()
  @Column({ type: 'text' })
  accessToken: string;

  @HideField()
  @Column({ type: 'varchar', nullable: true })
  refreshToken: string;

  @Column({ type: 'timestamptz', nullable: true })
  tokenExpiresAt: Date | null;

  @Column({ type: 'varchar', default: 'connected' })
  status: string;

  @Column({ type: 'timestamptz', nullable: true })
  connectedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
