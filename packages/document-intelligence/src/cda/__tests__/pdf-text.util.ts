// Test-only helper — extracts per-page text from a generated PDF buffer so
// tests can assert on what actually ended up in the document, not just that
// generateCda() didn't throw. Mirrors the same pdfjs-dist usage pattern
// already established in src/identifier/form-identifier.ts.

export async function extractPdfPageTexts(pdfBuffer: Buffer): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(pdfBuffer) }).promise;
  try {
    const pageTexts: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const text = (content.items as Array<{ str?: string }>)
        .map((item) => item.str ?? '')
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      pageTexts.push(text);
    }
    return pageTexts;
  } finally {
    await doc.destroy().catch(() => {});
  }
}
