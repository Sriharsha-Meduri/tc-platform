/**
 * AVID Execution Extraction Prompt System
 *
 * Provides the LLM prompt and JSON schema for extracting detailed signature
 * and initial field observations from C.A.R. Form AVID (Agent Visual
 * Inspection Disclosure).
 *
 * This extraction is more granular than the validation extraction because
 * it captures spatial alignment, confidence scores, and unassigned marks
 * that help the validator avoid false positive missing-signature blockers.
 *
 * AVID has 3 pages with 5 execution zones:
 * - Page 1: Buyer initials (2 slots) — top of form
 * - Page 2: Buyer initials (2 slots) — top of form
 * - Page 3: Inspecting agent signature + date — certification section
 * - Page 3: Buyer acknowledgement signatures + dates (2 slots) — bottom
 * - Page 3: Optional receipt evidence — may be blank, must NOT generate blockers
 */

import type { PageDefinition } from '../extractor/forms/avid/../../forms/form-definition';

// ─── JSON Schema for Structured Output ────────────────────────────────────────

const AVID_EXECUTION_FIELD_OBSERVATION_SCHEMA = {
  fieldId: '<string — e.g., p1_buyer_initials_1, p3_agent_signature, p3_buyer_acknowledgement_1>',
  zone: '<"page_1_buyer_initials"|"page_2_buyer_initials"|"page_3_agent_signature"|"page_3_buyer_acknowledgement"|"page_3_receipt_evidence">',
  pageNumber: '<1|2|3>',
  slotNumber: '<number — 1-indexed within the zone>',
  printedLabel: '<string — the printed label next to this field>',
  markPresent: '<boolean>',
  markType: '<"handwritten"|"electronic"|"typed_initials"|"typed_electronic_signature"|"blank"|"unreadable">',
  signerName: '<string|null>',
  signerNameSource: '<"signature_mark"|"electronic_signature_block"|"typed_name_inside_field"|"printed_form_text"|"footer_metadata"|"unknown">',
  datePresent: '<boolean>',
  dateText: '<string|null>',
  dateAssociatedWithThisField: '<boolean — true only when the date belongs to this same field>',
  fieldAlignment: '<"inside_field"|"overlaps_field"|"between_fields"|"closer_to_adjacent_field"|"outside_execution_area"|"unknown">',
  overlapsAdjacentField: '<boolean>',
  adjacentFieldId: '<string|null>',
  isPrintedMetadataOnly: '<boolean — true when the detected name or date comes only from footer or document metadata>',
  confidence: '<number from 0 to 1>',
  requiresManualReview: '<boolean>',
  manualReviewReason: '<string|null>',
  visualEvidence: '<string — concise description of what is visually present and where>',
  isOptional: '<boolean — true for receipt evidence field>',
};

const AVID_UNASSIGNED_EXECUTION_MARK_SCHEMA = {
  signerName: '<string|null>',
  dateText: '<string|null>',
  visualEvidence: '<string>',
  nearestFieldId: '<string|null>',
  confidence: '<number from 0 to 1>',
  zone: '<"page_1_buyer_initials"|"page_2_buyer_initials"|"page_3_agent_signature"|"page_3_buyer_acknowledgement"|"page_3_receipt_evidence">',
};

export const AVID_EXECUTION_EXTRACTION_SCHEMA = {
  formType: 'AVID',
  formValidation: {
    isAvid: '<boolean>',
    formRevision: '<string|null>',
    allPagesPresent: '<boolean>',
    detectedPageCount: '<number>',
  },
  fields: [AVID_EXECUTION_FIELD_OBSERVATION_SCHEMA],
  unassignedExecutionMarks: [AVID_UNASSIGNED_EXECUTION_MARK_SCHEMA],
  extractionWarnings: ['<string>'],
};

// ─── System Prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `
ROLE:
You are a California real estate transaction coordinator and an OCR/vision
signature-location specialist.

TASK:
Analyze the execution section of the three-page C.A.R. Agent Visual
Inspection Disclosure, Form AVID.

Extract visual evidence for all execution fields across all three pages.

Do not decide whether the transaction passes validation.
Do not create blockers.
Only identify what is visually present in each designated execution field.

Return valid JSON only.

EXPECTED AVID EXECUTION FIELDS:
The AVID form has 3 pages with 5 execution zones containing 7 fields total:

PAGE 1 — BUYER INITIALS (2 slots):
- p1_buyer_initials_1
- p1_buyer_initials_2

PAGE 2 — BUYER INITIALS (2 slots):
- p2_buyer_initials_1
- p2_buyer_initials_2

PAGE 3 — AGENT SIGNATURE (1 field):
- p3_agent_signature

PAGE 3 — BUYER ACKNOWLEDGEMENTS (2 slots):
- p3_buyer_acknowledgement_1
- p3_buyer_acknowledgement_2

PAGE 3 — RECEIPT EVIDENCE (optional, 1 field):
- p3_receipt_evidence

FIELD-BOUNDARY REVIEW — CRITICAL:
First identify the printed signature/initial lines and their printed role
labels on each page.

Then independently locate every visible:
- Handwritten signature or initials.
- Electronic signature or initials.
- Typed electronic signer name.
- Electronic signature border.
- Signature/initial date.
- Electronic signing stamp.

Assign a mark to a field based primarily on:
1. Which printed signature/initial line it occupies.
2. Which date field is on the same horizontal row.
3. The center point of the mark relative to the printed field.
4. Whether the mark is inside a visible electronic-signature box.
5. Whether the mark overlaps another row because of electronic-field
   misalignment.

Do not assign a mark based only on OCR reading order.

ELECTRONIC FIELD MISALIGNMENT RULE:
Electronic signature blocks may be shifted vertically and can overlap the next
printed signature row.

When this happens:
- Do not automatically treat the overlapping typed name as a signature for the
  adjacent row.
- Determine which electronic signature box, signature mark, and date belong
  together.
- Use the electronic field border and horizontal alignment as primary evidence.
- Set overlapsAdjacentField to true.
- Identify the adjacent field.
- Set requiresManualReview to true when assignment remains uncertain.
- Describe the ambiguity in manualReviewReason.

Example:
A Buyer initials electronic signature block may extend downward into the
Buyer Acknowledgement section. The typed Buyer name must not be counted as
a separate acknowledgement signature merely because the text appears near
the acknowledgement line.

SIGNATURE/INITIAL MARK RULE:
markPresent is true only when a deliberate execution mark is visible in or
overlapping the designated field.

Valid marks include:
- Handwritten signatures or initials.
- Drawn signatures or initials.
- DocuSign signatures or initials.
- Authentisign signatures or initials.
- Typed-looking names contained inside a clear electronic signature field.

Do not count:
- A printed party name outside an electronic signature field.
- Footer transaction metadata.
- Brokerage names.
- Agent names.
- DocuSign Envelope IDs.
- Authentisign IDs.
- Completion checkmarks outside the signature field.
- A date by itself.
- A blank electronic border.
- Printed role labels.
- Scan noise or form lines.

SIGNER NAME SOURCE RULE:
Classify the signer-name source carefully.

Use "electronic_signature_block" when the name is visually part of a DocuSign,
Authentisign, or similar execution block.

Use "typed_name_inside_field" only when the typed name is clearly inside the
designated execution field.

Use "footer_metadata" when the name appears only in generated footer metadata.

Footer metadata does not constitute a signature.

DATE ASSOCIATION RULE:
A date belongs to a signature/initial only when it is:
- On the same printed horizontal row; or
- Inside the same electronic signature block; or
- Visually connected to the same signer field.

Do not:
- Use the form review date.
- Use the DocuSign Envelope date.
- Use an Authentisign transaction date outside the execution field.
- Use one signer's date for another signer.
- Move a date to an adjacent row merely because the expected row is blank.

BLANK FIELD RULE:
Set markPresent to false only when:
- The designated field is visibly blank; and
- No signature/initial mark overlaps that field; and
- No unassigned execution mark could reasonably belong to that field.

If an execution mark is between two fields and cannot be assigned reliably:
- Do not guess.
- Add it to unassignedExecutionMarks.
- Set requiresManualReview to true for the affected fields.
- Explain the uncertainty.

OPTIONAL FIELD RULE — RECEIPT EVIDENCE:
The p3_receipt_evidence field is OPTIONAL. It may be blank without triggering
any blocker or warning. Set isOptional to true for this field.

A blank receipt evidence field is NOT a missing signature.
Do not create a missing-signature blocker for p3_receipt_evidence.

CONFIDENCE RULE:
Use:
- 0.90–1.00: clear signature/initial and date placement.
- 0.70–0.89: likely assignment with minor overlap.
- 0.40–0.69: ambiguous assignment requiring manual review.
- Below 0.40: do not assign the mark; place it in unassignedExecutionMarks.

VISUAL EVIDENCE RULE:
For each field, briefly describe:
- Whether a signature/initial mark is visible.
- Its approximate position relative to the printed line.
- Whether a date is present on the same row.
- Whether it overlaps another field.
- Whether detected text is execution content or metadata.

GENERAL RULES:
- Return exactly 7 field observations (one per field listed above).
- Match the schema exactly.
- Do not infer expected party counts.
- Do not create missing-signature blockers.
- Do not count footer metadata as execution.
- Do not duplicate one signature/initial across multiple fields.
- One execution mark can be assigned to only one field.
- Receipt evidence is optional — blank is acceptable.
- Return valid JSON only.

SCHEMA:
${JSON.stringify(AVID_EXECUTION_EXTRACTION_SCHEMA, null, 2)}
`;

// ─── User Prompt ──────────────────────────────────────────────────────────────

const USER_PROMPT = `
Analyze the execution sections of the three-page C.A.R. Agent Visual
Inspection Disclosure, Form AVID.

Extract detailed visual evidence for each of the 7 execution fields:

PAGE 1:
1. p1_buyer_initials_1
2. p1_buyer_initials_2

PAGE 2:
3. p2_buyer_initials_1
4. p2_buyer_initials_2

PAGE 3:
5. p3_agent_signature
6. p3_buyer_acknowledgement_1
7. p3_buyer_acknowledgement_2
8. p3_receipt_evidence (OPTIONAL — blank is acceptable)

For each field, identify:
- Whether a signature/initial mark is present
- The type of mark
- The signer name (if readable)
- Whether a date is present and associated with this field
- The spatial alignment relative to the printed field
- Whether it overlaps an adjacent field
- Confidence level for the observation

Also identify any unassigned execution marks that could not be reliably
assigned to a specific field.

Return valid JSON matching the schema exactly.
`;

// ─── Page Definition Export ───────────────────────────────────────────────────

/**
 * AVID execution extraction page definitions for use with the form extractor.
 *
 * Uses gemini-3.1-flash-lite for detailed visual analysis of signature and initial
 * fields across all 3 pages.
 */
export const avidExecutionExtractionPages: PageDefinition[] = [
  {
    pageNumber: 1,
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: USER_PROMPT,
    model: 'gemini-3.1-flash-lite',
    provider: 'gemini',
  },
  {
    pageNumber: 2,
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: USER_PROMPT,
    model: 'gemini-3.1-flash-lite',
    provider: 'gemini',
  },
  {
    pageNumber: 3,
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: USER_PROMPT,
    model: 'gemini-3.1-flash-lite',
    provider: 'gemini',
  },
];

// ─── Schema Validation Helper ─────────────────────────────────────────────────

/**
 * Type guard to check if a raw object matches the AVID execution extraction schema.
 */
export function isAvidExecutionExtraction(
  data: Record<string, unknown>,
): data is import('./avid-execution-extraction').AvidExecutionExtraction & Record<string, unknown> {
  return (
    data.formType === 'AVID' &&
    typeof data.formValidation === 'object' &&
    data.formValidation !== null &&
    Array.isArray(data.fields) &&
    data.fields.length === 8 &&
    Array.isArray(data.unassignedExecutionMarks)
  );
}
