import type { RenderedPageCache, RenderedPageBitmap } from '../../page-converter/rendered-page-cache';
import { encodePng } from '../../vision/png-encoder';
import type { ContractFieldRegion } from './field-region.types';
import type { LlmExtractionProvider } from '../provider.interface';
import type { FieldSourceType } from '../extractor.types';

const DEFAULT_PADDING = { x: 12, y: 12 };

export interface FieldRegionCropResult {
  field: string;
  page: number;
  png: Buffer;
}

/**
 * Crops each region out of its page's rendered bitmap (rendering each
 * distinct page at most once via the shared cache), converting the region's
 * PDF-point coordinates to pixels via the bitmap's own dpi/72 scale, with
 * padding applied and clamped to the bitmap bounds. Regions whose `page`
 * exceeds the document's actual page count are skipped (not thrown) — SCO/BCO
 * documents vary in page count and a region file may list an optional
 * continuation page that isn't always present.
 */
export async function cropFieldRegions(
  pdfPageBuffer: Buffer,
  regions: ContractFieldRegion[],
  cache: RenderedPageCache,
): Promise<FieldRegionCropResult[]> {
  const results: FieldRegionCropResult[] = [];

  for (const region of regions) {
    let bitmap: RenderedPageBitmap;
    try {
      bitmap = await cache.getPage(pdfPageBuffer, region.page);
    } catch (err) {
      console.warn(`[FieldRegionExtractor] Skipping region "${region.field}" — page ${region.page} unavailable: ${(err as Error)?.message ?? err}`);
      continue;
    }

    const png = cropRegionFromBitmap(bitmap, region);
    if (!png) continue;
    results.push({ field: region.field, page: region.page, png });
  }

  return results;
}

function cropRegionFromBitmap(bitmap: RenderedPageBitmap, region: ContractFieldRegion): Buffer | null {
  const scale = bitmap.dpi / 72;
  const padding = region.padding ?? DEFAULT_PADDING;

  const x0 = Math.max(0, Math.round((region.x - padding.x) * scale));
  const y0 = Math.max(0, Math.round((region.y - padding.y) * scale));
  const x1 = Math.min(bitmap.width, Math.round((region.x + region.width + padding.x) * scale));
  const y1 = Math.min(bitmap.height, Math.round((region.y + region.height + padding.y) * scale));
  const cropW = x1 - x0;
  const cropH = y1 - y0;
  if (cropW <= 0 || cropH <= 0) return null;

  const cropped = new Uint8ClampedArray(cropW * cropH * 4);
  for (let row = 0; row < cropH; row++) {
    const srcStart = ((y0 + row) * bitmap.width + x0) * 4;
    cropped.set(bitmap.data.subarray(srcStart, srcStart + cropW * 4), row * cropW * 4);
  }

  return encodePng(cropped, cropW, cropH);
}

export interface FieldCropExtractionResult<T = unknown> {
  field: string;
  page: number;
  value: T | null;
  sourceType: FieldSourceType;
  evidenceText: string | null;
  confidence: number | null;
}

const CROP_SYSTEM_PROMPT =
  'You are reading one cropped image of a single field from a California real-estate contract form. ' +
  'Report exactly what is written, typed, handwritten, checked, or selected in this crop — never infer, ' +
  'calculate, or assume a value that is not visibly present. If the crop is blank or the value cannot be ' +
  'read, report null. Return ONLY JSON, no markdown:\n' +
  '{"value": <the value, in the requested type, or null>, "source_type": "typed"|"handwritten"|"checkbox"|"radio"|"pdf_text"|"vision"|"unknown", "evidence_text": <string|null>, "confidence": <0-1 float>}';

/**
 * Runs one small LLM call per crop (not batched) so each result is cleanly
 * attributable to exactly one field — avoids cross-field bleed-through that
 * a single multi-field prompt over several crops could introduce.
 */
export async function extractFieldsFromCrops(
  crops: FieldRegionCropResult[],
  provider: LlmExtractionProvider,
  buildUserPrompt: (field: string) => string,
): Promise<FieldCropExtractionResult[]> {
  const results = await Promise.all(
    crops.map(async (crop): Promise<FieldCropExtractionResult | null> => {
      try {
        const response = await provider.extractText([crop.png], CROP_SYSTEM_PROMPT, buildUserPrompt(crop.field), { mimeType: 'image/png' });
        const cleaned = response.text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
        const parsed = JSON.parse(cleaned) as { value?: unknown; source_type?: string; evidence_text?: string | null; confidence?: number | null };
        return {
          field: crop.field,
          page: crop.page,
          value: parsed.value ?? null,
          sourceType: (parsed.source_type as FieldSourceType) ?? 'vision',
          evidenceText: parsed.evidence_text ?? null,
          confidence: typeof parsed.confidence === 'number' ? parsed.confidence : null,
        };
      } catch (err) {
        console.warn(`[FieldRegionExtractor] Crop extraction failed for field "${crop.field}": ${(err as Error)?.message ?? err}`);
        return null;
      }
    }),
  );

  return results.filter((r): r is FieldCropExtractionResult => r !== null);
}
