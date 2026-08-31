/**
 * FHDA Validation Schema — C.A.R. Form FHDA (Fair Housing and Discrimination Advisory)
 *
 * This file defines the comprehensive validation schema for FHDA forms.
 * Unlike the extraction schema (fhda.standard.v12-24.ts) which extracts raw data,
 * this schema validates the document for completeness and compliance.
 *
 * The LLM returns data matching this schema, which is then processed by
 * fhda-validation.ts to produce blockers and warnings.
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

export interface Page1ContentValidation {
  equal_access_to_housing_for_all: boolean;
  federal_and_state_laws_prohibiting_discrimination: boolean;
  potential_legal_remedies: boolean;
  protected_classes_characteristics: boolean;
  dre_training_and_supervision_requirements: boolean;
  realtor_organizations_prohibit_discrimination: boolean;
  all_page_1_sections_present: boolean;
}

export interface Page2ContentValidation {
  who_is_required_to_comply: boolean;
  examples_of_conduct_not_motivated_by_intent_but_with_discriminatory_effect: boolean;
  examples_of_unlawful_improper_conduct: boolean;
  examples_of_positive_practices: boolean;
  fair_housing_resources: boolean;
  limited_exceptions_to_fair_housing_requirements: boolean;
  protected_classes_table_present: boolean;
  all_page_2_sections_present: boolean;
}

export interface CrossPageValidation {
  consistent_form_title: boolean;
  consistent_revision: boolean;
  page_count: number;
  correct_total_pages: boolean;
}

export interface NonRequiredFields {
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
}

export interface FhdaValidationOutput {
  form_type: 'FHDA';

  form_validation: {
    is_fhda: boolean;
    form_title: string | null;
    form_revision: string | null;
    logical_page_numbers: number[];
    expected_page_count: number;
    correct_page_labels: boolean;
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

  page_1: Page1ContentValidation;

  page_2: Page2ContentValidation;

  cross_page_validation: CrossPageValidation;

  buyer_tenant_acknowledgements: PartyAcknowledgements;

  seller_housing_provider_acknowledgements: PartyAcknowledgements;

  non_required_fields: NonRequiredFields;

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

export const FHDA_VALIDATION_JSON_SCHEMA = {
  type: 'object',
  required: ['form_type', 'form_validation', 'transaction_context', 'page_1', 'page_2', 'cross_page_validation', 'buyer_tenant_acknowledgements', 'seller_housing_provider_acknowledgements', 'non_required_fields', 'validation_summary'],
  properties: {
    form_type: { type: 'string', enum: ['FHDA'] },
    form_validation: {
      type: 'object',
      required: ['is_fhda', 'form_title', 'form_revision', 'logical_page_numbers', 'expected_page_count', 'correct_page_labels', 'document_complete', 'form_identity_status'],
      properties: {
        is_fhda: { type: 'boolean' },
        form_title: { type: ['string', 'null'] },
        form_revision: { type: ['string', 'null'] },
        logical_page_numbers: { type: 'array', items: { type: 'number' } },
        expected_page_count: { type: 'number' },
        correct_page_labels: { type: 'boolean' },
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
    page_1: {
      type: 'object',
      required: ['equal_access_to_housing_for_all', 'federal_and_state_laws_prohibiting_discrimination', 'potential_legal_remedies', 'protected_classes_characteristics', 'dre_training_and_supervision_requirements', 'realtor_organizations_prohibit_discrimination', 'all_page_1_sections_present'],
      properties: {
        equal_access_to_housing_for_all: { type: 'boolean' },
        federal_and_state_laws_prohibiting_discrimination: { type: 'boolean' },
        potential_legal_remedies: { type: 'boolean' },
        protected_classes_characteristics: { type: 'boolean' },
        dre_training_and_supervision_requirements: { type: 'boolean' },
        realtor_organizations_prohibit_discrimination: { type: 'boolean' },
        all_page_1_sections_present: { type: 'boolean' },
      },
    },
    page_2: {
      type: 'object',
      required: ['who_is_required_to_comply', 'examples_of_conduct_not_motivated_by_intent_but_with_discriminatory_effect', 'examples_of_unlawful_improper_conduct', 'examples_of_positive_practices', 'fair_housing_resources', 'limited_exceptions_to_fair_housing_requirements', 'protected_classes_table_present', 'all_page_2_sections_present'],
      properties: {
        who_is_required_to_comply: { type: 'boolean' },
        examples_of_conduct_not_motivated_by_intent_but_with_discriminatory_effect: { type: 'boolean' },
        examples_of_unlawful_improper_conduct: { type: 'boolean' },
        examples_of_positive_practices: { type: 'boolean' },
        fair_housing_resources: { type: 'boolean' },
        limited_exceptions_to_fair_housing_requirements: { type: 'boolean' },
        protected_classes_table_present: { type: 'boolean' },
        all_page_2_sections_present: { type: 'boolean' },
      },
    },
    cross_page_validation: {
      type: 'object',
      required: ['consistent_form_title', 'consistent_revision', 'page_count', 'correct_total_pages'],
      properties: {
        consistent_form_title: { type: 'boolean' },
        consistent_revision: { type: 'boolean' },
        page_count: { type: 'number' },
        correct_total_pages: { type: 'boolean' },
      },
    },
    buyer_tenant_acknowledgements: PARTY_ACKNOWLEDGEMENTS_SCHEMA,
    seller_housing_provider_acknowledgements: PARTY_ACKNOWLEDGEMENTS_SCHEMA,
    non_required_fields: {
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
Validate ONLY the Fair Housing and Discrimination Advisory,
C.A.R. Form FHDA.

Analyze the complete two-page FHDA and determine whether all required
acknowledgment sections, advisory content, protected classes information,
and Buyer/Tenant and Seller/Housing Provider acknowledgment signatures
and dates are present.

Return valid JSON only. Do not return markdown, explanations, commentary, or
fields not included in the schema.

FORM IDENTIFICATION:
The correct document is:

- "FAIR HOUSING AND DISCRIMINATION ADVISORY"
- C.A.R. Form FHDA
- Two logical pages
- The footer normally contains:
  "FHDA REVISED 12/24 (PAGE 1 OF 2)" on page 1
  "FHDA REVISED 12/24 (PAGE 2 OF 2)" on page 2
  and
  "FAIR HOUSING AND DISCRIMINATION ADVISORY
   (FHDA PAGE 1 OF 2)"
  and
  "FAIR HOUSING AND DISCRIMINATION ADVISORY
   (FHDA PAGE 2 OF 2)"

The form revision or review date may change in future versions.

Use the title, form abbreviation, revision, and logical page labels to identify
the document.

Do not rely on the absolute PDF page number because FHDA may appear inside a
larger disclosure, purchase, or rental packet.

If the page is not FHDA:

- Set form_validation.is_fhda to false.
- Set form_identity_status to "wrong_form".
- Do not evaluate signature fields from the incorrect form as FHDA signatures.

PAGE 1 CONTENT:
Page 1 contains Sections 1 through 9A through 9D:

1. EQUAL ACCESS TO HOUSING FOR ALL
2. FEDERAL AND STATE LAWS PROHIBITING DISCRIMINATION
3. POTENTIAL LEGAL REMEDIES
4. PROTECTED CLASSES/CHARACTERISTICS
5. DRE TRAINING AND SUPERVISION REQUIREMENTS
6. REALTOR ORGANIZATIONS PROHIBIT DISCRIMINATION
9A. WHO IS REQUIRED TO COMPLY
9B. EXAMPLES OF CONDUCT NOT MOTIVATED BY INTENT BUT WITH DISCRIMINATORY EFFECT
9C. EXAMPLES OF UNLAWFUL/IMPROPER CONDUCT
9D. EXAMPLES OF POSITIVE PRACTICES

PAGE 2 CONTENT:
Page 2 contains Sections 9E through 9O, 10, 11, 12, and the acknowledgment area:

9E through 9O — Protected classes/characteristics table (listing protected categories)
10. FAIR HOUSING RESOURCES
11. LIMITED EXCEPTIONS TO FAIR HOUSING REQUIREMENTS
12. ACKNOWLEDGMENT

The protected classes table on page 2 lists protected categories including but
not limited to: race, color, religion, sex, gender, gender identity, gender
expression, sexual orientation, marital status, national origin, ancestry,
mental disability, physical disability, medical condition, genetic information,
familial status, age, veteran or military status, source of income, and
arbitrary characteristics.

Do not require perfect OCR of every advisory sentence, but confirm that pages
are substantially complete.

ACKNOWLEDGMENT TEXT:
The acknowledgment states:

"By signing below, Buyer/Tenant and Seller/Housing Provider acknowledge that
each has received a copy of this Fair Housing and Discrimination Advisory,
and each has read and understands its terms."

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

- The FHDA review date.
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
  All required parties signed and dated the FHDA.

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

- The uploaded pages are not FHDA.
- The logical page labels are not FHDA pages 1 of 2 and 2 of 2.
- A material part of either page is missing or cropped.
- The acknowledgment or signature section is missing.
- The protected classes table on page 2 is missing.
- One or more required advisory sections on page 1 or page 2 are missing
  because the page is incomplete.

Do not require perfect OCR of every advisory sentence.

NON-REQUIRED FIELDS — CRITICAL:
FHDA does not contain or require:

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

Do not require it for FHDA completion.

BLOCKER CODES:
Use these codes when applicable:

- FHDA-WRONG-FORM
- FHDA-WRONG-PAGE
- FHDA-PAGE-MISSING
- FHDA-PAGE-ORDER-WRONG
- FHDA-MIXED-REVISION
- FHDA-CONTENT-INCOMPLETE
- FHDA-PROTECTED-CLASSES-TABLE-MISSING
- FHDA-ACKNOWLEDGMENT-MISSING

- FHDA-BUYER-TENANT-1-SIGNATURE-MISSING
- FHDA-BUYER-TENANT-1-DATE-MISSING
- FHDA-BUYER-TENANT-2-SIGNATURE-MISSING
- FHDA-BUYER-TENANT-2-DATE-MISSING
- FHDA-BUYER-TENANT-SIGNER-MISMATCH

- FHDA-SELLER-HOUSING-PROVIDER-1-SIGNATURE-MISSING
- FHDA-SELLER-HOUSING-PROVIDER-1-DATE-MISSING
- FHDA-SELLER-HOUSING-PROVIDER-2-SIGNATURE-MISSING
- FHDA-SELLER-HOUSING-PROVIDER-2-DATE-MISSING
- FHDA-SELLER-HOUSING-PROVIDER-SIGNER-MISMATCH

WARNING CODES:
Use these codes when applicable:

- FHDA-BUYER-TENANT-COUNT-UNKNOWN
- FHDA-SELLER-HOUSING-PROVIDER-COUNT-UNKNOWN
- FHDA-SIGNATURE-UNREADABLE
- FHDA-DATE-UNREADABLE
- FHDA-SIGNER-IDENTITY-UNKNOWN
- FHDA-TRANSACTION-TYPE-UNKNOWN
- FHDA-MANUAL-REVIEW

VALID BLOCKER MESSAGE EXAMPLES:
- "Buyer 1 signature missing on FHDA"
- "Buyer 1 signature date missing on FHDA"
- "Buyer 2 signature missing on FHDA"
- "Tenant 1 signature missing on FHDA"
- "Seller 1 signature missing on FHDA"
- "Seller 2 signature date missing on FHDA"
- "Housing Provider 1 signature missing on FHDA"
- "FHDA Buyer/Tenant acknowledgment signer does not match the expected party"
- "FHDA Seller/Housing Provider acknowledgment signer does not match the expected party"
- "FHDA acknowledgment and signature section is missing"
- "FHDA protected classes table is missing from page 2"
- "Uploaded pages are not C.A.R. Form FHDA"

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
- An FHDA review date different from 12/24 when the document is otherwise a valid
  older or newer FHDA revision.

GENERAL RULES:
- Validate FHDA only.
- Ignore BIA, BHIA, WFA, RPA, and all other forms in the packet.
- Match the schema exactly.
- Do not add, remove, rename, or rearrange fields.
- Use null when information cannot be determined reliably.
- Do not guess party names, party counts, signatures, dates, or transaction
  type.
- Return valid JSON only.

SCHEMA:
${JSON.stringify(FHDA_VALIDATION_JSON_SCHEMA, null, 2)}
`;

export const fhdaValidation: PageDefinition[] = [
  {
    pageNumber: 1,
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: `
Validate page 1 of the two-page C.A.R. Fair Housing and Discrimination Advisory,
Form FHDA.

Check:

1. Correct FHDA form identity and logical page 1 of 2.
2. Presence of advisory sections: equal access, federal/state laws, legal
   remedies, protected classes, DRE training, realtor organizations.
3. Sections 9A (who must comply), 9B (discriminatory effect conduct), 9C
   (unlawful/improper conduct), 9D (positive practices).

Do not require perfect word-for-word OCR. Confirm sections are materially present.

Return valid JSON matching the schema exactly.
    `.trim(),
    model: 'gemini-3.1-flash-lite',
    provider: 'gemini',
  },
  {
    pageNumber: 2,
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: `
Validate page 2 of the two-page C.A.R. Fair Housing and Discrimination Advisory,
Form FHDA.

Check:

1. Correct FHDA form identity and logical page 2 of 2.
2. Presence of the protected classes/characteristics table (9E through 9O).
3. Sections 10 (fair housing resources), 11 (limited exceptions).
4. Section 12 — acknowledgment text and signature area.
5. Required Buyer/Tenant signatures and corresponding dates.
6. Required Seller/Housing Provider signatures and corresponding dates.
7. Signer identity against expected party names when transaction context is
   available.
8. Correct role labels based on whether the transaction is a purchase or
   rental.

Do not require Buyer, Tenant, Seller, or Housing Provider initials.

Do not require broker, agent, Escrow Officer, Property Manager, or Housing
Provider representative signatures outside the printed party acknowledgment
lines.

Do not require a property-address field because FHDA has no dedicated property
address field.

Return valid JSON matching the schema exactly.
    `.trim(),
    model: 'gemini-3.1-flash-lite',
    provider: 'gemini',
  },
];
