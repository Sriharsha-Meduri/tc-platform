import type { Scenario } from '../types';

const wfaData = {
  signatures: {
    buyer_tenant: [
      { name: { value: 'John Buyer', enabled: true }, date: { value: '6/8/2026', enabled: true } },
      { name: { value: null, enabled: false }, date: { value: null, enabled: false } },
    ],
    seller_provider: [
      { name: { value: 'Jane Seller', enabled: true }, date: { value: '6/8/2026', enabled: true } },
      { name: { value: null, enabled: false }, date: { value: null, enabled: false } },
    ],
  },
};

export const wfaValid: Scenario = {
  name: 'CA-wfa-valid',
  forms: [
    { state: 'CA', formCode: 'WFA', data: wfaData },
  ],
};
