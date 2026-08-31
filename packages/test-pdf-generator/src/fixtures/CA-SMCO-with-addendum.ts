import type { Scenario } from '../types';

const smcoWithAddendumData = {
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
    is_expiration_time_PM: { value: null, enabled: false },
  },
  section_5: {
    seller_name_1: { value: 'Jane Seller', enabled: true },
    seller_name_2: { value: null, enabled: false },
    date_1: { value: '2026-06-07', enabled: true },
  },
  section_7: {
    acceptance_isSubjectAttachedCounterOffer: { value: null, enabled: false },
    acceptance_buyer_name_1: { value: 'John Buyer', enabled: true },
    acceptance_buyer_name_2: { value: 'John Buyer Jr.', enabled: false },
    acceptance_date_1: { value: '2026-06-08', enabled: true },
  },
  addendum_page_3: {
    addendum_no: { value: '1', enabled: true },
    address: { value: '123 Main Street', enabled: true },
    buyer: { value: 'John Buyer', enabled: true },
    seller: { value: 'Jane Seller', enabled: true },
    additional_text: { value: 'Additional terms and conditions as agreed upon by both parties. Seller agrees to include washer, dryer, and refrigerator. Buyer has the right to conduct a final walk-through within 24 hours prior to closing.', enabled: true },
    buyer_signature: { value: 'John Buyer', enabled: true },
    buyer_signature_date: { value: '2026-06-07', enabled: true },
    seller_signature: { value: 'Jane Seller', enabled: true },
    seller_signature_date: { value: '2026-06-07', enabled: true },
  },
  addendum_page_4: {
    addendum_no: { value: '2', enabled: true },
    address: { value: '123 Main Street', enabled: true },
    buyer: { value: 'John Buyer', enabled: true },
    seller: { value: 'Jane Seller', enabled: true },
    additional_text: { value: 'Continued addendum terms. Buyer and seller agree to a 60-day escrow period. Property to be delivered in broom-clean condition. All personal property listed in the RPA to remain with the property.', enabled: true },
    buyer_signature: { value: 'John Buyer', enabled: true },
    buyer_signature_date: { value: '2026-06-07', enabled: true },
    seller_signature: { value: 'Jane Seller', enabled: true },
    seller_signature_date: { value: '2026-06-07', enabled: true },
  },
};

export const smcoWithAddendum: Scenario = {
  name: 'CA-SMCO-with-addendum',
  forms: [
    { state: 'CA', formCode: 'SMCO-WITH-ADDENDUM', data: smcoWithAddendumData },
  ],
};
