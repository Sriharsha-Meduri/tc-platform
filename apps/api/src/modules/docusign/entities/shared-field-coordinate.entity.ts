import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, JoinColumn, ManyToOne } from 'typeorm';
import { AccountEntity } from '../../accounts/entities/account.entity';

@Entity('shared_field_coordinates')
export class SharedFieldCoordinateEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  formCode: string;

  @Column({ type: 'varchar', nullable: true })
  formVersion: string | null;

  @Column({ type: 'integer' })
  pageNumber: number;

  @Column({ type: 'varchar' })
  fieldLabel: string;

  @Column({ type: 'varchar' })
  fieldType: string;

  @Column({ type: 'varchar' })
  docuSignTabType: string;

  @Column({ type: 'varchar' })
  recipientRole: string;

  @Column({ type: 'float' })
  xPosition: number;

  @Column({ type: 'float' })
  yPosition: number;

  @Column({ type: 'float', nullable: true })
  width: number | null;

  @Column({ type: 'float', nullable: true })
  height: number | null;

  @Column({ type: 'uuid' })
  createdBy: string;

  @ManyToOne(() => AccountEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'createdBy' })
  createdByAccount: AccountEntity;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  lastVerifiedAt: Date | null;

  @Column({ type: 'integer', default: 1 })
  verificationCount: number;

  @Column({ type: 'integer', default: 0 })
  successCount: number;
}
