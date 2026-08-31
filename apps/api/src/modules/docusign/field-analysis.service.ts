import { Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import type { ComplianceResult, BlockerOutput, WarningOutput } from '@tc/document-intelligence';
import { TransactionDocumentEntity } from '../transaction-documents/entities/transaction-document.entity';
import { TransactionPartyEntity } from '../transaction-parties/entities/transaction-party.entity';
import { DocuSignOAuthService } from './docusign-oauth.service';
import { RecipientResolverService } from './recipient-resolver.service';
import { SharedCoordinatesService } from './shared-coordinates.service';
import { getFormTemplate } from './field-coordinates';
import { extractPageFromMessage, detectRolesInMessage } from './docusign-utils';
import type {
  MissingFieldMetadata,
  DocumentFieldAnalysis,
  DocumentFieldStatus,
  AnalyzeDocumentsResponse,
  FieldValidationResult,
  FieldIssue,
  EnvelopeFieldPlacement,
  DocuSignTabRequest,
  FieldConfidence,
  DocuSignTabType,
  FormFieldPlacement,
} from './field-analysis.types';

const CATEGORY_TO_TAB_TYPE: Record<string, DocuSignTabType> = {
  signatures: 'signHere',
  dates: 'dateSigned',
};

const CATEGORY_TO_FIELD_TYPE: Record<string, MissingFieldMetadata['fieldType']> = {
  signatures: 'signature',
  dates: 'date',
};

const SEVERITY_TO_CONFIDENCE: Record<string, FieldConfidence> = {
  error: 'high',
  warning: 'medium',
  info: 'low',
};

/**
 * Try to extract a page number from a compliance message.
 * Handles patterns like "Page 16", "page 2", etc.
 * Delegates to shared utility — re-exported for local use.
 */

@Injectable()
export class FieldAnalysisService {
  private readonly logger = new Logger(FieldAnalysisService.name);

  constructor(
    @InjectRepository(TransactionDocumentEntity)
    private readonly docRepo: Repository<TransactionDocumentEntity>,
    @InjectRepository(TransactionPartyEntity)
    private readonly partyRepo: Repository<TransactionPartyEntity>,
    private readonly oauthService: DocuSignOAuthService,
    private readonly recipientResolver: RecipientResolverService,
    @Optional() private readonly sharedCoords?: SharedCoordinatesService,
  ) {}

  /**
   * Analyze one or more documents for missing signature fields, initials, dates,
   * names, and checkboxes. Returns structured per-document analysis with recipient
   * recommendations and DocuSign tab coordinates.
   */
  async analyzeDocuments(transactionId: string, documentIds: string[]): Promise<AnalyzeDocumentsResponse> {
    const docs = await this.docRepo.find({
      where: { id: In(documentIds), transactionId },
    });
    if (docs.length === 0) throw new NotFoundException('No documents found');

    const parties = await this.partyRepo.find({ where: { transactionId } });

    const analyses: DocumentFieldAnalysis[] = [];

    for (const doc of docs) {
      const analysis = await this.buildDocumentAnalysis(doc, parties);
      analyses.push(analysis);
    }

    const completeDocs = analyses.filter((a) => a.status === 'complete').length;
    const docsWithMissing = analyses.filter((a) => a.status !== 'complete').length;

    return {
      analyses,
      summary: {
        totalDocuments: analyses.length,
        completeDocuments: completeDocs,
        documentsWithMissingFields: docsWithMissing,
        totalMissingRequired: analyses.reduce((s, a) => s + a.missingRequired, 0),
        totalMissingOptional: analyses.reduce((s, a) => s + a.missingOptional, 0),
        statusLabels: analyses.map((a) => a.statusLabel),
      },
    };
  }

  /**
   * Validate field placements before sending — checks for missing recipients,
   * invalid coordinates, low-confidence fields, and connected DocuSign account.
   */
  async validateFieldPlacement(
    userId: string | undefined,
    placements: EnvelopeFieldPlacement[],
    fields: Array<{ id: string; label: string; confidence: 'high' | 'medium' | 'low'; pageNumber: number; xPosition: number; yPosition: number }>,
  ): Promise<FieldValidationResult> {
    const issues: FieldIssue[] = [];

    // Check connected DocuSign account
    if (userId) {
      try {
        const connection = await this.oauthService.getConnection(userId);
        if (!connection || !connection.connected) {
          issues.push({ kind: 'no_connected_account', message: 'No connected DocuSign account found. Connect your DocuSign account in Profile settings.' });
        }
      } catch {
        issues.push({ kind: 'no_connected_account', message: 'Unable to verify DocuSign connection. Please reconnect in Profile settings.' });
      }
    }

    // Check each field has a recipient assigned
    const placedFieldLabels = new Set<string>();
    for (const placement of placements) {
      for (const tabList of Object.values(placement.tabs)) {
        for (const tab of tabList) {
          const t = tab as Record<string, unknown>;
          if (!t.recipientId) {
            issues.push({
              kind: 'no_recipient',
              fieldId: (t.tabLabel as string) || '',
              fieldLabel: (t.tabLabel as string) || '',
            });
          }
          placedFieldLabels.add((t.tabLabel as string) || '');
        }
      }
    }

    // Check all fields have valid coordinates
    for (const placement of placements) {
      for (const tabList of Object.values(placement.tabs)) {
        for (const tab of tabList) {
          const t = tab as Record<string, unknown>;
          const x = parseFloat((t.xPosition as string) || '0');
          const y = parseFloat((t.yPosition as string) || '0');
          if (isNaN(x) || isNaN(y) || x < 0 || y < 0 || x > 612 || y > 792) {
            issues.push({
              kind: 'invalid_coordinates',
              fieldId: (t.tabLabel as string) || '',
              fieldLabel: (t.tabLabel as string) || '',
              reason: `Position (${t.xPosition}, ${t.yPosition}) is outside the page bounds (0-612, 0-792).`,
            });
          }
        }
      }
    }

    // Check for unplaced low-confidence fields
    for (const field of fields) {
      if (field.confidence === 'low' && !placedFieldLabels.has(field.label)) {
        issues.push({
          kind: 'low_confidence',
          fieldId: field.id,
          fieldLabel: field.label,
        });
      }
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }

  /**
   * Build a flat list of DocuSign tabs for a given set of field placements.
   * Groups tabs into their DocuSign envelope tab type arrays.
   */
  buildTabArrays(placements: EnvelopeFieldPlacement[]): Record<string, unknown[]> {
    const result: Record<string, unknown[]> = {};

    for (const placement of placements) {
      const documentId = placement.documentNumber;

      for (const [tabType, tabList] of Object.entries(placement.tabs)) {
        const tabsWithDocId = tabList.map((tab) => {
          const t = tab as Record<string, unknown>;
          return {
            documentId,
            pageNumber: t.pageNumber,
            recipientId: t.recipientId,
            xPosition: t.xPosition,
            yPosition: t.yPosition,
            tabLabel: (t.tabLabel as string).slice(0, 100),
          };
        });

        // Map tab type keys back to DocuSign naming convention
        const key = tabType === 'signHere' || tabType === 'signHereTabs' ? 'signHereTabs'
          : tabType === 'initialHere' || tabType === 'initialHereTabs' ? 'initialHereTabs'
          : tabType === 'dateSigned' || tabType === 'dateSignedTabs' ? 'dateSignedTabs'
          : tabType === 'fullName' || tabType === 'fullNameTabs' ? 'fullNameTabs'
          : tabType === 'checkbox' || tabType === 'checkboxTabs' ? 'checkboxTabs'
          : 'textTabs';

        if (!result[key]) result[key] = [];
        result[key].push(...tabsWithDocId);
      }
    }

    return result;
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async buildDocumentAnalysis(
    doc: TransactionDocumentEntity,
    parties: TransactionPartyEntity[],
  ): Promise<DocumentFieldAnalysis> {
    const meta = doc.metadataJson as Record<string, unknown> | null;
    const formCode = (doc.formCode || (meta?.detectedFormCode as string) || 'Unknown').toUpperCase();
    const fileName = doc.fileName || `${formCode}.pdf`;
    const formName = meta?.detectedFormName as string || formCode;

    // Derive missing fields from compliance data
    const fields = await this.deriveMissingFields(doc, formCode, parties);

    // Determine document status
    const status = this.determineDocStatus(fields);
    const statusLabel = this.buildStatusLabel(fields, status);

    // Compute recommended recipients from party data
    const recommendedRecipients = this.buildRecommendedRecipients(fields, parties);

    return {
      documentId: doc.id,
      fileName,
      formCode,
      formName,
      status,
      statusLabel,
      totalFields: fields.length,
      requiredFields: fields.filter((f) => f.isRequired).length,
      missingRequired: fields.filter((f) => f.isRequired).length,
      missingOptional: fields.filter((f) => !f.isRequired).length,
      fields,
      recommendedRecipients,
    };
  }

  private async deriveMissingFields(
    doc: TransactionDocumentEntity,
    formCode: string,
    parties: TransactionPartyEntity[],
  ): Promise<MissingFieldMetadata[]> {
    const fields: MissingFieldMetadata[] = [];
    const meta = doc.metadataJson as Record<string, unknown> | null;
    const compliance = meta?.compliance as ComplianceResult | null;
    const extraction = meta?.extraction as Record<string, unknown> | null;

    // Source 1: Compliance blockers and warnings
    const allComplianceItems = [
      ...(compliance?.blockers ?? []),
      ...(compliance?.warnings ?? []),
    ];

    for (const item of allComplianceItems) {
      const sourceCode = (item as { compositeId?: string }).compositeId
        || (item as { code?: string }).code
        || item.type;
      const mapped = await this.mapComplianceItemToFields(doc.id, formCode, item, parties, sourceCode);
      fields.push(...mapped);
    }

    // Source 2: Extraction signature data (supplement to compliance)
    if (extraction) {
      const sigFields = this.deriveFieldsFromExtraction(doc.id, formCode, extraction as Record<string, unknown>, parties);
      // Deduplicate by label
      const existingLabels = new Set(fields.map((f) => f.label));
      for (const f of sigFields) {
        if (!existingLabels.has(f.label)) {
          fields.push(f);
          existingLabels.add(f.label);
        }
      }
    }

    return fields;
  }

  private async mapComplianceItemToFields(
    documentId: string,
    formCode: string,
    item: BlockerOutput | WarningOutput,
    parties: TransactionPartyEntity[],
    sourceCode: string,
  ): Promise<MissingFieldMetadata[]> {
    const fields: MissingFieldMetadata[] = [];
    const template = getFormTemplate(formCode);
    const confidence: FieldConfidence = item.type === 'blocker' ? 'high' : 'medium';
    const isRequired = item.type === 'blocker';
    const lowerMsg = item.message.toLowerCase();

    if (!template) {
      const pageNumber = extractPageFromMessage(item.message, 1);
      fields.push(this.makeGenericField(documentId, formCode, item, confidence, isRequired, pageNumber, parties));
      return fields;
    }

    const matchedPlacements: FormFieldPlacement[] = [];

    // Phase 0: Shared DB coordinates (crowd-sourced, highest priority)
    if (this.sharedCoords) {
      try {
        const sharedCoords = await this.sharedCoords.query({
          formCode,
          fieldType: CATEGORY_TO_FIELD_TYPE[(item as { category?: string }).category as string]
            || (item.type === 'blocker' ? 'signature' : 'date'),
          recipientRole: detectRolesInMessage(lowerMsg)[0],
        });
        for (const sc of sharedCoords) {
          const recipient = this.findRecommendedRecipient(sc.recipientRole, parties);
          fields.push({
            id: `field-${documentId.slice(0, 8)}-${sc.fieldLabel.replace(/\s+/g, '-').toLowerCase()}-shared`,
            fieldType: sc.fieldType as MissingFieldMetadata['fieldType'],
            docuSignTabType: sc.docuSignTabType as MissingFieldMetadata['docuSignTabType'],
            label: sc.fieldLabel,
            description: `Shared coordinate (verified ${sc.verificationCount}x) — Page ${sc.pageNumber}`,
            pageNumber: sc.pageNumber,
            xPosition: sc.xPosition,
            yPosition: sc.yPosition,
            width: sc.width ?? undefined,
            height: sc.height ?? undefined,
            recommendedRecipientRole: sc.recipientRole,
            recipientName: recipient?.displayName ?? null,
            recipientEmail: recipient?.email ?? null,
            formCode,
            documentId,
            sourceCode,
            confidence: 'high',
            anchorString: null,
            isRequired,
          });
        }
      } catch (err) {
        this.logger.warn(`Shared coordinate lookup failed for ${formCode}: ${(err as Error).message}`);
      }
    }

    // If shared DB had a match, return early (shared coords take precedence)
    if (fields.length > 0) return fields;

    // Phase 1: Direct compliance code match
    for (const placement of template.placements) {
      const code = (item as { code?: string }).code;
      const compositeId = (item as { compositeId?: string }).compositeId;
      if ((code && placement.complianceCode === code)
        || (compositeId && placement.complianceCode === compositeId)) {
        matchedPlacements.push(placement);
      }
    }

    // Phase 2: Role + tab-type matching (for codes that don't match exactly)
    if (matchedPlacements.length === 0) {
      const desiredTabType = CATEGORY_TO_TAB_TYPE[(item as { category?: string }).category as string] || 'signHere';
      const detectedRoles = detectRolesInMessage(lowerMsg);

      for (const placement of template.placements) {
        if (placement.docuSignTabType !== desiredTabType) continue;
        const placementRole = placement.recommendedRecipientRole.toLowerCase();
        if (detectedRoles.some((r) => placementRole.includes(r) || r.includes(placementRole))) {
          matchedPlacements.push(placement);
        }
      }
    }

    // Phase 3: Substring matching (message contains placement label)
    if (matchedPlacements.length === 0) {
      for (const placement of template.placements) {
        if (lowerMsg.includes(placement.label.toLowerCase())) {
          matchedPlacements.push(placement);
        }
      }
    }

    // Build fields from matched placements
    for (const placement of matchedPlacements) {
      const recipient = this.findRecommendedRecipient(placement.recommendedRecipientRole, parties);
      fields.push({
        id: `field-${documentId.slice(0, 8)}-${placement.label.replace(/\s+/g, '-').toLowerCase()}-${sourceCode}`,
        fieldType: this.tabTypeToFieldType(placement.docuSignTabType),
        docuSignTabType: placement.docuSignTabType,
        label: placement.label,
        description: placement.description,
        pageNumber: placement.pageNumber,
        xPosition: placement.xPosition,
        yPosition: placement.yPosition,
        width: placement.width,
        height: placement.height,
        recommendedRecipientRole: placement.recommendedRecipientRole,
        recipientName: recipient?.displayName ?? null,
        recipientEmail: recipient?.email ?? null,
        formCode,
        documentId,
        sourceCode,
        confidence,
        anchorString: null,
        isRequired,
      });
    }

    // Phase 4: Generic fallback for both blockers and warnings
    if (fields.length === 0) {
      const pageNumber = extractPageFromMessage(item.message, 1);
      const fc: FieldConfidence = 'low';
      fields.push(this.makeGenericField(documentId, formCode, item, fc, isRequired, pageNumber, parties));
    }

    return fields;
  }

  /**
   * Build a generic field entry when no coordinate template match exists.
   * Sets confidence to low and extracts page from message when possible.
   */
  private makeGenericField(
    documentId: string,
    formCode: string,
    item: BlockerOutput | WarningOutput,
    confidence: FieldConfidence,
    isRequired: boolean,
    pageNumber: number,
    parties: TransactionPartyEntity[],
  ): MissingFieldMetadata {
    const sourceCode = (item as { compositeId?: string }).compositeId
      || (item as { code?: string }).code
      || item.type;
    const desiredTabType = CATEGORY_TO_TAB_TYPE[(item as { category?: string }).category as string] || 'signHere';
    const fieldType = CATEGORY_TO_FIELD_TYPE[(item as { category?: string }).category as string]
      || (desiredTabType === 'signHere' ? 'signature' : 'date');
    const roles = detectRolesInMessage(item.message.toLowerCase());
    const recipientRole = roles[0] || 'buyer';
    const recipient = this.findRecommendedRecipient(recipientRole, parties);

    return {
      id: `field-${documentId.slice(0, 8)}-${item.type}-${sourceCode}`,
      fieldType,
      docuSignTabType: desiredTabType,
      label: item.message.length > 80 ? item.message.slice(0, 77) + '...' : item.message,
      description: item.message + (pageNumber === 1 && !/page\s*\d+/i.test(item.message)
        ? ` — placement approximated (not on Page ${pageNumber})`
        : ''),
      pageNumber,
      xPosition: 90,
      yPosition: 500,
      width: 200,
      height: 32,
      recommendedRecipientRole: recipientRole,
      recipientName: recipient?.displayName ?? null,
      recipientEmail: recipient?.email ?? null,
      formCode,
      documentId,
      sourceCode,
      confidence,
      anchorString: null,
      isRequired,
    };
  }

  private deriveFieldsFromExtraction(
    documentId: string,
    formCode: string,
    extraction: Record<string, unknown>,
    parties: TransactionPartyEntity[],
  ): MissingFieldMetadata[] {
    const fields: MissingFieldMetadata[] = [];
    const signatures = extraction.signatures as Record<string, unknown> | undefined;
    const template = getFormTemplate(formCode);
    let sigCounter = 0;
    let dateCounter = 0;

    if (!signatures) return fields;

    const missingSignatures = (signatures.missingSignatures as string[]) ?? [];
    const missingDates = (signatures.missingSignatureDates as string[]) ?? [];
    const buyerSigned = signatures.buyerSigned as boolean | undefined;
    const sellerSigned = signatures.sellerSigned as boolean | undefined;

    // Determine which roles have missing signatures based on booleans + names
    const missingRoles = new Set<string>();
    if (buyerSigned === false) missingRoles.add('buyer');
    if (sellerSigned === false) missingRoles.add('seller');

    // Also check named missing signatures
    for (const name of missingSignatures) {
      const lowerName = name.toLowerCase();
      if (lowerName.includes('buyer')) missingRoles.add('buyer');
      else if (lowerName.includes('seller')) missingRoles.add('seller');
    }

    // Map missing signatures by role
    for (const role of missingRoles) {
      const tabType: DocuSignTabType = 'signHere';
      let matched = false;

      if (template) {
        for (const placement of template.placements) {
          if (placement.docuSignTabType !== 'signHere') continue;
          if (placement.recommendedRecipientRole !== role) continue;
          const recipient = this.findRecommendedRecipient(placement.recommendedRecipientRole, parties);
          fields.push({
            id: `field-${documentId.slice(0, 8)}-${role}-sig-${sigCounter++}`,
            fieldType: 'signature',
            docuSignTabType: 'signHere',
            label: `${role.charAt(0).toUpperCase() + role.slice(1)} Signature`,
            description: placement.description,
            pageNumber: placement.pageNumber,
            xPosition: placement.xPosition,
            yPosition: placement.yPosition,
            width: placement.width,
            height: placement.height,
            recommendedRecipientRole: placement.recommendedRecipientRole,
            recipientName: recipient?.displayName ?? null,
            recipientEmail: recipient?.email ?? null,
            formCode,
            documentId,
            sourceCode: 'EXTRACTION-SIGNATURE',
            confidence: 'medium',
            anchorString: null,
            isRequired: true,
          });
          matched = true;
          break;
        }
      }

      if (!matched) {
        const recipient = this.findRecommendedRecipient(role, parties);
        fields.push({
          id: `field-${documentId.slice(0, 8)}-${role}-sig`,
          fieldType: 'signature',
          docuSignTabType: 'signHere',
          label: `${role.charAt(0).toUpperCase() + role.slice(1)} Signature`,
          description: `Missing ${role} signature`,
          pageNumber: 1,
          xPosition: 90,
          yPosition: 500,
          width: 200,
          height: 32,
          recommendedRecipientRole: role,
          recipientName: recipient?.displayName ?? null,
          recipientEmail: recipient?.email ?? null,
          formCode,
          documentId,
          sourceCode: 'EXTRACTION-SIGNATURE',
          confidence: 'low',
          anchorString: null,
          isRequired: true,
        });
      }
    }

    // Map missing dates by role
    for (const name of missingDates) {
      const lowerName = name.toLowerCase();
      let role = 'buyer';
      if (lowerName.includes('seller')) role = 'seller';

      let matched = false;
      if (template) {
        for (const placement of template.placements) {
          if (placement.docuSignTabType !== 'dateSigned') continue;
          if (placement.recommendedRecipientRole !== role) continue;
          const recipient = this.findRecommendedRecipient(placement.recommendedRecipientRole, parties);
          fields.push({
            id: `field-${documentId.slice(0, 8)}-${role}-date-${dateCounter++}`,
            fieldType: 'date',
            docuSignTabType: 'dateSigned',
            label: `${role.charAt(0).toUpperCase() + role.slice(1)} Signature Date`,
            description: placement.description,
            pageNumber: placement.pageNumber,
            xPosition: placement.xPosition,
            yPosition: placement.yPosition,
            width: placement.width,
            height: placement.height,
            recommendedRecipientRole: placement.recommendedRecipientRole,
            recipientName: recipient?.displayName ?? null,
            recipientEmail: recipient?.email ?? null,
            formCode,
            documentId,
            sourceCode: 'EXTRACTION-DATE',
            confidence: 'medium',
            anchorString: null,
            isRequired: false,
          });
          matched = true;
          break;
        }
      }

      if (!matched) {
        const recipient = this.findRecommendedRecipient(role, parties);
        fields.push({
          id: `field-${documentId.slice(0, 8)}-${role}-date`,
          fieldType: 'date',
          docuSignTabType: 'dateSigned',
          label: `${role.charAt(0).toUpperCase() + role.slice(1)} Signature Date`,
          description: `Missing ${role} signature date`,
          pageNumber: 1,
          xPosition: 90,
          yPosition: 500,
          width: 120,
          height: 24,
          recommendedRecipientRole: role,
          recipientName: recipient?.displayName ?? null,
          recipientEmail: recipient?.email ?? null,
          formCode,
          documentId,
          sourceCode: 'EXTRACTION-DATE',
          confidence: 'low',
          anchorString: null,
          isRequired: false,
        });
      }
    }

    return fields;
  }

  private findRecommendedRecipient(
    role: string,
    parties: TransactionPartyEntity[],
  ): TransactionPartyEntity | undefined {
    return this.recipientResolver.findRecipientByRole(role, parties);
  }

  private buildRecommendedRecipients(
    fields: MissingFieldMetadata[],
    parties: TransactionPartyEntity[],
  ): Array<{ role: string; label: string; name: string; email: string }> {
    return this.recipientResolver.buildRecommendedRecipients(fields, parties);
  }

  private determineDocStatus(fields: MissingFieldMetadata[]): DocumentFieldStatus {
    if (fields.length === 0) return 'complete';

    const hasSignatures = fields.some((f) => f.fieldType === 'signature');
    const hasInitials = fields.some((f) => f.fieldType === 'initials');
    const hasDates = fields.some((f) => f.fieldType === 'date');
    const hasNames = fields.some((f) => f.fieldType === 'name');

    const hasLowConfidence = fields.some((f) => f.confidence === 'low');

    if (hasLowConfidence && !hasSignatures) return 'needs_review';
    if (hasSignatures && hasDates) return 'missing_fields';
    if (hasSignatures) return 'missing_signatures';
    if (hasInitials) return 'missing_initials';
    if (hasDates) return 'missing_dates';
    if (hasNames) return 'missing_fields';

    return 'missing_fields';
  }

  private buildStatusLabel(fields: MissingFieldMetadata[], status: DocumentFieldStatus): string {
    if (status === 'complete') return 'All Required Signatures Complete';

    const parts: string[] = [];

    const sigFields = fields.filter((f) => f.fieldType === 'signature');
    const initFields = fields.filter((f) => f.fieldType === 'initials');
    const dateFields = fields.filter((f) => f.fieldType === 'date');
    const nameFields = fields.filter((f) => f.fieldType === 'name');
    const lowConfFields = fields.filter((f) => f.confidence === 'low');

    if (sigFields.length > 0) {
      const roles = [...new Set(sigFields.map((f) => f.recommendedRecipientRole))];
      parts.push(`Missing ${roles.join('/')} Signature${sigFields.length > 1 ? 's' : ''}`);
    }
    if (initFields.length > 0) {
      const pages = [...new Set(initFields.map((f) => f.pageNumber))];
      parts.push(`Missing Initials on Page${pages.length > 1 ? 's' : ''} ${pages.join(', ')}`);
    }
    if (dateFields.length > 0) {
      parts.push(`Missing Signature Date${dateFields.length > 1 ? 's' : ''}`);
    }
    if (nameFields.length > 0) {
      parts.push(`Missing Name${nameFields.length > 1 ? 's' : ''}`);
    }
    if (fields.length > 0 && parts.length === 0) {
      parts.push(`${fields.length} Missing Field${fields.length > 1 ? 's' : ''}`);
    }
    if (lowConfFields.length > 0 && sigFields.length === 0) {
      return parts.length > 0 ? `${parts.join(', ')} — Manual Review Required` : 'Manual Review Required';
    }

    return parts.join(' — ') || 'Missing Fields Detected';
  }

  private tabTypeToFieldType(tabType: DocuSignTabType): MissingFieldMetadata['fieldType'] {
    switch (tabType) {
      case 'signHere': return 'signature';
      case 'initialHere': return 'initials';
      case 'dateSigned': return 'date';
      case 'fullName': return 'name';
      case 'checkbox': return 'checkbox';
      case 'text': return 'text';
    }
  }
}
