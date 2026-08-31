/**
 * Gemini-vision corroboration for TDS/SPQ Yes/No questions — both the
 * "Yes → numbered explanation" requirement and, independently, whether each
 * question has exactly one checkbox marked at all.
 *
 * The primary extraction call for these forms sends raw PDF bytes to a
 * text-oriented LLM with no rendered page image — it can misread a checked
 * box, or lose track of which physical "If Yes to any, provide explanation"
 * area a piece of handwritten/typed text actually belongs to. This module
 * re-derives all of these signals — the independent state of EACH item's own
 * Yes checkbox and No checkbox, and the verbatim text in each section's own
 * explanation area — directly from the rendered page images, so a checked
 * box and its explanation are read together off the same picture a human
 * reviewer would see, never inferred from disconnected text extraction.
 *
 * Two Gemini calls per SECTION, not one call for the whole document. Every
 * other page-scoped vision task in this codebase (RPA's per-page
 * extraction, footer-initials detection) keeps its own request small and
 * focused; the original version of this module instead combined every
 * section of a multi-page form (SPQ alone has 15, ~90 fields total) into a
 * single request, and in practice Gemini silently dropped most items under
 * that load — a document with a dozen checked boxes would come back with
 * only one or two actually detected. Every page image is still sent on
 * EVERY call regardless of section, because a section's items and its own
 * explanation box can straddle a page break (SPQ section 6 spans pages 1-2,
 * section 9 spans pages 2-3) — scoping images by a section's nominal `page`
 * number would risk cutting off exactly the content this pass exists to
 * read correctly. The two calls per section run independently (temp 0 +
 * temp 0.4 — same-temperature parallel calls were confirmed live to often
 * land on the same, possibly wrong, deterministic decoding path) and are
 * merged per item (`mergeItemStates`) with different policies for different
 * purposes — see that function's own comment for why "any Yes detected" and
 * "both boxes genuinely marked" need opposite merge rules.
 */
import { GeminiProvider } from '../extractor/providers/gemini.provider';
import type { RenderedPageCache } from '../page-converter/rendered-page-cache';
import { encodePng } from './png-encoder';
import type { YesItemSection } from '../validator/stages/disclosures.stage';

/** dot-path section key → { <item field>: boolean, <explanation field>: string | null } */
export type DisclosureVisionOverride = Record<string, Record<string, unknown>>;

/**
 * The independent, merged state of one item's own Yes/No checkbox pair —
 * used for the "exactly one answer selected" completion check. `yesChecked`
 * and `noChecked` are each true if ANY call detected a mark in that specific
 * box (recall-biased, same as the legacy boolean). `bothMarked` and
 * `neitherMarked` are NOT simply derived from those two OR-merged booleans —
 * see `mergeItemStates` for why a naive `yesChecked && noChecked` would
 * manufacture false "both marked" results out of two calls that merely
 * disagreed about which single box was marked.
 */
export interface YesNoItemState {
  yesChecked: boolean;
  noChecked: boolean;
  bothMarked: boolean;
  neitherMarked: boolean;
}

/** dot-path section key → item field → merged checkbox state */
export type DisclosureCompletionState = Record<string, Record<string, YesNoItemState>>;

export interface DisclosureVisionResult {
  override: DisclosureVisionOverride;
  completion: DisclosureCompletionState;
}

/** How many section calls run concurrently — bounded so a 15-section SPQ doesn't fire 15 simultaneous Gemini requests. */
const SECTION_CALL_CONCURRENCY = 6;

function buildSectionPrompt(formCode: string, sec: YesItemSection): { system: string; user: string } {
  const items = sec.items
    .map((it) => `    - Item ${it.code} (JSON field "${it.field}"): report the state of THIS item's own two checkbox squares, "Yes" and "No", independently.`)
    .join('\n');

  const system =
    `You are visually inspecting rendered page images of a California Association of REALTORS® ${formCode} form. ` +
    `Look ONLY at the one numbered section described below — ignore every other section's checkboxes and explanation text. ` +
    `Each item is printed on the form with its own item code (e.g. "6A", "7D", "9B", "7F(1)" or "F(1)") directly beside its ` +
    `own pair of Yes/No checkbox squares — locate that exact printed code first, then independently inspect BOTH of its two ` +
    `boxes and report whether EACH one, on its own, has a mark (an "X" or similar) inside it. Do not treat this as a forced ` +
    `single choice between Yes and No — report the true physical state of each box separately. On a correctly completed form ` +
    `exactly one of the two will be marked, but the form may occasionally have neither box marked (left blank) or, rarely, ` +
    `both boxes marked — your job is to report exactly what you see, not what you expect to see. Four situations cause the ` +
    `most mistakes, so check for them specifically: ` +
    `(1) an item's own question text wraps onto a second printed line — the item's checkboxes still belong to that same ` +
    `item, not to the item above or below it; (2) an item is immediately followed by its own numbered sub-items, e.g. ` +
    `"(1)" and "(2)" printed just below it with their own separate checkbox pairs — the parent item's mark is on the ` +
    `parent's own line, not on either sub-item's line, and a sub-item's mark never belongs to the parent; (3) an item ` +
    `whose own text fits on a single line sits directly below an item that wrapped onto two lines — the wrapped item's ` +
    `checkbox row and the next (single-line) item's checkbox row end up vertically close together, and it is easy to ` +
    `read the wrapped item's mark correctly but then let it "carry over" into misreading the next item's row as the ` +
    `same answer, or as blank/unmarked, when it actually has its own distinct mark; (4) do not assume the Yes and No boxes ` +
    `are mutually exclusive by construction — actually look at BOTH squares independently, since reporting "No" purely by ` +
    `inferring "not Yes" (rather than actually observing a mark in the No box) would silently hide a genuinely blank pair. ` +
    `Before answering, first count the exact number of lettered items listed for this section and confirm you can find that ` +
    `exact same number of Yes/No checkbox row-pairs printed top to bottom on the page — there is always a strict one-to-one ` +
    `match between the Nth item in top-to-bottom reading order and the Nth checkbox row-pair in top-to-bottom order, ` +
    `regardless of how many text lines any individual item's question wraps onto. For every item, first write a one-sentence ` +
    `description of exactly what you see in that item's own two checkbox squares (which one, if either, or if both, has a ` +
    `mark in it) before giving your true/false answers — do not infer an answer from surrounding prose or from a different ` +
    `item's checkbox, and do not assume an item repeats the answer of the item immediately above or below it. After reading ` +
    `every item's checkboxes, find this section's own single "If Yes to any, provide explanation" text area — it appears ` +
    `once, after this section's last item — and transcribe its text exactly as written, character for character. Never copy ` +
    `explanation text that belongs to a different numbered section, even if this section's own explanation area is blank.`;

  const outputShape: Record<string, unknown> = {};
  for (const it of sec.items) {
    outputShape[it.field] = {
      evidence: '<one-sentence description of the marks in this item\'s own two checkboxes>',
      yesChecked: '<boolean — true only if the Yes box itself has a mark>',
      noChecked: '<boolean — true only if the No box itself has a mark>',
    };
  }
  outputShape[sec.explanationField] = '<string | null>';

  const user =
    `Inspect the attached page images and report on this section only:\n\n${items}\n\n` +
    `    - JSON field "${sec.explanationField}": the verbatim text in this section's own "If Yes to any, provide ` +
    `explanation" area, or null if that area is blank.\n\n` +
    `Return ONLY valid JSON, no markdown, matching this shape exactly (each item field is an object with your evidence ` +
    `description AND both boolean values, never a bare boolean):\n${JSON.stringify(outputShape, null, 2)}`;

  return { system, user };
}

function coerceBoolean(value: unknown): boolean {
  if (typeof value === 'string') return value.toLowerCase() === 'true';
  return value === true;
}

interface SectionCallResult {
  items: Record<string, { yesChecked: boolean; noChecked: boolean }>;
  explanation: string | null;
}

/**
 * Reduces one call's raw JSON response (the evidence-first `{ evidence,
 * yesChecked, noChecked }` shape per item — see `buildSectionPrompt`) into
 * this call's own independent read of every item's checkbox pair, plus the
 * section's explanation text. The evidence text itself is discarded here —
 * its only purpose was forcing the model to describe each checkbox before
 * committing to a boolean, not to be persisted.
 */
function parseSectionCallResult(raw: Record<string, unknown>, sec: YesItemSection): SectionCallResult {
  const items: Record<string, { yesChecked: boolean; noChecked: boolean }> = {};
  for (const it of sec.items) {
    const entry = raw[it.field];
    if (entry && typeof entry === 'object') {
      const e = entry as Record<string, unknown>;
      items[it.field] = { yesChecked: coerceBoolean(e['yesChecked']), noChecked: coerceBoolean(e['noChecked']) };
    } else {
      // Tolerates a model that (despite instructions) returns a bare boolean
      // directly — degrades to treating it as the old collapsed "isYes"
      // signal, assuming the other box is the opposite, rather than losing
      // the item entirely.
      const v = coerceBoolean(entry);
      items[it.field] = { yesChecked: v, noChecked: !v };
    }
  }
  const explanationRaw = raw[sec.explanationField];
  return { items, explanation: typeof explanationRaw === 'string' ? explanationRaw : null };
}

/**
 * Merges two independent calls' reads of one item's checkbox pair.
 *
 * `yesChecked`/`noChecked` (used for the legacy collapsed boolean that feeds
 * the "Yes needs explanation" check, and for the completion check's own
 * "which box is marked" signal) are OR-merged: true if EITHER call detected
 * a mark in that box. Confirmed via live-fixture debugging that a single
 * call can consistently misread a Yes as No for one specific checkbox (a
 * mark sitting directly beneath another item's wrapped second line) — this
 * deliberately biases toward false positives over false negatives on
 * "was this box marked", since missing a real mark is a worse failure than
 * one extra reviewer glance.
 *
 * `bothMarked` is NOT `yesChecked && noChecked` computed from the OR-merged
 * pair above — that would manufacture a false "both marked" whenever the two
 * calls simply disagreed about which SINGLE box was marked (call A says only
 * Yes, call B says only No — a completely ordinary single-call misread, not
 * evidence the form itself has two marks). It is true only when a SINGLE
 * call independently reported both of its own two boxes as marked — a
 * genuine double-mark is visible within one observation, so a real one
 * doesn't need cross-call agreement to be trusted, and this keeps
 * inter-call disagreement from ever being mistaken for it.
 *
 * `neitherMarked` is true only when BOTH calls agree that neither box has
 * any mark at all — if either call detected a mark anywhere (Yes or No),
 * that is treated as evidence something was likely selected on the real
 * form, even if the two calls disagree on which one.
 */
function mergeItemStates(
  a: { yesChecked: boolean; noChecked: boolean } | undefined,
  b: { yesChecked: boolean; noChecked: boolean } | undefined,
): YesNoItemState {
  const aY = a?.yesChecked ?? false, aN = a?.noChecked ?? false;
  const bY = b?.yesChecked ?? false, bN = b?.noChecked ?? false;
  return {
    yesChecked: aY || bY,
    noChecked: aN || bN,
    bothMarked: (aY && aN) || (bY && bN),
    neitherMarked: !aY && !aN && !bY && !bN,
  };
}

function mergeSectionCallResults(
  a: SectionCallResult | undefined,
  b: SectionCallResult | undefined,
  sec: YesItemSection,
): { override: Record<string, unknown>; completion: Record<string, YesNoItemState> } {
  const override: Record<string, unknown> = {};
  const completion: Record<string, YesNoItemState> = {};
  for (const it of sec.items) {
    const merged = mergeItemStates(a?.items[it.field], b?.items[it.field]);
    completion[it.field] = merged;
    // Backward-compat collapsed boolean for the existing "Yes needs
    // explanation" check and for the persisted extraction data field.
    override[it.field] = merged.yesChecked;
  }
  override[sec.explanationField] = a?.explanation ?? b?.explanation ?? null;
  return { override, completion };
}

/**
 * Renders every page of this TDS/SPQ document once (via the shared cache),
 * then issues two Gemini calls per section — all sharing the same rendered
 * page images — up to `SECTION_CALL_CONCURRENCY` sections at a time. Returns
 * null — never throws — when rendering fails outright; a single section's
 * own calls failing is logged and simply omitted from the result (the batch
 * extraction's own value for that section survives untouched, and the
 * completion check simply has no vision-verified state for that section's
 * items — see `validateYesNoCompletion` in disclosures.stage.ts), so a
 * partial vision outage degrades gracefully instead of losing every
 * section's correction.
 */
export async function extractYesExplanationsWithVision(
  pageBuffers: Buffer[],
  formCode: 'TDS' | 'SPQ',
  sections: YesItemSection[],
  cache: RenderedPageCache,
  apiKey: string,
  model?: string,
): Promise<DisclosureVisionResult | null> {
  if (pageBuffers.length === 0 || sections.length === 0) return null;

  let pngs: Buffer[];
  try {
    const bitmaps = await Promise.all(pageBuffers.map((buf) => cache.getPage(buf, 1)));
    pngs = bitmaps.map((bm) => encodePng(bm.data, bm.width, bm.height));
  } catch (err) {
    console.warn(`[DisclosureVision] Failed to render ${formCode} pages: ${(err as Error)?.message ?? err}`);
    return null;
  }

  const resolvedModel = model ?? 'gemini-3.1-flash-lite';
  // Two providers, not one reused for both calls: at temperature 0 two
  // simultaneous requests with identical images/prompt tend to land on the
  // same deterministic decoding path and come back with the SAME (possibly
  // wrong) answer — confirmed live, where two temp-0 parallel calls agreed
  // on an incorrect checkbox read every time. A nonzero temperature on the
  // second call forces genuine sampling diversity, so a re-ask actually has
  // a chance of catching what the first call missed.
  const provider = new GeminiProvider(apiKey, resolvedModel, 0);
  const providerVariant = new GeminiProvider(apiKey, resolvedModel, 0.4);
  const override: DisclosureVisionOverride = {};
  const completion: DisclosureCompletionState = {};
  const failures: string[] = [];
  const queue = [...sections];

  async function callOnce(sec: YesItemSection, useVariant: boolean): Promise<SectionCallResult> {
    const { system, user } = buildSectionPrompt(formCode, sec);
    const response = await (useVariant ? providerVariant : provider).extractText(pngs, system, user, { mimeType: 'image/png' });
    const cleaned = response.text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/i, '')
      .trim();
    const raw = JSON.parse(cleaned) as Record<string, unknown>;
    return parseSectionCallResult(raw, sec);
  }

  async function worker(): Promise<void> {
    let sec: YesItemSection | undefined;
    while ((sec = queue.shift())) {
      const [first, second] = await Promise.allSettled([callOnce(sec, false), callOnce(sec, true)]);
      const a = first.status === 'fulfilled' ? first.value : undefined;
      const b = second.status === 'fulfilled' ? second.value : undefined;
      if (!a && !b) {
        const err = first.status === 'rejected' ? first.reason : second.status === 'rejected' ? second.reason : undefined;
        failures.push(`${sec.sectionKey} (${(err as Error)?.message ?? err})`);
        continue;
      }
      const merged = mergeSectionCallResults(a, b, sec);
      override[sec.sectionKey] = merged.override;
      completion[sec.sectionKey] = merged.completion;
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(SECTION_CALL_CONCURRENCY, sections.length) }, () => worker()),
  );

  if (failures.length > 0) {
    console.warn(`[DisclosureVision] ${failures.length}/${sections.length} section(s) failed for ${formCode}: ${failures.join('; ')}`);
  }
  return Object.keys(override).length > 0 ? { override, completion } : null;
}

function setSectionFields(data: Record<string, unknown>, path: string, fields: Record<string, unknown>): void {
  const parts = path.split('.');
  let cur: Record<string, unknown> = data;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    if (typeof cur[key] !== 'object' || cur[key] === null || Array.isArray(cur[key])) cur[key] = {};
    cur = cur[key] as Record<string, unknown>;
  }
  const lastKey = parts[parts.length - 1];
  const existing = (typeof cur[lastKey] === 'object' && cur[lastKey] !== null && !Array.isArray(cur[lastKey]))
    ? (cur[lastKey] as Record<string, unknown>)
    : {};
  // Merge, never replace wholesale — a section object commonly carries fields
  // (e.g. SPQ's "sprinklers_automatic_or_manually_operated") that aren't part
  // of this Yes/explanation check at all and must survive untouched.
  cur[lastKey] = { ...existing, ...fields };
}

/**
 * Applies a vision override onto an extraction's data object in place —
 * only the item Yes/No fields and the explanation field for each configured
 * section are overwritten; everything else in the extraction is untouched.
 * A section absent from `override` (its own call failed, or returned no
 * usable JSON) is left exactly as the primary extraction produced it.
 */
export function applyDisclosureVisionOverride(
  data: Record<string, unknown>,
  override: DisclosureVisionOverride,
  sections: YesItemSection[],
): void {
  for (const sec of sections) {
    const sectionOverride = override[sec.sectionKey];
    if (!sectionOverride || typeof sectionOverride !== 'object') continue;
    setSectionFields(data, sec.sectionKey, sectionOverride);
  }
}
