/**
 * AVID Validation Schema — C.A.R. Form AVID (Agent Visual Inspection Disclosure)
 *
 * This file defines the comprehensive validation schema for AVID forms.
 * Unlike the extraction schema (avid.standard.v12-22.ts) which extracts raw data,
 * this schema validates the document for completeness and compliance.
 *
 * The LLM returns data matching this schema, which is then processed by
 * avid-validation.ts to produce blockers and warnings.
 */

// ─── TypeScript type for the LLM validation output ───────────────────────────

export interface AvidValidationOutput {
  form_type: 'AVID';

  form_validation: {
    is_avid: boolean;
    form_revision: string | null;
    expected_page_count: number;
    detected_logical_pages: number[];
    all_required_pages_present: boolean;
    missing_pages: number[];
    duplicate_pages: number[];
    mixed_form_revisions: boolean;
    page_order_valid: boolean;
    form_identity_status: 'valid' | 'missing_pages' | 'wrong_form' | 'mixed_revision' | 'duplicate_pages' | 'unknown';
  };

  transaction_context: {
    expected_buyers: number | null;
    expected_property_address: string | null;
    property_type: 'single_family' | 'condominium' | 'duplex' | 'triplex' | 'fourplex' | 'unknown';
    expected_bedrooms: number | null;
    expected_bathrooms: number | null;
    has_living_room: boolean | null;
    has_dining_room: boolean | null;
    has_entry: boolean | null;
    has_hall_or_stairs: boolean | null;
    has_garage_or_parking: boolean | null;
  };

  page_1: {
    page_present: boolean;
    correct_page_label: boolean;
    property_identification: {
      city: string | null;
      county: string | null;
      property_address: string | null;
      city_present: boolean;
      county_present: boolean;
      property_address_present: boolean;
      matches_transaction_address: boolean | null;
      completion_status: 'complete' | 'missing' | 'mismatch' | 'unknown';
    };
    multi_unit_information: {
      duplex_triplex_fourplex_checked: boolean;
      only_units_checked: boolean;
      only_units_text: string | null;
      applies_to_all_units: boolean | null;
      unit_selection_valid: boolean | null;
      completion_status: 'complete' | 'missing_unit_identifier' | 'not_applicable' | 'unknown';
    };
    inspecting_broker_firm: {
      firm_name: string | null;
      firm_name_present: boolean;
      completion_status: 'complete' | 'missing';
    };
    buyer_initials: {
      slot_1: {
        initials_present: boolean;
        initials_text: string | null;
        mark_type: 'handwritten' | 'electronic' | 'typed_text' | 'blank' | 'unreadable';
      };
      slot_2: {
        initials_present: boolean;
        initials_text: string | null;
        mark_type: 'handwritten' | 'electronic' | 'typed_text' | 'blank' | 'unreadable';
      };
      required_initials_count: number | null;
      missing_required_initials_count: number | null;
      completion_status: 'complete' | 'missing' | 'unknown';
    };
  };

  page_2: {
    page_present: boolean;
    correct_page_label: boolean;
    multi_unit_number: {
      unit_number: string | null;
      unit_number_required: boolean | null;
      completion_status: 'complete' | 'missing' | 'not_applicable' | 'unknown';
    };
    area_observations: {
      entry: AreaObservation;
      living_room: AreaObservation;
      dining_room: AreaObservation;
      kitchen: AreaObservation;
      other_room: AreaObservation;
      hall_stairs: AreaObservation;
      bedroom_1: RoomObservation;
      bedroom_2: RoomObservation;
      bedroom_3: RoomObservation;
      bedroom_4: RoomObservation;
      bath_1: RoomObservation;
      bath_2: RoomObservation;
      bath_3: RoomObservation;
      bath_4: RoomObservation;
      all_known_applicable_areas_completed: boolean | null;
      missing_applicable_areas: string[];
      repeated_generic_language_detected: boolean;
      quality_review_messages: string[];
    };
    buyer_initials: {
      slot_1: {
        initials_present: boolean;
        initials_text: string | null;
        mark_type: 'handwritten' | 'electronic' | 'typed_text' | 'blank' | 'unreadable';
      };
      slot_2: {
        initials_present: boolean;
        initials_text: string | null;
        mark_type: 'handwritten' | 'electronic' | 'typed_text' | 'blank' | 'unreadable';
      };
      required_initials_count: number | null;
      missing_required_initials_count: number | null;
      completion_status: 'complete' | 'missing' | 'unknown';
    };
  };

  page_3: {
    page_present: boolean;
    correct_page_label: boolean;
    multi_unit_number: {
      unit_number: string | null;
      unit_number_required: boolean | null;
      completion_status: 'complete' | 'missing' | 'not_applicable' | 'unknown';
    };
    additional_observations: {
      other_1: string | null;
      other_2: string | null;
      other_3: string | null;
      see_addendum_checked: boolean;
      referenced_addendum_present: boolean | null;
      garage_parking: AreaObservation;
      exterior_building_and_yard: {
        description: string | null;
        description_present: boolean;
        status: 'complete' | 'missing';
      };
      other_observed_or_known_conditions: string | null;
      other_conditions_field_blank: boolean;
      completion_status: 'complete' | 'missing_required_area' | 'missing_addendum' | 'unknown';
    };
    inspection_certification: {
      broker_firm_name: string | null;
      inspector_name: string | null;
      inspection_date: string | null;
      inspection_time: string | null;
      weather_conditions: string | null;
      other_persons_present: string | null;
      agent_signature_present: boolean;
      agent_signature_text: string | null;
      agent_signature_date: string | null;
      broker_firm_present: boolean;
      inspector_name_present: boolean;
      inspection_date_present: boolean;
      inspection_time_present: boolean;
      weather_conditions_present: boolean;
      agent_signature_date_present: boolean;
      certification_complete: boolean;
      completion_status: 'complete' | 'missing' | 'unknown';
    };
    buyer_acknowledgements: {
      buyer_1: BuyerAcknowledgement;
      buyer_2: BuyerAcknowledgement;
      required_signature_count: number | null;
      missing_required_signatures_count: number | null;
      missing_required_dates_count: number | null;
      completion_status: 'complete' | 'missing_signature' | 'missing_date' | 'missing_signature_and_date' | 'unknown';
    };
    optional_receipt_evidence: {
      seller_initials_present: boolean;
      non_preparing_broker_firm: string | null;
      non_preparing_broker_signature_present: boolean;
      non_preparing_broker_signature_date: string | null;
      fields_required: false;
      missing_optional_fields_create_blocker: false;
    };
  };

  cross_page_validation: {
    broker_firm_consistent: boolean | null;
    unit_information_consistent: boolean | null;
    buyer_initials_consistent: boolean | null;
    agent_signature_date_on_or_after_inspection_date: boolean | null;
    buyer_acknowledgement_dates_on_or_after_inspection_date: boolean | null;
    buyer_acknowledgement_dates_on_or_after_agent_signature_date: boolean | null;
    property_address_consistent_with_transaction: boolean | null;
    cross_page_status: 'consistent' | 'inconsistent' | 'unknown';
    inconsistency_messages: string[];
  };

  validation_summary: {
    document_complete: boolean;
    has_blocker: boolean;
    has_warning: boolean;
    blocker_codes: string[];
    blocker_messages: string[];
    warning_codes: string[];
    warning_messages: string[];
    overall_status: 'complete' | 'incomplete' | 'manual_review_required' | 'wrong_document';
  };
}

export interface AreaObservation {
  applicable: boolean | null;
  description: string | null;
  description_present: boolean;
  status: 'complete' | 'missing' | 'not_applicable' | 'unknown';
}

export interface RoomObservation {
  room_number: string | null;
  applicable: boolean | null;
  description: string | null;
  description_present: boolean;
  status: 'complete' | 'missing' | 'not_applicable' | 'unknown';
}

export interface BuyerAcknowledgement {
  signature_present: boolean;
  signature_text: string | null;
  signature_type: 'handwritten' | 'electronic' | 'typed_text' | 'blank' | 'unreadable';
  date: string | null;
  date_present: boolean;
}

// ─── JSON Schema (sent to LLM) ───────────────────────────────────────────────

export const AVID_VALIDATION_SCHEMA = {
  form_type: 'AVID',

  form_validation: {
    is_avid: '<boolean — true only when the document is identified as C.A.R. Form AVID, Agent Visual Inspection Disclosure>',
    form_revision: '<string|null — revision shown on the form, such as "6/24">',
    expected_page_count: 3,
    detected_logical_pages: '<number[] — logical AVID page numbers detected from the printed page labels>',
    all_required_pages_present: '<boolean — true only when AVID pages 1, 2, and 3 are present>',
    missing_pages: '<number[] — missing logical AVID page numbers; empty when all three pages are present>',
    duplicate_pages: '<number[] — logical page numbers appearing more than once; empty when none>',
    mixed_form_revisions: '<boolean — true when AVID pages have different revision dates>',
    page_order_valid: '<boolean — true when logical pages appear in order 1, 2, 3>',
    form_identity_status: '<"valid"|"missing_pages"|"wrong_form"|"mixed_revision"|"duplicate_pages"|"unknown">',
  },

  transaction_context: {
    expected_buyers: '<number|null — use caller-provided transaction context only>',
    expected_property_address: '<string|null — use caller-provided transaction context only>',
    property_type: '<"single_family"|"condominium"|"duplex"|"triplex"|"fourplex"|"unknown">',
    expected_bedrooms: '<number|null — use caller-provided property context when available>',
    expected_bathrooms: '<number|null — use caller-provided property context when available>',
    has_living_room: '<boolean|null>',
    has_dining_room: '<boolean|null>',
    has_entry: '<boolean|null>',
    has_hall_or_stairs: '<boolean|null>',
    has_garage_or_parking: '<boolean|null>',
  },

  page_1: {
    page_present: '<boolean>',
    correct_page_label: '<boolean — true only if the footer identifies "AVID PAGE 1 OF 3">',
    property_identification: {
      city: '<string|null>',
      county: '<string|null>',
      property_address: '<string|null>',
      city_present: '<boolean>',
      county_present: '<boolean>',
      property_address_present: '<boolean>',
      matches_transaction_address: '<boolean|null — compare with caller-provided transaction address; null when no comparison address is supplied>',
      completion_status: '<"complete"|"missing"|"mismatch"|"unknown">',
    },
    multi_unit_information: {
      duplex_triplex_fourplex_checked: '<boolean — true only if the checkbox before "This Property is a duplex, triplex, or fourplex" is visibly marked>',
      only_units_checked: '<boolean — true only if the checkbox immediately before "only unit(s)" is visibly marked>',
      only_units_text: '<string|null — unit number or unit identifiers entered after "only unit(s)">',
      applies_to_all_units: '<boolean|null — true when the property is marked as multi-unit and "only unit(s)" is not checked; null when property type cannot be determined>',
      unit_selection_valid: '<boolean|null — false when "only unit(s)" is checked but no unit identifier is entered>',
      completion_status: '<"complete"|"missing_unit_identifier"|"not_applicable"|"unknown">',
    },
    inspecting_broker_firm: {
      firm_name: '<string|null — value entered after "Inspection Performed By (Real Estate Broker Firm Name)">',
      firm_name_present: '<boolean>',
      completion_status: '<"complete"|"missing">',
    },
    buyer_initials: {
      slot_1: {
        initials_present: '<boolean>',
        initials_text: '<string|null>',
        mark_type: '<"handwritten"|"electronic"|"typed_text"|"blank"|"unreadable">',
      },
      slot_2: {
        initials_present: '<boolean>',
        initials_text: '<string|null>',
        mark_type: '<"handwritten"|"electronic"|"typed_text"|"blank"|"unreadable">',
      },
      required_initials_count: '<number|null — expected Buyer count supplied by caller; otherwise null>',
      missing_required_initials_count: '<number|null — number of required Buyer initials missing from page 1>',
      completion_status: '<"complete"|"missing"|"unknown">',
    },
  },

  page_2: {
    page_present: '<boolean>',
    correct_page_label: '<boolean — true only if the footer identifies "AVID PAGE 2 OF 3">',
    multi_unit_number: {
      unit_number: '<string|null — value entered after "this AVID is for unit #">',
      unit_number_required: '<boolean|null — true when page 1 says the AVID applies only to identified unit(s)>',
      completion_status: '<"complete"|"missing"|"not_applicable"|"unknown">',
    },
    area_observations: {
      entry: { applicable: '<boolean|null>', description: '<string|null>', description_present: '<boolean>', status: '<"complete"|"missing"|"not_applicable"|"unknown">' },
      living_room: { applicable: '<boolean|null>', description: '<string|null>', description_present: '<boolean>', status: '<"complete"|"missing"|"not_applicable"|"unknown">' },
      dining_room: { applicable: '<boolean|null>', description: '<string|null>', description_present: '<boolean>', status: '<"complete"|"missing"|"not_applicable"|"unknown">' },
      kitchen: { applicable: '<boolean|null>', description: '<string|null>', description_present: '<boolean>', status: '<"complete"|"missing"|"not_applicable"|"unknown">' },
      other_room: { applicable: '<boolean|null>', description: '<string|null>', description_present: '<boolean>', status: '<"complete"|"missing"|"not_applicable"|"unknown">' },
      hall_stairs: { applicable: '<boolean|null>', description: '<string|null>', description_present: '<boolean>', status: '<"complete"|"missing"|"not_applicable"|"unknown">' },
      bedroom_1: { room_number: '<string|null>', applicable: '<boolean|null>', description: '<string|null>', description_present: '<boolean>', status: '<"complete"|"missing"|"not_applicable"|"unknown">' },
      bedroom_2: { room_number: '<string|null>', applicable: '<boolean|null>', description: '<string|null>', description_present: '<boolean>', status: '<"complete"|"missing"|"not_applicable"|"unknown">' },
      bedroom_3: { room_number: '<string|null>', applicable: '<boolean|null>', description: '<string|null>', description_present: '<boolean>', status: '<"complete"|"missing"|"not_applicable"|"unknown">' },
      bedroom_4: { room_number: '<string|null>', applicable: '<boolean|null>', description: '<string|null>', description_present: '<boolean>', status: '<"complete"|"missing"|"not_applicable"|"unknown">' },
      bath_1: { room_number: '<string|null>', applicable: '<boolean|null>', description: '<string|null>', description_present: '<boolean>', status: '<"complete"|"missing"|"not_applicable"|"unknown">' },
      bath_2: { room_number: '<string|null>', applicable: '<boolean|null>', description: '<string|null>', description_present: '<boolean>', status: '<"complete"|"missing"|"not_applicable"|"unknown">' },
      bath_3: { room_number: '<string|null>', applicable: '<boolean|null>', description: '<string|null>', description_present: '<boolean>', status: '<"complete"|"missing"|"not_applicable"|"unknown">' },
      bath_4: { room_number: '<string|null>', applicable: '<boolean|null>', description: '<string|null>', description_present: '<boolean>', status: '<"complete"|"missing"|"not_applicable"|"unknown">' },
      all_known_applicable_areas_completed: '<boolean|null — true only when every area known to exist has a description or an explicit N/A/not accessible statement>',
      missing_applicable_areas: '<string[] — labels of applicable areas with no observation entered>',
      repeated_generic_language_detected: '<boolean — true when substantially identical generic language is repeated across many areas>',
      quality_review_messages: '<string[] — non-blocking quality observations>',
    },
    buyer_initials: {
      slot_1: { initials_present: '<boolean>', initials_text: '<string|null>', mark_type: '<"handwritten"|"electronic"|"typed_text"|"blank"|"unreadable">' },
      slot_2: { initials_present: '<boolean>', initials_text: '<string|null>', mark_type: '<"handwritten"|"electronic"|"typed_text"|"blank"|"unreadable">' },
      required_initials_count: '<number|null>',
      missing_required_initials_count: '<number|null>',
      completion_status: '<"complete"|"missing"|"unknown">',
    },
  },

  page_3: {
    page_present: '<boolean>',
    correct_page_label: '<boolean — true only if the footer identifies "AVID PAGE 3 OF 3">',
    multi_unit_number: {
      unit_number: '<string|null>',
      unit_number_required: '<boolean|null>',
      completion_status: '<"complete"|"missing"|"not_applicable"|"unknown">',
    },
    additional_observations: {
      other_1: '<string|null>',
      other_2: '<string|null>',
      other_3: '<string|null>',
      see_addendum_checked: '<boolean>',
      referenced_addendum_present: '<boolean|null — required only when "See Addendum for additional rooms/structures" is checked>',
      garage_parking: { applicable: '<boolean|null>', description: '<string|null>', description_present: '<boolean>', status: '<"complete"|"missing"|"not_applicable"|"unknown">' },
      exterior_building_and_yard: { description: '<string|null>', description_present: '<boolean>', status: '<"complete"|"missing">' },
      other_observed_or_known_conditions: '<string|null>',
      other_conditions_field_blank: '<boolean>',
      completion_status: '<"complete"|"missing_required_area"|"missing_addendum"|"unknown">',
    },
    inspection_certification: {
      broker_firm_name: '<string|null — value after "Real Estate Broker (Name of Firm that performed the inspection)">',
      inspector_name: '<string|null — value after "Inspection Performed By (Name of individual agent or broker)">',
      inspection_date: '<string|null>',
      inspection_time: '<string|null>',
      weather_conditions: '<string|null>',
      other_persons_present: '<string|null — optional; blank may mean no other person was present>',
      agent_signature_present: '<boolean — signature on the "By" line for the person who performed the inspection>',
      agent_signature_text: '<string|null>',
      agent_signature_date: '<string|null>',
      broker_firm_present: '<boolean>',
      inspector_name_present: '<boolean>',
      inspection_date_present: '<boolean>',
      inspection_time_present: '<boolean>',
      weather_conditions_present: '<boolean>',
      agent_signature_date_present: '<boolean>',
      certification_complete: '<boolean — true only when broker firm, inspector name, inspection date/time, weather, agent signature, and signature date are present>',
      completion_status: '<"complete"|"missing"|"unknown">',
    },
    buyer_acknowledgements: {
      buyer_1: { signature_present: '<boolean>', signature_text: '<string|null>', signature_type: '<"handwritten"|"electronic"|"typed_text"|"blank"|"unreadable">', date: '<string|null>', date_present: '<boolean>' },
      buyer_2: { signature_present: '<boolean>', signature_text: '<string|null>', signature_type: '<"handwritten"|"electronic"|"typed_text"|"blank"|"unreadable">', date: '<string|null>', date_present: '<boolean>' },
      required_signature_count: '<number|null — expected Buyer count supplied by caller>',
      missing_required_signatures_count: '<number|null>',
      missing_required_dates_count: '<number|null>',
      completion_status: '<"complete"|"missing_signature"|"missing_date"|"missing_signature_and_date"|"unknown">',
    },
    optional_receipt_evidence: {
      seller_initials_present: '<boolean — informational only; Seller initials are expressly not required>',
      non_preparing_broker_firm: '<string|null — firm entered after "Real Estate Broker (that did NOT fill out this AVID)">',
      non_preparing_broker_signature_present: '<boolean>',
      non_preparing_broker_signature_date: '<string|null>',
      fields_required: false,
      missing_optional_fields_create_blocker: false,
    },
  },

  cross_page_validation: {
    broker_firm_consistent: '<boolean|null — compare page 1 broker firm with page 3 inspecting broker firm>',
    unit_information_consistent: '<boolean|null — compare page 1 unit selection with the unit numbers on pages 2 and 3>',
    buyer_initials_consistent: '<boolean|null — compare visible initials across pages 1 and 2 without requiring exact OCR text when handwriting is unclear>',
    agent_signature_date_on_or_after_inspection_date: '<boolean|null>',
    buyer_acknowledgement_dates_on_or_after_inspection_date: '<boolean|null>',
    buyer_acknowledgement_dates_on_or_after_agent_signature_date: '<boolean|null>',
    property_address_consistent_with_transaction: '<boolean|null>',
    cross_page_status: '<"consistent"|"inconsistent"|"unknown">',
    inconsistency_messages: '<string[]>',
  },

  validation_summary: {
    document_complete: '<boolean>',
    has_blocker: '<boolean>',
    has_warning: '<boolean>',
    blocker_codes: '<string[]>',
    blocker_messages: '<string[]>',
    warning_codes: '<string[]>',
    warning_messages: '<string[]>',
    overall_status: '<"complete"|"incomplete"|"manual_review_required"|"wrong_document">',
  },
};

// ─── LLM Prompts ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `
ROLE:
You are a California real estate transaction coordinator and an OCR/vision
document-compliance specialist.

TASK:
Validate ONLY the Agent Visual Inspection Disclosure, C.A.R. Form AVID.

Analyze the complete logical AVID form consisting of pages 1 through 3.

Return valid JSON only. Do not return markdown, explanations, or fields that
are not in the schema.

FORM IDENTIFICATION:
The correct document is:

- AGENT VISUAL INSPECTION DISCLOSURE
- C.A.R. Form AVID
- Three logical pages
- The form revision may vary
- The uploaded PDF may contain unrelated disclosures before or after the AVID

Use the logical page labels printed on the form:

- "AVID PAGE 1 OF 3"
- "AVID PAGE 2 OF 3"
- "AVID PAGE 3 OF 3"

Do not use absolute PDF page numbers.

DOCUMENT-LEVEL VALIDATION:
A complete AVID must contain logical pages 1, 2, and 3.

Create a blocker when:

- Any required logical AVID page is missing.
- A page belongs to another form.
- Duplicate logical AVID pages replace a required page.
- Different AVID revisions are mixed in one three-page form.
- The property address clearly does not match transaction context.
- Pages from different properties or different AVID sets are combined.

Do not create a blocker merely because the AVID is embedded inside a larger
disclosure packet.

PAGE 1 — EXACT FIELDS:
Page 1 contains:

- City.
- County.
- Property description/address.
- Checkbox stating:
  "This Property is a duplex, triplex, or fourplex."
- The text:
  "This AVID form is for ALL units (or only unit(s) ___)."
- A checkbox immediately before "only unit(s)".
- "Inspection Performed By (Real Estate Broker Firm Name)".
- Buyer initials in the footer.

There is no separate checkbox for "ALL units."

When the multi-unit checkbox is marked:

- If "only unit(s)" is not checked, treat the AVID as applying to all units.
- If "only unit(s)" is checked, one or more unit identifiers must be entered.
- Do not invent an "all units checked" field.

PAGE 1 REQUIRED COMPLETION:
Create blockers for:

- Missing property address or description.
- Missing city.
- Missing county.
- Missing inspecting broker firm.
- "Only unit(s)" checked without a unit identifier.
- Missing required Buyer footer initials when expected Buyer count is known.

PAGE 1 does not contain Seller initials or full Buyer signatures.

PAGE 2 — EXACT OBSERVATION LABELS:
Page 2 contains:

- Unit number line for a duplex, triplex, or fourplex.
- Entry, excluding common areas.
- Living Room.
- Dining Room.
- Kitchen.
- Other Room.
- Hall/Stairs, excluding common areas.
- Four available Bedroom number and observation areas.
- Four available Bath number and observation areas.
- Buyer initials in the footer.

PAGE 2 OBSERVATION RULE:
The purpose is to document what the inspecting agent visually observed in
reasonably and normally accessible areas.

For an area known to exist, accept:

- A description of observed conditions.
- "Nothing noted."
- "No visible issues noted."
- "Good condition."
- "Not accessible," with a reason.
- "N/A" or "Not applicable" when the area does not exist.

Do not require every printed room slot to be completed.

Examples:

- A three-bedroom property does not require Bedroom 4.
- A two-bath property does not require Bath 3 or Bath 4.
- A property without a separate dining room does not require a dining-room
  observation if caller context confirms it does not exist.

Use expected bedroom, bathroom, and room information supplied by transaction
context.

If property context is unavailable:

- Do not guess how many rooms exist.
- Treat unexplained blank primary areas as warnings requiring manual review.
- Do not automatically create a blocker for every blank printed line.

Create blockers for known applicable areas that are completely blank.

Do not treat descriptive phrases such as "LVT flooring, nothing else noted" or
"property in good condition" as missing merely because they are brief.

Repeated generic language across many areas may create a quality warning, but
not automatically a blocker.

PAGE 2 BUYER INITIALS:
Page 2 contains Buyer initials only.

- Use expected Buyer count supplied in transaction context.
- Only the first N initials slots are required when expected Buyer count is N.
- Missing required Buyer initials create a blocker.
- An unused second initials slot is not missing when only one Buyer exists.
- Do not search for Seller initials on page 2.

PAGE 3 — EXACT OBSERVATION FIELDS:
Page 3 contains:

- Unit number line for a duplex, triplex, or fourplex.
- Three "Other" observation areas.
- "See Addendum for additional rooms/structures" checkbox.
- "Garage/Parking (excluding common areas)".
- "Exterior Building and Yard - Front/Sides/Back".
- "Other Observed or Known Conditions Not Specified Above".

The three "Other" fields are optional unless they represent actual rooms or
structures that were inspected.

The "Other Observed or Known Conditions Not Specified Above" field may be blank
when the agent has no other condition to disclose. A blank field alone is not
a blocker.

If "See Addendum for additional rooms/structures" is checked:

- An AVID addendum or clearly identified continuation must be present.
- Missing referenced addendum creates a blocker.

GARAGE AND EXTERIOR:
- Garage/Parking is required when the property has a garage or parking area
  that was reasonably accessible.
- Exterior Building and Yard is a principal inspection area and should contain
  an observation or an explanation that it was not reasonably accessible.
- A blank known-applicable garage or exterior area creates a blocker.

PAGE 3 — INSPECTION CERTIFICATION:
The exact fields are:

- "Real Estate Broker (Name of Firm that performed the inspection)"
- "Inspection Performed By (Name of individual agent or broker)"
- "Inspection Date/Time"
- "Weather conditions"
- "Other persons present"
- "By"
- "Date"
- "(Signature of Associate Licensee or Broker who performed the inspection)"

Require:

- Broker firm name.
- Individual inspector name.
- Inspection date.
- Inspection time.
- Weather conditions.
- Inspecting agent or broker signature.
- Signature date.

"Other persons present" is optional. A blank value may mean nobody else was
present.

Create blockers for missing required inspection-certification fields.

Do not count a typed inspector name by itself as the agent signature unless it
is visibly inside an electronic signature field.

PAGE 3 — BUYER ACKNOWLEDGMENT:
The exact text is:

"I/we acknowledge that I/we have read, understand and received a copy of this
disclosure."

The page provides two Buyer signature and date lines.

For each expected Buyer, require:

- Buyer signature.
- Date associated with that signature.

Use expected Buyer count from transaction context.

Create a separate blocker for:

- Missing Buyer signature.
- Missing date next to a Buyer signature.
- A date entered without a signature.
- A signature entered without a date.

PAGE 3 — OPTIONAL RECEIPT EVIDENCE:
The form states:

"The initials below and Broker signature are not required but can be used as
evidence that the initialing or signing party has received the completed form."

The optional fields are:

- Seller initials.
- Real Estate Broker that did NOT fill out the AVID.
- Signature and date of that broker or associate licensee.

These fields are expressly optional.

Do not create blockers for:

- Missing Seller initials on page 3.
- Missing signature of the broker that did not prepare the AVID.
- Missing date for the broker that did not prepare the AVID.
- Missing name of the non-preparing broker.

SIGNATURE AND INITIAL DETECTION:
Valid execution marks include:

- Handwritten signatures or initials.
- Drawn signatures or initials.
- DocuSign or Authentisign signatures or initials.
- Electronic signatures or initials inside designated fields.
- Typed-looking characters clearly contained within an electronic-signature
  field.

Do not count:

- Empty signature borders.
- DocuSign completion checkmarks outside the field.
- Envelope IDs.
- Printed labels.
- Printed names outside signature fields.
- X marks belonging to checkboxes.
- Scan noise or form lines.

When a deliberate mark is present but unreadable:

- Treat it as present.
- Set text to null.
- Set mark type to "unreadable".

MULTIPLE BUYER RULE:
- Do not infer Buyer count from the number of printed lines.
- Use expected Buyer count supplied by transaction context.
- Only the first N Buyer fields are required.
- If expected Buyer count is unknown, visually report each field but set
  required-count-dependent results to null or "unknown".
- Do not create a confirmed missing-Buyer blocker when Buyer count is unknown.

CROSS-PAGE BROKER VALIDATION:
The broker firm entered on page 1 under:

"Inspection Performed By (Real Estate Broker Firm Name)"

should match the broker firm entered on page 3 under:

"Real Estate Broker (Name of Firm that performed the inspection)."

Ignore harmless formatting differences such as:

- Capitalization.
- Punctuation.
- "Inc.", "LLC", or spacing variations.
- Minor OCR errors.

A clearly different brokerage creates a manual-review blocker.

MULTI-UNIT CONSISTENCY:
When the AVID applies only to specified units:

- The page 1 unit identifier must be present.
- Page 2 and page 3 unit identifiers must be present.
- Unit identifiers should be consistent across pages.

When the AVID applies to all units:

- Page 2 and page 3 unit-number fields may be blank.
- Do not create a blocker solely because those fields are blank.

DATE CHRONOLOGY:
When dates are legible:

- Agent signature date must be the same as or later than the inspection date.
- Buyer acknowledgment dates must be the same as or later than the inspection
  date.
- Buyer acknowledgment should not predate completion and signature of the
  inspecting agent.

Create a blocker for a clearly impossible chronology.

Do not guess dates that are unreadable.

BLOCKER CODES:
Use concise blocker codes, including where applicable:

- AVID-WRONG-FORM
- AVID-PAGE-MISSING
- AVID-PAGE-DUPLICATE
- AVID-MIXED-REVISION
- AVID-PROPERTY-MISSING
- AVID-PROPERTY-MISMATCH
- AVID-BROKER-FIRM-MISSING
- AVID-BROKER-FIRM-MISMATCH
- AVID-UNIT-NUMBER-MISSING
- AVID-UNIT-NUMBER-MISMATCH
- AVID-P1-BUYER-INITIALS-MISSING
- AVID-P2-BUYER-INITIALS-MISSING
- AVID-AREA-OBSERVATION-MISSING
- AVID-ADDENDUM-MISSING
- AVID-INSPECTOR-NAME-MISSING
- AVID-INSPECTION-DATE-MISSING
- AVID-INSPECTION-TIME-MISSING
- AVID-WEATHER-MISSING
- AVID-AGENT-SIGNATURE-MISSING
- AVID-AGENT-SIGNATURE-DATE-MISSING
- AVID-BUYER-SIGNATURE-MISSING
- AVID-BUYER-SIGNATURE-DATE-MISSING
- AVID-DATE-CHRONOLOGY-INVALID

WARNING CODES:
Use warnings, not blockers, for:

- AVID-GENERIC-OBSERVATIONS
- AVID-APPLICABLE-AREA-UNKNOWN
- AVID-OTHER-CONDITIONS-BLANK
- AVID-ROOM-COUNT-UNKNOWN
- AVID-DATE-UNREADABLE
- AVID-INITIALS-UNREADABLE
- AVID-MANUAL-REVIEW

Do not create a warning merely because an optional Seller or non-preparing
broker receipt field is blank.

GENERAL RULES:
- Validate AVID only.
- Ignore SPQ, TDS, SBSA, MCA, WCMD, SFLS, and other disclosure forms.
- Match the schema exactly.
- Do not add, rename, remove, or rearrange fields.
- Use null when information cannot be determined reliably.
- Do not guess names, dates, initials, signatures, room counts, or unit numbers.
- Return valid JSON only.

SCHEMA:
${JSON.stringify(AVID_VALIDATION_SCHEMA, null, 2)}
`;

const USER_PROMPT = `
Validate only the complete three-page C.A.R. Agent Visual Inspection
Disclosure, Form AVID.

Check:

1. Form identity and presence of AVID pages 1, 2, and 3.
2. Property and broker information on page 1.
3. Buyer footer initials on pages 1 and 2.
4. Applicable room and area observations on pages 2 and 3.
5. Multi-unit and unit-number consistency.
6. Inspection firm, inspector, date, time, weather, agent signature, and
   signature date on page 3.
7. Required Buyer acknowledgment signatures and dates on page 3.
8. Cross-page broker, unit, property, and date consistency.

Do not require Seller initials or the signature of the broker who did not
prepare the AVID. Those page 3 fields are optional.

Return valid JSON matching the schema exactly.
`.trim();

// ─── Exported config ──────────────────────────────────────────────────────────

export const avidValidation = {
  formType: 'AVID',
  expectedPageCount: 3,
  logicalPages: [1, 2, 3] as const,

  systemPrompt: SYSTEM_PROMPT,
  userPrompt: USER_PROMPT,

  model: 'gemini-3.1-flash-lite',
  provider: 'gemini' as const,
} as const;
