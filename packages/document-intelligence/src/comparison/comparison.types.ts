export type ChangeSeverity = 'material' | 'minor' | 'none';

export interface FieldChange {
  path: string;
  oldValue: unknown;
  newValue: unknown;
  severity: ChangeSeverity;
  label: string;
}

export interface FormComparisonResult {
  hasChanges: boolean;
  hasMaterialChanges: boolean;
  changes: FieldChange[];
  materialChanges: FieldChange[];
  minorChanges: FieldChange[];
}

export interface RpaMaterialDifferenceConfig {
  purchasePriceThreshold: number;
  closeOfEscrowDayThreshold: number;
  contingencyDayThreshold: number;
}

export const DEFAULT_RPA_MATERIAL_CONFIG: RpaMaterialDifferenceConfig = {
  purchasePriceThreshold: 1000,
  closeOfEscrowDayThreshold: 3,
  contingencyDayThreshold: 3,
};

export function isMaterialChange(result: FormComparisonResult): boolean {
  return result.hasMaterialChanges;
}
