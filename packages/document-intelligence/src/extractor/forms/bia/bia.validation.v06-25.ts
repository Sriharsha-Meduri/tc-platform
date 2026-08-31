/**
 * BIA Validation Schema — C.A.R. Form BIA (Buyer's Investigation Advisory)
 *
 * This file defines the comprehensive validation schema for BIA forms.
 * Unlike the extraction schema (bia.standard.v12-22.ts) which extracts raw data,
 * this schema validates the document for completeness and compliance.
 *
 * The LLM returns data matching this schema, which is then processed by
 * bia-validation.ts to produce blockers and warnings.
 */

import type { PageDefinition } from '../form-definition';

// ─── TypeScript types for the LLM validation output ───────────────────────────

export type SignatureType = 'handwritten' | 'electronic' | 'typed_text' | 'blank' | 'unreadable';
export type SlotCompletionStatus = 'complete' | 'missing_signature' | 'missing_date' | 'missing_signature_and_date' | 'unreadable';
export type OverallCompletionStatus = 'complete' | 'missing_signature' | 'missing_date' | 'missing_signature_and_date' | 'unknown';
export type FormIdentityStatus = 'valid' | 'wrong_form' | 'missing_pages' | 'duplicate_pages' | 'mixed_revision' | 'wrong_page_order' | 'unknown';
export type OverallValidationStatus = 'complete' | 'incomplete' | 'manual_review_required' | 'wrong_document';
export type PageCompletionStatus = 'complete' | 'content_incomplete' | 'execution_incomplete' | 'wrong_page' | 'missing' | 'unknown';
export type CrossPageStatus = 'consistent' | 'inconsistent' | 'unknown';

export interface BuyerSignatureSlot {
  signature_present: boolean;
  signature_text: string | null;
  signature_type: SignatureType;
  signer_matches_expected_buyer: boolean | null;
  date: string | null;
  date_present: boolean;
  date_valid: boolean | null;
  completion_status: SlotCompletionStatus;
}

export interface BuyerAcknowledgements {
  buyer_1: BuyerSignatureSlot;
  buyer_2: BuyerSignatureSlot;
  required_signature_count: number | null;
  valid_required_signature_count: number | null;
  missing_required_signature_count: number | null;
  missing_required_date_count: number | null;
  all_required_buyers_signed: boolean | null;
  all_required_signatures_dated: boolean | null;
  completion_status: OverallCompletionStatus;
}

export interface InvestigationCategories {
  section_3a_general_condition_present: boolean;
  section_3b_square_footage_age_boundaries_present: boolean;
  section_3c_wood_destroying_pests_present: boolean;
  section_3d_soil_stability_present: boolean;
  section_3e_water_utilities_well_waste_present: boolean;
  section_3f_environmental_hazards_present: boolean;
  section_3g_earthquakes_and_flooding_present: boolean;
  section_3h_fire_hazard_and_other_insurance_present: boolean;
  section_3i_building_permits_zoning_address_present: boolean;
  section_3j_rental_property_restrictions_present: boolean;
  section_3k_security_and_safety_present: boolean;
  section_3l_utilities_sewer_internet_present: boolean;
  section_3m_solar_power_system_present: boolean;
  all_page_1_categories_present: boolean;
}

export interface ProhibitedExecutionRequirements {
  buyer_signatures_present_on_page: boolean;
  buyer_signatures_required_on_page: boolean;
  buyer_initials_present_on_page: boolean;
  buyer_initials_required_on_page: boolean;
  seller_signatures_present_on_page: boolean;
  seller_signatures_required_on_page: boolean;
  seller_initials_present_on_page: boolean;
  seller_initials_required_on_page: boolean;
  broker_or_agent_signature_required_on_page: boolean;
}

export interface BiaValidationOutput {
  form_type: 'BIA';

  form_validation: {
    is_bia: boolean;
    form_title: string | null;
    form_revision: string | null;
    expected_page_count: number;
    detected_logical_pages: number[];
    all_required_pages_present: boolean;
    missing_pages: number[];
    duplicate_pages: number[];
    page_order_valid: boolean;
    mixed_form_revisions: boolean;
    document_complete: boolean;
    form_identity_status: FormIdentityStatus;
  };

  transaction_context: {
    expected_buyers: number | null;
    expected_buyer_names: string[] | null;
    expected_property_address: string | null;
  };

  page_1: {
    page_present: boolean;
    correct_page_label: boolean;
    page_revision: string | null;
    section_1_importance_of_property_investigation_present: boolean;
    section_2_broker_obligations_present: boolean;
    section_3_investigation_advice_heading_present: boolean;
    investigation_categories: InvestigationCategories;
    prohibited_execution_requirements: ProhibitedExecutionRequirements;
    page_completion_status: PageCompletionStatus;
  };

  page_2: {
    page_present: boolean;
    correct_page_label: boolean;
    page_revision: string | null;
    section_3n_neighborhood_area_subdivision_conditions_present: boolean;
    acknowledgement_text_present: boolean;
    buyer_acknowledgements: BuyerAcknowledgements;
    prohibited_execution_requirements: ProhibitedExecutionRequirements;
    page_completion_status: PageCompletionStatus;
  };

  cross_page_validation: {
    revision_consistent: boolean | null;
    page_sequence_consistent: boolean;
    pages_appear_to_belong_to_same_form_set: boolean | null;
    cross_page_status: CrossPageStatus;
    inconsistency_messages: string[];
  };

  non_required_fields: {
    property_address_required_on_form: boolean;
    buyer_initials_required: boolean;
    seller_signatures_required: boolean;
    seller_initials_required: boolean;
    broker_signature_required: boolean;
    agent_signature_required: boolean;
    escrow_signature_required: boolean;
    investigation_checkboxes_required: boolean;
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

export const BIA_VALIDATION_JSON_SCHEMA = {
  type: 'object',
  required: ['form_type', 'form_validation', 'transaction_context', 'page_1', 'page_2', 'cross_page_validation', 'non_required_fields', 'validation_summary'],
  properties: {
    form_type: { type: 'string', enum: ['BIA'] },
    form_validation: {
      type: 'object',
      required: ['is_bia', 'form_title', 'form_revision', 'expected_page_count', 'detected_logical_pages', 'all_required_pages_present', 'missing_pages', 'duplicate_pages', 'page_order_valid', 'mixed_form_revisions', 'document_complete', 'form_identity_status'],
      properties: {
        is_bia: { type: 'boolean' },
        form_title: { type: ['string', 'null'] },
        form_revision: { type: ['string', 'null'] },
        expected_page_count: { type: 'number' },
        detected_logical_pages: { type: 'array', items: { type: 'number' } },
        all_required_pages_present: { type: 'boolean' },
        missing_pages: { type: 'array', items: { type: 'number' } },
        duplicate_pages: { type: 'array', items: { type: 'number' } },
        page_order_valid: { type: 'boolean' },
        mixed_form_revisions: { type: 'boolean' },
        document_complete: { type: 'boolean' },
        form_identity_status: { type: 'string', enum: ['valid', 'wrong_form', 'missing_pages', 'duplicate_pages', 'mixed_revision', 'wrong_page_order', 'unknown'] },
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
    page_1: {
      type: 'object',
      required: ['page_present', 'correct_page_label', 'page_revision', 'section_1_importance_of_property_investigation_present', 'section_2_broker_obligations_present', 'section_3_investigation_advice_heading_present', 'investigation_categories', 'prohibited_execution_requirements', 'page_completion_status'],
      properties: {
        page_present: { type: 'boolean' },
        correct_page_label: { type: 'boolean' },
        page_revision: { type: ['string', 'null'] },
        section_1_importance_of_property_investigation_present: { type: 'boolean' },
        section_2_broker_obligations_present: { type: 'boolean' },
        section_3_investigation_advice_heading_present: { type: 'boolean' },
        investigation_categories: {
          type: 'object',
          required: ['section_3a_general_condition_present', 'section_3b_square_footage_age_boundaries_present', 'section_3c_wood_destroying_pests_present', 'section_3d_soil_stability_present', 'section_3e_water_utilities_well_waste_present', 'section_3f_environmental_hazards_present', 'section_3g_earthquakes_and_flooding_present', 'section_3h_fire_hazard_and_other_insurance_present', 'section_3i_building_permits_zoning_address_present', 'section_3j_rental_property_restrictions_present', 'section_3k_security_and_safety_present', 'section_3l_utilities_sewer_internet_present', 'section_3m_solar_power_system_present', 'all_page_1_categories_present'],
          properties: {
            section_3a_general_condition_present: { type: 'boolean' },
            section_3b_square_footage_age_boundaries_present: { type: 'boolean' },
            section_3c_wood_destroying_pests_present: { type: 'boolean' },
            section_3d_soil_stability_present: { type: 'boolean' },
            section_3e_water_utilities_well_waste_present: { type: 'boolean' },
            section_3f_environmental_hazards_present: { type: 'boolean' },
            section_3g_earthquakes_and_flooding_present: { type: 'boolean' },
            section_3h_fire_hazard_and_other_insurance_present: { type: 'boolean' },
            section_3i_building_permits_zoning_address_present: { type: 'boolean' },
            section_3j_rental_property_restrictions_present: { type: 'boolean' },
            section_3k_security_and_safety_present: { type: 'boolean' },
            section_3l_utilities_sewer_internet_present: { type: 'boolean' },
            section_3m_solar_power_system_present: { type: 'boolean' },
            all_page_1_categories_present: { type: 'boolean' },
          },
        },
        prohibited_execution_requirements: {
          type: 'object',
          required: ['buyer_signatures_present_on_page', 'buyer_signatures_required_on_page', 'buyer_initials_present_on_page', 'buyer_initials_required_on_page', 'seller_signatures_present_on_page', 'seller_signatures_required_on_page', 'seller_initials_present_on_page', 'seller_initials_required_on_page', 'broker_or_agent_signature_required_on_page'],
          properties: {
            buyer_signatures_present_on_page: { type: 'boolean' },
            buyer_signatures_required_on_page: { type: 'boolean' },
            buyer_initials_present_on_page: { type: 'boolean' },
            buyer_initials_required_on_page: { type: 'boolean' },
            seller_signatures_present_on_page: { type: 'boolean' },
            seller_signatures_required_on_page: { type: 'boolean' },
            seller_initials_present_on_page: { type: 'boolean' },
            seller_initials_required_on_page: { type: 'boolean' },
            broker_or_agent_signature_required_on_page: { type: 'boolean' },
          },
        },
        page_completion_status: { type: 'string', enum: ['complete', 'content_incomplete', 'wrong_page', 'missing', 'unknown'] },
      },
    },
    page_2: {
      type: 'object',
      required: ['page_present', 'correct_page_label', 'page_revision', 'section_3n_neighborhood_area_subdivision_conditions_present', 'acknowledgement_text_present', 'buyer_acknowledgements', 'prohibited_execution_requirements', 'page_completion_status'],
      properties: {
        page_present: { type: 'boolean' },
        correct_page_label: { type: 'boolean' },
        page_revision: { type: ['string', 'null'] },
        section_3n_neighborhood_area_subdivision_conditions_present: { type: 'boolean' },
        acknowledgement_text_present: { type: 'boolean' },
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
        prohibited_execution_requirements: {
          type: 'object',
          required: ['buyer_initials_present_on_page', 'buyer_initials_required_on_page', 'seller_signatures_present_on_page', 'seller_signatures_required_on_page', 'seller_initials_present_on_page', 'seller_initials_required_on_page', 'broker_or_agent_signature_required_on_page'],
          properties: {
            buyer_initials_present_on_page: { type: 'boolean' },
            buyer_initials_required_on_page: { type: 'boolean' },
            seller_signatures_present_on_page: { type: 'boolean' },
            seller_signatures_required_on_page: { type: 'boolean' },
            seller_initials_present_on_page: { type: 'boolean' },
            seller_initials_required_on_page: { type: 'boolean' },
            broker_or_agent_signature_required_on_page: { type: 'boolean' },
          },
        },
        page_completion_status: { type: 'string', enum: ['complete', 'content_incomplete', 'execution_incomplete', 'wrong_page', 'missing', 'unknown'] },
      },
    },
    cross_page_validation: {
      type: 'object',
      required: ['revision_consistent', 'page_sequence_consistent', 'pages_appear_to_belong_to_same_form_set', 'cross_page_status', 'inconsistency_messages'],
      properties: {
        revision_consistent: { type: ['boolean', 'null'] },
        page_sequence_consistent: { type: 'boolean' },
        pages_appear_to_belong_to_same_form_set: { type: ['boolean', 'null'] },
        cross_page_status: { type: 'string', enum: ['consistent', 'inconsistent', 'unknown'] },
        inconsistency_messages: { type: 'array', items: { type: 'string' } },
      },
    },
    non_required_fields: {
      type: 'object',
      required: ['property_address_required_on_form', 'buyer_initials_required', 'seller_signatures_required', 'seller_initials_required', 'broker_signature_required', 'agent_signature_required', 'escrow_signature_required', 'investigation_checkboxes_required'],
      properties: {
        property_address_required_on_form: { type: 'boolean' },
        buyer_initials_required: { type: 'boolean' },
        seller_signatures_required: { type: 'boolean' },
        seller_initials_required: { type: 'boolean' },
        broker_signature_required: { type: 'boolean' },
        agent_signature_required: { type: 'boolean' },
        escrow_signature_required: { type: 'boolean' },
        investigation_checkboxes_required: { type: 'boolean' },
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

// ─── Page definitions for per-page LLM routing ────────────────────────────────

const BIA_SYSTEM_PROMPT = `
ROLE:
You are a California real estate transaction coordinator and an OCR/vision
document-compliance specialist.

TASK:
Validate ONLY the Buyer's Investigation Advisory, C.A.R. Form BIA.

Analyze the complete logical two-page BIA and determine whether:

1. Both required logical pages are present.
2. The advisory content is materially complete.
3. Every required Buyer signed and dated the acknowledgment on logical page 2.

Return valid JSON only. Do not return markdown, explanations, commentary, or
fields not included in the schema.

FORM IDENTIFICATION:
The correct document is:

- "BUYER'S INVESTIGATION ADVISORY"
- C.A.R. Form BIA
- Two logical pages
- The footer normally identifies:
  - "BIA PAGE 1 OF 2"
  - "BIA PAGE 2 OF 2"

The revision may vary. For example:

- "BIA REVISED 6/25"

Use the printed form title, form abbreviation, revision, and logical page
labels.

Do not rely on absolute PDF page numbers because BIA may appear inside a larger
purchase or disclosure packet.

DOCUMENT-LEVEL VALIDATION:
A complete BIA must contain logical pages 1 and 2.

Create a blocker when:

- Logical page 1 is missing.
- Logical page 2 is missing.
- The document is not BIA.
- A duplicate page replaces a required page.
- Pages 1 and 2 use clearly different revisions.
- Pages appear to belong to different form sets.
- A material portion of either page is missing or cropped.
- The acknowledgment or signature area on page 2 is missing.

Do not create a blocker merely because unrelated forms appear before or after
the BIA in the same packet.

PAGE 1 CONTENT:
Logical BIA page 1 contains:

SECTION 1:
- "IMPORTANCE OF PROPERTY INVESTIGATION"

SECTION 2:
- "BROKER OBLIGATIONS"

SECTION 3:
- The warning that Buyer is strongly advised to investigate the condition and
  suitability of all aspects of the Property.

Page 1 then contains Sections 3A through 3M:

- 3A: GENERAL CONDITION OF THE PROPERTY, ITS SYSTEMS AND COMPONENTS
- 3B: SQUARE FOOTAGE, AGE, BOUNDARIES
- 3C: WOOD DESTROYING PESTS
- 3D: SOIL STABILITY
- 3E: WATER AND UTILITIES; WELL SYSTEMS AND COMPONENTS; WASTE DISPOSAL
- 3F: ENVIRONMENTAL HAZARDS
- 3G: EARTHQUAKES AND FLOODING
- 3H: FIRE, HAZARD, AND OTHER INSURANCE
- 3I: BUILDING PERMITS, ZONING, GOVERNMENTAL REQUIREMENTS, AND ADDRESS
- 3J: RENTAL PROPERTY RESTRICTIONS
- 3K: SECURITY AND SAFETY
- 3L: UTILITIES; SEWER; INTERNET
- 3M: SOLAR POWER SYSTEM

Use these headings to verify that page 1 is substantially complete.

Do not require perfect word-for-word OCR extraction.

PAGE 1 EXECUTION RULE — CRITICAL:
Logical BIA page 1 contains no required execution fields.

Do not require:

- Buyer signatures.
- Buyer initials.
- Seller signatures.
- Seller initials.
- Broker signatures.
- Agent signatures.
- Dates.

Do not create an execution blocker for logical page 1.

PAGE 2 CONTENT:
Logical BIA page 2 contains:

SECTION 3N:
- "NEIGHBORHOOD, AREA, SUBDIVISION CONDITIONS; PERSONAL FACTORS"

It also contains the Buyer acknowledgment:

"By signing below, Buyer acknowledges that they have received a copy of this
Buyer Investigation Advisory, and they have read and understand its terms.
Buyer is encouraged to read it carefully."

Below the acknowledgment are:

- First Buyer signature line.
- First Buyer Date field.
- Second Buyer signature line.
- Second Buyer Date field.

REQUIRED EXECUTION FIELDS:
For each expected Buyer, require:

- A Buyer signature.
- A date associated with that Buyer signature.

Use the expected Buyer count supplied in transaction context.

Expected Buyers = 1:
- Buyer slot 1 signature and date are required.
- Buyer slot 2 may remain blank.

Expected Buyers = 2:
- Buyer slots 1 and 2 must each contain a signature and date.

Do not assume that two Buyers exist merely because the form provides two
signature lines.

Do not infer Buyer count from:

- The number of printed signature lines.
- The number of visible signatures.
- Names found in unrelated forms.
- DocuSign or Authentisign recipient counts.
- Footer metadata.
- Brokerage or agent information.

SIGNATURE DETECTION:
Count a Buyer signature as present when a deliberate execution mark appears
inside, on, or directly above the designated Buyer signature line.

Valid signatures include:

- Handwritten signatures.
- Drawn signatures.
- DocuSign signatures.
- Authentisign signatures.
- Other valid electronic signatures.
- Typed-looking names clearly contained inside a designated electronic
  signature field.
- Signatures that slightly overlap the printed line because of electronic-field
  placement.

Do not count:

- A blank signature line.
- A blank electronic-signature border.
- A printed Buyer name outside the signature field.
- A broker or agent name appearing in footer metadata.
- A DocuSign Envelope ID.
- An Authentisign ID.
- A completion checkmark outside the signature field.
- The printed label "Buyer".
- The printed label "Date".
- An underline, border, shadow, random mark, or scan artifact.

UNREADABLE SIGNATURE RULE:
If a deliberate signature mark is clearly present but the signer identity
cannot be read:

- signature_present = true.
- signature_text = null.
- signature_type = "unreadable".
- Do not create a missing-signature blocker.
- Create a manual-review warning if the signature cannot be compared against
  expected Buyer names.

ELECTRONIC SIGNATURE RULE:
Electronic signatures are valid when clearly located inside or directly over
the applicable Buyer signature field.

Do not require an electronic signature to resemble natural handwriting.

A typed-looking name is valid only when it is clearly part of a DocuSign,
Authentisign, or other electronic signature field.

Ordinary typed footer metadata is not a signature.

DATE DETECTION:
Every required Buyer signature must have a corresponding date.

A valid associated date may be:

- Handwritten in the designated Date field.
- Electronically inserted beside the applicable Buyer signature.
- A DocuSign or Authentisign signing date clearly tied to the same signature
  line.

Do not use:

- The BIA revision date.
- A footer production date.
- Dates from another form.
- Dates associated with a different signer.
- Envelope creation or completion dates outside the signature field.
- Transaction dates appearing in metadata.

SIGNATURE AND DATE PAIRING:
Pair each signature and date by horizontal line.

- Buyer slot 1 signature uses Buyer Date slot 1.
- Buyer slot 2 signature uses Buyer Date slot 2.

Do not use Buyer 1's date to complete Buyer 2.

A signature without a date is incomplete.

A date without a signature is also incomplete.

BUYER NAME MATCHING:
When expected Buyer names are supplied:

- Compare readable signature text or electronic signer names with expected
  Buyer names.
- Ignore capitalization, punctuation, middle initials, harmless spacing
  differences, and minor OCR errors.
- Do not require handwritten signatures to be fully legible.
- If the signature is present but identity cannot be determined, return null
  for signer_matches_expected_buyer and create a warning.
- A clearly different signer name creates a blocker.

UNKNOWN BUYER COUNT RULE:
If expected Buyer count is unavailable:

- Evaluate both printed Buyer signature lines visually.
- Report whether each signature and date is present.
- Set required-count-dependent values to null or "unknown".
- Do not create a confirmed missing-Buyer blocker solely because a printed
  signature line is blank.
- Set has_blocker to null unless a document-level blocker is confirmed.

MISSING SIGNATURE CALCULATION:
When expected Buyer count is known:

1. The first N Buyer signature slots are required.
2. Review each required slot separately.
3. Count required slots containing valid signatures.
4. Count required signatures without dates.
5. Calculate:

   missing_required_signature_count =
   required_signature_count - valid_required_signature_count

6. Never return a value below zero.
7. Do not determine completion only from the total number of signatures.
8. Confirm that each required slot position is complete.

INDIVIDUAL SLOT STATUS:
Use:

- "complete":
  Signature and corresponding date are present.

- "missing_signature":
  Signature is absent but a date may be present.

- "missing_date":
  Signature is present but its corresponding date is absent.

- "missing_signature_and_date":
  Both signature and date are absent.

- "unreadable":
  A deliberate signature or date mark exists but requires manual review.

GROUP COMPLETION STATUS:
Use:

- "complete":
  All required Buyers signed and dated the BIA.

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

NON-REQUIRED FIELDS — CRITICAL:
BIA does not require:

- Buyer initials.
- Seller signatures.
- Seller initials.
- Broker signatures.
- Agent signatures.
- Escrow signatures.
- Property Manager signatures.
- Investigation checkboxes.
- Buyer selections regarding which investigation categories will be performed.
- A dedicated property-address field.

The body text states that a Broker will not conduct investigations checked
below by Buyer, but this BIA version does not provide required execution
checkboxes for Sections 3A through 3N.

Do not create blockers because an investigation category does not contain a
checkbox mark.

FOOTER METADATA RULE:
The form may contain zipForm, DocuSign, Authentisign, brokerage, agent,
telephone, fax, or property metadata in the footer.

Treat these as document-production metadata only.

Do not require this metadata for BIA completion.

Do not interpret footer names as Buyer signatures.

BLOCKER CODES:
Use these codes where applicable:

- BIA-WRONG-FORM
- BIA-PAGE-1-MISSING
- BIA-PAGE-2-MISSING
- BIA-PAGE-DUPLICATE
- BIA-WRONG-PAGE-ORDER
- BIA-MIXED-REVISION
- BIA-CONTENT-INCOMPLETE
- BIA-ACKNOWLEDGMENT-MISSING

- BIA-BUYER-1-SIGNATURE-MISSING
- BIA-BUYER-1-DATE-MISSING
- BIA-BUYER-2-SIGNATURE-MISSING
- BIA-BUYER-2-DATE-MISSING
- BIA-BUYER-SIGNER-MISMATCH

WARNING CODES:
Use these warning codes where applicable:

- BIA-BUYER-COUNT-UNKNOWN
- BIA-SIGNATURE-UNREADABLE
- BIA-DATE-UNREADABLE
- BIA-SIGNER-IDENTITY-UNKNOWN
- BIA-PAGE-CONTINUITY-UNCERTAIN
- BIA-MANUAL-REVIEW

VALID BLOCKER MESSAGE EXAMPLES:
- "BIA page 1 of 2 is missing"
- "BIA page 2 of 2 is missing"
- "BIA Buyer acknowledgment section is missing"
- "Buyer 1 signature missing on BIA"
- "Buyer 1 signature date missing on BIA"
- "Buyer 2 signature missing on BIA"
- "Buyer 2 signature date missing on BIA"
- "BIA signer does not match the expected Buyer"
- "Uploaded document is not C.A.R. Form BIA"

DO NOT CREATE BLOCKERS FOR:
- No signatures or initials on logical BIA page 1.
- A blank second Buyer signature line when only one Buyer is expected.
- Missing Buyer initials.
- Missing Seller signatures.
- Missing Seller initials.
- Missing broker or agent signatures.
- Missing property address.
- Missing investigation-category checkmarks.
- Missing footer brokerage or agent information.
- A signature that is clearly present but unreadable.
- A form revision different from 6/25 when the document is otherwise a valid
  older or newer BIA revision.

GENERAL RULES:
- Validate BIA only.
- Ignore FRR-PA, FHDA, BHIA, WFA, RPA, and all other forms in the packet.
- Match the schema exactly.
- Do not add, remove, rename, or rearrange fields.
- Use null when information cannot be determined reliably.
- Do not guess Buyer names, Buyer count, signatures, or dates.
- Return valid JSON only.

SCHEMA:
${JSON.stringify(BIA_VALIDATION_JSON_SCHEMA, null, 2)}
`;

export const biaValidation = {
  formType: 'BIA',
  expectedPageCount: 2,
  logicalPages: [1, 2],

  systemPrompt: BIA_SYSTEM_PROMPT,

  userPrompt: `
Validate only the complete two-page C.A.R. Buyer's Investigation Advisory,
Form BIA.

Check:

1. Correct BIA form identity.
2. Presence and order of logical BIA pages 1 and 2.
3. Consistent form revision across both pages.
4. Presence of Sections 1, 2, and 3A through 3N.
5. Presence of the Buyer acknowledgment on logical page 2.
6. Required Buyer signatures based on the expected Buyer count.
7. A corresponding date for every required Buyer signature.
8. Signer identity against expected Buyer names when transaction context is
   available.

Do not require signatures or initials on logical BIA page 1.

Do not require Buyer initials, Seller signatures, Seller initials, broker
signatures, agent signatures, investigation-category checkmarks, or a dedicated
property-address field.

Return valid JSON matching the schema exactly.
  `.trim(),

  model: 'gemini-3.1-flash-lite',
  provider: 'gemini',
} as const;
