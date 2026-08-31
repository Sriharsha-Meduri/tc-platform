// Shared Data Transfer Objects
// Used across NestJS API, Next.js web, and React Native mobile for type safety.

// ─── Enums ───────────────────────────────────────────────────────────────────

export type UserStatus = 'pending' | 'active' | 'inactive' | 'suspended';
export type UserRole = 'agent' | 'transaction_coordinator' | 'broker_admin' | 'support_admin';

export type OrgStatus = 'pending_approval' | 'active' | 'inactive' | 'suspended';

export type OrgType =
  | 'brokerage'
  | 'team'
  | 'transaction_coordination_company'
  | 'title_company'
  | 'escrow_company'
  | 'lender'
  | 'law_firm';

export type MembershipStatus = 'pending' | 'active' | 'rejected';

export type MemberRole =
  | 'broker_admin'
  | 'agent'
  | 'transaction_coordinator';

export type ContactType = 'person' | 'company';

export type TransactionType = 'purchase' | 'sale' | 'lease';
export type TransactionSide = 'buyer_side' | 'seller_side' | 'dual';
/**
 * Which side of the transaction the coordinating party/TC represents.
 * Distinct from `TransactionSide` (agency representation: buyer/seller/dual).
 * Absent (null/undefined) on legacy rows → treated as 'BUYER' for backward
 * compatibility.
 */
export type TransactionCoordinatorSide = 'BUYER' | 'SELLER';
export type TransactionStatus =
  | 'draft'
  | 'active'
  | 'under_contract'
  | 'pending_close'
  | 'closed'
  | 'cancelled'
  | 'archived'
  | 'seller_response_rejected'
  | 'inspection_contingency_removed';
export type TransactionStage =
  | 'intake'
  | 'contract'
  | 'disclosures'
  | 'inspection'
  | 'appraisal'
  | 'loan'
  | 'escrow'
  | 'closing'
  | 'post_close';

export type PartyRole =
  | 'buyer'
  | 'seller'
  | 'buyer_agent'
  | 'seller_agent'
  | 'buyer_transaction_coordinator'
  | 'seller_transaction_coordinator'
  | 'lender'
  | 'loan_officer'
  | 'escrow_officer'
  | 'title_officer'
  | 'attorney'
  | 'inspector'
  | 'appraiser'
  | 'other';

export type TaskStatus = 'todo' | 'in_progress' | 'blocked' | 'done' | 'waived';
export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent';

// ─── Auth ────────────────────────────────────────────────────────────────────

export interface LoginDto {
  email: string;
  password: string;
}

export interface AuthResponseDto {
  accessToken: string;
  user: UserDto;
  account: AccountDto | null;
}

export interface MeResponseDto {
  user: UserDto;
  account: AccountDto | null;
}

// ─── User ────────────────────────────────────────────────────────────────────

export interface UserDto {
  id: string;
  email: string;
  phone: string | null;
  status: UserStatus;
  role: UserRole;
  roles: UserRole[];
  emailVerifiedAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateUserDto {
  email: string;
  phone?: string;
  password: string;
}

export interface UpdateUserDto {
  email?: string;
  phone?: string;
}

// ─── Account ─────────────────────────────────────────────────────────────────

export interface AccountDto {
  id: string;
  userId: string;
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
  timezone: string | null;
  locale: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAccountDto {
  userId: string;
  displayName: string;
  firstName?: string;
  lastName?: string;
  timezone?: string;
  locale?: string;
}

export interface UpdateAccountDto {
  displayName?: string;
  firstName?: string;
  lastName?: string;
  avatarUrl?: string;
  timezone?: string;
  locale?: string;
}

// ─── Organization ─────────────────────────────────────────────────────────────

export interface OrganizationDto {
  id: string;
  name: string;
  type: OrgType;
  licenseNumber: string | null;
  emailDomain: string | null;
  phone: string | null;
  status: OrgStatus;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateOrganizationDto {
  name: string;
  type: OrgType;
  licenseNumber?: string;
  emailDomain?: string;
  phone?: string;
  addressLine1?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

export interface UpdateOrganizationDto {
  name?: string;
  licenseNumber?: string;
  phone?: string;
  status?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
}

// ─── Organization Membership ──────────────────────────────────────────────────

export interface OrganizationMembershipDto {
  id: string;
  organizationId: string;
  accountId: string;
  role: MemberRole;
  status: MembershipStatus;
  isPrimary: boolean;
  joinedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMembershipDto {
  organizationId: string;
  accountId: string;
  role: MemberRole;
  isPrimary?: boolean;
}

// ─── Contact ─────────────────────────────────────────────────────────────────

export interface ContactDto {
  id: string;
  contactType: ContactType;
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateContactDto {
  contactType: ContactType;
  firstName?: string;
  lastName?: string;
  companyName?: string;
  email?: string;
  phone?: string;
}

export interface UpdateContactDto {
  firstName?: string;
  lastName?: string;
  companyName?: string;
  email?: string;
  phone?: string;
  notes?: string;
}

// ─── Transaction ─────────────────────────────────────────────────────────────

export interface TransactionDto {
  id: string;
  organizationId: string;
  transactionNumber: string;
  transactionType: TransactionType;
  side: TransactionSide;
  transactionSide: TransactionCoordinatorSide | null;
  status: TransactionStatus;
  stage: TransactionStage;
  propertyAddressLine1: string;
  propertyCity: string;
  propertyState: string;
  propertyPostalCode: string | null;
  listPrice: number | null;
  contractPrice: number | null;
  closeOfEscrowAt: string | null;
  createdByAccountId: string;
  assignedCoordinatorAccountId: string | null;
  formTemplateId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTransactionDto {
  organizationId: string;
  transactionNumber: string;
  transactionType: TransactionType;
  side: TransactionSide;
  transactionSide?: TransactionCoordinatorSide;
  propertyAddressLine1: string;
  propertyCity: string;
  propertyState: string;
  propertyPostalCode?: string;
  createdByAccountId: string;
  formTemplateId?: string;
}

export interface UpdateTransactionDto {
  status?: TransactionStatus;
  stage?: TransactionStage;
  listPrice?: number;
  contractPrice?: number;
  earnestMoneyAmount?: number;
  inspectionDeadlineAt?: string;
  financeDeadlineAt?: string;
  closeOfEscrowAt?: string;
  assignedCoordinatorAccountId?: string;
}

export type RepairRequestType = 'rr' | 'rrrr' | 'cr';
export type RepairReviewStatus = 'pending' | 'approved' | 'rejected' | 'changes_requested';

export interface RepairRequestDto {
  id: string;
  transactionId: string;
  requestType: RepairRequestType;
  rrDocumentId: string | null;
  rrrrDocumentId: string | null;
  crDocumentId: string | null;
  status: RepairReviewStatus;
  reviewerAccountId: string | null;
  buyerNotes: string | null;
  docusignEnvelopeId: string | null;
  documents?: {
    rr: unknown | null;
    rrrr: unknown | null;
    cr: unknown | null;
  };
  createdAt: string;
  updatedAt: string;
}

export interface TransactionPartyDto {
  id: string;
  transactionId: string;
  partyRole: PartyRole;
  displayName: string;
  email: string | null;
  phone: string | null;
  isPrimary: boolean;
  contactId: string | null;
  organizationId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTransactionPartyDto {
  transactionId: string;
  partyRole: PartyRole;
  displayName: string;
  email?: string;
  phone?: string;
  isPrimary?: boolean;
  contactId?: string;
  organizationId?: string;
}

// ─── Transaction Task ─────────────────────────────────────────────────────────

export interface TransactionTaskDto {
  id: string;
  transactionId: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assignedAccountId: string | null;
  dependsOnTaskId: string | null;
  dueAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTransactionTaskDto {
  transactionId: string;
  title: string;
  description?: string;
  priority?: TaskPriority;
  assignedAccountId?: string;
  dueAt?: string;
  dependsOnTaskId?: string;
}

export interface UpdateTransactionTaskDto {
  title?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  assignedAccountId?: string;
  dueAt?: string;
  completedAt?: string;
}

// ─── Verification of Property (VP) ────────────────────────────────────────────

export type VpStatus =
  | 'scheduled'
  | 'reminder_sent'
  | 'waiting_for_form'
  | 'form_received'
  | 'validated'
  | 'ready_for_docusign'
  | 'sent_via_docusign'
  | 'fully_executed';

export interface VerificationOfPropertyDto {
  id: string;
  transactionId: string;
  status: VpStatus;
  scheduledDate: string | null;
  reminderSentAt: string | null;
  documentReceivedAt: string | null;
  validatedAt: string | null;
  sentForSignatureAt: string | null;
  fullyExecutedAt: string | null;
  docusignEnvelopeId: string | null;
  vopDocumentId: string | null;
  createdByAccountId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateVpDto {
  transactionId: string;
  scheduledDate: string;
  createdByAccountId?: string;
  notes?: string;
}

export interface UpdateVpDto {
  scheduledDate?: string;
  status?: VpStatus;
  notes?: string;
}

// ─── Title Contacts ──────────────────────────────────────────────────────────

export interface TitleContactDto {
  id: string;
  userId: string;
  contactName: string;
  companyName: string;
  email: string;
  cellPhone: string;
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTitleContactDto {
  contactName: string;
  companyName: string;
  email: string;
  cellPhone: string;
  addressLine1?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  isDefault?: boolean;
}

export interface UpdateTitleContactDto {
  contactName?: string;
  companyName?: string;
  email?: string;
  cellPhone?: string;
  addressLine1?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  isDefault?: boolean;
}

// ─── Escrow Contacts ─────────────────────────────────────────────────────────

export interface EscrowContactDto {
  id: string;
  userId: string;
  contactName: string;
  jobTitle: string | null;
  companyName: string;
  email: string;
  cellPhone: string;
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  website: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateEscrowContactDto {
  contactName: string;
  jobTitle?: string;
  companyName: string;
  email: string;
  cellPhone: string;
  addressLine1?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  website?: string;
  notes?: string;
  isDefault?: boolean;
}

export interface UpdateEscrowContactDto {
  contactName?: string;
  jobTitle?: string;
  companyName?: string;
  email?: string;
  cellPhone?: string;
  addressLine1?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  website?: string;
  notes?: string;
  isDefault?: boolean;
}

// ─── Home Warranty Contacts ──────────────────────────────────────────────────

export interface HomeWarrantyContactDto {
  id: string;
  userId: string;
  contactName: string;
  jobTitle: string | null;
  companyName: string;
  email: string;
  officePhone: string | null;
  website: string | null;
  orderingPortalUrl: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateHomeWarrantyContactDto {
  contactName: string;
  jobTitle?: string;
  companyName: string;
  email: string;
  officePhone?: string;
  website?: string;
  orderingPortalUrl?: string;
  isDefault?: boolean;
}

export interface UpdateHomeWarrantyContactDto {
  contactName?: string;
  jobTitle?: string;
  companyName?: string;
  email?: string;
  officePhone?: string;
  website?: string;
  orderingPortalUrl?: string;
  isDefault?: boolean;
}

// ─── Final Negotiated Terms (Contingencies & Disclosures) ─────────────────────
// Mirrors packages/document-intelligence/src/validator/stages/final-terms.ts —
// keep the two in sync. This is the authoritative, resolver-computed shape for
// the "Contingencies & Disclosures" section only (loan/appraisal/inspection/
// insurance/document-review/disclosures/EMD deadlines) — distinct from any
// broader per-field "final terms" concept (names, price, dates) elsewhere.

export type FinalTermKey =
  | 'loan'
  | 'appraisal'
  | 'inspection'
  | 'insurance'
  | 'sellerDocumentReview'
  | 'titleReview'
  | 'hoaReview'
  | 'disclosuresDue'
  | 'emdInitialDeposit';

export type FinalTermStatus = 'Contingent' | 'No contingency' | 'Removed' | 'N/A' | 'Needs Review';

export interface FinalTermSource {
  documentId: string;
  fileName: string;
  formCode: string;
  versionNo: number;
  pageNumber: number | null;
  section: string | null;
}

export interface FinalTerm {
  key: FinalTermKey;
  label: string;
  status: FinalTermStatus;
  days: number | null;
  dayType: 'calendar' | 'business' | null;
  deadline: string | null;
  source: FinalTermSource | null;
  conflict: boolean;
}

/**
 * Scalar (non-day-count) negotiated values — price, dates, credits —
 * resolved by the same resolveFinalNegotiatedTerms chain walk as `terms`,
 * consolidated into the one resolver rather than the three separate
 * mergers that used to compute these independently.
 */
export type FinalValueKey =
  | 'purchasePrice'
  | 'offerDate'
  | 'closeOfEscrow'
  | 'possession'
  | 'sellerCreditToBuyer'
  | 'initialDeposit';

export interface FinalValueTerm<T = unknown> {
  key: FinalValueKey;
  label: string;
  value: T | null;
  source: FinalTermSource | null;
}

export interface FinalNegotiatedTerms {
  acceptanceDate: string | null;
  terms: FinalTerm[];
  valueTerms: FinalValueTerm[];
  resolvedFrom: string[];
}
