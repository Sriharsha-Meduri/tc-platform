import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { ObjectType, Field, ID, Int, registerEnumType } from '@nestjs/graphql';
import { HideField } from '@nestjs/graphql';
import { TransactionEntity } from '../../transactions/entities/transaction.entity';
import { TransactionPartyEntity } from '../../transaction-parties/entities/transaction-party.entity';
import { AccountEntity } from '../../accounts/entities/account.entity';
import { TransactionWorkflowStepEntity } from '../../transaction-workflow-steps/entities/transaction-workflow-step.entity';
import { TransactionDocumentSubmissionEntity } from './transaction-document-submission.entity';
import { AiInteractionEntity } from '../../ai-interactions/entities/ai-interaction.entity';
import { UploadLinkEntity } from '../../upload-links/entities/upload-link.entity';

export enum DocumentStatus {
  REQUESTED    = 'requested',
  UPLOADED     = 'uploaded',
  UNDER_REVIEW = 'under_review',
  SIGNED       = 'signed',
  APPROVED     = 'approved',
  REJECTED     = 'rejected',   // TC explicitly rejected after review
  EXPIRED      = 'expired',
  SUPERSEDED   = 'superseded', // replaced by a newer version in a later submission
}
registerEnumType(DocumentStatus, { name: 'DocumentStatus' });

@ObjectType()
@Entity('transaction_documents')
@Index(['transactionId'])
@Index(['status'])
@Index(['dueAt'])
export class TransactionDocumentEntity {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  transactionId: string;

  @Field(() => TransactionEntity)
  @ManyToOne(() => TransactionEntity, (t) => t.documents, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'transactionId' })
  transaction: TransactionEntity;

  @Field()
  @Column()
  documentType: string;

  @Field()
  @Column()
  title: string;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', nullable: true })
  fileName: string | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', nullable: true })
  mimeType: string | null;

  @HideField()
  @Column({ type: 'varchar', nullable: true })
  storageKey: string | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'text', nullable: true })
  storageUrl: string | null;

  @Field(() => Int)
  @Column({ type: 'integer', default: 1 })
  versionNo: number;

  @Field(() => DocumentStatus)
  @Column({ type: 'varchar' })
  status: DocumentStatus;

  @Column({ type: 'varchar', nullable: true })
  requestedFromPartyId: string | null;

  @Field(() => TransactionPartyEntity, { nullable: true })
  @ManyToOne(() => TransactionPartyEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'requestedFromPartyId' })
  requestedFromParty: TransactionPartyEntity | null;

  @Column({ type: 'varchar', nullable: true })
  uploadedByAccountId: string | null;

  @Field(() => AccountEntity, { nullable: true })
  @ManyToOne(() => AccountEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'uploadedByAccountId' })
  uploadedByAccount: AccountEntity | null;

  @Field(() => Date, { nullable: true })
  @Column({ type: 'timestamptz', nullable: true })
  signedAt: Date | null;

  /** The DocuSign envelope that produced this signed version — queryable envelope↔document association, not just buried in metadataJson. Null for documents that were never signed via DocuSign. */
  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', nullable: true })
  @Index()
  docusignEnvelopeId: string | null;

  @Field(() => Date, { nullable: true })
  @Column({ type: 'timestamptz', nullable: true })
  approvedAt: Date | null;

  @Field(() => Date, { nullable: true })
  @Column({ type: 'timestamptz', nullable: true })
  dueAt: Date | null;

  /** Transaction stage this document was resolved to (e.g. 'contract', 'inspection'). */
  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', nullable: true })
  stage: string | null;

  // Optional: scopes this document to a specific workflow step
  @Column({ type: 'varchar', nullable: true })
  workflowStepId: string | null;

  @Field(() => TransactionWorkflowStepEntity, { nullable: true })
  @ManyToOne(() => TransactionWorkflowStepEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'workflowStepId' })
  workflowStep: TransactionWorkflowStepEntity | null;

  // The submission round this document belongs to
  @Column({ name: 'submission_id', type: 'varchar', nullable: true })
  submissionId: string | null;

  @Field(() => TransactionDocumentSubmissionEntity, { nullable: true })
  @ManyToOne(() => TransactionDocumentSubmissionEntity, (s) => s.documents, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'submission_id' })
  submission: TransactionDocumentSubmissionEntity | null;

  // The AI interaction (LLM call) that produced the extraction result for this document
  @Column({ name: 'ai_interaction_id', type: 'varchar', nullable: true })
  aiInteractionId: string | null;

  @Field(() => AiInteractionEntity, { nullable: true })
  @ManyToOne(() => AiInteractionEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'ai_interaction_id' })
  aiInteraction: AiInteractionEntity | null;

  // Self-referential version chain: v2 points back to v1 it replaced
  @Column({ name: 'previous_version_id', type: 'varchar', nullable: true })
  previousVersionId: string | null;

  @Field(() => TransactionDocumentEntity, { nullable: true })
  @ManyToOne(() => TransactionDocumentEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'previous_version_id' })
  previousVersion: TransactionDocumentEntity | null;

  // true when this row is the original combined upload (audit record, not for display)
  @Field(() => Boolean, { nullable: true })
  @Column({ name: 'isOriginalPackage', type: 'boolean', default: false })
  isOriginalPackage: boolean;

  // ── Per-form provenance (derived form documents only) ────────────────────
  // sourceDocumentId: the parent/original multi-form document this was split from
  @Field(() => String, { nullable: true })
  @Column({ name: 'sourceDocumentId', type: 'varchar', nullable: true })
  sourceDocumentId: string | null;

  @Field(() => TransactionDocumentEntity, { nullable: true })
  @ManyToOne(() => TransactionDocumentEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'sourceDocumentId' })
  sourceDocument: TransactionDocumentEntity | null;

  // 1-indexed page range within the source document that was extracted for this form
  @Field(() => Int, { nullable: true })
  @Column({ name: 'sourcePageStart', type: 'integer', nullable: true })
  sourcePageStart: number | null;

  @Field(() => Int, { nullable: true })
  @Column({ name: 'sourcePageEnd', type: 'integer', nullable: true })
  sourcePageEnd: number | null;

  // Detected CAR form code (e.g. 'RPA', 'TDS', 'AD')
  @Field(() => String, { nullable: true })
  @Column({ name: 'formCode', type: 'varchar', nullable: true })
  formCode: string | null;

  // ── Secure upload-link provenance + background analysis tracking ─────────
  // Set only for documents uploaded through a public upload-link token; the
  // FK is the backend enforcement mechanism for per-link visibility scoping
  // (a link's recipientRole/purpose are inherent to the linked row, so
  // filtering by uploadLinkId alone is structurally sufficient).
  @Column({ type: 'uuid', nullable: true })
  @Index()
  uploadLinkId: string | null;

  @Field(() => UploadLinkEntity, { nullable: true })
  @ManyToOne(() => UploadLinkEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'uploadLinkId' })
  uploadLink: UploadLinkEntity | null;

  /** 'analyzing' | 'completed' | 'failed' — null for documents created outside the upload-link flow. */
  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', nullable: true })
  analysisStatus: string | null;

  @Field(() => Date, { nullable: true })
  @Column({ type: 'timestamptz', nullable: true })
  analyzedAt: Date | null;

  /** Client-supplied Idempotency-Key + sanitized filename, scoped per uploadLinkId — dedups retried upload requests. */
  @Column({ type: 'varchar', nullable: true })
  idempotencyKey: string | null;

  @Field(() => Int, { nullable: true })
  @Column({ type: 'integer', nullable: true })
  fileSizeBytes: number | null;

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
