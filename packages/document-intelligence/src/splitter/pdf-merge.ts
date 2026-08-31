import { PDFDocument } from 'pdf-lib';

/**
 * Merge multiple PDF page buffers into a single multi-page PDF.
 * Each input buffer should contain exactly one page (as produced by PdfSplitter),
 * but any valid PDF is accepted — all pages from each buffer are appended.
 */
export async function mergePageBuffers(buffers: Buffer[]): Promise<Buffer> {
  const merged = await PDFDocument.create();
  for (const buf of buffers) {
    try {
      const src = await PDFDocument.load(buf, { ignoreEncryption: true, throwOnInvalidObject: false });
      const pages = await merged.copyPages(src, src.getPageIndices());
      for (const page of pages) merged.addPage(page);
    } catch (err) {
      console.warn(`[pdf-merge] Failed to merge page buffer: ${(err as Error).message}`);
    }
  }
  // If nothing was merged, return an empty valid PDF
  if (merged.getPageCount() === 0) {
    merged.addPage();
  }
  return Buffer.from(await merged.save());
}
