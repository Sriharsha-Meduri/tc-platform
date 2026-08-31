export interface FieldValue<T = unknown> {
  value: T;
  enabled: boolean;
}

export function isFieldValue(obj: unknown): obj is FieldValue {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'value' in obj &&
    'enabled' in obj &&
    Object.keys(obj).length === 2
  );
}

export interface Scenario {
  name: string;
  forms: FormGeneration[];
}

export interface FormGeneration {
  formCode: string;
  state?: string;
  data: Record<string, unknown>;
  label?: string;
}

export interface FillOptions {
  blankPdfBuffer?: Buffer;
  templateDir?: string;
}

export interface GeneratorOptions {
  fillOptions?: FillOptions;
}

export interface FieldRegion {
  x: number;
  y: number;
  w: number;
  h?: number;
  fontSize?: number;
  fontColor?: number;
  align?: 'left' | 'right' | 'center';
  isCheckbox?: boolean;
  prefix?: string;
  lineHeight?: number;
}

export interface RegionGroup {
  pageNumber: number;
  fields: Record<string, FieldRegion>;
}

export type CoordinateMap = RegionGroup[];
