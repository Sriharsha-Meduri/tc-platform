import type { PageConverterConfig } from './page-converter.types';

/**
 * A single rendered page as raw RGBA pixel data, plus enough geometry to map
 * PDF-point coordinates (page at scale=1) to pixel coordinates in `data`.
 */
export interface RenderedPageBitmap {
  width: number;
  height: number;
  data: Uint8ClampedArray;
  dpi: number;
  /** Page dimensions in PDF points (scale=1) — divide a pixel coordinate by (dpi/72) to recover points. */
  pdfWidthPts: number;
  pdfHeightPts: number;
}

/**
 * Renders PDF pages to raw RGBA bitmaps via pdfjs-dist's Node canvas support
 * (pdfjs-dist's legacy Node build resolves its DefaultCanvasFactory to
 * NodeCanvasFactory when running under Node, which lazily requires
 * `@napi-rs/canvas` — already an installed transitive dependency of
 * pdfjs-dist itself, no extra package needed).
 *
 * Caches per (pdfPageBuffer, pageIndex) for the lifetime of this instance —
 * callers construct one RenderedPageCache per extraction request and share
 * it across footer-initials detection and field-region cropping so a page
 * used by both is only rendered once.
 *
 * Deliberately NOT built on PdfjsPageConverter — that class's `convert()`
 * targets a browser `OffscreenCanvas` global that does not exist in a plain
 * Node runtime (confirmed: it silently falls back to raw-PDF-passthrough
 * whenever actually invoked). This class renders correctly in Node via
 * pdfjs-dist's own canvas factory instead.
 */
export class RenderedPageCache {
  private readonly cache = new Map<Buffer, Map<number, Promise<RenderedPageBitmap>>>();

  constructor(private readonly config: PageConverterConfig) {}

  /**
   * Deliberately NOT `async` — an async function wraps its return value in a
   * brand-new Promise on every call, even when returning an already-pending
   * Promise, which would defeat memoization (callers awaiting two "cached"
   * calls would each get a distinct Promise object). Returning `pending`
   * directly hands back the exact same in-flight/resolved Promise instance.
   */
  getPage(pdfPageBuffer: Buffer, pageIndex = 1): Promise<RenderedPageBitmap> {
    let byPage = this.cache.get(pdfPageBuffer);
    if (!byPage) {
      byPage = new Map();
      this.cache.set(pdfPageBuffer, byPage);
    }
    let pending = byPage.get(pageIndex);
    if (!pending) {
      pending = this.renderPage(pdfPageBuffer, pageIndex);
      byPage.set(pageIndex, pending);
    }
    return pending;
  }

  private async renderPage(pdfPageBuffer: Buffer, pageIndex: number): Promise<RenderedPageBitmap> {
    const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const doc = await pdfjs.getDocument({ data: new Uint8Array(pdfPageBuffer) }).promise;
    try {
      const page = await doc.getPage(pageIndex);
      try {
        const scale = this.config.dpi / 72;
        const viewport = page.getViewport({ scale });
        const viewportAt1 = page.getViewport({ scale: 1 });
        // Canvas pixel dimensions must be integers — `viewport.width/height`
        // is a floating-point pts*scale product that lands exactly on an
        // integer for some (dpi, page-size) combinations (e.g. 200 DPI on a
        // Letter page) but not others (confirmed: 300 DPI on the same page
        // produces 3300.0000000000005 from IEEE-754 rounding). The canvas
        // itself always ends up an integer number of pixels regardless, so
        // rounding here keeps the reported width/height in sync with the
        // actual pixel buffer `getImageData` returns — without this, a
        // width/height that doesn't exactly match `data.length` breaks any
        // consumer (e.g. `encodePng`) that trusts these dimensions.
        const width = Math.round(viewport.width);
        const height = Math.round(viewport.height);
        const canvasFactory = doc.canvasFactory;
        const canvasAndContext = canvasFactory.create(width, height);
        try {
          await page.render({ canvasContext: canvasAndContext.context, viewport, canvasFactory }).promise;
          const imageData = canvasAndContext.context.getImageData(0, 0, width, height);
          return {
            width,
            height,
            data: imageData.data as Uint8ClampedArray,
            dpi: this.config.dpi,
            pdfWidthPts: viewportAt1.width,
            pdfHeightPts: viewportAt1.height,
          };
        } finally {
          canvasFactory.destroy(canvasAndContext);
        }
      } finally {
        page.cleanup();
      }
    } finally {
      await doc.destroy();
    }
  }
}
