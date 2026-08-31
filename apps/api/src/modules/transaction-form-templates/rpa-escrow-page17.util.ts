import { TransactionDocumentEntity } from '../transaction-documents/entities/transaction-document.entity';
import type { ComplianceCheck } from '../document-extraction/compliance-result.types';

const RPA_PAGE17_ESCROW_CHECK_RULE_ID = 'rpa_page17_escrow_completed';

/**
 * Whether the submitted RPA's logical Page 17 (Escrow Holder Acknowledgment)
 * — located by RPA page/footer identification, never a physical PDF page
 * index; see FormIdentifier's RPA footer pattern and
 * validateRpaPage17EscrowAcknowledgment in @tc/document-intelligence — has
 * both the escrow/company information and the escrow holder's own signature.
 *
 * This is the ONLY signal that governs the "Signed RPA" checklist item's
 * completion on the Escrow Upload Link. It is deliberately independent of
 * RPA pages 1-16, buyer/seller execution signatures, filename, document
 * status, and the mere fact that an RPA was uploaded — none of those ever
 * mark this item complete, and an incomplete Page 17 never creates a
 * blocker, it simply leaves the item outstanding.
 *
 * Reads the check the document-intelligence validator already computed
 * (rather than re-deriving it from raw extraction fields here), so there is
 * exactly one place this rule is evaluated.
 */
export function isRpaEscrowPage17Completed(doc: TransactionDocumentEntity | null | undefined): boolean {
  const checks = (doc?.metadataJson as { compliance?: { checks?: ComplianceCheck[] } } | null | undefined)?.compliance?.checks;
  return !!checks?.some((c) => c.ruleId === RPA_PAGE17_ESCROW_CHECK_RULE_ID && c.status === 'pass');
}
