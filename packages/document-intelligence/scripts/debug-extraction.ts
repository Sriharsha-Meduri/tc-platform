import { DocumentIntelligencePipeline } from '../src/pipeline/document-intelligence';
import { readFileSync } from 'fs';
import { join } from 'path';

const GEMINI_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_KEY) {
  console.error('GEMINI_API_KEY env var required');
  process.exit(1);
}

async function main() {
  const pdfPaths = process.argv.slice(2);
  if (pdfPaths.length === 0) {
    console.error('Usage: npx tsx scripts/debug-extraction.ts <file1.pdf> [file2.pdf ...]');
    process.exit(1);
  }

  const pipeline = new DocumentIntelligencePipeline({
    identifier: { apiKey: GEMINI_KEY },
    extractor: { provider: 'gemini', apiKey: GEMINI_KEY },
  });

  // Merge PDFs into one buffer (same as controller mergePdfBuffers)
  const { PDFDocument } = await import('pdf-lib');
  const merged = await PDFDocument.create();
  for (const p of pdfPaths) {
    const buf = readFileSync(p);
    try {
      const src = await PDFDocument.load(buf, { ignoreEncryption: true });
      const pages = await merged.copyPages(src, src.getPageIndices());
      for (const page of pages) merged.addPage(page);
    } catch {
      console.warn(`Skipping corrupt PDF: ${p}`);
    }
  }
  const mergedBuf = Buffer.from(await merged.save());

  console.log(`\nProcessing ${pdfPaths.length} file(s)...\n`);

  const result = await pipeline.process(mergedBuf, {
    stage: 'CONTRACT',
    onProgress: (e) => process.stdout.write(`\r[${e.percent}%] ${e.message}  `),
  });

  process.stdout.write('\n\n');
  console.log(`Total pages: ${result.totalPages}`);
  console.log(`Form groups:`);
  result.formGroups.forEach((g) => {
    console.log(`  ${g.formCode}: pages ${g.pageIndices.map((i) => i + 1).join(', ')}`);
  });

  for (const ext of result.extractions) {
    if (ext.error) {
      console.log(`\n[ERROR] ${ext.formCode}: ${ext.error}`);
    } else {
      console.log(`\n── ${ext.formCode} ──`);
      console.log(JSON.stringify(ext.output?.data ?? {}, null, 2));
    }
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
