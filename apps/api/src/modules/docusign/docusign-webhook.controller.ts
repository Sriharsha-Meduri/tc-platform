import { Controller, HttpCode, HttpStatus, Logger, Post, Req, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { Request } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { DocuSignWebhookGuard } from './docusign-webhook.guard';
import { DocuSignService } from './docusign.service';
import { DocuSignEnvelopeEntity } from './entities/docusign-envelope.entity';

interface DocuSignConnectPayload {
  envelopeId?: string;
  status?: string;
  completedDateTime?: string;
}

@Public()
@Controller('webhooks/docusign')
export class DocuSignWebhookController {
  private readonly logger = new Logger(DocuSignWebhookController.name);

  constructor(
    @InjectRepository(DocuSignEnvelopeEntity)
    private readonly envelopeRepo: Repository<DocuSignEnvelopeEntity>,
    private readonly docusignService: DocuSignService,
  ) {}

  /**
   * POST /webhooks/docusign/connect
   *
   * DocuSign Connect envelope-completion notification. Authentication is an
   * HMAC signature (DocuSignWebhookGuard), not JWT.
   *
   * Always returns 200 (even for an unrecognized envelope or a non-completed
   * status) — returning 4xx/5xx here would only cause DocuSign to retry a
   * notification we've already understood and chosen not to act on. Actual
   * completion processing is dispatched fire-and-forget so the webhook
   * response isn't held open for the PDF download/persistence work; errors
   * there are logged, not surfaced to DocuSign, since processCompletedEnvelope
   * is independently retried by the 5-minute cron for anything that fails.
   */
  @Post('connect')
  @UseGuards(DocuSignWebhookGuard)
  @HttpCode(HttpStatus.OK)
  async receiveConnect(@Req() req: Request): Promise<{ status: string }> {
    const payload = req.body as DocuSignConnectPayload;
    const envelopeId = payload?.envelopeId;
    const status = payload?.status;

    if (!envelopeId) {
      this.logger.warn('DocuSign Connect webhook missing envelopeId');
      return { status: 'ignored' };
    }

    if (status !== 'completed') {
      this.logger.log(`DocuSign Connect webhook for envelope ${envelopeId}: status "${status}" — no action`);
      return { status: 'ignored' };
    }

    const envelope = await this.envelopeRepo.findOne({ where: { envelopeId } });
    if (!envelope) {
      this.logger.warn(`DocuSign Connect webhook for unknown envelope ${envelopeId} — no matching transaction`);
      return { status: 'ignored' };
    }

    this.docusignService.processCompletedEnvelope(envelope.id).catch((err) => {
      this.logger.error(`processCompletedEnvelope failed for envelope ${envelopeId} (webhook-triggered): ${(err as Error).message}`);
    });

    return { status: 'ok' };
  }
}
