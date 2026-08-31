import { describe, it, expect } from 'vitest';
import { reconcileFieldWithCrop } from '../../src/validator/stages/contract.field-crop-enrichment';
import type { ExtractedContractField, FieldSource } from '../../src/extractor/extractor.types';
import type { FieldCropExtractionResult } from '../../src/extractor/field-regions/field-region-extractor';

const source: FieldSource = { documentId: null, formCode: 'SCO', page: 1 };

function pageField(value: number | null): ExtractedContractField<number> {
  return {
    value,
    defaultValue: null,
    enteredValue: value,
    sourceType: 'typed',
    source: { documentId: null, formCode: 'SCO', page: 1 },
  };
}

function crop(value: number | null): FieldCropExtractionResult<number> {
  return { field: 'purchasePrice', page: 1, value, sourceType: 'vision', evidenceText: '$925,000', confidence: 0.9 };
}

describe('reconcileFieldWithCrop', () => {
  it('rescues a missing page-level value with the crop reading, fully sourced', () => {
    const { field, warning } = reconcileFieldWithCrop<number>(null, crop(925000), source);
    expect(warning).toBeNull();
    expect(field?.value).toBe(925000);
    expect(field?.enteredValue).toBe(925000);
    expect(field?.sourceType).toBe('vision');
    expect(field?.source).toEqual(source);
  });

  it('keeps the page-level field unchanged when the crop agrees', () => {
    const existing = pageField(925000);
    const { field, warning } = reconcileFieldWithCrop(existing, crop(925000), source);
    expect(warning).toBeNull();
    expect(field).toBe(existing);
  });

  it('NEVER overwrites a disagreeing page-level value — keeps it and records a warning instead', () => {
    const existing = pageField(925000);
    const { field, warning } = reconcileFieldWithCrop(existing, crop(1000000), source);
    expect(field).toBe(existing);
    expect(field?.value).toBe(925000);
    expect(warning).toContain('925000');
    expect(warning).toContain('1000000');
  });

  it('is a no-op when the crop found nothing', () => {
    const existing = pageField(925000);
    const { field, warning } = reconcileFieldWithCrop(existing, crop(null), source);
    expect(field).toBe(existing);
    expect(warning).toBeNull();
  });

  it('is a no-op when both the page and the crop found nothing', () => {
    const { field, warning } = reconcileFieldWithCrop<number>(null, crop(null), source);
    expect(field).toBeNull();
    expect(warning).toBeNull();
  });

  it('a false-negative crop cannot flip a true page-level value — same guarantee as the footer-initials merge', () => {
    // The page pass correctly found "9" days; the crop (looking at a worse
    // or off-target region) reports nothing at all. The page value must survive.
    const existing = pageField(9);
    const { field, warning } = reconcileFieldWithCrop(existing, crop(null), source);
    expect(field?.value).toBe(9);
    expect(warning).toBeNull();
  });
});
