import {
  BUYER_AGENT_TRANSACTION_DOCUMENT_UPLOAD,
  SELLER_AGENT_TRANSACTION_DOCUMENT_UPLOAD,
  ESCROW_OFFICER_TRANSACTION_DOCUMENT_UPLOAD,
  BROKER_TRANSACTION_DOCUMENT_UPLOAD,
} from './upload-link.types';

/** Canonical origin of a document — the single source of truth every visibility check reads. */
export type UploadedByType = 'INTERNAL' | 'BUYER_AGENT' | 'SELLER_AGENT' | 'ESCROW';

/**
 * The audience of an external upload-link surface — never 'INTERNAL', which only ever
 * describes a document's origin, not a link's audience. 'BROKER' is the Broker
 * purpose's audience: the broker's page is otherwise a placeholder (no checklist, no
 * upload capability), but it can see exactly one thing — the generated CDA — via the
 * explicit exception in canExternalUserSeeDocument below. It must never fall through
 * to 'BUYER_AGENT' visibility, which would leak every other document on the transaction.
 */
export type UploadLinkVisibilityType = 'BUYER_AGENT' | 'SELLER_AGENT' | 'ESCROW' | 'BROKER';

/** Maps an upload-link's `purpose` string to the visibility audience it represents. */
export function resolveUploadLinkVisibilityType(purpose: string): UploadLinkVisibilityType {
  if (purpose === SELLER_AGENT_TRANSACTION_DOCUMENT_UPLOAD) return 'SELLER_AGENT';
  if (purpose === ESCROW_OFFICER_TRANSACTION_DOCUMENT_UPLOAD) return 'ESCROW';
  if (purpose === BROKER_TRANSACTION_DOCUMENT_UPLOAD) return 'BROKER';
  return 'BUYER_AGENT';
}

/**
 * A document's canonical origin, derived from its own uploadLinkId + (when
 * set) that link's own purpose — never the purpose of whatever link is
 * currently requesting to view it. `uploadLinkId: null` is exactly how an
 * internal (authenticated, non-link) upload is represented on
 * TransactionDocumentEntity — see its own doc comment.
 */
export function resolveUploadedByType(uploadLinkId: string | null, uploadLinkPurpose?: string | null): UploadedByType {
  if (!uploadLinkId) return 'INTERNAL';
  if (uploadLinkPurpose === SELLER_AGENT_TRANSACTION_DOCUMENT_UPLOAD) return 'SELLER_AGENT';
  if (uploadLinkPurpose === ESCROW_OFFICER_TRANSACTION_DOCUMENT_UPLOAD) return 'ESCROW';
  return 'BUYER_AGENT';
}

/**
 * The single source of truth for "can this external audience see this
 * document" — every consumer (the Uploaded Documents list, the file-view
 * route) resolves through this one function rather than duplicating the
 * rule. RPA is one explicit, formCode-keyed exception: Escrow always sees
 * the transaction's current RPA regardless of who uploaded it, because
 * Escrow needs the executed purchase agreement. The CDA is the other:
 * documentType 'cda' is visible to the Broker link (its one and only
 * document) regardless of origin — CDA documents are always INTERNAL-origin
 * by construction, so this is really just naming the exception explicitly
 * rather than relying on Buyer Agent's INTERNAL rule (which already covers
 * the Buyer Agent side of this for free) to imply it for Broker too. The
 * signed Verification of Property (formCode 'VP', status 'signed') is a
 * third exception: it's uploaded through the Buyer Agent link and later
 * signed by the Broker via DocuSign (see DocuSignService.processCompletedEnvelope
 * and VerificationOfPropertyBrokerDocusignService), but Escrow — not the
 * Buyer Agent — is the audience that needs it once it's actually signed;
 * the *unsigned* VP stays Buyer-Agent-only, which is why this checks status,
 * not just formCode, unlike the unconditional RPA exception above. A fourth
 * exception mirrors that same status-gated pattern for the Buyer Agent side:
 * any document with status 'signed' is visible to the Buyer Agent regardless
 * of `uploadedByType` — a document the Seller Agent sent via DocuSign for the
 * Buyer to sign (see DocuSignService.sendSellerDocumentsToBuyer) keeps the
 * ORIGINAL document's `uploadLinkId`/origin (the Seller Agent's link) all the
 * way through signing, so without this exception the Buyer Agent could never
 * see the very document their own client just signed. Every other
 * combination not explicitly allowed here is denied — an unrecognized
 * audience sees nothing.
 */
export function canExternalUserSeeDocument(
  document: { uploadedByType: UploadedByType; formCode: string | null; documentType: string | null; status: string },
  uploadLinkType: UploadLinkVisibilityType,
): boolean {
  if (uploadLinkType === 'BUYER_AGENT') {
    return (
      document.uploadedByType === 'BUYER_AGENT' ||
      document.uploadedByType === 'INTERNAL' ||
      document.status === 'signed' // explicit exception — see doc comment above
    );
  }

  if (uploadLinkType === 'SELLER_AGENT') {
    return document.uploadedByType === 'SELLER_AGENT';
  }

  if (uploadLinkType === 'ESCROW') {
    return (
      document.uploadedByType === 'ESCROW' ||
      document.formCode === 'RPA' || // explicit exception
      document.documentType === 'signed_cda' || // explicit exception — see BROKER below
      (document.formCode === 'VP' && document.status === 'signed') // explicit exception — signed VP only
    );
  }

  if (uploadLinkType === 'BROKER') {
    // The broker's page has no other document access — it can see (a) the generated CDA it
    // needs to sign, and (b) its own signed upload once submitted. Neither depends on origin.
    return document.documentType === 'cda' || document.documentType === 'signed_cda';
  }

  return false; // fail closed — unknown audiences see nothing
}
