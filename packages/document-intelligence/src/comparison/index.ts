export type {
  ChangeSeverity,
  FieldChange,
  FormComparisonResult,
  RpaMaterialDifferenceConfig,
} from './comparison.types';
export {
  DEFAULT_RPA_MATERIAL_CONFIG,
  isMaterialChange,
} from './comparison.types';

export { compareRpaExtractions } from './rpa-comparison';
export { compareScoExtractions } from './sco-comparison';
