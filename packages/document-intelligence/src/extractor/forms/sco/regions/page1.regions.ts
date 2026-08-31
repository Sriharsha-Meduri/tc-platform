import type { ContractFieldRegion } from '../../../field-regions/field-region.types';

/**
 * Targeted field-region crops for physical page 1 of an SCO/BCO/SMCO/BMCO
 * counter-offer PDF — an independent corroborating signal alongside the
 * whole-page LLM pass (spec item 5), never the sole source of truth.
 *
 * Unlike RPA, the counter-offer form has no standalone printed "Purchase
 * Price" field — price, close-of-escrow, and credit changes are all
 * expressed as free-form text inside the Section 1D "OTHER TERMS" box, so
 * several field entries below intentionally share the same crop geometry.
 *
 * Coordinates were measured directly off a real SCO fixture
 * (test/extraction/springhill-home/pdfs/SCO-1.pdf, C.A.R. Form SCO Revised
 * 12/25, page 1 of 2, 612x792pt): the "OTHER TERMS:" label sits at
 * (72, 298) and the block runs to the "E." attached-addenda paragraph at
 * (54, 411); "2. EXPIRATION:" sits at (54, 519) through "3. MARKETING..."
 * at (54, 595). BCO (C.A.R. Form BCO Revised 12/25, single page) uses the
 * same field schema but a materially shorter/higher-positioned layout
 * (Other Terms ~285-334, Expiration ~380-435) — the boxes below are sized
 * generously so they still catch BCO's Other Terms text, but the
 * Expiration box is SCO-calibrated and will likely miss on BCO. That is
 * safe: cropFieldRegions/reconcileFieldWithCrop only ever rescue a missing
 * value, never overwrite a page-level result, so an off-target crop simply
 * yields no corroboration rather than a wrong answer.
 */
export const scoPage1Regions: ContractFieldRegion[] = [
  {
    field: 'purchasePrice',
    page: 1,
    x: 30,
    y: 275,
    width: 550,
    height: 190,
    padding: { x: 16, y: 16 },
  },
  {
    field: 'closeOfEscrowDate',
    page: 1,
    x: 30,
    y: 275,
    width: 550,
    height: 190,
    padding: { x: 16, y: 16 },
  },
  {
    field: 'sellerCreditToBuyer',
    page: 1,
    x: 30,
    y: 275,
    width: 550,
    height: 190,
    padding: { x: 16, y: 16 },
  },
  {
    field: 'otherTermsText',
    page: 1,
    x: 30,
    y: 275,
    width: 550,
    height: 190,
    padding: { x: 16, y: 16 },
  },
  {
    field: 'expirationDate',
    page: 1,
    x: 30,
    y: 515,
    width: 550,
    height: 110,
    padding: { x: 16, y: 16 },
  },
];
