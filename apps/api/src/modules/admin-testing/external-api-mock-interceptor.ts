import { Injectable, Logger } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

export interface MockContext {
  runId: string;
  mockDocuSign: boolean;
  mockMailgun: boolean;
}

const als = new AsyncLocalStorage<MockContext>();

function fakePdfBuffer(): Buffer {
  return Buffer.from('%PDF-1.4\n%mock-admin-testing-pdf\n');
}

function bufferResponse(bytes: Buffer, headers: Record<string, string> = {}): Response {
  return {
    ok: true,
    status: 200,
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    json: async () => ({}),
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
  } as unknown as Response;
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
    headers: { get: () => null },
  } as unknown as Response;
}

/**
 * Returns a canned DocuSign response matching the exact request shapes
 * DocuSignService makes (oauth token/userinfo, envelope create, envelope
 * status, document list/combined/certificate/per-document download) — same
 * URL-suffix/method matching idiom already used in docusign.service.spec.ts's
 * fetchMock, just serving live traffic instead of a Jest test.
 */
function mockDocuSignResponse(url: string, init: RequestInit | undefined, runId: string): Response {
  const method = (init?.method ?? 'GET').toUpperCase();

  if (url.includes('/oauth/token')) {
    return jsonResponse({ access_token: `mock-token-${runId}`, token_type: 'Bearer', expires_in: 3600 });
  }
  if (url.includes('/oauth/userinfo')) {
    return jsonResponse({ accounts: [{ account_id: 'mock-account-id', base_uri: 'https://demo.docusign.net', is_default: true }] });
  }
  if (url.endsWith('/envelopes') && method === 'POST') {
    return jsonResponse({ envelopeId: `mock-env-${runId}-${randomUUID().slice(0, 8)}`, uri: '/mock/envelope', status: 'sent', statusDateTime: new Date().toISOString() });
  }
  if (url.includes('/views/recipient')) {
    return jsonResponse({ url: 'https://demo.docusign.net/signing/mock' });
  }
  if (/\/envelopes\/[^/]+$/.test(url) && method === 'GET') {
    return jsonResponse({
      status: 'completed',
      completedDateTime: new Date().toISOString(),
      recipients: { signers: [{ recipientId: '1', email: 'mock-signer@example.com', status: 'completed' }] },
    });
  }
  if (url.endsWith('/documents/combined')) {
    return bufferResponse(fakePdfBuffer(), { 'content-disposition': 'attachment; filename="combined.pdf"' });
  }
  if (url.endsWith('/documents/certificate')) {
    return bufferResponse(fakePdfBuffer());
  }
  if (url.endsWith('/documents')) {
    return jsonResponse({ envelopeDocuments: [{ documentId: '1', name: 'document.pdf' }] });
  }
  if (/\/documents\/[^/]+$/.test(url)) {
    return bufferResponse(fakePdfBuffer());
  }

  return jsonResponse({ mock: true, note: 'admin-testing mock interceptor: unmatched DocuSign URL, returning empty 200' });
}

function mockMailgunResponse(runId: string): Response {
  return jsonResponse({ id: `<mock-${runId}-${randomUUID()}@mock.mailgun.local>`, message: 'Queued. Thank you. (mocked by Admin Test Center)' });
}

/**
 * Permanent, always-installed fetch wrapper — never toggled on/off per run.
 * Delegates to the real fetch for every request unless the current async
 * context (set via runWithMocks) has a mock flag for that exact SaaS
 * boundary, so it's completely inert for normal application traffic and safe
 * to coexist with real requests on the same process. See the module's own
 * doc comment (admin-testing.module.ts) for the full rationale — DI-level
 * provider overriding doesn't reach nested service calls, and a toggled
 * global.fetch swap would race across overlapping runs / real traffic.
 */
@Injectable()
export class ExternalApiMockInterceptor {
  private readonly logger = new Logger(ExternalApiMockInterceptor.name);
  private installed = false;

  install(): void {
    if (this.installed) return;
    this.installed = true;
    const originalFetch = global.fetch.bind(global);

    global.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const ctx = als.getStore();
      if (!ctx) return originalFetch(input, init);

      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;

      if (ctx.mockDocuSign && (url.includes('docusign.net') || url.includes('docusign.com'))) {
        this.logger.debug(`[run ${ctx.runId}] intercepted DocuSign call: ${init?.method ?? 'GET'} ${url}`);
        return mockDocuSignResponse(url, init, ctx.runId);
      }
      if (ctx.mockMailgun && url.includes('api.mailgun.net')) {
        this.logger.debug(`[run ${ctx.runId}] intercepted Mailgun call: ${init?.method ?? 'GET'} ${url}`);
        return mockMailgunResponse(ctx.runId);
      }

      return originalFetch(input, init);
    }) as typeof fetch;

    this.logger.log('External API mock interceptor installed (inert unless inside runWithMocks)');
  }

  /** Runs `fn` with the given mock context active for every fetch call made anywhere within its async chain (including transitively awaited calls). */
  runWithMocks<T>(context: MockContext, fn: () => Promise<T>): Promise<T> {
    return als.run(context, fn);
  }
}
