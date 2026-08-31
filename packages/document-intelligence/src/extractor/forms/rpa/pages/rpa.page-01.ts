import type { PageDefinition } from '../../form-definition';
import { fieldSchema, FIELD_EXTRACTION_INSTRUCTION } from '../../shared/field-schema.util';

const RPA_PAGE_1_SCHEMA = {
  page_number: 1,

  form_metadata: {
    form_code:
      '<string|null — expected value "RPA">',

    form_title:
      '<string|null — expected title "CALIFORNIA RESIDENTIAL PURCHASE AGREEMENT AND JOINT ESCROW INSTRUCTIONS">',

    form_revision:
      '<string|null — revision month and year exactly as printed, normalized as M/YY or MM/YY, for example "6/26">',

    form_revision_label:
      '<string|null — complete revision phrase as printed, for example "Revised 6/26">',

    logical_page_number:
      '<number|null — logical RPA page number printed in the footer; expected 1>',

    total_page_count:
      '<number|null — total number of RPA pages printed in the footer, for example 17>',

    correct_page_label:
      '<boolean — true only when the footer identifies RPA PAGE 1 OF the expected total page count>',
  },

  section_1_offer: {
    date_prepared:
      '<date: YYYY-MM-DD|null — transaction preparation date entered beside "Date Prepared"; do not use the form revision date>',

    A_offer_from: {
      buyer_names: '<string[]>',
      raw_text: '<string|null>',
    },

    B_property: {
      street_address: '<string|null>',
      city: '<string|null>',
      county: '<string|null>',
      state: 'California',
      zip_code: '<string|null>',
      assessor_parcel_number: '<string|null>',
      raw_text: '<string|null>',
    },

    C_terms_specified_below: {
      acknowledged: '<boolean>',
      raw_text: '<string|null>',
    },

    D_parties: {
      buyer_and_seller_referred_to_as_parties: '<boolean>',
      brokers_and_agents_not_parties: '<boolean>',
      raw_text: '<string|null>',
    },
  },

  section_2_agency: {
    A_disclosure: {
      disclosure_acknowledged: '<boolean>',
      raw_text: '<string|null>',
    },

    B_confirmation: {
      seller_brokerage_firm: '<string|null>',
      seller_brokerage_license_number: '<string|null>',

      seller_brokerage_represents_seller_checked: '<boolean>',
      seller_brokerage_dual_agent_checked: '<boolean>',

      seller_agent: '<string|null>',
      seller_agent_license_number: '<string|null>',

      seller_agent_represents_seller_checked: '<boolean>',
      seller_agent_dual_agent_checked: '<boolean>',

      buyer_brokerage_firm: '<string|null>',
      buyer_brokerage_license_number: '<string|null>',

      buyer_brokerage_represents_buyer_checked: '<boolean>',
      buyer_brokerage_dual_agent_checked: '<boolean>',

      buyer_agent: '<string|null>',
      buyer_agent_license_number: '<string|null>',

      buyer_agent_represents_buyer_checked: '<boolean>',
      buyer_agent_dual_agent_checked: '<boolean>',

      raw_text: '<string|null>',
    },

    C_more_than_one_brokerage: {
      checked:
        '<boolean — true when either the Seller or Buyer option is visibly checked>',

      seller_checked: '<boolean>',
      buyer_checked: '<boolean>',
      raw_text: '<string|null>',
    },

    D_potentially_competing_buyers_and_sellers: {
      possible_representation_checked:
        '<boolean — true only when a selectable field is present and visibly marked; informational paragraph text alone is not a checked selection>',

      raw_text: '<string|null>',
    },
  },

  section_3_terms_and_allocation_of_costs_page_1: {
    A_purchase_price: {
      paragraph: '<string|null>',
      purchase_price: fieldSchema('the total purchase price entered for the transaction', { valueType: 'number' }),
      all_cash_checked: '<boolean>',
      raw_text: '<string|null>',
    },

    B_close_of_escrow: {
      paragraph: '<string|null>',

      days_after_acceptance: fieldSchema('number entered before "Days after Acceptance"', { valueType: 'number' }),

      on_date_checked:
        '<boolean — true only when the specific-date option is visibly selected or a specific date is entered>',

      close_of_escrow_date: fieldSchema('the specific Close of Escrow date entered, when the specific-date option is used instead of days after acceptance', { valueType: 'date' }),

      raw_text: '<string|null>',
    },

    C_expiration_of_offer: {
      paragraph: '<string|null>',

      days_after_buyer_signatures:
        '<number|null — default or override number of calendar days after all Buyer signatures>',

      expiration_date:
        '<date: YYYY-MM-DD|null — specific expiration date when entered; do not use Date Prepared or the RPA revision date>',

      expiration_time: '<string|null>',

      am_checked: '<boolean>',
      pm_checked: '<boolean>',

      raw_text: '<string|null>',
    },

    D1_initial_deposit_amount: {
      paragraph: '<string|null>',
      deposit_amount: fieldSchema('the initial deposit (earnest money) amount entered', { valueType: 'number' }),
      percentage_of_purchase_price: '<number|null>',
      business_days_after_acceptance: fieldSchema('number of business days after Acceptance entered for delivery of the initial deposit', { valueType: 'number' }),
      wire_transfer_checked: '<boolean>',
      other_delivery_method_checked: '<boolean>',
      raw_text: '<string|null>',
    },

    D2_increased_deposit: {
      paragraph: '<string|null>',
      increased_deposit_checked: '<boolean>',
      raw_text: '<string|null>',
    },

    E1_first_loan: {
      paragraph: '<string|null>',
      loan_amount: fieldSchema('the first loan amount entered', { valueType: 'number' }),
      percentage_of_purchase_price: '<number|null>',

      fixed_rate_checked: '<boolean>',
      initial_adjustable_rate_checked: '<boolean>',

      conventional_checked: '<boolean>',
      fha_checked: '<boolean>',
      va_checked: '<boolean>',
      seller_financing_checked: '<boolean>',
      other_checked: '<boolean>',
      other_text: '<string|null>',

      raw_text: '<string|null>',
    },

    E2_additional_financed_amount: {
      paragraph: '<string|null>',
      loan_amount: fieldSchema('the additional financed amount entered', { valueType: 'number' }),
      percentage_of_purchase_price: '<number|null>',

      fixed_rate_checked: '<boolean>',
      initial_adjustable_rate_checked: '<boolean>',

      conventional_checked: '<boolean>',
      seller_financing_checked: '<boolean>',
      other_checked: '<boolean>',
      other_text: '<string|null>',

      raw_text: '<string|null>',
    },

    E3_occupancy_type: {
      paragraph: '<string|null>',
      primary_checked: '<boolean>',
      secondary_checked: '<boolean>',
      investment_checked: '<boolean>',
      raw_text: '<string|null>',
    },

    F_balance_of_down_payment: {
      paragraph: '<string|null>',
      balance_of_down_payment: '<number|null>',
      raw_text: '<string|null>',
    },

    purchase_price_total: {
      amount: '<number|null>',
      raw_text: '<string|null>',
    },
  },
};

const SYSTEM_PROMPT = `
ROLE:
You are a California real estate transaction coordinator and an OCR/vision
document-extraction specialist.

TASK:
Extract ONLY logical page 1 of the California Residential Purchase Agreement
and Joint Escrow Instructions, C.A.R. Form RPA.

Return valid JSON only. Do not return markdown, explanations, comments, or
fields outside the schema.

FORM IDENTIFICATION:
The page normally contains the title:

"CALIFORNIA RESIDENTIAL PURCHASE AGREEMENT
AND JOINT ESCROW INSTRUCTIONS"

The header normally identifies the form and revision in a format such as:

"C.A.R. FORM RPA, Revised 6/26"

The footer normally identifies the revision and page count in a format such as:

"RPA REVISED 6/26 (PAGE 1 OF 17)"

and:

"CALIFORNIA RESIDENTIAL PURCHASE AGREEMENT AND JOINT ESCROW INSTRUCTIONS
(RPA PAGE 1 OF 17)"

FORM REVISION EXTRACTION — CRITICAL:
Extract the C.A.R. form revision separately from all transaction dates.

For example:

- Header text: "C.A.R. FORM RPA, Revised 6/26"
- form_revision = "6/26"
- form_revision_label = "Revised 6/26"

The form revision is not:

- Date Prepared
- Property header date
- Buyer signature date
- Seller signature date
- Acceptance date
- Close of Escrow date
- Offer expiration date
- DocuSign envelope date
- Footer transaction-production date

Look for the revision in both:

1. The form header beneath the title.
2. The printed RPA footer.

If the header and footer show the same revision, return that revision.

If only one location is readable, use the readable revision.

If the header and footer appear to contain different revisions:

- Do not guess.
- Use null for form_revision.
- Preserve the visible conflicting text in form_revision_label.

Normalize the revision month and year as:

- "6/26"
- "12/23"
- "6/25"

Do not convert the form revision to a full calendar date because it represents
a form edition month and year, not a transaction date.

PAGE NUMBER RULE:
Use the logical page number printed in the RPA footer.

Do not rely on the absolute PDF packet page because other forms may appear
before the RPA.

For this definition:

- logical_page_number should be 1.
- Extract total_page_count from the footer.
- The uploaded revision may contain 17 total RPA pages.
- Older or newer revisions may contain a different total page count.

Set correct_page_label to true only when the page is clearly identified as
logical RPA page 1.

DATE PREPARED RULE:
Extract "Date Prepared" from the field at the top of Section 1.

Return it as YYYY-MM-DD when readable.

Examples:

- "July 23, 2026" becomes "2026-07-23"
- "7/23/26" becomes "2026-07-23"

Do not substitute the form revision when Date Prepared is blank.

GENERAL EXTRACTION RULES:
- Match the schema exactly.
- Do not add, remove, rename, or rearrange fields.
- Use null for blank or unreadable scalar values.
- Use an empty array when no Buyer names are found.
- OCR text is secondary.
- Visual field location controls.
- Printed labels do not constitute entered values.
- Do not infer values from unrelated pages or footer metadata.

CHECKBOX RULE:
A checkbox is true only when the box itself contains a clear:

- X
- Checkmark
- Filled selection
- Deliberate electronic mark

A nearby value or printed label does not make a checkbox true.

When two choices are mutually exclusive:

- Evaluate each printed box separately.
- Do not infer one checkbox from the other.
- If neither box is marked, return false for both.

MONEY RULE:
Convert monetary values to numbers without currency symbols or commas.

Examples:

- "$811,900.00" becomes 811900
- "$2,754,000.00" becomes 2754000
- Blank becomes null

PERCENTAGE RULE:
Convert percentages to numbers without the percent sign.

Examples:

- "1.97%" becomes 1.97
- "72.62%" becomes 72.62
- Blank becomes null
${FIELD_EXTRACTION_INSTRUCTION}
SECTION 1 — OFFER:
Extract:

- Date Prepared
- Section 1A Buyer names
- Section 1B Property information
- Section 1C acknowledgment text
- Section 1D definition of Parties

BUYER NAME RULE:
Section 1A may contain multiple Buyers.

Split multiple Buyers into separate buyer_names entries when separated by:

- Commas
- Semicolons
- "and"
- Separate clearly identifiable names

Preserve entity names as one Buyer when the text is the name of a trust,
corporation, LLC, partnership, or estate.

PROPERTY RULE:
Extract from Section 1B:

- Street address
- City
- County
- State
- ZIP Code
- Assessor's Parcel Number

Use only the property fields in Section 1B.

Do not use property text from the generated footer when the actual Section 1B
field is blank.

SECTION 2 — AGENCY:
Extract Sections 2A through 2D.

For each brokerage or agent:

- Extract the name.
- Extract the corresponding license number.
- Evaluate each representation checkbox independently.

Do not confuse:

- Brokerage name with individual agent name.
- Brokerage license number with agent license number.
- Seller representation with dual agency.
- Buyer representation with dual agency.

SECTION 2C RULE:
Section 2C may contain:

- A checkbox indicating more than one brokerage.
- A Seller checkbox.
- A Buyer checkbox.

Set checked to true only when seller_checked or buyer_checked is true.

SECTION 2D RULE:
Section 2D is generally an informational advisory regarding potentially
competing Buyers and Sellers.

Do not return possible_representation_checked = true merely because the
paragraph exists.

Return true only when the revision contains an actual selectable field and it
is visibly marked.

SECTION 3:
Extract only the page 1 portion of Section 3:

- Row A: Purchase Price
- Row B: Close of Escrow
- Row C: Expiration of Offer
- Row D(1): Initial Deposit
- Row D(2): Increased Deposit
- Row E(1): First Loan
- Row E(2): Additional Financed Amount
- Row E(3): Occupancy Type
- Row F: Balance of Down Payment
- Purchase Price Total

PARAGRAPH FIELD:
For each Section 3 row, extract the printed paragraph reference from the
"Para #" column when visible.

Examples:

- "5, 5B (cash)"
- "32A"
- "5A(1)"
- "5C(1)"
- "7A"
- "5D"

Do not confuse the row identifier, such as A or D(1), with the paragraph
reference.

CLOSE OF ESCROW:
Section 3B may specify either:

- A number of Days after Acceptance; or
- A specific date.

Extract both fields independently.

When a number of days is entered:

- days_after_acceptance contains that number.
- close_of_escrow_date is null unless a specific date is also entered.

EXPIRATION OF OFFER:
Section 3C may specify either:

- A number of calendar days after all Buyer signatures; or
- A specific expiration date and time.

The expiration date is not Date Prepared and is not the RPA revision.

INITIAL DEPOSIT:
Extract:

- Deposit amount
- Percentage shown for calculation purposes
- Business days after Acceptance
- Wire-transfer selection
- Other delivery-method selection

LOAN TERMS:
For E(1) and E(2), evaluate every financing checkbox independently.

Do not infer Conventional merely because FHA, VA, Seller Financing, or Other
is not checked.

OCCUPANCY TYPE:
Evaluate Primary, Secondary, and Investment independently.

PURCHASE PRICE VALIDATION:
Extract both:

- Section 3A purchase_price
- purchase_price_total amount

Do not automatically replace one with the other if they differ.

RAW TEXT:
raw_text should contain only the visible entered value and nearby applicable
field text for that section.

Do not include:

- Entire page OCR
- Footer metadata
- DocuSign Envelope IDs
- Brokerage production text unrelated to that field

GENERAL RULES:
- Use null when information cannot be determined reliably.
- Do not guess partially visible numbers.
- Return dates as YYYY-MM-DD when they represent transaction dates.
- Keep the form revision as M/YY or MM/YY.
- Return valid JSON only.

SCHEMA:
${JSON.stringify(RPA_PAGE_1_SCHEMA, null, 2)}
`;

export const rpaPage1: PageDefinition = {
  pageNumber: 1,

  systemPrompt: SYSTEM_PROMPT,

  userPrompt: `
Extract logical page 1 of the C.A.R. Residential Purchase Agreement.

Extract:

1. Form title, form code, form revision, and logical page count.
2. Date Prepared and Sections 1A through 1D.
3. Agency information from Sections 2A through 2D.
4. Section 3 rows A through F.

Keep the form revision separate from Date Prepared and all other transaction
dates.

Return valid JSON matching the schema exactly.
  `.trim(),

  model: 'gemini-3.1-flash-lite',
  provider: 'gemini',
};
