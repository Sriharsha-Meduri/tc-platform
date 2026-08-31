/**
 * WFA Validation Schema — C.A.R. Form WFA (Wire Fraud and Electronic Funds Transfer Advisory)
 *
 * This file defines the comprehensive validation schema for WFA forms.
 * Unlike the extraction schema (wfa.standard.v06-25.ts) which extracts raw data,
 * this schema validates the document for completeness and compliance.
 *
 * The LLM returns data matching this schema, which is then processed by
 * wfa-validation.ts to produce blockers and warnings.
 */

import type { PageDefinition } from '../form-definition';

// ─── TypeScript types for the LLM validation output ───────────────────────────

export type SignatureType = 'handwritten' | 'electronic' | 'typed_text' | 'blank' | 'unreadable';
export type SlotCompletionStatus = 'complete' | 'missing_signature' | 'missing_date' | 'missing_signature_and_date' | 'unreadable';
export type OverallCompletionStatus = 'complete' | 'missing_signature' | 'missing_date' | 'missing_signature_and_date' | 'unknown';
export type FormIdentityStatus = 'valid' | 'wrong_form' | 'wrong_page' | 'missing_page' | 'unknown';
export type OverallValidationStatus = 'complete' | 'incomplete' | 'manual_review_required' | 'wrong_document';
export type TransactionType = 'purchase' | 'rental' | 'other' | 'unknown';

export interface SignatureSlot {
  signature_present: boolean;
  signature_text: string | null;
  signature_type: SignatureType;
  signer_matches_expected_party: boolean | null;
  date: string | null;
  date_present: boolean;
  date_valid: boolean | null;
  completion_status: SlotCompletionStatus;
}

export interface PartyAcknowledgements {
  slot_1: SignatureSlot;
  slot_2: SignatureSlot;
  required_signature_count: number | null;
  valid_required_signature_count: number | null;
  missing_required_signature_count: number | null;
  missing_required_date_count: number | null;
  all_required_parties_signed: boolean | null;
  all_required_signatures_dated: boolean | null;
  completion_status: OverallCompletionStatus;
}

export interface WfaValidationOutput {
  form_type: 'WFA';

  form_validation: {
    is_wfa: boolean;
    form_title: string | null;
    form_revision: string | null;
    logical_page_number: number | null;
    expected_page_count: number;
    correct_page_label: boolean;
    document_complete: boolean;
    form_identity_status: FormIdentityStatus;
  };

  transaction_context: {
    transaction_type: TransactionType;
    expected_buyer_tenant_count: number | null;
    expected_seller_housing_provider_count: number | null;
    expected_buyer_tenant_names: string[] | null;
    expected_seller_housing_provider_names: string[] | null;
    expected_property_address: string | null;
  };

  advisory_content_validation: {
    advisory_heading_present: boolean;
    warning_explanation_present: boolean;
    recommendation_1_present: boolean;
    recommendation_2_present: boolean;
    recommendation_3_present: boolean;
    recommendation_4_present: boolean;
    recommendation_5_present: boolean;
    suspicious_instructions_response_present: boolean;
    resources_present: boolean;
    acknowledgement_text_present: boolean;
    all_required_content_present: boolean;
  };

  buyer_tenant_acknowledgements: PartyAcknowledgements;

  seller_housing_provider_acknowledgements: PartyAcknowledgements;

  non_required_execution_fields: {
    buyer_tenant_initials_fields_present: boolean;
    buyer_tenant_initials_required: boolean;
    seller_housing_provider_initials_fields_present: boolean;
    seller_housing_provider_initials_required: boolean;
    broker_signature_fields_present: boolean;
    broker_signature_required: boolean;
    agent_signature_fields_present: boolean;
    agent_signature_required: boolean;
    escrow_signature_fields_present: boolean;
    escrow_signature_required: boolean;
    property_address_required_on_form: boolean;
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

const SIGNATURE_SLOT_SCHEMA = {
  type: 'object',
  required: ['signature_present', 'signature_text', 'signature_type', 'signer_matches_expected_party', 'date', 'date_present', 'date_valid', 'completion_status'],
  properties: {
    signature_present: { type: 'boolean' },
    signature_text: { type: ['string', 'null'] },
    signature_type: { type: 'string', enum: ['handwritten', 'electronic', 'typed_text', 'blank', 'unreadable'] },
    signer_matches_expected_party: { type: ['boolean', 'null'] },
    date: { type: ['string', 'null'] },
    date_present: { type: 'boolean' },
    date_valid: { type: ['boolean', 'null'] },
    completion_status: { type: 'string', enum: ['complete', 'missing_signature', 'missing_date', 'missing_signature_and_date', 'unreadable'] },
  },
};

const PARTY_ACKNOWLEDGEMENTS_SCHEMA = {
  type: 'object',
  required: ['slot_1', 'slot_2', 'required_signature_count', 'valid_required_signature_count', 'missing_required_signature_count', 'missing_required_date_count', 'all_required_parties_signed', 'all_required_signatures_dated', 'completion_status'],
  properties: {
    slot_1: SIGNATURE_SLOT_SCHEMA,
    slot_2: SIGNATURE_SLOT_SCHEMA,
    required_signature_count: { type: ['number', 'null'] },
    valid_required_signature_count: { type: ['number', 'null'] },
    missing_required_signature_count: { type: ['number', 'null'] },
    missing_required_date_count: { type: ['number', 'null'] },
    all_required_parties_signed: { type: ['boolean', 'null'] },
    all_required_signatures_dated: { type: ['boolean', 'null'] },
    completion_status: { type: 'string', enum: ['complete', 'missing_signature', 'missing_date', 'missing_signature_and_date', 'unknown'] },
  },
};

export const WFA_VALIDATION_JSON_SCHEMA = {
  type: 'object',
  required: ['form_type', 'form_validation', 'transaction_context', 'advisory_content_validation', 'buyer_tenant_acknowledgements', 'seller_housing_provider_acknowledgements', 'non_required_execution_fields', 'validation_summary'],
  properties: {
    form_type: { type: 'string', enum: ['WFA'] },
    form_validation: {
      type: 'object',
      required: ['is_wfa', 'form_title', 'form_revision', 'logical_page_number', 'expected_page_count', 'correct_page_label', 'document_complete', 'form_identity_status'],
      properties: {
        is_wfa: { type: 'boolean' },
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
      required: ['transaction_type', 'expected_buyer_tenant_count', 'expected_seller_housing_provider_count', 'expected_buyer_tenant_names', 'expected_seller_housing_provider_names', 'expected_property_address'],
      properties: {
        transaction_type: { type: 'string', enum: ['purchase', 'rental', 'other', 'unknown'] },
        expected_buyer_tenant_count: { type: ['number', 'null'] },
        expected_seller_housing_provider_count: { type: ['number', 'null'] },
        expected_buyer_tenant_names: { type: ['array', 'null'], items: { type: 'string' } },
        expected_seller_housing_provider_names: { type: ['array', 'null'], items: { type: 'string' } },
        expected_property_address: { type: ['string', 'null'] },
      },
    },
    advisory_content_validation: {
      type: 'object',
      required: ['advisory_heading_present', 'warning_explanation_present', 'recommendation_1_present', 'recommendation_2_present', 'recommendation_3_present', 'recommendation_4_present', 'recommendation_5_present', 'suspicious_instructions_response_present', 'resources_present', 'acknowledgement_text_present', 'all_required_content_present'],
      properties: {
        advisory_heading_present: { type: 'boolean' },
        warning_explanation_present: { type: 'boolean' },
        recommendation_1_present: { type: 'boolean' },
        recommendation_2_present: { type: 'boolean' },
        recommendation_3_present: { type: 'boolean' },
        recommendation_4_present: { type: 'boolean' },
        recommendation_5_present: { type: 'boolean' },
        suspicious_instructions_response_present: { type: 'boolean' },
        resources_present: { type: 'boolean' },
        acknowledgement_text_present: { type: 'boolean' },
        all_required_content_present: { type: 'boolean' },
      },
    },
    buyer_tenant_acknowledgements: PARTY_ACKNOWLEDGEMENTS_SCHEMA,
    seller_housing_provider_acknowledgements: PARTY_ACKNOWLEDGEMENTS_SCHEMA,
    non_required_execution_fields: {
      type: 'object',
      required: ['buyer_tenant_initials_fields_present', 'buyer_tenant_initials_required', 'seller_housing_provider_initials_fields_present', 'seller_housing_provider_initials_required', 'broker_signature_fields_present', 'broker_signature_required', 'agent_signature_fields_present', 'agent_signature_required', 'escrow_signature_fields_present', 'escrow_signature_required', 'property_address_required_on_form'],
      properties: {
        buyer_tenant_initials_fields_present: { type: 'boolean' },
        buyer_tenant_initials_required: { type: 'boolean' },
        seller_housing_provider_initials_fields_present: { type: 'boolean' },
        seller_housing_provider_initials_required: { type: 'boolean' },
        broker_signature_fields_present: { type: 'boolean' },
        broker_signature_required: { type: 'boolean' },
        agent_signature_fields_present: { type: 'boolean' },
        agent_signature_required: { type: 'boolean' },
        escrow_signature_fields_present: { type: 'boolean' },
        escrow_signature_required: { type: 'boolean' },
        property_address_required_on_form: { type: 'boolean' },
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
Validate ONLY the Wire Fraud and Electronic Funds Transfer Advisory,
C.A.R. Form WFA.

Analyze the complete logical one-page WFA and determine whether all required
Buyer/Tenant and Seller/Housing Provider acknowledgment signatures and dates
are present.

Return valid JSON only. Do not return markdown, explanations, commentary, or
fields not included in the schema.

FORM IDENTIFICATION:
The correct document is:

- "WIRE FRAUD AND ELECTRONIC FUNDS TRANSFER ADVISORY"
- C.A.R. Form WFA
- One logical page
- The footer normally contains:
  "WFA REVIEWED 6/25 (PAGE 1 OF 1)"
  and
  "WIRE FRAUD AND ELECTRONIC FUNDS TRANSFER ADVISORY
   (WFA PAGE 1 OF 1)"

The form revision or review date may change in future versions.

Use the title, form abbreviation, revision, and logical page label to identify
the document.

Do not rely on the absolute PDF page number because WFA may appear inside a
larger disclosure, purchase, or rental packet.

If the page is not WFA:

- Set form_validation.is_wfa to false.
- Set form_identity_status to "wrong_form".
- Do not evaluate signature fields from the incorrect form as WFA signatures.

WFA CONTENT:
The WFA contains:

- An explanation of wire and electronic-funds-transfer fraud.
- Examples of fraudulent emailed transfer instructions.
- Five numbered recommendations.
- Instructions for responding to suspicious transfer instructions.
- Fraud-reporting resources.
- A note that alternatives such as cashier's checks may exist.
- An acknowledgment and signature section.

The numbered recommendations are:

1. Obtain phone numbers and account numbers from the Escrow Officer, Property
   Manager, or Housing Provider at the beginning of the transaction.

2. Never wire or electronically transfer funds before calling to confirm the
   instructions using a previously provided phone number.

3. Orally confirm the routing number, account number, and other transfer
   instructions.

4. Avoid sending personal information by email or text.

5. Secure the system used for email with strong passwords and secure Wi-Fi.

Do not require exact word-for-word OCR extraction, but confirm that the page is
substantially complete.

ACKNOWLEDGMENT TEXT:
The acknowledgment states:

"By signing below, Buyer/Tenant and Seller/Housing Provider acknowledge that
each has received a copy of this Wire Fraud and Electronic Funds Transfer
Advisory, and each has read and understands its terms."

Below the acknowledgment are:

- First Buyer/Tenant signature line and Date field.
- Second Buyer/Tenant signature line and Date field.
- First Seller/Housing Provider signature line and Date field.
- Second Seller/Housing Provider signature line and Date field.

ROLE MAPPING:
Use transaction context to interpret the combined role labels.

For a purchase transaction:

- Buyer/Tenant fields represent Buyers.
- Seller/Housing Provider fields represent Sellers.

For a rental transaction:

- Buyer/Tenant fields represent Tenants.
- Seller/Housing Provider fields represent Landlords or Housing Providers.

When transaction type is unknown:

- Preserve the combined labels Buyer/Tenant and Seller/Housing Provider.
- Do not guess whether the transaction is a purchase or rental.

REQUIRED EXECUTION FIELDS:
For every expected Buyer or Tenant, require:

- A signature.
- A corresponding date.

For every expected Seller or Housing Provider, require:

- A signature.
- A corresponding date.

Use party counts supplied in transaction context.

Examples:

Expected Buyer/Tenant count = 1:
- Buyer/Tenant slot 1 is required.
- Buyer/Tenant slot 2 may remain blank.

Expected Buyer/Tenant count = 2:
- Buyer/Tenant slots 1 and 2 are required.

Expected Seller/Housing Provider count = 1:
- Seller/Housing Provider slot 1 is required.
- Seller/Housing Provider slot 2 may remain blank.

Expected Seller/Housing Provider count = 2:
- Seller/Housing Provider slots 1 and 2 are required.

Do not assume that two parties exist merely because two printed signature lines
are available.

Do not infer party counts from:

- The number of printed signature lines.
- The number of visible signatures.
- Names appearing in transaction-platform footer metadata.
- DocuSign or Authentisign recipient counts.
- Broker, agent, escrow, or property information.

SIGNATURE DETECTION:
Count a signature as present when a deliberate execution mark appears on,
inside, or directly above the applicable designated signature line.

Valid signatures include:

- Handwritten signatures.
- Drawn signatures.
- Electronic signatures.
- DocuSign signatures.
- Authentisign signatures.
- Typed-looking signatures clearly located inside a designated electronic
  signature field.
- Signatures that slightly overlap the printed line because of electronic-field
  placement.

Do not count:

- A blank signature line.
- A blank electronic signature box.
- Printed party names outside a signature field.
- Broker or agent names in footer metadata.
- A DocuSign Envelope ID.
- An Authentisign ID.
- A DocuSign completion indicator outside the signature field.
- The printed labels "Buyer/Tenant", "Seller/Housing Provider", or "Date".
- An X or checkmark belonging to another field.
- Random scan marks, borders, form lines, or compression artifacts.

UNREADABLE SIGNATURE RULE:
When a deliberate signature is clearly present but the signer identity cannot
be read:

- signature_present = true.
- signature_text = null.
- signature_type = "unreadable".
- Do not create a missing-signature blocker.
- Create a manual-review warning when signer identity cannot be compared with
  expected party names.

ELECTRONIC SIGNATURE RULE:
Electronic signatures are valid when located inside or directly over the
designated signature line.

Do not require electronic signatures to resemble natural handwriting.

A typed-looking name is valid when:

- It is clearly contained inside a DocuSign, Authentisign, or other electronic
  signature field; and
- It is positioned on the applicable signature line.

Ordinary typed transaction metadata outside the signature field is not a
signature.

DATE DETECTION:
Every required signature must have a corresponding date.

Count a date as present when:

- A handwritten date appears in the designated Date field.
- An electronic signing date appears beside the applicable signature.
- A DocuSign or Authentisign date is clearly associated with that signature
  line.

Do not use:

- The WFA review date.
- A form-production date.
- A date belonging to another form.
- A DocuSign Envelope ID date outside the execution field.
- Dates appearing in footer transaction metadata.
- A date belonging to a different signer line.

SIGNATURE AND DATE PAIRING:
Pair signatures and dates by horizontal line.

- Buyer/Tenant slot 1 uses Buyer/Tenant Date 1.
- Buyer/Tenant slot 2 uses Buyer/Tenant Date 2.
- Seller/Housing Provider slot 1 uses Seller/Housing Provider Date 1.
- Seller/Housing Provider slot 2 uses Seller/Housing Provider Date 2.

Do not use one party's date to complete another party's signature.

A signature without a date is incomplete.

A date without a signature is also incomplete.

SIGNER NAME MATCHING:
When expected party names are supplied:

- Compare readable signature text or electronic signer names against the
  expected names for that role.
- Ignore capitalization, punctuation, middle initials, harmless spacing
  differences, and minor OCR errors.
- Do not require a handwritten signature to be fully readable.
- When the signature exists but signer identity cannot be determined, return
  null for signer_matches_expected_party and create a manual-review warning.
- A clearly different signer creates a blocker.

MULTIPLE PARTY RULE:
Use expected counts from transaction context.

Only the first N slots are required when the expected count is N.

Examples:

- One Buyer and one Seller:
  Buyer/Tenant slot 1 and Seller/Housing Provider slot 1 are required.
  Both slot 2 fields may remain blank.

- Two Buyers and one Seller:
  Both Buyer/Tenant slots and Seller/Housing Provider slot 1 are required.
  Seller/Housing Provider slot 2 may remain blank.

- One Tenant and two Housing Providers:
  Buyer/Tenant slot 1 and both Seller/Housing Provider slots are required.

Do not create blockers for unused signature lines.

UNKNOWN PARTY COUNT RULE:
When either expected party count is unavailable:

- Evaluate all visible signature and date fields.
- Report whether each visible slot is completed.
- Set required-count-dependent values to null or "unknown".
- Do not create a confirmed missing-party blocker merely because a printed
  signature line is blank.
- Set has_blocker to null unless a document-level blocker is confirmed.

MISSING SIGNATURE CALCULATION:
For each party group when the expected count is known:

1. The first N signature slots are required.
2. Review every required slot individually.
3. Count required slots containing valid signatures.
4. Count required signatures without corresponding dates.
5. Calculate:

   missing_required_signature_count =
   required_signature_count - valid_required_signature_count

6. Never return a value below zero.
7. Do not rely only on the total number of signatures.
8. Confirm that each required slot position is completed.

INDIVIDUAL SLOT STATUS:
Use:

- "complete":
  Signature and corresponding date are present.

- "missing_signature":
  Signature is absent but a date may be present.

- "missing_date":
  Signature is present but its corresponding date is absent.

- "missing_signature_and_date":
  Both the signature and date are absent.

- "unreadable":
  A deliberate signature or date mark is present but requires manual review.

GROUP COMPLETION STATUS:
Use:

- "complete":
  All required parties signed and dated the WFA.

- "missing_signature":
  At least one required signature is absent and all present signatures have
  dates.

- "missing_date":
  All required signatures are present but at least one required date is absent.

- "missing_signature_and_date":
  At least one required signature is missing and at least one required date is
  missing.

- "unknown":
  Expected party count is unavailable.

FORM CONTENT VALIDATION:
Create a document-level blocker when:

- The uploaded page is not WFA.
- The logical page label is not WFA page 1 of 1.
- A material part of the page is missing or cropped.
- The acknowledgment or signature section is missing.
- One or more numbered recommendations are missing because the page is
  incomplete.

Do not require perfect OCR of every advisory sentence.

NON-REQUIRED FIELDS — CRITICAL:
WFA does not contain or require:

- Buyer initials.
- Tenant initials.
- Seller initials.
- Housing Provider initials.
- Broker signatures.
- Agent signatures.
- Escrow Officer signatures.
- Property Manager signatures.
- A dedicated property-address field.
- A phone-number acknowledgment field.
- Bank-account or routing-number fields.

Do not create blockers for missing non-required fields.

The footer may contain transaction-platform metadata, such as:

- Brokerage name.
- Agent name.
- Phone or fax number.
- Property text.
- DocuSign Envelope ID.
- Authentisign ID.

Treat this information as metadata only.

Do not require it for WFA completion.

BLOCKER CODES:
Use these codes when applicable:

- WFA-WRONG-FORM
- WFA-WRONG-PAGE
- WFA-PAGE-MISSING
- WFA-CONTENT-INCOMPLETE
- WFA-ACKNOWLEDGMENT-MISSING

- WFA-BUYER-TENANT-1-SIGNATURE-MISSING
- WFA-BUYER-TENANT-1-DATE-MISSING
- WFA-BUYER-TENANT-2-SIGNATURE-MISSING
- WFA-BUYER-TENANT-2-DATE-MISSING
- WFA-BUYER-TENANT-SIGNER-MISMATCH

- WFA-SELLER-HOUSING-PROVIDER-1-SIGNATURE-MISSING
- WFA-SELLER-HOUSING-PROVIDER-1-DATE-MISSING
- WFA-SELLER-HOUSING-PROVIDER-2-SIGNATURE-MISSING
- WFA-SELLER-HOUSING-PROVIDER-2-DATE-MISSING
- WFA-SELLER-HOUSING-PROVIDER-SIGNER-MISMATCH

WARNING CODES:
Use these codes when applicable:

- WFA-BUYER-TENANT-COUNT-UNKNOWN
- WFA-SELLER-HOUSING-PROVIDER-COUNT-UNKNOWN
- WFA-SIGNATURE-UNREADABLE
- WFA-DATE-UNREADABLE
- WFA-SIGNER-IDENTITY-UNKNOWN
- WFA-TRANSACTION-TYPE-UNKNOWN
- WFA-MANUAL-REVIEW

VALID BLOCKER MESSAGE EXAMPLES:
- "Buyer 1 signature missing on WFA"
- "Buyer 1 signature date missing on WFA"
- "Buyer 2 signature missing on WFA"
- "Tenant 1 signature missing on WFA"
- "Seller 1 signature missing on WFA"
- "Seller 2 signature date missing on WFA"
- "Housing Provider 1 signature missing on WFA"
- "WFA Buyer/Tenant acknowledgment signer does not match the expected party"
- "WFA Seller/Housing Provider acknowledgment signer does not match the expected party"
- "WFA acknowledgment and signature section is missing"
- "Uploaded page is not C.A.R. Form WFA"

ROLE-SPECIFIC BLOCKER MESSAGES:
When transaction_type = "purchase", use:

- Buyer
- Seller

When transaction_type = "rental", use:

- Tenant
- Housing Provider

When transaction_type is "other" or "unknown", use:

- Buyer/Tenant
- Seller/Housing Provider

DO NOT CREATE BLOCKERS FOR:
- A blank second Buyer/Tenant line when only one Buyer or Tenant is expected.
- A blank second Seller/Housing Provider line when only one Seller or Housing
  Provider is expected.
- Missing initials.
- Missing broker or agent signatures.
- Missing Escrow Officer or Property Manager signatures.
- Missing property address.
- Missing brokerage, phone, fax, or footer metadata.
- A signature that is clearly present but unreadable.
- A WFA review date different from 6/25 when the document is otherwise a valid
  older or newer WFA revision.

GENERAL RULES:
- Validate WFA only.
- Ignore FRR-PA, BIA, FHDA, BHIA, RPA, and all other forms in the packet.
- Match the schema exactly.
- Do not add, remove, rename, or rearrange fields.
- Use null when information cannot be determined reliably.
- Do not guess party names, party counts, signatures, dates, or transaction
  type.
- Return valid JSON only.

SCHEMA:
${JSON.stringify(WFA_VALIDATION_JSON_SCHEMA, null, 2)}
`;

export const wfaValidation: PageDefinition = {
  pageNumber: 1,

  systemPrompt: SYSTEM_PROMPT,

  userPrompt: `
Validate only the one-page C.A.R. Wire Fraud and Electronic Funds Transfer
Advisory, Form WFA.

Check:

1. Correct WFA form identity and logical page 1 of 1.
2. Presence of the wire-fraud advisory content and recommendations 1 through 5.
3. Presence of the acknowledgment and execution area.
4. Required Buyer/Tenant signatures and corresponding dates.
5. Required Seller/Housing Provider signatures and corresponding dates.
6. Signer identity against expected party names when transaction context is
   available.
7. Correct role labels based on whether the transaction is a purchase or
   rental.

Do not require Buyer, Tenant, Seller, or Housing Provider initials.

Do not require broker, agent, Escrow Officer, Property Manager, or Housing
Provider representative signatures outside the printed party acknowledgment
lines.

Do not require a property-address field because WFA has no dedicated property
address field.

Return valid JSON matching the schema exactly.
  `.trim(),

  model: 'gemini-3.1-flash-lite',
  provider: 'gemini',
};
