// ─── Canonical CDA fields ───────────────────────────────────────────────────

/**
 * Every value the CDA (Commission Disbursement Authorization) PDF can
 * contain. This is the single vocabulary shared by the field-mapping config,
 * the calculator, and the generator — nothing in this module refers to a
 * CDA value by any other name.
 */
export type CdaFieldName =
  | 'brokerage'
  | 'brokerName'
  | 'agent'
  | 'escrowNumber'
  | 'salePrice'
  | 'closeOfEscrowDate'
  | 'clientCredits'
  | 'totalCommissionToDisburse'
  | 'brokerageAddress'
  | 'agentAddress'
  | 'brokerCommissionAmount'
  | 'agentCommissionAmount'
  | 'mytcAppCommissionAmount'
  | 'brokerSignature'
  | 'propertyAddress'
  | 'myTCAddress'
  | 'sideRepresented'
  | 'date';

// ─── PDF coordinate / mapping contracts ────────────────────────────────────

/**
 * Where one occurrence of a CDA field is placed on the template PDF. A
 * field can have several of these (see CdaFieldMapping) when the same value
 * legitimately appears in more than one place on the form.
 */
export interface PdfCoordinate {
  /** 1-indexed PDF page this coordinate places its value on. */
  page: number;
  /** X position in PDF points, measured from the page's left edge. */
  x: number;
  /** Y position in PDF points, measured from the page's BOTTOM edge — pdf-lib's native (and the PDF spec's) coordinate origin, not the top. */
  y: number;
  /**
   * Bounding-box width in PDF points. For `type: 'signature'`, this (with
   * `height`) is the box the signature image is scaled to fit inside
   * without stretching. For text types, an optional wrap/alignment width.
   */
  width?: number;
  /** Bounding-box height in PDF points — used the same way as `width`. */
  height?: number;
  /** Font size in points for text/currency/date coordinates. Ignored for 'signature'. Defaults to 10 if omitted. */
  fontSize?: number;
  /** Text alignment within `width` (only meaningful when `width` is set). Defaults to 'left'. */
  alignment?: 'left' | 'center' | 'right';
  /**
   * What this coordinate renders. Every type except 'signature' is drawn as
   * text — the *formatting* (currency/date) already happened once, in
   * cda-calculator.ts, before the generator ever sees the value, so this
   * flag exists for documentation/future-rendering-variation purposes
   * rather than to re-derive formatting at draw time. 'signature' is the one
   * type that changes HOW a coordinate is drawn (image, not text).
   * Defaults to 'text'.
   */
  type?: 'text' | 'currency' | 'date' | 'signature';
}

/** Every CDA field maps to one or more coordinates — the single source of truth for document positioning. See config/cda-field-mappings.ts. */
export type CdaFieldMapping = Record<CdaFieldName, PdfCoordinate[]>;

// ─── Input contract — what a caller provides ───────────────────────────────

/**
 * What a caller of generateCda() supplies. Optional fields may be omitted
 * entirely or passed as null — both mean "not available," and the
 * generated PDF simply leaves that field's area blank rather than printing
 * a placeholder string. See cda-calculator.ts's resolveCdaValues for how
 * these become final, render-ready values.
 */
export interface CdaGenerationInput {
  brokerage: string;
  brokerName: string;
  agent: string;

  escrowNumber?: string | null;

  salePrice: number;

  closeOfEscrowDate?: Date | string | null;

  clientCredits?: number | null;

  brokerageAddress?: string | null;
  agentAddress?: string | null;

  brokerCommissionAmount?: number | null;
  agentCommissionAmount?: number | null;

  mytcAppCommissionAmount?: number | null;

  /**
   * A signature image — raw PNG/JPEG bytes, or the same encoded as a base64
   * string (a `data:image/...;base64,` prefix is accepted and stripped).
   * Never rendered as text. Null/undefined/unrecognized image data all
   * leave the signature area blank rather than throwing.
   */
  brokerSignature?: Buffer | string | null;

  date?: Date | string | null;
  sideRepresented?: string | null;
  myTCAddress?: string | null;
  propertyAddress?: string | null;
}

// ─── Resolved contract — what the generator actually renders ──────────────

/**
 * The fully calculated, normalized, render-ready form of a CdaGenerationInput
 * — produced once by cda-calculator.ts's resolveCdaValues and consumed by
 * cda-generator.ts. Every optional input has already been defaulted here
 * (0 for missing money amounts, null for missing text/dates), and every
 * date has already been formatted to its final display string — the
 * generator never re-derives or reformats a value.
 */
export interface ResolvedCdaValues {
  brokerage: string;
  brokerName: string;
  agent: string;

  escrowNumber: string | null;

  salePrice: number;
  closeOfEscrowDate: string | null;

  clientCredits: number;

  totalCommissionToDisburse: number;

  brokerageAddress: string | null;
  agentAddress: string | null;

  brokerCommissionAmount: number;
  agentCommissionAmount: number;
  mytcAppCommissionAmount: number;

  brokerSignature: Buffer | string | null;

  date: string;
  sideRepresented?: string | null;
  myTCAddress?: string | null;
  propertyAddress?: string | Buffer | null;
}
