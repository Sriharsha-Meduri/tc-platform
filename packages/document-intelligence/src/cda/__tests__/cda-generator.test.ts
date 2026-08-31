import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { generateCda } from '../services/cda-generator';
import { CDA_FIELD_MAPPINGS } from '../config/cda-field-mappings';
import type { CdaGenerationInput } from '../types/cda.types';
import { extractPdfPageTexts } from './pdf-text.util';

// A well-known minimal, valid 1x1 transparent PNG — small enough to inline,
// real enough for pdf-lib's embedPng to accept and pdfjs to open without error.
const MINIMAL_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

const FULL_INPUT: CdaGenerationInput = {
  brokerage: 'Sunset Realty',
  brokerName: 'Jane Broker',
  agent: 'Bob Agent',
  escrowNumber: 'ESC-98765',
  salePrice: 825000,
  closeOfEscrowDate: new Date(2026, 6, 15),
  clientCredits: 1200,
  brokerageAddress: '123 Sunset Blvd, Los Angeles, CA 90001',
  agentAddress: '456 Agent Ave, Los Angeles, CA 90002',
  brokerCommissionAmount: 20625,
  agentCommissionAmount: 12375,
  mytcAppCommissionAmount: 500,
  brokerSignature: Buffer.from(MINIMAL_PNG_BASE64, 'base64'),
  date: new Date(2026, 6, 20),
};

const MINIMAL_INPUT: CdaGenerationInput = {
  brokerage: 'Sunset Realty',
  brokerName: 'Jane Broker',
  agent: 'Bob Agent',
  salePrice: 500000,
};

describe('generateCda — end-to-end PDF generation', () => {
  it('produces a PDF that opens successfully and has the template\'s page count', async () => {
    const pdfBuffer = await generateCda(MINIMAL_INPUT);
    const reopened = await PDFDocument.load(pdfBuffer);
    expect(reopened.getPageCount()).toBe(2);
  });

  it('renders every required field\'s value somewhere in the document', async () => {
    const pdfBuffer = await generateCda(FULL_INPUT);
    const pageTexts = await extractPdfPageTexts(pdfBuffer);
    const fullText = pageTexts.join(' ');

    expect(fullText).toContain('Sunset Realty');
    expect(fullText).toContain('Jane Broker');
    expect(fullText).toContain('Bob Agent');
    expect(fullText).toContain('ESC-98765');
    expect(fullText).toContain('$825,000.00');
    expect(fullText).toContain('07-15-2026'); // closeOfEscrowDate
    expect(fullText).toContain('$1,200.00'); // clientCredits
    expect(fullText).toContain('$33,500.00'); // totalCommissionToDisburse = 20625 + 12375 + 500
    expect(fullText).toContain('123 Sunset Blvd, Los Angeles, CA 90001');
    expect(fullText).toContain('456 Agent Ave, Los Angeles, CA 90002');
    expect(fullText).toContain('$20,625.00'); // brokerCommissionAmount
    expect(fullText).toContain('$12,375.00'); // agentCommissionAmount
    expect(fullText).toContain('$500.00'); // mytcAppCommissionAmount
    expect(fullText).toContain('07-20-2026'); // date
  });

  it('renders currency amounts formatted, not as raw numbers', async () => {
    const pdfBuffer = await generateCda(FULL_INPUT);
    const fullText = (await extractPdfPageTexts(pdfBuffer)).join(' ');
    expect(fullText).not.toContain('825000');
    expect(fullText).not.toContain('33500');
  });

  it('renders dates formatted as MM-DD-YYYY, not a raw ISO/Date string', async () => {
    const pdfBuffer = await generateCda(FULL_INPUT);
    const fullText = (await extractPdfPageTexts(pdfBuffer)).join(' ');
    expect(fullText).not.toContain('2026-07-15');
    expect(fullText).not.toMatch(/GMT|UTC/);
  });

  it('renders explicit zero client credits as $0.00, not skipped and not blank', async () => {
    const pdfBuffer = await generateCda({ ...MINIMAL_INPUT, clientCredits: 0 });
    const fullText = (await extractPdfPageTexts(pdfBuffer)).join(' ');
    expect(fullText).toContain('$0.00');
  });

  it('renders a $0.00 total when every commission leg is zero (or omitted)', async () => {
    const pdfBuffer = await generateCda({
      ...MINIMAL_INPUT,
      brokerCommissionAmount: 0,
      agentCommissionAmount: 0,
      mytcAppCommissionAmount: 0,
    });
    const fullText = (await extractPdfPageTexts(pdfBuffer)).join(' ');
    expect(fullText).toContain('$0.00');
  });

  it('draws a field with multiple coordinate mappings ("agent") at every configured location, across pages', async () => {
    const pdfBuffer = await generateCda(FULL_INPUT);
    const pageTexts = await extractPdfPageTexts(pdfBuffer);
    expect(CDA_FIELD_MAPPINGS.agent.length).toBeGreaterThan(1);
    expect(pageTexts[0]).toContain('Bob Agent');
    expect(pageTexts[1]).toContain('Bob Agent');
  });

  it('never prints "undefined", "null", "N/A", or "Not Specified" for a missing optional field', async () => {
    const pdfBuffer = await generateCda(MINIMAL_INPUT); // omits every optional field except commissions (which default to $0.00)
    const fullText = (await extractPdfPageTexts(pdfBuffer)).join(' ');
    expect(fullText).not.toMatch(/undefined/i);
    expect(fullText).not.toMatch(/\bnull\b/i);
    expect(fullText).not.toMatch(/N\/A/);
    expect(fullText).not.toMatch(/Not Specified/i);
  });

  it('leaves the signature area blank (no error, no text) when no signature is supplied', async () => {
    const pdfBuffer = await generateCda(MINIMAL_INPUT);
    const reopened = await PDFDocument.load(pdfBuffer);
    expect(reopened.getPageCount()).toBe(2); // generation still succeeds
  });

  it('embeds a real signature image without throwing, and the output stays a valid, larger PDF', async () => {
    const withoutSignature = await generateCda(MINIMAL_INPUT);
    const withSignature = await generateCda({ ...MINIMAL_INPUT, brokerSignature: Buffer.from(MINIMAL_PNG_BASE64, 'base64') });
    const reopened = await PDFDocument.load(withSignature);
    expect(reopened.getPageCount()).toBe(2);
    expect(withSignature.length).toBeGreaterThan(withoutSignature.length); // the embedded image added real bytes
  });

  it('accepts a base64-encoded signature string (not just a raw Buffer) and a data: URI prefix', async () => {
    const asPlainBase64 = await generateCda({ ...MINIMAL_INPUT, brokerSignature: MINIMAL_PNG_BASE64 });
    const asDataUri = await generateCda({ ...MINIMAL_INPUT, brokerSignature: `data:image/png;base64,${MINIMAL_PNG_BASE64}` });
    expect((await PDFDocument.load(asPlainBase64)).getPageCount()).toBe(2);
    expect((await PDFDocument.load(asDataUri)).getPageCount()).toBe(2);
  });

  it('leaves the signature area blank rather than throwing when signature data is unrecognizable garbage', async () => {
    const pdfBuffer = await generateCda({ ...MINIMAL_INPUT, brokerSignature: 'this is not an image' });
    const reopened = await PDFDocument.load(pdfBuffer);
    expect(reopened.getPageCount()).toBe(2);
  });
});

describe('generateCda — coordinate changes are isolated to cda-field-mappings.ts', () => {
  it('moving a field\'s coordinate in CDA_FIELD_MAPPINGS changes where it renders, with no other code touched', async () => {
    const original = CDA_FIELD_MAPPINGS.brokerage[0];
    const savedX = original.x;
    const savedY = original.y;
    try {
      const before = await generateCda(MINIMAL_INPUT);
      const beforeItem = await findTextItem(before, 'Sunset Realty');
      expect(beforeItem).not.toBeNull();

      original.x = savedX + 150;
      original.y = savedY + 30;

      const after = await generateCda(MINIMAL_INPUT);
      const afterItem = await findTextItem(after, 'Sunset Realty');
      expect(afterItem).not.toBeNull();

      // Same text, different on-page position — purely a config change, no generator/calculator edits.
      expect(afterItem!.x).not.toBeCloseTo(beforeItem!.x, 0);
    } finally {
      original.x = savedX;
      original.y = savedY;
    }
  });
});

describe('generateCda — the template can be replaced without touching calculation logic', () => {
  const templatePath = path.join(__dirname, '../templates/cda-template.pdf');
  let originalTemplateBytes: Buffer | null = null;

  afterEach(() => {
    if (originalTemplateBytes) {
      fs.writeFileSync(templatePath, originalTemplateBytes);
      originalTemplateBytes = null;
    }
  });

  it('generates correctly-calculated output against a swapped-in replacement template, unmodified', async () => {
    originalTemplateBytes = fs.readFileSync(templatePath);

    // A different, independently-built 2-page template — standing in for a
    // real "replace the PDF template" swap. No cda-calculator.ts or
    // cda-generator.ts code changes; only the template file on disk changes.
    const replacementDoc = await PDFDocument.create();
    const font = await replacementDoc.embedFont(StandardFonts.Helvetica);
    for (let i = 0; i < 2; i++) {
      const page = replacementDoc.addPage([612, 792]);
      page.drawText('REPLACEMENT TEMPLATE', { x: 50, y: 760, size: 12, font, color: rgb(0, 0, 0) });
    }
    fs.writeFileSync(templatePath, await replacementDoc.save());

    const pdfBuffer = await generateCda({
      ...MINIMAL_INPUT,
      brokerCommissionAmount: 9000,
      agentCommissionAmount: 3000,
      mytcAppCommissionAmount: 1000,
    });

    const reopened = await PDFDocument.load(pdfBuffer);
    expect(reopened.getPageCount()).toBe(2);

    const fullText = (await extractPdfPageTexts(pdfBuffer)).join(' ');
    expect(fullText).toContain('REPLACEMENT TEMPLATE'); // proves the new template was actually used
    expect(fullText).toContain('$13,000.00'); // totalCommissionToDisburse math is unaffected by the template swap
  });
});

/** Finds the first pdfjs text-content item whose string exactly matches `text`, returning its page position (PDF points). */
async function findTextItem(pdfBuffer: Buffer, text: string): Promise<{ page: number; x: number; y: number } | null> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(pdfBuffer) }).promise;
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      for (const item of content.items as Array<{ str?: string; transform: number[] }>) {
        if (item.str === text) {
          return { page: i, x: item.transform[4], y: item.transform[5] };
        }
      }
    }
    return null;
  } finally {
    await doc.destroy().catch(() => {});
  }
}
