import { PDFDocument } from 'pdf-lib';
import { execFileSync } from 'child_process';

export interface SplitResult {
  pageCount: number;
  pageBuffers: Buffer[];
}

/**
 * Attempt to repair a malformed PDF using qpdf (decrypt, linearize, fix object refs).
 * Returns the repaired buffer, or the original if qpdf is not available or fails.
 */
function tryRepairWithQpdf(pdfBuffer: Buffer): Buffer {
  try {
    execFileSync('qpdf', ['--check', '/dev/stdin'], { input: pdfBuffer, stdio: 'pipe' });
    return pdfBuffer; // qpdf check passed, no repair needed
  } catch {
    // qpdf check failed or qpdf not available — try --replace-input repair via temp
  }

  try {
    const { writeFileSync, readFileSync, unlinkSync } = require('fs');
    const { join } = require('path');
    const { tmpdir } = require('os');
    const tmpIn = join(tmpdir(), `tc-pdf-in-${Date.now()}.pdf`);
    const tmpOut = join(tmpdir(), `tc-pdf-out-${Date.now()}.pdf`);
    writeFileSync(tmpIn, pdfBuffer);
    try {
      execFileSync('qpdf', ['--decrypt', tmpIn, tmpOut], { stdio: 'pipe', timeout: 30_000 });
      const repaired = readFileSync(tmpOut);
      return repaired;
    } catch {
      return pdfBuffer;
    } finally {
      try { unlinkSync(tmpIn); } catch {}
      try { unlinkSync(tmpOut); } catch {}
    }
  } catch {
    return pdfBuffer;
  }
}

export class PdfSplitter {
  async split(pdfBuffer: Buffer): Promise<SplitResult> {
    const t0 = Date.now();
    console.log(`[Splitter] Loading PDF (${(pdfBuffer.length / 1024).toFixed(1)} KB)`);

    // Try pdf-lib first (fast, keeps PDF format)
    let splitResult = await this.tryPdfLib(pdfBuffer);
    if (splitResult) {
      return splitResult;
    }

    // pdf-lib failed — try qpdf repair then pdf-lib again
    console.log(`[Splitter] Retrying with qpdf repair…`);
    const repaired = tryRepairWithQpdf(pdfBuffer);
    if (repaired !== pdfBuffer) {
      console.log(`[Splitter] qpdf repair succeeded (${(repaired.length / 1024).toFixed(1)} KB) — retrying pdf-lib`);
      splitResult = await this.tryPdfLib(repaired);
      if (splitResult) {
        return splitResult;
      }
    }

    // All else failed — return original as single page
    console.log(`[Splitter] All split methods failed — returning original PDF as single page`);
    return { pageCount: 1, pageBuffers: [pdfBuffer] };
  }

  private async tryPdfLib(pdfBuffer: Buffer): Promise<SplitResult | null> {
    const t0 = Date.now();
    try {
      const srcDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true, throwOnInvalidObject: false });
      const pageCount = srcDoc.getPageCount();
      console.log(`[Splitter] PDF has ${pageCount} pages — extracting page buffers…`);

      const pageBuffers: Buffer[] = [];
      for (let i = 0; i < pageCount; i++) {
        try {
          const pt0 = Date.now();
          const singleDoc = await PDFDocument.create();
          const [copiedPage] = await singleDoc.copyPages(srcDoc, [i]);
          singleDoc.addPage(copiedPage);
          const bytes = await singleDoc.save();
          pageBuffers.push(Buffer.from(bytes));
          console.log(`[Splitter] Page ${i + 1}/${pageCount} extracted (${(bytes.length / 1024).toFixed(1)} KB, ${Date.now() - pt0}ms)`);
        } catch (pageErr) {
          console.warn(`[Splitter] Failed to extract page ${i + 1}: ${(pageErr as Error).message}`);
        }
      }

      if (pageBuffers.length === 0) {
        return null;
      }

      console.log(`[Splitter] Done — ${pageBuffers.length}/${pageCount} pages extracted in ${Date.now() - t0}ms`);
      return { pageCount: pageBuffers.length, pageBuffers };
    } catch (err) {
      console.warn(`[Splitter] pdf-lib failed: ${(err as Error).message}`);
      return null;
    }
  }
}
