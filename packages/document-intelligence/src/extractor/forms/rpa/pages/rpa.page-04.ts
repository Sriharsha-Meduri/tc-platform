import type { PageDefinition } from '../../form-definition';
import { initialsZoneSchema, footerInitialsSystemPrompt } from './footer-initials.shared';

const ZONE_LABEL = 'the RPA page 4 footer';
const PAGE_LABEL = 'RPA page 4';

const RPA_PAGE_4_SCHEMA = {
  page_number: 4,

  page_validation: {
    is_rpa_page_4:
      '<boolean — true ONLY if the footer identifies the page as "RPA PAGE 4 OF 17">',
    form_revision:
      '<string|null — revision printed in the footer, such as "6/26">',
    property_address: '<string|null>',
    document_date: '<string|null>',
  },

  execution_review: {
    expected_party_counts: {
      buyers:
        '<number|null — use only caller-provided transaction context; do not infer the buyer count from the number of printed initial lines>',
      sellers:
        '<number|null — use only caller-provided transaction context; do not infer the seller count from the number of printed initial lines>',
    },

    full_signatures: {
      full_signature_fields_present_on_page:
        '<boolean — normally false because RPA page 4 contains initials only>',

      buyer_full_signature_required_on_page: false,
      seller_full_signature_required_on_page: false,

      missing_buyer_full_signature: false,
      missing_seller_full_signature: false,

      signature_review_status:
        '<"not_applicable_on_page_4"|"unexpected_signature_field_detected">',

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
        '<string[] — one concise message for each confirmed missing required initials slot; empty array when there is no confirmed blocker>',
    },
  },

  page_4_footer_initials: initialsZoneSchema(ZONE_LABEL),
};

const SYSTEM_PROMPT = `
${footerInitialsSystemPrompt(PAGE_LABEL)}

SCHEMA:
${JSON.stringify(RPA_PAGE_4_SCHEMA, null, 2)}
`;

export const rpaPage4ExecutionReview: PageDefinition = {
  pageNumber: 4,
  systemPrompt: SYSTEM_PROMPT,
  userPrompt: `
Analyze logical RPA page 4 footer for missing Buyer and Seller initials.

Use the expected Buyer and Seller counts supplied in transaction context when
available. Review only the designated initials fields in the footer at the
bottom of the page — check visual position first, since electronic PDF text
extraction may list names and initials in a different order than their
visual position.

Do not report missing full signatures because full Buyer and Seller signatures
are not required on RPA page 4.

Return valid JSON matching the schema exactly.
  `.trim(),

  model: 'gemini-3.1-flash-lite',
  provider: 'gemini',
};
