import { describe, it, expect } from 'vitest';
import { PDFDocument, rgb } from 'pdf-lib';
import { RenderedPageCache } from '../../src/page-converter/rendered-page-cache';
import { cropFieldRegions } from '../../src/extractor/field-regions/field-region-extractor';
import type { ContractFieldRegion } from '../../src/extractor/field-regions/field-region.types';

const DPI = 200;

/** A one-page Letter-size PDF with a solid black rectangle at a known PDF-point location, on an otherwise white page. */
async function makeTestPdf(rect: { x: number; y: number; width: number; height: number }): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  page.drawRectangle({ x: rect.x, y: rect.y, width: rect.width, height: rect.height, color: rgb(0, 0, 0) });
  return Buffer.from(await doc.save());
}

function readPngDimensions(png: Buffer): { width: number; height: number } {
  expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  expect(png.subarray(12, 16).toString('ascii')).toBe('IHDR');
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

describe('cropFieldRegions', () => {
  it('crops a region at the expected pixel size, scaled by dpi/72 plus padding, and captures real ink', async () => {
    const inkRect = { x: 100, y: 600, width: 80, height: 20 };
    const pdfBuffer = await makeTestPdf(inkRect);
    const cache = new RenderedPageCache({ dpi: DPI });

    const region: ContractFieldRegion = { field: 'testField', page: 1, ...inkRect, padding: { x: 5, y: 5 } };
    const results = await cropFieldRegions(pdfBuffer, [region], cache);

    expect(results).toHaveLength(1);
    expect(results[0].field).toBe('testField');
    expect(results[0].page).toBe(1);

    const scale = DPI / 72;
    const expectedWidth = Math.round((inkRect.width + 2 * 5) * scale);
    const expectedHeight = Math.round((inkRect.height + 2 * 5) * scale);
    const dims = readPngDimensions(results[0].png);
    expect(dims.width).toBeCloseTo(expectedWidth, -1);
    expect(dims.height).toBeCloseTo(expectedHeight, -1);
  });

  it('skips a region whose page exceeds the document page count instead of throwing', async () => {
    const pdfBuffer = await makeTestPdf({ x: 100, y: 600, width: 80, height: 20 });
    const cache = new RenderedPageCache({ dpi: DPI });

    const results = await cropFieldRegions(
      pdfBuffer,
      [{ field: 'onlyOnPage2', page: 2, x: 0, y: 0, width: 10, height: 10 }],
      cache,
    );

    expect(results).toEqual([]);
  });

  it('reuses one rendered bitmap for multiple regions on the same page (cache hit)', async () => {
    const pdfBuffer = await makeTestPdf({ x: 100, y: 600, width: 80, height: 20 });
    const cache = new RenderedPageCache({ dpi: DPI });

    const regions: ContractFieldRegion[] = [
      { field: 'a', page: 1, x: 100, y: 600, width: 40, height: 20 },
      { field: 'b', page: 1, x: 140, y: 600, width: 40, height: 20 },
    ];
    const results = await cropFieldRegions(pdfBuffer, regions, cache);
    expect(results.map((r) => r.field)).toEqual(['a', 'b']);

    // getPage for the same (buffer, page) key must be memoized — same in-flight/resolved
    // promise handed back, not a fresh render each call.
    const pending = new Set<Promise<unknown>>();
    for (let i = 0; i < 3; i++) pending.add(cache.getPage(pdfBuffer, 1));
    expect(pending.size).toBe(1);
  });
});
