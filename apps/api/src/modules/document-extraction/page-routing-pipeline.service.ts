import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  DocumentIntelligencePipeline,
  type PipelineProgressEvent,
  type PipelineResult,
  type StageFormExpectation,
  type FormExtractionOutput,
} from '@tc/document-intelligence';

// Re-export for any existing consumers that import these types from here
export type { PipelineProgressEvent, PipelineResult };

@Injectable()
export class PageRoutingPipelineService implements OnModuleInit {
  private readonly logger = new Logger(PageRoutingPipelineService.name);
  private pipeline: DocumentIntelligencePipeline;

  onModuleInit() {
    const geminiKey    = process.env.GEMINI_API_KEY ?? '';
    const provider     = (process.env.LLM_EXTRACTION_PROVIDER ?? 'anthropic') as 'anthropic' | 'gemini';
    const extractorKey = provider === 'gemini'
      ? process.env.GEMINI_API_KEY ?? ''
      : process.env.ANTHROPIC_API_KEY ?? '';
    const temperature  = process.env.LLM_TEMPERATURE ? parseFloat(process.env.LLM_TEMPERATURE) : undefined;

    this.pipeline = new DocumentIntelligencePipeline({
      identifier: { apiKey: geminiKey, temperature },
      extractor:  { provider, apiKey: extractorKey, temperature },
    });

    this.logger.log(`DocumentIntelligencePipeline initialised (identifier: gemini, extractor: ${provider}, temperature: ${temperature ?? 0})`);
  }

  async process(
    pdfBuffer: Buffer,
    onProgress?: (event: PipelineProgressEvent) => void,
    formExpectations?: StageFormExpectation[],
    extractionSnaps?: Record<string, FormExtractionOutput>,
    stage?: string,
    minPagesForExtraction?: number,
  ): Promise<PipelineResult> {
    return this.pipeline.process(pdfBuffer, { stage, onProgress, formExpectations, extractionSnaps, minPagesForExtraction } as any);
  }
}
