export interface UploadFileLimits {
  /** Per-request file cap — the frontend batches larger selections into chunks of this size. */
  maxFiles: number;
  maxFileSizeBytes: number;
  allowedMimeTypes: string[];
}

export interface UploadPageContext {
  propertyAddress: string;
  recipientName: string;
  purpose: string;
  expiresAt: string;
  fileLimits: UploadFileLimits;
}

export interface FileUploadResult {
  fileName: string;
  status: 'success' | 'failed';
  documentId?: string;
  error?: string;
  /** Present when this file was rejected by validation — one entry per failed required check, prefixed with its page/location when known. */
  validationFailures?: string[];
  /** The detected form code for a rejected file, even though it was never saved — lets the UI show "RPA — Re-upload Required" instead of just the filename. Null when no form could be identified. */
  formCode?: string | null;
}

export type UploadedDocumentStatus = 'uploaded' | 'analyzing' | 'saved' | 'analysis_failed';
export type UploadedDocumentCategory =
  | 'general' | 'hoa_document' | 'lender_prequalification' | 'proof_of_funds'
  | 'escrow_instructions' | 'preliminary_title_report' | 'estimated_closing_statement';

export interface UploadedDocument {
  id: string;
  fileName: string | null;
  formType: string | null;
  recipientRole: string;
  uploadedAt: string;
  fileSizeBytes: number | null;
  status: UploadedDocumentStatus;
  category: UploadedDocumentCategory;
  message?: string;
  /** Token-scoped file-streaming route — null when there's no stored file yet (e.g. still analyzing). */
  viewUrl: string | null;
  /** This document's own origin — 'INTERNAL' | 'BUYER_AGENT' | 'SELLER_AGENT' | 'ESCROW'. Not necessarily the audience currently viewing it (e.g. the RPA shown here on the Escrow link may have uploadedByType: 'BUYER_AGENT'). */
  uploadedByType: string;
  /** True for the original combined file once it's been split into per-form documents — drives the "Original" tag. */
  isOriginalPackage: boolean;
  /** The original uploaded file's document id, for a document that was split out of it — null for the original itself and for any document that was never split. */
  sourceDocumentId: string | null;
}

/** The generated CDA (Commission Disbursement Authorization) — Buyer Agent and Broker links only. */
export interface PublicCdaDto {
  id: string;
  fileName: string | null;
  generatedAt: string;
  versionNo: number;
  /** Token-scoped file-streaming route — same pattern as UploadedDocument.viewUrl. */
  viewUrl: string;
}

export interface TransactionInfoDto {
  lender: { lenderName: string | null; lenderEmail: string | null };
  escrow: { escrowContactName: string | null; escrowEmail: string | null };
  hoa: { hasHoa: boolean | null };
  /** The single "Buyer Broker Commission Information" section — merged from what used to be two separate sections. */
  buyerSide: {
    brokerageName: string | null;
    brokerFullName: string | null;
    brokerEmail: string | null;
    buyerAgentPaymentAddress: string | null;
    clientCredits: number | null;
    buyerCommissionType: 'percentage' | 'flat_amount' | null;
    buyerCommissionValue: number | null;
    /** Server-calculated — contractPrice × buyerCommissionValue when percentage, or buyerCommissionValue itself when flat_amount. */
    grossCommission: number | null;
  };
  /**
   * The Broker link's own "Broker Commission" section. finalSalesPrice and
   * grossCommission are retrieved, read-only values (the transaction's
   * contractPrice and the Buyer Agent's own calculated grossCommission) —
   * never edited here, only displayed so the commission split below makes
   * sense. brokerCommissionAmount and buyerAgentCommissionAmount are
   * server-calculated.
   */
  broker: {
    finalSalesPrice: number | null;
    grossCommission: number | null;
    brokerPaymentAddress: string | null;
    brokerCommissionType: 'percentage' | 'flat_amount' | null;
    brokerCommissionValue: number | null;
    brokerCommissionAmount: number | null;
    buyerAgentCommissionAmount: number | null;
  };
}
