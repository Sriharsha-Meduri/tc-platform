/** Buyer Agent link — gates the Lender/Commission Transaction Information fields and the Required Documents section. */
export const BUYER_AGENT_PURPOSE = 'document_upload';
/** Seller Agent link — gates the Escrow Information + HOA Transaction Information fields. */
export const SELLER_AGENT_PURPOSE = 'seller_agent_document_upload';
/** The Escrow Officer's own onboarding link, minted automatically once the Seller Agent saves valid escrow contact info. */
export const ESCROW_OFFICER_PURPOSE = 'escrow_officer_document_upload';
/**
 * The broker's own onboarding link, minted automatically once the Buyer Agent
 * saves a valid broker name + email under "Broker and Commission
 * Information." Its page is currently a placeholder — no checklist, upload
 * capability, or validation — reached at its own dedicated route rather than
 * through the shared [token] dispatcher (see upload-link/broker/[token]/page.tsx).
 */
export const BROKER_PURPOSE = 'broker_document_upload';

export function isBuyerAgentPurpose(purpose: string): boolean {
  return purpose === BUYER_AGENT_PURPOSE;
}

export function isSellerAgentPurpose(purpose: string): boolean {
  return purpose === SELLER_AGENT_PURPOSE;
}

export function isEscrowOfficerPurpose(purpose: string): boolean {
  return purpose === ESCROW_OFFICER_PURPOSE;
}

export function isBrokerPurpose(purpose: string): boolean {
  return purpose === BROKER_PURPOSE;
}
