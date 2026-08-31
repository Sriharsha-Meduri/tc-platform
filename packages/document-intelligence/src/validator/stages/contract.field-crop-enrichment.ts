import type {
  ContractDocumentExtraction,
  ContractDocumentExtractedTermsFields,
  ExtractedContractField,
  FieldSource,
} from '../../extractor/extractor.types';
import type { RenderedPageCache } from '../../page-converter/rendered-page-cache';
import type { LlmExtractionProvider } from '../../extractor/provider.interface';
import { cropFieldRegions, extractFieldsFromCrops, type FieldCropExtractionResult } from '../../extractor/field-regions/field-region-extractor';
import { scoFieldRegions } from '../../extractor/forms/sco/regions';
import type { ContractFieldRegion } from '../../extractor/field-regions/field-region.types';

/**
 * Targeted field-region crops are an independent corroborating signal
 * alongside the whole-page LLM pass (spec item 5) — never the sole source
 * of truth. This module reconciles a crop's reading against whatever the
 * page-level pass already produced for that field:
 *
 *  - page found nothing, crop found something -> RESCUE (adopt the crop,
 *    still fully sourced/attributed — never invented).
 *  - both found nothing -> nothing to do.
 *  - both agree -> keep the (richer) page-level field as-is.
 *  - they DISAGREE -> keep the page-level field UNCHANGED and record a
 *    non-fatal extractionWarnings entry. A crop reading a different, and
 *    possibly worse-cropped, region of the page must never silently
 *    overwrite an already-good extracted value.
 */

function regionsForDocumentType(documentType: ContractDocumentExtraction['documentType']): ContractFieldRegion[] {
  switch (documentType) {
    case 'SCO':
    case 'BCO':
    case 'SMCO':
    case 'BMCO':
      return scoFieldRegions;
    default:
      // RPA already gets 17 dedicated per-page prompts — no field-region
      // crop set has been built for it in this pass.
      return [];
  }
}

/** Loose equality for comparing a page-level value against a crop's reading. */
function valuesAgree(a: unknown, b: unknown): boolean {
  if (a == null || b == null) return a == null && b == null;
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < 0.01;
  if (typeof a === 'boolean' && typeof b === 'boolean') return a === b;
  const sa = String(a).trim().toLowerCase();
  const sb = String(b).trim().toLowerCase();
  return sa === sb;
}

export interface ReconcileResult<T> {
  field: ExtractedContractField<T> | null;
  warning: string | null;
}

/**
 * Reconcile one page-level field against one crop's independent reading.
 * Pure and side-effect free — see the module doc comment for the rules.
 */
export function reconcileFieldWithCrop<T>(
  pageField: ExtractedContractField<T> | null | undefined,
  crop: FieldCropExtractionResult<T> | null | undefined,
  source: FieldSource,
): ReconcileResult<T> {
  if (!crop || crop.value == null) {
    return { field: pageField ?? null, warning: null };
  }

  if (pageField?.value == null) {
    const rescued: ExtractedContractField<T> = {
      value: crop.value,
      defaultValue: pageField?.defaultValue ?? null,
      enteredValue: crop.value,
      sourceType: crop.sourceType,
      source,
      evidence: crop.evidenceText != null || crop.confidence != null
        ? { text: crop.evidenceText ?? undefined, confidence: crop.confidence ?? undefined }
        : undefined,
    };
    return { field: rescued, warning: null };
  }

  if (valuesAgree(pageField.value, crop.value)) {
    return { field: pageField, warning: null };
  }

  return {
    field: pageField,
    warning: `Field-region crop disagreement for "${crop.field}" (page ${crop.page}): page extraction has ${JSON.stringify(pageField.value)}, crop corroboration read ${JSON.stringify(crop.value)} — keeping the page-level value.`,
  };
}

/**
 * Crop and read the targeted field regions for one document, reconciling
 * every result against the existing `.fields` provenance (rescue-only,
 * never overwrites a disagreeing value). Mutates `doc.extractedTerms`
 * in place. Never throws — a crop/extraction failure for this document
 * simply leaves its fields untouched.
 */
export async function enrichDocumentWithFieldRegionCrops(
  doc: ContractDocumentExtraction,
  pdfBuffer: Buffer,
  cache: RenderedPageCache,
  provider: LlmExtractionProvider,
): Promise<void> {
  const regions = regionsForDocumentType(doc.documentType);
  if (regions.length === 0) return;

  let crops;
  try {
    crops = await cropFieldRegions(pdfBuffer, regions, cache);
  } catch (err) {
    console.warn(`[FieldCropEnrichment] Failed to crop regions for ${doc.fileName}: ${(err as Error)?.message ?? err}`);
    return;
  }
  if (crops.length === 0) return;

  let cropResults: FieldCropExtractionResult[];
  try {
    cropResults = await extractFieldsFromCrops(
      crops,
      provider,
      (field) => `What is the ${field} value shown in this crop? Report exactly what is written — never infer or calculate.`,
    );
  } catch (err) {
    console.warn(`[FieldCropEnrichment] Crop extraction failed for ${doc.fileName}: ${(err as Error)?.message ?? err}`);
    return;
  }
  if (cropResults.length === 0) return;

  const fields: ContractDocumentExtractedTermsFields = { ...(doc.extractedTerms.fields ?? {}) };
  const warnings: string[] = [];

  for (const cropResult of cropResults) {
    const key = cropResult.field as keyof ContractDocumentExtractedTermsFields;
    const existing = fields[key] as ExtractedContractField<unknown> | null | undefined;
    const source: FieldSource = { documentId: doc.documentId, formCode: doc.documentType, page: cropResult.page };
    const { field, warning } = reconcileFieldWithCrop(existing, cropResult, source);
    (fields as Record<string, ExtractedContractField<unknown> | null>)[key] = field;
    if (warning) warnings.push(warning);
  }

  doc.extractedTerms.fields = fields;
  if (warnings.length > 0) {
    doc.extractedTerms.extractionWarnings = [...(doc.extractedTerms.extractionWarnings ?? []), ...warnings];
  }
}

/**
 * Enrich every contract document that has a page buffer available. Mirrors
 * the enrichDocumentsWithGeminiContingency batch-enrichment pattern in
 * contract.contingency-extraction.ts: best-effort per document, never
 * throws, no-op when there is nothing to corroborate.
 */
export async function enrichDocumentsWithFieldRegionCrops(
  docs: ContractDocumentExtraction[],
  pageBuffersByFileName: Map<string, Buffer>,
  cache: RenderedPageCache,
  provider: LlmExtractionProvider,
): Promise<void> {
  if (docs.length === 0) return;

  for (const doc of docs) {
    const pdfBuffer = pageBuffersByFileName.get(doc.fileName);
    if (!pdfBuffer) continue;
    await enrichDocumentWithFieldRegionCrops(doc, pdfBuffer, cache, provider);
  }
}
