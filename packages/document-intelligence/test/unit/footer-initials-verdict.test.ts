import { describe, it, expect } from 'vitest';
import { inflateSync } from 'zlib';
import { encodePng } from '../../src/vision/png-encoder';
import { resolveFooterInitialVerdict } from '../../src/vision/footer-initials-vision';
import type { InitialSlotDetection } from '../../src/vision/slot-pixel-analysis';

function pixel(initialsPresent: boolean): InitialSlotDetection {
  return {
    initialsPresent,
    darkPixelRatio: initialsPresent ? 0.12 : 0.001,
    componentCount: initialsPresent ? 3 : 0,
    largestComponentArea: initialsPresent ? 42 : 0,
    boundingBox: initialsPresent ? { x: 1, y: 2, width: 8, height: 9 } : null,
  };
}

describe('resolveFooterInitialVerdict', () => {
  it('is present when EITHER signal finds an initial', () => {
    expect(resolveFooterInitialVerdict(pixel(true), 'present')).toBe('present');
    expect(resolveFooterInitialVerdict(pixel(true), 'absent')).toBe('present');
    expect(resolveFooterInitialVerdict(pixel(true), undefined)).toBe('present');
    expect(resolveFooterInitialVerdict(pixel(false), 'present')).toBe('present');
    expect(resolveFooterInitialVerdict(null, 'present')).toBe('present');
  });

  it('is absent ONLY when both signals independently say there is no initial', () => {
    expect(resolveFooterInitialVerdict(pixel(false), 'absent')).toBe('absent');
  });

  it('keeps the LLM value when the signals are inconclusive', () => {
    // pixel unknown + gemini absent: only one signal concluded absent
    expect(resolveFooterInitialVerdict(null, 'absent')).toBe('keep');
    // pixel absent + gemini unknown: only one signal concluded absent
    expect(resolveFooterInitialVerdict(pixel(false), undefined)).toBe('keep');
    // both unknown
    expect(resolveFooterInitialVerdict(null, undefined)).toBe('keep');
  });
});

describe('encodePng', () => {
  it('produces a structurally valid PNG for an RGBA buffer', () => {
    const width = 12;
    const height = 5;
    const rgba = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      rgba[i * 4] = (i * 7) % 256;
      rgba[i * 4 + 1] = (i * 13) % 256;
      rgba[i * 4 + 2] = (i * 29) % 256;
      rgba[i * 4 + 3] = 255;
    }

    const png = encodePng(rgba, width, height);

    // Signature
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

    // IHDR: length 13, type, width/height, 8-bit RGBA
    expect(png.readUInt32BE(8)).toBe(13);
    expect(png.subarray(12, 16).toString('ascii')).toBe('IHDR');
    expect(png.readUInt32BE(16)).toBe(width);
    expect(png.readUInt32BE(20)).toBe(height);
    expect(png[24]).toBe(8); // bit depth
    expect(png[25]).toBe(6); // color type RGBA

    // IDAT: inflating must recover each scanline (filter byte 0 + RGBA row)
    let offset = 33;
    let idat: Buffer | null = null;
    while (offset < png.length) {
      const length = png.readUInt32BE(offset);
      const type = png.subarray(offset + 4, offset + 8).toString('ascii');
      if (type === 'IDAT') {
        idat = png.subarray(offset + 8, offset + 8 + length);
        break;
      }
      offset += 12 + length;
    }
    expect(idat).not.toBeNull();

    const raw = inflateSync(idat!);
    const stride = width * 4;
    expect(raw.length).toBe((stride + 1) * height);
    for (let y = 0; y < height; y++) {
      const rowStart = y * (stride + 1);
      expect(raw[rowStart]).toBe(0); // filter: none
      for (let x = 0; x < stride; x++) {
        expect(raw[rowStart + 1 + x]).toBe(rgba[y * stride + x]);
      }
    }
  });
});
