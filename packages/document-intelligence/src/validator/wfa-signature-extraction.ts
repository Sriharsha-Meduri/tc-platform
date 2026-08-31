/**
 * WFA Signature Extraction Prompt System
 *
 * Provides the LLM prompt and JSON schema for extracting detailed signature
 * field observations from C.A.R. Form WFA (Wire Fraud Advisory).
 *
 * This extraction is more granular than the validation extraction because
 * it captures spatial alignment, confidence scores, and unassigned marks
 * that help the validator avoid false positive missing-signature blockers.
 */

import type { PageDefinition } from '../extractor/forms/wfa/../../forms/form-definition';

// ─── JSON Schema for Structured Output ────────────────────────────────────────

const SIGNATURE_FIELD_OBSERVATION_SCHEMA = {
  fieldId: '<string>',
  role: '<"buyer_tenant"|"seller_housing_provider">',
  slotNumber: '<1|2>',
  printedLabel: '<"Buyer/Tenant"|"Seller/Housing Provider">',
  signatureMarkPresent: '<boolean>',
  signatureMarkType: '<"handwritten"|"electronic"|"typed_electronic_signature"|"blank"|"unreadable">',
  signerName: '<string|null>',
  signerNameSource: '<"signature_mark"|"electronic_signature_block"|"typed_name_inside_signature_field"|"printed_form_text"|"footer_metadata"|"unknown">',
  datePresent: '<boolean>',
  dateText: '<string|null>',
  dateAssociatedWithThisField: '<boolean — true only when the date belongs to this same horizontal signature field>',
  fieldAlignment: '<"inside_field"|"overlaps_field"|"between_fields"|"closer_to_adjacent_field"|"outside_execution_area"|"unknown">',
  overlapsAdjacentField: '<boolean>',
  adjacentFieldId: '<string|null>',
  isPrintedMetadataOnly: '<boolean — true when the detected name or date comes only from footer or document metadata>',
  confidence: '<number from 0 to 1>',
  requiresManualReview: '<boolean>',
  manualReviewReason: '<string|null>',
  visualEvidence: '<string — concise description of what is visually present and where>',
};

const UNASSIGNED_EXECUTION_MARK_SCHEMA = {
  signerName: '<string|null>',
  dateText: '<string|null>',
  visualEvidence: '<string>',
  nearestFieldId: '<string|null>',
  confidence: '<number from 0 to 1>',
};

export const WFA_SIGNATURE_EXTRACTION_SCHEMA = {
  formType: 'WFA',
  formValidation: {
    isWfa: '<boolean>',
    correctPageLabel: '<boolean>',
    pageComplete: '<boolean>',
  },
  fields: [SIGNATURE_FIELD_OBSERVATION_SCHEMA],
  unassignedExecutionMarks: [UNASSIGNED_EXECUTION_MARK_SCHEMA],
  extractionWarnings: ['<string>'],
};

// ─── System Prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `
ROLE:
You are a California real estate transaction coordinator and an OCR/vision
signature-location specialist.

TASK:
Analyze only the execution section of the one-page C.A.R. Wire Fraud and
Electronic Funds Transfer Advisory, Form WFA.

Extract visual evidence for all four printed signature fields.

Do not decide whether the transaction passes validation.
Do not create blockers.
Only identify what is visually present in each designated signature field.

Return valid JSON only.

EXPECTED WFA EXECUTION FIELDS:
The bottom acknowledgment section contains exactly four signature-and-date
rows:

1. Buyer/Tenant slot 1
2. Buyer/Tenant slot 2
3. Seller/Housing Provider slot 1
4. Seller/Housing Provider slot 2

Use these exact field IDs:

- buyer_tenant_1
- buyer_tenant_2
- seller_housing_provider_1
- seller_housing_provider_2

FIELD-BOUNDARY REVIEW — CRITICAL:
First identify the printed horizontal signature lines and their printed role
labels.

Then independently locate every visible:

- Handwritten signature.
- Electronic signature.
- Typed electronic signer name.
- Electronic signature border.
- Signature date.
- Electronic signing stamp.

Assign a mark to a field based primarily on:

1. Which printed signature line it occupies.
2. Which date field is on the same horizontal row.
3. The center point of the signature mark relative to the printed field.
4. Whether the mark is inside a visible electronic-signature box.
5. Whether the mark overlaps another row because of electronic-field
   misalignment.

Do not assign a signature based only on OCR reading order.

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
A Buyer/Tenant electronic signature block may extend downward into the first
Seller/Housing Provider row. The typed Buyer name must not be counted as a
separate Seller signature merely because the text appears near the Seller
line.

SIGNATURE MARK RULE:
signatureMarkPresent is true only when a deliberate signature execution mark
is visible in or overlapping the designated field.

Valid marks include:

- Handwritten signatures.
- Drawn signatures.
- DocuSign signatures.
- Authentisign signatures.
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

Use "typed_name_inside_signature_field" only when the typed name is clearly
inside the designated execution field.

Use "footer_metadata" when the name appears only in generated footer metadata.

Footer metadata does not constitute a signature.

DATE ASSOCIATION RULE:
A date belongs to a signature only when it is:

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
Set signatureMarkPresent to false only when:

- The designated field is visibly blank; and
- No signature mark overlaps that field; and
- No unassigned execution mark could reasonably belong to that field.

If an execution mark is between two fields and cannot be assigned reliably:

- Do not guess.
- Add it to unassignedExecutionMarks.
- Set requiresManualReview to true for the affected fields.
- Explain the uncertainty.

CONFIDENCE RULE:
Use:

- 0.90–1.00: clear signature and date placement.
- 0.70–0.89: likely assignment with minor overlap.
- 0.40–0.69: ambiguous assignment requiring manual review.
- Below 0.40: do not assign the mark; place it in unassignedExecutionMarks.

VISUAL EVIDENCE RULE:
For each field, briefly describe:

- Whether a signature mark is visible.
- Its approximate position relative to the printed line.
- Whether a date is present on the same row.
- Whether it overlaps another field.
- Whether detected text is execution content or metadata.

GENERAL RULES:
- Return exactly four field observations.
- Match the schema exactly.
- Do not infer expected party counts.
- Do not create missing-signature blockers.
- Do not count footer metadata as execution.
- Do not duplicate one signature across multiple fields.
- One execution mark can be assigned to only one field.
- Return valid JSON only.

SCHEMA:
${JSON.stringify(WFA_SIGNATURE_EXTRACTION_SCHEMA, null, 2)}
`;

// ─── User Prompt ──────────────────────────────────────────────────────────────

const USER_PROMPT = `
Analyze the execution section of the one-page C.A.R. Wire Fraud and Electronic
Funds Transfer Advisory, Form WFA.

Extract detailed visual evidence for each of the four signature fields:

1. buyer_tenant_1
2. buyer_tenant_2
3. seller_housing_provider_1
4. seller_housing_provider_2

For each field, identify:
- Whether a signature mark is present
- The type of signature mark
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
 * WFA signature extraction page definition for use with the form extractor.
 *
 * Uses gemini-3.1-flash-lite for detailed visual analysis of signature fields.
 */
export const wfaSignatureExtraction: PageDefinition = {
  pageNumber: 1,
  systemPrompt: SYSTEM_PROMPT,
  userPrompt: USER_PROMPT,
  model: 'gemini-3.1-flash-lite',
  provider: 'gemini',
};

// ─── Schema Validation Helper ─────────────────────────────────────────────────

/**
 * Type guard to check if a raw object matches the WFA signature extraction schema.
 */
export function isWfaSignatureExtraction(
  data: Record<string, unknown>,
): data is import('./disclosure-signature-extraction').WfaSignatureExtraction & Record<string, unknown> {
  return (
    data.formType === 'WFA' &&
    typeof data.formValidation === 'object' &&
    data.formValidation !== null &&
    Array.isArray(data.fields) &&
    data.fields.length === 4 &&
    Array.isArray(data.unassignedExecutionMarks)
  );
}
