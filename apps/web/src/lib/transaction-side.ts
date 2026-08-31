/**
 * Transaction-side configuration — single source of truth for behavior that
 * differs between a Buyer-side transaction and a Seller-side transaction.
 *
 * BUYER values mirror exactly what the app produced before this module existed
 * (the buyer-side workflow is unchanged). SELLER values are currently a mirror
 * of the buyer-side workflow so the full seller flow works end-to-end, and are
 * flagged with `// TODO: SELLER_SIDE` wherever buyer-specific behavior will
 * need to be converted for the seller side.
 *
 * Rather than forking the UI/services, side-specific code reads from
 * TRANSACTION_SIDE_SPECS[transactionSide] (or resolves the side off the
 * transaction via `resolveTransactionSide`) so Buyer and Seller stay one
 * codebase with a single maintenance point.
 */
export type TransactionSideValue = 'BUYER' | 'SELLER';

export const TRANSACTION_SIDE_STORAGE_KEY = 'tc_transaction_side';

export const TRANSACTION_SIDE_VALUES: TransactionSideValue[] = ['BUYER', 'SELLER'];

/** Which party roles are the "home side" of the transaction (the party the TC represents). */
export interface SideRoleSet {
  principal: 'buyers' | 'sellers';
  agents: 'buyerAgents' | 'listingAgents';
  labels: { principal: string; agent: string };
}

export interface TransactionSideSpec {
  value: TransactionSideValue;
  label: string;
  shortLabel: string;
  description: string;
  /** Title shown on the contract upload screen. */
  uploadTitle: string;
  /** Copy under the upload title. */
  uploadDescription: string;
  /** RPA-gate error copy. */
  rpaRequiredTitle: string;
  rpaRequiredBody: string;
  /** Party roles the TC coordinates on behalf of. */
  roles: SideRoleSet;
  /** Roles that own secure upload links (checklist ownership). */
  uploadLinkOwners: string[];
  /** Roles that receive email notifications. */
  emailRecipients: string[];
  /** Form expectations per stage (compliance/document requirements). */
  formExpectations: Record<string, string[]>;
}

const BUYER_SPEC: TransactionSideSpec = {
  value: 'BUYER',
  label: 'Buyer Side Transaction',
  shortLabel: 'Buyer Side',
  description:
    'You are coordinating this transaction on behalf of the buyer — ' +
    'managing the buyer\'s contract, deadlines, disclosures and close of escrow.',
  uploadTitle: 'Upload Contract Documents',
  uploadDescription:
    'Upload the signed purchase agreement and any addendum PDFs. Transaction data will be ' +
    'extracted automatically and a draft transaction created for your review.',
  rpaRequiredTitle: 'Residential Purchase Agreement (RPA) required',
  rpaRequiredBody:
    'A transaction cannot be initiated without a signed RPA.',
  roles: {
    principal: 'buyers',
    agents: 'buyerAgents',
    labels: { principal: 'Buyer', agent: 'Buyer Agent' },
  },
  uploadLinkOwners: ['buyer_agent'],
  emailRecipients: ['buyer', 'buyer_agent'],
  formExpectations: {
    contract: ['RPA'],
    disclosures: ['TDS', 'SPQ', 'NHD'],
  },
};

const SELLER_SPEC: TransactionSideSpec = {
  value: 'SELLER',
  label: 'Seller Side Transaction',
  shortLabel: 'Seller Side',
  // TODO: SELLER_SIDE
  // Replace buyer-side copy with seller-side equivalents. Seller flow will
  // eventually start at INTAKE (property → parties → document selection) per
  // docs/design.md §16.5, instead of at contract upload.
  description:
    'You are coordinating this transaction on behalf of the seller — ' +
    'managing the seller\'s contract, disclosures, deadlines and close of escrow.',
  uploadTitle: 'Upload Contract Documents',
  uploadDescription:
    'Upload the signed purchase agreement and any addendum PDFs. Transaction data will be ' +
    'extracted automatically and a draft transaction created for your review.',
  rpaRequiredTitle: 'Residential Purchase Agreement (RPA) required',
  rpaRequiredBody:
    'A transaction cannot be initiated without a signed RPA.',
  // TODO: SELLER_SIDE
  // Primary roles flip to seller / listing agent for the seller side.
  roles: {
    principal: 'sellers',
    agents: 'listingAgents',
    labels: { principal: 'Seller', agent: 'Listing Agent' },
  },
  // TODO: SELLER_SIDE
  // Seller-side upload links are owned by the seller / listing agent rather
  // than the buyer agent.
  uploadLinkOwners: ['seller_agent'],
  // TODO: SELLER_SIDE
  // Email recipients flip to the seller and listing agent.
  emailRecipients: ['seller', 'seller_agent'],
  // TODO: SELLER_SIDE
  // Seller-side document responsibilities differ — the seller produces the
  // disclosures (TDS/SPQ) while the buyer inspects. Adjust per stage once the
  // seller form set is finalized.
  formExpectations: {
    contract: ['RPA'],
    disclosures: ['TDS', 'SPQ', 'NHD'],
  },
};

export const TRANSACTION_SIDE_SPECS: Record<TransactionSideValue, TransactionSideSpec> = {
  BUYER: BUYER_SPEC,
  SELLER: SELLER_SPEC,
};

export function isSellerSide(value: string | null | undefined): boolean {
  return value === 'SELLER';
}

/** Resolves the selected side from sessionStorage. Defaults to BUYER. */
export function resolveTransactionSide(): TransactionSideValue {
  try {
    const stored = sessionStorage.getItem(TRANSACTION_SIDE_STORAGE_KEY);
    return stored === 'SELLER' ? 'SELLER' : 'BUYER';
  } catch {
    return 'BUYER';
  }
}

/** Persists the selected side for the create flow. */
export function storeTransactionSide(side: TransactionSideValue): void {
  try {
    sessionStorage.setItem(TRANSACTION_SIDE_STORAGE_KEY, side);
  } catch {
    // ignore — storage unavailable (SSR/privacy mode) → default BUYER
  }
}

/**
 * Resolves the side off a persisted transaction record. `transactionSide` is
 * nullable on legacy rows — treat those as BUYER (backward compatibility).
 */
export function resolveTransactionSideFromTransaction(
  transactionSide: string | null | undefined,
): TransactionSideValue {
  return isSellerSide(transactionSide) ? 'SELLER' : 'BUYER';
}
