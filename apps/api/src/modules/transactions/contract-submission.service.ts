import { Injectable, Logger, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { TransactionEntity, TransactionStatus } from './entities/transaction.entity';
import { TransactionStage } from './entities/transaction-stage-instance.entity';
import { TransactionStageInstancesService } from './transaction-stage-instances.service';
import { TransactionPartyEntity, PartyRole } from '../transaction-parties/entities/transaction-party.entity';
import { TransactionDocumentEntity, DocumentStatus } from '../transaction-documents/entities/transaction-document.entity';
import { TransactionDocumentSubmissionEntity, SubmissionStatus } from '../transaction-documents/entities/transaction-document-submission.entity';
import { TransactionMessageEntity, MessageChannel, MessageDirection, MessageStatus } from '../transaction-messages/entities/transaction-message.entity';
import { MailgunService } from '../auth/mailgun.service';
import { EmailTemplateService } from '../auth/email-template.service';
import { EventSeederService } from './event-seeder.service';
import { TransactionWelcomeEmailService, isValidEmail } from './transaction-welcome-email.service';
import { getTransactionCoordinatorContact } from './transaction-coordinator-contact.util';
import { AccountsService } from '../accounts/accounts.service';
import { TransactionAccessGrantsService } from '../transaction-access-grants/transaction-access-grants.service';
import { AccessLevel } from '../transaction-access-grants/entities/transaction-access-grant.entity';
import { UploadLinkService } from '../upload-links/upload-link.service';
import { UploadLinkEmailService } from '../upload-links/upload-link-email.service';
import { BlockerOverrideService } from '../blocker-overrides/blocker-override.service';
import { partitionBlockers } from '../blocker-overrides/blocker-override.util';
import type { BlockerOutput } from '../document-extraction/compliance-result.types';
import {
  validateContractChain,
  normalizeContractDocument,
  type FormExtractionResult,
  type ContractDocumentExtraction,
} from '@tc/document-intelligence';

export interface PartyEmailInput {
  name:  string;
  email?: string;
}

export interface SubmitContractDto {
  buyerAgentName:  string;
  buyerAgentEmail: string;
  sellerAgentName:  string;
  sellerAgentEmail: string;
  buyers:  PartyEmailInput[];
  sellers: PartyEmailInput[];
  sellerTcName?:  string | null;
  sellerTcEmail?: string | null;
  titleContactName?: string | null;
  titleCompanyName?: string | null;
  titleEmail?: string | null;
  titlePhone?: string | null;
  escrowContactName?: string | null;
  escrowJobTitle?: string | null;
  escrowCompanyName?: string | null;
  escrowEmail?: string | null;
  escrowPhone?: string | null;
  hwContactName?: string | null;
  hwJobTitle?: string | null;
  hwCompanyName?: string | null;
  hwEmail?: string | null;
  hwPhone?: string | null;
}

export interface SubmitContractResult {
  submission: TransactionDocumentSubmissionEntity;
  emailsSent: string[];
}

@Injectable()
export class ContractSubmissionService {
  private readonly logger = new Logger(ContractSubmissionService.name);

  constructor(
    @InjectRepository(TransactionEntity)
    private readonly transactionsRepo: Repository<TransactionEntity>,
    @InjectRepository(TransactionPartyEntity)
    private readonly partiesRepo: Repository<TransactionPartyEntity>,
    @InjectRepository(TransactionDocumentEntity)
    private readonly documentsRepo: Repository<TransactionDocumentEntity>,
    @InjectRepository(TransactionDocumentSubmissionEntity)
    private readonly submissionsRepo: Repository<TransactionDocumentSubmissionEntity>,
    @InjectRepository(TransactionMessageEntity)
    private readonly messagesRepo: Repository<TransactionMessageEntity>,
    private readonly mailgunService: MailgunService,
    private readonly emailTemplateService: EmailTemplateService,
    private readonly eventSeederService: EventSeederService,
    private readonly welcomeEmailService: TransactionWelcomeEmailService,
    private readonly stageInstancesService: TransactionStageInstancesService,
    private readonly accountsService: AccountsService,
    private readonly accessGrantsService: TransactionAccessGrantsService,
    private readonly uploadLinkService: UploadLinkService,
    private readonly uploadLinkEmailService: UploadLinkEmailService,
    private readonly blockerOverrideService: BlockerOverrideService,
  ) {}

  /**
   * Confirms party details, creates submission #1, advances transaction to CONTRACT
   * stage, and sends a welcome email to each party.
   *
   * From address uses transaction.outboundEmailAddress so that reply routing in
   * Mailgun resolves back to the correct transaction row.
   */
  async submitContract(
    transactionId: string,
    dto: SubmitContractDto,
    submitterRoles: string[] = [],
  ): Promise<SubmitContractResult> {
    const tx = await this.transactionsRepo.findOne({
      where: { id: transactionId },
      relations: ['createdByAccount', 'createdByAccount.user'],
    });
    if (!tx) throw new NotFoundException(`Transaction ${transactionId} not found`);

    // ── Update party records ────────────────────────────────────────────────────
    await this.upsertPartiesForRole(transactionId, PartyRole.BUYER,  dto.buyers);
    await this.upsertPartiesForRole(transactionId, PartyRole.SELLER, dto.sellers);
    const buyerAgentParty  = await this.upsertParty(transactionId, PartyRole.BUYER_AGENT, dto.buyerAgentName, dto.buyerAgentEmail);
    const sellerAgentParty = await this.upsertParty(transactionId, PartyRole.SELLER_AGENT, dto.sellerAgentName, dto.sellerAgentEmail);
    if (dto.sellerTcName && dto.sellerTcEmail) {
      await this.upsertParty(transactionId, PartyRole.SELLER_TRANSACTION_COORDINATOR, dto.sellerTcName, dto.sellerTcEmail);
    }

    const isAgentSubmitter = submitterRoles.includes('agent');

    // ── Buyer Agent association ────────────────────────────────────────────────
    // When a TC (not an agent) submits and provides a buyer agent email, look up
    // whether that email has a MyTC Agent account. If it does, link the account
    // on the transaction and grant portal access immediately — submission never
    // waits on or is blocked by the agent's account status.
    if (!isAgentSubmitter && dto.buyerAgentEmail) {
      const agentAccount = await this.accountsService.findAgentByEmail(dto.buyerAgentEmail);
      if (agentAccount) {
        tx.buyerAgentAccountId = agentAccount.id;

        try {
          await this.accessGrantsService.create({
            transactionId,
            accountEmail: dto.buyerAgentEmail,
            accessLevel: AccessLevel.COLLABORATE,
            grantedByAccountId: tx.createdByAccountId,
          });
        } catch (err) {
          // Non-fatal — grant may already exist
          this.logger.warn(`Access grant creation skipped for ${dto.buyerAgentEmail}: ${(err as Error).message}`);
        }
      } else {
        this.logger.log(`No MyTC account found for buyer agent ${dto.buyerAgentEmail} — proceeding without portal access`);
      }
    }

    // ── Compliance blocker check ───────────────────────────────────────────────
    // Resolves through the same centralized blocker-override store every other
    // consumer (checklists, DocuSign eligibility, the compliance section) uses
    // — an override recorded anywhere for this exact RPA document (or this
    // blocker code transaction-wide) clears this gate too, never a separate
    // submission-only flag.
    const rpaDoc = await this.documentsRepo.findOne({
      where: { transactionId, documentType: 'purchase_agreement', status: Not(DocumentStatus.SUPERSEDED) },
    });
    const blockers = (rpaDoc?.metadataJson as { compliance?: { blockers?: BlockerOutput[] } } | null)?.compliance?.blockers;

    if (blockers && blockers.length > 0) {
      const overrides = await this.blockerOverrideService.findForTransaction(transactionId);
      const { active: activeBlockers } = partitionBlockers(blockers, overrides, { documentId: rpaDoc!.id, formCode: rpaDoc!.formCode });

      if (activeBlockers.length > 0) {
        throw new UnprocessableEntityException({
          code: 'BLOCKERS_PENDING',
          blockers: activeBlockers,
          message:
            `Cannot submit this transaction because ${activeBlockers.length} compliance ` +
            `blocker${activeBlockers.length !== 1 ? 's are' : ' is'} unresolved. ` +
            `Please re-upload a corrected Residential Purchase Agreement (RPA) and try again.`,
        });
      }
    }

    // ── Create submission record ────────────────────────────────────────────────
    const maxResult = await this.submissionsRepo
      .createQueryBuilder('s')
      .select('MAX(s."submission_no")', 'max')
      .where('s."transaction_id" = :id', { id: transactionId })
      .getRawOne<{ max: string | null }>();
    const nextNo = (parseInt(maxResult?.max ?? '0', 10) || 0) + 1;

    const submission = await this.submissionsRepo.save(
      this.submissionsRepo.create({
        transactionId,
        submissionNo: nextNo,
        status: SubmissionStatus.UNDER_REVIEW,
        notes: 'Initial contract submission',
      }),
    );

    // ── Activate CONTRACT stage instance + mark transaction active ──────────────
    tx.status = TransactionStatus.ACTIVE;

    if (dto.titleContactName || dto.titleCompanyName || dto.titleEmail || dto.titlePhone) {
      tx.summaryJson = {
        ...(tx.summaryJson as Record<string, unknown> ?? {}),
        titleContact: {
          contactName: dto.titleContactName ?? null,
          companyName: dto.titleCompanyName ?? null,
          email: dto.titleEmail ?? null,
          phone: dto.titlePhone ?? null,
        },
      };
    }

    if (dto.escrowContactName || dto.escrowCompanyName || dto.escrowEmail || dto.escrowPhone) {
      tx.summaryJson = {
        ...(tx.summaryJson as Record<string, unknown> ?? {}),
        escrowContact: {
          contactName: dto.escrowContactName ?? null,
          jobTitle: dto.escrowJobTitle ?? null,
          companyName: dto.escrowCompanyName ?? null,
          email: dto.escrowEmail ?? null,
          phone: dto.escrowPhone ?? null,
        },
      };
    }

    if (dto.hwContactName || dto.hwCompanyName || dto.hwEmail || dto.hwPhone) {
      tx.summaryJson = {
        ...(tx.summaryJson as Record<string, unknown> ?? {}),
        homeWarrantyContact: {
          contactName: dto.hwContactName ?? null,
          jobTitle: dto.hwJobTitle ?? null,
          companyName: dto.hwCompanyName ?? null,
          email: dto.hwEmail ?? null,
          phone: dto.hwPhone ?? null,
        },
      };
    }

    await this.transactionsRepo.save(tx);
    await this.stageInstancesService.activateStage(transactionId, TransactionStage.CONTRACT);

    // ── Seed transaction events from extracted dates ────────────────────────────
    await this.eventSeederService.seedFromExtraction(transactionId);

    // ── Send welcome emails + write message rows ────────────────────────────────
    const emailsSent = await this.welcomeEmailService.sendWelcomeEmails(transactionId);

    // ── Send the Buyer(s) their own Welcome + Timeline email ────────────────────
    // Genuinely separate from the agent-facing welcome email above and from the
    // Buyer Agent's own secure upload-link email below (To: Buyer(s), Cc: Buyer
    // Agent) — never blocks submission on failure, same non-fatal pattern as the
    // upload-link sends further down.
    try {
      const buyerEmailsSent = await this.welcomeEmailService.sendBuyerWelcomeEmail(transactionId);
      emailsSent.push(...buyerEmailsSent);
    } catch (err) {
      this.logger.warn(`Failed to send Buyer welcome email for tx ${tx.transactionNumber}: ${(err as Error).message}`);
    }

    // ── TC footer for the upload-link emails ────────────────────────────────────
    // Must come from the myTC account that created the transaction (the logged-in
    // TC who submitted it) — never a manually entered party value or an optional,
    // separately-assignable field. Every value is either a real value or null; the
    // templates omit the corresponding footer line when null, so no placeholder
    // text like "Not specified" can ever appear. The email shown is the
    // transaction-specific Mailgun address, never the TC's myTC login email (see
    // getTransactionCoordinatorContact).
    const creatorContact = getTransactionCoordinatorContact(tx, tx.createdByAccount, this.logger);

    // ── Send the Buyer Agent their secure document-upload link ─────────────────
    // Sent regardless of who submitted — unlike the welcome email, this is useful
    // even when the agent themselves is the submitter, since it's a standing
    // no-login capability rather than a one-time "welcome" notice.
    if (buyerAgentParty.email) {
      try {
        const propertyAddress = [tx.propertyAddressLine1, tx.propertyCity, tx.propertyState]
          .filter(Boolean).join(', ') || tx.propertyAddressLine1;

        const { link, token } = await this.uploadLinkService.createSecureUploadLink(
          {
            transactionId,
            recipientId: buyerAgentParty.id,
            recipientRole: PartyRole.BUYER_AGENT,
            recipientName: buyerAgentParty.displayName,
            recipientEmail: buyerAgentParty.email,
          },
          'document_upload',
          { createdByAccountId: tx.createdByAccountId },
        );

        await this.uploadLinkEmailService.sendUploadLinkEmail(link, token, {
          transactionId: tx.id,
          tcName: creatorContact.name,
          transactionEmail: creatorContact.email,
          tcPhone: creatorContact.phone,
          propertyAddress,
          outboundEmailAddress: tx.outboundEmailAddress,
        });
      } catch (err) {
        this.logger.warn(`Failed to create/send upload link for tx ${tx.transactionNumber}: ${(err as Error).message}`);
      }
    }

    // ── Send the Seller Agent their secure document-upload link ────────────────
    // Separate link/token/purpose from the Buyer Agent's — never reused, never
    // cross-valid. CC's the current Seller Transaction Coordinator (looked up
    // fresh, not from this call's dto, so a TC assigned in an earlier
    // submission still gets CC'd even if this retry didn't resupply their info)
    // when one is assigned with a valid email.
    if (isValidEmail(sellerAgentParty.email)) {
      try {
        const propertyAddress = [tx.propertyAddressLine1, tx.propertyCity, tx.propertyState]
          .filter(Boolean).join(', ') || tx.propertyAddressLine1;

        const currentSellerTc = await this.partiesRepo.findOne({
          where: { transactionId, partyRole: PartyRole.SELLER_TRANSACTION_COORDINATOR },
        });
        const ccRecipient = currentSellerTc && isValidEmail(currentSellerTc.email)
          ? {
              partyId: currentSellerTc.id,
              role: PartyRole.SELLER_TRANSACTION_COORDINATOR,
              name: currentSellerTc.displayName,
              email: currentSellerTc.email,
            }
          : null;

        const { link, token } = await this.uploadLinkService.createSecureUploadLink(
          {
            transactionId,
            recipientId: sellerAgentParty.id,
            recipientRole: PartyRole.SELLER_AGENT,
            recipientName: sellerAgentParty.displayName,
            recipientEmail: sellerAgentParty.email,
          },
          'seller_agent_document_upload',
          { createdByAccountId: tx.createdByAccountId, ccRecipient },
        );

        await this.uploadLinkEmailService.sendUploadLinkEmail(link, token, {
          transactionId: tx.id,
          tcName: creatorContact.name,
          transactionEmail: creatorContact.email,
          tcPhone: creatorContact.phone,
          propertyAddress,
          outboundEmailAddress: tx.outboundEmailAddress,
        });
      } catch (err) {
        this.logger.warn(`Failed to create/send Seller Agent upload link for tx ${tx.transactionNumber}: ${(err as Error).message}`);
      }
    }

    // ── Lender introduction email to the buyer agent ───
    if (!isAgentSubmitter) {
      await this.sendLenderIntroduction(transactionId, tx, buyerAgentParty);
    }

    // ── Evaluate negotiation chain for Inspection/Appraisal contingency status ──
    await this.evaluateContingencyStages(transactionId);

    this.logger.log(
      `Contract submitted for transaction ${tx.transactionNumber} — submission #${nextNo}, ${emailsSent.length} emails sent`,
    );

    return {
      submission,
      emailsSent,
    };
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  /** Update the first matching party row for this role, or create one if none exists. Returns the saved entity. */
  private async upsertParty(
    transactionId: string,
    role: PartyRole,
    displayName: string,
    email: string,
  ): Promise<TransactionPartyEntity> {
    const existing = await this.partiesRepo.findOne({ where: { transactionId, partyRole: role } });
    if (existing) {
      existing.displayName = displayName;
      existing.email = email;
      return this.partiesRepo.save(existing);
    }
    return this.partiesRepo.save(
      this.partiesRepo.create({ transactionId, partyRole: role, displayName, email }),
    );
  }

  /**
   * Upsert multiple party rows for a role that can have more than one person
   * (buyers, sellers). Existing rows for the role are matched by position
   * (oldest first) and updated in place; only entries beyond the existing
   * count create new rows. This keeps repeated submissions/edits from
   * creating duplicate party records for the same person.
   */
  private async upsertPartiesForRole(
    transactionId: string,
    role: PartyRole,
    entries: PartyEmailInput[],
  ): Promise<TransactionPartyEntity[]> {
    // Only a name is required to persist a party row — email is required for
    // Buyers (enforced by the frontend/validation before this is called) but
    // optional for Sellers, whose email is not collected on the Draft form.
    const valid = (entries ?? []).filter((e) => e?.name?.trim());

    const existing = await this.partiesRepo.find({
      where: { transactionId, partyRole: role },
      order: { createdAt: 'ASC' },
    });

    const saved: TransactionPartyEntity[] = [];
    for (let i = 0; i < valid.length; i++) {
      const { name, email } = valid[i];
      const trimmedEmail = email?.trim();
      const row = existing[i];
      if (row) {
        row.displayName = name.trim();
        // Never blank out a previously-stored email when this submission
        // didn't collect one (e.g. sellers) — leave the existing row's email
        // as-is rather than overwriting it with an absent value.
        if (trimmedEmail) row.email = trimmedEmail;
        saved.push(await this.partiesRepo.save(row));
      } else {
        saved.push(await this.partiesRepo.save(
          this.partiesRepo.create({ transactionId, partyRole: role, displayName: name.trim(), email: trimmedEmail || null }),
        ));
      }
    }
    return saved;
  }

  /**
   * Load all contract documents (RPA, SCO, BCO, SMCO, BMCO) for the
   * transaction, build the negotiation chain, and waive Inspection/Appraisal
   * stages when the final negotiated contract removes those contingencies.
   */
  private async evaluateContingencyStages(transactionId: string): Promise<void> {
    try {
      const contractDocs = await this.documentsRepo.find({
        where: { transactionId },
        order: { createdAt: 'ASC' },
      });

      const contractFormCodes = new Set(['RPA', 'SCO', 'BCO', 'SMCO', 'BMCO']);
      const extractions: FormExtractionResult[] = [];
      const chainDocs: ContractDocumentExtraction[] = [];
      let seq = 0;

      for (const doc of contractDocs) {
        const meta = (doc.metadataJson as Record<string, unknown> | null) ?? {};
        const formCode = (meta?.detectedFormCode as string ?? doc.formCode ?? '').toUpperCase();
        if (!contractFormCodes.has(formCode)) continue;

        const extraction = meta?.extraction as Record<string, unknown> | null;
        if (!extraction) continue;

        const fr: FormExtractionResult = {
          formCode,
          formName: doc.title,
          pageIndices: [],
          output: {
            formCode,
            formName: doc.title,
            data: extraction,
            rawResponse: '',
            promptTokens: 0,
            completionTokens: 0,
            modelName: 'stored',
          },
        };
        extractions.push(fr);

        const normalized = normalizeContractDocument(fr, doc.fileName ?? doc.title, seq++);
        if (normalized) chainDocs.push(normalized);
      }

      if (chainDocs.length === 0) return;

      const chainResult = validateContractChain(chainDocs, extractions);

      // Always activate all three contingency stages — CR form is required
      // as the official record regardless of chain outcome.
      await this.stageInstancesService.activateStage(transactionId, TransactionStage.INSPECTION);
      await this.stageInstancesService.activateStage(transactionId, TransactionStage.APPRAISAL);
      await this.stageInstancesService.activateStage(transactionId, TransactionStage.LOAN);
      this.logger.log(
        `All contingency stages activated — CR-B form required as official record for each`,
      );
    } catch (err) {
      this.logger.warn(`Contingency stage evaluation failed (non-fatal): ${(err as Error).message}`);
    }
  }

  /**
   * Sends an introductory email to the lender (Loan Officer) with executed
   * contract documents, CC'ing the Buyer Agent. Looks up lender email from
   * PREQUAL document extraction or a lender party record.
   */
  private async sendLenderIntroduction(
    transactionId: string,
    tx: TransactionEntity,
    buyerAgentParty: TransactionPartyEntity,
  ): Promise<void> {
    try {
      // Find lender email from PREQUAL document extraction
      let lenderEmail: string | null = null;
      let lenderName = 'Loan Officer';

      const prequalDoc = await this.documentsRepo.findOne({
        where: { transactionId, documentType: 'intake_document' },
        order: { createdAt: 'DESC' },
      });

      if (prequalDoc?.metadataJson) {
        const meta = prequalDoc.metadataJson as Record<string, unknown>;
        const extraction = meta?.extraction as Record<string, unknown> | null;
        const lenders = (extraction?.parties as Record<string, unknown>)?.lenders as Array<Record<string, unknown>> | null;
        if (lenders?.[0]) {
          lenderEmail = (lenders[0].email as string) ?? null;
          lenderName = (lenders[0].contactName as string) || (lenders[0].companyName as string) || 'Loan Officer';
        }
      }

      // Fallback: check transaction party with loan_officer role
      if (!lenderEmail) {
        const loanOfficer = await this.partiesRepo.findOne({
          where: { transactionId, partyRole: 'loan_officer' as PartyRole },
        });
        if (loanOfficer?.email) {
          lenderEmail = loanOfficer.email;
          lenderName = loanOfficer.displayName || 'Loan Officer';
        }
      }

      if (!lenderEmail) {
        this.logger.log(`No lender email found for tx=${tx.transactionNumber} — skipping lender intro`);
        return;
      }

      const propertyAddress = [tx.propertyAddressLine1, tx.propertyCity, tx.propertyState]
        .filter(Boolean).join(', ');

      const ctx = {
        name: lenderName,
        address: propertyAddress,
        txNumber: tx.transactionNumber,
        purchasePrice: tx.contractPrice ? `$${tx.contractPrice.toLocaleString()}` : null,
        closeDate: tx.closeOfEscrowAt
          ? new Date(tx.closeOfEscrowAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
          : null,
        hasCounterOffers: false,
        escrowInfo: null,
      };

      const subject = `Executed Purchase Agreement — ${propertyAddress}`;
      const html = this.emailTemplateService.render('lender-intro.html.hbs', ctx);
      const text = this.emailTemplateService.render('lender-intro.text.hbs', ctx);

      const fromAddress = tx.outboundEmailAddress
        ? `TC Platform <${tx.outboundEmailAddress}>`
        : `TC Platform <noreply@txn.mytcapp.net>`;

      const mailResult = await this.mailgunService.sendEmail(
        lenderEmail, subject, html, text, fromAddress,
      );

      // Record outbound message for Notification Status
      await this.messagesRepo.save(
        this.messagesRepo.create({
          transactionId: tx.id,
          channel: MessageChannel.EMAIL,
          direction: MessageDirection.OUTBOUND,
          status: MessageStatus.SENT,
          subject,
          bodyText: text,
          providerName: 'mailgun',
          providerMessageId: mailResult?.messageId ?? null,
          stage: 'intake',
          sentAt: new Date(),
          metadataJson: { to: lenderEmail, role: 'loan_officer', type: 'lender-introduction', cc: buyerAgentParty.email },
        }),
      );

      // CC to Buyer Agent
      if (buyerAgentParty.email) {
        const ccMailResult = await this.mailgunService.sendEmail(
          buyerAgentParty.email, subject, html, text, fromAddress,
        );
        await this.messagesRepo.save(
          this.messagesRepo.create({
            transactionId: tx.id,
            channel: MessageChannel.EMAIL,
            direction: MessageDirection.OUTBOUND,
            status: MessageStatus.SENT,
            subject,
            bodyText: text,
            providerName: 'mailgun',
            providerMessageId: ccMailResult?.messageId ?? null,
            recipientPartyId: buyerAgentParty.id,
            stage: 'intake',
            sentAt: new Date(),
            metadataJson: { to: buyerAgentParty.email, role: 'buyer_agent', type: 'lender-introduction-cc' },
          }),
        );
      }

      this.logger.log(
        `Sent lender intro email to ${lenderEmail} for tx=${tx.transactionNumber}`,
      );
    } catch (err) {
      this.logger.warn(`Failed to send lender intro email: ${(err as Error).message}`);
    }
  }
}
