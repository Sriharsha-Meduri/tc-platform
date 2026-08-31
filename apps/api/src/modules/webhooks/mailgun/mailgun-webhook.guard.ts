import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import type { Request } from 'express';

const TIMESTAMP_TOLERANCE_SECONDS = 900; // 15 minutes

@Injectable()
export class MailgunWebhookGuard implements CanActivate {
  private readonly logger = new Logger(MailgunWebhookGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const body = req.body as Record<string, unknown>;

    // Support both flat format (inbound) and nested format (events)
    const sigObj = (body.signature as Record<string, string>) ?? body;
    const timestamp = (body.timestamp as string) ?? sigObj?.timestamp;
    const token     = (body.token as string)     ?? sigObj?.token;
    const signature = (body.signature as string) ?? sigObj?.signature;

    if (!timestamp || !token || !signature) {
      this.logger.warn('Mailgun webhook missing signature fields');
      throw new ForbiddenException('Missing signature fields');
    }

    // ── 1. Replay protection: reject stale timestamps ─────────────────────
    const ts = parseInt(timestamp, 10);
    const ageSeconds = Math.abs(Date.now() / 1000 - ts);
    if (ageSeconds > TIMESTAMP_TOLERANCE_SECONDS) {
      this.logger.warn(`Mailgun webhook timestamp too old: ${ageSeconds}s`);
      throw new ForbiddenException('Webhook timestamp expired');
    }

    // ── 2. HMAC-SHA256 verification ───────────────────────────────────────
    const signingKey = process.env.MAILGUN_WEBHOOK_SIGNING_KEY;
    if (!signingKey) {
      this.logger.error('MAILGUN_WEBHOOK_SIGNING_KEY is not set');
      throw new ForbiddenException('Webhook signing key not configured');
    }

    const expected = createHmac('sha256', signingKey)
      .update(timestamp + token)
      .digest('hex');

    const expectedBuf = Buffer.from(expected, 'hex');
    const receivedBuf = Buffer.from(signature, 'hex');

    if (
      expectedBuf.length !== receivedBuf.length ||
      !timingSafeEqual(expectedBuf, receivedBuf)
    ) {
      this.logger.warn('Mailgun webhook signature mismatch');
      throw new ForbiddenException('Invalid webhook signature');
    }

    return true;
  }
}
