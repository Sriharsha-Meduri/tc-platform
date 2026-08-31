import { fillAndStroke } from 'pdf-lib';
import type { Scenario } from '../types';

const rpaData = {
  property: {
    datePrepared: { value: '6/8/2026', enabled: false },
    offerFrom: { value: 'Neil Jacob', enabled: true },
    streetAddress: { value: '123 Main St', enabled: true },
    city: { value: 'Santa Ana', enabled: true },
    state: { value: 'CA', enabled: true },
    postalCode: { value: '96782', enabled: true },
    county: { value: 'Orange', enabled: true },
    parcelNo: { value: '6795461', enabled: true },
    apn: { value: '5543-021-015', enabled: true },
    mlsNumber: { value: null, enabled: false },
    legalDescription: { value: null, enabled: false },
  },
  transaction: {
    purchasePrice: { value: 900000, enabled: true },
    purchasePriceAllCash: { value: 'X', enabled: true },
    isCloseOfEscrow: { value: 'X', enabled: true },
    closeOfEscrow: { value: 28, enabled: true },
    initialDeposit: { value: 180000, enabled: true },
    initialDepositPercent: { value: 10, enabled: true },
    earnestMoneyAmount: { value: 18000, enabled: false },
    section_5c1_percentage: { value: 2.5, enabled: true },
    balanceOfDownPayment: { value: 720000, enabled: true },
    purchasePriceTotal: { value: 900000, enabled: true },
    offerDate: { value: '6/8/2026', enabled: false },
    acceptanceDate: { value: '6/8/2026', enabled: false },
    closingDate: { value: '6/8/2026', enabled: false },
    closeOfEscrowDate: { value: '6/8/2026', enabled: true },
    possessionDate: { value: null, enabled: false },
    financingType: { value: 'Conventional', enabled: true },
    loanAmount: { value: 720000, enabled: true },
    occupancyType: { value: null, enabled: false },
  },
  parties: {
    buyers: [{ fullName: { value: 'John Buyer', enabled: false }, email: { value: null, enabled: false }, phone: { value: null, enabled: false } }],
    sellers: [{ fullName: { value: 'Jane Seller', enabled: false }, email: { value: null, enabled: false }, phone: { value: null, enabled: false } }],
    sellerBrokerageFirm: { value: 'Blue Lotus Reality', enabled: true },
    sellerBrokerageLicenseNo: { value: '74382457', enabled: true },
    isBrokerOfTheSeller: { value: 'X', enabled: true },
    isBrokerOfTheSellerAndBuyer: { value: 'X', enabled: false },
    buyerAgents: [{ fullName: { value: 'Andrew Van', enabled: true }, email: { value: null, enabled: false }, phone: { value: null, enabled: false }, licenseNumber: { value: '1234599', enabled: true }, companyName: { value: 'Realty', enabled: true } }],
    listingAgents: [{ fullName: { value: 'Robert Gram', enabled: true }, email: { value: null, enabled: false }, phone: { value: null, enabled: false }, licenseNumber: { value: '3467890', enabled: true }, companyName: { value: 'Realty', enabled: true } }],
    isSellerAgent: { value: 'X', enabled: true },
    isSellerAndBuyerAgent: { value: 'X', enabled: false },
    buyerBrokerageFirm: { value: 'Williams Costal Properties', enabled: true },
    buyerBrokerageLicenseNo: { value: '74366457', enabled: true },
    isBuyerBrokerageFirmBuyer: { value: 'X', enabled: false },
    isBuyerBrokerageFirmBuyerAndSeller: { value: 'X', enabled: true },
    isBuyerAgentBuyerAgent: { value: 'X', enabled: true },
    isBuyerAgentBuyerAndSellerAgent: { value: 'X', enabled: false },
    escrowCompanies: [{ companyName: { value: 'Pacific Escrow', enabled: true } }],
  },
  contractTerms: {
    inspectionContingencyDays: { value: 17, enabled: true },
    loanContingencyDays: { value: 21, enabled: true },
    appraisalContingencyDays: { value: 17, enabled: true },
    disclosuresDueDays: { value: 7, enabled: true },
    otherDeadlines: { value: [], enabled: true },
  },
  seller_acceptance: {
    accepted_subject_to_counter_offer: { value: true, enabled: true },
    seller_signature_date: { value: '6/8/2026', enabled: false },
    buyer_signature_date: { value: '6/8/2026', enabled: false },
  },
  signatures: {
    buyerSigned: { value: true, enabled: true },
    sellerSigned: { value: true, enabled: true },
    signedParties: { value: ['John Buyer', 'Jane Seller'], enabled: true },
    missingSignatures: { value: [], enabled: true },
  },
  footer: {
    buyer_initial_1: { value: 'VCB', enabled: true },
    buyer_initial_2: { value: 'MNB', enabled: true },
  },
  page_2: {
    address: { value: '123 Main St', enabled: true },
    date: { value: '6/8/2026', enabled: true },
    section_g3_isSellerPaymentCompensateBuyersBroker: { value: 'X', enabled: true },
    section_g3_percentage: { value: 2.5, enabled: true },
    section_h3_isPreapproval: { value: 'X', enabled: true },
    section_l1_days: { value: 17, enabled: true },
    section_l2_days: { value: 21, enabled: true },
    section_l3_days: { value: 17, enabled: true },
    section_l3_information_access_property_days: { value: 10, enabled: true },
    section_l4_days: { value: 7, enabled: true },
    section_l5_days: { value: null, enabled: false },
    section_l6_days: { value: 5, enabled: true },
    section_l7_days: { value: 3, enabled: true },
    section_l8_days: { value: 14, enabled: true },
    section_n1_days: { value: 30, enabled: true },
    footer_buyer_initials_1: { value: 'VCB', enabled: true },
    footer_buyer_initials_2: { value: 'MNB', enabled: true },
  },
  page_3: {
    address: { value: '123 Main St', enabled: true },
    date: { value: '6/8/2026', enabled: true },
    section_p1_isStove: { value: 'X', enabled: true },
    section_p1_isWasher: { value: 'X', enabled: true },
    section_p1_isDryer: { value: 'X', enabled: true },
    section_p1_isBathroomMirror: { value: 'X', enabled: true },
    section_q1_isSeller: { value: 'X', enabled: true },
    section_q4_isSeller: { value: 'X', enabled: true },
    section_q17_fees: { value: 500, enabled: true },
    buyer_initial_1: { value: 'VCB', enabled: true },
    buyer_initial_2: { value: 'MNB', enabled: true },
  },
  page_4: {
    buyer_initial_1: { value: 'VCB', enabled: true },
    buyer_initial_2: { value: 'MNB', enabled: true },
  },
  page_5: {
    buyer_initial_1: { value: 'VCB', enabled: true },
    buyer_initial_6: { value: 'MNB', enabled: true },
  },
  page_6: {
    buyer_initial_1: { value: 'VCB', enabled: true },
    buyer_initial_2: { value: 'MNB', enabled: true },
  },
  page_7: {
    buyer_initial_1: { value: 'VCB', enabled: true },
    buyer_initial_2: { value: 'MNB', enabled: true },
  },
  page_8: {
    buyer_initial_1: { value: 'VCB', enabled: true },
    buyer_initial_2: { value: 'MNB', enabled: true },
  },
  page_9: {
    buyer_initial_1: { value: 'VCB', enabled: true },
    buyer_initial_2: { value: 'MNB', enabled: true },
  },
  page_10: {
    buyer_initial_1: { value: 'VCB', enabled: true },
    buyer_initial_2: { value: 'MNB', enabled: true },
  },
  page_11: {
    buyer_initial_1: { value: 'VCB', enabled: true },
    buyer_initial_2: { value: 'MNB', enabled: true },
  },
  page_12: {
    buyer_initial_1: { value: 'VCB', enabled: true },
    buyer_initial_2: { value: 'MNB', enabled: true },
  },
  page_13: {
    buyer_initial_1: { value: 'VCB', enabled: true },
    buyer_initial_2: { value: 'MNB', enabled: true },
  },
  page_14: {
    buyer_initial_1: { value: 'VCB', enabled: true },
    buyer_initial_2: { value: 'MNB', enabled: true },
  },
  page15: {
    buyerInitial1: { value: 'VCB', enabled: true },
    buyerInitial2: { value: 'MNB', enabled: true },
    buyerInitial3: { value: 'VCB', enabled: true },
    buyerInitial4: { value: 'MNB', enabled: true },
    buyerInitial5: { value: 'VCB', enabled: true },
    buyerInitial6: { value: 'MNB', enabled: true },
    sellerInitial1: { value: 'NNB', enabled: true },
    sellerInitial2: { value: 'ANB', enabled: true },
    sellerInitial3: { value: 'NNB', enabled: true },
  },
  page_16: {
    seller_signature_1: { value: 'Jane Seller', enabled: true },
    seller_signature_2: { value: null, enabled: false },
    seller_name_1: { value: 'Jane Seller', enabled: true },
    seller_name_2: { value: null, enabled: false },
    seller_date_1: { value: '6/8/2026', enabled: true },
    seller_date_2: { value: null, enabled: false },
    buyer_signature_1: { value: 'John Buyer', enabled: true },
    buyer_signature_2: { value: null, enabled: false },
    buyer_name_1: { value: 'John Buyer', enabled: true },
    buyer_name_2: { value: null, enabled: false },
    buyer_signature_date_1: { value: '6/8/2026', enabled: true },
    buyer_signature_date_2: { value: null, enabled: false },
  },
  page_17: {
    section_4a_buyer_brokerage_firm: { value: 'Williams Costal Properties', enabled: true },
    section_4a_license_no_firm: { value: '74366457', enabled: true },
    section_4a_buyer_1: { value: 'Andrew Van', enabled: true },
    section_4a_license_no_1: { value: '1234599', enabled: true },
    section_4a_date_1: { value: '6/8/2026', enabled: true },
    section_4a_address: { value: '123 Main St', enabled: true },
    section_4a_city: { value: 'Santa Ana', enabled: true },
    section_4a_state: { value: 'CA', enabled: true },
    section_4a_zipcode: { value: '96782', enabled: true },
    section_4a_email: { value: 'avan@realty.com', enabled: true },
    section_4a_phone_no: { value: '714-555-0101', enabled: true },
    section_4b_seller_brokerage_firm: { value: 'Blue Lotus Reality', enabled: true },
    section_4b_license_no_firm: { value: '74382457', enabled: true },
    section_4b_seller_1: { value: 'Robert Gram', enabled: true },
    section_4b_license_1: { value: '3467890', enabled: true },
    section_4b_date_1: { value: '6/8/2026', enabled: true },
    section_4b_address: { value: '123 Main St', enabled: true },
    section_4b_city: { value: 'Santa Ana', enabled: true },
    section_4b_state: { value: 'CA', enabled: true },
    section_4b_zipcode: { value: '96782', enabled: true },
    section_4b_email: { value: 'rgram@realty.com', enabled: true },
    section_4b_phone_no: { value: '714-555-0102', enabled: true },
    footer_buyer_initial_1: { value: 'VCB', enabled: true },
    footer_buyer_initial_2: { value: 'MNB', enabled: true },
  },
};

const scoBase = {
  header: {
    property_address: { value: '123 Main St', enabled: true },
    counter_offer_number: { value: null, enabled: false },
    date: { value: null, enabled: false },
  },
  parties: {
    buyer_names: [{ value: 'John Buyer', enabled: true }],
    seller_names: [{ value: 'Jane Seller', enabled: true }],
  },
  offer_reference: {
    referenced_form_code: { value: null, enabled: false },
    referenced_offer_date: { value: null, enabled: false },
    referenced_counter_offer_number: { value: null, enabled: false },
  },
  counter_offer_terms: {
    other_terms_text: { value: null, enabled: false },
    attached_addenda: { value: [], enabled: true },
  },
  expiration: {
    expiration_date: { value: null, enabled: false },
    expiration_time: { value: '5:00', enabled: false },
    expiration_time_period: { value: 'PM', enabled: false },
    alternative_expiration_specified: { value: false, enabled: true },
  },
  section_4_offer: {
    offeror_1_signature_date: { value: null, enabled: false },
    offeror_2_signature_date: { value: null, enabled: false },
    offeror_1_typed_name: { value: null, enabled: false },
    offeror_2_typed_name: { value: null, enabled: false },
  },
  section_5_acceptance: {
    subject_to_attached_counter_offer: { value: 'X', enabled: true },
    acceptor_1_signature_date: { value: null, enabled: false },
    acceptor_1_signature_time: { value: null, enabled: false },
    acceptor_1_signature_time_period: { value: null, enabled: false },
    acceptor_2_signature_date: { value: null, enabled: false },
    acceptor_2_signature_time: { value: null, enabled: false },
    acceptor_2_signature_time_period: { value: null, enabled: false },
  },
  confirmation_of_acceptance: {
    confirmation_initials: { value: null, enabled: false },
    confirmation_date: { value: null, enabled: false },
    confirmation_time: { value: null, enabled: false },
    confirmation_time_period: { value: null, enabled: false },
  },
};

const bcoBase = {
  header: {
    counter_offer_number: { value: null, enabled: false },
    date: { value: null, enabled: false },
  },
  parties: {
    buyer_names: [{ value: 'John Buyer', enabled: true }],
    seller_names: [{ value: 'Jane Seller', enabled: true }],
  },
  offer_reference: {
    referenced_offer_date: { value: null, enabled: false },
    seller_counter_offer_no: { value: null, enabled: false },
    address: { value: null, enabled: false },
  },
  counter_offer_terms: {
    other_terms_text: { value: null, enabled: false },
    attached_addenda: { value: [], enabled: true },
  },
  expiration: {
    expiration_date: { value: null, enabled: false },
    expiration_time: { value: '5:00', enabled: false },
    expiration_time_period: { value: 'X', enabled: true },
  },
  section_3_offer: {
    offeror_1_signature_date: { value: null, enabled: false },
    offeror_2_signature_date: { value: null, enabled: false },
    offeror_1_typed_name: { value: null, enabled: false },
    offeror_2_typed_name: { value: null, enabled: false },
  },
  section_4_acceptance: {
    subject_to_attached_counter_offer: { value: false, enabled: true },
    acceptor_1_signature_date: { value: null, enabled: false },
    acceptor_2_signature_date: { value: null, enabled: false },
    acceptor_1_typed_name: { value: null, enabled: false },
    acceptor_2_typed_name: { value: null, enabled: false },
  },
  confirmation_of_acceptance: {
    confirmation_date: { value: null, enabled: false },
  },
  section_5: {
    late_acceptance_buyer_name: { value: null, enabled: false },
  },
};

const sco1 = {
  ...scoBase,
  header: {
    ...scoBase.header,
    counter_offer_number: { value: '1', enabled: true },
    date: { value: '2026-01-03', enabled: false },
  },
  offer_reference: {
    ...scoBase.offer_reference,
    referenced_form_code: { value: 'RPA', enabled: false },
    referenced_offer_date: { value: '6/8/2026', enabled: false },
    referenced_counter_offer_number: { value: null, enabled: false },
  },
  expiration: {
    ...scoBase.expiration,
    expiration_date: { value: '2026-01-06', enabled: false },
  },
  section_4_offer: {
    ...scoBase.section_4_offer,
    offeror_1_signature_date: { value: '2026-01-03', enabled: false },
    offeror_1_typed_name: { value: 'Jane Seller', enabled: true },
  },
  section_5_acceptance: {
    ...scoBase.section_5_acceptance,
    acceptor_1_signature_date: { value: '2026-01-04', enabled: false },
    acceptor_1_typed_name: { value: 'John Buyer', enabled: true },
  },
  confirmation_of_acceptance: {
    ...scoBase.confirmation_of_acceptance,
    confirmation_initials: { value: 'JB', enabled: true },
    confirmation_date: { value: '2026-01-04', enabled: false },
  },
};

const bco1 = {
  ...bcoBase,
  header: {
    ...bcoBase.header,
    counter_offer_number: { value: '2', enabled: true },
    date: { value: '2026-01-04', enabled: false },
  },
  offer_reference: {
    ...bcoBase.offer_reference,
    referenced_offer_date: { value: '2026-01-03', enabled: false },
    seller_counter_offer_no: { value: '1', enabled: true },
    address: { value: '123 Main St', enabled: true },
  },
  expiration: {
    ...bcoBase.expiration,
    expiration_date: { value: '2026-01-07', enabled: false },
  },
  section_3_offer: {
    ...bcoBase.section_3_offer,
    offeror_1_signature_date: { value: '2026-01-04', enabled: false },
    offeror_1_typed_name: { value: 'John Buyer', enabled: true },
  },
  section_4_acceptance: {
    ...bcoBase.section_4_acceptance,
    acceptor_1_signature_date: { value: '2026-01-05', enabled: false },
    acceptor_1_typed_name: { value: 'Jane Seller', enabled: true },
  },
  confirmation_of_acceptance: {
    ...bcoBase.confirmation_of_acceptance,
    confirmation_date: { value: '2026-01-05', enabled: true },
  },
};

const sco2 = {
  ...scoBase,
  header: {
    ...scoBase.header,
    counter_offer_number: { value: '3', enabled: true },
    date: { value: '2026-01-05', enabled: true },
  },
  offer_reference: {
    ...scoBase.offer_reference,
    referenced_form_code: { value: 'BCO', enabled: true },
    referenced_offer_date: { value: '2026-01-04', enabled: false },
    referenced_counter_offer_number: { value: '2', enabled: true },
  },
  counter_offer_terms: {
    ...scoBase.counter_offer_terms,
    other_terms_text: { value: 'Seller accepts $925,000. No additional credits. Close of escrow 30 days after acceptance.', enabled: true },
  },
  expiration: {
    ...scoBase.expiration,
    expiration_date: { value: '2026-01-08', enabled: false },
  },
  section_4_offer: {
    ...scoBase.section_4_offer,
    offeror_1_signature_date: { value: '2026-01-05', enabled: false },
    offeror_1_typed_name: { value: 'Jane Seller', enabled: true },
  },
  section_5_acceptance: {
    ...scoBase.section_5_acceptance,
    acceptor_1_signature_date: { value: '2026-01-06', enabled: false },
    acceptor_1_typed_name: { value: 'John Buyer', enabled: true },
  },
  confirmation_of_acceptance: {
    ...scoBase.confirmation_of_acceptance,
    confirmation_initials: { value: 'JB', enabled: true },
    confirmation_date: { value: '2026-01-06', enabled: false },
  },
};

const bco2 = {
  ...bcoBase,
  header: {
    ...bcoBase.header,
    counter_offer_number: { value: '4', enabled: true },
    date: { value: '2026-01-06', enabled: false },
  },
  offer_reference: {
    ...bcoBase.offer_reference,
    referenced_offer_date: { value: '2026-01-05', enabled: false },
    seller_counter_offer_no: { value: '3', enabled: true },
    address: { value: '123 Main St', enabled: true },
  },
  counter_offer_terms: {
    ...bcoBase.counter_offer_terms,
    other_terms_text: { value: 'Buyer accepts $925,000 with no credits. COE 30 days.', enabled: true },
  },
  expiration: {
    ...bcoBase.expiration,
    expiration_date: { value: '2026-01-09', enabled: false },
  },
  section_3_offer: {
    ...bcoBase.section_3_offer,
    offeror_1_signature_date: { value: '2026-01-06', enabled: false },
    offeror_1_typed_name: { value: 'John Buyer', enabled: true },
  },
  section_4_acceptance: {
    ...bcoBase.section_4_acceptance,
    acceptor_1_signature_date: { value: '2026-01-07', enabled: false },
    acceptor_1_typed_name: { value: 'Jane Seller', enabled: true },
  },
  confirmation_of_acceptance: {
    ...bcoBase.confirmation_of_acceptance,
    confirmation_date: { value: '2026-01-07', enabled: false },
  },
};

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

const avidData = {
  header: {
    property_address: { value: '123 Main St', enabled: true },
    city: { value: 'Santa Ana', enabled: true },
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

const biaData = {
  page_2: {
    buyer_signature_1: { value: 'John Buyer', enabled: true },
    buyer_signature_2: { value: null, enabled: false },
    buyer_signature_date_1: { value: '6/8/2026', enabled: true },
    buyer_signature_date_2: { value: null, enabled: false },
  },
};

export const rpaCounterOffer2: Scenario = {
  name: 'CA-RPA-counter-offer-2',
  forms: [
    { state: 'CA', formCode: 'RPA', data: rpaData },
    { state: 'CA', formCode: 'AD', data: adData },
    { state: 'CA', formCode: 'AVID', data: avidData },
    { state: 'CA', formCode: 'BIA', data: biaData },
    { state: 'CA', formCode: 'SCO', data: sco1, label: '1' },
    { state: 'CA', formCode: 'BCO', data: bco1, label: '1' },
  ],
};
