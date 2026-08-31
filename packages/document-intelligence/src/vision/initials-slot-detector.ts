import { locateFooterSlotZones, cropSlotsFromRenderedPage, type FooterSlotImages } from './pdf-region-extractor';
import { analyzeSlotPixels, type InitialSlotDetection, type SlotPixelAnalysisOptions } from './slot-pixel-analysis';
import { checkFooterInitialsWithGemini, type GeminiFooterVerdict } from './footer-initials-vision';
import type { RenderedPageCache } from '../page-converter/rendered-page-cache';

export type { InitialSlotDetection } from './slot-pixel-analysis';

export interface FooterInitialsDetection {
  buyerSlot1: InitialSlotDetection | null;
  buyerSlot2: InitialSlotDetection | null;
  sellerSlot1: InitialSlotDetection | null;
  sellerSlot2: InitialSlotDetection | null;
}

export interface FooterInitialsVerification {
  pixel: FooterInitialsDetection;
  gemini: GeminiFooterVerdict | null;
}

function analyzeOrNull(
  image: FooterSlotImages[keyof FooterSlotImages],
  options?: SlotPixelAnalysisOptions,
): InitialSlotDetection | null {
  if (!image) return null;
  return analyzeSlotPixels(image.data, image.width, image.height, options);
}

/**
 * Renders the page once (via the shared cache) and crops all four footer
 * slots out of that single bitmap — both the pixel and Gemini-vision
 * signals below read from these same crops, so a bad crop can never degrade
 * one signal without the other. Returns null when the slot geometry can't
 * be located at all (no text layer to anchor off of).
 */
async function getSlotImages(pdfPageBuffer: Buffer, cache: RenderedPageCache): Promise<FooterSlotImages | null> {
  const zones = await locateFooterSlotZones(pdfPageBuffer);
  if (!zones) return null;
  const bitmap = await cache.getPage(pdfPageBuffer);
  return cropSlotsFromRenderedPage(bitmap, zones);
}

/**
 * Deterministic pixel-level verdict for all four standard footer initials
 * slots on a single RPA page, as ground truth to override an LLM's
 * initials_present judgment for that page's footer.
 *
 * Returns null for a slot when its ink region couldn't be located at all
 * (e.g. no text layer to anchor off of) — callers should keep the LLM's
 * judgment for that slot in that case, never treat "couldn't check" as
 * "missing".
 */
export async function detectFooterInitialSlots(
  pdfPageBuffer: Buffer,
  cache: RenderedPageCache,
  options?: SlotPixelAnalysisOptions,
): Promise<FooterInitialsDetection | null> {
  const images = await getSlotImages(pdfPageBuffer, cache);
  if (!images) return null;

  return {
    buyerSlot1: analyzeOrNull(images.buyerSlot1, options),
    buyerSlot2: analyzeOrNull(images.buyerSlot2, options),
    sellerSlot1: analyzeOrNull(images.sellerSlot1, options),
    sellerSlot2: analyzeOrNull(images.sellerSlot2, options),
  };
}

/**
 * Both footer-initials signals in one pass: the deterministic pixel verdict
 * and the Gemini vision verdict, derived from the same slot crops (sourced
 * from one shared rendered-page bitmap — see getSlotImages). When
 * `geminiApiKey` is omitted the vision signal is null — callers then fall
 * back to pixel-only behavior. Returns null when the slots can't be located
 * at all (no text layer to anchor off of).
 */
export async function detectFooterInitialsWithVision(
  pdfPageBuffer: Buffer,
  cache: RenderedPageCache,
  geminiApiKey?: string,
  options?: SlotPixelAnalysisOptions & { model?: string },
): Promise<FooterInitialsVerification | null> {
  const images = await getSlotImages(pdfPageBuffer, cache);
  if (!images) return null;

  const pixel: FooterInitialsDetection = {
    buyerSlot1: analyzeOrNull(images.buyerSlot1, options),
    buyerSlot2: analyzeOrNull(images.buyerSlot2, options),
    sellerSlot1: analyzeOrNull(images.sellerSlot1, options),
    sellerSlot2: analyzeOrNull(images.sellerSlot2, options),
  };

  const gemini = geminiApiKey
    ? await checkFooterInitialsWithGemini(images, geminiApiKey, options?.model)
    : null;

  return { pixel, gemini };
}
