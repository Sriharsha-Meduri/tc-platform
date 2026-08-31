import { PdfSplitter } from '../splitter/pdf-splitter';
import { FormIdentifier, type FormIdentifierConfig } from '../identifier/form-identifier';
import { FormExtractor, type FormExtractorConfig } from '../extractor/form-extractor';
import { StageValidator } from '../validator/stage-validator';
import type { PipelineOptions, PipelineResult, FormExtractionResult, PipelineProgressEvent } from './pipeline.types';
import type { FormExtractionOutput } from '../extractor/extractor.types';
import { estimateLlmCostUsd } from '../llm-cost';

export interface DocumentIntelligenceConfig {
  identifier: FormIdentifierConfig;
  extractor: FormExtractorConfig;
}

export class DocumentIntelligencePipeline {
  private readonly splitter = new PdfSplitter();
  private readonly identifier: FormIdentifier;
  private readonly extractor: FormExtractor;
  private readonly validator = new StageValidator();

  constructor(config: DocumentIntelligenceConfig) {
    this.identifier = new FormIdentifier(config.identifier);
    this.extractor  = new FormExtractor(config.extractor);
  }

  async process(pdfBuffer: Buffer, options: PipelineOptions = {}): Promise<PipelineResult> {
    const { stage, onProgress, minPagesForExtraction = 1, extractionSnaps = {}, formExpectations } = options;
    const emit = (event: PipelineProgressEvent) => onProgress?.(event);
    const t0 = Date.now();
    console.log(`[Pipeline] Starting pipeline (stage=${stage ?? 'none'}, pdfSize=${(pdfBuffer.length / 1024).toFixed(1)}KB)`);

    // ── Step 1: Split ──────────────────────────────────────────────────────────
    emit({ stage: 'splitting', message: 'Splitting PDF into pages…', percent: 0 });
    const { pageCount, pageBuffers } = await this.splitter.split(pdfBuffer);
    console.log(`[Pipeline] Split complete: ${pageCount} pages`);
    emit({ stage: 'splitting', message: `Split into ${pageCount} pages`, percent: 5, detail: { totalPages: pageCount } });

    // ── Step 2: Classify ───────────────────────────────────────────────────────
    emit({ stage: 'classifying', message: `Classifying 0 of ${pageCount} pages…`, percent: 5 });
    const classifications = await this.identifier.classifyPages(pageBuffers, (classified, total) => {
      emit({
        stage: 'classifying',
        message: `Classifying page ${classified} of ${total}…`,
        percent: Math.round(5 + 50 * (classified / total)),
        detail: { currentPage: classified, totalPages: total },
      });
    });
    console.log(`[Pipeline] Classifications: ${classifications.map((c) => `${c.pageIndex}:${c.formCodes.join('+')}`).join(' ')}`);

    // ── Step 3: Group ──────────────────────────────────────────────────────────
    emit({ stage: 'grouping', message: 'Grouping pages by form…', percent: 57 });
    const formGroups = this.identifier.groupByFormCode(classifications);
    console.log(`[Pipeline] Form groups: ${formGroups.map((g) => `${g.formCode}[${g.pageIndices.join(',')}]`).join(' ')}`);
    const identifierMayHaveFailed = formGroups.length === 1
      && formGroups[0].formCode === 'UNKNOWN'
      && classifications.every((c) => c.confidence === 0);
    if (identifierMayHaveFailed) {
      console.warn(`[Pipeline] ALL ${pageCount} pages classified as UNKNOWN with zero confidence — identifier may be failing`);
    }

    // ── Step 4: Extract ────────────────────────────────────────────────────────
    const eligible = formGroups.filter((g) => g.pageIndices.length >= minPagesForExtraction);
    const extractions: FormExtractionResult[] = [];
    console.log(`[Pipeline] Extracting ${eligible.length} eligible form groups (of ${formGroups.length} total)`);

    for (let i = 0; i < eligible.length; i++) {
      const group = eligible[i];
      const snap = extractionSnaps[group.formCode.toUpperCase()];

      if (snap) {
        console.log(`[Pipeline] [SNAP] ${group.formCode} — using cached extraction, skipping LLM`);
        emit({
          stage: 'extracting',
          message: `[SNAP] ${group.formCode} — using cached extraction, skipping LLM`,
          percent: Math.round(60 + 35 * (i / eligible.length)),
          detail: { currentForm: i + 1, totalForms: eligible.length, formCode: group.formCode },
        });
        extractions.push({ formCode: group.formCode, formName: snap.formName, pageIndices: group.pageIndices, output: snap });
        continue;
      }

      emit({
        stage: 'extracting',
        message: `Extracting ${group.formCode} (${group.pageIndices.length} pages)…`,
        percent: Math.round(60 + 35 * (i / eligible.length)),
        detail: { currentForm: i + 1, totalForms: eligible.length, formCode: group.formCode },
      });

      try {
        const pages = group.pageIndices.map((idx) => pageBuffers[idx]);
        const pageNumbers = group.pageIndices.map((idx) => classifications[idx].pageNumber);
        const pageNumsFormatted = group.pageIndices.map((idx) => classifications[idx].pageNumber ?? `${idx}(unnumbered)`).join(',');
        console.log(`[Pipeline] Extracting ${group.formCode} (pages=${group.pageIndices.length}, logical #: ${pageNumsFormatted})`);
        const output = await this.extractor.extract(pages, pageNumbers, group.formCode, undefined, undefined, (event) => {
          emit({
            stage: 'extracting',
            message: event.message,
            percent: Math.round(60 + 35 * ((i + event.currentPage / event.totalPages) / eligible.length)),
            detail: {
              currentForm: i + 1,
              totalForms: eligible.length,
              formCode: group.formCode,
              currentPage: event.currentPage,
              totalPages: event.totalPages,
            },
          });
        });
        const keySummary = output.data ? Object.keys(output.data).join(', ') : '(none)';
        console.log(`[Pipeline] Extracted ${group.formCode}: ${Object.keys(output.data ?? {}).length} top-level keys [${keySummary}]`);
        extractions.push({ formCode: group.formCode, formName: output.formName, pageIndices: group.pageIndices, output });
      } catch (err) {
        const errMsg = (err as Error).message;
        console.error(`[Pipeline] Extraction FAILED for ${group.formCode}: ${errMsg}`);
        extractions.push({
          formCode: group.formCode,
          formName: null,
          pageIndices: group.pageIndices,
          output: null,
          error: errMsg,
        });
      }
    }

    // ── Step 5: Validate ───────────────────────────────────────────────────────
    let validation = null;
    if (stage) {
      emit({ stage: 'validating', message: `Validating ${stage} stage requirements…`, percent: 97 });
      console.log(`[Pipeline] Validating stage=${stage}`);
      const successfulOutputs = extractions
        .filter((e): e is FormExtractionResult & { output: FormExtractionOutput } => e.output !== null)
        .map((e) => e.output);

      // Each stage validator receives the full array of extractions and handles
      // normalization + cross-form validation internally.
      validation = this.validator.validate(stage, successfulOutputs, formExpectations);
      const blockerCount = validation.blockers?.length ?? 0;
      const warnCount = validation.warnings?.length ?? 0;
      console.log(`[Pipeline] Validation done: ${blockerCount} blockers, ${warnCount} warnings`);
    }

    const elapsed = Date.now() - t0;

    // ── Token usage summary (per document) ───────────────────────────────────
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let totalCostUsd = 0;
    const perFormTokens: string[] = [];
    for (const ex of extractions) {
      const p = ex.output?.promptTokens ?? 0;
      const c = ex.output?.completionTokens ?? 0;
      totalPromptTokens += p;
      totalCompletionTokens += c;
      if (ex.output) {
        totalCostUsd += estimateLlmCostUsd(ex.output.modelName, p, c) ?? 0;
        perFormTokens.push(`${ex.formCode}:${p}+${c}`);
      } else {
        perFormTokens.push(`${ex.formCode}:FAILED`);
      }
    }
    console.log(
      `[Pipeline] Token usage: input=${totalPromptTokens} output=${totalCompletionTokens} total=${totalPromptTokens + totalCompletionTokens} cost=$${totalCostUsd.toFixed(6)} — [${perFormTokens.join(', ')}]`,
    );

    console.log(`[Pipeline] Complete in ${elapsed}ms (${pageCount} pages, ${extractions.length} extractions)`);
    emit({ stage: 'complete', message: 'Done', percent: 100 });

    return { totalPages: pageCount, classifications, formGroups, extractions, validation, identifierMayHaveFailed };
  }
}
