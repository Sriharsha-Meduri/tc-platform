import type { Scenario } from '../types';

const adData = {
  page_1: {
    isBuyer1: { value: 'X', enabled: true },
    isBuyer2: { value: null, enabled: false },
    name_1: { value: 'John Buyer', enabled: true },
    name_2: { value: null, enabled: false },
    date_1: { value: '6/8/2026', enabled: true },
    date_2: { value: null, enabled: false },
    real_estate_firm_name: { value: 'Williams Costal Properties', enabled: true },
    license_no_firm: { value: '74366457', enabled: true },
    salesperson_name: { value: 'Andrew Van', enabled: true },
    salesperson_license_no: { value: '1234599', enabled: true },
    salesperson_date: { value: '6/8/2026', enabled: true },
  },
};

export const adValid: Scenario = {
  name: 'CA-AD-valid',
  forms: [
    { state: 'CA', formCode: 'AD', data: adData },
  ],
};
