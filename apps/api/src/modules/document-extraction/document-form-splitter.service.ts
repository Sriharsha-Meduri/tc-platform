import { Injectable, Logger } from '@nestjs/common';
import type { FormExtractionResult } from '@tc/document-intelligence';

export interface FormSplitPart {
  buffer: Buffer;
  /** 1-indexed, inclusive */
  pageStart: number;
  /** 1-indexed, inclusive */
  pageEnd: number;
}

/**
 * Splits a combined PDF into one buffer per detected form, using qpdf for
 * reliable page extraction (pdf-lib's ignoreEncryption flag garbles content
 * streams on some scanned PDFs; qpdf handles every PDF type this app sees).
 *
 * Extracted out of DocumentExtractionController's private buildPerFormPdfs —
 * that controller's authenticated extract-and-draft/upload-and-extract flows
 * and the secure upload-link flow both need the exact same split behavior,
 * so this is the one place it's implemented.
 */
@Injectable()
export class DocumentFormSplitterService {
  private readonly logger = new Logger(DocumentFormSplitterService.name);

  async splitByForm(
    sourceBuffer: Buffer,
    extractions: FormExtractionResult[],
  ): Promise<Map<string, FormSplitPart>> {
    const result = new Map<string, FormSplitPart>();
    if (extractions.length === 0) return result;

    const { writeFile, readFile, unlink } = await import('fs/promises');
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    const tmpIn = `/tmp/split-src-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`;
    await writeFile(tmpIn, sourceBuffer);

    try {
      for (const fe of extractions) {
        if (!fe.output || fe.pageIndices.length === 0) continue;

        const pageStart = Math.min(...fe.pageIndices) + 1;
        const pageEnd = Math.max(...fe.pageIndices) + 1;
        const pageRange = pageStart === pageEnd
          ? String(pageStart)
          : `${pageStart}-${pageEnd}`;

        const tmpOut = `/tmp/split-out-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`;
        try {
          await execAsync(`qpdf --empty --pages "${tmpIn}" ${pageRange} -- "${tmpOut}"`);
          const output = await readFile(tmpOut);
          if (output.length > 0) {
            result.set(fe.formCode.toUpperCase(), { buffer: output, pageStart, pageEnd });
          }
        } catch (pageErr) {
          this.logger.warn(`[splitByForm] qpdf page extraction failed for ${fe.formCode}: ${(pageErr as Error).message}`);
        } finally {
          await unlink(tmpOut).catch(() => {});
        }
      }
    } finally {
      await unlink(tmpIn).catch(() => {});
    }

    return result;
  }
}
