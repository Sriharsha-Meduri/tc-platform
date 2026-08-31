import { AnthropicProvider } from '../extractor/providers/anthropic.provider';
import { GeminiProvider } from '../extractor/providers/gemini.provider';
import type { LlmExtractionProvider } from '../extractor/provider.interface';
import type { FormExtractorConfig } from '../extractor/form-extractor';
import { REASONING_REGISTRY } from './registry';
import type { ReasoningInput, ReasoningResult, TransactionContext } from './reasoning-definition';

export class StageReasoner {
  private readonly llm: LlmExtractionProvider;

  constructor(config: FormExtractorConfig) {
    const temperature = config.temperature;
    this.llm = config.provider === 'gemini'
      ? new GeminiProvider(config.apiKey, config.model, temperature)
      : new AnthropicProvider(config.apiKey, config.model, temperature);
  }

  async reason(
    stage: string,
    forms: ReasoningInput[],
    context?: TransactionContext,
  ): Promise<ReasoningResult> {
    const definition = REASONING_REGISTRY[stage.toUpperCase()];
    if (!definition) throw new Error(`No reasoning definition registered for stage: ${stage}`);
    if (forms.length === 0) throw new Error(`Cannot reason over empty form list for stage: ${stage}`);

    const userPrompt = definition.buildUserPrompt
      ? definition.buildUserPrompt(forms, context)
      : this.defaultUserPrompt(stage, forms, context);

    // Pass empty pageBuffers — all context is in the text prompts for reasoning
    const llmResponse = await this.llm.extractText([], definition.systemPrompt, userPrompt);

    if (!llmResponse.text) throw new Error(`Empty reasoning response for stage: ${stage}`);

    const cleaned = llmResponse.text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/i, '')
      .trim();

    const data = JSON.parse(cleaned) as Record<string, unknown>;

    return {
      stage,
      data,
      rawResponse: llmResponse.text,
      promptTokens: llmResponse.promptTokens,
      completionTokens: llmResponse.completionTokens,
      modelName: llmResponse.modelName,
    };
  }

  private defaultUserPrompt(stage: string, forms: ReasoningInput[], context?: TransactionContext): string {
    const formSummaries = forms.map((f) => ({
      formCode: f.formCode,
      formName: f.formName,
      extractedData: f.data,
    }));

    const contextBlock = context && Object.keys(context).length > 0
      ? `\n\n## Prior stage context\n${JSON.stringify(context, null, 2)}\n`
      : '';

    return `Analyze the following ${forms.length} extracted form(s) for the ${stage} stage and return your reasoning as valid JSON:${contextBlock}\n\n${JSON.stringify(formSummaries, null, 2)}`;
  }
}
