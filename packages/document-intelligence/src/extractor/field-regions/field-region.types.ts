/**
 * A named, coordinate-defined region on one page of a form, used to crop a
 * targeted corroboration image for a single contract field (e.g. purchase
 * price, EMD amount) instead of relying solely on the full-page LLM pass.
 * Coordinates are PDF points (page rendered at scale=1), top-left origin.
 */
export interface ContractFieldRegion {
  /** Matches a key on ContractDocumentExtractedTermsFields, e.g. 'purchasePrice'. */
  field: string;
  /** 1-indexed page within the uploaded document this region belongs to. */
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Extra margin applied around the region when cropping — generous, not tight, so a mark near the edge isn't clipped. Defaults to { x: 12, y: 12 }. */
  padding?: { x: number; y: number };
}
