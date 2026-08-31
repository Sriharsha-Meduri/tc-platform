import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { PartyRole } from '../transaction-parties/entities/transaction-party.entity';
import { TransactionEntity } from '../transactions/entities/transaction.entity';
import { UploadLinkEntity } from '../upload-links/entities/upload-link.entity';
import { UploadLinkService } from '../upload-links/upload-link.service';
import { UploadLinkEmailService } from '../upload-links/upload-link-email.service';
import { SELLER_AGENT_TRANSACTION_DOCUMENT_UPLOAD, ESCROW_OFFICER_TRANSACTION_DOCUMENT_UPLOAD } from '../upload-links/upload-link.types';
import { EscrowInformationService } from '../transaction-contact-information/escrow-information.service';
import { HoaInformationService } from '../transaction-contact-information/hoa-information.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { getTransactionCoordinatorContact } from '../transactions/transaction-coordinator-contact.util';
import { AuditAction } from '../audit-log/audit-log.entity';
import { isValidEmail } from '../transactions/transaction-welcome-email.service';

const INVALID_LINK_MESSAGE = 'This upload link is invalid or has expired.';

export interface SendEscrowWelcomeEmailResult {
  sent: boolean;
  alreadySent: boolean;
  escrowEmail: string;
  sentAt: Date | null;
}

export interface EscrowWelcomeEmailStatus {
  sentAt: Date | null;
  sentTo: string | null;
}

export interface EscrowDocumentDeliveryPreference {
  willSendDocumentsToBuyer: boolean | null;
}

export interface EscrowNumberResult {
  escrowNumber: string | null;
}

export interface EscrowHoaRequirement {
  hasHoa: boolean | null;
}

/**
 * Orchestrates the Seller-Agent-triggered escrow onboarding email: mints (or
 * reuses) the Escrow Officer's own secure upload link and sends the welcome
 * email, CC'ing the Seller Agent and instructing the Escrow Officer to copy
 * the Transaction Coordinator on future communications. Registered as a
 * provider directly on UploadLinksModule (see upload-links.module.ts) so
 * UploadLinkController can auto-trigger sendWelcomeEmail right after a
 * successful Seller Agent escrow-info save.
 */
@Injectable()
export class EscrowOnboardingService {
  private readonly logger = new Logger(EscrowOnboardingService.name);

  constructor(
    private readonly escrowInformationService: EscrowInformationService,
    private readonly hoaInformationService: HoaInformationService,
    private readonly uploadLinkService: UploadLinkService,
    private readonly uploadLinkEmailService: UploadLinkEmailService,
    private readonly auditLogService: AuditLogService,
  ) {}

  /** Every rejection path throws this exact generic message — mirrors every other gate in this codebase. */
  private assertSellerAgentLink(link: UploadLinkEntity): void {
    if (link.purpose !== SELLER_AGENT_TRANSACTION_DOCUMENT_UPLOAD) {
      throw new NotFoundException(INVALID_LINK_MESSAGE);
    }
  }

  private assertEscrowLink(link: UploadLinkEntity): void {
    if (link.purpose !== ESCROW_OFFICER_TRANSACTION_DOCUMENT_UPLOAD) {
      throw new NotFoundException(INVALID_LINK_MESSAGE);
    }
  }

  async sendWelcomeEmail(sellerAgentLink: UploadLinkEntity, transaction: TransactionEntity): Promise<SendEscrowWelcomeEmailResult> {
    this.assertSellerAgentLink(sellerAgentLink);

    const escrowInfo = await this.escrowInformationService.findByTransaction(transaction.id);
    if (!escrowInfo?.escrowContactName || !escrowInfo?.escrowEmail) {
      throw new BadRequestException("Save the escrow officer's name and email before sending the welcome email.");
    }
    if (!isValidEmail(escrowInfo.escrowEmail)) {
      throw new BadRequestException('Escrow email is not a valid email address.');
    }

    // The signer is always the myTC account that created the transaction — never a
    // manually-entered transaction party field, so the footer identity stays in sync
    // with every other upload-link email. Missing optional values are omitted. The
    // email shown (and CC'd) is the transaction-specific Mailgun address — never the
    // TC's myTC login email (see getTransactionCoordinatorContact).
    const creatorContact = getTransactionCoordinatorContact(transaction, transaction.createdByAccount, this.logger);

    const propertyAddress = [transaction.propertyAddressLine1, transaction.propertyCity, transaction.propertyState]
      .filter(Boolean).join(', ') || transaction.propertyAddressLine1;

    const { link: escrowLink, token } = await this.uploadLinkService.createSecureUploadLinkForEmailRecipient(
      {
        transactionId: transaction.id,
        recipientId: null,
        recipientRole: PartyRole.ESCROW_OFFICER,
        recipientName: escrowInfo.escrowContactName,
        recipientEmail: escrowInfo.escrowEmail,
      },
      ESCROW_OFFICER_TRANSACTION_DOCUMENT_UPLOAD,
      {
        ccRecipient: {
          partyId: null,
          role: sellerAgentLink.recipientRole,
          name: sellerAgentLink.recipientName,
          email: sellerAgentLink.recipientEmail,
        },
      },
    );

    if (token === null) {
      return { sent: false, alreadySent: true, escrowEmail: escrowInfo.escrowEmail, sentAt: escrowLink.emailSentAt };
    }

    await this.uploadLinkEmailService.sendUploadLinkEmail(escrowLink, token, {
      tcName: creatorContact.name,
      transactionEmail: creatorContact.email,
      tcPhone: creatorContact.phone,
      ccInstructionEmail: creatorContact.email,
      propertyAddress,
      transactionId: transaction.id,
      outboundEmailAddress: transaction.outboundEmailAddress,
    });

    // Re-fetch rather than trust the in-memory `escrowLink` — sendUploadLinkEmail swallows
    // its own send failures (logs, doesn't throw), so emailSentAt is the actual source of
    // truth for whether the send succeeded.
    const finalLink = await this.uploadLinkService.findActiveLinkForEmail(
      transaction.id, escrowInfo.escrowEmail, ESCROW_OFFICER_TRANSACTION_DOCUMENT_UPLOAD,
    );
    const sent = !!finalLink?.emailSentAt;

    if (sent) {
      await this.auditLogService.log({
        accountId: null,
        action: AuditAction.ESCROW_WELCOME_EMAIL_SENT,
        targetType: 'upload_link',
        targetId: escrowLink.id,
        targetDisplayName: transaction.transactionNumber,
        description: `Escrow welcome email sent to ${escrowInfo.escrowEmail} for transaction ${transaction.transactionNumber}, triggered by the Seller Agent (${sellerAgentLink.recipientName})`,
        details: {
          transactionId: transaction.id,
          uploadLinkId: escrowLink.id,
          escrowEmail: escrowInfo.escrowEmail,
          ccSellerAgentEmail: sellerAgentLink.recipientEmail,
          tcEmailIncluded: !!creatorContact.email,
          triggeredByUploadLinkId: sellerAgentLink.id,
        },
      });
    }

    return { sent, alreadySent: false, escrowEmail: escrowInfo.escrowEmail, sentAt: finalLink?.emailSentAt ?? null };
  }

  async getWelcomeEmailStatus(sellerAgentLink: UploadLinkEntity, transaction: TransactionEntity): Promise<EscrowWelcomeEmailStatus> {
    this.assertSellerAgentLink(sellerAgentLink);

    const escrowInfo = await this.escrowInformationService.findByTransaction(transaction.id);
    if (!escrowInfo?.escrowEmail) {
      return { sentAt: null, sentTo: null };
    }

    const link = await this.uploadLinkService.findActiveLinkForEmail(
      transaction.id, escrowInfo.escrowEmail, ESCROW_OFFICER_TRANSACTION_DOCUMENT_UPLOAD,
    );
    if (!link?.emailSentAt) {
      return { sentAt: null, sentTo: null };
    }
    return { sentAt: link.emailSentAt, sentTo: link.recipientEmail };
  }

  /**
   * "Is the Escrow Officer going to send documents to the Buyer?" — answered by the
   * Escrow Officer on their own secure upload page, persisted on the same one-row-per-
   * transaction EscrowInformationEntity the Buyer Agent's contact-info fields already
   * live on. Escrow-Officer-link only.
   */
  async getDocumentDeliveryPreference(escrowLink: UploadLinkEntity, transaction: TransactionEntity): Promise<EscrowDocumentDeliveryPreference> {
    this.assertEscrowLink(escrowLink);
    const info = await this.escrowInformationService.findByTransaction(transaction.id);
    return { willSendDocumentsToBuyer: info?.willSendDocumentsToBuyer ?? null };
  }

  async saveDocumentDeliveryPreference(
    escrowLink: UploadLinkEntity, transaction: TransactionEntity, willSendDocumentsToBuyer: boolean,
  ): Promise<EscrowDocumentDeliveryPreference> {
    this.assertEscrowLink(escrowLink);

    const diff = await this.escrowInformationService.upsert(transaction.id, { willSendDocumentsToBuyer });
    if (diff.hadChanges) {
      await this.auditLogService.log({
        accountId: null,
        action: AuditAction.ESCROW_DOCUMENT_DELIVERY_PREFERENCE_UPDATED,
        targetType: 'escrow_information',
        targetId: transaction.id,
        targetDisplayName: transaction.transactionNumber,
        description: `Escrow Officer (${escrowLink.recipientName}) answered "will send documents to the Buyer?": ${willSendDocumentsToBuyer ? 'Yes' : 'No'}`,
        details: {
          transactionId: transaction.id,
          uploadLinkId: escrowLink.id,
          willSendDocumentsToBuyer,
          previousValue: diff.previousValues.willSendDocumentsToBuyer ?? null,
        },
      });
    }

    return { willSendDocumentsToBuyer: diff.entity?.willSendDocumentsToBuyer ?? null };
  }

  /**
   * The escrow/file number for the transaction — entered by the Escrow Officer
   * on their own secure upload page, persisted on the same one-row-per-transaction
   * EscrowInformationEntity as the escrow contact and delivery preference.
   * Escrow-Officer-link only.
   */
  async getEscrowNumber(escrowLink: UploadLinkEntity, transaction: TransactionEntity): Promise<EscrowNumberResult> {
    this.assertEscrowLink(escrowLink);
    const info = await this.escrowInformationService.findByTransaction(transaction.id);
    return { escrowNumber: info?.escrowNumber ?? null };
  }

  async saveEscrowNumber(
    escrowLink: UploadLinkEntity, transaction: TransactionEntity, escrowNumber: string | null,
  ): Promise<EscrowNumberResult> {
    this.assertEscrowLink(escrowLink);

    const diff = await this.escrowInformationService.upsert(transaction.id, { escrowNumber });
    if (diff.hadChanges) {
      await this.auditLogService.log({
        accountId: null,
        action: AuditAction.ESCROW_NUMBER_UPDATED,
        targetType: 'escrow_information',
        targetId: transaction.id,
        targetDisplayName: transaction.transactionNumber,
        description: `Escrow Officer (${escrowLink.recipientName}) saved escrow number for transaction ${transaction.transactionNumber}`,
        details: {
          transactionId: transaction.id,
          uploadLinkId: escrowLink.id,
          escrowNumber,
          previousValue: diff.previousValues.escrowNumber ?? null,
        },
      });
    }

    return { escrowNumber: diff.entity?.escrowNumber ?? null };
  }

  /**
   * Whether this property is subject to an HOA — answered by the Buyer Agent
   * (Yes/No only, no document upload) on their own secure upload page and
   * persisted on the transaction-level HoaInformationEntity. The Escrow
   * Officer's own upload page reads this same value (never a separate,
   * manually-entered field) to decide whether "HOA Documents" appears on
   * their document checklist. Escrow-Officer-link only.
   */
  async getHoaRequirement(escrowLink: UploadLinkEntity, transaction: TransactionEntity): Promise<EscrowHoaRequirement> {
    this.assertEscrowLink(escrowLink);
    const info = await this.hoaInformationService.findByTransaction(transaction.id);
    return { hasHoa: info?.hasHoa ?? null };
  }
}
