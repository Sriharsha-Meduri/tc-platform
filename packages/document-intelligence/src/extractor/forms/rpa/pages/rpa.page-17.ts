import type { PageDefinition } from '../../form-definition';


const RPA_PAGE_17_SCHEMA = {
  page_number: 17,

  property_reference: {
    property_address: '<string|null>',
    date: '<string|null>',
    raw_text: '<string|null>',
  },

  real_estate_brokers_section: {
    A_buyers_brokerage_firm: {
      firm_name: '<string|null>',
      dre_license: '<string|null>',
      agent_1: { name: '<string|null>', dre_license: '<string|null>', date: '<string|null>' },
      agent_2: { name: '<string|null>', dre_license: '<string|null>', date: '<string|null>' },
      address: '<string|null>',
      city: '<string|null>',
      state: '<string|null>',
      zip: '<string|null>',
      email: '<string|null>',
      phone: '<string|null>',
      more_than_one_agent_visual_evidence: '<string|null: Describe the pixels inside the physical box next to the "More than one agent..." text. Look closely for a typed X or DocuSign mark.>',
      more_than_one_agent_from_same_firm_checked: '<boolean>',
      more_than_one_brokerage_firm_checked: '<boolean>',
      attached_deda_checked: '<boolean>',
      raw_text: '<string|null>'
    },
    B_sellers_brokerage_firm: {
      firm_name: '<string|null>',
      dre_license: '<string|null>',
      agent_1: { name: '<string|null>', dre_license: '<string|null>', date: '<string|null>' },
      agent_2: { name: '<string|null>', dre_license: '<string|null>', date: '<string|null>' },
      address: '<string|null>',
      city: '<string|null>',
      state: '<string|null>',
      zip: '<string|null>',
      email: '<string|null>',
      phone: '<string|null>',
      more_than_one_agent_visual_evidence: '<string|null: Describe the pixels inside the physical box next to the "More than one agent..." text. Look closely for a typed X or DocuSign mark.>',
      more_than_one_agent_from_same_firm_checked: '<boolean>',
      more_than_one_brokerage_firm_checked: '<boolean>',
      attached_deda_checked: '<boolean>',
      raw_text: '<string|null>'
    }
  },

  escrow_holder_acknowledgment: {
    deposit_checked: '<boolean>',
    deposit_amount: '<string|null>',
    counter_offer_numbers: '<string|null>',
    counter_offer_and: '<string|null>',
    advised_by: '<string|null>',
    date_of_acceptance: '<string|null>',
    escrow_holder_name: '<string|null>',
    escrow_number: '<string|null>',
    by_name: '<string|null>',
    date: '<string|null>',
    address: '<string|null>',
    phone_fax_email: '<string|null>',
    license_number: '<string|null>',
    department_of_financial_protection_and_innovation_checked: '<boolean>',
    department_of_insurance_checked: '<boolean>',
    department_of_real_estate_checked: '<boolean>',
    raw_text: '<string|null>'
  },

  presentation_of_offer: {
    agent_or_seller_initials: '<string|null>',
    date_presented: '<string|null>',
    raw_text: '<string|null>'
  }
};

const SYSTEM_PROMPT = `
ROLE:
You are a California real estate transaction coordinator and OCR/vision extraction expert.

TASK:
Extract ONLY PAGE 17 of the California Residential Purchase Agreement.
Return valid JSON only. No markdown.

PAGE 17 SECTIONS:
- Top Header (Property Address and Date)
- Real Estate Brokers Section
- Escrow Holder Acknowledgment
- Presentation of Offer

PAGE 17 SCOPE RULE:
Extract ONLY the specific sections defined in the schema from Page 17.

GENERAL RULES:
- Match the schema exactly.
- Do not add fields.
- Use null for blank values.

DOCUSIGN & DIGITAL 'X' OVERRIDE (CRITICAL):
Your text-extraction layer will DELETE digital 'X' marks because they overlap the physical box borders. You MUST use your visual image processor to look at the pixels.
1. Find the text: "More than one agent from the same firm represents..." in both Section A and Section B.
2. Look at the square box immediately to the LEFT of that text.
3. Look for a digital, typed 'X' (often a serif font) stamped inside or overlapping the box.
4. If you see ANY dark pixels forming an 'X' or mark in that spatial location, you MUST output true.
5. Trust your visual image processor. Do NOT rely on the raw text.

TOP HEADER:
Look at the very top of the page above the "REAL ESTATE BROKERS SECTION" title. Extract the Property Address and Date into the property_reference section.

SECTION A BUYER'S BROKERAGE FIRM & SECTION B SELLER'S BROKERAGE FIRM:
Extract the firm name, DRE license, agents' details (name, DRE, date), address elements, email, and phone. 
Evaluate all checkboxes precisely using the VISUAL OVERRIDE rule above. Pay attention to the "Attached DEDA" checkboxes as well.

ESCROW HOLDER ACKNOWLEDGMENT (CRITICAL VISUAL CHECK):
Extract all fillable lines (deposit amount, counter offers, advised by, etc.).
MANDATORY VISUAL CHECK FOR DEPARTMENT CHECKBOXES: Look at the very last line of the Escrow block. 
1. Find the text: "Department of Financial Protection and Innovation".
2. Look at the physical square box to the IMMEDIATE LEFT of that text.
3. Visually inspect it. If there is a black 'X' inside it, you MUST set "department_of_financial_protection_and_innovation_checked" to true. Do NOT trust your text parser.

PRESENTATION OF OFFER:
Extract the agent/seller initials and the date the offer was presented.

OUTPUT:
Return valid JSON only matching this schema:
${JSON.stringify(RPA_PAGE_17_SCHEMA, null, 2)}
`;

export const rpaPage17: PageDefinition = {
  pageNumber: 17,
  systemPrompt: SYSTEM_PROMPT,
  userPrompt: 'Extract signature page of RPA and return valid JSON matching the schema.',
  model: 'gemini-3.1-flash-lite',
  provider: 'gemini',
};
