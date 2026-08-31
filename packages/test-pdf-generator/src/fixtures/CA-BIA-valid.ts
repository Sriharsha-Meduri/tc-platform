import type { Scenario } from '../types';

const biaData = {
  page_2: {
    buyer_signature_1: { value: 'John Buyer', enabled: true },
    buyer_signature_2: { value: null, enabled: false },
    buyer_signature_date_1: { value: '6/8/2026', enabled: true },
    buyer_signature_date_2: { value: null, enabled: false },
  },
};

export const biaValid: Scenario = {
  name: 'CA-BIA-valid',
  forms: [
    { state: 'CA', formCode: 'BIA', data: biaData },
  ],
};
