import { FORM_FOOTER_FIELDS, FORM_FOOTER_INSTRUCTION } from '../form-definition';
import type { FormDefinition } from '../form-definition';
import { RPA_PAGE_DEFINITIONS } from './rpa.standard.v12-23.pages';

const RPA_TEMPLATE = {
  header: {
    ...FORM_FOOTER_FIELDS,
    date_prepared: '<date: YYYY-MM-DD | null>',
    property_address: '<string | null>',
    assessor_parcel_number: '<string | null>',
    city: '<string | null>',
    county: '<string | null>',
    zip_code: '<string | null>',
  },
  parties: {
    buyer_names: ['<string>'],
    buyer_is_trust_or_entity: '<boolean>',
    seller_names: ['<string>'],
    seller_is_trust_or_entity: '<boolean>',
  },
  agency: {
    seller_brokerage: '<string | null>',
    seller_brokerage_dre: '<string | null>',
    seller_agent: '<string | null>',
    seller_agent_dre: '<string | null>',
    buyer_brokerage: '<string | null>',
    buyer_brokerage_dre: '<string | null>',
    buyer_agent: '<string | null>',
    buyer_agent_dre: '<string | null>',
    dual_agency: '<boolean>',
    more_than_one_brokerage: '<boolean>',
  },
  terms_of_purchase: {
    purchase_price: '<number | null>',
    close_of_escrow_days: '<number | null>',
    close_of_escrow_date: '<date: YYYY-MM-DD | null>',
    initial_deposit_amount: '<number | null>',
    initial_deposit_days: '<number | null>',
    initial_deposit_method: "<'Wire' | 'Check' | 'Other' | null>",
    increased_deposit_amount: '<number | null>',
    increased_deposit_days: '<number | null>',
    loan_amount_1: '<number | null>',
    loan_type_1: "<'Conventional' | 'FHA' | 'VA' | 'Seller Financing' | 'Other' | null>",
    loan_amount_2: '<number | null>',
    additional_financing: '<number | null>',
    balance_of_down_payment: '<number | null>',
    seller_credit_amount: '<number | null>',
    seller_credit_percentage: '<number | null>',
    is_all_cash: '<boolean>',
    verification_of_down_payment_days: '<number | null>',
    verification_of_loan_application_days: '<number | null>',
    other_terms_modifications: {
      purchase_price: '<number | null — if Other Terms specifies a different purchase price (e.g., "Purchase price shall be $X")>',
      close_of_escrow_date: '<date: YYYY-MM-DD | null — if Other Terms specifies an exact close of escrow date>',
      possession_date: '<date: YYYY-MM-DD | null — if Other Terms specifies a possession date>',
      initial_deposit_amount: '<number | null — if Other Terms specifies a different initial deposit/EMD amount>',
      increased_deposit_amount: '<number | null — if Other Terms specifies a different increased deposit amount>',
      seller_credit_amount: '<number | null — if Other Terms specifies a seller credit amount>',
      loan_contingency_waived: '<boolean — if Other Terms says "No loan contingency" or "Loan contingency waived" or similar>',
      loan_contingency_days: '<number | null — if Other Terms changes loan contingency days (e.g., "Loan contingency to be 10 days") — do NOT set if waived>',
      appraisal_contingency_waived: '<boolean — if Other Terms says "No appraisal contingency" or "Appraisal contingency waived" or similar>',
      appraisal_contingency_days: '<number | null — if Other Terms changes appraisal contingency days (e.g., "Appraisal contingency to be 7 days") — do NOT set if waived>',
      inspection_contingency_days: '<number | null — if Other Terms modifies the number of inspection/investigation days>',
      seller_document_review_days: '<number | null — if Other Terms modifies the seller document review period>',
      title_review_days: '<number | null — if Other Terms modifies the title review period>',
      insurance_contingency_days: '<number | null — if Other Terms modifies insurance contingency days>',
      hoa_review_days: '<number | null — if Other Terms modifies HOA/common interest disclosure review days>',
      leased_liened_review_days: '<number | null — if Other Terms modifies leased/liened item review days>',
      sale_of_buyers_property: '<boolean — if Other Terms specifies sale of buyer\'s property contingency applies>',
      buyer_broker_compensation: '<string | null — if Other Terms specifies buyer broker compensation terms>',
      repairs_or_credits: '<string | null — if Other Terms specifies repairs or repair credits>',
      occupancy_or_rent_back: '<string | null — if Other Terms specifies occupancy, rent-back, SIP, or RLAS terms>',
      home_warranty: '<string | null — if Other Terms specifies home warranty terms>',
      items_included_or_excluded: '<string | null — if Other Terms specifies items included or excluded beyond Section P>',
      hoa_terms: '<string | null — if Other Terms specifies HOA-related terms>',
      solar_or_leased_items: '<string | null — if Other Terms specifies solar panel, leased, or liened items>',
      other_deadlines_or_obligations: '<string | null — any other negotiated deadlines or obligations in Other Terms>',
    },
  },
  contingencies_and_time_periods: {
    loan_contingency_days: '<number | null>',
    loan_contingency_no_contingency: '<boolean>',
    appraisal_contingency_days: '<number | null>',
    appraisal_contingency_no_contingency: '<boolean>',
    investigation_of_property_days: '<number | null>',
    informational_access_days: '<number | null>',
    review_seller_documents_days: '<number | null>',
    preliminary_title_report_days: '<number | null>',
    common_interest_disclosures_days: '<number | null>',
    review_leased_liened_items_days: '<number | null>',
    sale_of_buyers_property_attached: '<boolean>',
    buyer_notice_to_perform_days: '<number | null>',
    seller_notice_to_perform_days: '<number | null>',
  },
  allocation_of_costs: {
    natural_hazard_disclosure: "<'Buyer' | 'Seller' | 'Both' | null>",
    environmental_report: "<'Buyer' | 'Seller' | 'Both' | null>",
    wood_destroying_pest_inspection: "<'Buyer' | 'Seller' | 'Both' | null>",
    septic_inspection: "<'Buyer' | 'Seller' | 'Both' | null>",
    well_inspection: "<'Buyer' | 'Seller' | 'Both' | null>",
    smoke_alarm_co_device_installation: "<'Buyer' | 'Seller' | 'Both' | null>",
    escrow_fees: "<'Buyer' | 'Seller' | 'Both' | null>",
    escrow_company_name: '<string | null>',
    title_insurance: "<'Buyer' | 'Seller' | 'Both' | null>",
    title_company_name: '<string | null>',
    county_transfer_tax: "<'Buyer' | 'Seller' | 'Both' | null>",
    city_transfer_tax: "<'Buyer' | 'Seller' | 'Both' | null>",
    hoa_fee_for_preparing_disclosures: "<'Buyer' | 'Seller' | 'Both' | null>",
    hoa_certification_fee: "<'Buyer' | 'Seller' | 'Both' | null>",
    hoa_transfer_fee: "<'Buyer' | 'Seller' | 'Both' | null>",
    home_warranty_plan: "<'Buyer' | 'Seller' | 'Waived' | null>",
    home_warranty_cost_not_to_exceed: '<number | null>',
    private_transfer_fee: "<'Buyer' | 'Seller' | 'Both' | null>",
  },
  items_included_and_excluded: {
    stoves_ovens: '<boolean>',
    refrigerators: '<boolean>',
    wine_refrigerators: '<boolean>',
    washers: '<boolean>',
    dryers: '<boolean>',
    additional_items_included: '<string | null>',
    items_excluded: '<string | null>',
  },
  possession_and_occupancy: {
    possession_delivered: "<'At Close of Escrow' | 'Specific Time' | 'Tenant Remaining' | null>",
    buyer_intends_to_occupy: '<boolean>',
    tenant_occupied_property_addendum_attached: '<boolean>',
    seller_occupancy_addendum_attached: '<boolean>',
  },
  other_terms_text: '<string | null — free-form text from Section R: OTHER TERMS on page 3>',
  other_addenda_and_advisories: {
    probate_advisory_attached: '<boolean>',
    trust_advisory_attached: '<boolean>',
    short_sale_addendum_attached: '<boolean>',
    manufactured_home_addendum_attached: '<boolean>',
    buyer_intent_to_exchange: '<boolean>',
    seller_intent_to_exchange: '<boolean>',
    additional_addenda_checked: '<boolean>',
    additional_addenda_description: '<string | null>',
  },
  offer_expiration: {
    expiration_date: '<date: YYYY-MM-DD | null>',
    expiration_time: '<string | null>',
    buyer_offer_date: '<date: YYYY-MM-DD | null — date next to buyer signature in section 32, distinct from expiration date>',
  },
  offer_date: '<date: YYYY-MM-DD | null — date the buyer signed the offer in section 32 D — NOT the offer expiration date>',
  liquidated_damages_and_arbitration: {
    liquidated_damages_initialed_buyer: '<boolean — handwritten initials only>',
    liquidated_damages_initialed_seller: '<boolean — handwritten initials only>',
    arbitration_initialed_buyer: '<boolean — handwritten initials only>',
    arbitration_initialed_seller: '<boolean — handwritten initials only>',
  },
  seller_acceptance: {
    accepted_subject_to_counter_offer: '<boolean>',
    buyer_signature_present: '<boolean — true if there is a visible handwritten or digital signature on the buyer acceptance signature line>',
    buyer_signature_date: '<date: YYYY-MM-DD | null — date written next to buyer acceptance signature, if present>',
    seller_signature_present: '<boolean — true if there is a visible handwritten or digital signature on the seller acceptance signature line>',
    seller_signature_date: '<date: YYYY-MM-DD | null — date written next to seller signature, if present>',
  },
};

export const rpaStandardV1223: FormDefinition = {
  formCode: 'RPA',
  formName: 'Residential Purchase Agreement',
  variant: 'standard',
  version: 'v12-23',
  criticality: 'critical',

  systemPrompt: `You are an expert real estate transaction coordinator specializing in California Association of REALTORS® (C.A.R.) forms.
Your task is to extract all critical transaction data from the provided images of a C.A.R. Form RPA (Residential Purchase Agreement, 16 pages).

${FORM_FOOTER_INSTRUCTION}

CRITICAL GUIDELINES:
1. Precision is paramount. Extract dollar amounts as plain numbers (remove '$' and commas). E.g., "$850,000" becomes 850000.
2. The Grid (Section 3): Pay extremely close attention to the timeframes in Section 3L (Contingencies). If a specific number of days is written in the box, extract that number. If the box is blank but a default is listed next to it (e.g., "17 Days"), extract the default. If the "No Contingency" checkbox is marked, set the corresponding boolean to true.
3. Allocation of Costs (Section 3Q): For each line item (Escrow, Title, NHD, Pest, Septic, Well), identify which checkbox is marked: "Buyer", "Seller", or "Both". Return that exact string.
4. Addenda & Occupancy: Visually scan the checkboxes in Section 3 and Section 4. If boxes for SIP, TOPA, COP, or specific advisories (Probate, Trust) are checked, set those booleans to true.
5. Section R (Other Terms) on page 3: Extract any free-form text written in the "OTHER TERMS" section as other_terms_text. ALSO analyze that text for ALL negotiated modifications and extract them into terms_of_purchase.other_terms_modifications. This includes: purchase price, close of escrow, possession, deposits, ALL CONTINGENCY MODIFICATIONS (contingency waivers, day-count changes for loan, appraisal, inspection, insurance, seller doc review, title review, HOA review, leased/liened item review, sale of buyer's property), seller credits, buyer broker compensation, repairs, occupancy/rent-back, home warranty, items included/excluded, HOA terms, solar/leased items, and any other negotiated deadlines or obligations.
6. CONTINGENCY EXTRACTION FROM OTHER TERMS IS CRITICAL. Look for phrases like: "Loan contingency to be X days", "No loan contingency", "Loan contingency waived", "Appraisal contingency to be X days", "No appraisal contingency", "Inspection contingency to be X days", "Investigation period X days", "Due diligence period X days", "All contingencies removed except inspection", "Buyer to remove all contingencies within X days". Always check if Other Terms modifies or waives any contingency period — counters often change contingencies here.
7. CONTINGENCY OVERRIDE RULES: A specific contingency term overrides a general one. A waiver overrides a day count. If Other Terms says "Loan contingency to be 10 days", set loan_contingency_days to 10 (not loan_contingency_waived). If it says "No loan contingency" or "Loan waived", set loan_contingency_waived to true and loan_contingency_days to null. Same logic applies to appraisal and all other contingencies.
8. Offer Expiration & Acceptance: On the final pages, locate Section 32 (Expiration of Offer) and extract the exact date and time. Also find the buyer's signature date in Section 32 — that's the offer_date and buyer_offer_date, separate from the expiration date. Look at the Seller Acceptance block and extract the seller_signature_date and buyer_signature_date from the signature lines. If the box "Subject to attached Seller Counter Offer" is checked, set accepted_subject_to_counter_offer to true.
9. Initials (Sections 29 & 30): Visually inspect the Liquidated Damages and Arbitration of Disputes clauses. Return true ONLY if there are handwritten or digital initials explicitly placed in the designated boxes beneath those clauses.
10. DATE ACCURACY: Carefully examine each digit in dates. Digits like 7, 8, 9, and 1 are frequently confused. The extracted date must match exactly what is written — do not modify or calculate it.
11. Missing Data: If a field is entirely blank or crossed out, return null. Do not guess or infer data that is not visually present.

EXPECTED OUTPUT FORMAT:
You must return the extracted data strictly following this JSON template. Do not include markdown formatting or conversational text. Output ONLY valid JSON.

${JSON.stringify(RPA_TEMPLATE, null, 2)}`,

  userPrompt: 'Extract all fields from this Residential Purchase Agreement and return valid JSON matching the template. Output ONLY valid JSON.',
  pageDefinitions: RPA_PAGE_DEFINITIONS,
};
