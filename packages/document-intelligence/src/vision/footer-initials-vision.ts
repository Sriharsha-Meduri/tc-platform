/**
 * Gemini vision corroboration for the RPA footer initials slots.
 *
 * The extraction LLM already reports initials_present per slot from the full
 * page; this is a second, independent opinion on the EXACT cropped slot
 * images (same crops the deterministic pixel analysis examines), so a faint
 * or small initial that one source misses can still be rescued by the other.
 */
import { GeminiProvider } from '../extractor/providers/gemini.provider';
import type { FooterSlotImages } from './pdf-region-extractor';
import type { InitialSlotDetection } from './slot-pixel-analysis';
import { encodePng } from './png-encoder';

export type SlotPresence = 'present' | 'absent';

export interface GeminiFooterVerdict {
  buyerSlot1?: SlotPresence;
  buyerSlot2?: SlotPresence;
  sellerSlot1?: SlotPresence;
  sellerSlot2?: SlotPresence;
}

export type FooterSlotKey = keyof FooterSlotImages;

const SLOT_ORDER: FooterSlotKey[] = ['buyerSlot1', 'buyerSlot2', 'sellerSlot1', 'sellerSlot2'];

/**
 * Merge the deterministic pixel verdict and the Gemini vision verdict for one
 * slot into a single decision:
 *  - present   when EITHER source found an initial (rescues a missed mark)
 *  - absent    only when BOTH sources independently say there is no initial
 *  - keep      when the signals are inconclusive (one or both unavailable) —
 *              the caller keeps the extraction LLM's own value in that case,
 *              because "couldn't check" must never be treated as "missing"
 */
export function resolveFooterInitialVerdict(
  pixel: InitialSlotDetection | null,
  gemini: SlotPresence | undefined,
): 'present' | 'absent' | 'keep' {
  const pixelPresent = pixel?.initialsPresent === true;
  const pixelAbsent = pixel !== null && pixel !== undefined && pixel.initialsPresent === false;
  if (pixelPresent || gemini === 'present') return 'present';
  if (pixelAbsent && gemini === 'absent') return 'absent';
  return 'keep';
}

const SYSTEM_PROMPT =
  'You are inspecting the "Buyer\'s Initials / Seller\'s Initials" footer line of a real-estate purchase agreement page. ' +
  'Each image is exactly one initials slot. Determine whether a genuine initial is present in each image.';

const USER_PROMPT =
  'Four images follow, in this exact order:\n' +
  '1. buyer slot 1\n' +
  '2. buyer slot 2\n' +
  '3. seller slot 1\n' +
  '4. seller slot 2\n' +
  '\n' +
  'For each image, answer "present" only if there is a real handwritten or electronic (typed) initial mark inside it, ' +
  'including marks that are faint, small, or hard to read. Answer "absent" if the slot is blank — only the printed underline, ' +
  'printed text, or scan noise — or if no initial can be found.\n' +
  '\n' +
  'Return ONLY JSON with no markdown or commentary:\n' +
  '{"buyerSlot1":"present|absent","buyerSlot2":"present|absent","sellerSlot1":"present|absent","sellerSlot2":"present|absent"}';

/**
 * Run the Gemini vision check over all four footer slot crops in one batched
 * call. Returns null when any slot image is missing or the call/parse fails —
 * callers treat null as "no vision signal", never as "all missing".
 */
export async function checkFooterInitialsWithGemini(
  images: FooterSlotImages,
  apiKey: string,
  model?: string,
): Promise<GeminiFooterVerdict | null> {
  const pngs: Buffer[] = [];
  for (const key of SLOT_ORDER) {
    const img = images[key];
    if (!img) return null;
    pngs.push(encodePng(img.data, img.width, img.height));
  }

  const provider = new GeminiProvider(apiKey, model ?? 'gemini-3.1-flash-lite', 0);
  try {
    const response = await provider.extractText(pngs, SYSTEM_PROMPT, USER_PROMPT, { mimeType: 'image/png' });
    const cleaned = response.text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/i, '')
      .trim();
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;
    const verdict: GeminiFooterVerdict = {};
    for (const key of SLOT_ORDER) {
      const value = parsed[key];
      if (value === 'present' || value === 'absent') verdict[key] = value;
    }
    return verdict;
  } catch (err) {
    console.warn(`[GeminiVision] Footer initials check failed: ${(err as Error)?.message ?? err}`);
    return null;
  }
}
