import type { Scenario } from '../types';

const avidData = {
  header: {
    property_address: { value: '300 Birch St', enabled: true },
    city: { value: 'Brea', enabled: true },
    county: { value: 'Orange', enabled: true },
    real_estate_broker: { value: 'Williams Costal Properties', enabled: true },
  },
  footer: {
    buyer_initial_1: { value: 'VCB', enabled: true },
    buyer_initial_2: { value: 'MNB', enabled: true },
  },
  page_2: {
    living_room_inspection: { value: 'X', enabled: true },
    buyer_initial_1: { value: 'VCB', enabled: true },
    buyer_initial_2: { value: 'MNB', enabled: true },
  },
  page_3: {
    real_estate_broker_name: { value: 'Andrew Van', enabled: true },
    inspection_peformed_by: { value: 'Andrew Van', enabled: true },
    inspection_date: { value: '6/4/2026', enabled: true },
    inspection_weather_conditions: { value: 'Sunny, 75°F', enabled: true },
    inspection_broker_signature: { value: 'Andrew Van', enabled: true },
    inspection_signature_date: { value: '6/4/2026', enabled: true },
    buyer_name_1: { value: 'John Buyer', enabled: true },
    buyer_name_2: { value: null, enabled: false },
    buyer_name_date_1: { value: '6/8/2026', enabled: true },
    buyer_name_date_2: { value: null, enabled: false },
    seller_initial_1: { value: 'NNB', enabled: true },
    seller_initial_2: { value: 'ANB', enabled: true },
    broker_name_that_did_not_do_this_AVID: { value: 'N/A', enabled: true },
    broker_name_that_did_not_do_this_AVID_signature: { value: 'N/A', enabled: true },
    broker_name_that_did_not_do_this_AVID_signature_date: { value: null, enabled: false },
  },
};

export const avidValid: Scenario = {
  name: 'CA-AVID-valid',
  forms: [
    { state: 'CA', formCode: 'AVID', data: avidData },
  ],
};
