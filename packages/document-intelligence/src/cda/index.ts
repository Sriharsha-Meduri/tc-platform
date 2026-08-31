/**
 * Public API of the CDA (Commission Disbursement Authorization) generation
 * module. Everything else in src/cda/ — the template file, the coordinate
 * mappings, the calculator, and the generator's internal drawing helpers —
 * is an implementation detail. Callers construct a CdaGenerationInput with
 * plain business data and get a PDF Buffer back; they never see a
 * PdfCoordinate or a field mapping.
 */
export { generateCda } from './services/cda-generator';

export type {
  CdaGenerationInput,
  ResolvedCdaValues,
  CdaFieldName,
} from './types/cda.types';
