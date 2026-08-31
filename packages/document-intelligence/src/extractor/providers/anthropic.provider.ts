import Anthropic from '@anthropic-ai/sdk';
import type { LlmExtractionProvider, LlmExtractionResponse, LlmExtractionOptions } from '../provider.interface';

export class AnthropicProvider implements LlmExtractionProvider {
  readonly providerName = 'anthropic';
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly temperature: number;

  constructor(apiKey: string, model = 'claude-haiku-4-5-20251001', temperature?: number) {
    this.client = new Anthropic({ apiKey });
    this.model = model;
    this.temperature = temperature ?? 0;
  }

  async extractText(
    pageBuffers: Buffer[],
    systemPrompt: string,
    userText: string,
    options?: LlmExtractionOptions,
  ): Promise<LlmExtractionResponse> {
    const isPng = options?.mimeType === 'image/png';
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 16000,
      temperature: this.temperature,
      // System prompt cached as a single block — reads at ~10% input cost after first call within 5 min.
      system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
      messages: [
        {
          role: 'user',
          content: [
            ...pageBuffers.map((buf): any => ({
              type: isPng ? 'image' : 'document',
              source: {
                type: 'base64',
                media_type: isPng ? 'image/png' : 'application/pdf',
                data: buf.toString('base64'),
              },
            })),
            { type: 'text' as const, text: userText },
          ],
        },
      ],
    }, { maxRetries: 0, timeout: 120_000 });

    const usage = response.usage as Anthropic.Usage & {
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };

    const textBlock = response.content.find((b) => b.type === 'text');
    const text = textBlock && 'text' in textBlock ? textBlock.text : '';

    return {
      text,
      modelName: this.model,
      promptTokens: usage.input_tokens,
      completionTokens: usage.output_tokens,
    };
  }
}
