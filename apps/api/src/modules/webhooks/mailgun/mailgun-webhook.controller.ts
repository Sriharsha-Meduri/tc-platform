import {
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../../auth/decorators/public.decorator';
import { MailgunWebhookGuard } from './mailgun-webhook.guard';
import { MailgunWebhookService } from './mailgun-webhook.service';
import type { MailgunInboundPayload } from './mailgun-payload.dto';
import type { MailgunEventWebhookBody } from './mailgun-event-payload.dto';

@Public()
@Controller('webhooks')
export class MailgunWebhookController {
  private readonly logger = new Logger(MailgunWebhookController.name);

  constructor(private readonly mailgunService: MailgunWebhookService) {}

  /**
   * POST /webhooks/email/inbound
   *
   * Receives inbound email forwarded by the email provider (currently Mailgun).
   * Must be outside the /api/v1 global prefix.
   * Authentication is HMAC signature (not JWT).
   *
   * Always returns 200 — returning 4xx/5xx would cause the provider to retry.
   * Signature errors still return 403 to reject clearly invalid requests.
   */
  @Post('email/inbound')
  @UseGuards(MailgunWebhookGuard)
  @HttpCode(HttpStatus.OK)
  async receiveInbound(@Req() req: Request): Promise<{ status: string }> {
    const payload = req.body as MailgunInboundPayload;
    const files   = (req.files as Express.Multer.File[]) ?? [];
    try {
      await this.mailgunService.processInbound(payload, files);
    } catch (err) {
      // Log but do NOT re-throw — returning 500 would cause Mailgun to retry
      this.logger.error('Failed to process Mailgun inbound webhook', err);
    }
    return { status: 'ok' };
  }

  /**
   * POST /webhooks/email/events
   *
   * Receives delivery, open, click, failed, and other event webhooks
   * from Mailgun. Updates the corresponding transaction_message status.
   *
   * Always returns 200 to prevent Mailgun retry storms.
   */
  @Post('email/events')
  @UseGuards(MailgunWebhookGuard)
  @HttpCode(HttpStatus.OK)
  async receiveEvents(@Req() req: Request): Promise<{ status: string }> {
    const payload = req.body as MailgunEventWebhookBody;
    try {
      await this.mailgunService.processEvent(payload);
    } catch (err) {
      this.logger.error('Failed to process Mailgun event webhook', err);
    }
    return { status: 'ok' };
  }
}
