import { GoogleGenerativeAI, GoogleGenerativeAIFetchError } from '@google/generative-ai';
import type { LlmExtractionProvider, LlmExtractionResponse, LlmExtractionOptions } from '../provider.interface';

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// 429 = rate limited; 503 = "currently experiencing high demand" (Google's
// own message says this is transient — retry after a backoff); 500/502/504
// are likewise transient server-side failures worth a retry.
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

// A per-request client-side abort (the fetch's own `timeout` option firing)
// has no HTTP status at all — it throws a plain Error with no `.status`, so
// it fell through the status-only check below and was never retried. This
// is not just a theoretical gap: confirmed live at high page-render DPI
// (large image payloads push some requests right up against the timeout),
// where a request that would very likely succeed on a retry instead failed
// outright and silently dropped that request's entire contribution.
function isAbortOrTimeout(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /aborted|timeout/i.test(message);
}

async function withRetry<T>(fn: () => Promise<T>, label: string, maxRetries = 3): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const status = err instanceof GoogleGenerativeAIFetchError ? err.status : undefined;
      const retryable = (status != null && RETRYABLE_STATUSES.has(status)) || isAbortOrTimeout(err);
      if (retryable) {
        if (attempt < maxRetries) {
          const delay = 1000 * Math.pow(2, attempt - 1);
          console.warn(`[GeminiProvider] ${label} ${status ?? 'abort/timeout'} — retry ${attempt}/${maxRetries} in ${delay}ms`);
          await sleep(delay);
          continue;
        }
        console.error(`[GeminiProvider] ${label} ${status ?? 'abort/timeout'} — all ${maxRetries} retries exhausted`);
      }
      throw err;
    }
  }
  throw new Error(`Unreachable — ${label} retry loop exited`);
}

export class GeminiProvider implements LlmExtractionProvider {
  readonly providerName = 'gemini';
  private readonly genAI: GoogleGenerativeAI;
  private readonly model: string;
  private readonly temperature: number;

  constructor(apiKey: string, model = 'gemini-3.1-flash-lite', temperature?: number) {
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = model;
    this.temperature = temperature ?? 0;
  }

  async extractText(
    pageBuffers: Buffer[],
    systemPrompt: string,
    userText: string,
    options?: LlmExtractionOptions,
  ): Promise<LlmExtractionResponse> {
    const mimeType = options?.mimeType ?? 'application/pdf';
    const generativeModel = this.genAI.getGenerativeModel({
      model: this.model,
      systemInstruction: systemPrompt,
    });

    const response = await withRetry(
      () =>
        generativeModel.generateContent(
          {
            contents: [
              {
                role: 'user',
                parts: [
                  ...pageBuffers.map((buf) => ({
                    inlineData: {
                      mimeType: mimeType as 'application/pdf' | 'image/png',
                      data: buf.toString('base64'),
                    },
                  })),
                  { text: userText },
                ],
              },
            ],
            generationConfig: { maxOutputTokens: 16000, temperature: this.temperature },
          },
          // 240s, not the previous 120s — confirmed live that a request
          // sending several full-page images rendered at high DPI (e.g. the
          // SPQ/TDS Yes-explanation vision pass) can legitimately take well
          // over 2 minutes; the old timeout was firing on requests that were
          // still on track to succeed, not just genuinely stuck ones.
          { timeout: 240000 },
        ),
      'extractText',
    );

    const usage = response.response.usageMetadata;

    return {
      text: response.response.text(),
      modelName: this.model,
      promptTokens: usage?.promptTokenCount ?? null,
      completionTokens: usage?.candidatesTokenCount ?? null,
    };
  }
}
