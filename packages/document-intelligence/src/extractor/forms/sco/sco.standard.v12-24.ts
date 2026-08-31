import { FORM_FOOTER_FIELDS, FORM_FOOTER_INSTRUCTION } from '../form-definition';
import type { FormDefinition } from '../form-definition';
import { fieldSchema, FIELD_EXTRACTION_INSTRUCTION } from '../shared/field-schema.util';

const SCO_TEMPLATE = {
  header: {
    ...FORM_FOOTER_FIELDS,
    property_address: '<string | null>',
    date: '<date: YYYY-MM-DD | null>',
    counter_offer_number: '<string | null>',
  },

  parties: {
    buyer_names: ['<string>'],
    seller_names: ['<string>'],
  },

  offer_reference: {
    referenced_form_code: "<'RPA' | 'SCO' | 'BCO' | null>",
    referenced_offer_date: '<date: YYYY-MM-DD | null>',
    referenced_counter_offer_number: '<string | null>',
    counter_number: '<number | null — the counter offer number (1, 2, 3, etc.) from the form\'s title block or offer reference section>',
  },

  counter_offer_terms: {
    purchase_price: fieldSchema('the full purchase price specified in this counter offer, whether stated explicitly in Section 1A or as a modification in Other Terms', { valueType: 'number' }),
    other_terms_text: '<string | null — user-written content from the Other Terms section (Section 1C on SCO, Section 1D on BCO). Exclude pre-printed CAR boilerplate.>',
    other_terms_modifications: {
      purchase_price: fieldSchema('a different purchase price negotiated in Other Terms', { valueType: 'number' }),
      close_of_escrow_date: fieldSchema('an exact close of escrow date negotiated in Other Terms (e.g., "Close of Escrow shall occur on July 15, 2026" or "COE 7/15/2026")', { valueType: 'date' }),
      close_of_escrow_days: fieldSchema('close of escrow expressed as days after acceptance negotiated in Other Terms (e.g., "within 45 days after acceptance" → 45); do not set if an exact date is already captured in close_of_escrow_date', { valueType: 'number' }),
      possession_date: fieldSchema('a possession date negotiated in Other Terms', { valueType: 'date' }),
      initial_deposit_amount: fieldSchema('a different initial deposit/EMD amount negotiated in Other Terms', { valueType: 'number' }),
      increased_deposit_amount: fieldSchema('a different increased deposit amount negotiated in Other Terms', { valueType: 'number' }),
      seller_credit_amount: fieldSchema('a seller credit amount negotiated in Other Terms', { valueType: 'number' }),
      loan_contingency_waived: fieldSchema('whether Other Terms says "No loan contingency" / "Loan contingency waived" or similar', { valueType: 'boolean' }),
      loan_contingency_days: fieldSchema('a loan contingency day-count change negotiated in Other Terms (e.g., "Loan contingency to be 10 days") — do NOT set if waived', { valueType: 'number' }),
      appraisal_contingency_waived: fieldSchema('whether Other Terms says "No appraisal contingency" / "Appraisal contingency waived" or similar', { valueType: 'boolean' }),
      appraisal_contingency_days: fieldSchema('an appraisal contingency day-count change negotiated in Other Terms — do NOT set if waived', { valueType: 'number' }),
      inspection_contingency_days: fieldSchema('an inspection/investigation contingency day-count change negotiated in Other Terms', { valueType: 'number' }),
      seller_document_review_days: fieldSchema('a seller document review day-count change negotiated in Other Terms', { valueType: 'number' }),
      title_review_days: fieldSchema('a title review day-count change negotiated in Other Terms', { valueType: 'number' }),
      insurance_contingency_days: fieldSchema('an insurance contingency day-count change negotiated in Other Terms', { valueType: 'number' }),
      hoa_review_days: fieldSchema('an HOA disclosure review day-count change negotiated in Other Terms', { valueType: 'number' }),
      leased_liened_review_days: fieldSchema('a leased/liened item review day-count change negotiated in Other Terms', { valueType: 'number' }),
      sale_of_buyers_property: fieldSchema("whether Other Terms specifies a sale-of-buyer's-property contingency applies", { valueType: 'boolean' }),
      buyer_broker_compensation: fieldSchema('a buyer broker compensation term negotiated in Other Terms', { valueType: 'string' }),
      repairs_or_credits: fieldSchema('repairs or repair credits negotiated in Other Terms', { valueType: 'string' }),
      occupancy_or_rent_back: fieldSchema('occupancy, rent-back, SIP, or RLAS terms negotiated in Other Terms', { valueType: 'string' }),
      home_warranty: fieldSchema('home warranty terms negotiated in Other Terms', { valueType: 'string' }),
      items_included_or_excluded: fieldSchema('items included/excluded negotiated in Other Terms', { valueType: 'string' }),
      hoa_terms: fieldSchema('HOA-related terms negotiated in Other Terms', { valueType: 'string' }),
      solar_or_leased_items: fieldSchema('solar/leased/liened item terms negotiated in Other Terms', { valueType: 'string' }),
      other_deadlines_or_obligations: fieldSchema('any other negotiated deadline or obligation from Other Terms', { valueType: 'string' }),
    },
    attached_addenda: ['<string>'],
  },

  expiration: {
    expiration_date: '<date: YYYY-MM-DD | null>',
    expiration_time: '<string | null>',
    expiration_time_period: "<'AM' | 'PM' | null>",
    alternative_expiration_specified: '<boolean>',
  },

  /** Section 4 — Offer (signed by seller on SCO, buyer on BCO) */
  section_4_offer: {
    offeror_1_signature_present: '<boolean | null — whether offeror 1 has a visible handwritten or digital signature on the signature line>',
    offeror_1_signature_date: '<date: YYYY-MM-DD | null — date next to offeror 1 signature, if present>',
    offeror_2_signature_present: '<boolean | null — whether offeror 2 has a visible handwritten or digital signature on the signature line>',
    offeror_2_signature_date: '<date: YYYY-MM-DD | null — date next to offeror 2 signature, if present>',
    offeror_1_typed_name: '<string | null>',
    offeror_2_typed_name: '<string | null>',
  },

  /** Section 5 — Acceptance (signed by buyer on SCO, seller on BCO) */
  section_5_acceptance: {
    subject_to_attached_counter_offer: '<boolean>',
    acceptor_1_signature_present: '<boolean | null — whether acceptor 1 has a visible handwritten or digital signature on the signature line>',
    acceptor_1_signature_date: '<date: YYYY-MM-DD | null — date next to acceptor 1 signature, if present>',
    acceptor_1_signature_time: '<string | null>',
    acceptor_1_signature_time_period: "<'AM' | 'PM' | null>",
    acceptor_2_signature_present: '<boolean | null — whether acceptor 2 has a visible handwritten or digital signature on the signature line>',
    acceptor_2_signature_date: '<date: YYYY-MM-DD | null — date next to acceptor 2 signature, if present>',
    acceptor_2_signature_time: '<string | null>',
    acceptor_2_signature_time_period: "<'AM' | 'PM' | null>",
  },

  confirmation_of_acceptance: {
    confirmation_initials: '<string | null>',
    confirmation_date: '<date: YYYY-MM-DD | null>',
    confirmation_time: '<string | null>',
    confirmation_time_period: "<'AM' | 'PM' | null>",
  },

  extractionWarnings: ['<string>'],
};

export const scoStandardV1224: FormDefinition = {
  formCode: 'SCO',
  formName: 'Seller Counter Offer',
  variant: 'standard',
  version: 'v12-24',
  criticality: 'critical',

  systemPrompt: `You are an expert California real estate transaction coordinator.
Extract all data from a C.A.R. Form SCO — Seller Counter Offer.

${FORM_FOOTER_INSTRUCTION}

CRITICAL GUIDELINES:
1. This is a counter offer form used by a seller to counter a buyer's offer (RPA or BCO).
2. Extract the property address, date, and counter offer number into the header section.
3. Extract buyer and seller names into the parties section.
4. The offer_reference section identifies which offer is being countered — extract the referenced form code and date.
5. The "Other Terms" section (Section 1C on SCO, Section 1D on BCO) is a free-form text block where the user writes modified terms. Extract ONLY the user-written/modified content into counter_offer_terms.other_terms_text. EXCLUDE any pre-printed CAR boilerplate text (such as "All other terms and conditions of the referenced offer shall remain in full force and effect" or similar standard language).
6. ALSO analyze the Other Terms text for ALL negotiated modifications and extract them into counter_offer_terms.other_terms_modifications. This includes: purchase price changes, close of escrow date, possession date, deposit changes, ALL CONTINGENCY MODIFICATIONS (contingency waivers, day-count changes for loan, appraisal, inspection, insurance, seller doc review, title review, HOA review, leased/liened item review, sale of buyer's property), seller credits, buyer broker compensation, repairs, occupancy/rent-back, home warranty, items included/excluded, HOA terms, solar/leased items, and any other negotiated deadlines or obligations.
7. CLOSE OF ESCROW: If Other Terms gives an exact calendar date for close of escrow (e.g., "July 15, 2026" or "COE 7/15/2026"), extract it into close_of_escrow_date as YYYY-MM-DD. If it gives a relative period (e.g., "within 45 days after acceptance", "COE 30 days after acceptance", "close of escrow to be 45 days"), extract the number of days into close_of_escrow_days. When a relative period is specified, leave close_of_escrow_date as null.
8. CONTINGENCY EXTRACTION FROM OTHER TERMS IS CRITICAL on counter offers because contingencies are frequently modified here. Look for phrases like: "Loan contingency to be X days", "No loan contingency", "Loan contingency waived", "Appraisal contingency to be X days", "No appraisal contingency", "Inspection contingency to be X days", "Investigation period X days", "Due diligence period X days", "All contingencies removed except inspection", "Buyer to remove all contingencies within X days". Always check if Other Terms modifies or waives any contingency.
9. CONTINGENCY OVERRIDE RULES: A specific term overrides a general one. A waiver overrides a day count. If Other Terms says "Loan contingency to be 10 days", set loan_contingency_days to 10 (not loan_contingency_waived). If it says "No loan contingency" or "Loan waived", set loan_contingency_waived to true and loan_contingency_days to null. Same logic applies to appraisal and all other contingencies.
10. Section 1D lists attached addenda — capture them in counter_offer_terms.attached_addenda as an array of strings.
11. PURCHASE PRICE: If this counter offer states a purchase price (in Section 1A or in Other Terms), extract the full price into counter_offer_terms.purchase_price as a number. Look for language like "Purchase price shall be $X", "Price increased to $X", "Price reduced to $X", "Buyer offers $X", or "Counter price $X". If no price change is specified, leave purchase_price as null.
12. Section 2 (Expiration): extract the default expiration (5:00pm on the third day after offeror signs) or any alternative date/time specified into the expiration section.
13. Section 4 (Offer): capture whether each offeror has a visible signature (offeror_1_signature_present, offeror_2_signature_present), their signature dates and typed names in section_4_offer. The offeror is the party making the counter (seller on SCO, buyer on BCO). There may be one or two lines.
14. Section 5 (Acceptance): capture whether each acceptor has a visible signature (acceptor_1_signature_present, acceptor_2_signature_present), their signature dates/times, and the "Subject to Attached Counter Offer" checkbox in section_5_acceptance. The acceptor is the party accepting (buyer on SCO, seller on BCO).
15. The confirmation_of_acceptance section at the bottom records when the signed acceptance was delivered.
16. Ignore boilerplate text, recitals, and standard CAR language — focus on transaction-specific data.
17. All fields not present or illegible should be null. Do not guess.
${FIELD_EXTRACTION_INSTRUCTION}
EXPECTED OUTPUT FORMAT:
Return ONLY valid JSON matching this template exactly. No markdown, no explanation.

${JSON.stringify(SCO_TEMPLATE, null, 2)}`,

  userPrompt: "Extract all fields from this Seller Counter Offer and return valid JSON matching the template. Output ONLY valid JSON.",
};
