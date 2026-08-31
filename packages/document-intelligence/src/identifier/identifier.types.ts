export type PageClassificationSource =
  | 'title_footer'
  | 'title'
  | 'header'
  | 'revision_footer'
  | 'gemini'
  | 'unknown';

export interface PageClassification {
  pageIndex: number;
  formCodes: string[];
  pageNumber: number | null;
  totalPages: number | null;
  confidence: number;
  /** Set only for deterministic (non-Gemini) matches. */
  formName?: string | null;
  formRevision?: string | null;
  /** How this page was classified. Deterministic sources are authoritative
   *  and must never be overwritten by downstream smoothing/grouping. */
  source?: PageClassificationSource;
  /** Raw matched text snippet(s) supporting this classification. */
  evidence?: string[];
}

export interface FormGroup {
  formCode: string;
  pageIndices: number[];
}
