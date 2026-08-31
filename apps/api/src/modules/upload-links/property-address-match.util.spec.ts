import { propertyAddressMatchesTransaction, extractHeaderPropertyAddress, appendAddressMismatchBlocker } from './property-address-match.util';
import type { ComplianceResult } from '../document-extraction/compliance-result.types';

describe('propertyAddressMatchesTransaction', () => {
  it('matches when the street number and a street-name word both appear, ignoring abbreviation differences', () => {
    expect(propertyAddressMatchesTransaction('123 Main Street, Chino, CA 91708', '123 Main St')).toBe(true);
  });

  it('matches regardless of case, punctuation, and extra unit/suite noise', () => {
    expect(propertyAddressMatchesTransaction('123 MAIN ST. APT #4, Chino, CA', '123 Main St')).toBe(true);
  });

  it('does not match when the street number differs', () => {
    expect(propertyAddressMatchesTransaction('456 Main St, Chino, CA', '123 Main St')).toBe(false);
  });

  it('does not match when the street name differs entirely', () => {
    expect(propertyAddressMatchesTransaction('123 Oak Ave, Chino, CA', '123 Main St')).toBe(false);
  });

  it('does not match when the extracted address is missing entirely', () => {
    expect(propertyAddressMatchesTransaction(null, '123 Main St')).toBe(false);
    expect(propertyAddressMatchesTransaction(undefined, '123 Main St')).toBe(false);
  });

  it('never blocks when the transaction itself has no usable address to compare against', () => {
    expect(propertyAddressMatchesTransaction('anything at all', null)).toBe(true);
    expect(propertyAddressMatchesTransaction(null, null)).toBe(true);
    expect(propertyAddressMatchesTransaction(null, '')).toBe(true);
  });
});

describe('extractHeaderPropertyAddress', () => {
  it('reads property_address from a nested header object (the RR/RRRR extraction shape)', () => {
    expect(extractHeaderPropertyAddress({ header: { property_address: '123 Main St' } })).toBe('123 Main St');
  });

  it('returns null when the header has no property_address', () => {
    expect(extractHeaderPropertyAddress({ header: {} })).toBeNull();
  });

  it('returns null for a blank/whitespace-only address', () => {
    expect(extractHeaderPropertyAddress({ header: { property_address: '   ' } })).toBeNull();
  });

  it('returns null for null/undefined extraction input', () => {
    expect(extractHeaderPropertyAddress(null)).toBeNull();
    expect(extractHeaderPropertyAddress(undefined)).toBeNull();
  });

  it('falls back to a flat (non-nested) property_address field when there is no header object', () => {
    expect(extractHeaderPropertyAddress({ property_address: '123 Main St' })).toBe('123 Main St');
  });
});

describe('appendAddressMismatchBlocker', () => {
  function makeCompliantResult(): ComplianceResult {
    return {
      sourceType: 'llm_extraction',
      hasAcroForm: false,
      acroFieldCount: 0,
      checks: [],
      blockers: [],
      warnings: [],
      summary: { overallStatus: 'compliant', passCount: 1, failCount: 0, warningCount: 0, skippedCount: 0 },
      signatureFields: [],
      emptyRequiredAcroFields: [],
    };
  }

  it('appends a BLOCKER_RR_ADDRESS_MISMATCH and flips overallStatus to non_compliant, in a new object', () => {
    const original = makeCompliantResult();
    const result = appendAddressMismatchBlocker(original, 'RR');

    expect(result.blockers).toHaveLength(1);
    expect(result.blockers![0].code).toBe('BLOCKER_RR_ADDRESS_MISMATCH');
    expect(result.blockers![0].compositeId).toBe('BLOCKER-RR-40006');
    expect(result.summary.overallStatus).toBe('non_compliant');
    expect(result.summary.failCount).toBe(1);

    // The input is never mutated — callers (and any shared/cached ComplianceResult reference) are unaffected.
    expect(original.blockers).toHaveLength(0);
    expect(original.summary.overallStatus).toBe('compliant');
  });

  it('appends a BLOCKER_RRRR_ADDRESS_MISMATCH for RRRR', () => {
    const result = appendAddressMismatchBlocker(makeCompliantResult(), 'RRRR');

    expect(result.blockers![0].code).toBe('BLOCKER_RRRR_ADDRESS_MISMATCH');
    expect(result.blockers![0].compositeId).toBe('BLOCKER-RRRR-41006');
  });

  it('preserves any existing blockers already on the result', () => {
    const original = makeCompliantResult();
    original.blockers = [{ code: 'BLOCKER_RR_BUYER_SIG', compositeId: 'BLOCKER-RR-40004', message: 'x', formCode: 'RR', type: 'blocker' }];
    original.summary.overallStatus = 'non_compliant';
    original.summary.failCount = 1;

    const result = appendAddressMismatchBlocker(original, 'RR');

    expect(result.blockers).toHaveLength(2);
    // Already non_compliant — failCount is not double-incremented for a status that was already failing.
    expect(result.summary.failCount).toBe(1);
  });

  it('calling it twice on the same original object does not compound — each call starts from the same unmutated input', () => {
    const original = makeCompliantResult();
    const first = appendAddressMismatchBlocker(original, 'RR');
    const second = appendAddressMismatchBlocker(original, 'RR');

    expect(first.blockers).toHaveLength(1);
    expect(second.blockers).toHaveLength(1);
  });
});
