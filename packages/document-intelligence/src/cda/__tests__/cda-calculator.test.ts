import { describe, it, expect } from 'vitest';
import {
  calculateTotalCommissionToDisburse,
  normalizeCommissionAmount,
  normalizeClientCredits,
  normalizeSalePrice,
  formatCdaDate,
  formatCurrency,
  resolveCdaValues,
  getCdaDisplayValue,
} from '../services/cda-calculator';
import type { CdaGenerationInput } from '../types/cda.types';

const BASE_INPUT: CdaGenerationInput = {
  brokerage: 'Sunset Realty',
  brokerName: 'Jane Broker',
  agent: 'Bob Agent',
  salePrice: 750000,
};

describe('calculateTotalCommissionToDisburse', () => {
  it('sums the three commission legs', () => {
    expect(calculateTotalCommissionToDisburse(10000, 5000, 500)).toBe(15500);
  });

  it('handles all-zero commission values', () => {
    expect(calculateTotalCommissionToDisburse(0, 0, 0)).toBe(0);
  });

  it('handles a mix of zero and non-zero legs', () => {
    expect(calculateTotalCommissionToDisburse(0, 5000, 0)).toBe(5000);
  });
});

describe('normalizeCommissionAmount', () => {
  it('defaults a missing (null/undefined) commission leg to 0', () => {
    expect(normalizeCommissionAmount(null, 'brokerCommissionAmount')).toBe(0);
    expect(normalizeCommissionAmount(undefined, 'brokerCommissionAmount')).toBe(0);
  });

  it('accepts an explicit 0 as a valid value, not a missing one', () => {
    expect(normalizeCommissionAmount(0, 'agentCommissionAmount')).toBe(0);
  });

  it('passes through a positive value unchanged', () => {
    expect(normalizeCommissionAmount(1234.56, 'mytcAppCommissionAmount')).toBe(1234.56);
  });

  it('rejects a negative commission amount', () => {
    expect(() => normalizeCommissionAmount(-1, 'brokerCommissionAmount')).toThrow(/cannot be negative/);
  });

  it('rejects a non-finite commission amount', () => {
    expect(() => normalizeCommissionAmount(Infinity, 'brokerCommissionAmount')).toThrow(/finite number/);
    expect(() => normalizeCommissionAmount(NaN, 'brokerCommissionAmount')).toThrow(/finite number/);
  });
});

describe('normalizeClientCredits', () => {
  it('defaults missing client credits to 0', () => {
    expect(normalizeClientCredits(null)).toBe(0);
    expect(normalizeClientCredits(undefined)).toBe(0);
  });

  it('accepts an explicit 0 — "no client credits" is a valid, distinct answer', () => {
    expect(normalizeClientCredits(0)).toBe(0);
  });

  it('passes through a positive value unchanged', () => {
    expect(normalizeClientCredits(2500)).toBe(2500);
  });

  it('rejects a negative client credits value', () => {
    expect(() => normalizeClientCredits(-100)).toThrow(/cannot be negative/);
  });
});

describe('normalizeSalePrice', () => {
  it('passes through a valid positive sale price', () => {
    expect(normalizeSalePrice(500000)).toBe(500000);
  });

  it('rejects a zero or negative sale price — there is no sensible "missing" default', () => {
    expect(() => normalizeSalePrice(0)).toThrow(/positive/);
    expect(() => normalizeSalePrice(-500000)).toThrow(/positive/);
  });

  it('rejects a non-finite sale price', () => {
    expect(() => normalizeSalePrice(NaN)).toThrow();
  });
});

describe('formatCurrency', () => {
  it('formats a whole-dollar amount with a leading $ and .00 cents', () => {
    expect(formatCurrency(500)).toBe('$500.00');
  });

  it('formats an amount with cents', () => {
    expect(formatCurrency(1250.5)).toBe('$1,250.50');
  });

  it('formats zero', () => {
    expect(formatCurrency(0)).toBe('$0.00');
  });

  it('formats a large amount with thousands separators', () => {
    expect(formatCurrency(1234567.89)).toBe('$1,234,567.89');
  });
});

describe('formatCdaDate', () => {
  it('formats a Date object as MM-DD-YYYY, zero-padded', () => {
    expect(formatCdaDate(new Date(2026, 0, 5))).toBe('01-05-2026');
  });

  it('formats a Date object with a two-digit month and day unchanged', () => {
    expect(formatCdaDate(new Date(2026, 10, 25))).toBe('11-25-2026');
  });

  it('formats an ISO date string the same way as an equivalent Date object', () => {
    expect(formatCdaDate('2026-03-15T00:00:00')).toBe('03-15-2026');
  });

  it('returns null (never a placeholder string) for null/undefined/empty input', () => {
    expect(formatCdaDate(null)).toBeNull();
    expect(formatCdaDate(undefined)).toBeNull();
    expect(formatCdaDate('')).toBeNull();
  });

  it('returns null for an unparseable date string rather than throwing', () => {
    expect(formatCdaDate('not-a-date')).toBeNull();
  });
});

describe('resolveCdaValues', () => {
  it('defaults every optional field to null/0 when omitted', () => {
    const resolved = resolveCdaValues(BASE_INPUT);
    expect(resolved.escrowNumber).toBeNull();
    expect(resolved.closeOfEscrowDate).toBeNull();
    expect(resolved.clientCredits).toBe(0);
    expect(resolved.brokerageAddress).toBeNull();
    expect(resolved.agentAddress).toBeNull();
    expect(resolved.brokerCommissionAmount).toBe(0);
    expect(resolved.agentCommissionAmount).toBe(0);
    expect(resolved.mytcAppCommissionAmount).toBe(0);
    expect(resolved.totalCommissionToDisburse).toBe(0);
    expect(resolved.brokerSignature).toBeNull();
  });

  it('always resolves `date` even when omitted — it defaults to now, never null', () => {
    const resolved = resolveCdaValues(BASE_INPUT);
    expect(resolved.date).toMatch(/^\d{2}-\d{2}-\d{4}$/);
  });

  it('computes totalCommissionToDisburse from the three supplied commission legs', () => {
    const resolved = resolveCdaValues({
      ...BASE_INPUT,
      brokerCommissionAmount: 15000,
      agentCommissionAmount: 7500,
      mytcAppCommissionAmount: 250,
    });
    expect(resolved.totalCommissionToDisburse).toBe(22750);
  });

  it('passes through every required field unchanged', () => {
    const resolved = resolveCdaValues(BASE_INPUT);
    expect(resolved.brokerage).toBe('Sunset Realty');
    expect(resolved.brokerName).toBe('Jane Broker');
    expect(resolved.agent).toBe('Bob Agent');
    expect(resolved.salePrice).toBe(750000);
  });

  it('formats closeOfEscrowDate when supplied', () => {
    const resolved = resolveCdaValues({ ...BASE_INPUT, closeOfEscrowDate: new Date(2026, 5, 1) });
    expect(resolved.closeOfEscrowDate).toBe('06-01-2026');
  });
});

describe('getCdaDisplayValue', () => {
  const resolved = resolveCdaValues({
    ...BASE_INPUT,
    escrowNumber: 'ESC-12345',
    clientCredits: 500,
    brokerCommissionAmount: 10000,
    agentCommissionAmount: 5000,
    mytcAppCommissionAmount: 500,
    closeOfEscrowDate: new Date(2026, 5, 1),
  });

  it('formats currency fields via formatCurrency', () => {
    expect(getCdaDisplayValue('salePrice', resolved)).toBe('$750,000.00');
    expect(getCdaDisplayValue('clientCredits', resolved)).toBe('$500.00');
    expect(getCdaDisplayValue('totalCommissionToDisburse', resolved)).toBe('$15,500.00');
    expect(getCdaDisplayValue('brokerCommissionAmount', resolved)).toBe('$10,000.00');
    expect(getCdaDisplayValue('agentCommissionAmount', resolved)).toBe('$5,000.00');
    expect(getCdaDisplayValue('mytcAppCommissionAmount', resolved)).toBe('$500.00');
  });

  it('passes through already-formatted date strings unchanged', () => {
    expect(getCdaDisplayValue('closeOfEscrowDate', resolved)).toBe('06-01-2026');
  });

  it('passes through plain text fields unchanged', () => {
    expect(getCdaDisplayValue('brokerage', resolved)).toBe('Sunset Realty');
    expect(getCdaDisplayValue('escrowNumber', resolved)).toBe('ESC-12345');
  });

  it('returns the raw signature value untouched (never stringified into text)', () => {
    const withSignature = resolveCdaValues({ ...BASE_INPUT, brokerSignature: Buffer.from([0x89, 0x50, 0x4e, 0x47]) });
    const value = getCdaDisplayValue('brokerSignature', withSignature);
    expect(Buffer.isBuffer(value)).toBe(true);
  });

  it('returns null for a missing optional field — never "N/A", "Not Specified", "undefined", or "null"', () => {
    const minimal = resolveCdaValues(BASE_INPUT);
    for (const field of ['escrowNumber', 'closeOfEscrowDate', 'brokerageAddress', 'agentAddress', 'brokerSignature'] as const) {
      const value = getCdaDisplayValue(field, minimal);
      expect(value).toBeNull();
    }
  });
});
