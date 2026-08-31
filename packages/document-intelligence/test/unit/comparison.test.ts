import { describe, it, expect } from 'vitest';
import { compareRpaExtractions, compareScoExtractions, DEFAULT_RPA_MATERIAL_CONFIG, isMaterialChange } from '../../src/comparison';

describe('RPA Comparison', () => {
  it('should detect no changes when data is identical', () => {
    const data = {
      header: { property_address: '123 Main St', city: 'Los Angeles', county: 'LA' },
      parties: { buyer_names: ['John Buyer'], seller_names: ['Sally Seller'] },
      terms_of_purchase: { purchase_price: 850000, close_of_escrow_days: 30 },
    };

    const result = compareRpaExtractions(data, data);
    expect(result.hasChanges).toBe(false);
    expect(result.hasMaterialChanges).toBe(false);
    expect(isMaterialChange(result)).toBe(false);
  });

  it('should detect material change in purchase price above threshold', () => {
    const oldData = { terms_of_purchase: { purchase_price: 850000 } };
    const newData = { terms_of_purchase: { purchase_price: 855000 } };

    const result = compareRpaExtractions(oldData, newData);
    expect(result.hasChanges).toBe(true);
    expect(result.hasMaterialChanges).toBe(true);
    expect(result.changes[0].severity).toBe('material');
    expect(isMaterialChange(result)).toBe(true);
  });

  it('should detect minor change in purchase price below threshold', () => {
    const oldData = { terms_of_purchase: { purchase_price: 850000 } };
    const newData = { terms_of_purchase: { purchase_price: 850500 } };

    const result = compareRpaExtractions(oldData, newData);
    expect(result.hasChanges).toBe(true);
    expect(result.hasMaterialChanges).toBe(false);
    expect(result.changes[0].severity).toBe('minor');
    expect(isMaterialChange(result)).toBe(false);
  });

  it('should detect material change in property address', () => {
    const oldData = { header: { property_address: '123 Main St' } };
    const newData = { header: { property_address: '456 Oak Ave' } };

    const result = compareRpaExtractions(oldData, newData);
    expect(result.hasMaterialChanges).toBe(true);
  });

  it('should detect material change in buyer names', () => {
    const oldData = { parties: { buyer_names: ['John Buyer'] } };
    const newData = { parties: { buyer_names: ['Jane Buyer'] } };

    const result = compareRpaExtractions(oldData, newData);
    expect(result.hasMaterialChanges).toBe(true);
  });

  it('should detect material change in seller names', () => {
    const oldData = { parties: { seller_names: ['Sally Seller'] } };
    const newData = { parties: { seller_names: ['Sam Seller'] } };

    const result = compareRpaExtractions(oldData, newData);
    expect(result.hasMaterialChanges).toBe(true);
  });

  it('should detect material change in accepted_subject_to_counter_offer', () => {
    const oldData = { seller_acceptance: { accepted_subject_to_counter_offer: false } };
    const newData = { seller_acceptance: { accepted_subject_to_counter_offer: true } };

    const result = compareRpaExtractions(oldData, newData);
    expect(result.hasMaterialChanges).toBe(true);
  });

  it('should use custom threshold config', () => {
    const customConfig = { ...DEFAULT_RPA_MATERIAL_CONFIG, purchasePriceThreshold: 10000 };
    const oldData = { terms_of_purchase: { purchase_price: 850000 } };
    const newData = { terms_of_purchase: { purchase_price: 855000 } };

    const result = compareRpaExtractions(oldData, newData, customConfig);
    expect(result.hasMaterialChanges).toBe(false);
    expect(result.changes[0].severity).toBe('minor');
  });
});

describe('SCO Comparison', () => {
  it('should detect no changes when data is identical', () => {
    const data = {
      header: { property_address: '123 Main St', counter_offer_number: 'CO-1' },
      parties: { buyer_names: ['John Buyer'], seller_names: ['Sally Seller'] },
      counter_offer_terms: { other_terms_text: 'Close in 30 days' },
    };

    const result = compareScoExtractions(data, data);
    expect(result.hasChanges).toBe(false);
    expect(result.hasMaterialChanges).toBe(false);
  });

  it('should detect material change in property address', () => {
    const oldData = { header: { property_address: '123 Main St' } };
    const newData = { header: { property_address: '456 Oak Ave' } };

    const result = compareScoExtractions(oldData, newData);
    expect(result.hasMaterialChanges).toBe(true);
  });

  it('should detect material change in counter offer terms', () => {
    const oldData = { counter_offer_terms: { other_terms_text: 'Close in 30 days' } };
    const newData = { counter_offer_terms: { other_terms_text: 'Close in 45 days, price increased by $10k' } };

    const result = compareScoExtractions(oldData, newData);
    expect(result.hasMaterialChanges).toBe(true);
  });

  it('should detect material change in subject_to_attached_counter_offer', () => {
    const oldData = { section_5_acceptance: { subject_to_attached_counter_offer: false } };
    const newData = { section_5_acceptance: { subject_to_attached_counter_offer: true } };

    const result = compareScoExtractions(oldData, newData);
    expect(result.hasMaterialChanges).toBe(true);
  });

  it('should detect material change in expiration date', () => {
    const oldData = { expiration: { expiration_date: '2025-01-15' } };
    const newData = { expiration: { expiration_date: '2025-01-20' } };

    const result = compareScoExtractions(oldData, newData);
    expect(result.hasMaterialChanges).toBe(true);
  });
});
