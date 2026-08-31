import { isValidEmailLocal, isValidCurrencyAmount } from './validation.util';

describe('isValidEmailLocal', () => {
  it('accepts well-formed email addresses', () => {
    expect(isValidEmailLocal('bob@sunsetrealty.com')).toBe(true);
    expect(isValidEmailLocal('  bob@sunsetrealty.com  ')).toBe(true);
  });

  it('rejects malformed email addresses', () => {
    expect(isValidEmailLocal('not-an-email')).toBe(false);
    expect(isValidEmailLocal('bob@')).toBe(false);
    expect(isValidEmailLocal('@sunsetrealty.com')).toBe(false);
    expect(isValidEmailLocal('bob sunsetrealty.com')).toBe(false);
    expect(isValidEmailLocal('')).toBe(false);
  });
});

describe('isValidCurrencyAmount', () => {
  it.each(['0', '500', '500.00', '1250.50', '0.5', '0.05'])('accepts valid decimal/currency amounts: %s', (value) => {
    expect(isValidCurrencyAmount(value)).toBe(true);
  });

  it('accepts a value with surrounding whitespace', () => {
    expect(isValidCurrencyAmount('  500.00  ')).toBe(true);
  });

  it.each([
    ['letters', 'abc'],
    ['letters mixed with digits', '500abc'],
    ['a negative value', '-5'],
    ['a negative decimal value', '-5.50'],
    ['more than 2 decimal places', '5.999'],
    ['multiple decimal points', '5..5'],
    ['a trailing decimal point with no digits', '5.'],
    ['a leading decimal point with no leading digit', '.5'],
    ['empty string', ''],
    ['whitespace only', '   '],
    ['a currency symbol', '$500'],
    ['a comma thousands separator', '1,250.50'],
  ])('rejects %s: %s', (_label, value) => {
    expect(isValidCurrencyAmount(value)).toBe(false);
  });
});
