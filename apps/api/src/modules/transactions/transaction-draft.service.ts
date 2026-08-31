import { Injectable, Logger } from '@nestjs/common';

// ─── Outbound email address builder ──────────────────────────────────────────
// Produces the stable From address for all outbound emails on a transaction.
// Format: {8-char-org-prefix}-{sanitized-street}-{zip}@txn.mytcapp.net
//
// Sanitization rules (applied in order):
//   1. Lowercase
//   2. Strip every character that is not alphanumeric or a space
//   3. Replace one or more spaces with a single hyphen
//   4. Collapse consecutive hyphens into one
//   5. Trim leading and trailing hyphens
//
// Returns null if street address or zip code is missing — a partial address
// would produce an ambiguous or unroutable local part.
export function buildOutboundEmailAddress(
  organizationId: string,
  streetAddress: string | null | undefined,
  postalCode: string | null | undefined,
): string | null {
  if (!streetAddress?.trim() || !postalCode?.trim()) return null;

  const orgPrefix = organizationId.replace(/-/g, '').slice(0, 8);

  const street = streetAddress
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')   // strip everything except alphanumeric and space
    .replace(/\s+/g, '-')          // spaces → hyphens
    .replace(/-{2,}/g, '-')        // collapse consecutive hyphens
    .replace(/^-+|-+$/g, '');      // trim leading/trailing hyphens

  const zip = postalCode.replace(/[^0-9]/g, '');  // digits only

  if (!street || !zip) return null;

  return `${orgPrefix}-${street}-${zip}@txn.mytcapp.net`;
}
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TransactionEntity, TransactionStatus, TransactionType, TransactionSide, CoordinatorSide } from './entities/transaction.entity';
import { ContactEntity } from '../contacts/entities/contact.entity';
import { TransactionPartyEntity, PartyRole } from '../transaction-parties/entities/transaction-party.entity';
import { TransactionDocumentEntity, DocumentStatus } from '../transaction-documents/entities/transaction-document.entity';
import { ContactType } from '../contacts/entities/contact.entity';
import { ExtractionResult, ContractDocumentExtraction } from '../document-extraction/extraction-result.types';
import { ComplianceResult } from '../document-extraction/compliance-result.types';
import { AiInteractionEntity } from '../ai-interactions/entities/ai-interaction.entity';
import { TransactionClockService } from '../transaction-clock/transaction-clock.service';

export interface DraftTransactionResult {
  transaction: TransactionEntity;
  /** The contract document row — metadata_json holds extraction + compliance as JSONB */
  document: TransactionDocumentEntity;
  extractionResult: ExtractionResult;
  partiesCreated: number;
  /** Per-document contract extractions for timeline review (RPA, SCO, BCO, SMCO). */
  contractDocuments?: ContractDocumentExtraction[];
}

/** Creates a draft transaction from an AI extraction result. */
@Injectable()
export class TransactionDraftService {
  private readonly logger = new Logger(TransactionDraftService.name);

  constructor(
    @InjectRepository(TransactionEntity)
    private readonly transactionsRepo: Repository<TransactionEntity>,
    @InjectRepository(ContactEntity)
    private readonly contactsRepo: Repository<ContactEntity>,
    @InjectRepository(TransactionPartyEntity)
    private readonly partiesRepo: Repository<TransactionPartyEntity>,
    @InjectRepository(TransactionDocumentEntity)
    private readonly documentsRepo: Repository<TransactionDocumentEntity>,
    private readonly clockService: TransactionClockService,
  ) {}

  /**
   * Checks whether an active transaction for the same property address already exists
   * within the same organization. Returns the existing transaction if found, or null.
   *
   * Match is case-insensitive and trims whitespace. The org scope prevents false
   * positives when a buyer switches agents to a different brokerage — a new org
   * should always be allowed to create their own transaction for the same property.
   */
  async findDuplicateByAddressAndOrg(
    streetAddress: string,
    organizationId: string,
  ): Promise<TransactionEntity | null> {
    const normalized = streetAddress.trim().toLowerCase();
    return this.transactionsRepo
      .createQueryBuilder('t')
      .where('LOWER(TRIM(t."propertyAddressLine1")) = :addr', { addr: normalized })
      .andWhere('t."organizationId" = :orgId', { orgId: organizationId })
      .andWhere('t."status" != :cancelled', { cancelled: TransactionStatus.CANCELLED })
      .getOne();
  }

  async createFromExtraction(
    extraction: ExtractionResult,
    interaction: AiInteractionEntity,
    compliance: ComplianceResult,
    organizationId: string,
    createdByAccountId: string,
    formTemplateId?: string | null,
    contractDocuments?: ContractDocumentExtraction[],
    transactionSide?: CoordinatorSide,
  ): Promise<DraftTransactionResult> {
    const tx = await this.createDraftTransaction(extraction, organizationId, createdByAccountId, formTemplateId, transactionSide);
    const partiesCreated = await this.createDraftParties(tx.id, extraction);
    const document = await this.recordContractDocument(tx.id, extraction, compliance, interaction, createdByAccountId, contractDocuments);

    // Create clock settings row — timezone derived from property state, virtual clock starts null
    await this.clockService.createForTransaction(tx.id, extraction.property.state);

    this.logger.log(`Draft transaction ${tx.transactionNumber} created with ${partiesCreated} parties`);
    return { transaction: tx, document, extractionResult: extraction, partiesCreated, contractDocuments };
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private async createDraftTransaction(
    e: ExtractionResult,
    organizationId: string,
    createdByAccountId: string,
    formTemplateId?: string | null,
    transactionSide?: CoordinatorSide,
  ): Promise<TransactionEntity> {
    const side = this.determineSide(e);
    const tx = this.transactionsRepo.create({
      organizationId,
      createdByAccountId,
      formTemplateId: formTemplateId ?? null,
      transactionNumber: this.generateTransactionNumber(),
      transactionType:   TransactionType.PURCHASE,
      side,
      // Which side of the transaction is being coordinated. Legacy/omitted →
      // BUYER (backward compatible). SELLER selects the seller-side workflow.
      transactionSide:    transactionSide ?? CoordinatorSide.BUYER,
      status:            TransactionStatus.DRAFT,
      propertyAddressLine1: e.property.streetAddress ?? 'Address Pending',
      propertyCity:         e.property.city          ?? 'Unknown',
      propertyState:        e.property.state         ?? 'CA',
      propertyPostalCode:   e.property.postalCode    ?? null,
      propertyCounty:       e.property.county        ?? null,
      apn:                  e.property.apn           ?? null,
      mlsNumber:            e.property.mlsNumber     ?? null,
      outboundEmailAddress: buildOutboundEmailAddress(
        organizationId,
        e.property.streetAddress,
        e.property.postalCode,
      ),
      contractPrice:        e.transaction.purchasePrice       ?? null,
      earnestMoneyAmount:   e.transaction.earnestMoneyAmount  ?? null,
      offerAcceptedAt:      e.transaction.acceptanceDate ? this.parseDateOrNull(e.transaction.acceptanceDate) : null,
      closeOfEscrowAt:      e.transaction.closingDate    ? this.parseDateOrNull(e.transaction.closingDate)    : null,
      summaryJson: {
        extractionWarnings: e.extractionWarnings,
        confidenceSummary: e.confidenceSummary,
        acceptanceDate: e.transaction.acceptanceDate ?? null,
      } as Record<string, unknown>,
    });
    return this.transactionsRepo.save(tx);
  }

  private async createDraftParties(transactionId: string, e: ExtractionResult): Promise<number> {
    type PartySpec = { role: PartyRole; name: string | null; email: string | null; phone: string | null; company?: string | null };

    const specs: PartySpec[] = [
      ...e.parties.buyers.map((p) => ({ role: PartyRole.BUYER,        name: p.fullName,    email: p.email, phone: p.phone })),
      ...e.parties.sellers.map((p) => ({ role: PartyRole.SELLER,      name: p.fullName,    email: p.email, phone: p.phone })),
      ...e.parties.buyerAgents.map((p) => ({ role: PartyRole.BUYER_AGENT,  name: p.fullName, email: p.email, phone: p.phone, company: p.companyName })),
      ...e.parties.listingAgents.map((p) => ({ role: PartyRole.SELLER_AGENT, name: p.fullName, email: p.email, phone: p.phone, company: p.companyName })),
      ...e.parties.escrowCompanies.map((p) => ({ role: PartyRole.ESCROW_OFFICER, name: p.contactName ?? p.companyName, email: p.email, phone: p.phone, company: p.companyName })),
      ...e.parties.lenders.map((p) => ({ role: PartyRole.LENDER,      name: p.contactName ?? p.companyName, email: p.email, phone: p.phone, company: p.companyName })),
      ...e.parties.attorneys.map((p) => ({ role: PartyRole.ATTORNEY,  name: p.fullName,    email: p.email, phone: p.phone })),
    ];

    let count = 0;
    for (const spec of specs) {
      const displayName = spec.name?.trim();
      if (!displayName) continue;

      const [firstName, ...rest] = displayName.split(' ');
      const contactEntity = this.contactsRepo.create({
        contactType: ContactType.PERSON,
        firstName:   firstName ?? null,
        lastName:    rest.join(' ') || null,
        companyName: spec.company ?? null,
        email:       spec.email ?? null,
        phone:       spec.phone ?? null,
      });
      const contact = await this.contactsRepo.save(contactEntity);

      await this.partiesRepo.save(
        this.partiesRepo.create({
          transactionId,
          contactId:   contact.id,
          partyRole:   spec.role,
          displayName,
          email:  spec.email  ?? null,
          phone:  spec.phone  ?? null,
          isPrimary: false,
        }),
      );
      count++;
    }
    return count;
  }

  private async recordContractDocument(
    transactionId: string,
    e: ExtractionResult,
    compliance: ComplianceResult,
    interaction: AiInteractionEntity,
    uploadedByAccountId: string,
    contractDocuments?: ContractDocumentExtraction[],
  ): Promise<TransactionDocumentEntity> {
    // metadata_json is JSONB — TypeORM stores and retrieves it as a native JS object.
    // No JSON.stringify / JSON.parse needed by callers.
    const meta: Record<string, unknown> = {
      extraction: e as unknown as Record<string, unknown>,
      compliance: compliance as unknown as Record<string, unknown>,
      extractedAt: new Date().toISOString(),
      pdfSource: compliance.sourceType,      // 'acroform' | 'llm_extraction'
      acroFieldCount: compliance.acroFieldCount,
      complianceStatus: compliance.summary.overallStatus,
      confidenceOverall: e.confidenceSummary.overall,
      extractionWarnings: e.extractionWarnings,
    };
    // Per-document contract review data (RPA, SCO, BCO, SMCO)
    if (contractDocuments && contractDocuments.length > 0) {
      meta.contractDocuments = contractDocuments;
    }
    return this.documentsRepo.save(
      this.documentsRepo.create({
        transactionId,
        documentType:      'purchase_agreement',
        title:             e.documentType ?? 'Purchase Agreement',
        status:            DocumentStatus.UPLOADED,
        uploadedByAccountId,
        aiInteractionId:   interaction.id,
        metadataJson: meta,
        // This method only ever records the initial signed RPA — the sole document
        // extract-and-draft accepts — so the form code is already settled at creation,
        // not something the checklist matcher (formCode + analysisStatus === 'completed')
        // should have to wait on a later per-form-split step to learn.
        formCode: 'RPA',
        analysisStatus: 'completed',
      }),
    );
  }

  private parseDateOrNull(value: string): Date | null {
    // Treat YYYY-MM-DD as local date, not UTC, to avoid timezone offset shifting the day
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      const [, y, m, d] = match;
      const dt = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
      return isNaN(dt.getTime()) ? null : dt;
    }
    const dt = new Date(value);
    return isNaN(dt.getTime()) ? null : dt;
  }

  private determineSide(e: ExtractionResult): TransactionSide {
    const hasBuyers  = e.parties.buyers.length  > 0;
    const hasSellers = e.parties.sellers.length > 0;
    if (hasBuyers && hasSellers) return TransactionSide.DUAL;
    if (hasSellers)              return TransactionSide.SELLER_SIDE;
    return TransactionSide.BUYER_SIDE;
  }

  private generateTransactionNumber(): string {
    const year   = new Date().getFullYear();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `TXN-${year}-${random}`;
  }
}
