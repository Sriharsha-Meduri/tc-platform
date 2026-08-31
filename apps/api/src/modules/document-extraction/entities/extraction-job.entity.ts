import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('extraction_jobs')
export class ExtractionJobEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', default: 'processing' })
  status: string;

  @Column({ type: 'jsonb', nullable: true })
  progressJson: Record<string, unknown> | null;

  @Column({ type: 'int', default: 0 })
  progressVersion: number;

  @Column({ type: 'jsonb', nullable: true })
  resultJson: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  draftResultJson: Record<string, unknown> | null;

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @Column({ type: 'jsonb', nullable: true })
  errorDetailsJson: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
