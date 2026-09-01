import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { ObjectType, Field, ID, registerEnumType } from '@nestjs/graphql';
import { HideField } from '@nestjs/graphql';
import { AccountEntity } from '../accounts/entities/account.entity';

export enum AuditAction {
  USER_REGISTERED        = 'user_registered',
  USER_VERIFIED          = 'user_verified',
  USER_LOGIN             = 'user_login',
  ORG_CREATED            = 'org_created',
  ORG_STATUS_CHANGED     = 'org_status_changed',
  MEMBERSHIP_CREATED     = 'membership_created',
  MEMBERSHIP_APPROVED    = 'membership_approved',
  MEMBERSHIP_REJECTED    = 'membership_rejected',
  TRANSACTION_CREATED    = 'transaction_created',
  TRANSACTION_SUBMITTED  = 'transaction_submitted',
  TRANSACTION_STATUS_CHANGED = 'transaction_status_changed',
  DOCUMENT_UPLOADED      = 'document_uploaded',
  ADMIN_ACTION           = 'admin_action',
  REPAIR_REQUEST_UPLOADED              = 'repair_request_uploaded',
  REPAIR_REQUEST_RESPONSE_RECEIVED     = 'repair_request_response_received',
  REPAIR_REQUEST_APPROVED              = 'repair_request_approved',
  REPAIR_REQUEST_REJECTED              = 'repair_request_rejected',
  REPAIR_REQUEST_CHANGES_REQUESTED     = 'repair_request_changes_requested',
  VP_SCHEDULED                        = 'vp_scheduled',
  VP_DATE_UPDATED                     = 'vp_date_updated',
  VP_REMINDER_SENT                    = 'vp_reminder_sent',
  VP_DOCUMENT_RECEIVED                = 'vp_document_received',
  VP_VALIDATED                        = 'vp_validated',
  VP_SENT_FOR_SIGNATURE               = 'vp_sent_for_signature',
  VP_FULLY_EXECUTED                   = 'vp_fully_executed',
  BLOCKER_OVERRIDDEN                  = 'blocker_overridden',
  TRANSACTION_DELETED                  = 'transaction_deleted',
  LENDER_INFO_UPDATED                 = 'lender_info_updated',
  ESCROW_INFO_UPDATED                 = 'escrow_info_updated',
  HOA_INFO_UPDATED                    = 'hoa_info_updated',
  BUYER_SIDE_INFO_UPDATED             = 'buyer_side_info_updated',
  SELLER_SIDE_INFO_UPDATED            = 'seller_side_info_updated',
  ESCROW_WELCOME_EMAIL_SENT            = 'escrow_welcome_email_sent',
  ESCROW_DOCUMENT_DELIVERY_PREFERENCE_UPDATED = 'escrow_document_delivery_preference_updated',
  ESCROW_NUMBER_UPDATED                = 'escrow_number_updated',
  BROKER_WELCOME_EMAIL_SENT            = 'broker_welcome_email_sent',
  SELLER_AGENT_DOCUMENT_VALIDATION_FAILED = 'seller_agent_document_validation_failed',
  SELLER_AGENT_REJECTION_EMAIL_SENT       = 'seller_agent_rejection_email_sent',
  BUYER_AGENT_DOCUMENT_VALIDATION_FAILED  = 'buyer_agent_document_validation_failed',
  BUYER_AGENT_REJECTION_EMAIL_SENT        = 'buyer_agent_rejection_email_sent',
  SELLER_DOCUSIGN_CONFIRMATION_REQUESTED  = 'seller_docusign_confirmation_requested',
  SELLER_DOCUSIGN_CONFIRMED               = 'seller_docusign_confirmed',
  SELLER_DOCUSIGN_ENVELOPE_SENT           = 'seller_docusign_envelope_sent',
  BUYER_SIDE_REMINDER_LEAD_TIME_UPDATED   = 'buyer_side_reminder_lead_time_updated',
  /**
   * Distinct from the pre-existing VP_REMINDER_SENT (the unrelated internal
   * Verification-of-Property inspection-scheduling reminder) — this is the
   * Buyer Side checklist reminder tied to the Buyer Agent secure upload link.
   */
  BUYER_SIDE_VP_CHECKLIST_REMINDER_SENT   = 'buyer_side_vp_checklist_reminder_sent',
  SELLER_SIDE_REMINDER_LEAD_TIME_UPDATED  = 'seller_side_reminder_lead_time_updated',
  SELLER_SIDE_DOCUMENT_REMINDER_SENT      = 'seller_side_document_reminder_sent',
  /**
   * The per-document DocuSign send attempt itself failed (DocuSign API error) —
   * distinct from SELLER_DOCUSIGN_ENVELOPE_SENT, which only ever records a
   * successful send (bulk or per-document, since the envelope's documentIds
   * array naturally generalizes to one element).
   */
  SELLER_AGENT_DOCUMENT_DOCUSIGN_SEND_FAILED = 'seller_agent_document_docusign_send_failed',
  /** The "Welcome to Escrow & Transaction Timeline" email — sent to Buyer Agent + Seller Agent (+ optional Seller TC cc). */
  WELCOME_TIMELINE_EMAIL_SENT = 'welcome_timeline_email_sent',
  /** The Buyer-facing "Welcome & Transaction Timeline" email — sent to Buyer(s) directly, cc'ing the Buyer Agent. Distinct from WELCOME_TIMELINE_EMAIL_SENT (agent-facing) and the Buyer Agent's own upload-link email. */
  BUYER_WELCOME_TIMELINE_EMAIL_SENT = 'buyer_welcome_timeline_email_sent',
  /** A DocuSign envelope reached Completed and the resulting signed-document reply was sent onto an existing Welcome email thread (agent and/or buyer). */
  DOCUMENT_SIGNED_EMAIL_SENT = 'document_signed_email_sent',
  /** The Broker's own commission-split section (payment address, commission type/value, calculated split) — saved via the Broker's own secure upload link, or recalculated automatically after a final sales price change. */
  BROKER_INFO_UPDATED = 'broker_info_updated',
  /** A CDA (Commission Disbursement Authorization) PDF was auto-generated/regenerated from the Buyer Agent's and Broker's saved commission data. */
  CDA_GENERATED = 'cda_generated',
  /** A "CDA is ready" reply email was sent to the Buyer Agent's or Broker's own upload-link email thread — only once per distinct CDA content, never on a no-op regeneration. */
  CDA_NOTIFICATION_SENT = 'cda_notification_sent',
  /** The Broker uploaded the signed CDA through their own secure upload link — the "Sign CDA" checklist item's completion event. */
  SIGNED_CDA_UPLOADED = 'signed_cda_uploaded',
  /** A "signed CDA is available" reply email was sent to the Escrow Officer's own upload-link email thread after the Broker's signed-CDA upload. */
  SIGNED_CDA_AVAILABLE_EMAIL_SENT = 'signed_cda_available_email_sent',
  /** A Verification of Property (VP) document uploaded through the Buyer Agent Upload Link passed every required validation check and was auto-sent to the Broker via DocuSign for signature. */
  VP_SENT_TO_BROKER_VIA_DOCUSIGN = 'vp_sent_to_broker_via_docusign',
  /** A "VP sent for signature" reply email was sent to the Broker's own upload-link email thread once VP_SENT_TO_BROKER_VIA_DOCUSIGN succeeded. */
  VP_BROKER_NOTIFICATION_SENT = 'vp_broker_notification_sent',
  /** A "signed VP is available" reply email was sent to the Escrow Officer's own upload-link email thread once the Broker completed signing the Verification of Property via DocuSign. */
  SIGNED_VP_AVAILABLE_EMAIL_SENT = 'signed_vp_available_email_sent',
  /** An Escrow Officer document that was NOT saved because it failed the synchronous compliance-validation gate — sibling of SELLER_AGENT_DOCUMENT_VALIDATION_FAILED / BUYER_AGENT_DOCUMENT_VALIDATION_FAILED. */
  ESCROW_DOCUMENT_VALIDATION_FAILED = 'escrow_document_validation_failed',
  /** The consolidated reply-email notifying the Escrow Officer of rejected document(s). */
  ESCROW_REJECTION_EMAIL_SENT = 'escrow_rejection_email_sent',
  /** The seller-side "Escrow Opening" email sent to the escrow company to open escrow, carrying the buyer/seller agent info, commissions, preferred title company, home warranty, and NHD company. Distinct from ESCROW_WELCOME_EMAIL_SENT (the escrow-onboarding welcome). */
  ESCROW_OPENING_EMAIL_SENT = 'escrow_opening_email_sent',
  /** A Notice to Perform (NTP) prompt was sent to the Listing TC after a contingency deadline passed without removal. */
  NOTICE_TO_PERFORM_REMINDER_SENT = 'notice_to_perform_reminder_sent',
}

export const USER_CATEGORY_ACTIONS = [
  AuditAction.USER_REGISTERED,
  AuditAction.USER_VERIFIED,
  AuditAction.USER_LOGIN,
  AuditAction.ORG_CREATED,
  AuditAction.ORG_STATUS_CHANGED,
  AuditAction.MEMBERSHIP_CREATED,
  AuditAction.MEMBERSHIP_APPROVED,
  AuditAction.MEMBERSHIP_REJECTED,
  AuditAction.ADMIN_ACTION,
];

export const TRANSACTION_CATEGORY_ACTIONS = [
  AuditAction.TRANSACTION_CREATED,
  AuditAction.TRANSACTION_SUBMITTED,
  AuditAction.TRANSACTION_STATUS_CHANGED,
  AuditAction.DOCUMENT_UPLOADED,
  AuditAction.REPAIR_REQUEST_UPLOADED,
  AuditAction.REPAIR_REQUEST_RESPONSE_RECEIVED,
  AuditAction.REPAIR_REQUEST_APPROVED,
  AuditAction.REPAIR_REQUEST_REJECTED,
  AuditAction.REPAIR_REQUEST_CHANGES_REQUESTED,
  AuditAction.VP_SCHEDULED,
  AuditAction.VP_DATE_UPDATED,
  AuditAction.VP_REMINDER_SENT,
  AuditAction.VP_DOCUMENT_RECEIVED,
  AuditAction.VP_VALIDATED,
  AuditAction.VP_SENT_FOR_SIGNATURE,
  AuditAction.VP_FULLY_EXECUTED,
  AuditAction.BLOCKER_OVERRIDDEN,
  AuditAction.TRANSACTION_DELETED,
  AuditAction.LENDER_INFO_UPDATED,
  AuditAction.ESCROW_INFO_UPDATED,
  AuditAction.HOA_INFO_UPDATED,
  AuditAction.BUYER_SIDE_INFO_UPDATED,
  AuditAction.SELLER_SIDE_INFO_UPDATED,
  AuditAction.ESCROW_WELCOME_EMAIL_SENT,
  AuditAction.ESCROW_DOCUMENT_DELIVERY_PREFERENCE_UPDATED,
  AuditAction.ESCROW_NUMBER_UPDATED,
  AuditAction.BROKER_WELCOME_EMAIL_SENT,
  AuditAction.SELLER_AGENT_DOCUMENT_VALIDATION_FAILED,
  AuditAction.SELLER_AGENT_REJECTION_EMAIL_SENT,
  AuditAction.BUYER_AGENT_DOCUMENT_VALIDATION_FAILED,
  AuditAction.BUYER_AGENT_REJECTION_EMAIL_SENT,
  AuditAction.SELLER_DOCUSIGN_CONFIRMATION_REQUESTED,
  AuditAction.SELLER_DOCUSIGN_CONFIRMED,
  AuditAction.SELLER_DOCUSIGN_ENVELOPE_SENT,
  AuditAction.BUYER_SIDE_REMINDER_LEAD_TIME_UPDATED,
  AuditAction.BUYER_SIDE_VP_CHECKLIST_REMINDER_SENT,
  AuditAction.SELLER_SIDE_REMINDER_LEAD_TIME_UPDATED,
  AuditAction.SELLER_SIDE_DOCUMENT_REMINDER_SENT,
  AuditAction.SELLER_AGENT_DOCUMENT_DOCUSIGN_SEND_FAILED,
  AuditAction.WELCOME_TIMELINE_EMAIL_SENT,
  AuditAction.BUYER_WELCOME_TIMELINE_EMAIL_SENT,
  AuditAction.DOCUMENT_SIGNED_EMAIL_SENT,
  AuditAction.BROKER_INFO_UPDATED,
  AuditAction.CDA_GENERATED,
  AuditAction.CDA_NOTIFICATION_SENT,
  AuditAction.SIGNED_CDA_UPLOADED,
  AuditAction.SIGNED_CDA_AVAILABLE_EMAIL_SENT,
  AuditAction.VP_SENT_TO_BROKER_VIA_DOCUSIGN,
  AuditAction.VP_BROKER_NOTIFICATION_SENT,
  AuditAction.SIGNED_VP_AVAILABLE_EMAIL_SENT,
  AuditAction.ESCROW_DOCUMENT_VALIDATION_FAILED,
  AuditAction.ESCROW_REJECTION_EMAIL_SENT,
  AuditAction.ESCROW_OPENING_EMAIL_SENT,
  AuditAction.NOTICE_TO_PERFORM_REMINDER_SENT,
];
registerEnumType(AuditAction, { name: 'AuditAction' });

@ObjectType()
@Entity('audit_logs')
@Index(['accountId', 'createdAt'])
@Index(['action', 'createdAt'])
@Index(['targetType', 'targetId'])
export class AuditLogEntity {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  accountId: string | null;

  @Field(() => AccountEntity, { nullable: true })
  @ManyToOne(() => AccountEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'accountId' })
  account: AccountEntity | null;

  @Field(() => AuditAction)
  @Column({ type: 'varchar' })
  action: AuditAction;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', nullable: true })
  targetType: string | null;

  @Field(() => ID, { nullable: true })
  @Column({ type: 'uuid', nullable: true })
  targetId: string | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', nullable: true })
  targetDisplayName: string | null;

  @Field()
  @Column()
  description: string;

  @HideField()
  @Column({ type: 'jsonb', nullable: true })
  detailsJson: Record<string, unknown> | null;

  @Field()
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
