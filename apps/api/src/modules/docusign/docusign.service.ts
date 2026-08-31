import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Readable } from 'stream';
import { DocuSignEnvelopeEntity, DocuSignEnvelopeStatus } from './entities/docusign-envelope.entity';
import { TransactionDocumentEntity } from '../transaction-documents/entities/transaction-document.entity';
import { DocumentStatus } from '../transaction-documents/entities/transaction-document.entity';
import { TransactionEntity } from '../transactions/entities/transaction.entity';
import { TransactionPartyEntity, PartyRole } from '../transaction-parties/entities/transaction-party.entity';
import { TransactionFormTemplateEntity } from '../transaction-form-templates/entities/transaction-form-template.entity';
import { TransactionFormTemplateItemEntity } from '../transaction-form-templates/entities/transaction-form-template-item.entity';
import { S3StorageService } from '../storage/s3-storage.service';
import { DocuSignOAuthService } from './docusign-oauth.service';
import { SignatureLineDetectorService } from './signature-line-detector.service';
import type { DetectedSignatureLine } from './signature-line-detector.service';
import { PdfRenderService } from './pdf-render.service';
import { SignedDocumentNotificationService } from './signed-document-notification.service';
import { VpSignedEscrowNotificationService } from './vp-signed-escrow-notification.service';
import { streamToBuffer, formatAddress } from './docusign-utils';
import { DocumentPipelineService } from '../document-extraction/document-pipeline.service';

import { PDFDocument } from 'pdf-lib';

export interface CreateEnvelopeOptions {
  transactionId: string;
  documentIds: string[];
  signers: Array<{ name: string; email: string; role?: string }>;
  emailSubject?: string;
  emailBody?: string;
}

export interface SendSellerDocumentsOptions {
  transactionId: string;
  /** Which upload link this send originated from — persisted on the envelope for duplicate-prevention scoping and Seller Side attribution. */
  uploadLinkId: string;
  /** Caller-supplied order is preserved as the envelope's document order. */
  documentIds: string[];
  buyers: Array<{ name: string; email: string }>;
  buyerAgent: { name: string; email: string };
  emailSubject?: string;
  emailBody?: string;
}

interface DocuSignTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface DocuSignUserInfo {
  accounts: Array<{ account_id: string; base_uri: string; is_default: boolean }>;
}

interface DocuSignEnvelopeResponse {
  envelopeId: string;
  uri: string;
  status: string;
  statusDateTime: string;
  recipients?: {
    signers?: Array<{
      recipientId: string;
      name: string;
      email: string;
      roleName: string;
      status: string;
      routingOrder: string;
    }>;
  };
}

@Injectable()
export class DocuSignService {
  private readonly logger = new Logger(DocuSignService.name);
  private accessToken: string | null = null;
  private accessTokenExpiry: number = 0;
  private accountId: string | null = null;
  private baseUri: string | null = null;

  // Template auto-discovery cache
  private templateCache: Array<{ templateId: string; name: string; lastModified: string }> | null = null;
  private templateCacheExpiry: number = 0;
  private static readonly TEMPLATE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  constructor(
    @InjectRepository(DocuSignEnvelopeEntity)
    private readonly envelopeRepo: Repository<DocuSignEnvelopeEntity>,
    @InjectRepository(TransactionDocumentEntity)
    private readonly docRepo: Repository<TransactionDocumentEntity>,
    @InjectRepository(TransactionEntity)
    private readonly txRepo: Repository<TransactionEntity>,
    @InjectRepository(TransactionPartyEntity)
    private readonly partyRepo: Repository<TransactionPartyEntity>,
    @InjectRepository(TransactionFormTemplateEntity)
    private readonly templateRepo: Repository<TransactionFormTemplateEntity>,
    @InjectRepository(TransactionFormTemplateItemEntity)
    private readonly templateItemRepo: Repository<TransactionFormTemplateItemEntity>,
    private readonly s3: S3StorageService,
    private readonly oauthService: DocuSignOAuthService,
    private readonly lineDetector: SignatureLineDetectorService,
    private readonly pdfRender: PdfRenderService,
    private readonly signedDocumentNotification: SignedDocumentNotificationService,
    private readonly vpSignedEscrowNotification: VpSignedEscrowNotificationService,
    private readonly documentPipeline: DocumentPipelineService,
  ) {}

  // ── Environment helpers ──────────────────────────────────────────────────

  private get integrationKey(): string {
    return process.env.DOCUSIGN_INTEGRATION_KEY ?? '';
  }

  private get impersonatedUserId(): string {
    return process.env.DOCUSIGN_IMPERSONATED_USER_ID ?? '';
  }

  private get configuredAccountId(): string {
    return process.env.DOCUSIGN_ACCOUNT_ID ?? '';
  }

  private get privateKey(): string {
    return process.env.DOCUSIGN_PRIVATE_KEY ?? '';
  }

  private get authServer(): string {
    return process.env.DOCUSIGN_AUTH_SERVER ?? 'account-d.docusign.com';
  }

  // ── OAuth 2.0 JWT Grant ──────────────────────────────────────────────────

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.accessTokenExpiry) {
      return this.accessToken;
    }

    if (!this.integrationKey || !this.impersonatedUserId || !this.privateKey) {
      throw new Error('DocuSign is not configured (missing integration key, user ID, or private key)');
    }

    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: this.integrationKey,
      sub: this.impersonatedUserId,
      aud: this.authServer,
      iat: now,
      exp: now + 3600,
      scope: 'signature impersonation',
    };

    const jwt = await this.signJwt(payload);

    const res = await fetch(`https://${this.authServer}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      this.logger.error(`DocuSign OAuth failed (${res.status}): ${text}`);
      throw new Error(`DocuSign authentication failed: ${text}`);
    }

    const data = (await res.json()) as DocuSignTokenResponse;
    this.accessToken = data.access_token;
    this.accessTokenExpiry = Date.now() + (data.expires_in - 300) * 1000;

    // Fetch user info to get account ID and base URI
    await this.fetchUserInfo();

    return this.accessToken;
  }

  private async fetchUserInfo(): Promise<void> {
    const res = await fetch(`https://${this.authServer}/oauth/userinfo`, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });
    if (!res.ok) return;

    const data = (await res.json()) as DocuSignUserInfo;
    const account = this.configuredAccountId
      ? data.accounts.find((a) => a.account_id === this.configuredAccountId)
      : data.accounts.find((a) => a.is_default) ?? data.accounts[0];

    if (account) {
      this.accountId = account.account_id;
      this.baseUri = account.base_uri;
    }
  }

  private getPrivateKeyPem(): string {
    let keyContent = this.privateKey;
    if (!keyContent.includes('-----BEGIN')) {
      keyContent = Buffer.from(keyContent, 'base64').toString('utf-8');
    }
    // Reconstruct proper PEM with newlines (dotenv strips them)
    const parts = keyContent.match(/-----BEGIN [^-]+-----[^-]*-----END [^-]+-----/);
    if (parts) {
      const body = keyContent.replace(/-----(BEGIN|END) [^-]+-----/g, '').replace(/\s/g, '');
      const header = keyContent.match(/-----BEGIN [^-]+-----/)![0];
      const footer = keyContent.match(/-----END [^-]+-----/)![0];
      const bodyLines = body.match(/.{1,64}/g) ?? [];
      return [header, ...bodyLines, footer].join('\n');
    }
    return keyContent;
  }

  private async signJwt(payload: Record<string, unknown>): Promise<string> {
    const crypto = await import('crypto');

    const keyContent = this.getPrivateKeyPem();

    const header = { alg: 'RS256', typ: 'JWT' };
    const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signingInput = `${encodedHeader}.${encodedPayload}`;

    const sign = crypto.createSign('RSA-SHA256');
    sign.update(signingInput);
    sign.end();
    const signature = sign.sign(keyContent, 'base64url');

    return `${signingInput}.${signature}`;
  }

  private async apiUrl(path: string): Promise<string> {
    const token = await this.getAccessToken();
    if (!this.baseUri || !this.accountId) {
      throw new Error('DocuSign account information not available');
    }
    return `${this.baseUri}/restapi/v2.1/accounts/${this.accountId}${path}`;
  }

  private async authHeaders(): Promise<Record<string, string>> {
    const token = await this.getAccessToken();
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  }

  // ── Template auto-discovery ──────────────────────────────────────────────

  /** Fetch all templates from DocuSign and cache for 5 minutes. */
  private async listTemplates(): Promise<Array<{ templateId: string; name: string; lastModified: string }>> {
    if (this.templateCache && Date.now() < this.templateCacheExpiry) {
      return this.templateCache;
    }

    try {
      const url = await this.apiUrl('/templates');
      const headers = await this.authHeaders();
      const res = await fetch(url, { headers });

      if (!res.ok) {
        this.logger.warn(`Failed to list DocuSign templates (${res.status})`);
        return this.templateCache ?? [];
      }

      const data = (await res.json()) as {
        envelopeTemplates?: Array<{ templateId: string; name: string; lastModified: string }>;
      };

      this.templateCache = (data.envelopeTemplates ?? []).map((t) => ({
        templateId: t.templateId,
        name: t.name || '',
        lastModified: t.lastModified,
      }));

      this.templateCacheExpiry = Date.now() + DocuSignService.TEMPLATE_CACHE_TTL_MS;
      this.logger.log(`DocuSign template cache refreshed: ${this.templateCache.length} templates`);

      return this.templateCache;
    } catch (err) {
      this.logger.warn(`DocuSign template list failed: ${(err as Error).message}`);
      return this.templateCache ?? [];
    }
  }

  /**
   * Find a DocuSign template by form code using the FormCode_Description naming convention.
   * Searches cached templates for names starting with "{formCode}_" (case-insensitive).
   * If multiple matches exist, returns the most recently modified.
   */
  async findTemplateByFormCode(formCode: string): Promise<{ templateId: string; name: string } | null> {
    if (!formCode) return null;

    const templates = await this.listTemplates();
    const prefix = formCode.toUpperCase() + '_';

    const matches = templates.filter((t) => t.name.toUpperCase().startsWith(prefix));

    if (matches.length === 0) return null;

    // Prefer most recently modified
    matches.sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime());

    const best = matches[0];
    this.logger.log(
      `DocuSign auto-match: ${formCode} → "${best.name}" (${best.templateId.slice(0, 8)}…, ${matches.length} match(es))`,
    );

    return { templateId: best.templateId, name: best.name };
  }

  // ── Create envelope ──────────────────────────────────────────────────────

  /**
   * Create a DocuSign envelope with explicit tab placement for specific fields.
   * Only the provided tabs are placed — existing signatures/dates are preserved.
   * The rest of the PDF is treated as read-only content.
   */
  async createEnvelopeWithFields(opts: {
    transactionId: string;
    documentIds: string[];
    signers: Array<{ name: string; email: string; role: string }>;
    tabsPerDocument: Array<{
      documentId: string;
      tabs: Record<string, unknown[]>;
    }>;
    emailSubject?: string;
    emailBody?: string;
    userId?: string;
  }): Promise<DocuSignEnvelopeEntity> {
    const tx = await this.txRepo.findOne({ where: { id: opts.transactionId } });
    if (!tx) throw new NotFoundException('Transaction not found');

    const docs = await this.docRepo.find({ where: { id: In(opts.documentIds) } });
    if (docs.length === 0) throw new NotFoundException('No documents found');

    const docsWithStorage = docs.filter((d) => d.storageKey);
    if (docsWithStorage.length === 0) {
      throw new NotFoundException('None of the selected documents have a stored PDF file');
    }

    let userToken: { accessToken: string; baseUri: string; docusignAccountId: string } | null = null;
    if (opts.userId) {
      try {
        userToken = await this.oauthService.getValidToken(opts.userId);
        this.logger.log(`DocuSign: using per-user connection for user ${opts.userId}`);
      } catch {
        this.logger.log(`DocuSign: per-user connection unavailable, falling back to shared credentials`);
      }
    }

    const propertyAddress = formatAddress(tx);
    const emailSubject = opts.emailSubject ?? `Signature Request – ${propertyAddress}`;

    const recipients = opts.signers.map((s, i) => ({
      email: s.email,
      name: s.name,
      recipientId: String(i + 1),
      routingOrder: String(i + 1),
      roleName: s.role ?? 'signer',
    }));

    // Build tabs map keyed by documentId (as string)
    const tabsByDocId = new Map<string, Record<string, unknown[]>>();
    for (const td of opts.tabsPerDocument) {
      tabsByDocId.set(td.documentId, td.tabs);
    }

    // Build composite templates with tabs per document
    const compositeEntries: Array<Record<string, unknown>> = [];

    // Map real document UUIDs → sequential DocuSign document numbers
    const docIdToSeq = new Map<string, string>();

    for (const doc of docsWithStorage) {
      const seqId = String(compositeEntries.length + 1);
      docIdToSeq.set(doc.id, seqId);

      const { stream, fileName } = await this.s3.getObject(doc.storageKey!);
      const buffer = await streamToBuffer(stream);
      const documentBase64 = buffer.toString('base64');
      const fileExtension = fileName.split('.').pop() ?? 'pdf';

      // Count actual PDF pages and detect page dimensions for coordinate scaling
      let actualPageCount = 1;
      let pageWidth = 612; // default: US Letter width (72 DPI points)
      let pageHeight = 792; // default: US Letter height (72 DPI points)
      try {
        actualPageCount = await this.pdfRender.getPageCount(buffer);
        const dims = await this.pdfRender.getPageDimensions(buffer);
        pageWidth = dims.width;
        pageHeight = dims.height;
      } catch {
        this.logger.warn(`Unable to read PDF dimensions for ${fileName}, assuming US Letter (612x792)`);
      }

      const tabs = tabsByDocId.get(doc.id) ?? {};

      // Signature-line detection: use computer vision to find actual line positions.
      // Falls back gracefully to template coordinates if detection is unavailable or fails.
      let detectedLineMap: Map<string, DetectedSignatureLine> | null = null;
      try {
        const formCode = (doc as any).formCode as string || '';
        const meta = (doc.metadataJson || {}) as Record<string, unknown>;
        const cachedDetections = (meta.signatureLineDetections as DetectedSignatureLine[]) ?? undefined;

        const detectedLines = await this.lineDetector.detectLines(
          buffer,
          formCode,
          doc.id,
          cachedDetections,
        );

        if (detectedLines.length > 0) {
          detectedLineMap = new Map();
          for (const line of detectedLines) {
            // Key by normalized label for matching against tab labels
            const key = line.label.toLowerCase().trim();
            detectedLineMap.set(key, line);
          }
          this.logger.log(`Signature-line detection found ${detectedLines.length} line(s) for ${formCode}`);

          // Cache results in metadataJson for future use
          if (!cachedDetections || cachedDetections.length === 0) {
            const updateMeta = { ...meta, signatureLineDetections: detectedLines };
            await this.docRepo.update(doc.id, { metadataJson: updateMeta as any } as any);
          }
        }
      } catch (detectionErr) {
        this.logger.warn(`Signature-line detection skipped: ${(detectionErr as Error).message}`);
      }

      // DocuSign coordinate offset (configurable via env var for fine-tuning)
      const coordOffsetX = Number(process.env.DOCUSIGN_TAB_OFFSET_X ?? -3);
      const coordOffsetY = Number(process.env.DOCUSIGN_TAB_OFFSET_Y ?? -2);

      // DocuSign uses 72 DPI coordinate system. If the PDF page size differs from
      // US Letter (612x792), scale the coordinates proportionally.
      const scaleX = pageWidth / 612;
      const scaleY = pageHeight / 792;
      if (Math.abs(scaleX - 1) > 0.001 || Math.abs(scaleY - 1) > 0.001) {
        this.logger.log(
          `PDF "${fileName}" page size ${pageWidth.toFixed(0)}x${pageHeight.toFixed(0)} ` +
          `— scaling coordinates by (${scaleX.toFixed(3)}, ${scaleY.toFixed(3)})`,
        );
      }

      // Remap tab documentIds, clamp pageNumbers, scale coordinates, and apply offset.
      // If signature-line detection found better coordinates, use those instead.
      const remappedTabs: Record<string, unknown[]> = {};
      for (const [tabType, tabList] of Object.entries(tabs)) {
        remappedTabs[tabType] = (tabList as Array<Record<string, unknown>>).map((t) => {
          const pageNumber = Number(t.pageNumber) || 1;
          let clampedPage = pageNumber;
          if (pageNumber > actualPageCount) {
            clampedPage = actualPageCount;
            this.logger.warn(
              `Clamped tab "${t.tabLabel}" pageNumber ${pageNumber} → ${clampedPage} ` +
              `(doc "${fileName}" has ${actualPageCount} pages)`,
            );
          }

          const tabLabel = (t.tabLabel as string || '').toLowerCase().trim();

          // Check if signature-line detection has a better position for this tab
          const detected = detectedLineMap?.get(tabLabel)
            ?? (detectedLineMap && [...detectedLineMap.values()].find(
              (l) => tabLabel.includes(l.label.toLowerCase()) || l.label.toLowerCase().includes(tabLabel),
            ));

          let rawX: number;
          let rawY: number;
          let finalWidth: number;
          let finalHeight: number;

          if (detected && detected.pageNumber === clampedPage) {
            // Use detected coordinates from computer vision (already in PDF points)
            rawX = detected.centerX - detected.width / 2;
            rawY = detected.centerY;
            finalWidth = detected.width;
            finalHeight = detected.height;
          } else {
            // Fall back to template coordinates
            rawX = Number(t.xPosition) || 0;
            rawY = Number(t.yPosition) || 0;
            finalWidth = Number(t.width) || 200;
            finalHeight = Number(t.height) || 32;
          }

          // Scale from template's 612x792 coordinate system to actual page dimensions
          const scaledX = rawX * scaleX;
          const scaledY = rawY * scaleY;
          // Apply DocuSign coordinate offset
          const adjustedX = Math.max(0, scaledX + coordOffsetX);
          const adjustedY = Math.max(0, scaledY + coordOffsetY);
          return {
            ...t,
            documentId: seqId,
            pageNumber: String(clampedPage),
            xPosition: String(Math.round(adjustedX)),
            yPosition: String(Math.round(adjustedY)),
            width: finalWidth ? String(Math.round(finalWidth * scaleX)) : undefined,
            height: finalHeight ? String(Math.round(finalHeight * scaleY)) : undefined,
          };
        });
      }

      // Rebuild signers with tabs — all tabs assigned to their matching recipients
      const fallbackSigners = recipients.map((r) => {
        const recipientTabs: Record<string, unknown[]> = {};
        for (const [tabType, tabList] of Object.entries(remappedTabs)) {
          const filtered = (tabList as Array<Record<string, unknown>>).filter(
            (t: Record<string, unknown>) => String(t.recipientId) === r.recipientId,
          );
          if (filtered.length > 0) {
            recipientTabs[tabType] = filtered;
          }
        }
        return {
          ...r,
          tabs: Object.keys(recipientTabs).length > 0 ? recipientTabs : undefined,
        };
      });

      // Detect orphan tabs (tabs whose recipientId doesn't match any envelope recipient)
      const assignedLabels = new Set<string>();
      for (const r of fallbackSigners) {
        if (r.tabs) {
          for (const tabList of Object.values(r.tabs)) {
            for (const t of tabList) {
              assignedLabels.add((t as Record<string, unknown>).tabLabel as string || '');
            }
          }
        }
      }
      const allTabCount = Object.values(remappedTabs).reduce((s, list) => s + list.length, 0);
      if (assignedLabels.size < allTabCount) {
        const allLabels = new Set<string>();
        for (const tabList of Object.values(remappedTabs)) {
          for (const t of tabList) {
            allLabels.add((t as Record<string, unknown>).tabLabel as string || '');
          }
        }
        const orphans = [...allLabels].filter((l) => !assignedLabels.has(l));
        this.logger.warn(
          `${orphans.length} orphan tab(s) dropped — no envelope recipient matched: ` +
          `${orphans.join(', ')}. Check that recipientId values match the signers array.`,
        );
      }

      compositeEntries.push({
        inlineTemplates: [{
          sequence: seqId,
          recipients: { signers: fallbackSigners },
        }],
        document: {
          documentBase64,
          name: fileName,
          documentId: seqId,
          fileExtension,
        },
      });
    }

    const envelopeDefinition: Record<string, unknown> = {
      emailSubject,
      emailBlurb: opts.emailBody ?? undefined,
      status: 'sent',
      compositeTemplates: compositeEntries,
    };

    let envelopeResponse: DocuSignEnvelopeResponse;

    if (userToken) {
      const url = `${userToken.baseUri}/restapi/v2.1/accounts/${userToken.docusignAccountId}/envelopes`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${userToken.accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(envelopeDefinition),
      });
      if (!res.ok) {
        const text = await res.text();
        this.logger.error(`DocuSign envelope creation failed (${res.status}): ${text}`);
        throw new Error(`Failed to create DocuSign envelope: ${text}`);
      }
      envelopeResponse = (await res.json()) as DocuSignEnvelopeResponse;
    } else {
      const url = await this.apiUrl('/envelopes');
      const headers = await this.authHeaders();
      const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(envelopeDefinition) });
      if (!res.ok) {
        const text = await res.text();
        this.logger.error(`DocuSign envelope creation failed (${res.status}): ${text}`);
        throw new Error(`Failed to create DocuSign envelope: ${text}`);
      }
      envelopeResponse = (await res.json()) as DocuSignEnvelopeResponse;
    }

    const responseSigners = envelopeResponse.recipients?.signers ?? [];
    const mergedSigners = recipients.map((r) => {
      const match = responseSigners.find((rs) => rs.email.toLowerCase() === r.email.toLowerCase());
      return {
        name: r.name,
        email: r.email,
        recipientId: match?.recipientId ?? r.recipientId,
        roleName: match?.roleName ?? r.roleName,
      };
    });

    const signingUrls = await this.fetchSigningUrls(envelopeResponse.envelopeId, mergedSigners, userToken);

    const entity = this.envelopeRepo.create({
      transactionId: opts.transactionId,
      envelopeId: envelopeResponse.envelopeId,
      status: DocuSignEnvelopeStatus.SENT,
      subject: emailSubject,
      message: opts.emailBody ?? null,
      signers: mergedSigners,
      documentIds: opts.documentIds,
      envelopeUri: envelopeResponse.uri,
      signingUrls,
      sentAt: new Date(),
    });

    const saved = await this.envelopeRepo.save(entity);
    this.logger.log(
      `DocuSign envelope created with fields: ${saved.envelopeId}`,
    );

    return saved;
  }

  async createEnvelope(opts: CreateEnvelopeOptions & { userId?: string }): Promise<DocuSignEnvelopeEntity> {
    const tx = await this.txRepo.findOne({ where: { id: opts.transactionId } });
    if (!tx) throw new NotFoundException('Transaction not found');

    const docs = await this.docRepo.find({ where: { id: In(opts.documentIds) } });
    if (docs.length === 0) throw new NotFoundException('No documents found');

    const docsWithStorage = docs.filter((d) => d.storageKey);
    if (docsWithStorage.length === 0) {
      throw new NotFoundException('None of the selected documents have a stored PDF file');
    }

    // Use per-user connection if available, fall back to shared credentials
    let userToken: { accessToken: string; baseUri: string; docusignAccountId: string } | null = null;
    if (opts.userId) {
      try {
        userToken = await this.oauthService.getValidToken(opts.userId);
        this.logger.log(`DocuSign: using per-user connection for user ${opts.userId}`);
      } catch {
        this.logger.log(`DocuSign: per-user connection unavailable, falling back to shared credentials`);
      }
    }

    const propertyAddress = formatAddress(tx);
    const emailSubject = opts.emailSubject ?? `Signature Request – ${propertyAddress}`;

    const recipients = opts.signers.map((s, i) => ({
      email: s.email,
      name: s.name,
      recipientId: String(i + 1),
      routingOrder: String(i + 1),
      roleName: s.role ?? 'signer',
    }));

    // ── Build per-form-code template map ──────────────────────────────────
    const manualTemplateMap = new Map<string, string>();
    if (tx.formTemplateId) {
      const items = await this.templateItemRepo.find({ where: { templateId: tx.formTemplateId } });
      for (const item of items) {
        if (item.docusignTemplateId) {
          manualTemplateMap.set(item.formCode.toUpperCase(), item.docusignTemplateId);
        }
      }
    }

    // ── Load documents from S3 and resolve per-document template ──────────
    const compositeEntries: Array<Record<string, unknown>> = [];
    let hasAnyTemplate = false;

    for (const doc of docsWithStorage) {
      const { stream, fileName } = await this.s3.getObject(doc.storageKey!);
      const buffer = await streamToBuffer(stream);
      const documentBase64 = buffer.toString('base64');
      const documentId = String(compositeEntries.length + 1);
      const fileExtension = fileName.split('.').pop() ?? 'pdf';

      const formCode = (doc.formCode
        || (doc.metadataJson as Record<string, unknown> | null)?.detectedFormCode as string
        || '').toUpperCase();

      let templateId = formCode ? manualTemplateMap.get(formCode) : undefined;

      if (!templateId && formCode) {
        const match = await this.findTemplateByFormCode(formCode);
        if (match) templateId = match.templateId;
      }

      if (templateId) {
        hasAnyTemplate = true;
        compositeEntries.push({
          serverTemplates: [{ sequence: documentId, templateId }],
          inlineTemplates: [{ sequence: documentId, recipients: { signers: recipients } }],
          document: { documentBase64, name: fileName, documentId, fileExtension },
        });
      } else {
        compositeEntries.push({
          inlineTemplates: [{ sequence: documentId, recipients: { signers: recipients } }],
          document: { documentBase64, name: fileName, documentId, fileExtension },
        });
      }
    }

    // ── Build envelope definition ────────────────────────────────────────
    let envelopeDefinition: Record<string, unknown>;
    const status = 'sent';

    if (hasAnyTemplate) {
      envelopeDefinition = {
        emailSubject,
        emailBlurb: opts.emailBody ?? undefined,
        status,
        compositeTemplates: compositeEntries,
      };
    } else {
      envelopeDefinition = {
        emailSubject,
        emailBlurb: opts.emailBody ?? undefined,
        status,
        documents: compositeEntries.map((e) => {
          const d = e.document as Record<string, unknown>;
          return { documentBase64: d.documentBase64, name: d.name, documentId: d.documentId, fileExtension: d.fileExtension };
        }),
        recipients: { signers: recipients },
      };
    }

    // ── Send via per-user or shared credentials ──────────────────────────
    let envelopeResponse: DocuSignEnvelopeResponse;

    if (userToken) {
      const url = `${userToken.baseUri}/restapi/v2.1/accounts/${userToken.docusignAccountId}/envelopes`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${userToken.accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(envelopeDefinition),
      });
      if (!res.ok) {
        const text = await res.text();
        this.logger.error(`DocuSign envelope creation failed (${res.status}): ${text}`);
        throw new Error(`Failed to create DocuSign envelope: ${text}`);
      }
      envelopeResponse = (await res.json()) as DocuSignEnvelopeResponse;
    } else {
      const url = await this.apiUrl('/envelopes');
      const headers = await this.authHeaders();
      const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(envelopeDefinition) });
      if (!res.ok) {
        const text = await res.text();
        this.logger.error(`DocuSign envelope creation failed (${res.status}): ${text}`);
        throw new Error(`Failed to create DocuSign envelope: ${text}`);
      }
      envelopeResponse = (await res.json()) as DocuSignEnvelopeResponse;
    }

    const responseSigners = envelopeResponse.recipients?.signers ?? [];
    this.logger.log(
      `DocuSign response signers: ${responseSigners.map((s) => `${s.name}(${s.roleName})`).join(', ')}`,
    );

    const mergedSigners = recipients.map((r) => {
      const match = responseSigners.find((rs) => rs.email.toLowerCase() === r.email.toLowerCase());
      return {
        name: r.name,
        email: r.email,
        recipientId: match?.recipientId ?? r.recipientId,
        roleName: match?.roleName ?? r.roleName,
      };
    });

    const signingUrls = await this.fetchSigningUrls(envelopeResponse.envelopeId, mergedSigners, userToken);

    const entity = this.envelopeRepo.create({
      transactionId: opts.transactionId,
      envelopeId: envelopeResponse.envelopeId,
      status: DocuSignEnvelopeStatus.SENT,
      subject: emailSubject,
      message: opts.emailBody ?? null,
      signers: mergedSigners,
      documentIds: opts.documentIds,
      envelopeUri: envelopeResponse.uri,
      signingUrls,
      sentAt: new Date(),
    });

    const saved = await this.envelopeRepo.save(entity);
    this.logger.log(
      `DocuSign envelope created: ${saved.envelopeId} tx=${opts.transactionId.slice(0, 8)}`,
    );

    return saved;
  }

  /**
   * The Seller Agent's "send everything to the Buyer for signature" flow —
   * a deliberately simplified sibling of createEnvelope: no per-form template
   * lookup, no field placement, no per-user connected-account fallback (this
   * is triggered from the public, no-login upload-link page, so there's never
   * an authenticated user to impersonate — always the shared/impersonated
   * credentials). All Buyers share one routingOrder (simultaneous signing —
   * nothing in the source requirement calls for sequential). The Buyer Agent
   * is added as a carbonCopy, DocuSign's inherently view-only recipient type —
   * never given any signHere/initialHere tabs, so "no signature/initial fields
   * for the Buyer Agent" holds by construction, not by a separate check.
   */
  async sendSellerDocumentsToBuyer(opts: SendSellerDocumentsOptions): Promise<DocuSignEnvelopeEntity> {
    const tx = await this.txRepo.findOne({ where: { id: opts.transactionId } });
    if (!tx) throw new NotFoundException('Transaction not found');

    const docs = await this.docRepo.find({ where: { id: In(opts.documentIds) } });
    if (docs.length === 0) throw new NotFoundException('No documents found');

    const docsById = new Map(docs.filter((d) => d.storageKey).map((d) => [d.id, d]));
    // Preserve the caller's intended order — docRepo.find(In(...)) does not guarantee it.
    const orderedDocs = opts.documentIds
      .map((id) => docsById.get(id))
      .filter((d): d is TransactionDocumentEntity => !!d);
    if (orderedDocs.length === 0) {
      throw new NotFoundException('None of the selected documents have a stored PDF file');
    }

    const propertyAddress = formatAddress(tx);
    const emailSubject = opts.emailSubject ?? `Signature Request – ${propertyAddress}`;

    const signers = opts.buyers.map((b, i) => ({
      email: b.email,
      name: b.name,
      recipientId: String(i + 1),
      routingOrder: '1',
      roleName: 'signer',
    }));
    const carbonCopies = [{
      email: opts.buyerAgent.email,
      name: opts.buyerAgent.name,
      recipientId: String(signers.length + 1),
      routingOrder: '1',
    }];

    const compositeEntries: Array<Record<string, unknown>> = [];
    for (const doc of orderedDocs) {
      const { stream, fileName } = await this.s3.getObject(doc.storageKey!);
      const buffer = await streamToBuffer(stream);
      const documentBase64 = buffer.toString('base64');
      const documentId = String(compositeEntries.length + 1);
      const fileExtension = fileName.split('.').pop() ?? 'pdf';

      compositeEntries.push({
        inlineTemplates: [{
          sequence: documentId,
          recipients: { signers, carbonCopies },
        }],
        document: { documentBase64, name: fileName, documentId, fileExtension },
      });
    }

    const envelopeDefinition: Record<string, unknown> = {
      emailSubject,
      emailBlurb: opts.emailBody ?? undefined,
      status: 'sent',
      compositeTemplates: compositeEntries,
    };

    const url = await this.apiUrl('/envelopes');
    const headers = await this.authHeaders();
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(envelopeDefinition) });
    if (!res.ok) {
      const text = await res.text();
      this.logger.error(`DocuSign envelope creation failed (${res.status}): ${text}`);
      throw new Error(`Failed to create DocuSign envelope: ${text}`);
    }
    const envelopeResponse = (await res.json()) as DocuSignEnvelopeResponse;

    const responseSigners = envelopeResponse.recipients?.signers ?? [];
    const mergedSigners = signers.map((r) => {
      const match = responseSigners.find((rs) => rs.email.toLowerCase() === r.email.toLowerCase());
      return {
        name: r.name,
        email: r.email,
        recipientId: match?.recipientId ?? r.recipientId,
        roleName: match?.roleName ?? r.roleName,
      };
    });

    const signingUrls = await this.fetchSigningUrls(envelopeResponse.envelopeId, mergedSigners, null);

    const entity = this.envelopeRepo.create({
      transactionId: opts.transactionId,
      envelopeId: envelopeResponse.envelopeId,
      status: DocuSignEnvelopeStatus.SENT,
      subject: emailSubject,
      message: opts.emailBody ?? null,
      signers: mergedSigners,
      ccRecipients: carbonCopies.map((c) => ({ name: c.name, email: c.email, recipientId: c.recipientId })),
      documentIds: orderedDocs.map((d) => d.id),
      uploadLinkId: opts.uploadLinkId,
      envelopeUri: envelopeResponse.uri,
      signingUrls,
      sentAt: new Date(),
    });

    const saved = await this.envelopeRepo.save(entity);
    this.logger.log(
      `Seller-to-buyer DocuSign envelope created: ${saved.envelopeId} tx=${opts.transactionId.slice(0, 8)} link=${opts.uploadLinkId.slice(0, 8)}`,
    );

    return saved;
  }

  // ── Status sync ──────────────────────────────────────────────────────────

  async syncEnvelopeStatus(envelopeRowId: string): Promise<DocuSignEnvelopeEntity | null> {
    const env = await this.envelopeRepo.findOne({ where: { id: envelopeRowId } });
    if (!env || !env.envelopeId) return null;

    try {
      const url = await this.apiUrl(`/envelopes/${env.envelopeId}`);
      const headers = await this.authHeaders();

      const res = await fetch(url, { headers });

      if (!res.ok) {
        this.logger.warn(`DocuSign status sync failed for ${env.envelopeId}: ${res.status}`);
        return null;
      }

      const data = (await res.json()) as DocuSignEnvelopeResponse & {
        completedDateTime?: string;
        declinedDateTime?: string;
        voidedDateTime?: string;
        deliveredDateTime?: string;
      };

      const mapped = this.mapStatus(data.status ?? 'created');
      env.status = mapped;
      env.lastStatusCheckedAt = new Date();

      if (data.completedDateTime) env.completedAt = new Date(data.completedDateTime);
      if (data.deliveredDateTime) env.deliveredAt = new Date(data.deliveredDateTime);
      if (data.declinedDateTime || data.voidedDateTime) env.completedAt = null;

      // Update per-signer status
      if (data.recipients?.signers && env.signers) {
        const signerStatusMap = new Map(
          data.recipients.signers.map((s) => [s.email, s]),
        );
        env.signers = env.signers.map((r) => {
          const remote = signerStatusMap.get(r.email);
          if (remote) {
            return { ...r, recipientId: remote.recipientId, status: remote.status };
          }
          return r;
        });
      }

      // Post-completion: download signed PDF and save as new version. The
      // completedProcessedAt check here is just an early-out (avoids the
      // work below entirely once we already know it's done) — the real
      // idempotency barrier is the atomic DB claim inside processCompletedEnvelope,
      // which is what actually protects against this same envelope being
      // observed COMPLETED by two concurrent callers (cron + manual + the
      // DocuSign Connect webhook, two Fly machines, retries) before any of
      // them has set completedProcessedAt.
      if (mapped === DocuSignEnvelopeStatus.COMPLETED && env.documentIds?.length && !env.completedProcessedAt) {
        await this.processCompletedEnvelope(env.id).catch((err) => {
          this.logger.error(`Post-completion handling failed for envelope ${env.envelopeId}: ${(err as Error).message}`);
        });
        // processCompletedEnvelope re-fetches its own envelope row rather than
        // mutating the one held here — refresh completedProcessedAt from the
        // DB so the blanket save below doesn't clobber a just-set claim (on
        // success) or a just-cleared one (on a retry-eligible failure) back
        // to whatever this stale in-memory copy happened to hold.
        const current = await this.envelopeRepo.findOne({ where: { id: env.id } });
        env.completedProcessedAt = current?.completedProcessedAt ?? null;
      }

      this.logger.log(`DocuSign envelope ${env.envelopeId} status: ${mapped}`);
      return this.envelopeRepo.save(env);
    } catch (err) {
      this.logger.error(`DocuSign status sync error for ${env.envelopeId}: ${err}`);
      return null;
    }
  }

  async syncAllForTransaction(transactionId: string): Promise<DocuSignEnvelopeEntity[]> {
    // Sync envelopes that are in-flight OR completed but need post-processing
    const envs = await this.envelopeRepo.find({
      where: { transactionId, status: In(['created', 'sent', 'delivered', 'completed']) },
    });
    const results: DocuSignEnvelopeEntity[] = [];
    for (const env of envs) {
      const updated = await this.syncEnvelopeStatus(env.id);
      if (updated) results.push(updated);
    }
    return results;
  }

  /**
   * Periodically sync all non-terminal DocuSign envelopes across all transactions.
   * Fetches completed signed PDFs and marks documents as signed.
   */
  @Cron('0 */5 * * * *')
  async handleScheduledSync(): Promise<void> {
    this.logger.log('Scheduled DocuSign envelope sync started');
    try {
      const envs = await this.envelopeRepo.find({
        where: { status: In(['created', 'sent', 'delivered', 'completed']) },
        order: { createdAt: 'ASC' },
        take: 50,
      });
      let synced = 0;
      for (const env of envs) {
        try {
          await this.syncEnvelopeStatus(env.id);
          synced++;
        } catch (err) {
          this.logger.warn(`Scheduled sync failed for envelope ${env.envelopeId}: ${(err as Error).message}`);
        }
      }
      this.logger.log(`Scheduled DocuSign sync complete: ${synced}/${envs.length} envelopes processed`);
    } catch (err) {
      this.logger.error(`Scheduled DocuSign sync failed: ${(err as Error).message}`);
    }
  }

  // ── Queries ──────────────────────────────────────────────────────────────

  async getEnvelopesForTransaction(transactionId: string): Promise<DocuSignEnvelopeEntity[]> {
    return this.envelopeRepo.find({
      where: { transactionId },
      order: { createdAt: 'DESC' },
    });
  }

  async getEnvelopeById(id: string): Promise<DocuSignEnvelopeEntity | null> {
    return this.envelopeRepo.findOne({ where: { id } });
  }

  // ── Private: signing URLs ────────────────────────────────────────────────

  private async fetchSigningUrls(
    envelopeId: string,
    recipients: Array<{ name: string; email: string; recipientId: string }>,
    userToken?: { accessToken: string; baseUri: string; docusignAccountId: string } | null,
  ): Promise<Array<{ name: string; email: string; signing_url: string }> | null> {
    try {
      let url: string;
      let headers: Record<string, string>;

      if (userToken) {
        url = `${userToken.baseUri}/restapi/v2.1/accounts/${userToken.docusignAccountId}/envelopes/${envelopeId}/views/recipient`;
        headers = { Authorization: `Bearer ${userToken.accessToken}`, 'Content-Type': 'application/json' };
      } else {
        url = await this.apiUrl(`/envelopes/${envelopeId}/views/recipient`);
        headers = await this.authHeaders();
      }

      const results: Array<{ name: string; email: string; signing_url: string }> = [];

      for (const r of recipients) {
        const body = {
          returnUrl: process.env.WEB_APP_URL ?? 'http://localhost:3001',
          authenticationMethod: 'email',
          email: r.email,
          userName: r.name,
          recipientId: r.recipientId,
        };

        const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });

        if (res.ok) {
          const data = (await res.json()) as { url: string };
          results.push({ name: r.name, email: r.email, signing_url: data.url });
        } else {
          this.logger.warn(`Failed to fetch signing URL for recipient ${r.email} in envelope ${envelopeId}`);
        }
      }

      return results.length > 0 ? results : null;
    } catch (err) {
      this.logger.warn(`Error fetching signing URLs for envelope ${envelopeId}: ${err}`);
      return null;
    }
  }

  // ── Private: post-completion handling ────────────────────────────────────

  /** Postgres unique_violation — used to detect a lost race on the signed-row partial unique index. */
  private isUniqueViolation(err: unknown): boolean {
    return (err as { code?: string } | null)?.code === '23505';
  }

  /**
   * Best-effort per-document signed PDF resolution. DocuSign document names
   * are set at envelope-creation time from the ORIGINAL document's own
   * fileName (see the `document: { name: fileName, ... }` calls above), so a
   * document whose fileName is unique within this envelope can be matched
   * back to its own individual signed PDF via GET /envelopes/{id}/documents.
   * Anything ambiguous (duplicate fileName, no match, fetch failure) is
   * simply absent from the returned map — callers fall back to the combined
   * bundle for those documents.
   */
  private async buildPerDocumentSignedPdfMap(
    env: DocuSignEnvelopeEntity,
    headers: Record<string, string>,
  ): Promise<Map<string, { buffer: Buffer; fileName: string }>> {
    const result = new Map<string, { buffer: Buffer; fileName: string }>();
    if (!env.envelopeId || !env.documentIds?.length) return result;

    try {
      const listUrl = await this.apiUrl(`/envelopes/${env.envelopeId}/documents`);
      const listRes = await fetch(listUrl, { headers });
      if (!listRes.ok) return result;

      const data = (await listRes.json()) as { envelopeDocuments?: Array<{ documentId: string; name: string; type?: string }> };
      const docusignDocs = (data.envelopeDocuments ?? []).filter((d) => d.type !== 'summary' && d.type !== 'content_metadata');

      const originalDocs = await this.docRepo.find({ where: { id: In(env.documentIds) } });
      const fileNameCounts = new Map<string, number>();
      for (const d of originalDocs) {
        if (d.fileName) fileNameCounts.set(d.fileName, (fileNameCounts.get(d.fileName) ?? 0) + 1);
      }

      for (const original of originalDocs) {
        if (!original.fileName || (fileNameCounts.get(original.fileName) ?? 0) > 1) continue; // no name, or ambiguous within this envelope
        const match = docusignDocs.find((d) => d.name === original.fileName);
        if (!match) continue;

        const docUrl = await this.apiUrl(`/envelopes/${env.envelopeId}/documents/${match.documentId}`);
        const docRes = await fetch(docUrl, { headers });
        if (!docRes.ok) continue;

        result.set(original.id, { buffer: Buffer.from(await docRes.arrayBuffer()), fileName: original.fileName });
      }
    } catch (err) {
      this.logger.warn(`Failed to build per-document signed PDF mapping for envelope ${env.envelopeId}: ${(err as Error).message}`);
    }

    return result;
  }

  /** Downloads the DocuSign certificate of completion and stores it in S3 once per envelope — never a hard failure, since it's supplementary to the signed PDF itself. */
  private async downloadAndStoreCertificate(env: DocuSignEnvelopeEntity, headers: Record<string, string>): Promise<string | null> {
    if (!env.envelopeId || !env.documentIds?.length) return null;
    try {
      const url = await this.apiUrl(`/envelopes/${env.envelopeId}/documents/certificate`);
      const res = await fetch(url, { headers });
      if (!res.ok) {
        this.logger.warn(`Failed to download certificate of completion for envelope ${env.envelopeId}: ${res.status}`);
        return null;
      }

      const buffer = Buffer.from(await res.arrayBuffer());
      // Every document in one envelope shares the same transaction — the first is representative for the S3 key's transaction/stage segment.
      const firstDoc = await this.docRepo.findOne({ where: { id: env.documentIds[0] } });
      if (!firstDoc) return null;

      const { storageKey } = await this.s3.upload(
        firstDoc.transactionId,
        firstDoc.stage ?? 'closing',
        `certificate-${env.envelopeId}.pdf`,
        buffer,
        'application/pdf',
      );
      return storageKey;
    } catch (err) {
      this.logger.warn(`Error downloading certificate of completion for envelope ${env.envelopeId}: ${(err as Error).message}`);
      return null;
    }
  }

  /**
   * When a DocuSign envelope is completed, download the signed PDF(s) from
   * DocuSign, save them as a new document version in S3, and update the
   * original document status. Preserves the original unsigned document and
   * its full version history for audit. Called from syncEnvelopeStatus (cron
   * and manual sync routes) and directly from the DocuSign Connect webhook
   * controller — the atomic claim below makes either caller (or both, racing)
   * safe.
   *
   * Idempotency is enforced at three layers, from cheapest/earliest to
   * strongest/final:
   *   1. The atomic claim below (`completedProcessedAt IS NULL` UPDATE) — the
   *      real barrier. Only one caller across any number of concurrent syncs
   *      (cron, manual, webhook, multiple Fly machines) ever proceeds past it
   *      for a given envelope.
   *   2. A per-document existing-signed-row check before doing any work.
   *   3. The `previous_version_id` partial unique index (signed rows only) —
   *      the database's final word, in case #1/#2 are ever bypassed (e.g. two
   *      different envelopes referencing the same original document).
   *
   * Retry safety: the claim is only ever left set when this run actually
   * finished its work (whether or not any individual document failed to
   * resolve/upload/persist). A hard failure — the combined-PDF download
   * itself failing, an S3 upload throwing, or a persistence error that isn't
   * a benign lost-race unique violation — clears completedProcessedAt back to
   * null before returning, so the next cron tick or webhook retry picks the
   * envelope back up. Documents that DID succeed are never redone on that
   * retry — the per-document existing-signed-row check (#2 above) skips them.
   *
   * Returns the original document ids whose signed version was newly
   * persisted this run — callers (e.g. tests) can use this to know exactly
   * what to expect a signed-document notification for, though the
   * notification itself is fired from inside this method, per document, as
   * soon as its own persistence commits.
   */
  async processCompletedEnvelope(envelopeRowId: string): Promise<{ savedDocumentIds: string[] }> {
    const env = await this.envelopeRepo.findOne({ where: { id: envelopeRowId } });
    if (!env || !env.envelopeId || !env.documentIds?.length) return { savedDocumentIds: [] };

    const claimTime = new Date();
    const claimResult = await this.envelopeRepo
      .createQueryBuilder()
      .update(DocuSignEnvelopeEntity)
      .set({ completedProcessedAt: claimTime })
      .where('id = :id AND "completedProcessedAt" IS NULL', { id: env.id })
      .execute();

    if ((claimResult.affected ?? 0) === 0) {
      this.logger.log(`Envelope ${env.envelopeId} completion already claimed/processed elsewhere — skipping`);
      return { savedDocumentIds: [] };
    }
    env.completedProcessedAt = claimTime;

    this.logger.log(`Handling post-completion for envelope ${env.envelopeId} (${env.documentIds.length} docs)`);

    const savedDocumentIds: string[] = [];
    let hadFailure = false;

    try {
      // Download the combined signed PDF from DocuSign — the fallback used
      // whenever a per-document signed PDF can't be unambiguously resolved.
      const url = await this.apiUrl(`/envelopes/${env.envelopeId}/documents/combined`);
      const headers = await this.authHeaders();
      const res = await fetch(url, { headers });
      if (!res.ok) {
        this.logger.warn(`Failed to download signed PDF for envelope ${env.envelopeId}: ${res.status} — will retry`);
        hadFailure = true;
      } else {
        const combinedBuffer = Buffer.from(await res.arrayBuffer());
        const contentDisposition = res.headers.get('content-disposition') ?? '';
        const fileNameMatch = contentDisposition.match(/filename="?(.+?)"?$/);
        const combinedFileName = fileNameMatch?.[1] ?? `signed-${env.envelopeId}.pdf`;

        const perDocumentMap = await this.buildPerDocumentSignedPdfMap(env, headers);
        const certificateStorageKey = await this.downloadAndStoreCertificate(env, headers);

        // For each original document, save its signed PDF as a new version
        for (const docId of env.documentIds) {
          const originalDoc = await this.docRepo.findOne({ where: { id: docId } });
          if (!originalDoc) {
            this.logger.warn(`Original document ${docId} not found for post-completion (envelope ${env.envelopeId})`);
            continue;
          }

          // A document id from another transaction must never be promoted here —
          // this is the enforcement point for "documents from one transaction
          // can never replace documents in another transaction."
          if (originalDoc.transactionId !== env.transactionId) {
            this.logger.warn(
              `Document ${docId} belongs to transaction ${originalDoc.transactionId}, not envelope ${env.envelopeId}'s transaction ${env.transactionId} — skipping to prevent cross-transaction promotion`,
            );
            continue;
          }

          const existingSigned = await this.docRepo.findOne({
            where: { previousVersionId: originalDoc.id, status: DocumentStatus.SIGNED },
          });
          if (existingSigned) {
            this.logger.log(`Signed version of document ${docId.slice(0, 8)} already exists — skipping duplicate`);
            continue;
          }

          const perDoc = perDocumentMap.get(originalDoc.id);
          const signedPdfBuffer = perDoc?.buffer ?? combinedBuffer;
          const signedFileName = perDoc?.fileName ?? combinedFileName;

          // Re-run buyer-side compliance validation against the ACTUAL signed
          // bytes — the whole point of this step, since a document that now
          // carries the Buyer's real signature must be checked against that
          // signature, not against whatever the pre-signature analysis found.
          // Only ever run against `perDoc`'s own isolated buffer: the combined
          // multi-document fallback can't be attributed to this one document,
          // and running the pipeline against it would silently misapply
          // another document's content to this one's compliance result. No
          // `uploadSource` is passed — this is deliberately the same default,
          // full (never seller_agent-suppressed) validator set every directly
          // Buyer-Agent-uploaded document gets, since the checklist item this
          // feeds is the Buyer Agent's own.
          let signedPipelineResult: Awaited<ReturnType<typeof this.documentPipeline.process>> | null = null;
          if (perDoc) {
            try {
              signedPipelineResult = await this.documentPipeline.process(perDoc.buffer);
            } catch (err) {
              this.logger.warn(
                `Buyer-side compliance re-validation failed for signed document ${docId.slice(0, 8)} (envelope ${env.envelopeId}): ${(err as Error).message} — signed document will be saved without a fresh compliance result`,
              );
            }
          } else {
            this.logger.warn(
              `No isolated signed PDF could be resolved for document ${docId.slice(0, 8)} (envelope ${env.envelopeId}) — skipping compliance re-validation to avoid attributing another document's content; falling back to the pre-signature analysis result`,
            );
          }

          // Upload signed PDF to S3 outside the DB transaction below — an
          // idempotent, non-transactional side effect; a lost race just leaves
          // one harmless orphaned S3 object, never a duplicate document row.
          let storageKey: string;
          try {
            ({ storageKey } = await this.s3.upload(
              originalDoc.transactionId,
              originalDoc.stage ?? 'closing',
              `${originalDoc.formCode ?? originalDoc.documentType ?? 'signed'}-signed.pdf`,
              signedPdfBuffer,
              'application/pdf',
            ));
          } catch (err) {
            this.logger.error(`S3 upload failed for signed document ${docId.slice(0, 8)} (envelope ${env.envelopeId}): ${(err as Error).message} — will retry`);
            hadFailure = true;
            continue;
          }

          let newVersionId: string | undefined;
          try {
            await this.docRepo.manager.transaction(async (manager) => {
              // Re-check inside the transaction to close the race window between
              // the check above and this insert — the partial unique index is
              // still the final word if this also loses a race.
              const dup = await manager.findOne(TransactionDocumentEntity, {
                where: { previousVersionId: originalDoc.id, status: DocumentStatus.SIGNED },
              });
              if (dup) return;

              // The Verification of Property gets a fixed, human-readable label
              // instead of the generic "${originalDoc.title} (Signed)" pattern —
              // its original title/fileName is whatever the Buyer Agent's
              // uploaded file was called, which would otherwise leak through to
              // Escrow's document list as an unrecognizable filename instead of
              // the clearly-labeled "Signed Verification of Property" this
              // document is surfaced as (see canExternalUserSeeDocument's VP
              // exception in document-visibility.util.ts).
              const isSignedVp = originalDoc.formCode === 'VP';

              const newVersion = manager.create(TransactionDocumentEntity, {
                transactionId: originalDoc.transactionId,
                stage: originalDoc.stage ?? undefined,
                documentType: originalDoc.documentType,
                title: isSignedVp ? 'Signed Verification of Property' : `${originalDoc.title} (Signed)`,
                fileName: isSignedVp ? 'Signed Verification of Property.pdf' : signedFileName,
                mimeType: 'application/pdf',
                storageKey,
                storageUrl: null,
                status: DocumentStatus.SIGNED,
                versionNo: originalDoc.versionNo + 1,
                previousVersionId: originalDoc.id,
                formCode: originalDoc.formCode ?? undefined,
                sourceDocumentId: originalDoc.sourceDocumentId ?? undefined,
                sourcePageStart: originalDoc.sourcePageStart ?? undefined,
                sourcePageEnd: originalDoc.sourcePageEnd ?? undefined,
                isOriginalPackage: false,
                uploadedByAccountId: originalDoc.uploadedByAccountId ?? undefined,
                // Preserved provenance — without these, the signed version drops
                // out of the secure upload-link list, workflow-step scoping, and
                // submission-round grouping that the original document had.
                uploadLinkId: originalDoc.uploadLinkId ?? undefined,
                submissionId: originalDoc.submissionId ?? undefined,
                requestedFromPartyId: originalDoc.requestedFromPartyId ?? undefined,
                workflowStepId: originalDoc.workflowStepId ?? undefined,
                aiInteractionId: originalDoc.aiInteractionId ?? undefined,
                dueAt: originalDoc.dueAt ?? undefined,
                signedAt: env.completedAt ?? new Date(),
                docusignEnvelopeId: env.envelopeId,
                // A signed row must remain matchable against the Buyer Agent's
                // (and Seller Agent's) required-document checklist exactly like
                // any other document — matchDocumentsToChecklist gates on
                // `analysisStatus === 'completed'`. Falling back to the
                // original's own analysisStatus (rather than leaving this
                // null) is what keeps the checklist item from silently
                // reverting to "required" the moment the document is signed.
                analysisStatus: signedPipelineResult ? 'completed' : (originalDoc.analysisStatus ?? 'completed'),
                analyzedAt: signedPipelineResult ? new Date() : originalDoc.analyzedAt ?? undefined,
                metadataJson: {
                  ...(originalDoc.metadataJson ?? {}),
                  ...(signedPipelineResult ? {
                    extraction: signedPipelineResult.extraction,
                    compliance: signedPipelineResult.compliance,
                    detectedFormCode: signedPipelineResult.detectedFormCode,
                    detectedFormName: signedPipelineResult.detectedFormName,
                  } : {}),
                  docusignCompleted: true,
                  docusignEnvelopeId: env.envelopeId,
                  docusignCompletedAt: env.completedAt?.toISOString(),
                  signedBy: env.signers?.map((s) => ({ name: s.name, email: s.email, status: (s as { status?: string }).status })),
                  previousVersionId: originalDoc.id,
                  ...(certificateStorageKey ? { docusignCertificateStorageKey: certificateStorageKey } : {}),
                },
              } as Partial<TransactionDocumentEntity>);

              await manager.save(TransactionDocumentEntity, newVersion);

              // Mark original as superseded by the signed version — never deleted, full version chain preserved.
              originalDoc.status = DocumentStatus.SUPERSEDED;
              await manager.save(TransactionDocumentEntity, originalDoc);

              newVersionId = newVersion.id;
              this.logger.log(`Post-completion: saved signed version of doc ${docId.slice(0, 8)} (v${newVersion.versionNo})`);
            });
          } catch (err) {
            if (this.isUniqueViolation(err)) {
              this.logger.log(`Lost the race creating a signed version of document ${docId.slice(0, 8)} — another process already created it`);
              continue;
            }
            this.logger.error(`Failed to persist signed version of document ${docId.slice(0, 8)} (envelope ${env.envelopeId}): ${(err as Error).message} — will retry`);
            hadFailure = true;
            continue;
          }

          // Only a document whose signed row was actually just created here
          // (not skipped as a duplicate, not lost to a race) counts as
          // "saved" — this is what gates the signed-document notification.
          savedDocumentIds.push(originalDoc.id);
          this.signedDocumentNotification.notifyDocumentSigned({
            transactionId: originalDoc.transactionId,
            documentId: newVersionId ?? originalDoc.id,
            documentName: originalDoc.title,
            formCode: originalDoc.formCode ?? null,
            docusignEnvelopeId: env.envelopeId,
            completedAt: env.completedAt ?? new Date(),
          }).catch((err) => {
            this.logger.error(`Signed-document notification failed for doc ${docId.slice(0, 8)} (envelope ${env.envelopeId}): ${(err as Error).message}`);
          });

          if (originalDoc.formCode === 'VP') {
            const finalDocumentId = newVersionId ?? originalDoc.id;
            this.txRepo
              .findOne({
                where: { id: originalDoc.transactionId },
                relations: ['createdByAccount', 'createdByAccount.user'],
              })
              .then((tx) => {
                if (!tx) return;
                return this.vpSignedEscrowNotification.notifyEscrowOfSignedVp(tx, finalDocumentId);
              })
              .catch((err) => {
                this.logger.error(`Signed-VP escrow notification failed for doc ${docId.slice(0, 8)} (envelope ${env.envelopeId}): ${(err as Error).message}`);
              });
          }
        }
      }
    } catch (err) {
      this.logger.error(`Post-completion error for envelope ${env.envelopeId}: ${(err as Error).message} — will retry`);
      hadFailure = true;
    }

    if (hadFailure) {
      await this.envelopeRepo.update(env.id, { completedProcessedAt: null });
      env.completedProcessedAt = null;
    }

    return { savedDocumentIds };
  }

  // ── Private: status mapping ──────────────────────────────────────────────

  private mapStatus(docusignStatus: string): string {
    const map: Record<string, string> = {
      created: DocuSignEnvelopeStatus.CREATED,
      sent: DocuSignEnvelopeStatus.SENT,
      delivered: DocuSignEnvelopeStatus.DELIVERED,
      completed: DocuSignEnvelopeStatus.COMPLETED,
      declined: DocuSignEnvelopeStatus.DECLINED,
      voided: DocuSignEnvelopeStatus.VOIDED,
    };
    return map[docusignStatus] ?? docusignStatus;
  }
}
