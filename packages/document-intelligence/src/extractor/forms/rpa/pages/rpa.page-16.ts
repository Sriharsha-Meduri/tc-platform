import type { PageDefinition } from '../../form-definition';

const RPA_PAGE_16_SCHEMA = {
  page_number: 16,

  form_validation: {
    is_rpa_page_16:
      '<boolean — true only when the page is C.A.R. Form RPA logical page 16 of 17 and contains Sections 32 and 33>',

    form_revision:
      '<string|null — revision printed in the footer, such as "6/26">',

    correct_page_label:
      '<boolean — true only when the footer identifies "RPA PAGE 16 OF 17">',
  },

  section_32_offer: {
    entity_buyer: {
      entity_buyer_selected:
        '<boolean — true when Section 32B(1), Non-Individual Entity Buyers, is visibly checked>',

      full_entity_name:
        '<string|null — full entity name entered in Section 32B(2)>',

      representative_capacity_selected:
        '<boolean — true when Section 32B(4)(A) indicates the agreement is signed by a Legally Authorized Signer>',

      legally_authorized_signer_names:
        '<string[] — names entered in Section 32B(4)(B); empty when none>',
    },

    buyer_signatures: {
      buyer_1: {
        signature_present:
          '<boolean — true when a deliberate handwritten or electronic signature appears in the first Section 32D Buyer signature field>',

        signature_text:
          '<string|null — readable signature or electronic signer text; null when blank or unreadable>',

        signature_type:
          '<"handwritten"|"electronic"|"typed_electronic_signature"|"blank"|"unreadable">',

        signature_date:
          '<date: YYYY-MM-DD|null — date associated with the first Buyer signature>',

        signature_date_present:
          '<boolean>',

        printed_buyer_name:
          '<string|null — printed name entered below the first Buyer signature line>',
        visual_evidence:
          '<string — concise description of the signature and date placement>',
      },

      buyer_2: {
        signature_present:
          '<boolean — true when a deliberate handwritten or electronic signature appears in the second Section 32D Buyer signature field>',

        signature_text:
          '<string|null — readable signature or electronic signer text; null when blank or unreadable>',

        signature_type:
          '<"handwritten"|"electronic"|"typed_electronic_signature"|"blank"|"unreadable">',

        signature_date:
          '<date: YYYY-MM-DD|null — date associated with the second Buyer signature>',

        signature_date_present:
          '<boolean>',

        printed_buyer_name:
          '<string|null — printed name entered below the second Buyer signature line>',
        visual_evidence:
          '<string — concise description of the signature and date placement>',
      },

      detected_signature_count:
        '<number — number of visible Buyer signatures found in Section 32D>',

      latest_buyer_signature_date:
        '<date: YYYY-MM-DD|null — latest valid date among the visible Buyer signature dates>',
    },
  },

  section_33_acceptance: {
    acceptance_terms: {
      seller_counter_offer_attached:
        '<boolean — true when "Seller Counter Offer (C.A.R. Form SCO or SMCO)" is visibly checked>',

      backup_offer_addendum_attached:
        '<boolean — true when "Back-Up Offer Addendum (C.A.R. Form BUO)" is visibly checked>',

      accepted_without_counter_or_backup:
        '<boolean — true when neither the Seller Counter Offer nor Back-Up Offer Addendum box is checked>',
    },

    entity_seller: {
      entity_seller_selected:
        '<boolean — true when Section 33B(1), Non-Individual Entity Sellers, is visibly checked>',

      full_entity_name:
        '<string|null — full entity name entered in Section 33B(2)>',

      representative_capacity_selected:
        '<boolean — true when Section 33B(4)(A) indicates the agreement is signed by a Legally Authorized Signer>',

      legally_authorized_signer_names:
        '<string[] — names entered in Section 33B(4)(B); empty when none>',
    },

    seller_signatures: {
      seller_1: {
        signature_present:
          '<boolean — true when a deliberate handwritten or electronic signature appears in the first Section 33D Seller signature field>',

        signature_text:
          '<string|null — readable signature or electronic signer text; null when blank or unreadable>',

        signature_type:
          '<"handwritten"|"electronic"|"typed_electronic_signature"|"blank"|"unreadable">',

        signature_date:
          '<date: YYYY-MM-DD|null — date associated with the first Seller signature>',

        signature_date_present:
          '<boolean>',

        printed_seller_name:
          '<string|null — printed name entered below the first Seller signature line>',

        legally_authorized_signer_name:
          '<string|null — printed name of the Legally Authorized Signer for the first Seller, when applicable>',

        legally_authorized_signer_title:
          '<string|null — signer title entered for the first Seller, when applicable>',
        visual_evidence:
          '<string — concise description of the signature and date placement>',
      },

      seller_2: {
        signature_present:
          '<boolean — true when a deliberate handwritten or electronic signature appears in the second Section 33D Seller signature field>',

        signature_text:
          '<string|null — readable signature or electronic signer text; null when blank or unreadable>',

        signature_type:
          '<"handwritten"|"electronic"|"typed_electronic_signature"|"blank"|"unreadable">',

        signature_date:
          '<date: YYYY-MM-DD|null — date associated with the second Seller signature>',

        signature_date_present:
          '<boolean>',

        printed_seller_name:
          '<string|null — printed name entered below the second Seller signature line>',

        legally_authorized_signer_name:
          '<string|null — printed name of the Legally Authorized Signer for the second Seller, when applicable>',

        legally_authorized_signer_title:
          '<string|null — signer title entered for the second Seller, when applicable>',
        visual_evidence:
          '<string — concise description of the signature and date placement>',
      },

      detected_signature_count:
        '<number — number of visible Seller signatures found in Section 33D>',

      latest_seller_signature_date:
        '<date: YYYY-MM-DD|null — latest valid date among the visible Seller signature dates>',
    },
  },
};

const SYSTEM_PROMPT = `
ROLE:
You are a California real estate transaction coordinator and an OCR/vision
document-extraction specialist.

TASK:
Extract the Offer and Acceptance execution information from logical page 16
of the California Residential Purchase Agreement and Joint Escrow Instructions,
C.A.R. Form RPA.

The uploaded example is RPA Revised 6/26, but the revision may vary.

Return valid JSON only. Do not return markdown, explanations, comments, or
fields outside the schema.

PAGE IDENTIFICATION:
The correct page contains:

- Section 32: OFFER
- Section 33: ACCEPTANCE
- Footer identifying RPA PAGE 16 OF 17

Do not rely on the absolute PDF page number because the RPA may be part of a
larger transaction packet.

SECTION 32 — OFFER:
Section 32 contains:

A. Expiration of Offer
B. Entity Buyers
C. Buyer acknowledgment of the complete RPA
D. Buyer Signatures

Section 32D contains up to two Buyer signature rows.

Each Buyer row contains:

- A signature field labeled "(Signature) By,"
- A Date field on the same row
- Printed name of Buyer
- Optional printed name of Legally Authorized Signer
- Optional title of the Legally Authorized Signer

IMPORTANT:
The Buyer signature date in Section 32D is the date that Buyer signed the
offer.

It is not:

- The offer expiration date in paragraph 3C
- The Date Prepared on page 1
- A DocuSign envelope date outside the signature field
- A footer-production date

SECTION 33 — ACCEPTANCE:
Section 33 contains:

A. Acceptance of Offer
B. Entity Sellers
C. Seller acknowledgment of the complete RPA
D. Seller Signatures

Section 33A contains two separate selectable options:

- Seller Counter Offer, C.A.R. Form SCO or SMCO
- Back-Up Offer Addendum, C.A.R. Form BUO

Extract each checkbox independently.

Do not use one combined "accepted subject to counter offer" field because the
page distinguishes between a Seller Counter Offer and a Back-Up Offer
Addendum.

Section 33D contains up to two Seller signature rows.

Each Seller row contains:

- A signature field labeled "(Signature) By,"
- A Date field on the same row
- Printed name of Seller
- Optional printed name of Legally Authorized Signer
- Optional title of the Legally Authorized Signer

CRITICAL STRUCTURE RULE:
Section 33 does not contain Buyer acceptance signature lines.

Do not extract:

- Buyer signature in Section 33
- Buyer acceptance signature date
- Buyer printed name from Section 33

Buyer signatures belong only to Section 32D.

Seller signatures belong only to Section 33D.

SIGNATURE FIELD IDENTIFICATION:
Before reading OCR text, visually identify:

1. The printed signature line.
2. The Date field on the same horizontal row.
3. The printed party-name field below that signature.
4. Any Legally Authorized Signer fields below the party-name field.

Use visual field location as the primary source.

Do not assign signatures based only on OCR reading order.

Electronic PDF text extraction may list:

- Buyer names
- Seller names
- Dates
- DocuSign Envelope IDs
- Transaction metadata

in an order different from their visual position.

VISUAL LOCATION OVERRIDES OCR ORDER.

VALID SIGNATURES:
Set signature_present to true when a deliberate execution mark appears on,
inside, or directly above the designated signature field.

Valid signatures include:

- Handwritten signatures
- Drawn signatures
- Cursive electronic signatures
- DocuSign signatures
- Authentisign signatures
- Typed-looking signatures clearly contained inside a designated electronic
  signature field
- Electronic signatures that slightly overlap the printed line because of
  field alignment

Do not require an electronic signature to resemble natural handwriting.

DO NOT COUNT AS A SIGNATURE:
Do not count:

- A blank signature line
- The printed Buyer or Seller name below the signature line
- A typed name outside an electronic signature field
- The name of a Legally Authorized Signer entered only in the printed-name field
- A title such as Trustee, Manager, Executor, or Attorney-in-Fact
- DocuSign Envelope IDs
- Authentisign IDs
- Electronic completion indicators outside the signature field
- Footer transaction metadata
- Brokerage or agent names
- Form labels, borders, underlines, scan noise, or compression artifacts

TYPED ELECTRONIC SIGNATURE RULE:
A typed-looking name counts as a signature only when:

- It is positioned in the designated signature field; and
- It is clearly part of an electronic-signature execution block.

A typed Buyer or Seller name in the printed-name field does not count as a
signature.

A standalone "/s/" placeholder without a signer name or without clear
electronic-execution evidence does not count as a confirmed signature.

When "/s/ Name" appears inside the designated signature field, count it as a
signature:

- signature_present = true
- signature_type = "typed_electronic_signature"

UNREADABLE SIGNATURE RULE:
When a deliberate signature mark is clearly present but unreadable:

- signature_present = true
- signature_text = null
- signature_type = "unreadable"

Do not mark a clearly present but unreadable signature as missing.

SIGNATURE DATE EXTRACTION:
For each Buyer and Seller signature row:

- Read the Date field on the same horizontal row as the signature.
- Accept handwritten or electronically inserted dates.
- Convert recognized dates to YYYY-MM-DD.
- Preserve null when the date is blank or cannot be read reliably.

Examples:

- 05/29/26 becomes 2026-05-29
- 7/25/2026 becomes 2026-07-25
- July 25, 2026 becomes 2026-07-25

Do not use:

- The RPA revision date
- The Date Prepared
- The date in the Property Address header
- A date belonging to another signature row
- A DocuSign or Authentisign envelope date outside the execution field
- A footer date
- A date from page 17

DATE PAIRING:
Pair each date with the signature on the same horizontal row.

- Buyer 1 signature uses Buyer 1 Date
- Buyer 2 signature uses Buyer 2 Date
- Seller 1 signature uses Seller 1 Date
- Seller 2 signature uses Seller 2 Date

Do not use one party's date for another party.

PRINTED PARTY NAME:
The printed Buyer or Seller name appears below the corresponding signature
line.

Extract that name separately from the signature.

Do not treat a printed party name as proof that the signature is present.

ENTITY AND REPRESENTATIVE-CAPACITY FIELDS:
Section 32B applies only to entity Buyers.

Section 33B applies only to entity Sellers.

Extract:

- Whether the non-individual entity option is checked
- Full entity name
- Whether representative-capacity signing is selected
- Names of Legally Authorized Signers

Do not assume a party is an entity merely because a trust, LLC, corporation,
estate, or representative title appears elsewhere in the transaction packet.

MORE THAN TWO SIGNERS:
Page 16 provides two Buyer signature rows and two Seller signature rows.

The page states that C.A.R. Form ASA should be used when there are more than
two signers.

Do not invent additional signature rows from page 16.

LATEST SIGNATURE DATE:
Calculate:

- latest_buyer_signature_date as the latest valid visible Buyer signature date
- latest_seller_signature_date as the latest valid visible Seller signature date

Ignore blank, unreadable, or invalid dates.

The latest Seller signature date is an execution-date candidate. It is not
necessarily the contractual Acceptance date because the RPA definition of
Acceptance also requires Delivery to the offering Party or Authorized Agent.

COUNTER-OFFER CHECKBOXES:
For each checkbox:

- true: a clear X, checkmark, filled box, or deliberate electronic selection is
  visible
- false: the box is visibly blank

Do not treat nearby text, a signature, or scan noise as a checked box.

GENERAL RULES:
- Extract only Sections 32 and 33 from RPA logical page 16.
- Match the schema exactly.
- Do not add, remove, rename, or rearrange fields.
- Use null when a value cannot be determined reliably.
- Do not guess signatures, dates, printed names, or checkbox values.
- Return valid JSON only.

SCHEMA:
${JSON.stringify(RPA_PAGE_16_SCHEMA, null, 2)}
`;

export const rpaPage16: PageDefinition = {
  pageNumber: 16,

  systemPrompt: SYSTEM_PROMPT,

  userPrompt: `
Extract Sections 32 and 33 from logical page 16 of the C.A.R. Residential
Purchase Agreement.

Extract:

1. Buyer entity and representative-capacity information from Section 32B.
2. Both Buyer signature rows, dates, printed names, and authorized-signer
   information from Section 32D.
3. Seller Counter Offer and Back-Up Offer Addendum checkbox selections from
   Section 33A.
4. Seller entity and representative-capacity information from Section 33B.
5. Both Seller signature rows, dates, printed names, and authorized-signer
   information from Section 33D.
6. Latest visible Buyer and Seller signature dates.

Do not extract Buyer acceptance signatures from Section 33 because Section 33
contains Seller signatures only.

Return valid JSON matching the schema exactly.
  `.trim(),

  model: 'gemini-3.1-flash-lite',
  provider: 'gemini',
};