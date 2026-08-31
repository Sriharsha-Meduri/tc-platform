import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class PdfRenderService {
  private readonly logger = new Logger(PdfRenderService.name);

  /**
   * Render a single page from a PDF buffer as a PNG image.
   * Uses pdf-lib to extract the page and PdfjsPageConverter to render.
   * Returns the PNG buffer or null on failure.
   */
  async renderPage(pdfBuffer: Buffer, pageNumber: number, dpi = 150): Promise<Buffer | null> {
    const pageIndex = pageNumber - 1;

    try {
      const { PDFDocument } = await import('pdf-lib');
      const doc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
      if (pageIndex < 0 || pageIndex >= doc.getPageCount()) return null;

      const singlePage = await PDFDocument.create();
      const [copiedPage] = await singlePage.copyPages(doc, [pageIndex]);
      singlePage.addPage(copiedPage);
      const singlePdfBytes = await singlePage.save();

      const { PdfjsPageConverter } = await import('@tc/document-intelligence');
      const converter = new PdfjsPageConverter({ dpi });
      const result = await converter.convert(Buffer.from(singlePdfBytes));
      if (result.convertedPageCount > 0) return result.pages[0];

      return null;
    } catch (err) {
      this.logger.warn(`PDF page render failed: ${(err as Error).message}`);
      return null;
    }
  }

  /**
   * Get total page count of a PDF buffer.
   */
  async getPageCount(pdfBuffer: Buffer): Promise<number> {
    try {
      const { PDFDocument } = await import('pdf-lib');
      const doc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
      return doc.getPageCount();
    } catch {
      return 1;
    }
  }

  /**
   * Get the dimensions (width, height in PDF points) of the first page.
   */
  async getPageDimensions(pdfBuffer: Buffer): Promise<{ width: number; height: number }> {
    try {
      const { PDFDocument } = await import('pdf-lib');
      const doc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
      if (doc.getPageCount() > 0) {
        const size = doc.getPage(0).getSize();
        return { width: size.width, height: size.height };
      }
    } catch { /* fall through */ }
    return { width: 612, height: 792 };
  }
}
