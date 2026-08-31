import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { TransactionEntity } from '../transactions/entities/transaction.entity';
import { TransactionPartyEntity, PartyRole } from '../transaction-parties/entities/transaction-party.entity';
import { TransactionDocumentEntity, DocumentStatus } from '../transaction-documents/entities/transaction-document.entity';
import { TransactionMessageEntity } from '../transaction-messages/entities/transaction-message.entity';
import { DocuSignEnvelopeEntity } from '../docusign/entities/docusign-envelope.entity';
import { UploadLinkEntity, UploadLinkStatus } from '../upload-links/entities/upload-link.entity';
import {
  UploadLinkPurpose, BUYER_AGENT_TRANSACTION_DOCUMENT_UPLOAD, SELLER_AGENT_TRANSACTION_DOCUMENT_UPLOAD,
  ESCROW_OFFICER_TRANSACTION_DOCUMENT_UPLOAD, BROKER_TRANSACTION_DOCUMENT_UPLOAD,
} from '../upload-links/upload-link.types';
import { TransactionAccessService } from '../transaction-authorization/transaction-access.service';
import { DocumentChecklistStatus } from '../transaction-form-templates/transaction-form-templates.service';
import { computeValidationStatus, ChecklistValidationStatus } from '../transaction-form-templates/checklist-matching.util';
import { ChecklistCompositionService } from '../upload-links/checklist-composition.service';
import { resolveUploadLinkVisibilityType, resolveUploadedByType, canExternalUserSeeDocument, UploadLinkVisibilityType } from '../upload-links/document-visibility.util';
import { CdaGenerationService, PublicCdaDto } from '../cda/cda-generation.service';
import { ExternalTransactionInformationService, PublicTransactionInformationDto } from '../transaction-contact-information/external-transaction-information.service';
import { BlockerOverrideService } from '../blocker-overrides/blocker-override.service';
import type { TransactionBlockerOverrideEntity } from '../blocker-overrides/entities/transaction-blocker-override.entity';
import { EscrowInformationService } from '../transaction-contact-information/escrow-information.service';
import { HoaInformationService } from '../transaction-contact-information/hoa-information.service';
import { BuyerSideInformationService } from '../transaction-contact-information/buyer-side-information.service';
import { resolveBuyerSideReminderLeadDays } from '../reminders/verification-of-property-reminder-scheduler.service';
import { resolveSellerSideReminderLeadDays } from '../reminders/seller-side-document-reminder-scheduler.service';

const INVALID_ACCESS_MESSAGE = 'You do not have access to this transaction.';

/**
 * Field names deliberately match the frontend's existing ApiParty type
 * (apps/web/src/lib/api.ts) — partyRole/displayName, not role/name — plus one
 * additive `brokerage` field, so PartyManagement.tsx can consume this
 * response with no changes to its existing party-shape assumptions.
 */
export interface PartyDto {
  id: string;
  transactionId: string;
  partyRole: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  isPrimary: boolean;
  brokerage: string | null;
  createdAt: Date;
}

export type DocumentSource = 'document_upload' | 'seller_agent_document_upload' | 'escrow_officer_document_upload' | 'broker_document_upload' | 'internal';

export interface WorkspaceDocumentDto {
  id: string;
  fileName: string | null;
  documentTag: string | null;
  uploadedByName: string | null;
  uploadedByRole: string | null;
  source: DocumentSource;
  uploadedAt: Date;
  analysisStatus: string | null;
  viewUrl: string;
  /** Document lifecycle status (uploaded/signed/superseded/etc.) — additive, so existing consumers reading only the fields above are unaffected. */
  status: string;
  /** True once this document has been fully executed via DocuSign (status === SIGNED) — the swimlane/document-list UI's single source of truth for a "Signed" badge. */
  signed: boolean;
  docusignEnvelopeId: string | null;
  signedAt: Date | null;
  versionNo: number;
  /** This document's compliance outcome, resolved through the same centralized blocker-override store every other consumer uses — see ChecklistValidationStatus. */
  validationStatus: ChecklistValidationStatus;
}

export interface WorkspaceEmailHistoryItem {
  id: string;
  type: 'email' | 'docusign';
  subject: string | null;
  recipients: string[];
  cc: string[];
  sentAt: Date;
  status: string;
  bodyText: string | null;
  signers: { name: string; email: string; status?: string | null }[] | null;
}

export interface UploadLinkStatusDto {
  uploadLinkId: string | null;
  emailSentAt: Date | null;
  expiresAt: Date | null;
  linkStatus: string | null;
}

export interface SideContactsDto {
  agent: PartyDto | null;
  coordinator: PartyDto | null;
}

/**
 * Every checklist/documents/transactionInfo/cda field below is sourced from
 * the exact same services the corresponding upload-link page itself calls
 * (ChecklistCompositionService, TransactionDocumentsService's visibility
 * util, ExternalTransactionInformationService, CdaGenerationService) — never
 * a separate reimplementation. See ChecklistCompositionService's own doc
 * comment for why that matters.
 */
export interface BuyerSideDetailsDto {
  contacts: SideContactsDto;
  documents: WorkspaceDocumentDto[];
  checklist: DocumentChecklistStatus;
  linkStatus: UploadLinkStatusDto;
  /** null until the Buyer Agent link exists — mirrors the upload-link page having nothing to prefill either. */
  transactionInfo: { lender: PublicTransactionInformationDto['lender']; buyerSide: PublicTransactionInformationDto['buyerSide'] } | null;
  cda: PublicCdaDto | null;
  /** Effective Buyer Side reminder lead time (days before Close of Escrow) — resolved to the default when unset. */
  buyerSideReminderLeadDays: number;
}

export interface SellerSideDetailsDto {
  contacts: SideContactsDto;
  documents: WorkspaceDocumentDto[];
  checklist: DocumentChecklistStatus;
  linkStatus: UploadLinkStatusDto;
  transactionInfo: { escrow: PublicTransactionInformationDto['escrow']; hoa: PublicTransactionInformationDto['hoa'] } | null;
  /** Effective Seller Side reminder lead time (days before Seller Disclosures Due) — resolved to the default when unset. */
  sellerSideReminderLeadDays: number;
}

export interface EscrowSideDetailsDto {
  escrowContactName: string | null;
  escrowEmail: string | null;
  escrowNumber: string | null;
  willSendDocumentsToBuyer: boolean | null;
  hasHoa: boolean | null;
  /** The Escrow link's own CC recipient — in practice always the Seller Agent (see EscrowOnboardingService.sendWelcomeEmail), read directly off the link row rather than re-derived. */
  ccContactName: string | null;
  ccContactEmail: string | null;
  documents: WorkspaceDocumentDto[];
  checklist: DocumentChecklistStatus;
  linkStatus: UploadLinkStatusDto;
  signedCda: PublicCdaDto | null;
}

/**
 * No `documents` field — the Broker upload link has no document-upload
 * capability of its own beyond the signed CDA (which appears via the
 * checklist's own matchedDocument/`signedCda`, not a general upload list) —
 * see ExternalDocumentUploadService's assertNotBrokerLink.
 */
export interface BrokerSideDetailsDto {
  recipientName: string | null;
  recipientEmail: string | null;
  checklist: DocumentChecklistStatus;
  linkStatus: UploadLinkStatusDto;
  transactionInfo: PublicTransactionInformationDto['broker'] | null;
  cda: PublicCdaDto | null;
  signedCda: PublicCdaDto | null;
}

const BUYER_SIDE_ROLES = [PartyRole.BUYER_AGENT, PartyRole.BUYER_TRANSACTION_COORDINATOR];
const SELLER_SIDE_ROLES = [PartyRole.SELLER_AGENT, PartyRole.SELLER_TRANSACTION_COORDINATOR];

@Injectable()
export class TransactionWorkspaceService {
  constructor(
    @InjectRepository(TransactionEntity)
    private readonly transactionsRepo: Repository<TransactionEntity>,
    @InjectRepository(TransactionPartyEntity)
    private readonly partiesRepo: Repository<TransactionPartyEntity>,
    @InjectRepository(TransactionDocumentEntity)
    private readonly documentsRepo: Repository<TransactionDocumentEntity>,
    @InjectRepository(TransactionMessageEntity)
    private readonly messagesRepo: Repository<TransactionMessageEntity>,
    @InjectRepository(DocuSignEnvelopeEntity)
    private readonly envelopesRepo: Repository<DocuSignEnvelopeEntity>,
    @InjectRepository(UploadLinkEntity)
    private readonly uploadLinksRepo: Repository<UploadLinkEntity>,
    private readonly transactionAccessService: TransactionAccessService,
    private readonly checklistComposition: ChecklistCompositionService,
    private readonly cdaGenerationService: CdaGenerationService,
    private readonly externalTransactionInformationService: ExternalTransactionInformationService,
    private readonly escrowInformationService: EscrowInformationService,
    private readonly hoaInformationService: HoaInformationService,
    private readonly buyerSideInformationService: BuyerSideInformationService,
    private readonly blockerOverrideService: BlockerOverrideService,
  ) {}

  /**
   * Every method below starts with this — resolves the transaction (404 if it
   * doesn't exist) and enforces the shared access algorithm (403 if the caller
   * can't see it), before touching any party/document/email data.
   */
  private async loadAuthorizedTransaction(accountId: string, transactionId: string): Promise<TransactionEntity> {
    const tx = await this.transactionsRepo.findOne({ where: { id: transactionId } });
    if (!tx) throw new NotFoundException(`Transaction ${transactionId} not found`);
    const canAccess = await this.transactionAccessService.canAccountAccessTransaction(accountId, tx);
    if (!canAccess) throw new ForbiddenException(INVALID_ACCESS_MESSAGE);
    return tx;
  }

  private toPartyDto(p: TransactionPartyEntity): PartyDto {
    return {
      id: p.id,
      transactionId: p.transactionId,
      partyRole: p.partyRole,
      displayName: p.displayName,
      email: p.email,
      phone: p.phone,
      isPrimary: p.isPrimary,
      brokerage: p.organization?.name ?? null,
      createdAt: p.createdAt,
    };
  }

  private async findActiveLink(transactionId: string, purpose: string): Promise<UploadLinkEntity | null> {
    return this.uploadLinksRepo.findOne({
      where: { transactionId, purpose, status: UploadLinkStatus.ACTIVE },
      order: { createdAt: 'DESC' },
    });
  }

  private toLinkStatusDto(link: UploadLinkEntity | null): UploadLinkStatusDto {
    return {
      uploadLinkId: link?.id ?? null,
      emailSentAt: link?.emailSentAt ?? null,
      expiresAt: link?.expiresAt ?? null,
      linkStatus: link?.status ?? null,
    };
  }

  private toWorkspaceDocumentDto(d: TransactionDocumentEntity, roleByAccountId: Map<string, string>, overrides: readonly TransactionBlockerOverrideEntity[]): WorkspaceDocumentDto {
    const isLinkSourced = !!d.uploadLink;
    const source: DocumentSource = isLinkSourced ? (d.uploadLink!.purpose as DocumentSource) : 'internal';
    return {
      id: d.id,
      fileName: d.fileName,
      documentTag: d.formCode ?? (d.documentType !== 'external_upload' && d.documentType !== 'general' ? d.documentType : null),
      uploadedByName: isLinkSourced ? d.uploadLink!.recipientName : (d.uploadedByAccount?.displayName ?? null),
      uploadedByRole: isLinkSourced ? d.uploadLink!.recipientRole : (d.uploadedByAccountId ? (roleByAccountId.get(d.uploadedByAccountId) ?? null) : null),
      source,
      uploadedAt: d.createdAt,
      analysisStatus: d.analysisStatus,
      viewUrl: `/api/v1/transaction-documents/${d.id}/file`,
      status: d.status,
      signed: d.status === DocumentStatus.SIGNED,
      docusignEnvelopeId: d.docusignEnvelopeId,
      signedAt: d.signedAt,
      versionNo: d.versionNo,
      validationStatus: computeValidationStatus(d, overrides),
    };
  }

  /** For internal-origin documents (uploadedByAccountId set, no uploadLink), the uploader's role on this transaction — accounts have no role of their own. */
  private async resolveRoleByAccountId(transactionId: string, docs: readonly TransactionDocumentEntity[]): Promise<Map<string, string>> {
    const uploaderAccountIds = [...new Set(docs.filter((d) => d.uploadedByAccountId).map((d) => d.uploadedByAccountId as string))];
    const uploaderParties = uploaderAccountIds.length
      ? await this.partiesRepo.find({ where: { transactionId, accountId: In(uploaderAccountIds) } })
      : [];
    return new Map(uploaderParties.map((p) => [p.accountId as string, p.partyRole as string]));
  }

  /** The transaction's full active document set (excludes superseded/rejected/original-package rows), with both relations needed to resolve uploader identity. */
  private async loadActiveDocuments(transactionId: string): Promise<TransactionDocumentEntity[]> {
    const docs = await this.documentsRepo.find({
      where: { transactionId },
      relations: ['uploadLink', 'uploadedByAccount'],
      order: { createdAt: 'DESC' },
    });
    return docs.filter((d) => d.status !== DocumentStatus.SUPERSEDED && d.status !== DocumentStatus.REJECTED && !d.isOriginalPackage);
  }

  /**
   * The exact document set the given audience's upload-link page would show
   * in its own "Uploaded Documents" section — filtered through the same
   * pure canExternalUserSeeDocument/resolveUploadedByType functions
   * TransactionDocumentsService.findVisibleForUploadLink uses, applied here
   * directly (rather than calling that method) only because it needs the
   * uploadedByAccount relation too, which that method doesn't load.
   */
  private async loadVisibleDocuments(transactionId: string, visibilityType: UploadLinkVisibilityType): Promise<WorkspaceDocumentDto[]> {
    const activeDocs = await this.loadActiveDocuments(transactionId);
    const visibleDocs = activeDocs.filter((d) => canExternalUserSeeDocument(
      { uploadedByType: resolveUploadedByType(d.uploadLinkId, d.uploadLink?.purpose), formCode: d.formCode, documentType: d.documentType, status: d.status },
      visibilityType,
    ));
    const [roleByAccountId, overrides] = await Promise.all([
      this.resolveRoleByAccountId(transactionId, visibleDocs),
      this.blockerOverrideService.findForTransaction(transactionId),
    ]);
    return visibleDocs.map((d) => this.toWorkspaceDocumentDto(d, roleByAccountId, overrides));
  }

  /**
   * Best-effort recipient/cc extraction across this codebase's several email
   * writers — most set recipientPartyId directly (upload-link welcome emails,
   * VP reminders, custom reminders), but the main contract-submission welcome
   * email only records To/Cc in metadataJson.toDetail/ccDetail (name+email
   * arrays), and older writers may only set a flat metadataJson.to/cc string.
   */
  private extractContactList(msg: TransactionMessageEntity, field: 'toDetail' | 'ccDetail', flatField: 'to' | 'cc'): string[] {
    const meta = msg.metadataJson as Record<string, unknown> | null;
    const detail = meta?.[field];
    if (Array.isArray(detail)) {
      return (detail as Array<{ name?: string; email?: string }>).map((d) => d.name || d.email || '').filter(Boolean);
    }
    const flat = meta?.[flatField];
    if (typeof flat === 'string' && flat) return [flat];
    return [];
  }

  private messageInvolvesSide(msg: TransactionMessageEntity, relevantPartyIds: Set<string>, relevantEmails: Set<string>): boolean {
    if (msg.recipientPartyId && relevantPartyIds.has(msg.recipientPartyId)) return true;
    if (msg.senderPartyId && relevantPartyIds.has(msg.senderPartyId)) return true;

    const meta = msg.metadataJson as Record<string, unknown> | null;
    const candidateEmails = [
      ...this.metaEmailList(meta, 'toDetail'),
      ...this.metaEmailList(meta, 'ccDetail'),
      typeof meta?.to === 'string' ? meta.to : null,
      typeof meta?.cc === 'string' ? meta.cc : null,
    ].filter(Boolean) as string[];
    return candidateEmails.some((e) => relevantEmails.has(e.toLowerCase()));
  }

  private metaEmailList(meta: Record<string, unknown> | null, field: string): string[] {
    const detail = meta?.[field];
    if (!Array.isArray(detail)) return [];
    return (detail as Array<{ email?: string }>).map((d) => d.email).filter(Boolean) as string[];
  }

  async getParties(accountId: string, transactionId: string): Promise<PartyDto[]> {
    await this.loadAuthorizedTransaction(accountId, transactionId);

    const parties = await this.partiesRepo.find({
      where: { transactionId },
      relations: ['organization'],
      order: { createdAt: 'ASC' },
    });

    return parties.map((p) => this.toPartyDto(p));
  }

  async getDocuments(accountId: string, transactionId: string): Promise<WorkspaceDocumentDto[]> {
    await this.loadAuthorizedTransaction(accountId, transactionId);

    const activeDocs = await this.loadActiveDocuments(transactionId);
    const [roleByAccountId, overrides] = await Promise.all([
      this.resolveRoleByAccountId(transactionId, activeDocs),
      this.blockerOverrideService.findForTransaction(transactionId),
    ]);

    return activeDocs.map((d) => this.toWorkspaceDocumentDto(d, roleByAccountId, overrides));
  }

  async getEmailHistory(accountId: string, transactionId: string, side: 'buyer' | 'seller' | 'escrow' | 'broker'): Promise<WorkspaceEmailHistoryItem[]> {
    await this.loadAuthorizedTransaction(accountId, transactionId);

    const roles = side === 'buyer' ? BUYER_SIDE_ROLES : side === 'seller' ? SELLER_SIDE_ROLES : side === 'escrow' ? [PartyRole.ESCROW_OFFICER] : [];
    const relevantParties = roles.length ? await this.partiesRepo.find({ where: { transactionId, partyRole: In(roles) } }) : [];
    const relevantPartyIds = new Set(relevantParties.map((p) => p.id));
    const relevantEmails = new Set(relevantParties.map((p) => p.email?.toLowerCase()).filter(Boolean) as string[]);

    // The Escrow Officer's own contact (from EscrowInformationEntity) may not have a
    // transaction_parties row at all — fold their email in directly so their own
    // welcome email/uploads are found even before any party row exists for them.
    if (side === 'escrow') {
      const escrowInfo = await this.escrowInformationService.findByTransaction(transactionId);
      if (escrowInfo?.escrowEmail) relevantEmails.add(escrowInfo.escrowEmail.toLowerCase());
    }
    // The Broker has no transaction_parties row either (see BrokerOnboardingService) —
    // same fix, seeded from the Buyer Agent-captured brokerEmail.
    if (side === 'broker') {
      const buyerSide = await this.buyerSideInformationService.findByTransaction(transactionId);
      if (buyerSide?.brokerEmail) relevantEmails.add(buyerSide.brokerEmail.toLowerCase());
    }

    const messages = await this.messagesRepo.find({ where: { transactionId }, order: { createdAt: 'DESC' } });
    const relevantMessages = messages.filter((m) => this.messageInvolvesSide(m, relevantPartyIds, relevantEmails));

    // Seller Agent DocuSign envelope attribution is special: its signers are the
    // Buyer(s) (with the Buyer Agent CC'd), not any Seller-side person, so the
    // signer/cc email match above would never surface it under Seller Side.
    // `uploadLinkId` (stamped when the envelope was created from that flow)
    // is the explicit tag that attributes it back to the Seller side instead.
    const sellerAgentLink = side === 'seller' ? await this.findActiveLink(transactionId, SELLER_AGENT_TRANSACTION_DOCUMENT_UPLOAD) : null;

    const envelopes = await this.envelopesRepo.find({ where: { transactionId }, order: { createdAt: 'DESC' } });
    const relevantEnvelopes = envelopes.filter((e) =>
      (e.signers ?? []).some((s) => relevantEmails.has(s.email?.toLowerCase()))
      || (sellerAgentLink && e.uploadLinkId === sellerAgentLink.id));

    const emailItems: WorkspaceEmailHistoryItem[] = relevantMessages.map((m) => ({
      id: m.id,
      type: 'email',
      subject: m.subject,
      recipients: this.extractContactList(m, 'toDetail', 'to'),
      cc: this.extractContactList(m, 'ccDetail', 'cc'),
      sentAt: m.sentAt ?? m.createdAt,
      status: m.status,
      bodyText: m.bodyText,
      signers: null,
    }));

    const docusignItems: WorkspaceEmailHistoryItem[] = relevantEnvelopes.map((e) => ({
      id: e.id,
      type: 'docusign',
      subject: e.subject,
      recipients: (e.signers ?? []).map((s) => s.name),
      cc: (e.ccRecipients ?? []).map((c) => c.name),
      sentAt: e.sentAt ?? e.createdAt,
      status: e.status,
      bodyText: e.message,
      signers: e.signers,
    }));

    return [...emailItems, ...docusignItems].sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime());
  }

  async getBuyerSideDetails(accountId: string, transactionId: string): Promise<BuyerSideDetailsDto> {
    const tx = await this.loadAuthorizedTransaction(accountId, transactionId);

    const [parties, link] = await Promise.all([
      this.partiesRepo.find({ where: { transactionId, partyRole: In(BUYER_SIDE_ROLES) }, relations: ['organization'] }),
      this.findActiveLink(transactionId, BUYER_AGENT_TRANSACTION_DOCUMENT_UPLOAD),
    ]);
    const agent = parties.find((p) => p.partyRole === PartyRole.BUYER_AGENT) ?? null;
    const coordinator = parties.find((p) => p.partyRole === PartyRole.BUYER_TRANSACTION_COORDINATOR) ?? null;

    const [checklist, documents, prefill, cda] = await Promise.all([
      this.checklistComposition.composeForPurpose(BUYER_AGENT_TRANSACTION_DOCUMENT_UPLOAD as UploadLinkPurpose, link, tx),
      this.loadVisibleDocuments(transactionId, resolveUploadLinkVisibilityType(BUYER_AGENT_TRANSACTION_DOCUMENT_UPLOAD)),
      link ? this.externalTransactionInformationService.getPrefillData(link, tx) : Promise.resolve(null),
      this.cdaGenerationService.getCdaForTransaction(tx),
    ]);

    return {
      contacts: { agent: agent ? this.toPartyDto(agent) : null, coordinator: coordinator ? this.toPartyDto(coordinator) : null },
      documents,
      checklist,
      linkStatus: this.toLinkStatusDto(link),
      transactionInfo: prefill ? { lender: prefill.lender, buyerSide: prefill.buyerSide } : null,
      cda,
      buyerSideReminderLeadDays: resolveBuyerSideReminderLeadDays(tx.buyerSideReminderLeadDays),
    };
  }

  async getSellerSideDetails(accountId: string, transactionId: string): Promise<SellerSideDetailsDto> {
    const tx = await this.loadAuthorizedTransaction(accountId, transactionId);

    const [parties, link] = await Promise.all([
      this.partiesRepo.find({ where: { transactionId, partyRole: In(SELLER_SIDE_ROLES) }, relations: ['organization'] }),
      this.findActiveLink(transactionId, SELLER_AGENT_TRANSACTION_DOCUMENT_UPLOAD),
    ]);
    const agent = parties.find((p) => p.partyRole === PartyRole.SELLER_AGENT) ?? null;
    const coordinator = parties.find((p) => p.partyRole === PartyRole.SELLER_TRANSACTION_COORDINATOR) ?? null;

    const [checklist, documents, prefill] = await Promise.all([
      this.checklistComposition.composeForPurpose(SELLER_AGENT_TRANSACTION_DOCUMENT_UPLOAD as UploadLinkPurpose, link, tx),
      this.loadVisibleDocuments(transactionId, resolveUploadLinkVisibilityType(SELLER_AGENT_TRANSACTION_DOCUMENT_UPLOAD)),
      link ? this.externalTransactionInformationService.getPrefillData(link, tx) : Promise.resolve(null),
    ]);

    return {
      contacts: { agent: agent ? this.toPartyDto(agent) : null, coordinator: coordinator ? this.toPartyDto(coordinator) : null },
      documents,
      checklist,
      linkStatus: this.toLinkStatusDto(link),
      transactionInfo: prefill ? { escrow: prefill.escrow, hoa: prefill.hoa } : null,
      sellerSideReminderLeadDays: resolveSellerSideReminderLeadDays(tx.sellerSideReminderLeadDays),
    };
  }

  async getEscrowDetails(accountId: string, transactionId: string): Promise<EscrowSideDetailsDto> {
    const tx = await this.loadAuthorizedTransaction(accountId, transactionId);

    const [escrowInfo, hoaInfo, link] = await Promise.all([
      this.escrowInformationService.findByTransaction(transactionId),
      this.hoaInformationService.findByTransaction(transactionId),
      this.findActiveLink(transactionId, ESCROW_OFFICER_TRANSACTION_DOCUMENT_UPLOAD),
    ]);

    const [checklist, documents, signedCda] = await Promise.all([
      this.checklistComposition.composeForPurpose(ESCROW_OFFICER_TRANSACTION_DOCUMENT_UPLOAD as UploadLinkPurpose, link, tx),
      this.loadVisibleDocuments(transactionId, resolveUploadLinkVisibilityType(ESCROW_OFFICER_TRANSACTION_DOCUMENT_UPLOAD)),
      this.cdaGenerationService.getSignedCdaForTransaction(tx),
    ]);

    return {
      escrowContactName: escrowInfo?.escrowContactName ?? null,
      escrowEmail: escrowInfo?.escrowEmail ?? null,
      escrowNumber: escrowInfo?.escrowNumber ?? null,
      willSendDocumentsToBuyer: escrowInfo?.willSendDocumentsToBuyer ?? null,
      hasHoa: hoaInfo?.hasHoa ?? null,
      ccContactName: link?.ccName ?? null,
      ccContactEmail: link?.ccEmail ?? null,
      documents,
      checklist,
      linkStatus: this.toLinkStatusDto(link),
      signedCda,
    };
  }

  async getBrokerDetails(accountId: string, transactionId: string): Promise<BrokerSideDetailsDto> {
    const tx = await this.loadAuthorizedTransaction(accountId, transactionId);

    const [buyerSide, link] = await Promise.all([
      this.buyerSideInformationService.findByTransaction(transactionId),
      this.findActiveLink(transactionId, BROKER_TRANSACTION_DOCUMENT_UPLOAD),
    ]);

    const [checklist, prefill, cda, signedCda] = await Promise.all([
      this.checklistComposition.composeForPurpose(BROKER_TRANSACTION_DOCUMENT_UPLOAD as UploadLinkPurpose, link, tx),
      link ? this.externalTransactionInformationService.getPrefillData(link, tx) : Promise.resolve(null),
      this.cdaGenerationService.getCdaForTransaction(tx),
      this.cdaGenerationService.getSignedCdaForTransaction(tx),
    ]);

    return {
      recipientName: link?.recipientName ?? buyerSide?.brokerFullName ?? null,
      recipientEmail: link?.recipientEmail ?? buyerSide?.brokerEmail ?? null,
      checklist,
      linkStatus: this.toLinkStatusDto(link),
      transactionInfo: prefill ? prefill.broker : null,
      cda,
      signedCda,
    };
  }
}
