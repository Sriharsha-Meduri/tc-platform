import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('pending_uploads')
export class PendingUploadEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  transactionId: string;

  @Column()
  stage: string;

  @Column()
  storageKey: string;

  @Column()
  fileName: string;

  @Column()
  mimeType: string;

  @Column()
  title: string;

  @Column({ type: 'varchar', nullable: true })
  detectedFormCode: string | null;

  @Column({ type: 'jsonb', nullable: true })
  extractionJson: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  complianceJson: Record<string, unknown> | null;

  @Column({ type: 'varchar', nullable: true })
  pdfType: string | null;

  @Column({ type: 'varchar', nullable: true })
  interactionId: string | null;

  @Column()
  existingDocId: string;

  @Column({ type: 'varchar', nullable: true })
  existingFormCode: string | null;

  @Column({ type: 'varchar', nullable: true })
  existingFormName: string | null;

  @Column({ type: 'integer', default: 1 })
  existingVersionNo: number;

  @Column({ type: 'timestamptz', nullable: true })
  existingUploadedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
