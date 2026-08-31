/**
 * Shared schema fragment + prompt instructions for every RPA "initials zone"
 * (the footer on pages 4-15, plus the Liquidated Damages / Arbitration
 * paragraphs on page 15).
 *
 * Why this exists: each page file used to hand-write its own copy of this
 * block. Page 4's copy never received fixes the others did and silently
 * drifted into a worse prompt that under-reports real initials. Importing
 * from one place means a fix here reaches every page and can't drift again.
 *
 * Classification is strictly binary: a slot is either `initials_present` or
 * it is not — there is no uncertain/manual-review state. A slot is only
 * reported missing when it is visibly, clearly blank.
 */

/** One Buyer or Seller initials slot (e.g. buyer_initials.slot_1). */
export function initialsSlotSchema(zoneLabel: string, role: 'Buyer' | 'Seller', slotOrdinal: 'first' | 'second'): Record<string, string> {
  return {
    initials_present:
      `<boolean — true if ANY deliberate mark (handwritten or electronic) is present inside, on, or directly adjacent to the ${slotOrdinal} designated ${role} initials field in ${zoneLabel}, including marks that are faint, small, unreadable, or duplicated from an adjacent slot. false ONLY when the field is clearly, visibly blank.>`,
    initials_text:
      '<string|null — initials exactly as visible; null when blank, unreadable, or the mark cannot be transcribed>',
    mark_type:
      '<"handwritten"|"electronic"|"unreadable"|"none" — "unreadable" when a mark is clearly present but its letters cannot be read; "none" only when initials_present is false>',
    visual_evidence:
      `<string — one concise sentence describing exactly what is visible in the ${role} ${slotOrdinal} slot and where, e.g. "blue ink initials directly on the underline, left of the slash" or "underline is empty, no ink or electronic stamp visible">`,
  };
}

/** buyer_initials or seller_initials group: two slots + required-count rollup. */
export function initialsGroupSchema(zoneLabel: string, role: 'Buyer' | 'Seller'): Record<string, unknown> {
  return {
    row_description:
      `<string — BEFORE judging either slot, describe the ENTIRE "${role}'s Initials ___/___" line in ${zoneLabel} as one sentence covering BOTH sides of the slash, e.g. "both sides of the slash have blue ink initials" or "left side has ink, right side is empty" or "both sides are empty underlines". Fill this in first, then use it to answer slot_1 and slot_2 below — a mark you already described as present on one side must not later be reported as initials_present: false for that slot.>`,
    slot_1: initialsSlotSchema(zoneLabel, role, 'first'),
    slot_2: initialsSlotSchema(zoneLabel, role, 'second'),
    initials_present_count:
      `<number — count of ${role} initial slots in ${zoneLabel} with initials_present = true>`,
    required_initials_count:
      `<number|null — expected ${role} count supplied by the caller; otherwise null>`,
    missing_required_initials_count:
      '<number|null — required_initials_count minus the count of required slots with initials_present = true; minimum 0; null when required_initials_count is unknown>',
    completion_status:
      '<"complete"|"missing"|"unknown" — "complete" when every required slot has initials_present = true; "missing" when at least one required slot is clearly blank; "unknown" when the required count is unavailable>',
  };
}

/** Full buyer_initials + seller_initials schema fragment for one zone. */
export function initialsZoneSchema(zoneLabel: string): Record<string, unknown> {
  return {
    buyer_initials: initialsGroupSchema(zoneLabel, 'Buyer'),
    seller_initials: initialsGroupSchema(zoneLabel, 'Seller'),
  };
}

/**
 * Canonical ROLE/TASK/RULES system prompt for footer-initials extraction,
 * shared by every RPA page/zone that inspects Buyer and Seller initials.
 *
 * `taskLabel` describes what to analyze, e.g. "RPA page 6" or "RPA page 15".
 */
export function footerInitialsSystemPrompt(taskLabel: string): string {
  return `ROLE: You are a California real estate transaction coordinator and document-vision expert.

TASK: Analyze logical ${taskLabel} and determine whether the required Buyer and Seller footer initials are present.

RULES:

Inspect only the designated Buyer and Seller initials fields in the page footer.
Buyer initials are separated by a slash:
The initials on the left side of the slash are Buyer Slot 1.
The initials on the right side of the slash are Buyer Slot 2.
Seller initials follow the same structure:
The initials on the left side of the slash are Seller Slot 1.
The initials on the right side of the slash are Seller Slot 2.
Set initials_present = true when any visible ink, initials, signature mark, or electronic signature tag (including DocuSign or zipLogix) is present in or near the corresponding slot line.
Use visual position and footer-field geometry as the primary source of truth, not OCR text order.
Do not treat the slash itself, printed labels, footer text, page numbers, envelope IDs, or scan artifacts as initials.
Mark a slot as missing only when the designated initials area is clearly blank.
Evaluate all four slots independently.

Before answering, look at the entire "Buyer's Initials ___/___" line and the
entire "Seller's Initials ___/___" line as whole units, left side and right
side together, and write that down as row_description first. Then use that
same observation to answer slot_1 and slot_2 — if row_description says a mark
is present on a side, initials_present for that side must be true, and vice
versa. Do not re-examine only slot_1 carefully and then guess slot_2 from
memory: give both sides of every slash the same level of scrutiny. Slot 2
(the right side, for both Buyer and Seller) sits closer to the edge of the
footer and can be smaller, fainter, or lower-contrast in the image — that is
not a reason to default it to blank. Zoom in mentally on the right side of
the slash exactly as you would the left side before concluding it is empty.`;
}
