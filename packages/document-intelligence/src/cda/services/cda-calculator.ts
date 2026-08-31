import type { CdaFieldName, CdaGenerationInput, ResolvedCdaValues } from '../types/cda.types';

/**
 * All CDA calculation, normalization, and formatting logic lives here — the
 * generator (cda-generator.ts) never computes, defaults, or formats a value
 * itself, it only places whatever resolveCdaValues/getCdaDisplayValue hand
 * it. This is the one file to change if the disbursement formula, currency
 * format, or date format ever needs to change.
 */

// ─── Commission math ────────────────────────────────────────────────────────

/**
 * The CDA's total commission line — the sum of every commission leg being
 * disbursed. No formula for splitting or deriving these three amounts
 * exists elsewhere in the codebase (broker-commission.service.ts only
 * stores negotiated commission *terms*, not a disbursement breakdown), so
 * this is a fresh, additive formula rather than a refactor of existing
 * logic. If a real disbursement formula (e.g. a myTC platform-fee
 * percentage) is introduced elsewhere later, this is the one place to wire
 * it in — every caller of resolveCdaValues gets it automatically.
 */
export function calculateTotalCommissionToDisburse(
  brokerCommissionAmount: number,
  agentCommissionAmount: number,
  mytcAppCommissionAmount: number,
): number {
  return brokerCommissionAmount + agentCommissionAmount + mytcAppCommissionAmount;
}

// ─── Normalization + validation ────────────────────────────────────────────

/**
 * A commission/currency amount must be a finite, non-negative number.
 * Zero is always valid (e.g. myTC's platform fee may legitimately be $0 on
 * a given deal) — only NaN, +/-Infinity, and negative values are rejected.
 */
function assertValidAmount(value: number, fieldName: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`CDA field "${fieldName}" must be a finite number, received: ${value}`);
  }
  if (value < 0) {
    throw new Error(`CDA field "${fieldName}" cannot be negative, received: ${value}`);
  }
}

/** Missing (null/undefined) commission legs default to 0 — a CDA can legitimately have no agent commission, for example. */
export function normalizeCommissionAmount(value: number | null | undefined, fieldName: string): number {
  const resolved = value ?? 0;
  assertValidAmount(resolved, fieldName);
  return resolved;
}

/** Missing client credits default to 0 — this is the "no credits" case, distinct from an explicit $0 which normalizes to the same value. */
export function normalizeClientCredits(value: number | null | undefined): number {
  const resolved = value ?? 0;
  assertValidAmount(resolved, 'clientCredits');
  return resolved;
}

/** Sale price is required and must be a real, positive dollar amount — unlike the optional commission legs, there is no sensible "missing" default. */
export function normalizeSalePrice(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`CDA field "salePrice" must be a finite, positive number, received: ${value}`);
  }
  return value;
}

// ─── Formatting (centralized — never duplicated in the generator) ─────────

/** Every CdaFieldName whose resolved value is a dollar amount and must be rendered via formatCurrency. */
const CDA_CURRENCY_FIELDS: ReadonlySet<CdaFieldName> = new Set([
  'salePrice',
  'clientCredits',
  'totalCommissionToDisburse',
  'brokerCommissionAmount',
  'agentCommissionAmount',
  'mytcAppCommissionAmount',
]);

export function formatCurrency(value: number): string {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

/**
 * MM-DD-YYYY, zero-padded — matches the date format already established
 * elsewhere in the codebase (signed-document-notification.service.ts,
 * transaction-welcome-email.service.ts), so a CDA date reads consistently
 * with every other date myTC sends. Returns null for a missing/empty input
 * (never the string "N/A"/"Not Specified") so the generator can skip
 * drawing it entirely.
 */
export function formatCdaDate(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${m}-${d}-${y}`;
}

// ─── Resolution — the single place raw input becomes render-ready values ──

/**
 * Turns whatever a caller supplied (CdaGenerationInput — optional fields,
 * raw Date|string dates, unvalidated numbers) into ResolvedCdaValues — every
 * default applied, every amount validated, every date formatted, the
 * disbursement total computed. cda-generator.ts calls this exactly once,
 * before it ever touches a PDF coordinate.
 */
export function resolveCdaValues(input: CdaGenerationInput): ResolvedCdaValues {
  const brokerCommissionAmount = normalizeCommissionAmount(input.brokerCommissionAmount, 'brokerCommissionAmount');
  const agentCommissionAmount = normalizeCommissionAmount(input.agentCommissionAmount, 'agentCommissionAmount');
  const mytcAppCommissionAmount = normalizeCommissionAmount(input.mytcAppCommissionAmount, 'mytcAppCommissionAmount');

  const totalCommissionToDisburse = calculateTotalCommissionToDisburse(
    brokerCommissionAmount,
    agentCommissionAmount,
    mytcAppCommissionAmount,
  );

  return {
    brokerage: input.brokerage,
    brokerName: input.brokerName,
    agent: input.agent,

    escrowNumber: input.escrowNumber ?? null,

    salePrice: normalizeSalePrice(input.salePrice),

    closeOfEscrowDate: formatCdaDate(input.closeOfEscrowDate),

    clientCredits: normalizeClientCredits(input.clientCredits),

    totalCommissionToDisburse,

    brokerageAddress: input.brokerageAddress ?? null,
    agentAddress: input.agentAddress ?? null,

    brokerCommissionAmount,
    agentCommissionAmount,
    mytcAppCommissionAmount,

    brokerSignature: input.brokerSignature ?? null,

    // `date` (unlike the optional closeOfEscrowDate) always renders — it
    // defaults to "now" rather than being left blank, since every CDA needs
    // a date on it even when the caller doesn't supply one explicitly.
    date: formatCdaDate(input.date ?? new Date())!,
  };
}

// ─── Display-value selection — the one place a field decides its own text ─

/**
 * The final, render-ready display value for one CDA field — a formatted
 * string for text/currency/date fields, the raw signature Buffer/string for
 * `brokerSignature` (the generator special-cases that one into an image
 * draw), or `null` when there's nothing to render (a missing optional
 * field). Never returns "N/A", "Not Specified", "undefined", or "null" as
 * text — a field with no value is simply skipped, not printed as absent.
 */
export function getCdaDisplayValue(fieldName: CdaFieldName, values: ResolvedCdaValues): string | Buffer | null {
  if (fieldName === 'brokerSignature') {
    return values.brokerSignature;
  }

  const raw = values[fieldName as Exclude<CdaFieldName, 'brokerSignature'>];
  if (raw === null || raw === undefined || raw === '') return null;

  if (CDA_CURRENCY_FIELDS.has(fieldName)) {
    return formatCurrency(raw as number);
  }

  // closeOfEscrowDate/date are already formatted strings by the time they
  // reach ResolvedCdaValues (see resolveCdaValues) — every other field is
  // plain text, so both cases fall through to a direct string return.
  return String(raw);
}
