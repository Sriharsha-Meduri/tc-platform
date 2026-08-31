import { Controller, Get, Post, Param, Body, Req, Res, Headers, UseGuards, UseInterceptors, UploadedFiles, UploadedFile, HttpCode, HttpStatus, UnauthorizedException, NotFoundException, StreamableFile, Logger } from '@nestjs/common';
import { FilesInterceptor, FileInterceptor } from '@nestjs/platform-express';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { AccountsService } from '../accounts/accounts.service';
import { UploadLinkService } from './upload-link.service';
import { ExternalDocumentUploadService } from './external-document-upload.service';
import { getDefaultAllowedFileConfig, SELLER_AGENT_TRANSACTION_DOCUMENT_UPLOAD, BUYER_AGENT_TRANSACTION_DOCUMENT_UPLOAD, BROKER_TRANSACTION_DOCUMENT_UPLOAD } from './upload-link.types';
import { ExternalTransactionInformationService, SaveTransactionInformationDto } from '../transaction-contact-information/external-transaction-information.service';
import { SellerAgentDocusignService } from './seller-agent-docusign.service';
import { SellerAgentDocumentDocusignService } from './seller-agent-document-docusign.service';
import { ChecklistCompositionService } from './checklist-composition.service';
import { TransactionCompletionService } from './transaction-completion.service';
import { TransactionDocumentsService } from '../transaction-documents/transaction-documents.service';
import { S3StorageService } from '../storage/s3-storage.service';
import { EscrowOnboardingService } from '../escrow-onboarding/escrow-onboarding.service';
import { BrokerOnboardingService } from '../broker-onboarding/broker-onboarding.service';
import { CdaGenerationService } from '../cda/cda-generation.service';
import { CdaNotificationService } from '../cda-notification/cda-notification.service';
import { SignedCdaUploadService } from '../signed-cda-upload/signed-cda-upload.service';
import { canExternalUserSeeDocument, resolveUploadedByType, resolveUploadLinkVisibilityType } from './document-visibility.util';

const config = getDefaultAllowedFileConfig();

@Controller('upload-links')
export class UploadLinkController {
  private readonly logger = new Logger(UploadLinkController.name);

  constructor(
    private readonly uploadLinkService: UploadLinkService,
    private readonly externalUploadService: ExternalDocumentUploadService,
    private readonly externalTransactionInformationService: ExternalTransactionInformationService,
    private readonly sellerAgentDocusignService: SellerAgentDocusignService,
    private readonly sellerAgentDocumentDocusignService: SellerAgentDocumentDocusignService,
    private readonly checklistComposition: ChecklistCompositionService,
    private readonly transactionCompletionService: TransactionCompletionService,
    private readonly accountsService: AccountsService,
    private readonly transactionDocumentsService: TransactionDocumentsService,
    private readonly s3: S3StorageService,
    private readonly escrowOnboardingService: EscrowOnboardingService,
    private readonly brokerOnboardingService: BrokerOnboardingService,
    private readonly cdaGenerationService: CdaGenerationService,
    private readonly cdaNotificationService: CdaNotificationService,
    private readonly signedCdaUploadService: SignedCdaUploadService,
  ) {}

  private async resolveAccountId(req: Request): Promise<string> {
    const userId = (req.user as { userId?: string })?.userId;
    if (!userId) throw new UnauthorizedException('Not authenticated');
    const account = await this.accountsService.findByUserId(userId);
    if (!account) throw new UnauthorizedException('Account not found');
    return account.id;
  }

  // ── Public, no-login surface — token-scoped only ────────────────────────────

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get('token/:token/context')
  async getContext(@Param('token') token: string) {
    return this.uploadLinkService.getUploadPageContext(token);
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('token/:token/documents')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FilesInterceptor('files', config.maxFiles, { limits: { fileSize: config.maxFileSizeBytes } }))
  async uploadDocuments(
    @Param('token') token: string,
    @UploadedFiles() files: Express.Multer.File[],
    @Headers('idempotency-key') idempotencyKey?: string,
    @Body('documentCategory') documentCategory?: string,
  ) {
    const results = await this.externalUploadService.uploadTransactionDocuments(token, files ?? [], idempotencyKey ?? null, documentCategory ?? null);
    return { results };
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get('token/:token/documents')
  async getUploadedDocuments(@Param('token') token: string) {
    const documents = await this.externalUploadService.listUploadedDocuments(token);
    return { documents };
  }

  /**
   * Stream a document's file to the Seller/Buyer Agent (or Escrow Officer)
   * viewing their own secure upload page — never an authenticated-account
   * route, so authorization here is entirely token-scoped: the document
   * must belong to THIS link's transaction, AND this link's audience must
   * be allowed to see it under canExternalUserSeeDocument (the same rule
   * that determines what appears in the "Uploaded Documents" list) —
   * otherwise a valid token for one link could be used to fish for another
   * link's (or another transaction's) documents by id. Never a bare
   * uploadLinkId equality check — that would refuse the very cross-link
   * documents (internal uploads for Buyer Agent, the RPA for Escrow) this
   * rule is meant to allow.
   */
  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get('token/:token/documents/:documentId/file')
  async streamDocumentFile(
    @Param('token') token: string,
    @Param('documentId') documentId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { link, transaction } = await this.uploadLinkService.validateUploadToken(token);
    const doc = await this.transactionDocumentsService.findOneWithUploadLink(documentId);
    const linkType = resolveUploadLinkVisibilityType(link.purpose);
    const uploadedByType = resolveUploadedByType(doc.uploadLinkId, doc.uploadLink?.purpose);
    const authorized = doc.transactionId === transaction.id
      && canExternalUserSeeDocument({ uploadedByType, formCode: doc.formCode, documentType: doc.documentType, status: doc.status }, linkType);
    if (!authorized) {
      throw new NotFoundException('Document not found');
    }
    if (!doc.storageKey) {
      throw new NotFoundException(`Document ${documentId} has no file stored`);
    }

    try {
      const { stream, contentType, contentLength, fileName } = await this.s3.getObject(doc.storageKey);
      res.set({
        'Content-Type': contentType,
        'Content-Disposition': `inline; filename="${fileName}"`,
        ...(contentLength != null ? { 'Content-Length': String(contentLength) } : {}),
      });
      return new StreamableFile(stream);
    } catch (err) {
      const code = (err as { name?: string })?.name;
      if (code === 'NoSuchKey' || code === 'NotFound') {
        throw new NotFoundException(`File not found in storage for document ${documentId}`);
      }
      throw err;
    }
  }

  /**
   * The generated CDA, if one exists and this link's audience is allowed to
   * see it (Buyer Agent and Broker links only — see
   * document-visibility.util.ts's BROKER exception). Returns `{ cda: null }`
   * rather than 404 when there's no CDA yet, or none visible to this link, so
   * the frontend can render "not ready yet" instead of an error state.
   */
  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get('token/:token/cda')
  async getCda(@Param('token') token: string) {
    const { link, transaction } = await this.uploadLinkService.validateUploadToken(token);
    const cda = await this.cdaGenerationService.getCdaForLink(token, link, transaction);
    return { cda };
  }

  /**
   * The signed CDA, if one has been uploaded and this link's audience is
   * allowed to see it — Broker (their own upload) and Escrow links only,
   * see document-visibility.util.ts. Same "{ signedCda: null } rather than
   * 404" shape as getCda above.
   */
  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get('token/:token/signed-cda')
  async getSignedCda(@Param('token') token: string) {
    const { link, transaction } = await this.uploadLinkService.validateUploadToken(token);
    const signedCda = await this.cdaGenerationService.getSignedCdaForLink(token, link, transaction);
    return { signedCda };
  }

  /**
   * The Broker's one narrow upload capability — the signed CDA, and nothing
   * else. Non-fatally notifies Escrow afterward (their own reply-in-thread
   * "signed CDA available" email) — a notification-send failure must never
   * fail the upload itself, matching every other auto-trigger in this
   * controller.
   */
  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('token/:token/signed-cda')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: config.maxFileSizeBytes } }))
  async uploadSignedCda(@Param('token') token: string, @UploadedFile() file: Express.Multer.File) {
    const stored = await this.signedCdaUploadService.uploadSignedCda(token, file);

    try {
      const { transaction } = await this.uploadLinkService.validateUploadToken(token);
      await this.cdaNotificationService.notifyEscrowOfSignedCda(transaction);
    } catch (err) {
      this.logger.warn(`Signed-CDA-available notification failed for token ${token}: ${(err as Error).message}`);
    }

    return { documentId: stored.id };
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get('token/:token/transaction-info')
  async getTransactionInfo(@Param('token') token: string) {
    const { link, transaction } = await this.uploadLinkService.validateUploadToken(token);
    return this.externalTransactionInformationService.getPrefillData(link, transaction);
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('token/:token/transaction-info')
  @HttpCode(HttpStatus.OK)
  async saveTransactionInfo(@Param('token') token: string, @Body() dto: SaveTransactionInformationDto) {
    const { link, transaction } = await this.uploadLinkService.validateUploadToken(token);
    const saved = await this.externalTransactionInformationService.saveTransactionInformation(link, transaction, dto);

    // Once the Seller Agent has saved valid escrow contact info (name + email — the
    // welcome email itself re-validates), automatically mint/send the Escrow Officer's
    // welcome email rather than requiring a separate manual trigger. Non-fatal: a send
    // failure here must never fail the info save the Seller Agent is actively waiting on.
    let escrowWelcomeEmail = null;
    if (link.purpose === SELLER_AGENT_TRANSACTION_DOCUMENT_UPLOAD && dto.escrow !== undefined && saved.escrow.escrowContactName && saved.escrow.escrowEmail) {
      try {
        escrowWelcomeEmail = await this.escrowOnboardingService.sendWelcomeEmail(link, transaction);
      } catch (err) {
        this.logger.warn(`Escrow welcome email auto-trigger failed for transaction ${transaction.id}: ${(err as Error).message}`);
      }
    }

    // Same auto-trigger pattern for the Buyer Agent's "Broker and Commission Information"
    // section: once a valid broker name + email is saved, automatically mint/send the
    // broker's own welcome email. Non-fatal for the same reason as above.
    let brokerWelcomeEmail = null;
    if (link.purpose === BUYER_AGENT_TRANSACTION_DOCUMENT_UPLOAD && dto.buyerSide !== undefined && saved.buyerSide.brokerFullName && saved.buyerSide.brokerEmail) {
      try {
        brokerWelcomeEmail = await this.brokerOnboardingService.sendWelcomeEmail(link, transaction);
      } catch (err) {
        this.logger.warn(`Broker welcome email auto-trigger failed for transaction ${transaction.id}: ${(err as Error).message}`);
      }
    }

    // Once either the Buyer Agent's own commission section or the Broker's own
    // commission split changes, try to (re)generate the CDA — maybeGenerateCda
    // itself no-ops until both sides are complete, so this call is safe on every
    // partial save; it only ever produces a document once the data is whole. Same
    // non-fatal pattern as the welcome-email triggers above.
    if (
      (link.purpose === BUYER_AGENT_TRANSACTION_DOCUMENT_UPLOAD && dto.buyerSide !== undefined)
      || (link.purpose === BROKER_TRANSACTION_DOCUMENT_UPLOAD && dto.broker !== undefined)
    ) {
      try {
        await this.cdaGenerationService.maybeGenerateCda(transaction);
      } catch (err) {
        this.logger.warn(`CDA generation failed for transaction ${transaction.id}: ${(err as Error).message}`);
      }

      try {
        await this.cdaNotificationService.notifyIfCdaReady(transaction);
      } catch (err) {
        this.logger.warn(`CDA-ready notification failed for transaction ${transaction.id}: ${(err as Error).message}`);
      }
    }

    return { saved, escrowWelcomeEmail, brokerWelcomeEmail };
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get('token/:token/checklist')
  async getDocumentChecklist(@Param('token') token: string) {
    const { link, transaction } = await this.uploadLinkService.validateUploadToken(token);
    const [checklist, transactionCompleted] = await Promise.all([
      this.checklistComposition.composeForLink(link, transaction),
      this.transactionCompletionService.isTransactionCompleted(transaction),
    ]);
    return { ...checklist, transactionCompleted };
  }

  /**
   * A minimal, purpose-agnostic read of the Seller Agent's own required-document
   * status — currently consumed by the Buyer Agent link to show its own "waiting
   * on the Seller Agent" notice. Deliberately returns only the boolean, never the
   * Seller Agent's checklist items/document names, since the caller here may be
   * on an entirely different side of the transaction. See
   * ChecklistCompositionService.getSellerAgentStatusSummary for how this stays
   * in sync with the Seller Agent Upload Link and the transaction swimlane.
   */
  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get('token/:token/seller-status')
  async getSellerAgentStatus(@Param('token') token: string) {
    const { transaction } = await this.uploadLinkService.validateUploadToken(token);
    return this.checklistComposition.getSellerAgentStatusSummary(transaction);
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get('token/:token/docusign/status')
  async getDocusignStatus(@Param('token') token: string) {
    const { link, transaction } = await this.uploadLinkService.validateUploadToken(token);
    return this.sellerAgentDocusignService.getStatus(link, transaction);
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('token/:token/docusign/confirm')
  @HttpCode(HttpStatus.OK)
  async confirmDocusign(@Param('token') token: string) {
    const { link, transaction } = await this.uploadLinkService.validateUploadToken(token);
    return this.sellerAgentDocusignService.confirm(link, transaction);
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('token/:token/docusign/send')
  @HttpCode(HttpStatus.OK)
  async sendDocusign(@Param('token') token: string) {
    const { link, transaction } = await this.uploadLinkService.validateUploadToken(token);
    const envelope = await this.sellerAgentDocusignService.send(link, transaction);
    return { envelopeId: envelope.envelopeId, status: envelope.status, sentAt: envelope.sentAt };
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('token/:token/documents/:documentId/docusign/send')
  @HttpCode(HttpStatus.OK)
  async sendDocumentDocusign(
    @Param('token') token: string,
    @Param('documentId') documentId: string,
    @Body('resend') resend?: boolean,
  ) {
    const { link, transaction } = await this.uploadLinkService.validateUploadToken(token);
    const envelope = await this.sellerAgentDocumentDocusignService.sendDocument(link, transaction, documentId, { resend });
    return { documentId, envelopeId: envelope.envelopeId, status: envelope.status, sentAt: envelope.sentAt };
  }

  /**
   * Batch sibling of sendDocumentDocusign — sends any number of
   * caller-selected documents as one combined DocuSign envelope, for the
   * checklist sidebar's single "Send via DocuSign" action (multi-select
   * modal) rather than one button per document.
   */
  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('token/:token/documents/docusign/send')
  @HttpCode(HttpStatus.OK)
  async sendDocumentsDocusign(
    @Param('token') token: string,
    @Body('documentIds') documentIds: string[],
    @Body('resend') resend?: boolean,
  ) {
    const { link, transaction } = await this.uploadLinkService.validateUploadToken(token);
    const envelope = await this.sellerAgentDocumentDocusignService.sendDocuments(link, transaction, documentIds ?? [], { resend });
    return { documentIds: documentIds ?? [], envelopeId: envelope.envelopeId, status: envelope.status, sentAt: envelope.sentAt };
  }

  // ── Authenticated management (TC/broker) ────────────────────────────────────

  /**
   * The raw token is returned here — and only here, at the moment of minting —
   * never persisted (only its hash is stored), so this is the one authenticated
   * response that can ever hand back a usable URL for an already-sent link.
   */
  @Post(':id/regenerate')
  @HttpCode(HttpStatus.CREATED)
  async regenerate(@Req() req: Request, @Param('id') id: string) {
    const accountId = await this.resolveAccountId(req);
    const { link, token } = await this.uploadLinkService.regenerateSecureUploadLink(id, accountId);
    return { link, token };
  }

  @Post(':id/revoke')
  @HttpCode(HttpStatus.OK)
  async revoke(@Param('id') id: string) {
    await this.uploadLinkService.revokeSecureUploadLink(id);
    return { ok: true };
  }
}
