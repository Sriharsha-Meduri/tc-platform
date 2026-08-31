import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, MoreThan, Repository } from 'typeorm';
import { UploadLinkEntity, UploadLinkStatus } from './entities/upload-link.entity';
import { generateUploadToken, hashUploadToken } from './upload-link-token.util';
import { getDefaultExpirationPolicy } from './upload-link.types';

export interface CreateUploadLinkRow {
  transactionId: string;
  recipientPartyId: string | null;
  recipientRole: string;
  recipientName: string;
  recipientEmail: string;
  purpose: string;
  tokenHash: string;
  expiresAt: Date;
  createdByAccountId: string | null;
  ccPartyId?: string | null;
  ccRole?: string | null;
  ccName?: string | null;
  ccEmail?: string | null;
}

@Injectable()
export class UploadLinkRepository {
  constructor(
    @InjectRepository(UploadLinkEntity)
    private readonly repo: Repository<UploadLinkEntity>,
  ) {}

  create(data: CreateUploadLinkRow): Promise<UploadLinkEntity> {
    return this.repo.save(this.repo.create({ ...data, status: UploadLinkStatus.ACTIVE }));
  }

  findById(id: string): Promise<UploadLinkEntity | null> {
    return this.repo.findOne({ where: { id } });
  }

  findByHash(tokenHash: string): Promise<UploadLinkEntity | null> {
    return this.repo.findOne({ where: { tokenHash } });
  }

  /** An unexpired, still-active link for this exact recipient/purpose — the idempotency lookup for creation. */
  findActiveForRecipient(transactionId: string, recipientPartyId: string | null, purpose: string): Promise<UploadLinkEntity | null> {
    return this.repo.findOne({
      where: {
        transactionId,
        recipientPartyId: recipientPartyId ?? IsNull(),
        purpose,
        status: UploadLinkStatus.ACTIVE,
        expiresAt: MoreThan(new Date()),
      },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Same idempotency lookup as findActiveForRecipient, but keyed on
   * recipientEmail instead of recipientPartyId — for recipients with no
   * TransactionPartyEntity behind them (e.g. the Escrow Officer, captured as
   * free-text contact info). A changed email is a different recipient
   * entirely, so this deliberately does NOT match on partyId (always null
   * here) alone — that would incorrectly reuse a link minted for a stale address.
   */
  findActiveForRecipientEmail(transactionId: string, recipientEmail: string, purpose: string): Promise<UploadLinkEntity | null> {
    return this.repo.findOne({
      where: {
        transactionId,
        recipientEmail,
        purpose,
        status: UploadLinkStatus.ACTIVE,
        expiresAt: MoreThan(new Date()),
      },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * The most recent active link for a transaction+purpose, regardless of
   * recipient — for callers that need to find "the" current link for a side
   * (e.g. the Buyer Agent link reading the Seller Agent's own status) rather
   * than confirming one specific recipient's link already exists. Mirrors
   * TransactionWorkspaceService's own private findActiveLink query exactly
   * (status ACTIVE, most-recent-first, no expiry filter) so a cross-side
   * status read always resolves to the same link the swimlane would show.
   */
  findMostRecentActiveByPurpose(transactionId: string, purpose: string): Promise<UploadLinkEntity | null> {
    return this.repo.findOne({
      where: { transactionId, purpose, status: UploadLinkStatus.ACTIVE },
      order: { createdAt: 'DESC' },
    });
  }

  async revoke(id: string): Promise<void> {
    await this.repo.update(id, { status: UploadLinkStatus.REVOKED, revokedAt: new Date() });
  }

  /** Marks the old link superseded by a freshly regenerated one — invalidates it immediately. */
  async markReplaced(oldId: string, newId: string): Promise<void> {
    await this.repo.update(oldId, { status: UploadLinkStatus.REPLACED, replacedByUploadLinkId: newId });
  }

  /**
   * Mints a brand-new token for the same recipient/purpose as `existing`, invalidating it
   * immediately (`markReplaced`). Carries `emailMessageId` forward when `existing` has one, so a
   * reply sent against the NEW link's token still threads into the original email conversation —
   * the only thing that changes is which token is currently valid, not which thread replies land in.
   * The single, dependency-light home for this logic: callable both from `UploadLinkService`
   * (the manual "regenerate link" dashboard action) and from anywhere else that only has this
   * repository available (e.g. a reminder processor in a different module, which cannot import
   * `UploadLinkService` without a circular module dependency).
   */
  async regenerate(existing: UploadLinkEntity, createdByAccountId?: string | null): Promise<{ link: UploadLinkEntity; token: string }> {
    const token = generateUploadToken();
    const tokenHash = hashUploadToken(token);
    const policy = getDefaultExpirationPolicy();
    const expiresAt = new Date(Date.now() + policy.days * 86_400_000);

    const link = await this.create({
      transactionId: existing.transactionId,
      recipientPartyId: existing.recipientPartyId,
      recipientRole: existing.recipientRole,
      recipientName: existing.recipientName,
      recipientEmail: existing.recipientEmail,
      purpose: existing.purpose,
      tokenHash,
      expiresAt,
      createdByAccountId: createdByAccountId ?? existing.createdByAccountId,
      ccPartyId: existing.ccPartyId,
      ccRole: existing.ccRole,
      ccName: existing.ccName,
      ccEmail: existing.ccEmail,
    });

    await this.markReplaced(existing.id, link.id);

    if (existing.emailMessageId) {
      await this.recordEmailSent(link.id, existing.emailMessageId);
      link.emailMessageId = existing.emailMessageId;
    }

    return { link, token };
  }

  async recordEmailSent(id: string, emailMessageId: string | null): Promise<void> {
    await this.repo.update(id, { emailSentAt: new Date(), emailMessageId });
  }

  async recordAccess(link: UploadLinkEntity): Promise<void> {
    const now = new Date();
    await this.repo.update(link.id, {
      firstAccessedAt: link.firstAccessedAt ?? now,
      lastAccessedAt: now,
    });
  }

  async incrementUploadCount(id: string, by = 1): Promise<void> {
    await this.repo.increment({ id }, 'uploadCount', by);
  }

  async recordDocusignConfirmationRequested(id: string): Promise<void> {
    await this.repo.update(id, { docusignConfirmationRequestedAt: new Date() });
  }

  async recordDocusignConfirmed(id: string): Promise<void> {
    await this.repo.update(id, { docusignConfirmedAt: new Date() });
  }

  /** Records the fingerprint of the CDA content this link's recipient was just notified about — the idempotency guard CdaNotificationService checks before sending. */
  async recordCdaNotified(id: string, contentHash: string): Promise<void> {
    await this.repo.update(id, { cdaNotifiedAt: new Date(), cdaNotifiedContentHash: contentHash });
  }
}
