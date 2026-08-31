import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  StageReasoner,
  REASONING_REGISTRY,
  type ReasoningInput,
  type ReasoningResult,
  type TransactionContext,
} from '@tc/document-intelligence';
import { AiInteractionsService } from '../ai-interactions/ai-interactions.service';
import { TransactionDocumentsService } from '../transaction-documents/transaction-documents.service';
import { AiInteractionStatus } from '../ai-interactions/entities/ai-interaction.entity';

export interface StageReasoningResult {
  result: ReasoningResult;
  /** Form codes that were passed to the LLM. */
  decisionFormCodes: string[];
  /** Form codes present in the DB but filtered out (compliance forms). */
  skippedFormCodes: string[];
  /** Updated context after merging this stage's produces[] keys. */
  updatedContext: TransactionContext;
}

export type StageReasoningSkip =
  | { skipped: true; reason: 'no_stage_definition' }
  | { skipped: true; reason: 'no_decision_forms'; presentCodes: string[] };

@Injectable()
export class StageReasoningService implements OnModuleInit {
  private readonly logger = new Logger(StageReasoningService.name);
  private reasoner: StageReasoner;

  constructor(
    private readonly aiInteractions: AiInteractionsService,
    private readonly documents: TransactionDocumentsService,
  ) {}

  onModuleInit() {
    const provider = (process.env.LLM_REASONING_PROVIDER ?? 'anthropic') as 'anthropic' | 'gemini';
    const apiKey = provider === 'gemini'
      ? process.env.GEMINI_API_KEY ?? ''
      : process.env.ANTHROPIC_API_KEY ?? '';
    const temperature = process.env.LLM_TEMPERATURE ? parseFloat(process.env.LLM_TEMPERATURE) : undefined;

    this.reasoner = new StageReasoner({ provider, apiKey, temperature });
    this.logger.log(`StageReasoner initialised (provider: ${provider}, temperature: ${temperature ?? 0})`);
  }

  /**
   * Run stage reasoning for a transaction+stage after a document upload.
   *
   * Flow:
   *   1. Load all active extractions for this transaction+stage from DB
   *   2. Filter to decisionFormCodes (skip compliance-only forms)
   *   3. Load accumulated TransactionContext from DB
   *   4. Call StageReasoner.reason()
   *   5. Persist ReasoningResult to ai_interactions
   *   6. Merge produces[] keys → persist updated TransactionContext
   *
   * Returns null if the stage has no reasoning definition or no decision forms are present.
   */
  async runForStage(
    transactionId: string,
    stage: string,
  ): Promise<StageReasoningResult | StageReasoningSkip> {
    const stageKey = stage.toUpperCase();
    const definition = REASONING_REGISTRY[stageKey];

    if (!definition) {
      this.logger.warn(`No reasoning definition for stage ${stageKey} — skipping`);
      return { skipped: true, reason: 'no_stage_definition' };
    }

    // ── Step 1: load active documents for this stage ──────────────────────────
    const docs = await this.documents.findActiveByTransactionAndStage(transactionId, stage);

    // Build ReasoningInput[] from stored metadataJson extractions
    const allForms: ReasoningInput[] = [];
    for (const doc of docs) {
      const meta = doc.metadataJson as Record<string, unknown> | null;
      const detectedCode = meta?.detectedFormCode as string | undefined;
      const extraction = meta?.extraction as Record<string, unknown> | undefined;

      if (detectedCode && extraction) {
        allForms.push({
          formCode: detectedCode.toUpperCase(),
          formName: doc.title,
          data: extraction,
          stage: stageKey,
        });
      }
    }

    const presentCodes = allForms.map((f) => f.formCode);

    // ── Step 2: filter to decision forms ─────────────────────────────────────
    const { decisionFormCodes } = definition;
    let decisionForms: ReasoningInput[];
    let skippedFormCodes: string[];

    if (decisionFormCodes === undefined) {
      // No filter — all forms are decision forms for this stage
      decisionForms = allForms;
      skippedFormCodes = [];
    } else {
      const decisionSet = new Set(decisionFormCodes.map((c) => c.toUpperCase()));
      decisionForms = allForms.filter((f) => decisionSet.has(f.formCode));
      skippedFormCodes = presentCodes.filter((c) => !decisionSet.has(c));
    }

    if (decisionForms.length === 0) {
      this.logger.log(
        `Stage ${stageKey} for tx ${transactionId}: no decision forms present ` +
        `(uploaded: ${presentCodes.join(', ') || 'none'}) — reasoning skipped`,
      );
      return { skipped: true, reason: 'no_decision_forms', presentCodes };
    }

    this.logger.log(
      `Stage ${stageKey} for tx ${transactionId}: reasoning over [${decisionForms.map((f) => f.formCode).join(', ')}]` +
      (skippedFormCodes.length ? ` | compliance-only skipped: [${skippedFormCodes.join(', ')}]` : ''),
    );

    // ── Step 3: load TransactionContext ───────────────────────────────────────
    const ctxRow = await this.aiInteractions.findLatestByTransactionAndFeature(
      transactionId,
      'transaction_context',
    );
    const context: TransactionContext = (ctxRow?.metadataJson?.context as TransactionContext) ?? {};

    // ── Step 4: run reasoning ─────────────────────────────────────────────────
    let result: ReasoningResult;
    try {
      result = await this.reasoner.reason(stageKey, decisionForms, context);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Stage reasoning failed for ${stageKey} tx ${transactionId}: ${message}`);

      await this.aiInteractions.create({
        transactionId,
        modelName: 'unknown',
        feature: 'stage_reasoning',
        promptText: `stage=${stageKey}`,
        responseText: undefined,
        status: AiInteractionStatus.FAILED,
        errorMessage: message,
        metadataJson: { stage: stageKey, decisionFormCodes: decisionForms.map((f) => f.formCode), skippedFormCodes },
      });

      throw err;
    }

    // ── Step 5: persist reasoning result ─────────────────────────────────────
    await this.aiInteractions.create({
      transactionId,
      modelName: result.modelName ?? 'unknown',
      feature: 'stage_reasoning',
      promptText: `stage=${stageKey} forms=${decisionForms.map((f) => f.formCode).join(',')}`,
      responseText: result.rawResponse,
      promptTokens: result.promptTokens ?? undefined,
      completionTokens: result.completionTokens ?? undefined,
      status: AiInteractionStatus.SUCCESS,
      metadataJson: {
        stage: stageKey,
        decisionFormCodes: decisionForms.map((f) => f.formCode),
        skippedFormCodes,
        result: result.data,
      },
    });

    // ── Step 6: merge produces[] into TransactionContext → persist ────────────
    const updatedContext: TransactionContext = { ...context };
    for (const key of definition.produces ?? []) {
      const value = result.data[key];
      if (value !== undefined) {
        (updatedContext as Record<string, unknown>)[key] = value;
      }
    }

    if ((definition.produces ?? []).length > 0) {
      await this.aiInteractions.create({
        transactionId,
        modelName: 'system',
        feature: 'transaction_context',
        promptText: `updated after ${stageKey} reasoning`,
        responseText: JSON.stringify(updatedContext),
        status: AiInteractionStatus.SUCCESS,
        metadataJson: { context: updatedContext as unknown as Record<string, unknown> },
      });
    }

    return { result, decisionFormCodes: decisionForms.map((f) => f.formCode), skippedFormCodes, updatedContext };
  }
}
