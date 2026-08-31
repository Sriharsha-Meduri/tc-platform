import { toGrayscale, threshold, removePrintedLine, connectedComponentsWithStats, type BoundingBox } from './connected-components';

export type { BoundingBox };

/**
 * Deterministic pixel-level verdict for one initials slot. Ground truth
 * from image analysis, not a vision model's judgment call — a slot is
 * "present" only when it contains a connected blob of meaningful,
 * non-template ink, not merely because something looked letter-shaped.
 */
export interface InitialSlotDetection {
  initialsPresent: boolean;
  darkPixelRatio: number;
  componentCount: number;
  largestComponentArea: number;
  boundingBox: BoundingBox | null;
}

export interface SlotPixelAnalysisOptions {
  /** Grayscale value (0-255) below which a pixel counts as ink. Default 200. */
  darkThreshold?: number;
  /** Row ink-fraction above which a row is treated as the printed line and removed. Default 0.6. */
  lineFraction?: number;
  /** Minimum connected-component area, as a fraction of total slot pixels, to count as meaningful ink rather than scan noise. Default 0.002 (0.2%). */
  minComponentAreaFraction?: number;
  /** Absolute floor for minimum component area regardless of slot size (px). Default 8. */
  minComponentAreaFloor?: number;
  /** Minimum overall dark-pixel ratio (post line-removal) required for initialsPresent. Default 0.01 (1%). */
  minDarkPixelRatio?: number;
}

/**
 * Analyze one slot's raw RGBA pixel data and determine whether it contains
 * meaningful ink.
 *
 * Pipeline: grayscale -> binary threshold -> printed-line removal ->
 * connected-component labeling -> largest-component + overall-density check.
 */
export function analyzeSlotPixels(
  rgba: ArrayLike<number>,
  width: number,
  height: number,
  options: SlotPixelAnalysisOptions = {},
): InitialSlotDetection {
  const {
    darkThreshold = 200,
    lineFraction = 0.6,
    minComponentAreaFraction = 0.002,
    minComponentAreaFloor = 8,
    minDarkPixelRatio = 0.01,
  } = options;

  const totalPixels = width * height;
  if (totalPixels === 0) {
    return { initialsPresent: false, darkPixelRatio: 0, componentCount: 0, largestComponentArea: 0, boundingBox: null };
  }

  const gray = toGrayscale(rgba, width, height);
  const rawMask = threshold(gray, darkThreshold);
  const mask = removePrintedLine(rawMask, width, height, lineFraction);

  let darkPixels = 0;
  for (let i = 0; i < mask.length; i++) darkPixels += mask[i];
  const darkPixelRatio = darkPixels / totalPixels;

  const { count, components } = connectedComponentsWithStats(mask, width, height);

  let largestComponentArea = 0;
  let boundingBox: BoundingBox | null = null;
  for (const c of components) {
    if (c.area > largestComponentArea) {
      largestComponentArea = c.area;
      boundingBox = c.boundingBox;
    }
  }

  const minComponentArea = Math.max(minComponentAreaFloor, Math.round(totalPixels * minComponentAreaFraction));
  const initialsPresent = largestComponentArea >= minComponentArea && darkPixelRatio >= minDarkPixelRatio;

  return {
    initialsPresent,
    darkPixelRatio,
    componentCount: count,
    largestComponentArea,
    boundingBox,
  };
}
