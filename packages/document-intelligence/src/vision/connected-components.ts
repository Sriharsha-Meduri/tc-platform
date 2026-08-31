/**
 * Pure-TypeScript pixel/connected-component analysis — no OpenCV or other
 * native binding. Deterministic ground truth for "is there ink in this
 * region" that doesn't depend on a vision model's perception of a small
 * mark, which is what drives false missing-initials reports.
 */

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ComponentStats {
  area: number;
  boundingBox: BoundingBox;
}

export interface ConnectedComponentsResult {
  count: number;
  components: ComponentStats[];
}

/**
 * Convert interleaved RGBA pixel data to single-channel grayscale (0-255),
 * compositing over a white background using the alpha channel first (a
 * fully transparent pixel is treated as white/blank paper, not black).
 */
export function toGrayscale(rgba: ArrayLike<number>, width: number, height: number): Uint8Array {
  const gray = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    const r = rgba[o] ?? 255;
    const g = rgba[o + 1] ?? 255;
    const b = rgba[o + 2] ?? 255;
    const a = rgba[o + 3] ?? 255;
    const cr = (r * a + 255 * (255 - a)) / 255;
    const cg = (g * a + 255 * (255 - a)) / 255;
    const cb = (b * a + 255 * (255 - a)) / 255;
    gray[i] = Math.round(0.299 * cr + 0.587 * cg + 0.114 * cb);
  }
  return gray;
}

/** Binary threshold: 1 = "ink" (darker than `darkThreshold`), 0 = background/paper. */
export function threshold(gray: ArrayLike<number>, darkThreshold = 200): Uint8Array {
  const mask = new Uint8Array(gray.length);
  for (let i = 0; i < gray.length; i++) {
    mask[i] = gray[i] < darkThreshold ? 1 : 0;
  }
  return mask;
}

/**
 * Remove the printed horizontal initials/signature line from a binary mask.
 *
 * The printed line is a long, thin, nearly full-width run of ink. Any row
 * where the ink pixel count meets `minLineFraction` of the row width is
 * treated as (part of) the printed line and zeroed — this only clears that
 * row, so a genuine ink stroke that merely crosses the same row elsewhere
 * in a multi-row blob is unaffected on its other rows.
 */
export function removePrintedLine(
  mask: Uint8Array,
  width: number,
  height: number,
  minLineFraction = 0.6,
): Uint8Array {
  const out = new Uint8Array(mask);
  const lineThreshold = width * minLineFraction;
  for (let y = 0; y < height; y++) {
    const rowStart = y * width;
    let rowCount = 0;
    for (let x = 0; x < width; x++) {
      rowCount += mask[rowStart + x];
    }
    if (rowCount >= lineThreshold) {
      out.fill(0, rowStart, rowStart + width);
    }
  }
  return out;
}

/**
 * 8-connectivity connected-component labeling over a binary mask via
 * iterative flood fill (BFS). Returns per-component pixel area and
 * bounding box — equivalent in spirit to OpenCV's
 * connectedComponentsWithStats(), without the native dependency.
 */
export function connectedComponentsWithStats(
  mask: Uint8Array,
  width: number,
  height: number,
): ConnectedComponentsResult {
  const visited = new Uint8Array(mask.length);
  const components: ComponentStats[] = [];
  const queue = new Int32Array(mask.length);

  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || visited[start]) continue;

    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    visited[start] = 1;

    let area = 0;
    let minX = width;
    let maxX = -1;
    let minY = height;
    let maxY = -1;

    while (head < tail) {
      const idx = queue[head++];
      const x = idx % width;
      const y = (idx - x) / width;
      area++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;

      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          const nIdx = ny * width + nx;
          if (mask[nIdx] && !visited[nIdx]) {
            visited[nIdx] = 1;
            queue[tail++] = nIdx;
          }
        }
      }
    }

    components.push({
      area,
      boundingBox: { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 },
    });
  }

  return { count: components.length, components };
}
