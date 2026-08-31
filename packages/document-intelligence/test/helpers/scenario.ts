import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, basename } from 'path';
import type { ReasoningInput, TransactionContext } from '../../src/reasoner/reasoning-definition';
import type { FormExtractionOutput } from '../../src/extractor/extractor.types';
import type { FormGroup } from '../../src/identifier/identifier.types';
import { buildPipeline, buildReasoner } from './pipeline';

// ── File helpers ──────────────────────────────────────────────────────────────

export function hasPdf(scenarioDir: string, filename: string): boolean {
  return existsSync(join(scenarioDir, 'pdfs', filename));
}

export function loadPdf(scenarioDir: string, filename: string): Buffer {
  return readFileSync(join(scenarioDir, 'pdfs', filename));
}

/**
 * Load all .json files from extractions/round-NN/ (temporal scenarios).
 * Files follow the naming convention: <code>.<variant>.<version>.json
 * Snap files (*.snap.json) are preferred over plain .json with the same base name.
 */
export function loadRound(scenarioDir: string, round: number): ReasoningInput[] {
  const roundDir = join(scenarioDir, 'extractions', `round-${String(round).padStart(2, '0')}`);
  return loadJsonFiles(roundDir);
}

/**
 * Load all .json files from extractions/ directly (single-upload scenarios).
 * Files follow the naming convention: <code>.<variant>.<version>.json
 * Snap files (*.snap.json) are preferred over plain .json with the same base name.
 */
export function loadExtractions(scenarioDir: string): ReasoningInput[] {
  return loadJsonFiles(join(scenarioDir, 'extractions'));
}

/**
 * Load *.snap.json files from extractions/ as a map keyed by uppercase form code.
 * Passed to pipeline.process() as extractionSnaps to skip LLM calls for snapped forms.
 */
export function loadSnaps(scenarioDir: string): Record<string, FormExtractionOutput> {
  const dir = join(scenarioDir, 'extractions');
  if (!existsSync(dir)) return {};

  const snaps: Record<string, FormExtractionOutput> = {};
  readdirSync(dir)
    .filter((f) => f.endsWith('.snap.json'))
    .forEach((f) => {
      const raw = JSON.parse(readFileSync(join(dir, f), 'utf-8')) as ReasoningInput;
      snaps[raw.formCode.toUpperCase()] = {
        formCode: raw.formCode,
        formName: raw.formName,
        data: raw.data,
        rawResponse: '[loaded from snap]',
        promptTokens: null,
        completionTokens: null,
        modelName: 'snap',
      } as FormExtractionOutput;
    });
  return snaps;
}

/**
 * assertSnap — assert against a locked snap file without any LLM call.
 *
 * Use this inside a plain vitest `it()` block in your scenario.test.ts to validate
 * the structure and data of a previously saved extraction. Runs in every CI run for free.
 *
 * Example:
 *   it('RPA snap has correct purchase price', () => {
 *     const rpa = assertSnap(SCENARIO_DIR, 'RPA');
 *     expect(rpa.terms_of_purchase.purchase_price).toBe(451000);
 *   });
 */
export function assertSnap(scenarioDir: string, formCode: string): Record<string, unknown> {
  const snaps = loadSnaps(scenarioDir);
  const snap = snaps[formCode.toUpperCase()];
  if (!snap) throw new Error(`No snap found for ${formCode} in ${scenarioDir}/extractions/. Run extraction first and save the snap.`);
  return snap.data as Record<string, unknown>;
}

/** Internal: read .json files from a directory, preferring .snap.json over plain .json for the same base. */
function loadJsonFiles(dir: string): ReasoningInput[] {
  if (!existsSync(dir)) return [];

  const allFiles = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();

  // Build set of base names that have a snap — those supersede the plain .json
  const snapBases = new Set(
    allFiles
      .filter((f) => f.endsWith('.snap.json'))
      .map((f) => f.slice(0, -'.snap.json'.length)),
  );

  return allFiles
    .filter((f) => {
      if (f.endsWith('.snap.json')) return true;
      // Skip plain .json if a .snap.json exists for the same base name
      const base = f.slice(0, -'.json'.length);
      return !snapBases.has(base);
    })
    .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf-8')) as ReasoningInput);
}

// ── describeScenario ──────────────────────────────────────────────────────────

export interface RoundConfig {
  /** Round number for temporal scenarios (reads extractions/round-NN/). Omit for single-round. */
  round?: number;
  label: string;
  /**
   * Restrict which form codes are passed to the reasoner for this round.
   * Mirrors the production decisionFormCodes filter in StageReasoningService —
   * compliance forms (BIA, BHIA, PRBS, WFA, etc.) are still present in extractions/
   * but should not influence the reasoning LLM.
   * Omit to pass all fixtures in extractions/ to the reasoner.
   */
  formCodes?: string[];
  /** Key/value pairs to assert on the reasoning result's `data` object. */
  expect?: Record<string, unknown>;
}

export interface FormData {
  formCode: string;
  formName: string | null;
  data: Record<string, unknown>;
}

export interface ScenarioConfig {
  stage: string;
  /**
   * Prior stage context to pass into the reasoner.
   * Mirrors TransactionContext — populate with resolved facts from earlier stages
   * (e.g. finalAgreedPrice and closeOfEscrowDate from a completed CONTRACT run).
   */
  context?: TransactionContext;
  /** Extraction tests — one per PDF file. Skipped unless PDF exists + GEMINI_API_KEY set. */
  extraction?: {
    pdfFiles: string[];
    /**
     * SET 1 — Form identification assertions.
     * Called after Gemini classifies all pages and groups them by form code.
     * Runs every time the pipeline runs (snaps do not skip identification).
     * Use this to assert that the right form codes were detected and page counts are correct.
     */
    assertIdentification?: (formGroups: FormGroup[]) => void;
    /**
     * SET 2 — JSON field and value assertions.
     * Called after the LLM extracts structured JSON for each form.
     * Only runs when the LLM fires — i.e. when no snap exists for a form.
     * Use this to assert that schema changes produce the expected field values.
     */
    assertExtraction?: (forms: FormData[]) => void;
  };
  /** Reasoning tests — one per round. Skipped unless extraction fixtures exist + API key set. */
  reasoning?: RoundConfig[];
}

/**
 * describeScenario — the main entry point for scenario test files.
 *
 * Call this once at the top level of a scenario.test.ts file.
 * It registers two nested describe blocks:
 *
 *   "<name> — extraction"   runs pipeline on each PDF and prints JSON to console
 *   "<name> — reasoning"    loads saved JSON fixtures and runs LLM reasoning
 *
 * HOW TO USE (AI engineer):
 *   1. Drop PDF(s) into pdfs/
 *   2. Run extraction tests — copy printed JSON into extractions/ or extractions/round-NN/
 *   3. Edit the reasoning prompt in src/reasoner/stages/<stage>.reason.ts
 *   4. Run reasoning tests — adjust expect values to match output
 */
export function describeScenario(scenarioDir: string, config: ScenarioConfig): void {
  const name = basename(scenarioDir);
  const hasApiKeys = !!process.env.GEMINI_API_KEY;
  // Reasoning only needs Anthropic OR Gemini — no Gemini required for reasoning-only runs
  const hasReasoningKey = !!(process.env.ANTHROPIC_API_KEY || process.env.GEMINI_API_KEY);

  // ── Extraction tests ───────────────────────────────────────────────────────
  if (config.extraction) {
    describe(`${name} — extraction`, () => {
      for (const pdfFile of config.extraction!.pdfFiles) {
        const pdfPresent = hasPdf(scenarioDir, pdfFile);

        it.skipIf(!pdfPresent || !hasApiKeys)(
          `extracts ${pdfFile}`,
          async () => {
            const pipeline = buildPipeline();
            const pdf = loadPdf(scenarioDir, pdfFile);
            const snaps = loadSnaps(scenarioDir);
            const snapCount = Object.keys(snaps).length;
            if (snapCount > 0) {
              console.log(`\n[SNAP] ${snapCount} form(s) will use cached extraction: ${Object.keys(snaps).join(', ')}`);
            }

            const result = await pipeline.process(pdf, {
              extractionSnaps: snaps,
              onProgress: (e) => process.stdout.write(`\r[${e.percent}%] ${e.message}  `),
            });
            process.stdout.write('\n');

            console.log(`\n── ${pdfFile}: ${result.totalPages} pages, ${result.formGroups.length} forms ──`);
            result.formGroups.forEach((g) => {
              console.log(`  ${g.formCode}: pages ${g.pageIndices.map((i) => i + 1).join(', ')}`);
            });

            // SET 1 — identification assertions (always runs, snaps do not skip this step)
            if (config.extraction!.assertIdentification) {
              config.extraction!.assertIdentification(result.formGroups);
            }

            result.extractions.forEach((e) => {
              if (e.error) {
                console.log(`\n[ERROR] ${e.formCode}: ${e.error}`);
              } else {
                const isSnap = e.output?.modelName === 'snap';
                const variant = (e.output as Record<string, unknown>)?.variant as string | undefined;
                const version = (e.output as Record<string, unknown>)?.version as string | undefined;

                if (isSnap) {
                  console.log(`\n[SNAP] ${e.formCode} — skipped LLM, used cached extraction`);
                  return;
                }

                // Build versioned fixture filename: <code>.<variant>.<version>.snap.json
                const snapName = [
                  e.formCode.toLowerCase(),
                  variant ?? 'standard',
                  version,
                ].filter(Boolean).join('.') + '.snap.json';

                console.log(`\n── ${e.formCode} (${version ?? 'unknown version'}) — LLM extracted ──`);
                console.log(JSON.stringify(e.output?.data, null, 2));
                console.log(`\n💾 Save & lock (skips LLM next run): test/scenarios/${name}/extractions/${snapName}`);
                console.log(JSON.stringify(
                  { formCode: e.formCode, formName: e.output?.formName, variant, version, data: e.output?.data },
                  null, 2,
                ));
              }
            });

            expect(result.totalPages).toBeGreaterThan(0);
            expect(result.extractions.length).toBeGreaterThan(0);

            // SET 2 — extraction assertions (only fires when LLM ran, i.e. snap was absent)
            if (config.extraction!.assertExtraction) {
              const llmForms: FormData[] = result.extractions
                .filter((e) => e.output !== null && e.output.modelName !== 'snap')
                .map((e) => ({
                  formCode: e.formCode,
                  formName: e.output!.formName,
                  data: e.output!.data as Record<string, unknown>,
                }));
              if (llmForms.length > 0) config.extraction!.assertExtraction(llmForms);
            }
          },
          120_000,
        );

        if (!pdfPresent) {
          it.todo(`${pdfFile} — drop PDF into test/scenarios/${name}/pdfs/ to enable`);
        }
      }
    });
  }

  // ── Reasoning tests ────────────────────────────────────────────────────────
  if (config.reasoning) {
    describe(`${name} — reasoning`, () => {
      for (const roundCfg of config.reasoning!) {
        let forms = roundCfg.round != null
          ? loadRound(scenarioDir, roundCfg.round)
          : loadExtractions(scenarioDir);

        if (roundCfg.formCodes) {
          const allowed = new Set(roundCfg.formCodes.map((c) => c.toUpperCase()));
          forms = forms.filter((f) => allowed.has(f.formCode.toUpperCase()));
        }

        const fixturesPresent = forms.length > 0;
        const label = roundCfg.round != null
          ? `round ${roundCfg.round}: ${roundCfg.label}`
          : roundCfg.label;

        it.skipIf(!fixturesPresent || !hasReasoningKey)(
          label,
          async () => {
            const reasoner = buildReasoner();
            const result = await reasoner.reason(config.stage, forms, config.context);

            console.log(`\n── Reasoning: ${label} ──`);
            console.log(`Forms: ${forms.map((f) => f.formCode).join(', ')}`);
            console.log(JSON.stringify(result.data, null, 2));

            if (roundCfg.expect) {
              for (const [key, expected] of Object.entries(roundCfg.expect)) {
                expect(result.data[key], `result.data.${key}`).toBe(expected);
              }
            }
          },
          60_000,
        );

        if (!fixturesPresent) {
          const hint = roundCfg.round != null
            ? `extractions/round-${String(roundCfg.round).padStart(2, '0')}/`
            : 'extractions/';
          const codesHint = roundCfg.formCodes ? ` (formCodes filter: ${roundCfg.formCodes.join(', ')})` : '';
          it.todo(`${label} — add JSON fixtures to test/scenarios/${name}/${hint}${codesHint}`);
        }
      }
    });
  }
}
