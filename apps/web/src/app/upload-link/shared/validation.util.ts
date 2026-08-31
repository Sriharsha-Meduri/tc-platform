const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmailLocal(email: string): boolean {
  return EMAIL_PATTERN.test(email.trim());
}

/** A valid decimal/currency number — non-negative, at most 2 decimal places (e.g. 0, 500, 500.00, 1250.50). Rejects letters, malformed numbers, multiple decimal points, and negative values. */
const CURRENCY_PATTERN = /^\d+(\.\d{1,2})?$/;

export function isValidCurrencyAmount(value: string): boolean {
  return CURRENCY_PATTERN.test(value.trim());
}
