import type { ContractFieldRegion } from '../../../field-regions/field-region.types';

/**
 * SCO's physical page 2 (and the corresponding tail of a single-page BCO)
 * carries only Section 5 "Acceptance" and Section 6 "Late Acceptance" —
 * signature/date prose, no additional negotiated contract terms. There is
 * nothing here worth a targeted field crop, so this list is intentionally
 * empty; it exists so callers can iterate `[...scoPage1Regions, ...scoPage2Regions]`
 * uniformly without special-casing page 1.
 */
export const scoPage2Regions: ContractFieldRegion[] = [];
