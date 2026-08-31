/**
 * BHIA Validation Schema — C.A.R. Form BHIA (Buyer Homeowners' Insurance Advisory)
 *
 * This file defines the comprehensive validation schema for BHIA forms.
 * Unlike the extraction schema (bhia.standard.v06-24.ts) which extracts raw data,
 * this schema validates the document for completeness and compliance.
 *
 * The LLM returns data matching this schema, which is then processed by
 * bhia-validation.ts to produce blockers and warnings.
 */

// ─── TypeScript types for the LLM validation output ───────────────────────────

export type SignatureType = 'handwritten' | 'electronic' | 'typed_text' | 'blank' | 'unreadable';
export type SlotCompletionStatus = 'complete' | 'missing_signature' | 'missing_date' | 'missing_signature_and_date' | 'unreadable';
export type OverallCompletionStatus = 'complete' | 'missing_signature' | 'missing_date' | 'missing_signature_and_date' | 'unknown';
export type FormIdentityStatus = 'valid' | 'wrong_form' | 'wrong_page' | 'missing_page' | 'unknown';
export type OverallValidationStatus = 'complete' | 'incomplete' | 'manual_review_required' | 'wrong_document';

export interface BuyerAcknowledgementSlot {
  signature_present: boolean;
  signature_text: string | null;
  signature_type: SignatureType;
  signer_matches_expected_buyer: boolean | null;
  date: string | null;
  date_present: boolean;
  date_valid: boolean | null;
  completion_status: SlotCompletionStatus;
}

export interface BhiaValidationOutput {
  form_type: 'BHIA';

  form_validation: {
    is_bhia: boolean;
    form_title: string | null;
    form_revision: string | null;
    logical_page_number: number | null;
    expected_page_count: number;
    correct_page_label: boolean;
    document_complete: boolean;
    form_identity_status: FormIdentityStatus;
  };

  transaction_context: {
    expected_buyers: number | null;
    expected_buyer_names: string[] | null;
    expected_property_address: string | null;
  };

  advisory_content_validation: {
    section_1_importance_of_obtaining_property_insurance_present: boolean;
    section_2_property_insurance_and_purchase_contract_terms_present: boolean;
    section_3_california_property_insurance_market_present: boolean;
    section_4_insurance_conditions_present: boolean;
    section_5_resources_present: boolean;
    section_6_broker_recommendation_present: boolean;
    acknowledgement_text_present: boolean;
    all_required_sections_present: boolean;
  };

  buyer_acknowledgements: {
    buyer_1: BuyerAcknowledgementSlot;
    buyer_2: BuyerAcknowledgementSlot;
    required_signature_count: number | null;
    valid_required_signature_count: number | null;
    missing_required_signature_count: number | null;
    missing_required_date_count: number | null;
    all_required_buyers_signed: boolean | null;
    all_required_signatures_dated: boolean | null;
    completion_status: OverallCompletionStatus;
  };

  non_required_execution_fields: {
    buyer_initials_fields_present: boolean;
    buyer_initials_required: boolean;
    seller_signature_fields_present: boolean;
    seller_signatures_required: boolean;
    seller_initials_fields_present: boolean;
    seller_initials_required: boolean;
    broker_signature_fields_present: boolean;
    broker_signature_required: boolean;
    agent_signature_fields_present: boolean;
    agent_signature_required: boolean;
  };

  validation_summary: {
    has_blocker: boolean | null;
    has_warning: boolean;
    blocker_codes: string[];
    blocker_messages: string[];
    warning_codes: string[];
    warning_messages: string[];
    overall_status: OverallValidationStatus;
  };
}

// ─── JSON Schema for LLM structured output ────────────────────────────────────

export const BHIA_VALIDATION_JSON_SCHEMA = {
  type: 'object',
  required: ['form_type', 'form_validation', 'transaction_context', 'advisory_content_validation', 'buyer_acknowledgements', 'non_required_execution_fields', 'validation_summary'],
  properties: {
    form_type: { type: 'string', enum: ['BHIA'] },
    form_validation: {
      type: 'object',
      required: ['is_bhia', 'form_title', 'form_revision', 'logical_page_number', 'expected_page_count', 'correct_page_label', 'document_complete', 'form_identity_status'],
      properties: {
        is_bhia: { type: 'boolean' },
        form_title: { type: ['string', 'null'] },
        form_revision: { type: ['string', 'null'] },
        logical_page_number: { type: ['number', 'null'] },
        expected_page_count: { type: 'number' },
        correct_page_label: { type: 'boolean' },
        document_complete: { type: 'boolean' },
        form_identity_status: { type: 'string', enum: ['valid', 'wrong_form', 'wrong_page', 'missing_page', 'unknown'] },
      },
    },
    transaction_context: {
      type: 'object',
      required: ['expected_buyers', 'expected_buyer_names', 'expected_property_address'],
      properties: {
        expected_buyers: { type: ['number', 'null'] },
        expected_buyer_names: { type: ['array', 'null'], items: { type: 'string' } },
        expected_property_address: { type: ['string', 'null'] },
      },
    },
    advisory_content_validation: {
      type: 'object',
      required: ['section_1_importance_of_obtaining_property_insurance_present', 'section_2_property_insurance_and_purchase_contract_terms_present', 'section_3_california_property_insurance_market_present', 'section_4_insurance_conditions_present', 'section_5_resources_present', 'section_6_broker_recommendation_present', 'acknowledgement_text_present', 'all_required_sections_present'],
      properties: {
        section_1_importance_of_obtaining_property_insurance_present: { type: 'boolean' },
        section_2_property_insurance_and_purchase_contract_terms_present: { type: 'boolean' },
        section_3_california_property_insurance_market_present: { type: 'boolean' },
        section_4_insurance_conditions_present: { type: 'boolean' },
        section_5_resources_present: { type: 'boolean' },
        section_6_broker_recommendation_present: { type: 'boolean' },
        acknowledgement_text_present: { type: 'boolean' },
        all_required_sections_present: { type: 'boolean' },
      },
    },
    buyer_acknowledgements: {
      type: 'object',
      required: ['buyer_1', 'buyer_2', 'required_signature_count', 'valid_required_signature_count', 'missing_required_signature_count', 'missing_required_date_count', 'all_required_buyers_signed', 'all_required_signatures_dated', 'completion_status'],
      properties: {
        buyer_1: {
          type: 'object',
          required: ['signature_present', 'signature_text', 'signature_type', 'signer_matches_expected_buyer', 'date', 'date_present', 'date_valid', 'completion_status'],
          properties: {
            signature_present: { type: 'boolean' },
            signature_text: { type: ['string', 'null'] },
            signature_type: { type: 'string', enum: ['handwritten', 'electronic', 'typed_text', 'blank', 'unreadable'] },
            signer_matches_expected_buyer: { type: ['boolean', 'null'] },
            date: { type: ['string', 'null'] },
            date_present: { type: 'boolean' },
            date_valid: { type: ['boolean', 'null'] },
            completion_status: { type: 'string', enum: ['complete', 'missing_signature', 'missing_date', 'missing_signature_and_date', 'unreadable'] },
          },
        },
        buyer_2: {
          type: 'object',
          required: ['signature_present', 'signature_text', 'signature_type', 'signer_matches_expected_buyer', 'date', 'date_present', 'date_valid', 'completion_status'],
          properties: {
            signature_present: { type: 'boolean' },
            signature_text: { type: ['string', 'null'] },
            signature_type: { type: 'string', enum: ['handwritten', 'electronic', 'typed_text', 'blank', 'unreadable'] },
            signer_matches_expected_buyer: { type: ['boolean', 'null'] },
            date: { type: ['string', 'null'] },
            date_present: { type: 'boolean' },
            date_valid: { type: ['boolean', 'null'] },
            completion_status: { type: 'string', enum: ['complete', 'missing_signature', 'missing_date', 'missing_signature_and_date', 'unreadable'] },
          },
        },
        required_signature_count: { type: ['number', 'null'] },
        valid_required_signature_count: { type: ['number', 'null'] },
        missing_required_signature_count: { type: ['number', 'null'] },
        missing_required_date_count: { type: ['number', 'null'] },
        all_required_buyers_signed: { type: ['boolean', 'null'] },
        all_required_signatures_dated: { type: ['boolean', 'null'] },
        completion_status: { type: 'string', enum: ['complete', 'missing_signature', 'missing_date', 'missing_signature_and_date', 'unknown'] },
      },
    },
    non_required_execution_fields: {
      type: 'object',
      required: ['buyer_initials_fields_present', 'buyer_initials_required', 'seller_signature_fields_present', 'seller_signatures_required', 'seller_initials_fields_present', 'seller_initials_required', 'broker_signature_fields_present', 'broker_signature_required', 'agent_signature_fields_present', 'agent_signature_required'],
      properties: {
        buyer_initials_fields_present: { type: 'boolean' },
        buyer_initials_required: { type: 'boolean' },
        seller_signature_fields_present: { type: 'boolean' },
        seller_signatures_required: { type: 'boolean' },
        seller_initials_fields_present: { type: 'boolean' },
        seller_initials_required: { type: 'boolean' },
        broker_signature_fields_present: { type: 'boolean' },
        broker_signature_required: { type: 'boolean' },
        agent_signature_fields_present: { type: 'boolean' },
        agent_signature_required: { type: 'boolean' },
      },
    },
    validation_summary: {
      type: 'object',
      required: ['has_blocker', 'has_warning', 'blocker_codes', 'blocker_messages', 'warning_codes', 'warning_messages', 'overall_status'],
      properties: {
        has_blocker: { type: ['boolean', 'null'] },
        has_warning: { type: 'boolean' },
        blocker_codes: { type: 'array', items: { type: 'string' } },
        blocker_messages: { type: 'array', items: { type: 'string' } },
        warning_codes: { type: 'array', items: { type: 'string' } },
        warning_messages: { type: 'array', items: { type: 'string' } },
        overall_status: { type: 'string', enum: ['complete', 'incomplete', 'manual_review_required', 'wrong_document'] },
      },
    },
  },
};

// ─── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `
ROLE:
You are a California real estate transaction coordinator and an OCR/vision
document-compliance specialist.

TASK:
Validate ONLY the Buyer Homeowners' Insurance Advisory, C.A.R. Form BHIA.

Analyze the complete logical BHIA form and determine whether all required Buyer
acknowledgment signatures and dates are present.

Return valid JSON only. Do not return markdown, explanations, commentary, or
fields not included in the schema.

FORM IDENTIFICATION:
The correct document is:

- "BUYER HOMEOWNERS' INSURANCE ADVISORY"
- C.A.R. Form BHIA
- One logical page
- The form footer normally identifies:
  "BHIA 6/24 (PAGE 1 OF 1)"
  and
  "BUYER HOMEOWNERS' INSURANCE ADVISORY (BHIA PAGE 1 OF 1)"

The revision may change in future versions.

Use the form title, form abbreviation, revision, and printed logical page label
to identify the page.

Do not rely on the absolute PDF page number because BHIA may be included inside
a larger disclosure or offer packet.

If the page is not BHIA, set form_validation.is_bhia to false and
form_identity_status to "wrong_form".

BHIA PAGE STRUCTURE:
BHIA is a one-page advisory containing:

1. IMPORTANCE OF OBTAINING PROPERTY INSURANCE
2. PROPERTY INSURANCE AND PURCHASE CONTRACT TERMS
3. CALIFORNIA'S PROPERTY INSURANCE MARKET
4. INSURANCE CONDITIONS
5. RESOURCES
6. BROKER RECOMMENDATION

The execution language at the bottom states:

"By signing below, Buyer acknowledges that Buyer has read, understands, and
has received a copy of this Buyer Homeowners' Insurance Advisory."

Below that acknowledgment are:

- First Buyer signature line.
- First Buyer Date field.
- Second Buyer signature line.
- Second Buyer Date field.

REQUIRED EXECUTION FIELDS:
For every expected Buyer, require:

- A Buyer signature.
- A date associated with that signature.

Use expected Buyer count supplied in transaction context.

Examples:

Expected Buyers = 1:
- Buyer slot 1 signature and date are required.
- Buyer slot 2 may remain blank.

Expected Buyers = 2:
- Buyer slots 1 and 2 must each contain a signature and date.

Do not assume two Buyers exist merely because the form displays two Buyer
signature lines.

Do not infer Buyer count from:

- The number of printed signature lines.
- The number of visible signatures.
- Names found in unrelated document metadata.
- DocuSign or Authentisign recipient counts.
- Broker or agent information in the footer.

SIGNATURE DETECTION:
Count a Buyer signature as present when a deliberate execution mark appears on
or directly above the designated Buyer signature line.

Valid signatures include:

- Handwritten signatures.
- Drawn signatures.
- Electronic signatures.
- DocuSign signatures.
- Authentisign signatures.
- Typed-looking signatures clearly contained inside a designated electronic
  signature field.
- Signatures that slightly overlap the printed line because of electronic field
  placement.

Do not count:

- A blank signature line.
- A blank electronic signature box.
- A printed Buyer name outside a signature field.
- Broker or agent names in the footer.
- A DocuSign Envelope ID.
- An Authentisign ID.
- A DocuSign completion checkmark outside the signature field.
- An X belonging to a checkbox.
- Printed words such as "Buyer", "Date", or "By signing below".
- Random scan marks, page borders, underlines, or compression artifacts.

UNREADABLE SIGNATURE RULE:
When a deliberate signature mark is clearly present but the signer name cannot
be read:

- signature_present = true.
- signature_text = null.
- signature_type = "unreadable".
- Do not create a missing-signature blocker solely because the signature is
  unreadable.
- Create a manual-review warning if signer identity cannot be matched to an
  expected Buyer.

DATE DETECTION:
A required Buyer signature must have a corresponding date.

Count a date as present when:

- A handwritten date appears in the designated Date field.
- An electronic date appears next to the corresponding Buyer signature.
- A DocuSign or Authentisign date is clearly associated with that Buyer
  signature line.

Do not use:

- Dates printed in the advisory text.
- The form revision date.
- Dates belonging to another document.
- Envelope creation or completion dates appearing outside the signature field.
- Footer production dates.
- Broker or agent dates from another form.

SIGNATURE AND DATE PAIRING:
Pair each signature with the Date field on the same horizontal Buyer line.

- Buyer 1 signature must be paired with Buyer 1 Date.
- Buyer 2 signature must be paired with Buyer 2 Date.
- Do not use Buyer 1's date to complete Buyer 2.
- Do not use a date elsewhere on the page to complete a signature line.

A signature without a date is incomplete.

A date without a signature is also incomplete.

BUYER NAME MATCHING:
When expected Buyer names are supplied:

- Compare the readable signature or electronic signer name to the expected
  Buyer names.
- Ignore capitalization, punctuation, middle initials, minor spacing
  differences, and common OCR errors.
- Do not require a handwritten signature to be fully legible.
- When the signature is present but identity cannot be determined, return null
  for signer_matches_expected_buyer and create a manual-review warning.
- A clearly different signer name creates a blocker.

FORM CONTENT VALIDATION:
Confirm that Sections 1 through 6 and the Buyer acknowledgment are present.

Create a document-level blocker if:

- The page is not BHIA.
- The page label is not BHIA page 1 of 1.
- A material portion of the page is missing or cropped.
- The Buyer acknowledgment and signature area is missing.
- One or more advisory sections are absent because the page is incomplete.

Do not require OCR extraction of every sentence.

NON-REQUIRED FIELDS — CRITICAL:
BHIA does not contain or require:

- Buyer initials.
- Seller signatures.
- Seller initials.
- Broker signatures.
- Agent signatures.
- Seller acknowledgment.
- Property address in the body of the form.

Do not create blockers for any of those fields.

Footer-generated broker, agent, phone, fax, transaction, or property text may
appear because the form was produced through zipForm or another transaction
platform.

Treat such footer information as metadata only.

Do not require it for BHIA completion.

MULTIPLE BUYER RULE:
Use expected Buyer count from transaction context.

If expected Buyer count is unavailable:

- Evaluate both visible Buyer signature lines.
- Report which signatures and dates are visually present.
- Set required-count-dependent fields to null or "unknown".
- Do not create a confirmed missing-Buyer blocker solely because an unused
  Buyer line is blank.
- Set has_blocker to null unless there is a document-level blocker.

MISSING SIGNATURE CALCULATION:
When expected Buyer count is available:

1. The first N Buyer slots are required.
2. Review each required slot independently.
3. Count required slots containing valid signatures.
4. Count required signatures missing dates.
5. Calculate:

   missing_required_signature_count =
   required_signature_count - valid_required_signature_count

6. Never return a value below zero.

COMPLETION STATUS:
For each required Buyer slot:

- "complete":
  Signature and corresponding date are present.

- "missing_signature":
  Signature is absent but date may be present.

- "missing_date":
  Signature is present but date is absent.

- "missing_signature_and_date":
  Both signature and date are absent.

- "unreadable":
  A deliberate signature or date mark exists but requires manual review.

Overall Buyer completion status:

- "complete":
  All required Buyers signed and dated the advisory.

- "missing_signature":
  At least one required Buyer signature is absent and all present signatures
  have dates.

- "missing_date":
  All required Buyer signatures are present but at least one required date is
  absent.

- "missing_signature_and_date":
  At least one required signature is missing and at least one required date is
  missing.

- "unknown":
  Expected Buyer count is unavailable.

BLOCKER CODES:
Use these codes where applicable:

- BHIA-WRONG-FORM
- BHIA-WRONG-PAGE
- BHIA-PAGE-MISSING
- BHIA-CONTENT-INCOMPLETE
- BHIA-ACKNOWLEDGMENT-MISSING
- BHIA-BUYER-1-SIGNATURE-MISSING
- BHIA-BUYER-1-DATE-MISSING
- BHIA-BUYER-2-SIGNATURE-MISSING
- BHIA-BUYER-2-DATE-MISSING
- BHIA-BUYER-SIGNER-MISMATCH

WARNING CODES:
Use these warning codes where applicable:

- BHIA-BUYER-COUNT-UNKNOWN
- BHIA-SIGNATURE-UNREADABLE
- BHIA-DATE-UNREADABLE
- BHIA-SIGNER-IDENTITY-UNKNOWN
- BHIA-MANUAL-REVIEW

VALID BLOCKER MESSAGE EXAMPLES:
- "Buyer 1 signature missing on BHIA"
- "Buyer 1 signature date missing on BHIA"
- "Buyer 2 signature missing on BHIA"
- "Buyer 2 signature date missing on BHIA"
- "BHIA Buyer acknowledgment section is missing"
- "Uploaded page is not C.A.R. Form BHIA"
- "BHIA signer does not match the expected Buyer"

DO NOT CREATE BLOCKERS FOR:
- A blank second Buyer signature line when only one Buyer is expected.
- Missing Seller signatures.
- Missing Seller initials.
- Missing Buyer initials.
- Missing broker or agent signatures.
- Missing property address.
- Missing broker, agent, phone, or fax footer information.
- An unreadable signature when a deliberate signature is clearly present.
- A form revision that differs from 6/24 when the page is otherwise clearly a
  valid newer or older BHIA revision.

GENERAL RULES:
- Validate BHIA only.
- Ignore FRR-PA, BIA, FHDA, WFA, RPA, and all other forms in the packet.
- Match the schema exactly.
- Do not add, remove, rename, or rearrange fields.
- Use null when information cannot be determined reliably.
- Do not guess Buyer names, Buyer count, signatures, or dates.
- Return valid JSON only.

SCHEMA:
${JSON.stringify(BHIA_VALIDATION_JSON_SCHEMA, null, 2)}
`;

// ─── Page definition for per-page extraction ───────────────────────────────────

import type { PageDefinition } from '../form-definition';

export const bhiaValidation: PageDefinition = {
  pageNumber: 1,

  systemPrompt: SYSTEM_PROMPT,

  userPrompt: `
Validate only the one-page C.A.R. Buyer Homeowners' Insurance Advisory,
Form BHIA.

Check:

1. Correct BHIA form identity and logical page 1 of 1.
2. Presence of Sections 1 through 6.
3. Presence of the Buyer acknowledgment and execution area.
4. Required Buyer signatures based on the expected Buyer count.
5. A corresponding date for each required Buyer signature.
6. Signer identity against expected Buyer names when transaction context is
   available.

Do not require Buyer initials, Seller signatures, Seller initials, broker
signatures, agent signatures, or a property address. Those are not execution
requirements of BHIA.

Return valid JSON matching the schema exactly.
  `.trim(),

  model: 'gemini-3.1-flash-lite',
  provider: 'gemini',
};
