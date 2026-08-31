import { Controller, Post, Get, Delete, Patch, Logger, HttpCode, HttpStatus, Body, Param, Query, Req, Res } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Request } from 'express';
import { DocuSignService, CreateEnvelopeOptions } from './docusign.service';
import { DocuSignOAuthService } from './docusign-oauth.service';
import { AccountsService } from '../accounts/accounts.service';
import { TransactionDocumentEntity } from '../transaction-documents/entities/transaction-document.entity';
import { FieldAnalysisService } from './field-analysis.service';
import { SharedCoordinatesService } from './shared-coordinates.service';
import { PdfRenderService } from './pdf-render.service';
import { S3StorageService } from '../storage/s3-storage.service';
import type { CreateEnvelopeWithFieldsRequest, EnvelopeFieldPlacement } from './field-analysis.types';
import { Public } from '../auth/decorators/public.decorator';

@Controller(['docusign', 'integrations/docusign', 'api/integrations/docusign'])
export class DocuSignController {
  private readonly logger = new Logger(DocuSignController.name);

  constructor(
    private readonly docusignService: DocuSignService,
    private readonly oauthService: DocuSignOAuthService,
    private readonly accountsService: AccountsService,
    private readonly fieldAnalysisService: FieldAnalysisService,
    private readonly sharedCoords: SharedCoordinatesService,
    private readonly s3: S3StorageService,
    private readonly pdfRender: PdfRenderService,
    @InjectRepository(TransactionDocumentEntity)
    private readonly docRepo: Repository<TransactionDocumentEntity>,
  ) {}

  @Post('envelopes')
  @HttpCode(HttpStatus.CREATED)
  async createEnvelope(
    @Req() req: Request,
    @Body() body: CreateEnvelopeOptions,
  ) {
    const userId = (req.user as { userId?: string })?.userId;
    let accountId: string | undefined;
    if (userId) {
      const account = await this.accountsService.findByUserId(userId);
      accountId = account?.id;
    }
    return this.docusignService.createEnvelope({ ...body, userId: accountId });
  }

  @Get('envelopes/:id/sync')
  async syncEnvelope(@Param('id') id: string) {
    return this.docusignService.syncEnvelopeStatus(id);
  }

  @Post('transactions/:transactionId/sync')
  @HttpCode(HttpStatus.OK)
  async syncTransaction(@Param('transactionId') transactionId: string) {
    return this.docusignService.syncAllForTransaction(transactionId);
  }

  @Get('envelopes')
  async listEnvelopes(@Query('transactionId') transactionId: string) {
    if (!transactionId) return [];
    return this.docusignService.getEnvelopesForTransaction(transactionId);
  }

  // ── Field Analysis & Smart Envelope Creation ─────────────────────────────

  @Post('analyze-documents')
  async analyzeDocuments(
    @Body() body: { transactionId: string; documentIds: string[] },
  ) {
    return this.fieldAnalysisService.analyzeDocuments(body.transactionId, body.documentIds);
  }

  @Post('envelopes/with-fields')
  @HttpCode(HttpStatus.CREATED)
  async createEnvelopeWithFields(
    @Req() req: Request,
    @Body() body: CreateEnvelopeWithFieldsRequest,
  ) {
    const userId = (req.user as { userId?: string })?.userId;
    let accountId: string | undefined;
    if (userId) {
      const account = await this.accountsService.findByUserId(userId);
      accountId = account?.id;
    }

    // Re-analyze to get the latest field counts for cross-verification
    const reanalysis = await this.fieldAnalysisService.analyzeDocuments(
      body.transactionId,
      body.documentIds,
    );

    // Count fields from analysis (only selected documents)
    let analysisFieldCount = 0;
    const analysisFields: Array<{ id: string; label: string; confidence: 'high' | 'medium' | 'low'; pageNumber: number; xPosition: number; yPosition: number }> = [];
    for (const docAnalysis of reanalysis.analyses) {
      for (const field of docAnalysis.fields) {
        analysisFields.push({
          id: field.id,
          label: field.label,
          confidence: field.confidence,
          pageNumber: field.pageNumber,
          xPosition: field.xPosition,
          yPosition: field.yPosition,
        });
      }
      analysisFieldCount += docAnalysis.fields.length;
    }

    // Count tabs from the request payload
    let tabCount = 0;
    for (const placement of body.fieldPlacements) {
      for (const tabList of Object.values(placement.tabs)) {
        tabCount += tabList.length;
      }
    }

    if (analysisFieldCount > 0 && tabCount !== analysisFieldCount) {
      this.logger.error(
        `Tab count mismatch: analysis reports ${analysisFieldCount} missing fields for documents [${body.documentIds.join(', ')}], ` +
        `but only ${tabCount} tabs were submitted. ${analysisFieldCount - tabCount} fields were dropped.`,
      );

      const analysisIds = new Set(analysisFields.map((f) => f.label));
      const tabLabels = new Set<string>();
      for (const placement of body.fieldPlacements) {
        for (const tabList of Object.values(placement.tabs)) {
          for (const tab of tabList) {
            tabLabels.add((tab as Record<string, unknown>).tabLabel as string || '');
          }
        }
      }

      const missing = [...analysisIds].filter((l) => !tabLabels.has(l));
      const extra = [...tabLabels].filter((l) => !analysisIds.has(l));

      let detail = `Analysis found ${analysisFieldCount} fields but only ${tabCount} tabs were submitted.`;
      if (missing.length > 0) detail += ` Missing tabs: ${missing.join('; ')}.`;
      if (extra.length > 0) detail += ` Unexpected tabs: ${extra.join('; ')}.`;

      throw new Error(detail);
    }

    // Validate field placements
    const validation = await this.fieldAnalysisService.validateFieldPlacement(
      accountId,
      body.fieldPlacements,
      analysisFields,
    );

    if (!validation.valid) {
      const messages = validation.issues.map((i) => i.kind === 'no_connected_account'
        ? (i as any).message
        : `${(i as any).fieldLabel}: ${i.kind.replace(/_/g, ' ')}`,
      );
      throw new Error(`Validation failed: ${messages.join('; ')}`);
    }

    const tabsPerDocument: Array<{ documentId: string; tabs: Record<string, unknown[]> }> = body.fieldPlacements.map((p) => ({
      documentId: p.documentId,
      tabs: p.tabs,
    }));

    return this.docusignService.createEnvelopeWithFields({
      transactionId: body.transactionId,
      documentIds: body.documentIds,
      signers: body.signers,
      tabsPerDocument,
      emailSubject: body.emailSubject,
      emailBody: body.emailBody,
      userId: accountId,
    });
  }

  @Post('envelopes/preview')
  async previewEnvelope(
    @Req() req: Request,
    @Body() body: CreateEnvelopeWithFieldsRequest,
  ) {
    const userId = (req.user as { userId?: string })?.userId;
    let accountId: string | undefined;
    if (userId) {
      const account = await this.accountsService.findByUserId(userId);
      accountId = account?.id;
    }

    const allFieldsPreview: Array<{ id: string; label: string; confidence: 'high' | 'medium' | 'low'; pageNumber: number; xPosition: number; yPosition: number }> = [];
    for (const placement of body.fieldPlacements) {
      for (const tabList of Object.values(placement.tabs)) {
        for (const tab of tabList) {
          const t = tab as Record<string, unknown>;
          allFieldsPreview.push({
            id: (t.tabLabel as string) || '',
            label: (t.tabLabel as string) || '',
            confidence: 'high' as const,
            pageNumber: parseInt((t.pageNumber as string) || '1', 10),
            xPosition: parseFloat((t.xPosition as string) || '0'),
            yPosition: parseFloat((t.yPosition as string) || '0'),
          });
        }
      }
    }

    const validation = await this.fieldAnalysisService.validateFieldPlacement(
      accountId,
      body.fieldPlacements,
      allFieldsPreview,
    );

    // Build preview response with per-recipient tab summaries
    const recipients = body.signers.map((s, i) => {
      const recipientTabs: unknown[] = [];
      for (const placement of body.fieldPlacements) {
        for (const tabList of Object.values(placement.tabs)) {
          for (const tab of tabList) {
            const t = tab as Record<string, unknown>;
            if (String(t.recipientId) === String(i + 1)) {
              recipientTabs.push({
                tabType: t.tabType || 'unknown',
                tabLabel: t.tabLabel || '',
                pageNumber: t.pageNumber || '1',
                xPosition: t.xPosition || '0',
                yPosition: t.yPosition || '0',
                documentId: placement.documentId,
              });
            }
          }
        }
      }
      return {
        recipientId: String(i + 1),
        name: s.name,
        email: s.email,
        role: s.role,
        tabCount: recipientTabs.length,
        tabs: recipientTabs,
      };
    });

    return {
      recipients,
      documentCount: body.documentIds.length,
      totalTabs: body.fieldPlacements.reduce((s, p) => s + Object.values(p.tabs).reduce((a, t) => a + t.length, 0), 0),
      validation: {
        valid: validation.valid,
        issues: validation.issues.map((i) => ({
          field: (i as any).fieldLabel ?? (i as any).fieldId ?? '',
          message: i.kind === 'no_connected_account'
            ? (i as any).message
            : i.kind.replace(/_/g, ' '),
        })),
      },
    };
  }

  // ── User DocuSign Connection ────────────────────────────────────────────

  @Get('connect')
  async getConnectUrl(@Req() req: Request) {
    const userId = (req.user as { userId?: string })?.userId;
    if (!userId) throw new Error('Not authenticated');
    const account = await this.accountsService.findByUserId(userId);
    const accountId = account?.id ?? userId;
    const result = this.oauthService.getAuthorizationUrl(accountId);
    return { url: result.url };
  }

  @Public()
  @Get('callback')
  async handleCallback(@Query('code') code: string, @Query('state') state: string, @Res() res: any) {
    await this.oauthService.handleCallback(code, state);
    res.send(`
      <!DOCTYPE html>
      <html><body>
      <script>
        window.opener.postMessage('docusign_connected', '*');
        window.close();
      </script>
      <p>DocuSign connected. This window will close automatically.</p>
      </body></html>
    `);
  }

  @Get('connection')
  async getConnection(@Req() req: Request) {
    const userId = (req.user as { userId?: string })?.userId;
    if (!userId) return { connected: false };
    const account = await this.accountsService.findByUserId(userId);
    return this.oauthService.getConnection(account?.id ?? userId);
  }

  @Delete('connection')
  @HttpCode(HttpStatus.OK)
  async disconnect(@Req() req: Request) {
    const userId = (req.user as { userId?: string })?.userId;
    if (!userId) throw new Error('Not authenticated');
    const account = await this.accountsService.findByUserId(userId);
    await this.oauthService.disconnect(account?.id ?? userId);
    return { connected: false };
  }

  // ── Shared Coordinate Learning ───────────────────────────────────────────

  @Get('coordinates/shared')
  async querySharedCoordinates(
    @Query('formCode') formCode: string,
    @Query('fieldType') fieldType: string,
    @Query('recipientRole') recipientRole: string,
    @Query('pageNumber') pageNumber?: string,
  ) {
    return this.sharedCoords.query({
      formCode,
      fieldType,
      recipientRole,
      pageNumber: pageNumber ? parseInt(pageNumber, 10) : undefined,
    });
  }

  @Post('coordinates/shared')
  @HttpCode(HttpStatus.CREATED)
  async saveSharedCoordinate(@Req() req: Request, @Body() body: {
    formCode: string;
    formVersion?: string | null;
    pageNumber: number;
    fieldLabel: string;
    fieldType: string;
    docuSignTabType: string;
    recipientRole: string;
    xPosition: number;
    yPosition: number;
    width?: number | null;
    height?: number | null;
  }) {
    const userId = (req.user as { userId?: string })?.userId;
    if (!userId) throw new Error('Not authenticated');
    const account = await this.accountsService.findByUserId(userId);
    return this.sharedCoords.upsert({ ...body, createdBy: account?.id ?? userId });
  }

  @Patch('coordinates/shared/:id/verify')
  @HttpCode(HttpStatus.OK)
  async verifySharedCoordinate(@Param('id') id: string) {
    await this.sharedCoords.verify(id);
    return { ok: true };
  }

  @Delete('coordinates/shared/:id')
  @HttpCode(HttpStatus.OK)
  async removeSharedCoordinate(@Param('id') id: string) {
    await this.sharedCoords.remove(id);
    return { ok: true };
  }

  // ── Page Image for Manual Placement ─────────────────────────────────────

  @Get('documents/:docId/page/:pageNum/preview')
  async getPagePreview(
    @Param('docId') docId: string,
    @Param('pageNum') pageNum: string,
    @Res() res: any,
  ) {
    const doc = await this.docRepo.findOne({ where: { id: docId } });
    if (!doc || !doc.storageKey) {
      res.status(404).json({ error: 'Document not found or no PDF stored' });
      return;
    }

    try {
      const { stream } = await this.s3.getObject(doc.storageKey);
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);

      const png = await this.pdfRender.renderPage(buffer, parseInt(pageNum, 10), 150);
      if (png) {
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=3600');
        res.send(png);
        return;
      }
      res.status(404).json({ error: `Could not render page ${pageNum}` });
    } catch (err) {
      this.logger.error(`Failed to load preview for doc ${docId} page ${pageNum}: ${(err as Error).message}`);
      res.status(500).json({ error: 'Failed to load page preview' });
    }
  }
}
