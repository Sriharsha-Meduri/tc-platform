import type { Scenario } from '../types';

const smcoData = {
  header: {
    counter_offer_no: { value: '1', enabled: true },
    date: { value: '2026-06-07', enabled: true },
  },
  offer_ref: {
    buyer_counter_no: { value: null, enabled: true },
    offer_dated: { value: '2026-06-01', enabled: true },
    address: { value: '123 Main Street', enabled: true },
    buyer_name: { value: 'John Buyer', enabled: true },
    seller_name: { value: 'Jane Seller', enabled: true },
  },
  section_1: {
    other_terms: { value: 'Purchase price increased to $925,000. Seller to credit buyer $5,000 towards closing costs.', enabled: true },
  },
  section_3: {
    expiration_time: { value: '5:00', enabled: true },
    expiration_date: { value: '2026-06-10', enabled: true },
    is_expiration_time_AM: { value: 'X', enabled: true },
    is_expiration_time_PM: { value: 'X', enabled: false },
  },
  section_5: {
    seller_name_1: { value: 'Jane Seller', enabled: true },
    seller_name_2: { value: null, enabled: false },
    date_1: { value: '2026-06-07', enabled: true },
    date_2: { value: null, enabled: false },
  },
  section_7: {
    acceptance_isSubjectAttachedCounterOffer: { value: false, enabled: true },
    acceptance_buyer_name_1: { value: 'John Buyer', enabled: true },
    acceptance_buyer_name_2: { value: 'John Buyer 2', enabled: true },
    acceptance_date_1: { value: '2026-06-08', enabled: true },
    acceptance_date_2: { value: '2026-06-08', enabled: true },
  },
};

export const smcoValid: Scenario = {
  name: 'CA-SMCO-valid',
  forms: [
    { state: 'CA', formCode: 'SMCO', data: smcoData },
  ],
};
