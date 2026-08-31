export interface PageConverterConfig {
  dpi: number;
}
export const DEFAULT_PAGE_CONVERTER_CONFIG: PageConverterConfig = { dpi: 200 };

export interface PageConverter {
  convert(pdfBuffer: Buffer): Promise<PageConversionResult>;
}

export interface PageConversionResult {
  pages: Buffer[];
  format: 'png';
  originalPageCount: number;
  convertedPageCount: number;
}
