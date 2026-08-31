import type { PageConverter, PageConverterConfig, PageConversionResult } from './page-converter.types';

declare const OffscreenCanvas: {
  prototype: OffscreenCanvas;
  new(width: number, height: number): OffscreenCanvas;
};

interface OffscreenCanvas {
  width: number;
  height: number;
  getContext(type: '2d'): OffscreenCanvasRenderingContext2D | null;
  convertToBlob(options?: { type?: string }): Promise<Blob>;
}

interface OffscreenCanvasRenderingContext2D {
  fillStyle: string;
  fillRect(x: number, y: number, w: number, h: number): void;
}

const LOG = '[PageConverter]';

export class PdfjsPageConverter implements PageConverter {
  private pdfjs: any = null;
  private initError: Error | null = null;

  constructor(private config: PageConverterConfig) {}

  async convert(pdfBuffer: Buffer): Promise<PageConversionResult> {
    const lib = await this.getPdfjs();
    if (!lib) {
      return this.fallbackResult(pdfBuffer);
    }

    try {
      const data = new Uint8Array(pdfBuffer);
      const doc = await lib.getDocument({ data }).promise;
      const originalPageCount = doc.numPages;
      const scale = this.config.dpi / 72;

      const pages: Buffer[] = [];
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const viewport = page.getViewport({ scale });

        const canvas = new OffscreenCanvas(viewport.width, viewport.height);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          page.cleanup();
          throw new Error('Failed to get 2d context');
        }

        (ctx as any).fillStyle = '#FFFFFF';
        (ctx as any).fillRect(0, 0, viewport.width, viewport.height);

        await page.render({ canvasContext: ctx as any, viewport }).promise;

        const blob = await canvas.convertToBlob({ type: 'image/png' });
        const ab = await blob.arrayBuffer();
        pages.push(Buffer.from(ab));

        page.cleanup();
      }

      doc.destroy();

      return { pages, format: 'png', originalPageCount, convertedPageCount: pages.length };
    } catch (err) {
      console.warn(`${LOG} PDF page rendering failed:`, err);
      return this.fallbackResult(pdfBuffer);
    }
  }

  private async getPdfjs(): Promise<any> {
    if (this.pdfjs) return this.pdfjs;
    if (this.initError) return null;

    try {
      this.pdfjs = await import('pdfjs-dist');
      return this.pdfjs;
    } catch (err) {
      this.initError = err as Error;
      console.warn(`${LOG} pdfjs-dist not available — falling back to raw PDF. Install: pnpm --filter @tc/document-intelligence add pdfjs-dist`);
      return null;
    }
  }

  private fallbackResult(pdfBuffer: Buffer): PageConversionResult {
    return {
      pages: [pdfBuffer],
      format: 'png',
      originalPageCount: 1,
      convertedPageCount: 0,
    };
  }
}
