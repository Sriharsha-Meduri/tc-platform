import type { Scenario } from '../types';

const frrPaData = {
  agreement: {
    date: { value: '6/8/2026', enabled: true },
    property_address: { value: '300 Birch St', enabled: true },
    seller_name: { value: 'Jane Seller', enabled: true },
    buyer_name: { value: 'John Buyer', enabled: true },
  },
  signatures: {
    buyer: [
      { name: { value: 'John Buyer', enabled: true }, date: { value: '6/8/2026', enabled: true } },
      { name: { value: null, enabled: false }, date: { value: null, enabled: false } },
    ],
    seller: [
      { name: { value: 'Jane Seller', enabled: true }, date: { value: '6/8/2026', enabled: true } },
      { name: { value: null, enabled: false }, date: { value: null, enabled: false } },
    ],
  },
};

export const frrPaValid: Scenario = {
  name: 'CA-FRR-PA-valid',
  forms: [
    { state: 'CA', formCode: 'FRR-PA', data: frrPaData },
  ],
};
