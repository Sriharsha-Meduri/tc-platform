import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index,
} from 'typeorm';

/**
 * The single, centralized source of truth for "this compliance blocker has
 * been overridden" — every consumer (Draft Session, the compliance section,
 * the Documents swimlane, the Buyer/Seller Agent and Escrow upload-link
 * checklists, DocuSign send eligibility, and the submission gate) resolves
 * a blocker's effective status through this table via
 * BlockerOverrideService/isBlockerOverridden, never through its own
 * independent flag. See blocker-override.util.ts for the resolution rule.
 *
 * `blockerId` is the rule's stable code (e.g. `BLOCKER_TDS_SELLER_SIG`) —
 * the same value already shared between a BlockerOutput's `code` and its
 * corresponding ComplianceCheck's `ruleId`, so no new identifier space is
 * introduced.
 *
 * Scoping (most to least specific):
 *   - documentId set   → overrides this blocker only on this one document.
 *   - formCode set     → overrides this blocker for any document of that
 *                        form code on this transaction (no specific document
 *                        identified yet, e.g. overridden during Draft Session
 *                        before the document row existed).
 *   - neither set      → overrides this blocker code transaction-wide.
 *
 * The underlying blocker itself is never deleted or mutated — it's still
 * present in the originating document's metadataJson.compliance for audit —
 * this table only records that an authorized user has accepted it.
 */
@Entity('transaction_blocker_overrides')
@Index(['transactionId'])
@Index(['transactionId', 'blockerId'])
export class TransactionBlockerOverrideEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  transactionId: string;

  @Column()
  blockerId: string;

  @Column({ type: 'uuid', nullable: true })
  documentId: string | null;

  @Column({ type: 'varchar', nullable: true })
  formCode: string | null;

  /** Always 'OVERRIDDEN' today — a real column (not a hardcoded literal) so a future status can be added without a schema change. */
  @Column({ type: 'varchar', default: 'OVERRIDDEN' })
  status: 'OVERRIDDEN';

  @Column()
  overriddenByAccountId: string;

  @Column({ type: 'timestamptz' })
  overriddenAt: Date;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
