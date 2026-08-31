/**
 * Qualification document catalog — required financing documents for the Qualification section.
 */
export interface IntakeCatalogEntry {
  formCode: string;
  formName: string;
  required: boolean;
  description: string;
  sortOrder: number;
}

export const INTAKE_CATALOG: IntakeCatalogEntry[] = [
  {
    formCode: 'PREQUAL',
    formName: 'Lender Prequalification Letter',
    required: true,
    description: 'Lender-issued letter confirming buyer\'s financing eligibility, loan type, and prequalified amount',
    sortOrder: 100,
  },
  {
    formCode: 'POF',
    formName: 'Buyer Proof of Funds',
    required: true,
    description: 'Bank statement or financial institution letter verifying buyer\'s available funds for down payment and closing costs',
    sortOrder: 200,
  },
];

export const INTAKE_FORM_CODES = new Set(INTAKE_CATALOG.map((e) => e.formCode));

export type IntakeDocStatus = 'missing' | 'received' | 'verified';
