import { DocumentIntelligencePipeline } from '../../src/pipeline/document-intelligence';
import { StageReasoner } from '../../src/reasoner/stage-reasoner';

export function buildPipeline(): DocumentIntelligencePipeline {
  const geminiKey = process.env.GEMINI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const extractionProvider = (process.env.LLM_EXTRACTION_PROVIDER as 'anthropic' | 'gemini') || 'anthropic';
  const temperature = process.env.LLM_TEMPERATURE ? parseFloat(process.env.LLM_TEMPERATURE) : undefined;

  if (!geminiKey) throw new Error('GEMINI_API_KEY required for page identification');

  const extractionKey = extractionProvider === 'gemini'
    ? geminiKey
    : anthropicKey;

  if (!extractionKey) {
    throw new Error(`${extractionProvider.toUpperCase()}_API_KEY required for extraction`);
  }

  return new DocumentIntelligencePipeline({
    identifier: { apiKey: geminiKey, temperature },
    extractor: { provider: extractionProvider, apiKey: extractionKey, temperature },
  });
}

export function buildReasoner(): StageReasoner {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;

  if (!anthropicKey && !geminiKey) {
    throw new Error('ANTHROPIC_API_KEY or GEMINI_API_KEY required for reasoning');
  }

  const temperature = process.env.LLM_TEMPERATURE ? parseFloat(process.env.LLM_TEMPERATURE) : undefined;

  return new StageReasoner({
    provider: (process.env.LLM_REASONING_PROVIDER as 'anthropic' | 'gemini') ?? 'anthropic',
    apiKey: anthropicKey ?? geminiKey!,
    temperature,
  });
}
