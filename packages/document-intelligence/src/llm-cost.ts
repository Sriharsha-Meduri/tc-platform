/**
 * Estimate Gemini API cost from token usage.
 *
 * Pricing is dollars per 1M tokens. Defaults reflect current Gemini rates and
 * can be overridden per model via env vars:
 *   GEMINI_INPUT_COST_PER_1M   — input (prompt) cost per 1M tokens
 *   GEMINI_OUTPUT_COST_PER_1M  — output (completion) cost per 1M tokens
 *
 * When a model isn't in the table, the generic fallback is used (also overridable).
 */

interface ModelCost {
  inputPer1M: number;
  outputPer1M: number;
}

const PRICING: Record<string, ModelCost> = {
  'gemini-3.6-flash': { inputPer1M: 0.30, outputPer1M: 2.50 },
  'gemini-2.5-pro': { inputPer1M: 1.25, outputPer1M: 10.00 },
  'gemini-3.5-flash': { inputPer1M: 0.30, outputPer1M: 2.50 },
  'gemini-3.1-flash-lite': { inputPer1M: 0.10, outputPer1M: 0.40 },
  'gemini-2.5-flash-lite': { inputPer1M: 0.10, outputPer1M: 0.40 },
  'gemini-flash-latest': { inputPer1M: 0.30, outputPer1M: 2.50 },
  'gemini-pro-latest': { inputPer1M: 1.25, outputPer1M: 10.00 },
};

function modelKey(model: string | null | undefined): string {
  if (!model) return 'unknown';
  const m = model.toLowerCase();
  if (m.includes('3.6')) return 'gemini-3.6-flash';
  if (m.includes('2.5-pro')) return 'gemini-2.5-pro';
  if (m.includes('2.5-flash-lite')) return 'gemini-2.5-flash-lite';
  if (m.includes('3.5-flash')) return 'gemini-3.5-flash';
  if (m.includes('3.1-flash-lite')) return 'gemini-3.1-flash-lite';
  if (m.includes('pro-latest') || m.includes('pro')) return 'gemini-pro-latest';
  if (m.includes('flash')) return 'gemini-flash-latest';
  return 'unknown';
}

function numOr(v: string | undefined, fallback: number): number {
  const n = v ? parseFloat(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

function getRate(model: string | null | undefined, input: boolean): number {
  const key = modelKey(model);
  const env = input ? process.env.GEMINI_INPUT_COST_PER_1M : process.env.GEMINI_OUTPUT_COST_PER_1M;
  const p = PRICING[key];
  const fallback = p ? (input ? p.inputPer1M : p.outputPer1M) : (input ? 0.30 : 2.50);
  return numOr(env, fallback);
}

export function estimateLlmCostUsd(
  model: string | null | undefined,
  promptTokens: number | null | undefined,
  completionTokens: number | null | undefined,
): number | null {
  const pt = promptTokens ?? 0;
  const ct = completionTokens ?? 0;
  if (pt <= 0 && ct <= 0) return null;

  const inputCost = (pt / 1_000_000) * getRate(model, true);
  const outputCost = (ct / 1_000_000) * getRate(model, false);
  const cost = Math.round((inputCost + outputCost) * 1_000_000) / 1_000_000;
  return cost > 0 ? cost : null;
}
