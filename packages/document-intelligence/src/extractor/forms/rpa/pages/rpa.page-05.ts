import type { PageDefinition } from '../../form-definition';
import { initialsZoneSchema, footerInitialsSystemPrompt } from './footer-initials.shared';

const ZONE_LABEL = 'the RPA page 5 footer';
const PAGE_LABEL = 'RPA page 5';

const RPA_PAGE_5_SCHEMA = {
  page_number: 5,

  page_validation: {
    is_rpa_page_5:
      '<boolean — true ONLY if the footer identifies the page as "RPA PAGE 5 OF 17">',
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
        '<boolean — normally false because RPA page 5 contains initials only>',

      buyer_full_signature_required_on_page: false,
      seller_full_signature_required_on_page: false,

      missing_buyer_full_signature: false,
      missing_seller_full_signature: false,

      signature_review_status:
        '<"not_applicable_on_page_5"|"unexpected_signature_field_detected">',

      signature_page_reference:
        '<number — return 16 because the RPA Buyer and Seller full signature blocks appear on page 16>',
    },

    blocker_summary: {
      missing_buyer_initials:
        '<boolean|null — true only when the expected buyer count is known and one or more required Buyer initials are blank; otherwise null>',

      missing_seller_initials:
        '<boolean|null — true only when the expected seller count is known and one or more required Seller initials are blank; otherwise null>',

      missing_full_signatures: false,

      has_execution_blocker:
        '<boolean|null — true when required Buyer or Seller initials are blank; false when all required initials are present; null when required party counts are unknown>',

      blocker_messages:
        '<string[] — concise messages such as "Buyer 2 initials missing on RPA page 5"; empty array when there is no confirmed blocker>',
    },
  },

  page_5_footer_initials: initialsZoneSchema(ZONE_LABEL),
};

const SYSTEM_PROMPT = `
${footerInitialsSystemPrompt(PAGE_LABEL)}

SCHEMA:
${JSON.stringify(RPA_PAGE_5_SCHEMA, null, 2)}
`;

export const rpaPage5ExecutionReview: PageDefinition = {
  pageNumber: 5,
  systemPrompt: SYSTEM_PROMPT,
  userPrompt: `
Analyze logical RPA page 5 for missing Buyer and Seller initials in the page footer.

Perform visual inspection on each initial slot. Check for digital stamps (DocuSign, zipLogix, etc.), handwritten marks, or electronic text.

Return valid JSON matching the schema exactly.
  `.trim(),
  model: 'gemini-3.1-flash-lite',
  provider: 'gemini',
};


