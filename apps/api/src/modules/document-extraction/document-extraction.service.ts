import { Injectable, Logger, BadRequestException, InternalServerErrorException, OnModuleInit } from '@nestjs/common';
import { AiInteractionsService } from '../ai-interactions/ai-interactions.service';
import { AiInteractionEntity, AiInteractionStatus } from '../ai-interactions/entities/ai-interaction.entity';
import { ExtractionResult } from './extraction-result.types';
import { FormExtractor, type ExtractionProgressEvent } from '@tc/document-intelligence';

export interface ExtractionWithInteraction {
  /** Parsed extraction result — ready to use directly as a JS object */
  result: ExtractionResult;
  /** Saved ai_interactions row — use interaction.id to link to a document */
  interaction: AiInteractionEntity;
}

const FEATURE = 'contract_extraction';
const MAX_FILE_SIZE_MB = 25;

@Injectable()
export class DocumentExtractionService implements OnModuleInit {
  private readonly logger = new Logger(DocumentExtractionService.name);
  private extractor: FormExtractor;

  constructor(private readonly aiInteractionsService: AiInteractionsService) {}

  onModuleInit() {
    const provider = (process.env.LLM_EXTRACTION_PROVIDER ?? 'anthropic') as 'anthropic' | 'gemini';
    const apiKey = provider === 'gemini'
      ? process.env.GEMINI_API_KEY ?? ''
      : process.env.ANTHROPIC_API_KEY ?? '';
    const temperature = process.env.LLM_TEMPERATURE ? parseFloat(process.env.LLM_TEMPERATURE) : undefined;
    this.extractor = new FormExtractor({ provider, apiKey, temperature });
    this.logger.log(`LLM extraction provider: ${provider}, temperature: ${temperature ?? 0}`);
  }

  async extractFromPdfs(
    files: Express.Multer.File[],
    formCode?: string,
    formName?: string | null,
    onProgress?: (event: ExtractionProgressEvent) => void,
  ): Promise<ExtractionWithInteraction> {
    for (const file of files) {
      if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
        throw new BadRequestException(`File "${file.originalname}" exceeds the ${MAX_FILE_SIZE_MB} MB limit`);
      }
    }

    let responseText: string | undefined;
    let promptTokens: number | undefined;
    let completionTokens: number | undefined;
    let modelName = 'unknown';

    try {
      this.logger.log(`Calling extractor — files: ${files.length}`);

      const pageBuffers = files.map((f) => f.buffer);
      const pageNumbers = files.map(() => null);
      const output = await this.extractor.extract(pageBuffers, pageNumbers, formCode ?? 'UNKNOWN', formName, undefined, onProgress);

      responseText = output.rawResponse;
      promptTokens = output.promptTokens ?? undefined;
      completionTokens = output.completionTokens ?? undefined;
      modelName = output.modelName;

      this.logger.log(`Raw LLM response:\n${responseText}`);

      const result = output.data as unknown as ExtractionResult;

      const interaction = await this.aiInteractionsService.create({
        modelName,
        feature: FEATURE,
        promptText: 'document_extraction',
        responseText,
        promptTokens,
        completionTokens,
        status: AiInteractionStatus.SUCCESS,
        metadataJson: { extraction: result as unknown as Record<string, unknown> },
      });

      return { result, interaction };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.logger.error('PDF extraction failed', err);

      await this.aiInteractionsService.create({
        modelName,
        feature: FEATURE,
        promptText: 'document_extraction',
        responseText,
        promptTokens,
        completionTokens,
        status: AiInteractionStatus.FAILED,
        errorMessage,
        metadataJson: { error: errorMessage },
      });

      if (err instanceof BadRequestException) throw err;
      const detail = err instanceof Error ? err.message : String(err);
      throw new InternalServerErrorException(`Extraction failed: ${detail}`);
    }
  }
}
