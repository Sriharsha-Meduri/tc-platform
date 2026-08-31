import type { PageDefinition } from '../../form-definition';
import { initialsZoneSchema, footerInitialsSystemPrompt } from './footer-initials.shared';

const ZONE_LABEL = 'the RPA page 13 footer';
const PAGE_LABEL = 'RPA page 13';

const RPA_PAGE_13_SCHEMA = {
  page_number: 13,

  page_validation: {
    is_rpa_page_13:
      '<boolean — true ONLY if the footer identifies the page as "RPA PAGE 13 OF 17">',
    form_revision:
      '<string|null — revision printed in the footer, such as "6/26">',
    property_address: '<string|null>',
    document_date: '<string|null>',
  },

  execution_review: {
    expected_party_counts: {
      buyers:
        '<number|null — use only caller-provided transaction context; do not infer the Buyer count from the number of printed initials lines>',
      sellers:
        '<number|null — use only caller-provided transaction context; do not infer the Seller count from the number of printed initials lines>',
    },

    full_signatures: {
      full_signature_fields_present_on_page:
        '<boolean — normally false because RPA page 13 contains footer initials only>',

      buyer_full_signature_required_on_page: false,
      seller_full_signature_required_on_page: false,

      missing_buyer_full_signature: false,
      missing_seller_full_signature: false,

      signature_review_status:
        '<"not_applicable_on_page_13"|"unexpected_signature_field_detected">',

      signature_page_reference:
        '<number — return 16 because the full Buyer and Seller signature blocks appear on logical RPA page 16>',
    },

    blocker_summary: {
      missing_buyer_initials:
        '<boolean|null — true only when the expected Buyer count is known and at least one required Buyer initials slot is blank; otherwise null>',

      missing_seller_initials:
        '<boolean|null — true only when the expected Seller count is known and at least one required Seller initials slot is blank; otherwise null>',

      missing_full_signatures: false,

      has_execution_blocker:
        '<boolean|null — true when at least one required Buyer or Seller initials slot is blank; false when all required initials are present; null when expected party counts are unknown>',

      blocker_messages:
        '<string[] — one concise message for each confirmed missing required initials slot; empty when no confirmed blocker exists>',
    },
  },

  page_13_footer_initials: initialsZoneSchema(ZONE_LABEL),
};

const SYSTEM_PROMPT = `
${footerInitialsSystemPrompt(PAGE_LABEL)}

SCHEMA:
${JSON.stringify(RPA_PAGE_13_SCHEMA, null, 2)}
`;

export const rpaPage13ExecutionReview: PageDefinition = {
  pageNumber: 13,
  systemPrompt: SYSTEM_PROMPT,
  userPrompt: `
Analyze logical RPA page 13 for missing Buyer and Seller initials.

Use expected Buyer and Seller counts supplied in transaction context when
available. Review only the designated initials fields in the footer at the
bottom of the page — check visual position first, since electronic PDF text
extraction may list names and initials in a different order than their
visual position.

Do not report missing full signatures because full Buyer and Seller signatures
are not required on RPA page 13.

Return valid JSON matching the schema exactly.
  `.trim(),
  model: 'gemini-3.1-flash-lite',
  provider: 'gemini',
};
