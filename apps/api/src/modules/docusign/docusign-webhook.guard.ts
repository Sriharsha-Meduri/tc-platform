import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import type { Request } from 'express';

/**
 * Verifies DocuSign Connect's HMAC-SHA256 signature, sent as base64 in the
 * `X-DocuSign-Signature-1` header, computed over the exact raw request body
 * bytes (see main.ts's `verify` callback on the JSON body parser, which
 * stashes those bytes on `req.rawBody` — a re-serialized `req.body` would not
 * byte-for-byte match what DocuSign signed).
 */
@Injectable()
export class DocuSignWebhookGuard implements CanActivate {
  private readonly logger = new Logger(DocuSignWebhookGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request & { rawBody?: Buffer }>();

    const signature = req.header('X-DocuSign-Signature-1');
    if (!signature) {
      this.logger.warn('DocuSign webhook missing X-DocuSign-Signature-1 header');
      throw new ForbiddenException('Missing signature header');
    }

    const hmacKey = process.env.DOCUSIGN_WEBHOOK_HMAC_KEY;
    if (!hmacKey) {
      this.logger.error('DOCUSIGN_WEBHOOK_HMAC_KEY is not set');
      throw new ForbiddenException('Webhook signing key not configured');
    }

    if (!req.rawBody) {
      this.logger.error('DocuSign webhook has no raw body captured — check main.ts body-parser verify callback');
      throw new ForbiddenException('Unable to verify signature');
    }

    const expected = createHmac('sha256', hmacKey).update(req.rawBody).digest('base64');

    let expectedBuf: Buffer;
    let receivedBuf: Buffer;
    try {
      expectedBuf = Buffer.from(expected, 'base64');
      receivedBuf = Buffer.from(signature, 'base64');
    } catch {
      throw new ForbiddenException('Invalid webhook signature');
    }

    if (
      expectedBuf.length !== receivedBuf.length ||
      !timingSafeEqual(expectedBuf, receivedBuf)
    ) {
      this.logger.warn('DocuSign webhook signature mismatch');
      throw new ForbiddenException('Invalid webhook signature');
    }

    return true;
  }
}
