import { describe, it, expect } from 'vitest';
import { FORM_FAMILIES } from '../../src/sequence/form-families';
import {
  getFamilyForFormCode,
  isInSameFamily,
  findLatestInFamily,
} from '../../src/sequence/resolver';

describe('FORM_FAMILIES', () => {
  it('has counter_offer family with 4 form codes', () => {
    const co = FORM_FAMILIES.find((f) => f.id === 'counter_offer');
    expect(co).toBeDefined();
    expect(co!.formCodes).toEqual(['SCO', 'BCO', 'SMCO', 'BMCO']);
    expect(co!.crossMemberAction).toBe('superseded');
  });
});

describe('getFamilyForFormCode', () => {
  it.each(['SCO', 'BCO', 'SMCO', 'BMCO'])('identifies %s as counter_offer', (code) => {
    const family = getFamilyForFormCode(code);
    expect(family).not.toBeNull();
    expect(family!.id).toBe('counter_offer');
  });

  it('returns null for RPA', () => {
    expect(getFamilyForFormCode('RPA')).toBeNull();
  });

  it('returns null for unknown codes', () => {
    expect(getFamilyForFormCode('UNKNOWN')).toBeNull();
  });
});

describe('isInSameFamily', () => {
  it('returns true for SCO and BCO', () => {
    expect(isInSameFamily('SCO', 'BCO')).toBe(true);
  });

  it('returns true for SMCO and BMCO', () => {
    expect(isInSameFamily('SMCO', 'BMCO')).toBe(true);
  });

  it('returns false for SCO and RPA', () => {
    expect(isInSameFamily('SCO', 'RPA')).toBe(false);
  });

  it('is case insensitive', () => {
    expect(isInSameFamily('sco', 'Bco')).toBe(true);
  });
});

describe('findLatestInFamily', () => {
  const docs = [
    { metadataJson: { detectedFormCode: 'SCO' } },
    { metadataJson: { detectedFormCode: 'RPA' } },
    { metadataJson: { detectedFormCode: 'TDS' } },
  ];

  it('finds SCO when uploading BCO', () => {
    const match = findLatestInFamily(docs, 'BCO');
    expect(match).not.toBeNull();
    expect(match!.index).toBe(0);
    expect(match!.isCrossMember).toBe(true);
  });

  it('finds SCO when uploading SCO (same code, not cross-member)', () => {
    const match = findLatestInFamily(docs, 'SCO');
    expect(match).not.toBeNull();
    expect(match!.index).toBe(0);
    expect(match!.isCrossMember).toBe(false);
  });

  it('returns null when no counter offer exists', () => {
    const noCounterDocs = [
      { metadataJson: { detectedFormCode: 'RPA' } },
      { metadataJson: { detectedFormCode: 'TDS' } },
    ];
    expect(findLatestInFamily(noCounterDocs, 'BCO')).toBeNull();
  });

  it('returns null for non-family forms', () => {
    expect(findLatestInFamily(docs, 'RPA')).toBeNull();
  });

  it('handles empty doc list', () => {
    expect(findLatestInFamily([], 'BCO')).toBeNull();
  });

  it('handles docs with null metadataJson', () => {
    const messyDocs = [
      { metadataJson: null },
      { metadataJson: { detectedFormCode: 'SCO' } },
    ];
    const match = findLatestInFamily(messyDocs, 'BCO');
    expect(match).not.toBeNull();
    expect(match!.index).toBe(1);
  });

  it('prefers higher counterOfferNumber over earlier index', () => {
    const docs = [
      { metadataJson: { detectedFormCode: 'SCO', counterOfferNumber: '1' } },
      { metadataJson: { detectedFormCode: 'BCO', counterOfferNumber: '2' } },
    ];
    const match = findLatestInFamily(docs, 'SCO');
    expect(match).not.toBeNull();
    expect(match!.index).toBe(1);
    expect(match!.isCrossMember).toBe(true);
  });

  it('handles non-numeric counterOfferNumber gracefully', () => {
    const docs = [
      { metadataJson: { detectedFormCode: 'SCO', counterOfferNumber: 'abc' } },
      { metadataJson: { detectedFormCode: 'BCO', counterOfferNumber: '2' } },
    ];
    const match = findLatestInFamily(docs, 'SCO');
    expect(match).not.toBeNull();
    expect(match!.index).toBe(1);
  });

  it('picks higher number among same-form counter offers', () => {
    const docs = [
      { metadataJson: { detectedFormCode: 'SCO', counterOfferNumber: '2' } },
      { metadataJson: { detectedFormCode: 'SCO', counterOfferNumber: '5' } },
    ];
    const match = findLatestInFamily(docs, 'SCO');
    expect(match).not.toBeNull();
    expect(match!.index).toBe(1);
    expect(match!.isCrossMember).toBe(false);
  });
});
