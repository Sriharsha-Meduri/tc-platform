import type { PageDefinition } from '../../form-definition';
import { initialsZoneSchema, footerInitialsSystemPrompt } from './footer-initials.shared';

const FOOTER_ZONE_LABEL = 'the standard page footer on RPA page 15';
const LD_ZONE_LABEL = 'Section 29 (Liquidated Damages) on RPA page 15';
const ARB_ZONE_LABEL = 'Section 31 (Arbitration of Disputes) on RPA page 15';
const PAGE_LABEL = 'RPA page 15';

const RPA_PAGE_15_SCHEMA = {
  page_number: 15,

  page_validation: {
    is_rpa_page_15:
      '<boolean — true ONLY if the footer identifies the page as "RPA PAGE 15 OF 17">',
    form_revision:
      '<string|null — revision printed in the footer, such as "6/26">',
    property_address: '<string|null>',
    document_date: '<string|null>',
  },

  execution_review: {
    expected_party_counts: {
      buyers:
        '<number|null — use only caller-provided transaction context; do not infer the Buyer count from the printed initials lines>',
      sellers:
        '<number|null — use only caller-provided transaction context; do not infer the Seller count from the printed initials lines>',
    },

    section_29_liquidated_damages: {
      expected_to_be_incorporated:
        '<boolean|null — use only caller-provided transaction context; null when no expectation is supplied>',

      ...initialsZoneSchema(LD_ZONE_LABEL),

      any_required_party_initialed:
        '<boolean|null — true if at least one required Buyer or Seller initialed Section 29; null when required party counts are unknown>',

      all_required_parties_initialed:
        '<boolean|null — true only if every required Buyer and Seller initialed Section 29; null when required party counts are unknown>',

      partial_initialing:
        '<boolean|null — true when at least one but not all required parties initialed Section 29; null when required party counts are unknown>',

      incorporation_status:
        '<"incorporated"|"not_incorporated"|"partial_requires_resolution"|"expected_but_incomplete"|"unknown">',
    },

    section_30_mediation: {
      separate_initials_fields_present: false,
      buyer_initials_required: false,
      seller_initials_required: false,
      missing_initials: false,
      review_status: 'no_separate_initials_required',
    },

    section_31_arbitration_of_disputes: {
      expected_to_be_incorporated:
        '<boolean|null — use only caller-provided transaction context; null when no expectation is supplied>',

      ...initialsZoneSchema(ARB_ZONE_LABEL),

      any_required_party_initialed:
        '<boolean|null — true if at least one required Buyer or Seller initialed Section 31; null when required party counts are unknown>',

      all_required_parties_initialed:
        '<boolean|null — true only if every required Buyer and Seller initialed Section 31; null when required party counts are unknown>',

      partial_initialing:
        '<boolean|null — true when at least one but not all required parties initialed Section 31; null when required party counts are unknown>',

      incorporation_status:
        '<"incorporated"|"not_incorporated"|"partial_requires_resolution"|"expected_but_incomplete"|"unknown">',
    },

    page_footer_initials: initialsZoneSchema(FOOTER_ZONE_LABEL),

    full_signatures: {
      full_signature_fields_present_on_page:
        '<boolean — normally false because RPA page 15 contains initials fields only>',

      buyer_full_signature_required_on_page: false,
      seller_full_signature_required_on_page: false,

      missing_buyer_full_signature: false,
      missing_seller_full_signature: false,

      signature_review_status:
        '<"not_applicable_on_page_15"|"unexpected_signature_field_detected">',

      signature_page_reference:
        '<number — return 16 because the full Buyer and Seller signature blocks appear on logical RPA page 16>',
    },

    blocker_summary: {
      missing_buyer_footer_initials:
        '<boolean|null — true only when expected Buyer count is known and at least one required Buyer footer initials field is blank; otherwise null>',

      missing_seller_footer_initials:
        '<boolean|null — true only when expected Seller count is known and at least one required Seller footer initials field is blank; otherwise null>',

      liquidated_damages_partial_initialing:
        '<boolean|null — true when Section 29 was initialed by at least one but not all required parties; otherwise false or null>',

      liquidated_damages_expected_but_incomplete:
        '<boolean|null — true when caller says Section 29 should be incorporated but not all required parties initialed it; otherwise false or null>',

      arbitration_partial_initialing:
        '<boolean|null — true when Section 31 was initialed by at least one but not all required parties; otherwise false or null>',

      arbitration_expected_but_incomplete:
        '<boolean|null — true when caller says Section 31 should be incorporated but not all required parties initialed it; otherwise false or null>',

      missing_full_signatures: false,

      has_execution_blocker:
        '<boolean|null — true when required footer initials are blank, a special provision is partially initialed, or an expected special provision is incomplete; false when no confirmed blocker exists; null when required party counts are unknown>',

      blocker_messages:
        '<string[] — concise messages for each confirmed execution problem; empty when no confirmed blocker exists>',
    },
  },
};

const SYSTEM_PROMPT = `
${footerInitialsSystemPrompt(PAGE_LABEL)}

THREE ZONES:
Page 15 has three separate initials areas — evaluate each independently and
never copy a mark from one zone into another:
1. Section 29 (Liquidated Damages) — ${LD_ZONE_LABEL}.
2. Section 31 (Arbitration of Disputes) — ${ARB_ZONE_LABEL}.
3. ${FOOTER_ZONE_LABEL}.

SECTION 29 AND 31 INCORPORATION STATUS:
- incorporation_status = "incorporated" when every required Buyer and Seller
  slot has initials_present = true.
- incorporation_status = "partial_requires_resolution" when at least one but
  not all required slots have initials_present = true — create a blocker.
- incorporation_status = "not_incorporated" when no required slot has
  initials_present = true and expected_to_be_incorporated is not true — this
  alone is not a blocker.
- incorporation_status = "expected_but_incomplete" when
  expected_to_be_incorporated is true but a required slot is blank — create
  a blocker.
- incorporation_status = "unknown" when required party counts are unknown.

SECTION 30 MEDIATION:
Section 30 has no separate initials fields. Do not report missing mediation
initials; set section_30_mediation fields exactly as shown in the schema.

FULL SIGNATURES:
Page 15 has initials only — full Buyer and Seller signatures appear on
logical RPA page 16, not here.

SCHEMA:
${JSON.stringify(RPA_PAGE_15_SCHEMA, null, 2)}
`;

export const rpaPage15ExecutionReview: PageDefinition = {
  pageNumber: 15,
  systemPrompt: SYSTEM_PROMPT,
  userPrompt: `
Analyze logical RPA page 15 for:

1. Section 29 Liquidated Damages Buyer and Seller initials.
2. Section 31 Arbitration of Disputes Buyer and Seller initials.
3. Standard Buyer and Seller footer initials.

Use expected Buyer and Seller counts supplied in transaction context when
available. Check visual position first in every zone — electronic PDF text
extraction may list names and initials in a different order than their
visual position.

Section 30 Mediation does not have separate initials fields. Do not report
missing mediation initials.

Do not report missing full signatures because full Buyer and Seller signatures
are not required on RPA page 15.

Return valid JSON matching the schema exactly.
  `.trim(),
  model: 'gemini-3.1-flash-lite',
  provider: 'gemini',
};
