/**
 * Locate the four standard footer initials slots (Buyer 1/2, Seller 1/2) on
 * a single RPA page, using pdfjs-dist's text layer to find the "Buyer's
 * Initials" / "Seller's Initials" labels and the separating slash.
 *
 * Geometry is derived from the page's own text positions, not hardcoded
 * pixel coordinates, so it tracks whatever the actual footer layout is
 * rather than assuming one fixed template.
 *
 * Deliberately split from pixel-fetching: `locateFooterSlotZones` returns
 * pure PDF-point geometry, and the caller crops those zones out of a single
 * shared rendered-page bitmap via `cropSlotsFromRenderedPage`. Both the
 * pixel-analysis signal and the Gemini-vision signal then read from that one
 * bitmap — previously each slot's image was located independently by
 * walking the PDF's embedded image XObjects, which meant a bad match there
 * (e.g. picking up unrelated footer furniture, or missing a faint scan)
 * silently degraded both downstream signals at once, since they shared that
 * one flawed source. A rendered bitmap is a uniform representation that
 * captures PDF text, handwriting, vector marks, DocuSign fields, flattened
 * annotations, embedded images, and scanned pages alike.
 */

import type { RenderedPageBitmap } from '../page-converter/rendered-page-cache';

export interface ExtractedSlotImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface FooterSlotImages {
  buyerSlot1: ExtractedSlotImage | null;
  buyerSlot2: ExtractedSlotImage | null;
  sellerSlot1: ExtractedSlotImage | null;
  sellerSlot2: ExtractedSlotImage | null;
}

/** A slot's bounding box in PDF points (scale=1), bottom-left-origin — y increases upward, matching pdfjs's own coordinate space. */
export interface Zone {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface FooterSlotZones {
  buyerSlot1: Zone;
  buyerSlot2: Zone;
  sellerSlot1: Zone;
  sellerSlot2: Zone;
}

interface TextItemPos {
  str: string;
  x: number;
  y: number;
  width: number;
}

const BUYER_LABEL_RE = /buyer[’']?s?\s+initials?/i;
const SELLER_LABEL_RE = /seller[’']?s?\s+initials?/i;
const SLASH_RE = /^\s*\/\s*$/;

/**
 * Locate the four footer-initials slot zones on a single RPA page's
 * standard page footer (the bottommost "Buyer's/Seller's Initials ___/___"
 * line — a page can have more than one such line, e.g. RPA page 15 also has
 * Section 29/31 initials lines above it). Returns null when the labels
 * can't be found in the text layer (e.g. a fully scanned page with no text
 * layer) so callers fall back to the LLM's own judgment.
 */
export async function locateFooterSlotZones(pdfPageBuffer: Buffer): Promise<FooterSlotZones | null> {
  const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = new Uint8Array(pdfPageBuffer);
  const doc = await pdfjs.getDocument({ data }).promise;

  try {
    const page = await doc.getPage(1);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();

    const items: TextItemPos[] = content.items.map((i: any) => ({
      str: i.str as string,
      x: i.transform[4] as number,
      y: i.transform[5] as number,
      width: (i.width as number) ?? 0,
    }));

    const buyerLabels = items.filter((i) => BUYER_LABEL_RE.test(i.str)).sort((a, b) => a.y - b.y);
    const sellerLabels = items.filter((i) => SELLER_LABEL_RE.test(i.str)).sort((a, b) => a.y - b.y);
    const buyerLabel = buyerLabels[0];
    if (!buyerLabel) return null;
    const sellerLabel = sellerLabels.filter((i) => Math.abs(i.y - buyerLabel.y) <= 6).sort((a, b) => a.y - b.y)[0];
    if (!sellerLabel) return null;

    const lineY = buyerLabel.y;
    const lineTolerance = 6;
    const onLine = (i: TextItemPos) => Math.abs(i.y - lineY) <= lineTolerance;

    const findSlash = (afterX: number): TextItemPos | undefined =>
      items.filter((i) => SLASH_RE.test(i.str) && onLine(i) && i.x > afterX).sort((a, b) => a.x - b.x)[0];

    const buyerSlash = findSlash(buyerLabel.x);
    const sellerSlash = findSlash(sellerLabel.x);
    if (!buyerSlash || !sellerSlash) return null;

    const pageWidth = viewport.width;
    const y0 = lineY - 8;
    const y1 = lineY + 40;

    // Slot 2 (the rightmost slot of each pair) has no following label to
    // bound it — mirror slot 1's own width (label-to-slash) as the estimate.
    const sellerSlot1Width = sellerSlash.x - sellerLabel.x;

    return {
      buyerSlot1: { x0: buyerLabel.x, y0, x1: buyerSlash.x, y1 },
      buyerSlot2: { x0: buyerSlash.x, y0, x1: sellerLabel.x, y1 },
      sellerSlot1: { x0: sellerLabel.x, y0, x1: sellerSlash.x, y1 },
      sellerSlot2: { x0: sellerSlash.x, y0, x1: Math.min(sellerSlash.x + sellerSlot1Width, pageWidth), y1 },
    };
  } finally {
    await doc.destroy();
  }
}

function cropZoneFromBitmap(bitmap: RenderedPageBitmap, zone: Zone, padding: { x: number; y: number }): ExtractedSlotImage | null {
  const scale = bitmap.dpi / 72;

  const expandedX0 = zone.x0 - padding.x;
  const expandedX1 = zone.x1 + padding.x;
  const expandedY0 = zone.y0 - padding.y; // bottom edge, PDF space
  const expandedY1 = zone.y1 + padding.y; // top edge, PDF space

  // PDF y increases upward from the page origin; bitmap rows increase
  // downward from the top, so the box's PDF-space TOP (y1) maps to the
  // smaller pixel row, and its BOTTOM (y0) maps to the larger pixel row.
  const px0 = Math.max(0, Math.round(expandedX0 * scale));
  const px1 = Math.min(bitmap.width, Math.round(expandedX1 * scale));
  const py0 = Math.max(0, Math.round((bitmap.pdfHeightPts - expandedY1) * scale));
  const py1 = Math.min(bitmap.height, Math.round((bitmap.pdfHeightPts - expandedY0) * scale));

  const cropW = px1 - px0;
  const cropH = py1 - py0;
  if (cropW <= 0 || cropH <= 0) return null;

  const cropped = new Uint8ClampedArray(cropW * cropH * 4);
  for (let row = 0; row < cropH; row++) {
    const srcStart = ((py0 + row) * bitmap.width + px0) * 4;
    cropped.set(bitmap.data.subarray(srcStart, srcStart + cropW * 4), row * cropW * 4);
  }
  return { width: cropW, height: cropH, data: cropped };
}

/**
 * Crop all four footer-initials slots out of one shared rendered-page
 * bitmap, with generous (not tight) padding so a mark near a slot's edge
 * isn't clipped. Both the pixel-analysis signal and the Gemini-vision
 * signal read from the images this returns.
 */
export function cropSlotsFromRenderedPage(
  bitmap: RenderedPageBitmap,
  zones: FooterSlotZones,
  padding: { x: number; y: number } = { x: 10, y: 14 },
): FooterSlotImages {
  return {
    buyerSlot1: cropZoneFromBitmap(bitmap, zones.buyerSlot1, padding),
    buyerSlot2: cropZoneFromBitmap(bitmap, zones.buyerSlot2, padding),
    sellerSlot1: cropZoneFromBitmap(bitmap, zones.sellerSlot1, padding),
    sellerSlot2: cropZoneFromBitmap(bitmap, zones.sellerSlot2, padding),
  };
}
