import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GoogleGenerativeAIFetchError } from '@google/generative-ai';

const generateContent = vi.fn();

vi.mock('@google/generative-ai', async () => {
  const actual = await vi.importActual<typeof import('@google/generative-ai')>('@google/generative-ai');
  return {
    ...actual,
    GoogleGenerativeAI: vi.fn().mockImplementation(() => ({
      getGenerativeModel: () => ({ generateContent }),
    })),
  };
});

// Regression: a single transient Gemini overload used to permanently fail
// extraction for an otherwise correctly-identified document (e.g. a page
// group that classifyFromPrintedText/groupByFormCode had already resolved to
// RPA), because the retry logic only handled 429 and gave up immediately on
// any other status — including 503 "currently experiencing high demand",
// which Google's own error message says is transient and safe to retry.
describe('GeminiProvider retry behavior', () => {
  beforeEach(() => {
    generateContent.mockReset();
    vi.useRealTimers();
  });

  const mockSuccessResponse = () => ({
    response: {
      text: () => 'ok',
      usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 },
    },
  });

  it('retries on a transient 503 and succeeds on the next attempt', async () => {
    const { GeminiProvider } = await import('../../src/extractor/providers/gemini.provider');
    generateContent
      .mockRejectedValueOnce(new GoogleGenerativeAIFetchError('overloaded', 503, 'Service Unavailable', undefined))
      .mockResolvedValueOnce(mockSuccessResponse());

    const provider = new GeminiProvider('test-key');
    const result = await provider.extractText([Buffer.from('pdf')], 'system', 'user');

    expect(result.text).toBe('ok');
    expect(generateContent).toHaveBeenCalledTimes(2);
  });

  it('still retries on 429 (existing behavior preserved)', async () => {
    const { GeminiProvider } = await import('../../src/extractor/providers/gemini.provider');
    generateContent
      .mockRejectedValueOnce(new GoogleGenerativeAIFetchError('rate limited', 429, 'Too Many Requests', undefined))
      .mockResolvedValueOnce(mockSuccessResponse());

    const provider = new GeminiProvider('test-key');
    const result = await provider.extractText([Buffer.from('pdf')], 'system', 'user');

    expect(result.text).toBe('ok');
    expect(generateContent).toHaveBeenCalledTimes(2);
  });

  it('gives up after exhausting retries and throws the last error', async () => {
    const { GeminiProvider } = await import('../../src/extractor/providers/gemini.provider');
    generateContent.mockRejectedValue(new GoogleGenerativeAIFetchError('overloaded', 503, 'Service Unavailable', undefined));

    const provider = new GeminiProvider('test-key');
    await expect(provider.extractText([Buffer.from('pdf')], 'system', 'user')).rejects.toThrow('overloaded');
    expect(generateContent).toHaveBeenCalledTimes(3);
  });

  it('does not retry on a non-retryable error (e.g. 400 bad request)', async () => {
    const { GeminiProvider } = await import('../../src/extractor/providers/gemini.provider');
    generateContent.mockRejectedValue(new GoogleGenerativeAIFetchError('bad request', 400, 'Bad Request', undefined));

    const provider = new GeminiProvider('test-key');
    await expect(provider.extractText([Buffer.from('pdf')], 'system', 'user')).rejects.toThrow('bad request');
    expect(generateContent).toHaveBeenCalledTimes(1);
  });
});
