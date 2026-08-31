import { describe, it, expect } from 'vitest';
import { toGrayscale, threshold, removePrintedLine, connectedComponentsWithStats } from '../../src/vision/connected-components';
import { analyzeSlotPixels } from '../../src/vision/slot-pixel-analysis';

/** Build a white RGBA buffer, then set the listed (x, y) pixels to black ink. */
function makeImage(width: number, height: number, inkPixels: Array<[number, number]> = []): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(width * height * 4).fill(255);
  for (const [x, y] of inkPixels) {
    const o = (y * width + x) * 4;
    rgba[o] = 0;
    rgba[o + 1] = 0;
    rgba[o + 2] = 0;
    rgba[o + 3] = 255;
  }
  return rgba;
}

/** All pixels in [x0,x1) x [y0,y1) as ink coordinates (a filled rectangle). */
function rect(x0: number, y0: number, x1: number, y1: number): Array<[number, number]> {
  const px: Array<[number, number]> = [];
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) px.push([x, y]);
  }
  return px;
}

describe('toGrayscale / threshold', () => {
  it('treats pure white as background and pure black as ink', () => {
    const rgba = makeImage(2, 1, [[0, 0]]); // pixel (0,0) black, (1,0) white
    const gray = toGrayscale(rgba, 2, 1);
    expect(gray[0]).toBeLessThan(10);
    expect(gray[1]).toBeGreaterThan(245);
    const mask = threshold(gray, 200);
    expect(Array.from(mask)).toEqual([1, 0]);
  });
});

describe('removePrintedLine', () => {
  it('removes a full-width thin horizontal line and nothing else', () => {
    const width = 20;
    const height = 10;
    // Row 5 entirely ink (the printed underline).
    const lineRow = Array.from({ length: width }, (_, x): [number, number] => [x, 5]);
    const rgba = makeImage(width, height, lineRow);
    const gray = toGrayscale(rgba, width, height);
    const mask = threshold(gray, 200);
    const cleaned = removePrintedLine(mask, width, height, 0.6);
    expect(Array.from(cleaned).every((v) => v === 0)).toBe(true);
  });

  it('preserves a real ink blob while removing the printed line', () => {
    const width = 20;
    const height = 10;
    const lineRow = Array.from({ length: width }, (_, x): [number, number] => [x, 5]);
    const blob = rect(8, 1, 12, 4); // a small 4x3 blob away from the line row
    const rgba = makeImage(width, height, [...lineRow, ...blob]);
    const gray = toGrayscale(rgba, width, height);
    const mask = threshold(gray, 200);
    const cleaned = removePrintedLine(mask, width, height, 0.6);

    let remaining = 0;
    for (const v of cleaned) remaining += v;
    expect(remaining).toBe(blob.length);
  });
});

describe('connectedComponentsWithStats', () => {
  it('finds zero components in a blank mask', () => {
    const mask = new Uint8Array(100);
    const result = connectedComponentsWithStats(mask, 10, 10);
    expect(result.count).toBe(0);
  });

  it('finds two separate components with correct area and bounding boxes', () => {
    const width = 20;
    const height = 20;
    const mask = new Uint8Array(width * height);
    // Blob A: 3x3 square at (1,1)-(3,3)
    for (let y = 1; y < 4; y++) for (let x = 1; x < 4; x++) mask[y * width + x] = 1;
    // Blob B: 2x2 square at (15,15)-(16,16), far away (not 8-connected to A)
    for (let y = 15; y < 17; y++) for (let x = 15; x < 17; x++) mask[y * width + x] = 1;

    const result = connectedComponentsWithStats(mask, width, height);
    expect(result.count).toBe(2);
    const areas = result.components.map((c) => c.area).sort((a, b) => a - b);
    expect(areas).toEqual([4, 9]);

    const big = result.components.find((c) => c.area === 9)!;
    expect(big.boundingBox).toEqual({ x: 1, y: 1, width: 3, height: 3 });
  });

  it('merges diagonally-touching pixels under 8-connectivity', () => {
    const width = 10;
    const height = 10;
    const mask = new Uint8Array(width * height);
    mask[2 * width + 2] = 1;
    mask[3 * width + 3] = 1; // diagonal neighbor of the above
    const result = connectedComponentsWithStats(mask, width, height);
    expect(result.count).toBe(1);
    expect(result.components[0].area).toBe(2);
  });
});

describe('analyzeSlotPixels', () => {
  it('reports a blank slot as not present', () => {
    const width = 40;
    const height = 40;
    const rgba = makeImage(width, height, []);
    const result = analyzeSlotPixels(rgba, width, height);
    expect(result.initialsPresent).toBe(false);
    expect(result.darkPixelRatio).toBe(0);
    expect(result.largestComponentArea).toBe(0);
    expect(result.boundingBox).toBeNull();
  });

  it('reports a slot with a real ink blob as present', () => {
    const width = 40;
    const height = 40;
    const blob = rect(15, 15, 25, 25); // 10x10 = 100px blob, well above the default floor
    const rgba = makeImage(width, height, blob);
    const result = analyzeSlotPixels(rgba, width, height);
    expect(result.initialsPresent).toBe(true);
    expect(result.largestComponentArea).toBe(100);
    expect(result.boundingBox).toEqual({ x: 15, y: 15, width: 10, height: 10 });
  });

  it('does not treat the printed underline alone as initials', () => {
    const width = 40;
    const height = 10;
    const lineRow = Array.from({ length: width }, (_, x): [number, number] => [x, 8]);
    const rgba = makeImage(width, height, lineRow);
    const result = analyzeSlotPixels(rgba, width, height);
    expect(result.initialsPresent).toBe(false);
  });

  it('still detects real ink when the printed underline is also present', () => {
    const width = 40;
    const height = 40;
    const lineRow = Array.from({ length: width }, (_, x): [number, number] => [x, 38]);
    const blob = rect(15, 10, 25, 20); // 10x10 blob away from the line
    const rgba = makeImage(width, height, [...lineRow, ...blob]);
    const result = analyzeSlotPixels(rgba, width, height);
    expect(result.initialsPresent).toBe(true);
    expect(result.largestComponentArea).toBe(100);
  });

  it('does not treat a few isolated scan-noise pixels as initials', () => {
    const width = 100;
    const height = 100;
    // Five isolated single-pixel specks scattered around -- classic scan noise.
    const noise: Array<[number, number]> = [[5, 5], [50, 12], [80, 90], [20, 60], [70, 30]];
    const rgba = makeImage(width, height, noise);
    const result = analyzeSlotPixels(rgba, width, height);
    expect(result.initialsPresent).toBe(false);
    expect(result.componentCount).toBe(5);
    expect(result.largestComponentArea).toBe(1);
  });
});
