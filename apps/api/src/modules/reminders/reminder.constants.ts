export const DEADLINE_REMINDER_QUEUE = 'deadline-reminders';

export type ReminderType = 'offset' | 'custom';

export interface BaseReminderJobData {
  /** 'offset' for auto-derived event reminders, 'custom' for user-created one-off reminders */
  reminderType: ReminderType;
  transactionId: string;
  transactionNumber: string;
  propertyAddress: string;
  /** Recipient list gathered from transaction parties at job schedule time */
  recipients: Array<{ name: string; email: string; role: string; partyId: string }>;
  /** Transaction outbound email address for reply routing */
  fromAddress: string;
  /** Transaction stage this event belongs to — stamped on message rows */
  transactionStage: string;
}

export interface OffsetReminderJobData extends BaseReminderJobData {
  reminderType: 'offset';
  /** ISO date string of the deadline */
  eventDate: string;
  eventType: string;
  /** Human-readable label, e.g. "Inspection Contingency" */
  eventLabel: string;
  /** Raw offset label from REMINDER_SCHEDULE, e.g. "7d", "2h", "30m" */
  offsetLabel: string;
  /** Human-readable offset for display in emails, e.g. "7 days", "2 hours", "30 minutes", "day-of" */
  offsetDisplay: string;
}

export interface CustomReminderJobData extends BaseReminderJobData {
  reminderType: 'custom';
  /** The custom reminder entity ID (for sent-at tracking) */
  customReminderId: string;
  /** User-provided subject line */
  customSubject: string;
  /** User-provided optional message body */
  customMessage: string | null;
  /** ISO date-time when this reminder should fire */
  fireAt: string;
}

export type ContingencyType = 'inspection' | 'loan' | 'appraisal';

/**
 * The Buyer Agent secure-upload-link "1 day before deadline" reminder for a
 * single contingency-removal checklist item. Unlike OffsetReminderJobData
 * (broad recipient list, no thread), this replies in the upload link's own
 * email thread to a single recipient — no secure-upload URL is embedded in
 * the body (the recipient already has the original email, with its working
 * link, in the same thread).
 */
export interface ContingencyRemovalReminderJobData {
  reminderType: 'contingency_removal';
  transactionId: string;
  transactionNumber: string;
  propertyAddress: string;
  transactionEventId: string;
  contingencyType: ContingencyType;
  /** Human-readable label, e.g. "Inspection Contingency Removal" */
  contingencyLabel: string;
  /** ISO date string of the calculated deadline */
  deadline: string;
  /** Human-readable contract timeframe, e.g. "17 days after Acceptance" */
  contractTimeframe: string;
  recipientEmail: string;
  recipientName: string;
  ccEmail: string | null;
  /** In-Reply-To/References target — replies in the same upload-link email thread */
  emailMessageId: string | null;
  fromAddress: string;
  transactionStage: string;
}

/**
 * The Buyer Side "N days before Close of Escrow" reminder (default 3 —
 * `transaction.buyerSideReminderLeadDays`) for the Verification of Property
 * checklist item. Unlike ContingencyRemovalReminderJobData, this DOES need a
 * working secure-upload link in the email body — but since the raw token is
 * never persisted, one can't be pre-baked here at schedule time. Only
 * `uploadLinkId` is carried; the processor regenerates a fresh token for
 * that link at fire time and builds the URL then.
 */
export interface VerificationOfPropertyReminderJobData {
  reminderType: 'verification_of_property';
  transactionId: string;
  transactionNumber: string;
  propertyAddress: string;
  transactionEventId: string;
  /** Human-readable deadline label — always "Close of Escrow" today. */
  deadlineLabel: string;
  /** ISO date string of the calculated deadline */
  deadline: string;
  recipientEmail: string;
  recipientName: string;
  ccEmail: string | null;
  /** The Buyer Agent upload link to regenerate a fresh token for at fire time. */
  uploadLinkId: string;
  fromAddress: string;
  transactionStage: string;
}

/**
 * The Seller Side "N days before Seller Disclosures Due" reminder (default
 * 3 — `transaction.sellerSideReminderLeadDays`) for a single required
 * Seller Agent CAR-form document. Like VerificationOfPropertyReminderJobData
 * this DOES need a working secure-upload link in the email body — the raw
 * token is never persisted, so only `uploadLinkId` is carried here; the
 * processor regenerates a fresh token for that link at fire time.
 */
export interface SellerSideDocumentReminderJobData {
  reminderType: 'seller_side_document';
  transactionId: string;
  transactionNumber: string;
  propertyAddress: string;
  transactionEventId: string;
  /** The required CAR form code this reminder is for, e.g. 'TDS'. */
  formCode: string;
  /** Human-readable form label, e.g. "Transfer Disclosure Statement". */
  formName: string;
  /** ISO date string of the calculated deadline (Seller Disclosures Due). */
  deadline: string;
  recipientEmail: string;
  recipientName: string;
  ccEmail: string | null;
  /** The Seller Agent upload link to regenerate a fresh token for at fire time. */
  uploadLinkId: string;
  fromAddress: string;
  transactionStage: string;
}

export type DeadlineReminderJobData =
  | OffsetReminderJobData
  | CustomReminderJobData
  | ContingencyRemovalReminderJobData
  | VerificationOfPropertyReminderJobData
  | SellerSideDocumentReminderJobData;
