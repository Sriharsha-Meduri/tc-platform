export interface LlmExtractionResponse {
  text: string;
  modelName: string;
  promptTokens: number | null;
  completionTokens: number | null;
}

export interface LlmExtractionOptions {
  mimeType?: 'application/pdf' | 'image/png';
}

export interface LlmExtractionProvider {
  readonly providerName: string;
  extractText(
    pageBuffers: Buffer[],
    systemPrompt: string,
    userText: string,
    options?: LlmExtractionOptions,
  ): Promise<LlmExtractionResponse>;
}
