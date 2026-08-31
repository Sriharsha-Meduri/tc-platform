import type { PageDefinition } from '../../form-definition';
import { initialsZoneSchema, footerInitialsSystemPrompt } from './footer-initials.shared';

const ZONE_LABEL = 'the RPA page 11 footer';
const PAGE_LABEL = 'RPA page 11';

const RPA_PAGE_11_SCHEMA = {
  page_number: 11,

  page_validation: {
    is_rpa_page_11:
      '<boolean — true ONLY if the footer identifies the page as "RPA PAGE 11 OF 17">',
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
        '<boolean — normally false because RPA page 11 contains footer initials only>',

      buyer_full_signature_required_on_page: false,
      seller_full_signature_required_on_page: false,

      missing_buyer_full_signature: false,
      missing_seller_full_signature: false,

      signature_review_status:
        '<"not_applicable_on_page_11"|"unexpected_signature_field_detected">',

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

  page_11_footer_initials: initialsZoneSchema(ZONE_LABEL),
};

const SYSTEM_PROMPT = `
${footerInitialsSystemPrompt(PAGE_LABEL)}

SCHEMA:
${JSON.stringify(RPA_PAGE_11_SCHEMA, null, 2)}
`;

export const rpaPage11ExecutionReview: PageDefinition = {
  pageNumber: 11,
  systemPrompt: SYSTEM_PROMPT,
  userPrompt: `
Analyze logical RPA page 11 for missing Buyer and Seller initials in the page footer.

Perform a strict visual pixel-level check on each designated initial slot (Buyer Slot 1, Buyer Slot 2, Seller Slot 1, Seller Slot 2). Look for electronic initial tags (DocuSign, zipLogix, etc.), handwritten ink, or styled text.

Use expected Buyer and Seller counts supplied in transaction context when available. Do not infer party counts from the number of initial lines.

Do not report missing full signatures because full Buyer and Seller signatures are not required on RPA page 11.

Return valid JSON matching the schema exactly.
  `.trim(),
  model: 'gemini-3.1-flash-lite',
  provider: 'gemini',
};
