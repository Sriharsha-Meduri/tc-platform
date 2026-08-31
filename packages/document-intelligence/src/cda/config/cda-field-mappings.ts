import type { CdaFieldMapping } from '../types/cda.types';

/**
 * The single source of truth for where every CDA field is drawn on
 * templates/cda-template.pdf. Nothing outside this file should know a PDF
 * coordinate — cda-generator.ts only ever reads these, never hardcodes one.
 *
 * These coordinates target the CURRENT placeholder template (2 letter-size
 * pages, 612x792pt) — see templates/cda-template.pdf's own header comment.
 * When the real, designed CDA template replaces the placeholder, only this
 * file needs new numbers; cda-calculator.ts and cda-generator.ts are
 * unaffected (see cda/__tests__ for the tests that pin down this contract).
 *
 * `agent` demonstrates the multi-location case: the same resolved value is
 * drawn on both page 1 (top of the form) and page 2 (the acknowledgment
 * block) from a single entry in ResolvedCdaValues — fillCdaFields loops
 * every coordinate in a field's array, so adding a third location for any
 * field is just adding another object to its array.
 */
export const CDA_FIELD_MAPPINGS: CdaFieldMapping = {
  brokerage: [
    { page: 1, x: 256, y: 710.33, fontSize: 20, alignment: 'center', type: 'text' },
    { page: 1, x: 80.67, y: 295.33, fontSize: 10, alignment: 'left', type: 'text' },
    { page: 1, x: 137.33, y: 148.67, fontSize: 10, alignment: 'left', type: 'text' },
  ],
  brokerName: [
    { page: 1, x: 119.33, y: 170, fontSize: 10, type: 'text' },
  ],
  agent: [
    { page: 2, x: 300, y: 700, fontSize: 9, type: 'text' },
    { page: 1, x: 150, y: 609.33, fontSize: 10, type: 'text' },
    { page: 1, x: 81.33, y: 268.67, fontSize: 10, type: 'text' },
  ],
  escrowNumber: [
    { page: 1, x: 172, y: 563.33, fontSize: 10, type: 'text' },
  ],
  salePrice: [
    { page: 1, x: 319.33, y: 492.33, fontSize: 10, type: 'currency' },
  ],
  closeOfEscrowDate: [
    { page: 1, x: 318, y: 466.67, fontSize: 10, alignment: 'left', type: 'date' },
  ],
  clientCredits: [
    { page: 1, x: 320.67, y: 439.67, fontSize: 10, type: 'currency' },
  ],
  totalCommissionToDisburse: [
    { page: 1, x: 318.67, y: 414.67, fontSize: 10, alignment: 'left', type: 'currency' },
    { page: 1, x: 442.67, y: 214.67, fontSize: 10, alignment: 'left', type: 'currency' },
  ],
  brokerageAddress: [
    { page: 1, x: 226, y: 295.33, fontSize: 10, alignment: 'left', type: 'text' },
  ],
  agentAddress: [
    { page: 1, x: 227.33, y: 267.33, fontSize: 10, alignment: 'left', type: 'text' },
  ],
  brokerCommissionAmount: [
    { page: 1, x: 443.33, y: 293.67, fontSize: 10, alignment: 'left', type: 'currency' },
  ],
  agentCommissionAmount: [
    { page: 1, x: 443.33, y: 268, fontSize: 10, alignment: 'left', type: 'currency' },
  ],
  mytcAppCommissionAmount: [
    { page: 1, x: 446, y: 242, fontSize: 10, alignment: 'left', type: 'currency' },
  ],
  brokerSignature: [
    { page: 1, x: 178.67, y: 126.67, fontSize: 10, alignment: 'left', type: 'signature' },
  ],
  date: [
    { page: 1, x: 472.67, y: 130.67, fontSize: 10, alignment: 'left', type: 'date' },
  ],
  propertyAddress: [
    { page: 1, x: 175.33, y: 634, fontSize: 10, alignment: 'left', type: 'text' },
  ],
  myTCAddress: [
    { page: 1, x: 224.67, y: 240.67, fontSize: 10, alignment: 'left', type: 'text' },
  ],
  sideRepresented: [
    { page: 1, x: 172, y: 588, fontSize: 10, alignment: 'left', type: 'text' },
  ],
};
