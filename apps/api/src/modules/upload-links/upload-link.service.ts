import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UploadLinkEntity } from './entities/upload-link.entity';
import { UploadLinkRepository } from './upload-link.repository';
import { generateUploadToken, hashUploadToken } from './upload-link-token.util';
import { UploadLinkPurpose, UploadLinkRecipient, CcRecipient, ExpirationPolicy, AllowedFileConfig, getDefaultExpirationPolicy, getDefaultAllowedFileConfig } from './upload-link.types';
import { TransactionEntity } from '../transactions/entities/transaction.entity';
import { TransactionPartyEntity } from '../transaction-parties/entities/transaction-party.entity';

/** Every failure path throws this exact message — never revealing *why* a token was rejected. */
const GENERIC_INVALID_LINK_MESSAGE = 'This upload link is invalid or has expired.';

const SUPPORTED_PURPOSES: ReadonlySet<UploadLinkPurpose> = new Set([
  'document_upload',
  'seller_agent_document_upload',
  'escrow_officer_document_upload',
  'broker_document_upload',
]);

export interface CreateSecureUploadLinkResult {
  link: UploadLinkEntity;
  /** The raw bearer token — present only when a NEW link was just minted. Null when an already-delivered active link was reused (its raw token was never persisted, so it can't be recovered — and doesn't need to be, since nothing new will be emailed). */
  token: string | null;
}

export interface UploadPageContext {
  propertyAddress: string;
  recipientName: string;
  purpose: string;
  expiresAt: Date;
  /** The server's current file-upload limits — lets the frontend pre-warn and batch multi-file selections so a single request never exceeds them. */
  fileLimits: AllowedFileConfig;
}

@Injectable()
export class UploadLinkService {
  private readonly logger = new Logger(UploadLinkService.name);

  constructor(
    private readonly uploadLinkRepo: UploadLinkRepository,
    @InjectRepository(TransactionEntity)
    private readonly transactionsRepo: Repository<TransactionEntity>,
    @InjectRepository(TransactionPartyEntity)
    private readonly partiesRepo: Repository<TransactionPartyEntity>,
  ) {}

  /**
   * Idempotent: if an active, unexpired link already exists for this exact
   * (transaction, recipient, purpose) and its email has already gone out,
   * that link is returned unchanged (token: null) instead of minting a new
   * one — retrying contract submission never creates duplicate active links.
   */
  async createSecureUploadLink(
    recipient: UploadLinkRecipient,
    purpose: UploadLinkPurpose,
    opts: { expirationPolicy?: ExpirationPolicy; createdByAccountId?: string | null; ccRecipient?: CcRecipient | null } = {},
  ): Promise<CreateSecureUploadLinkResult> {
    const existing = await this.uploadLinkRepo.findActiveForRecipient(recipient.transactionId, recipient.recipientId, purpose);
    return this.mintOrReuse(recipient, purpose, opts, existing);
  }

  /**
   * Like createSecureUploadLink, but for recipients with no TransactionPartyEntity
   * behind them (e.g. the Escrow Officer, captured as free-text contact info
   * rather than a party row) — idempotency is keyed on recipientEmail instead
   * of recipientPartyId, so a changed email always mints + sends a fresh link
   * rather than silently reusing one tied to a stale address.
   */
  async createSecureUploadLinkForEmailRecipient(
    recipient: UploadLinkRecipient,
    purpose: UploadLinkPurpose,
    opts: { expirationPolicy?: ExpirationPolicy; createdByAccountId?: string | null; ccRecipient?: CcRecipient | null } = {},
  ): Promise<CreateSecureUploadLinkResult> {
    const existing = await this.uploadLinkRepo.findActiveForRecipientEmail(recipient.transactionId, recipient.recipientEmail, purpose);
    return this.mintOrReuse(recipient, purpose, opts, existing);
  }

  private async mintOrReuse(
    recipient: UploadLinkRecipient,
    purpose: UploadLinkPurpose,
    opts: { expirationPolicy?: ExpirationPolicy; createdByAccountId?: string | null; ccRecipient?: CcRecipient | null },
    existing: UploadLinkEntity | null,
  ): Promise<CreateSecureUploadLinkResult> {
    if (existing?.emailSentAt) {
      return { link: existing, token: null };
    }

    const token = generateUploadToken();
    const tokenHash = hashUploadToken(token);
    const policy = opts.expirationPolicy ?? getDefaultExpirationPolicy();
    const expiresAt = new Date(Date.now() + policy.days * 86_400_000);

    const link = await this.uploadLinkRepo.create({
      transactionId: recipient.transactionId,
      recipientPartyId: recipient.recipientId,
      recipientRole: recipient.recipientRole,
      recipientName: recipient.recipientName,
      recipientEmail: recipient.recipientEmail,
      purpose,
      tokenHash,
      expiresAt,
      createdByAccountId: opts.createdByAccountId ?? null,
      ccPartyId: opts.ccRecipient?.partyId ?? null,
      ccRole: opts.ccRecipient?.role ?? null,
      ccName: opts.ccRecipient?.name ?? null,
      ccEmail: opts.ccRecipient?.email ?? null,
    });

    if (existing) {
      // Existing row was never actually emailed (e.g. a prior attempt failed before
      // sending) — its raw token is unrecoverable, so supersede it with this fresh one.
      await this.uploadLinkRepo.markReplaced(existing.id, link.id);
      this.logger.log(`Superseded un-emailed upload link ${existing.id} with ${link.id}`);
    }

    return { link, token };
  }

  async regenerateSecureUploadLink(linkId: string, createdByAccountId?: string | null): Promise<CreateSecureUploadLinkResult> {
    const existing = await this.uploadLinkRepo.findById(linkId);
    if (!existing) throw new NotFoundException('Upload link not found');

    const { link, token } = await this.uploadLinkRepo.regenerate(existing, createdByAccountId);
    this.logger.log(`Regenerated upload link: ${existing.id} -> ${link.id}`);
    return { link, token };
  }

  async revokeSecureUploadLink(linkId: string): Promise<void> {
    const existing = await this.uploadLinkRepo.findById(linkId);
    if (!existing) throw new NotFoundException('Upload link not found');
    await this.uploadLinkRepo.revoke(linkId);
    this.logger.log(`Revoked upload link: ${linkId}`);
  }

  /**
   * Read-only status lookup for email-keyed recipients (e.g. "has this
   * transaction's escrow welcome email been sent yet") — never exposes the
   * token itself, just the persisted send status.
   */
  async findActiveLinkForEmail(transactionId: string, recipientEmail: string, purpose: UploadLinkPurpose): Promise<UploadLinkEntity | null> {
    return this.uploadLinkRepo.findActiveForRecipientEmail(transactionId, recipientEmail, purpose);
  }

  /**
   * The single authorization gate for the public endpoints. Every rejection
   * path throws the exact same generic message — callers must never branch
   * on *why* validation failed, so a probing request can't learn whether a
   * given token/transaction exists at all.
   */
  async validateUploadToken(token: string): Promise<{ link: UploadLinkEntity; transaction: TransactionEntity }> {
    const tokenHash = hashUploadToken(token);
    const link = await this.uploadLinkRepo.findByHash(tokenHash);
    if (!link) throw new NotFoundException(GENERIC_INVALID_LINK_MESSAGE);
    if (link.status !== 'active') throw new NotFoundException(GENERIC_INVALID_LINK_MESSAGE);
    if (link.expiresAt.getTime() < Date.now()) throw new NotFoundException(GENERIC_INVALID_LINK_MESSAGE);
    if (!SUPPORTED_PURPOSES.has(link.purpose as UploadLinkPurpose)) throw new NotFoundException(GENERIC_INVALID_LINK_MESSAGE);

    const transaction = await this.transactionsRepo.findOne({
      where: { id: link.transactionId },
      // Creator account feeds the "Transaction Coordinator" identity on every
      // upload-link email (request, rejection, and DocuSign confirmation) — loaded
      // here once so all downstream flows have it without extra queries.
      relations: ['createdByAccount', 'createdByAccount.user'],
    });
    if (!transaction) throw new NotFoundException(GENERIC_INVALID_LINK_MESSAGE);

    if (link.recipientPartyId) {
      const party = await this.partiesRepo.findOne({ where: { id: link.recipientPartyId, transactionId: link.transactionId } });
      if (!party) throw new NotFoundException(GENERIC_INVALID_LINK_MESSAGE);
    }

    await this.uploadLinkRepo.recordAccess(link);
    return { link, transaction };
  }

  async getUploadPageContext(token: string): Promise<UploadPageContext> {
    const { link, transaction } = await this.validateUploadToken(token);
    const propertyAddress = [transaction.propertyAddressLine1, transaction.propertyCity, transaction.propertyState]
      .filter(Boolean).join(', ') || transaction.propertyAddressLine1;

    return {
      propertyAddress,
      recipientName: link.recipientName,
      purpose: link.purpose,
      expiresAt: link.expiresAt,
      fileLimits: getDefaultAllowedFileConfig(),
    };
  }
}
