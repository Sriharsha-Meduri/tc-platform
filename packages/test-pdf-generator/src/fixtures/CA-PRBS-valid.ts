import type { Scenario } from '../types';

const prbsData = {
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
  brokerage: {
    buyer: {
      firm_name: { value: 'Williams Costal Properties', enabled: true },
      dre_license: { value: '74366457', enabled: true },
      by_name: { value: 'Andrew Van', enabled: true },
      by_dre_license: { value: '1234599', enabled: true },
      date: { value: '6/8/2026', enabled: true },
    },
    seller: {
      firm_name: { value: 'Blue Lotus Reality', enabled: true },
      dre_license: { value: '74382457', enabled: true },
      by_name: { value: 'Robert Gram', enabled: true },
      by_dre_license: { value: '3467890', enabled: true },
      date: { value: '6/8/2026', enabled: true },
    },
  },
};

export const prbsValid: Scenario = {
  name: 'CA-PRBS-valid',
  forms: [
    { state: 'CA', formCode: 'PRBS', data: prbsData },
  ],
};
