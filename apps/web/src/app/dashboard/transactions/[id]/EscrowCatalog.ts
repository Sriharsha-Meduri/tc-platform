/**
 * Escrow document catalog — the single source of truth for which escrow
 * documents appear in the Escrow Details section.
 *
 * `required`:  true = missing is a blocker
 *              false = if applicable (missing not flagged, present = validated)
 * `action`:    'save'    = identified, stored, associated
 *              'sign'    = requires signature validation via document intelligence
 */

export type EscrowDocAction = 'save' | 'sign';

export interface EscrowCatalogEntry {
  formCode: string;
  formName: string;
  required: boolean;
  action: EscrowDocAction;
  sortOrder: number;
}

export const ESCROW_CATALOG: EscrowCatalogEntry[] = [
  { formCode: 'EMD-R',  formName: 'EMD Receipt (Earnest Money Deposit)',        required: true,  action: 'save', sortOrder: 100 },
  { formCode: 'ECC',    formName: 'Escrow Confirmed Contract',                   required: true,  action: 'save', sortOrder: 200 },
  { formCode: 'EI',     formName: 'Escrow Instructions',                         required: false, action: 'save', sortOrder: 300 },
  { formCode: 'EA',     formName: 'Escrow Amendment(s)',                         required: false, action: 'save', sortOrder: 400 },
  { formCode: 'QS',     formName: 'Qualified Substitute',                        required: true,  action: 'save', sortOrder: 500 },
  { formCode: 'NHD',    formName: 'NHD Report (Natural Hazard Disclosure)',      required: true,  action: 'sign', sortOrder: 600 },
  { formCode: 'NHDS',   formName: 'NHD Signature Pages',                         required: true,  action: 'sign', sortOrder: 700 },
  { formCode: 'PTR',    formName: 'Preliminary Title Report (Prelim)',           required: true,  action: 'save', sortOrder: 800 },
  { formCode: 'HW',     formName: 'Home Warranty',                               required: false, action: 'save', sortOrder: 900 },
  { formCode: 'PTRA',   formName: 'Preliminary Title Receipt/Acknowledgement',   required: true,  action: 'sign', sortOrder: 1000 },
  { formCode: 'HOA',    formName: 'HOA Document Approval',                       required: false, action: 'sign', sortOrder: 1100 },
];

export const ESCROW_FORM_CODES = new Set(ESCROW_CATALOG.map((e) => e.formCode));

const BY_CODE = new Map(ESCROW_CATALOG.map((e) => [e.formCode, e]));

export function getEscrowEntry(formCode: string): EscrowCatalogEntry | undefined {
  const upper = formCode.toUpperCase();
  const direct = BY_CODE.get(upper);
  if (direct) return direct;
  for (const entry of ESCROW_CATALOG) {
    if (entry.formCode.toUpperCase() === upper) return entry;
  }
  return undefined;
}
