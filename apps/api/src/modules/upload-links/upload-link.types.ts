/**
 * What a link authorizes the recipient to do. 'document_upload' is the
 * original Buyer Agent purpose; 'seller_agent_document_upload' is the
 * seller-side counterpart — each purpose gets its own token/link record, so
 * a token minted for one purpose can never be used for the other. The type
 * stays a union (not open-ended) so every purpose is explicit and reviewable
 * here, but adding a new one later is still just adding a member.
 */
export type UploadLinkPurpose = 'document_upload' | 'seller_agent_document_upload' | 'escrow_officer_document_upload' | 'broker_document_upload';

/** Buyer Agent secure upload — the original purpose. */
export const BUYER_AGENT_TRANSACTION_DOCUMENT_UPLOAD: UploadLinkPurpose = 'document_upload';
/** Seller Agent secure upload — the Seller TC may be CC'd on delivery and share this same link. */
export const SELLER_AGENT_TRANSACTION_DOCUMENT_UPLOAD: UploadLinkPurpose = 'seller_agent_document_upload';
/**
 * Escrow Officer secure upload — minted on demand from the Buyer Agent's own
 * page (not at contract-submission time like the two purposes above) once the
 * Buyer Agent confirms sending the escrow welcome email. Has no
 * TransactionPartyEntity behind it (the escrow contact is free-text on
 * EscrowInformationEntity), so its idempotency is keyed on recipientEmail
 * instead of a party id — see UploadLinkService.createSecureUploadLinkForEmailRecipient.
 */
export const ESCROW_OFFICER_TRANSACTION_DOCUMENT_UPLOAD: UploadLinkPurpose = 'escrow_officer_document_upload';
/**
 * Broker secure upload — minted on demand from the Buyer Agent's own page
 * once the Buyer Agent saves the broker's name + email in the "Broker and
 * Commission Information" section (BuyerSideInformationEntity), mirroring
 * the Escrow Officer pattern exactly: no TransactionPartyEntity behind it,
 * idempotency keyed on recipientEmail. The broker's own page is currently a
 * placeholder (no checklist, no upload capability) — see BrokerOnboardingService
 * and the explicit broker rejections in ExternalDocumentUploadService and
 * document-visibility.util.ts.
 */
export const BROKER_TRANSACTION_DOCUMENT_UPLOAD: UploadLinkPurpose = 'broker_document_upload';

/**
 * Document types the Buyer Agent secure upload page requires before its
 * transaction-info submission can complete. Buyer Agent link only — never
 * required (or even recognized) on the Seller Agent link. Shared between
 * ExternalDocumentUploadService (tags uploads with the matching documentType
 * from a dedicated upload button, not from automatic form-classification) and
 * ExternalTransactionInformationService (checks presence before saving).
 */
export const LENDER_PREQUALIFICATION_DOCUMENT_TYPE = 'lender_prequalification';
export const PROOF_OF_FUNDS_DOCUMENT_TYPE = 'proof_of_funds';

export const REQUIRED_BUYER_AGENT_DOCUMENT_TYPES: ReadonlyArray<{ documentType: string; label: string }> = [
  { documentType: LENDER_PREQUALIFICATION_DOCUMENT_TYPE, label: 'Lender Prequalification Letter' },
  { documentType: PROOF_OF_FUNDS_DOCUMENT_TYPE, label: 'Buyer Proof of Funds' },
];

/** The HOA yes/no section's document uploads — never analyzed, tagged deterministically like the two above. */
export const HOA_DOCUMENT_TYPE = 'hoa_document';

/**
 * Every dedicated (non-automatically-classified) document type the Buyer Agent
 * page can tag — used to exclude these from the general form-checklist
 * matching, since they already have their own dedicated UI and aren't part of
 * the CAR-forms catalog the analysis pipeline detects against.
 */
export const ALL_SPECIAL_BUYER_AGENT_DOCUMENT_TYPES: ReadonlyArray<string> = [
  HOA_DOCUMENT_TYPE,
  LENDER_PREQUALIFICATION_DOCUMENT_TYPE,
  PROOF_OF_FUNDS_DOCUMENT_TYPE,
];

/**
 * Document types the Escrow Officer's own secure upload page requires —
 * tagged via dedicated upload buttons on that page, mirroring
 * REQUIRED_BUYER_AGENT_DOCUMENT_TYPES exactly. Escrow Officer link only.
 */
export const ESCROW_INSTRUCTIONS_DOCUMENT_TYPE = 'escrow_instructions';
export const PRELIMINARY_TITLE_REPORT_DOCUMENT_TYPE = 'preliminary_title_report';
export const ESTIMATED_CLOSING_STATEMENT_DOCUMENT_TYPE = 'estimated_closing_statement';

export const REQUIRED_ESCROW_DOCUMENT_TYPES: ReadonlyArray<{ documentType: string; label: string }> = [
  { documentType: ESCROW_INSTRUCTIONS_DOCUMENT_TYPE, label: 'Escrow Instructions' },
  { documentType: PRELIMINARY_TITLE_REPORT_DOCUMENT_TYPE, label: 'Preliminary Title Report' },
  { documentType: ESTIMATED_CLOSING_STATEMENT_DOCUMENT_TYPE, label: 'Estimated Closing Statement' },
];

/**
 * Every dedicated document type across ALL purposes (Buyer Agent's + Escrow
 * Officer's) — used by the Buyer Agent's transaction-wide CAR-forms checklist
 * to exclude these from its "unmatched documents" bucket, since none of them
 * are part of the CAR-forms catalog and all already have their own dedicated
 * UI on their respective pages.
 */
export const ALL_DEDICATED_DOCUMENT_TYPES: ReadonlyArray<string> = [
  ...ALL_SPECIAL_BUYER_AGENT_DOCUMENT_TYPES,
  ...REQUIRED_ESCROW_DOCUMENT_TYPES.map((t) => t.documentType),
];

/** Who a link is for — deliberately generic so any PartyRole can be a recipient, not just BUYER_AGENT. */
export interface UploadLinkRecipient {
  transactionId: string;
  recipientId: string | null;
  recipientRole: string;
  recipientName: string;
  recipientEmail: string;
}

/**
 * An optional secondary recipient CC'd on the link's delivery email (e.g. the
 * Seller Transaction Coordinator on the Seller Agent's link). They share the
 * primary recipient's token — this is not a separate link — but their
 * identity is persisted on the link row so both the email send and later
 * audit records can attribute to them correctly.
 */
export interface CcRecipient {
  partyId: string | null;
  role: string;
  name: string;
  email: string;
}

export interface ExpirationPolicy {
  /** Days from creation until the link expires. */
  days: number;
}

export interface AllowedFileConfig {
  /** Mime-type allow-list — deliberately an allow-list (not a deny-list) so unlisted/executable types are rejected by default. */
  allowedMimeTypes: string[];
  maxFileSizeBytes: number;
  maxFiles: number;
}

const DEFAULT_ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/heic',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  const parsed = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getDefaultExpirationPolicy(): ExpirationPolicy {
  return { days: envInt('UPLOAD_LINK_EXPIRY_DAYS', 30) };
}

export function getDefaultAllowedFileConfig(): AllowedFileConfig {
  const rawMimeTypes = process.env.UPLOAD_LINK_ALLOWED_MIME_TYPES;
  const allowedMimeTypes = rawMimeTypes
    ? rawMimeTypes.split(',').map((s) => s.trim()).filter(Boolean)
    : DEFAULT_ALLOWED_MIME_TYPES;

  return {
    allowedMimeTypes,
    maxFileSizeBytes: envInt('UPLOAD_LINK_MAX_FILE_MB', 25) * 1024 * 1024,
    maxFiles: envInt('UPLOAD_LINK_MAX_FILES', 20),
  };
}
