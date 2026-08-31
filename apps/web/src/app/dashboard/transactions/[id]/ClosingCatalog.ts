/**
 * Closing document catalog — the single source of truth for which closing
 * documents appear in the Closing Detail section.
 *
 * `required`:  true  = missing is a blocker, required before closing complete
 *              false = if applicable (missing not flagged)
 * `waivable`:  true  = can be marked Not Applicable / Waived
 */
export interface ClosingCatalogEntry {
  formCode: string;
  formName: string;
  required: boolean;
  waivable: boolean;
  description: string;
  sortOrder: number;
}

export const CLOSING_CATALOG: ClosingCatalogEntry[] = [
  {
    formCode: 'COMMIN',
    formName: 'Commission Instructions / Authorization',
    required: true,
    waivable: false,
    description: 'Brokerage commission instructions and disbursement authorization',
    sortOrder: 100,
  },
  {
    formCode: 'CDA',
    formName: 'Commission Disbursement Authorization (CDA)',
    required: true,
    waivable: false,
    description: 'Authorization to disburse commission to brokerage',
    sortOrder: 200,
  },
  {
    formCode: 'VP',
    formName: 'Verification of Property (VP)',
    required: true,
    waivable: false,
    description: 'Buyer verifies property condition before close of escrow',
    sortOrder: 300,
  },
  {
    formCode: 'CS',
    formName: 'Closing Statement(s)',
    required: true,
    waivable: false,
    description: 'Final settlement statement showing all costs and credits',
    sortOrder: 400,
  },
  {
    formCode: 'MLS-P',
    formName: 'MLS Printout (Closed Status)',
    required: true,
    waivable: true,
    description: 'MLS listing printout showing closed/completed status',
    sortOrder: 500,
  },
];

export const CLOSING_FORM_CODES = new Set(CLOSING_CATALOG.map((e) => e.formCode));

const BY_CODE = new Map(CLOSING_CATALOG.map((e) => [e.formCode, e]));

export function getClosingEntry(formCode: string): ClosingCatalogEntry | undefined {
  const upper = formCode.toUpperCase();
  return BY_CODE.get(upper);
}

export type ClosingDocStatus = 'missing' | 'received' | 'validated' | 'signed' | 'waived';
