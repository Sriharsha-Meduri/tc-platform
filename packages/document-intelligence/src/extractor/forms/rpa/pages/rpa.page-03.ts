import type { PageDefinition } from '../../form-definition';
import { fieldSchema, FIELD_EXTRACTION_INSTRUCTION } from '../../shared/field-schema.util';

// TODO: Define page-specific JSON schema for RPA page 3
const RPA_PAGE_3_SCHEMA = {
  page_number: 3,

  section_3_terms_and_allocation_of_costs_page_3: {
    P_items_included_and_excluded: {
      P1_items_included: {
        paragraph: '<string|null>',
        stove_checked: '<boolean>',
        oven_checked: '<boolean>',
        stove_oven_checked: '<boolean>',
        cooktop_checked: '<boolean>',
        refrigerator_checked: '<boolean>',
        wine_refrigerator_checked: '<boolean>',
        washer_checked: '<boolean>',
        dryer_checked: '<boolean>',
        dishwasher_checked: '<boolean>',
        microwave_checked: '<boolean>',
        video_doorbell_checked: '<boolean>',
        security_camera_checked: '<boolean>',
        security_system_checked: '<boolean>',
        separate_video_doorbell_and_camera_checked: '<boolean>',
        smart_home_control_devices_checked: '<boolean>',
        wall_mounted_brackets_checked: '<boolean>',
        above_ground_pool_checked: '<boolean>',
        spa_checked: '<boolean>',
        bathroom_mirrors_checked: '<boolean>',
        electric_car_charging_systems_checked: '<boolean>',
        potted_trees_shrubs_checked: '<boolean>',
        additional_items_included: '<string|null>',
        raw_text: '<string|null>',
      },

      P2_excluded_items: {
        excluded_items: '<string|null>',
        raw_text: '<string|null>',
      },
    },

    Q_allocation_of_costs: {
      Q1_natural_hazard_zone_disclosure_report: {
        paragraph: '<string|null>',
        paid_by: '<"Buyer"|"Seller"|"Both"|null>',
        environmental_checked: '<boolean>',
        other_checked: '<boolean>',
        provided_by: '<string|null>',
        additional_terms: '<string|null>',
        raw_text: '<string|null>',
      },

      Q2_optional_wildfire_disclosure_report: {
        paragraph: '<string|null>',
        paid_by: '<"Buyer"|"Seller"|"Both"|null>',
        provided_by: '<string|null>',
        additional_terms: '<string|null>',
        raw_text: '<string|null>',
      },

      Q3_other_report_a_b: {
        paragraph: '<string|null>',
        report_a_text: '<string|null>',
        report_a_paid_by: '<"Buyer"|"Seller"|"Both"|null>',
        report_b_text: '<string|null>',
        report_b_paid_by: '<"Buyer"|"Seller"|"Both"|null>',
        additional_terms: '<string|null>',
        raw_text: '<string|null>',
      },

      Q4_smoke_alarms_co_detectors_water_heater_bracing: {
        paragraph: '<string|null>',
        paid_by: '<"Buyer"|"Seller"|"Both"|null>',
        additional_terms: '<string|null>',
        raw_text: '<string|null>',
      },

      Q5_government_required_point_of_sale_inspections_reports: {
        paragraph: '<string|null>',
        paid_by: '<"Buyer"|"Seller"|"Both"|null>',
        additional_terms: '<string|null>',
        raw_text: '<string|null>',
      },

      Q6_government_required_point_of_sale_corrective_remedial_actions: {
        paragraph: '<string|null>',
        paid_by: '<"Buyer"|"Seller"|"Both"|null>',
        additional_terms: '<string|null>',
        raw_text: '<string|null>',
      },

      Q7_escrow_fee: {
        paragraph: '<string|null>',
        paid_by: '<"Buyer"|"Seller"|"Both"|"Each"|null>',
        each_pay_own_fees_checked: '<boolean>',
        escrow_holder: fieldSchema('the escrow holder name entered', { valueType: 'string' }),
        additional_terms: '<string|null>',
        raw_text: '<string|null>',
      },

      Q8_owners_title_insurance_policy: {
        paragraph: '<string|null>',
        paid_by: '<"Buyer"|"Seller"|"Both"|null>',
        title_company: fieldSchema('the title company name entered', { valueType: 'string' }),
        additional_terms: '<string|null>',
        raw_text: '<string|null>',
      },

      Q9_buyers_lender_title_insurance_policy: {
        paragraph: '<string|null>',
        paid_by: '<"Buyer"|"Seller"|"Both"|null>',
        additional_terms: '<string|null>',
        raw_text: '<string|null>',
      },

      Q10_county_transfer_tax_fees: {
        paragraph: '<string|null>',
        paid_by: '<"Buyer"|"Seller"|"Both"|null>',
        additional_terms: '<string|null>',
        raw_text: '<string|null>',
      },

      Q11_city_transfer_tax_fees: {
        paragraph: '<string|null>',
        paid_by: '<"Buyer"|"Seller"|"Both"|null>',
        additional_terms: '<string|null>',
        raw_text: '<string|null>',
      },

      Q12_hoa_fee_for_preparing_disclosures: {
        paragraph: '<string|null>',
        paid_by: '<"Buyer"|"Seller"|"Both"|null>',
        additional_terms: '<string|null>',
        raw_text: '<string|null>',
      },

      Q13_hoa_certification_fee: {
        paragraph: '<string|null>',
        paid_by: '<"Buyer"|"Seller"|"Both"|null>',
        additional_terms: '<string|null>',
        raw_text: '<string|null>',
      },

      Q14_hoa_transfer_fees: {
        paragraph: '<string|null>',
        paid_by: '<"Buyer"|"Seller"|"Both"|null>',
        additional_terms: '<string|null>',
        raw_text: '<string|null>',
      },

      Q15_private_transfer_fees: {
        paragraph: '<string|null>',
        paid_by: '<"Buyer"|"Seller"|"Both"|null>',
        additional_terms: '<string|null>',
        raw_text: '<string|null>',
      },

      Q16_fees_or_costs: {
        paragraph: '<string|null>',
        description: '<string|null>',
        paid_by: '<"Buyer"|"Seller"|"Both"|null>',
        additional_terms: '<string|null>',
        raw_text: '<string|null>',
      },

      Q17_fees_or_costs: {
        paragraph: '<string|null>',
        description: '<string|null>',
        paid_by: '<"Buyer"|"Seller"|"Both"|null>',
        additional_terms: '<string|null>',
        raw_text: '<string|null>',
      },

      Q18_home_warranty_plan: {
        paragraph: '<string|null>',
        paid_by: '<"Buyer"|"Seller"|"Both"|null>',
        seller_cost_not_to_exceed: fieldSchema('the seller cost-not-to-exceed dollar amount entered for the home warranty', { valueType: 'number' }),
        issued_by: fieldSchema('the home warranty company name entered', { valueType: 'string' }),
        buyer_waives_home_warranty_checked: '<boolean>',
        additional_terms: '<string|null>',
        raw_text: '<string|null>',
      },
    },

    R_other_terms: {
      text: '<string|null>',
      raw_text: '<string|null>',
      modifications: {
        purchase_price: fieldSchema('a purchase price change negotiated in Other Terms', { valueType: 'number' }),
        close_of_escrow_date: fieldSchema('a close of escrow date change negotiated in Other Terms', { valueType: 'date' }),
        possession_date: fieldSchema('a possession date change negotiated in Other Terms', { valueType: 'date' }),
        initial_deposit_amount: fieldSchema('an initial deposit amount change negotiated in Other Terms', { valueType: 'number' }),
        increased_deposit_amount: fieldSchema('an increased deposit amount negotiated in Other Terms', { valueType: 'number' }),
        seller_credit_amount: fieldSchema('a seller credit amount negotiated in Other Terms', { valueType: 'number' }),
        loan_contingency_waived: fieldSchema('whether the loan contingency was waived per Other Terms', { valueType: 'boolean' }),
        loan_contingency_days: fieldSchema('a loan contingency day-count change negotiated in Other Terms', { valueType: 'number' }),
        appraisal_contingency_waived: fieldSchema('whether the appraisal contingency was waived per Other Terms', { valueType: 'boolean' }),
        appraisal_contingency_days: fieldSchema('an appraisal contingency day-count change negotiated in Other Terms', { valueType: 'number' }),
        inspection_contingency_days: fieldSchema('an investigation/inspection contingency day-count change negotiated in Other Terms', { valueType: 'number' }),
        seller_document_review_days: fieldSchema('a seller document review day-count change negotiated in Other Terms', { valueType: 'number' }),
        title_review_days: fieldSchema('a title report review day-count change negotiated in Other Terms', { valueType: 'number' }),
        insurance_contingency_days: fieldSchema('an insurance contingency day-count change negotiated in Other Terms', { valueType: 'number' }),
        hoa_review_days: fieldSchema('an HOA document review day-count change negotiated in Other Terms', { valueType: 'number' }),
        leased_liened_review_days: fieldSchema('a leased/liened item review day-count change negotiated in Other Terms', { valueType: 'number' }),
        sale_of_buyers_property: fieldSchema("whether a sale-of-buyer's-property contingency was added or changed per Other Terms", { valueType: 'boolean' }),
        buyer_broker_compensation: fieldSchema("a buyer's broker compensation change negotiated in Other Terms", { valueType: 'string' }),
        repairs_or_credits: fieldSchema('repairs or credits negotiated in Other Terms', { valueType: 'string' }),
        occupancy_or_rent_back: fieldSchema('an occupancy or rent-back term negotiated in Other Terms', { valueType: 'string' }),
        home_warranty: fieldSchema('a home warranty term negotiated in Other Terms', { valueType: 'string' }),
        items_included_or_excluded: fieldSchema('items included or excluded negotiated in Other Terms', { valueType: 'string' }),
        hoa_terms: fieldSchema('HOA-related terms negotiated in Other Terms', { valueType: 'string' }),
        solar_or_leased_items: fieldSchema('solar or leased item terms negotiated in Other Terms', { valueType: 'string' }),
        other_deadlines_or_obligations: fieldSchema('any other deadline or obligation negotiated in Other Terms', { valueType: 'string' }),
      },
    },
  },
};

const SYSTEM_PROMPT = `
ROLE:
You are a California real estate transaction coordinator and OCR/vision extraction expert.

TASK:
Extract ONLY PAGE 3 of the California Residential Purchase Agreement.
Return valid JSON only. No markdown.

PAGE 3 SECTIONS:
- P Items Included and Excluded
- Q Allocation of Costs
- R Other Terms

GENERAL RULES:
- Match the schema exactly.
- Do not add fields.
- Use null for blank values.
- OCR is secondary. Visual inspection controls.
- A checkbox is true only if the actual box contains a visible X/checkmark/filled mark.
- Printed labels do not mean checked.
- Extract each row independently.
- Do not copy values from neighboring rows.
- raw_text should contain only text from that row or section.

MONEY NORMALIZATION RULE:
"$750.00" => 750
"$1,200.00" => 1200
"$1,250.50" => 1250.50
Remove "$" and commas.
Do not multiply by 100.
${FIELD_EXTRACTION_INSTRUCTION}
SECTION P RULES:
P1:
Extract every checked included item.
Only set true if checkbox is visibly checked.
Additional Items Included should contain only typed/written text in the additional included items line.

P2:
Extract excluded items only from the excluded items lines.
If blank, excluded_items = null.

SECTION Q ALLOCATION OF COSTS STRICT VISUAL RULE:

For each Q row, extract only from that row.
Do not borrow payer values, notes, provider names, or advisory text from neighboring Q rows.

Q CHECKBOX RULE:
The printed words "Buyer", "Seller", and "Both" are checkbox labels only.

paid_by must be set ONLY when:
1. The checkbox immediately next to Buyer, Seller, or Both is visibly checked with X/checkmark/filled mark; OR
2. The row has explicit printed default payer language listed in DEFAULT PAYER ROWS below.

Do NOT infer paid_by from the presence of the words Buyer, Seller, or Both in raw_text.

If no checkbox is visibly checked and the row is not a default payer row:
paid_by = null.

CHECKMARK POSITION RULE:
The X/checkmark belongs to the checkbox immediately adjacent to it.

Example:
"Buyer X Seller Both" can mean Seller if the X is visually inside Seller checkbox.
Do not assign paid_by based on word order.
Assign paid_by based only on the checkbox physically marked.

OCR ORDER WARNING:
OCR text order may not match the visual left-to-right checkbox layout.
The checked payer is determined by the visually checked box in the image, not by OCR token order.

ROW-LOCAL CHECKBOX RULE:
A checkbox mark belongs only to the current row.
Do not reuse a checkmark from the row above or below.

DEFAULT PAYER ROWS:
- Q9 Buyer's Lender title insurance policy => paid_by = "Buyer"
- Q12 HOA fee for preparing disclosures => paid_by = "Seller"
- Q13 HOA certification fee => paid_by = "Buyer"
- Q15 Private transfer fees => paid_by = "Seller", unless Buyer or Both checkbox is visibly checked

Do not confuse:
- Provided by
- Escrow Holder
- Title Co.
- Issued by
with paid_by.

Q1 NATURAL HAZARD DISCLOSURE RULE:
Extract Buyer/Seller/Both payer checkbox separately from Environmental/Other.
Environmental checkbox does not affect paid_by.
Provided by goes only into provided_by.

Q2 OPTIONAL WILDFIRE DISCLOSURE REPORT RULE:
If row says Not Applicable, paid_by = null unless Buyer/Seller/Both checkbox is visibly checked.
Extract Provided by separately.
Do not treat provider name as payer.

Q3 OTHER REPORT RULE:
For Q3(A) and Q3(B), extract report text separately.
Only set report_a_paid_by or report_b_paid_by if the corresponding Buyer/Seller/Both checkbox on that exact A or B line is visibly checked.
If unchecked, return null.

Q7 ESCROW FEE RULE:
If "Each to pay their own fees" is checked:
paid_by = "Each"
each_pay_own_fees_checked = true
Extract Escrow Holder separately into escrow_holder.

Q8 OWNER'S TITLE INSURANCE RULE:
Extract paid_by from Buyer/Seller/Both checkbox.
Extract Title Co. separately into title_company.
Do not include Q9 lender title advisory text in Q8 additional_terms.

Q9 BUYER'S LENDER TITLE INSURANCE RULE:
This row has printed default paid_by = "Buyer".
The advisory text on the right belongs to Q9 additional_terms.

Q14 HOA TRANSFER FEES RULE:
The explanatory HOA move-in/move-out fee paragraph belongs to Q14 additional_terms only.
It does not determine paid_by.
Only assign paid_by if Buyer/Seller/Both checkbox is visibly marked.
Otherwise paid_by = null.

Q16/Q17 FEES OR COSTS RULE:
Description is the typed/written text before "fees or costs".
Only set description if typed/written text exists.
Only set paid_by if Buyer/Seller/Both checkbox is visibly checked.
If blank, description = null and paid_by = null.

Q18 HOME WARRANTY RULE:
Extract paid_by only from Buyer/Seller/Both checkboxes.
If Seller checkbox is visibly checked, paid_by = "Seller".
The phrase "Home warranty plan chosen by Buyer" means Buyer chooses the plan. It does NOT mean Buyer pays.
Extract "Issued by" separately into issued_by.
Extract visible amount after "Seller's cost not to exceed $" into seller_cost_not_to_exceed.
buyer_waives_home_warranty_checked = true only if the checkbox next to "Buyer waives home warranty plan" is visibly checked.
Do not set buyer_waives_home_warranty_checked true just because printed text appears.

SECTION R RULE:
Extract only the text after "OTHER TERMS:" into text.
If blank, text = null.
ALSO analyze that text for all negotiated modifications and extract them into the modifications block. Look for changes to: purchase price, close of escrow date, possession date, deposit amounts, ALL CONTINGENCY MODIFICATIONS (contingency waivers, day-count changes for loan, appraisal, inspection/investigation, insurance, seller doc review, title review, HOA disclosure review, leased/liened item review, sale of buyer's property contingency), seller credits, buyer broker compensation, repairs, occupancy/rent-back terms, home warranty, items included/excluded, HOA terms, solar/leased items, and any other negotiated terms.
CONTINGENCY OVERRIDE RULES: A specific term overrides a general one. A waiver overrides a day count. If Other Terms says "Loan contingency to be 10 days", set loan_contingency_days to 10 (not loan_contingency_waived). If it says "No loan contingency" or "Loan waived", set loan_contingency_waived to true and loan_contingency_days to null. Same logic applies to appraisal and all other contingencies.
IMPORTANT: counter offers frequently change contingency periods in Other Terms — always scan for "contingency", "investigation", "inspection", "waive", "remove" keywords.
If no modification is found for a field, set it to null or false.

OUTPUT:
Return valid JSON only matching this schema:
${JSON.stringify(RPA_PAGE_3_SCHEMA, null, 2)}
`;

export const rpaPage3: PageDefinition = {
  pageNumber: 3,
  systemPrompt: SYSTEM_PROMPT,
  userPrompt: 'Extract page 3 of RPA and return valid JSON matching the schema.',
  model: 'gemini-3.1-flash-lite',
  provider: 'gemini',
};
