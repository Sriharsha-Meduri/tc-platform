import { ForbiddenException } from '@nestjs/common';
import { createHmac } from 'crypto';
import { ExecutionContext } from '@nestjs/common';
import { DocuSignWebhookGuard } from './docusign-webhook.guard';

const HMAC_KEY = 'test-docusign-hmac-key';

function makeContext(opts: { signatureHeader?: string | null; rawBody?: Buffer | undefined }): ExecutionContext {
  const req = {
    header: (name: string) => (name === 'X-DocuSign-Signature-1' ? opts.signatureHeader ?? null : null),
    rawBody: opts.rawBody,
  };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

function signBody(body: Buffer, key = HMAC_KEY): string {
  return createHmac('sha256', key).update(body).digest('base64');
}

describe('DocuSignWebhookGuard', () => {
  const originalEnv = process.env.DOCUSIGN_WEBHOOK_HMAC_KEY;
  const guard = new DocuSignWebhookGuard();

  beforeEach(() => {
    process.env.DOCUSIGN_WEBHOOK_HMAC_KEY = HMAC_KEY;
  });

  afterAll(() => {
    process.env.DOCUSIGN_WEBHOOK_HMAC_KEY = originalEnv;
  });

  it('accepts a request whose signature matches an HMAC-SHA256 of the exact raw body', () => {
    const rawBody = Buffer.from(JSON.stringify({ envelopeId: 'env-1', status: 'completed' }));
    const ctx = makeContext({ signatureHeader: signBody(rawBody), rawBody });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('rejects a request with no X-DocuSign-Signature-1 header', () => {
    const rawBody = Buffer.from('{}');
    const ctx = makeContext({ signatureHeader: null, rawBody });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('rejects a request whose signature does not match the raw body', () => {
    const rawBody = Buffer.from(JSON.stringify({ envelopeId: 'env-1', status: 'completed' }));
    const ctx = makeContext({ signatureHeader: signBody(Buffer.from('tampered')), rawBody });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('rejects a request signed with the wrong HMAC key', () => {
    const rawBody = Buffer.from(JSON.stringify({ envelopeId: 'env-1', status: 'completed' }));
    const ctx = makeContext({ signatureHeader: signBody(rawBody, 'wrong-key'), rawBody });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('rejects when DOCUSIGN_WEBHOOK_HMAC_KEY is not configured', () => {
    delete process.env.DOCUSIGN_WEBHOOK_HMAC_KEY;
    const rawBody = Buffer.from('{}');
    const ctx = makeContext({ signatureHeader: signBody(rawBody), rawBody });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('rejects when no raw body was captured (misconfigured body parser)', () => {
    const ctx = makeContext({ signatureHeader: 'anything', rawBody: undefined });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });
});
