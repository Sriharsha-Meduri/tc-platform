import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { PartyRole } from '../transaction-parties/entities/transaction-party.entity';
import { TransactionEntity } from '../transactions/entities/transaction.entity';
import { UploadLinkEntity } from '../upload-links/entities/upload-link.entity';
import { UploadLinkService } from '../upload-links/upload-link.service';
import { UploadLinkEmailService } from '../upload-links/upload-link-email.service';
import { BUYER_AGENT_TRANSACTION_DOCUMENT_UPLOAD, BROKER_TRANSACTION_DOCUMENT_UPLOAD } from '../upload-links/upload-link.types';
import { BuyerSideInformationService } from '../transaction-contact-information/buyer-side-information.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { getTransactionCoordinatorContact } from '../transactions/transaction-coordinator-contact.util';
import { AuditAction } from '../audit-log/audit-log.entity';
import { isValidEmail } from '../transactions/transaction-welcome-email.service';

const INVALID_LINK_MESSAGE = 'This upload link is invalid or has expired.';

export interface SendBrokerWelcomeEmailResult {
  sent: boolean;
  alreadySent: boolean;
  brokerEmail: string;
  sentAt: Date | null;
}

/**
 * Orchestrates the Buyer-Agent-triggered broker onboarding email: mints (or
 * reuses) the broker's own secure upload link and sends the welcome email.
 * Mirrors EscrowOnboardingService exactly, but triggered from the Buyer
 * Agent's own "Broker and Commission Information" section instead of the
 * Seller Agent's escrow section, and reads the broker's name/email from
 * BuyerSideInformationEntity (already captured there for commission/CDA
 * purposes) rather than a dedicated contact entity. The broker's own page is
 * currently a placeholder — no checklist, no upload capability — so unlike
 * EscrowOnboardingService this has no companion "getX/saveX" methods for the
 * broker's own page to call, and no dedicated controller.
 *
 * Registered as a provider directly on UploadLinksModule (see
 * upload-links.module.ts) so UploadLinkController can auto-trigger
 * sendWelcomeEmail right after a successful Buyer Agent buyerSide-info save,
 * matching how EscrowOnboardingService is wired for the Seller Agent flow.
 */
@Injectable()
export class BrokerOnboardingService {
  private readonly logger = new Logger(BrokerOnboardingService.name);

  constructor(
    private readonly buyerSideInformationService: BuyerSideInformationService,
    private readonly uploadLinkService: UploadLinkService,
    private readonly uploadLinkEmailService: UploadLinkEmailService,
    private readonly auditLogService: AuditLogService,
  ) {}

  /** Every rejection path throws this exact generic message — mirrors every other gate in this codebase. */
  private assertBuyerAgentLink(link: UploadLinkEntity): void {
    if (link.purpose !== BUYER_AGENT_TRANSACTION_DOCUMENT_UPLOAD) {
      throw new NotFoundException(INVALID_LINK_MESSAGE);
    }
  }

  async sendWelcomeEmail(buyerAgentLink: UploadLinkEntity, transaction: TransactionEntity): Promise<SendBrokerWelcomeEmailResult> {
    this.assertBuyerAgentLink(buyerAgentLink);

    const buyerSide = await this.buyerSideInformationService.findByTransaction(transaction.id);
    if (!buyerSide?.brokerFullName || !buyerSide?.brokerEmail) {
      throw new BadRequestException("Save the broker's name and email before sending the welcome email.");
    }
    if (!isValidEmail(buyerSide.brokerEmail)) {
      throw new BadRequestException('Broker email is not a valid email address.');
    }

    // The signer is always the myTC account that created the transaction — never a
    // manually-entered transaction party field, so the footer identity stays in sync
    // with every other upload-link email.
    const creatorContact = getTransactionCoordinatorContact(transaction, transaction.createdByAccount, this.logger);

    const propertyAddress = [transaction.propertyAddressLine1, transaction.propertyCity, transaction.propertyState]
      .filter(Boolean).join(', ') || transaction.propertyAddressLine1;

    const { link: brokerLink, token } = await this.uploadLinkService.createSecureUploadLinkForEmailRecipient(
      {
        transactionId: transaction.id,
        recipientId: null,
        recipientRole: PartyRole.OTHER,
        recipientName: buyerSide.brokerFullName,
        recipientEmail: buyerSide.brokerEmail,
      },
      BROKER_TRANSACTION_DOCUMENT_UPLOAD,
      {},
    );

    if (token === null) {
      return { sent: false, alreadySent: true, brokerEmail: buyerSide.brokerEmail, sentAt: brokerLink.emailSentAt };
    }

    await this.uploadLinkEmailService.sendUploadLinkEmail(brokerLink, token, {
      tcName: creatorContact.name,
      transactionEmail: creatorContact.email,
      tcPhone: creatorContact.phone,
      propertyAddress,
      transactionId: transaction.id,
      outboundEmailAddress: transaction.outboundEmailAddress,
    });

    // Re-fetch rather than trust the in-memory `brokerLink` — sendUploadLinkEmail swallows
    // its own send failures (logs, doesn't throw), so emailSentAt is the actual source of
    // truth for whether the send succeeded.
    const finalLink = await this.uploadLinkService.findActiveLinkForEmail(
      transaction.id, buyerSide.brokerEmail, BROKER_TRANSACTION_DOCUMENT_UPLOAD,
    );
    const sent = !!finalLink?.emailSentAt;

    if (sent) {
      await this.auditLogService.log({
        accountId: null,
        action: AuditAction.BROKER_WELCOME_EMAIL_SENT,
        targetType: 'upload_link',
        targetId: brokerLink.id,
        targetDisplayName: transaction.transactionNumber,
        description: `Broker welcome email sent to ${buyerSide.brokerEmail} for transaction ${transaction.transactionNumber}, triggered by the Buyer Agent (${buyerAgentLink.recipientName})`,
        details: {
          transactionId: transaction.id,
          uploadLinkId: brokerLink.id,
          brokerEmail: buyerSide.brokerEmail,
          tcEmailIncluded: !!creatorContact.email,
          triggeredByUploadLinkId: buyerAgentLink.id,
        },
      });
    }

    return { sent, alreadySent: false, brokerEmail: buyerSide.brokerEmail, sentAt: finalLink?.emailSentAt ?? null };
  }
}
