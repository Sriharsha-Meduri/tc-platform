import type { ContractFieldRegion } from '../../../field-regions/field-region.types';
import { scoPage1Regions } from './page1.regions';
import { scoPage2Regions } from './page2.regions';

export { scoPage1Regions } from './page1.regions';
export { scoPage2Regions } from './page2.regions';

/**
 * All targeted field-region crops for the shared SCO/BCO/SMCO/BMCO
 * counter-offer schema. `cropFieldRegions` defensively skips any region
 * whose `page` exceeds the actual uploaded document's page count, so a
 * single-page BCO simply never triggers the page-2 (empty) entries.
 */
export const scoFieldRegions: ContractFieldRegion[] = [...scoPage1Regions, ...scoPage2Regions];
