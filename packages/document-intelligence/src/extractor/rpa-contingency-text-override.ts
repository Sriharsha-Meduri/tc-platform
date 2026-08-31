/**
 * Deterministic contingency-override correction for RPA page 2.
 *
 * The C.A.R. RPA prints each contingency row with a default day count plus a
 * "(or ____)" override blank (Section 3L). Vision LLMs sometimes return the
 * printed default even when a typed value sits in the blank — the loan
 * contingency on the 626 Chino RPA was extracted as "17" when the override
 * blank actually contained "9".
 *
 * Typed values inside the blank are emitted as positioned text glyphs in the
 * PDF text layer (pdfjs getTextContent). This module reads that layer and,
 * when a digit is found horizontally between a "17 (or" marker and the
 * closing ") Days" run on the same baseline, reports it as the authoritative
 * override. Handwritten overrides never appear in the text layer, so they are
 * left to the vision LLM — this only corrects typed values, never guesses.
 */

export interface RpaContingencyTextOverrides {
  loan_days?: number;
  appraisal_days?: number;
  investigation_days?: number;
  informational_access_days?: number;
  insurance_days?: number;
  seller_document_days?: number;
  preliminary_title_report_days?: number;
  common_interest_disclosures_days?: number;
  review_leased_liened_items_days?: number;
}

interface TextItem {
  str: string;
  x: number;
  y: number;
  w: number;
}

interface RowSpec {
  key: keyof RpaContingencyTextOverrides;
  label: RegExp;
}

/** Row label matchers — keyed by the section 3L title text printed at x≈131. */
const CONTINGENCY_ROWS: RowSpec[] = [
  { key: 'loan_days', label: /^Loan\(s\)/i },
  { key: 'appraisal_days', label: /^Appraisal/i },
  { key: 'investigation_days', label: /^Investigation of Property/i },
  { key: 'informational_access_days', label: /^Informational Access/i },
  { key: 'insurance_days', label: /^Insurance/i },
  { key: 'seller_document_days', label: /^Review of Seller Documents/i },
  { key: 'preliminary_title_report_days', label: /^Preliminary/i },
  { key: 'common_interest_disclosures_days', label: /^Common Interest Disclosures/i },
  { key: 'review_leased_liened_items_days', label: /^Review of leased or liened/i },
];

const BASELINE_TOLERANCE = 3; // pdfjs y is the text baseline; label/marker/digit share a row
const BLANK_MAX_WIDTH = 60; // max px from marker right-edge to the typed override digit

/** A row's time-to-remove cell always begins with "<n> (or", e.g. "17 (or". */
const MARKER = /^\s*\d{1,3}\s*\(or/i;
const DIGIT = /^\d{1,3}$/;

/**
 * Read typed override digits out of the section 3L blanks on RPA page 2.
 * Returns an empty object (never throws) when the text layer is unavailable
 * or no override digit is present.
 */
export async function extractRpaContingencyTextOverrides(
  page2Buffer: Buffer,
): Promise<RpaContingencyTextOverrides> {
  try {
    const items = await extractTextItems(page2Buffer);
    const overrides: RpaContingencyTextOverrides = {};

    for (const spec of CONTINGENCY_ROWS) {
      const marker = findRowMarker(items, spec.label);
      if (!marker) continue;
      const value = readBlankValue(items, marker);
      if (value != null) overrides[spec.key] = value;
    }

    return overrides;
  } catch {
    return {};
  }
}

/**
 * Merge text-layer overrides into a merged RPA extraction object. Writes to
 * both the template-level `contingencies_and_time_periods` block and the
 * per-page `L_contingencies` row (whose `override_days_after_acceptance`
 * already takes precedence over the template value downstream).
 */
export function applyRpaContingencyTextOverrides(
  data: Record<string, unknown>,
  overrides: RpaContingencyTextOverrides,
): void {
  if (Object.keys(overrides).length === 0) return;

  const ctp = ensureRecord(data, 'contingencies_and_time_periods');
  const page2 = ensureRecord(data, 'section_3_terms_and_allocation_of_costs_page_2');
  const l = ensureRecord(page2, 'L_contingencies');

  const map: Array<[keyof RpaContingencyTextOverrides, string, string, string | null]> = [
    ['loan_days', 'loan_contingency_days', 'L1_loan', null],
    ['appraisal_days', 'appraisal_contingency_days', 'L2_appraisal', null],
    ['investigation_days', 'investigation_of_property_days', 'L3_investigation_of_property', 'investigation'],
    ['informational_access_days', 'informational_access_days', 'L3_investigation_of_property', 'informational_access'],
    ['insurance_days', 'insurance_contingency_days', 'L4_insurance', null],
    ['seller_document_days', 'review_seller_documents_days', 'L5_review_of_seller_documents', null],
    ['preliminary_title_report_days', 'preliminary_title_report_days', 'L6_preliminary_title_report', null],
    ['common_interest_disclosures_days', 'common_interest_disclosures_days', 'L7_common_interest_disclosures', null],
    ['review_leased_liened_items_days', 'review_leased_liened_items_days', 'L8_review_of_leased_or_liened_items', null],
  ];

  for (const [overrideKey, ctpKey, lRow, subKey] of map) {
    const value = overrides[overrideKey];
    if (value == null) continue;

    ctp[ctpKey] = value;

    const row = ensureRecord(l, lRow);
    const target = subKey ? ensureRecord(row, subKey) : row;
    target['override_days_after_acceptance'] = value;
    target['days_after_acceptance'] = value;
  }
}

/**
 * Remove fabricated `other_terms_modifications` from a merged RPA extraction.
 *
 * Section R ("Other Terms") on a blank form carries no typed content, but the
 * batch LLM sometimes echoes the pre-printed contingency defaults into
 * `other_terms_modifications` anyway. Downstream (contract.stage.ts) those
 * echoes take precedence over the section 3L values — so a corrected "9" day
 * loan contingency would still resolve to the echoed "17". When every Other
 * Terms text source is empty, no modifications can exist, so they are cleared.
 *
 * Returns true if any block was cleared.
 */
export function clearEmptyOtherTermsModifications(data: Record<string, unknown>): boolean {
  const textSources: unknown[] = [
    data['other_terms_text'],
    data['other_terms'],
    recordPath(data, 'terms_of_purchase.other_terms_text'),
    recordPath(data, 'section_3_terms_and_allocation_of_costs_page_3.R_other_terms.text'),
  ];
  const anyText = textSources.some((s) => typeof s === 'string' && s.trim().length > 0);
  if (anyText) return false;

  let cleared = false;
  if (isRecord(data['other_terms_modifications'])) {
    data['other_terms_modifications'] = null;
    cleared = true;
  }
  const top = asRecord(data['terms_of_purchase']);
  if (isRecord(top['other_terms_modifications'])) {
    top['other_terms_modifications'] = null;
    cleared = true;
  }
  const page3 = asRecord(data['section_3_terms_and_allocation_of_costs_page_3']);
  const rOther = asRecord(page3['R_other_terms']);
  if (isRecord(rOther['modifications'])) {
    rOther['modifications'] = null;
    cleared = true;
  }
  return cleared;
}

/**
 * Find the "17 (or" marker for a contingency row by first locating the row's
 * title label, then a marker on the same baseline. Label matches without a
 * nearby marker (e.g. "Preliminary" appearing in unrelated prose) are ignored.
 */
function findRowMarker(items: TextItem[], label: RegExp): TextItem | null {
  for (const item of items) {
    if (!label.test(item.str)) continue;
    const marker = items.find(
      (it) => it !== item && Math.abs(it.y - item.y) <= BASELINE_TOLERANCE && MARKER.test(it.str),
    );
    if (marker) return marker;
  }
  return null;
}

/** Read the digit sitting inside "(or ___)", either embedded in the marker or as a standalone glyph. */
function readBlankValue(items: TextItem[], marker: TextItem): number | null {
  const embedded = marker.str.match(/\(or\s*(\d{1,3})/);
  if (embedded) return parseInt(embedded[1], 10);

  const left = marker.x + marker.w;
  const right = left + BLANK_MAX_WIDTH;
  for (const item of items) {
    if (item === marker) continue;
    if (Math.abs(item.y - marker.y) > BASELINE_TOLERANCE) continue;
    if (item.x < left - 1 || item.x > right) continue;
    if (!DIGIT.test(item.str)) continue;
    return parseInt(item.str, 10);
  }
  return null;
}

async function extractTextItems(pdfBuffer: Buffer): Promise<TextItem[]> {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = new Uint8Array(pdfBuffer);
  const doc = await getDocument({ data, useWorkerFetch: false, isEvalSupported: false }).promise;
  try {
    const page = await doc.getPage(1);
    const content = await page.getTextContent();
    const items: TextItem[] = [];
    for (const raw of content.items as Array<{ str: string; transform: number[]; width: number }>) {
      if (!raw.str.trim()) continue;
      items.push({
        str: raw.str,
        x: raw.transform[4],
        y: raw.transform[5],
        w: raw.width,
      });
    }
    return items;
  } finally {
    doc.destroy();
  }
}

function ensureRecord(parent: unknown, key: string): Record<string, unknown> {
  if (parent && typeof parent === 'object' && !Array.isArray(parent)) {
    const record = parent as Record<string, unknown>;
    const existing = record[key];
    if (existing && typeof existing === 'object' && !Array.isArray(existing)) {
      return existing as Record<string, unknown>;
    }
    const created: Record<string, unknown> = {};
    record[key] = created;
    return created;
  }
  return {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function recordPath(data: Record<string, unknown>, dotted: string): unknown {
  let current: unknown = data;
  for (const part of dotted.split('.')) {
    if (!isRecord(current)) return undefined;
    current = current[part];
  }
  return current;
}
