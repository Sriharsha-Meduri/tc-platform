import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib';
import * as fs from 'fs';
import * as path from 'path';
import { CDA_FIELD_MAPPINGS } from '../config/cda-field-mappings';
import { getCdaDisplayValue, resolveCdaValues } from './cda-calculator';
import type { CdaFieldMapping, CdaFieldName, CdaGenerationInput, PdfCoordinate, ResolvedCdaValues } from '../types/cda.types';

/**
 * Places already-calculated values into an already-loaded PDF at
 * already-configured coordinates — nothing in this file computes a total,
 * formats a currency amount, formats a date, or decides a default. That is
 * entirely cda-calculator.ts's job (via resolveCdaValues/getCdaDisplayValue);
 * this file's only job is drawing.
 *
 * Swapping templates/cda-template.pdf for the real, designed CDA form only
 * requires updating config/cda-field-mappings.ts's coordinates to match —
 * nothing here changes. See the module README notes in ../index.ts.
 */

const TEMPLATE_PATH = path.join(__dirname, '../templates/cda-template.pdf');

/** Loads the CDA PDF template from disk — the one place this module knows the template's location. Replacing the template file in place (same path, same name) requires no other code change. */
export async function loadCdaTemplate(): Promise<Buffer> {
  return fs.promises.readFile(TEMPLATE_PATH);
}

/** PNG and JPEG magic-byte sniffing — signature images can arrive as either, and we never guess based on a caller-supplied "type" that could be wrong. */
function detectImageFormat(buffer: Buffer): 'png' | 'jpeg' | null {
  if (buffer.length >= 4 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return 'png';
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpeg';
  return null;
}

/**
 * A signature may arrive as raw bytes or as a base64 string (optionally
 * prefixed `data:image/png;base64,`). Anything that doesn't decode to a
 * recognizable PNG/JPEG returns null — the caller then leaves the
 * signature area blank rather than throwing or falling back to text.
 */
function resolveSignatureBuffer(raw: Buffer | string): Buffer | null {
  if (Buffer.isBuffer(raw)) return raw;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const commaIndex = trimmed.indexOf(',');
  const base64Part = trimmed.startsWith('data:') && commaIndex !== -1 ? trimmed.slice(commaIndex + 1) : trimmed;
  const buffer = Buffer.from(base64Part, 'base64');
  return buffer.length > 0 ? buffer : null;
}

/**
 * Draws the signature image scaled proportionally to fit inside the
 * coordinate's bounding box (never stretched — aspect ratio is always
 * preserved) and centered within it. If there's no signature, or the data
 * isn't a recognizable image, the area is left blank — never rendered as
 * text, never throws.
 */
async function drawSignatureImage(pdfDoc: PDFDocument, page: PDFPage, raw: Buffer | string, coordinate: PdfCoordinate): Promise<void> {
  const buffer = resolveSignatureBuffer(raw);
  if (!buffer) return;

  const format = detectImageFormat(buffer);
  if (!format) return;

  const boxWidth = coordinate.width ?? 150;
  const boxHeight = coordinate.height ?? 50;

  const image = format === 'png' ? await pdfDoc.embedPng(buffer) : await pdfDoc.embedJpg(buffer);

  // "Contain" scaling — fit inside the box on whichever axis is the binding
  // constraint, preserving the image's own aspect ratio on the other.
  const scale = Math.min(boxWidth / image.width, boxHeight / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;

  // Center the scaled image within its configured bounding box.
  const x = coordinate.x + (boxWidth - drawWidth) / 2;
  const y = coordinate.y + (boxHeight - drawHeight) / 2;

  page.drawImage(image, { x, y, width: drawWidth, height: drawHeight });
}

/** Draws already-formatted text at a coordinate, honoring `width`+`alignment` when both are set. */
function drawAlignedText(page: PDFPage, text: string, coordinate: PdfCoordinate, font: PDFFont): void {
  const fontSize = coordinate.fontSize ?? 10;
  let x = coordinate.x;

  if (coordinate.width && coordinate.alignment && coordinate.alignment !== 'left') {
    const textWidth = font.widthOfTextAtSize(text, fontSize);
    if (coordinate.alignment === 'right') {
      x = coordinate.x + Math.max(0, coordinate.width - textWidth);
    } else if (coordinate.alignment === 'center') {
      x = coordinate.x + Math.max(0, (coordinate.width - textWidth) / 2);
    }
  }

  page.drawText(text, { x, y: coordinate.y, size: fontSize, font, color: rgb(0, 0, 0) });
}

/** Draws one field's value at one coordinate — routes to an image draw for 'signature', text for everything else. */
async function renderCdaField(pdfDoc: PDFDocument, value: string | Buffer, coordinate: PdfCoordinate, font: PDFFont): Promise<void> {
  const pageCount = pdfDoc.getPageCount();
  if (coordinate.page < 1 || coordinate.page > pageCount) {
    throw new Error(
      `CDA field mapping references page ${coordinate.page}, but the loaded template only has ${pageCount} page(s). ` +
      'Update config/cda-field-mappings.ts to match the current template.',
    );
  }
  const page = pdfDoc.getPage(coordinate.page - 1);

  if (coordinate.type === 'signature') {
    await drawSignatureImage(pdfDoc, page, value, coordinate);
    return;
  }

  drawAlignedText(page, String(value), coordinate, font);
}

/**
 * Iterates every mapped field once, resolving its display value a single
 * time (via getCdaDisplayValue), then draws that same value at every one of
 * the field's configured coordinates — this is what lets one field (e.g.
 * `agent`) automatically populate multiple locations in the PDF just by
 * having multiple entries in its mapping array. A field with no value
 * (null/empty) is skipped entirely — its area(s) stay blank, never printed
 * as "undefined"/"null"/"N/A"/"Not Specified".
 */
async function fillCdaFields(pdfDoc: PDFDocument, values: ResolvedCdaValues, mappings: CdaFieldMapping, font: PDFFont): Promise<void> {
  for (const [fieldName, coordinates] of Object.entries(mappings) as Array<[CdaFieldName, PdfCoordinate[]]>) {
    const value = getCdaDisplayValue(fieldName, values);
    if (value === null || value === undefined || value === '') continue;

    for (const coordinate of coordinates) {
      await renderCdaField(pdfDoc, value, coordinate, font);
    }
  }
}

/**
 * The module's one PDF-generation entry point:
 *   Load CDA template → Resolve CDA values → Load field mappings →
 *   Fill every mapped coordinate → Draw signature where applicable →
 *   Return generated PDF.
 *
 * Callers only ever provide business data (CdaGenerationInput) — they never
 * see or reason about a PDF coordinate.
 */
export async function generateCda(input: CdaGenerationInput): Promise<Buffer> {
  const values = resolveCdaValues(input);

  const templateBuffer = await loadCdaTemplate();
  const pdfDoc = await PDFDocument.load(templateBuffer);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  await fillCdaFields(pdfDoc, values, CDA_FIELD_MAPPINGS, font);

  return Buffer.from(await pdfDoc.save());
}
