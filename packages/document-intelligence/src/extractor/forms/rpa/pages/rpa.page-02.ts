import type { PageDefinition } from '../../form-definition';
import { fieldSchema, fieldProvenanceKeys, FIELD_EXTRACTION_INSTRUCTION } from '../../shared/field-schema.util';

const RPA_PAGE_2_SCHEMA = {
  page_number: 2,

  property_reference: {
    property_address: '<string|null>',
    date: '<string|null>',
    raw_text: '<string|null>',
  },

  section_3_terms_and_allocation_of_costs_page_2: {
    G_seller_payment_to_cover_buyer_expenses_and_costs: {
      G1_seller_credit_to_buyer: {
        paragraph: '<string|null>',
        checked: '<boolean>',
        amount: fieldSchema('the seller credit to buyer dollar amount entered', { valueType: 'number' }),
        purpose: '<string|null>',
        raw_text: '<string|null>',
      },
      G2_additional_seller_credit_terms: {
        text: '<string|null>',
        raw_text: '<string|null>',
      },
      G3_seller_payment_to_compensate_buyers_broker: {
        paragraph: '<string|null>',
        checked: '<boolean>',
        percentage_of_purchase_price: '<number|null>',
        dollar_amount: fieldSchema("the buyer's broker compensation dollar amount entered", { valueType: 'number' }),
        raw_text: '<string|null>',
      },
    },

    H_verification_documents: {
      H1_verification_of_all_cash: {
        paragraph: '<string|null>',
        attached_to_offer_checked: '<boolean>',
        default_days_after_acceptance: '<number|null>',
        override_days_after_acceptance: '<number|null>',
        days_after_acceptance: '<number|null>',
        ...fieldProvenanceKeys(),
        raw_text: '<string|null>',
      },
      H2_verification_of_down_payment_and_closing_costs: {
        paragraph: '<string|null>',
        attached_to_offer_checked: '<boolean>',
        default_days_after_acceptance: '<number|null>',
        override_days_after_acceptance: '<number|null>',
        days_after_acceptance: '<number|null>',
        ...fieldProvenanceKeys(),
        raw_text: '<string|null>',
      },
      H3_verification_of_loan_application: {
        paragraph: '<string|null>',
        attached_to_offer_checked: '<boolean>',
        default_days_after_acceptance: '<number|null>',
        override_days_after_acceptance: '<number|null>',
        days_after_acceptance: '<number|null>',
        ...fieldProvenanceKeys(),
        prequalification_checked: '<boolean>',
        preapproval_checked: '<boolean>',
        fully_underwritten_preapproval_checked: '<boolean>',
        raw_text: '<string|null>',
      },
    },

    I_intentionally_left_blank: {
      raw_text: '<string|null>',
    },

    J_final_verification_of_condition: {
      paragraph: '<string|null>',
      default_days_prior_to_coe: '<number|null>',
      override_days_prior_to_coe: '<number|null>',
      days_prior_to_coe: '<number|null>',
      ...fieldProvenanceKeys(),
      raw_text: '<string|null>',
    },

    K_assignment_request: {
      paragraph: '<string|null>',
      default_days_after_acceptance: '<number|null>',
      override_days_after_acceptance: '<number|null>',
      days_after_acceptance: '<number|null>',
      ...fieldProvenanceKeys(),
      raw_text: '<string|null>',
    },

    L_contingencies: {
      general_contingency_settings: {
        removal_or_waiver_heading: '<string|null>',
        contingency_removed_waived_checked: '<boolean>',
        cr_b_attached_checked: '<boolean>',
        right_side_advisory_text: '<string|null>',
        raw_text: '<string|null>',
      },

      L1_loan: {
        paragraph: '<string|null>',
        default_days_after_acceptance: '<number|null>',
        override_days_after_acceptance: '<number|null>',
        days_after_acceptance: '<number|null>',
        ...fieldProvenanceKeys(),
        no_loan_contingency_checked: '<boolean>',
        additional_terms: '<string|null>',
        extraction_warning: '<string|null>',
        raw_text: '<string|null>',
      },

      L2_appraisal: {
        paragraph: '<string|null>',
        default_days_after_acceptance: '<number|null>',
        override_days_after_acceptance: '<number|null>',
        days_after_acceptance: '<number|null>',
        ...fieldProvenanceKeys(),
        minimum_appraised_value: '<number|null>',
        no_appraisal_contingency_checked: '<boolean>',
        additional_terms: '<string|null>',
        extraction_warning: '<string|null>',
        raw_text: '<string|null>',
      },

      L3_investigation_of_property: {
        paragraph: '<string|null>',
        investigation: {
          title: '<string|null>',
          default_days_after_acceptance: '<number|null>',
          override_days_after_acceptance: '<number|null>',
          days_after_acceptance: '<number|null>',
          ...fieldProvenanceKeys(),
          raw_text: '<string|null>',
        },
        informational_access: {
          title: '<string|null>',
          default_days_after_acceptance: '<number|null>',
          override_days_after_acceptance: '<number|null>',
          days_after_acceptance: '<number|null>',
          ...fieldProvenanceKeys(),
          additional_terms: '<string|null>',
          raw_text: '<string|null>',
        },
        extraction_warning: '<string|null>',
        raw_text: '<string|null>',
      },

      L4_insurance: {
        paragraph: '<string|null>',
        default_days_after_acceptance: '<number|null>',
        override_days_after_acceptance: '<number|null>',
        days_after_acceptance: '<number|null>',
        ...fieldProvenanceKeys(),
        additional_terms: '<string|null>',
        extraction_warning: '<string|null>',
        raw_text: '<string|null>',
      },

      L5_review_of_seller_documents: {
        paragraph: '<string|null>',
        default_days_after_acceptance: '<number|null>',
        override_days_after_acceptance: '<number|null>',
        days_after_acceptance: '<number|null>',
        days_after_delivery: '<number|null>',
        ...fieldProvenanceKeys(),
        additional_terms: '<string|null>',
        extraction_warning: '<string|null>',
        raw_text: '<string|null>',
      },

      L6_preliminary_title_report: {
        paragraph: '<string|null>',
        default_days_after_acceptance: '<number|null>',
        override_days_after_acceptance: '<number|null>',
        days_after_acceptance: '<number|null>',
        days_after_delivery: '<number|null>',
        ...fieldProvenanceKeys(),
        additional_terms: '<string|null>',
        extraction_warning: '<string|null>',
        raw_text: '<string|null>',
      },

      L7_common_interest_disclosures: {
        paragraph: '<string|null>',
        default_days_after_acceptance: '<number|null>',
        override_days_after_acceptance: '<number|null>',
        days_after_acceptance: '<number|null>',
        days_after_delivery: '<number|null>',
        ...fieldProvenanceKeys(),
        additional_terms: '<string|null>',
        extraction_warning: '<string|null>',
        raw_text: '<string|null>',
      },

      L8_review_of_leased_or_liened_items: {
        paragraph: '<string|null>',
        default_days_after_acceptance: '<number|null>',
        override_days_after_acceptance: '<number|null>',
        days_after_acceptance: '<number|null>',
        days_after_delivery: '<number|null>',
        ...fieldProvenanceKeys(),
        additional_terms: '<string|null>',
        extraction_warning: '<string|null>',
        raw_text: '<string|null>',
      },

      L9_sale_of_buyers_property: {
        paragraph: '<string|null>',
        checked: '<boolean>',
        cop_attached_checked: '<boolean>',
        additional_terms: '<string|null>',
        raw_text: '<string|null>',
      },
    },

    M_possession: {
      M1_time_of_possession: {
        paragraph: '<string|null>',
        upon_notice_of_recordation_checked: '<boolean>',
        time: '<string|null>',
        am_checked: '<boolean>',
        pm_checked: '<boolean>',
        date: '<string|null>',
        topa_attached_checked: '<boolean>',
        raw_text: '<string|null>',
      },
      M2_seller_occupied_or_vacant_units: {
        paragraph: '<string|null>',
        coe_date_checked: '<boolean>',
        days_after_coe_29_or_fewer: '<number|null>',
        days_after_coe_30_or_more: '<number|null>',
        sip_attached_checked: '<boolean>',
        rlas_attached_checked: '<boolean>',
        additional_terms: '<string|null>',
        raw_text: '<string|null>',
      },
      M3_occupied_units_by_tenants_or_non_seller: {
        paragraph: '<string|null>',
        topa_attached_checked: '<boolean>',
        additional_terms: '<string|null>',
        raw_text: '<string|null>',
      },
    },

    N_documents_fees_compliance: {
      N1_seller_delivery_of_documents: {
        paragraph: '<string|null>',
        default_days_after_acceptance: '<number|null>',
        override_days_after_acceptance: '<number|null>',
        days_after_acceptance: '<number|null>',
        ...fieldProvenanceKeys(),
        raw_text: '<string|null>',
      },
      N2_sign_and_return_escrow_holder_provisions: {
        paragraph: '<string|null>',
        default_days_after_delivery: '<number|null>',
        override_days_after_delivery: '<number|null>',
        days_after_delivery: '<number|null>',
        ...fieldProvenanceKeys(),
        raw_text: '<string|null>',
      },
      N3_time_to_pay_fees_for_ordering_hoa_documents: {
        paragraph: '<string|null>',
        default_days_after_acceptance: '<number|null>',
        override_days_after_acceptance: '<number|null>',
        days_after_acceptance: '<number|null>',
        ...fieldProvenanceKeys(),
        raw_text: '<string|null>',
      },
      N4_install_smoke_alarms_co_detector_water_heater_bracing: {
        paragraph: '<string|null>',
        default_days_after_acceptance: '<number|null>',
        override_days_after_acceptance: '<number|null>',
        days_after_acceptance: '<number|null>',
        ...fieldProvenanceKeys(),
        raw_text: '<string|null>',
      },
      N5_evidence_of_representative_authority: {
        paragraph: '<string|null>',
        days_after_acceptance: '<number|null>',
        raw_text: '<string|null>',
      },
    },

    O_intentionally_left_blank: {
      raw_text: '<string|null>',
    },
  },
};

const SYSTEM_PROMPT = `
ROLE:
You are a California real estate transaction coordinator and OCR/vision extraction expert.

TASK:
Extract ONLY PAGE 2 of the California Residential Purchase Agreement.
Return valid JSON only. No markdown.

PAGE 2 SECTIONS TO EXTRACT:
- Property reference line at top
- Section G
- Section H
- Section I
- Section J
- Section K
- Section L
- Section M
- Section N
- Section O

GENERAL RULES:
- Match the schema exactly.
- Do not add fields.
- Use null for blank values.
- OCR is secondary.
- Visual inspection controls.
- A checkbox is true only if the actual checkbox box contains a visible X/checkmark/filled mark.
- Printed labels do not mean checked.
- Do not copy values from neighboring rows.
- Extract each row independently.
- raw_text should contain only text from that row or section.

MONEY NORMALIZATION RULE:
"$750.00" => 750
"$1,250.00" => 1250
"$1,250.50" => 1250.50
Remove "$" and commas.
Do not multiply by 100.

PERCENT NORMALIZATION RULE:
"2.25%" => 2.25
${FIELD_EXTRACTION_INSTRUCTION}
OVERRIDE VALUE POSITION RULE:
For rows formatted like:

17 ( _____ ) Days after Acceptance

do not rely on the printed word "or".

The handwritten or typed override number may appear:
- directly above the underline,
- immediately after 17,
- touching the left parenthesis,
- floating above the blank line,
- or partially covering printed text.

Visually inspect the entire region between:
- the printed default number "17"
and
- the phrase "Days after Acceptance".

If any integer X appears in that region,
and X is not the printed default 17,
then:

override_days_after_acceptance = X
days_after_acceptance = X

Examples:
17 (6_____) Days after Acceptance => X = 6
17 (15____) Days after Acceptance => X = 15
17 (__8___) Days after Acceptance => X = 8

Do not require:
- the word "or"
- centered positioning
- visible parentheses
- clean OCR
- underline separation

Only return null if no visible integer exists in the override region.

LEFT-EDGE OVERRIDE VALUE RULE:
For any override blank formatted like:
"17 (or ___) Days after Acceptance"

the override number may appear:
- centered in the blank,
- near the left edge of the blank,
- touching the parenthesis,
- immediately after "or",
- immediately after "(",
- or slightly overlapping the underline.

If any digit/integer X appears between the opening parenthesis "(" and the underline/closing parenthesis area, treat X as the override value.

Examples:
"17 (6____) Days after Acceptance" => X = 6
"17 (or6____) Days after Acceptance" => X = 6
"17 (or 6____) Days after Acceptance" => X = 6
"17 ( 6____) Days after Acceptance" => X = 6

Do not require the number to be centered in the blank.
Do not ignore a number because it is close to "or" or "(".

GENERIC OVERRIDE RULE:
For any row with a pattern like:
"X (or ___) Days after Acceptance"
or
"X (or ___) Days after Delivery"
or
"X (or ___) Days prior to COE"

Return:
- default value = printed number before "(or ___)"
- override value = visible handwritten/typed number inside blank, if present
- final value = override if present, otherwise default

If OCR misses the number but the image visually shows it, use the visual number.

RAW_TEXT CHECKBOX NORMALIZATION RULE:
For raw_text, do not preserve misleading OCR checkbox order.

When a row has Buyer / Seller / Both checkboxes, raw_text must reflect the visually correct checkbox state.

Use this normalized format:
Buyer [ ] Seller [X] Both [ ]

Examples:
If Seller is visually checked:
raw_text must say:
Buyer [ ] Seller [X] Both [ ]

If Buyer is visually checked:
raw_text must say:
Buyer [X] Seller [ ] Both [ ]

If Both is visually checked:
raw_text must say:
Buyer [ ] Seller [ ] Both [X]

If none are checked:
raw_text must say:
Buyer [ ] Seller [ ] Both [ ]

GENERIC OCR RESCUE RULE:
If raw text visually/OCR shows:
"17 (or X"
"17 (or X)"
"17 ( X"
"17 (X____)"
"17 (or\\nX"
"17 ( X Days after Acceptance"

where X is any visible integer before "Days after Acceptance",
then override_days_after_acceptance = X and days_after_acceptance = X.

Do not require:
- closing parenthesis
- perfect OCR spacing
- the word "or"

SECTION G RULES:
G1:
Seller credit to buyer is checked only if checkbox is marked.
Extract amount and purpose if present.

G2:
Extract only additional seller credit terms text.

G3:
Seller payment to compensate buyer broker is checked only if checkbox is marked.
Extract percentage or dollar amount.
If text says "2.25% of final purchase price", percentage_of_purchase_price = 2.25.

SECTION H RULES:
H1/H2/H3:
Each row has:
"Attached to the offer OR 3 (or ___) Days after Acceptance"

attached_to_offer_checked = true only if that checkbox is visibly checked.
default_days_after_acceptance = 3.
If override blank has a number, use it.
If blank is empty, days_after_acceptance = 3.

H3:
prequalification_checked, preapproval_checked, fully_underwritten_preapproval_checked are independent checkboxes.
Only true if visibly checked.

SECTION J RULE:
J Final Verification of Condition:
Pattern is "5 (or ___) Days prior to COE".
default_days_prior_to_coe = 5.
If override visible, use override.
Otherwise days_prior_to_coe = 5.

SECTION K RULE:
K Assignment Request:
Pattern is "17 (or ___) Days after Acceptance".
default_days_after_acceptance = 17.
If override visible, use override.
Otherwise days_after_acceptance = 17.

SECTION L STRICT RULES:
Read columns separately:
- column 1 = row label L(1), L(2), etc.
- column 2 = Para #
- column 3 = contingency title
- column 4 = time to remove contingencies
- column 5 = contingency removed checkbox

The JSON paragraph field must come from Para # column, not row label.
Do not use L(1), L(2), L(3) as paragraph value.

L VISUAL OVERRIDE RULE:
For every L contingency row, visually inspect the number handwritten/typed inside the "(or ___)" override blank.

If a visible integer X appears inside or immediately next to the override blank before "Days after Acceptance":
override_days_after_acceptance = X
days_after_acceptance = X
extraction_warning = null

This applies to:
L1, L2, L3 investigation, L3 informational_access, L4, L5, L6, L7, L8.

If no visible override number exists:
override_days_after_acceptance = null
days_after_acceptance = default_days_after_acceptance

L1:
No loan contingency checkbox belongs only to L1.
Do not set true because text exists.

L2:
No appraisal contingency checkbox belongs only to L2.
Minimum appraised value is only the amount near "$ ____".
The FVAC sentence belongs to L2 additional_terms.

L3:
L3 has two child rows:
1. Investigation of Property
2. Informational Access to Property

Extract them separately.
Do not copy Investigation value into Informational Access.
Do not copy Informational Access value into Investigation.

L4:
Insurance contains only:
"17 (or ___) Days after Acceptance"
Do not include "or 5 Days after Delivery" in L4.

**L4 INSURANCE SPECIFIC GUIDANCE:**
- Paragraph number comes from the "Para #" column → "8D"
- This row is for Insurance contingency only.
- Do NOT include any "Days after Delivery" text in this row's additional_terms.
- Carefully inspect for override number near "or".


L5-L8:
These rows include:
"or 5 Days after Delivery, whichever is later"
Set days_after_delivery = 5.

FINAL L CHECKBOX CONSISTENCY RULE:
Before returning JSON, review L1 and L2 raw_text.

If L1 raw_text contains "☑ No loan contingency" or visually shows the No loan contingency checkbox checked:
no_loan_contingency_checked = true.

If L2 raw_text contains "☑ No appraisal contingency" or visually shows the No appraisal contingency checkbox checked:
no_appraisal_contingency_checked = true.

It is invalid for raw_text to contain a checked checkbox symbol "☑" while the matching boolean is false.

GENERAL CONTINGENCY SETTINGS:
The right-side "REMOVAL OR WAIVER OF CONTINGENCY" box belongs only to general_contingency_settings.
Do not place CR-B text or right-side advisory text inside L3-L8 raw_text or additional_terms.
cr_b_attached_checked = true only if CR-B checkbox is visibly checked.

L9:
checked = true only if Sale of Buyer's Property contingency checkbox is visibly checked.
cop_attached_checked = true only if C.A.R. Form COP attached checkbox is visibly checked.
Printed sentence belongs in raw_text only.
additional_terms = null unless separate handwritten/typed extra text exists.

SECTION M RULES:
M1:
upon_notice_of_recordation_checked is true only if that checkbox is checked.
If 6 PM is selected, time = "6", pm_checked = true.
Do not set false just because text says "Upon notice of recordation" if checkbox is actually checked.

M2:
coe_date_checked true only if COE date checkbox is checked.
Extract 29-or-fewer and 30-or-more days only if values are written.
SIP/RLAS checkboxes only true if visibly checked.

M3:
TOPA attached true only if checkbox visibly checked.

SECTION N RULES:
N1:
Pattern "7 (or ___) Days after Acceptance".
default = 7.

N2:
Pattern "5 (or ___) Days after Delivery".
default = 5.

N3:
Pattern "3 (or ___) Days after Acceptance".
default = 3.

N4:
Pattern "7 (or ___) Days after Acceptance".
default = 7.

N5:
Fixed "3 Days after Acceptance".
days_after_acceptance = 3.

OUTPUT:
Return valid JSON only matching this schema:
${JSON.stringify(RPA_PAGE_2_SCHEMA, null, 2)}
`;

export const rpaPage2: PageDefinition = {
  pageNumber: 2,
  systemPrompt: SYSTEM_PROMPT,
  userPrompt: 'Extract page 2 of RPA and return valid JSON matching the schema.',
  model: 'gemini-3.1-flash-lite',
  provider: 'gemini',
};
