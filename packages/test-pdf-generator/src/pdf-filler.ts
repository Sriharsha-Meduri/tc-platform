import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { getCoordinates } from './coordinates';
import { resolveTemplatePath } from './templates';
import { Scenario, FillOptions, isFieldValue } from './types';

function flatten(obj: Record<string, unknown>, prefix = ''): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(result, flatten(value as Record<string, unknown>, path));
    } else if (Array.isArray(value)) {
      value.forEach((item, i) => {
        if (item !== null && typeof item === 'object') {
          Object.assign(result, flatten(item as Record<string, unknown>, `${path}.${i}`));
        } else {
          result[`${path}.${i}`] = item;
        }
      });
    } else {
      result[path] = value;
    }
  }
  return result;
}

function tmpPath(suffix: string): string {
  return path.join(os.tmpdir(), `tc-pdf-${process.pid}-${suffix}`);
}

async function createOverlayPdf(
  formCode: string,
  data: Record<string, unknown>,
  pageCount: number,
  pageWidth: number,
  pageHeight: number,
  state = 'ca',
): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  for (let i = 0; i < pageCount; i++) {
    doc.addPage([pageWidth, pageHeight]);
  }

  const pages = doc.getPages();
  const coordinates = getCoordinates(formCode, state);
  const flatData = flatten(data);

  for (const group of coordinates) {
    const pageIdx = group.pageNumber - 1;
    if (pageIdx < 0 || pageIdx >= pages.length) continue;
    const page = pages[pageIdx];

    for (const [jsonPath, region] of Object.entries(group.fields)) {
      const value = flatData[jsonPath];

      if (value === null || value === undefined) continue;

      if (region.isCheckbox) {
        if (value === true || value === 'true' || value === 'yes' || value === 'X' || value === 'x') {
          page.drawText('X', { x: region.x, y: region.y - 4, size: region.fontSize ?? 12, font: fontBold, color: rgb(0, 0, 0) });
        }
        continue;
      }

      const rawValue = String(value);
      if (!rawValue) continue;
      const textValue = region.prefix ? region.prefix + rawValue : rawValue;

      const fontSize = region.fontSize ?? 9;
      const lineHeight = region.lineHeight ?? fontSize * 1.2;
      const maxWidth = region.w;

      const words = textValue.split(/\s+/);
      const lines: string[] = [];
      let currentLine = '';
      for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        if (font.widthOfTextAtSize(testLine, fontSize) > maxWidth && currentLine) {
          lines.push(currentLine);
          currentLine = word;
        } else {
          currentLine = testLine;
        }
      }
      if (currentLine) lines.push(currentLine);

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineWidth = font.widthOfTextAtSize(line, fontSize);
        let x = region.x;

        if (region.align === 'right') {
          x = region.x + region.w - Math.min(lineWidth, maxWidth);
        } else if (region.align === 'center') {
          x = region.x + Math.max(0, region.w - lineWidth) / 2;
        }

        page.drawText(line, { x: line === 'X' ? x - 3 : x, y: region.y - 2 - i * lineHeight, size: fontSize, font, color: rgb(0, 0, 0), maxWidth });
      }
    }
  }

  return Buffer.from(await doc.save());
}

function unwrapFieldValues(data: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (isFieldValue(value)) {
      if (value.enabled) {
        result[key] = value.value;
      }
    } else if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = unwrapFieldValues(value as Record<string, unknown>);
    } else if (Array.isArray(value)) {
      result[key] = value.map((item) =>
        item !== null && typeof item === 'object'
          ? unwrapFieldValues(item as Record<string, unknown>)
          : item,
      );
    } else {
      result[key] = value;
    }
  }
  return result;
}

async function fillFormInternal(
  formCode: string,
  data: Record<string, unknown>,
  options?: FillOptions,
  state = 'ca',
): Promise<Buffer> {
  const tmplPath = resolveTemplatePath(formCode, state);
  const templateBuf = fs.readFileSync(tmplPath);

  const infoDoc = await PDFDocument.load(templateBuf);
  const pageCount = infoDoc.getPageCount();
  const firstPage = infoDoc.getPage(0);
  const { width: pageWidth, height: pageHeight } = firstPage.getSize();

  const unwrapped = unwrapFieldValues(data);
  const overlayBuf = await createOverlayPdf(formCode, unwrapped, pageCount, pageWidth, pageHeight, state);

  const tmplTmp = tmpPath('template.pdf');
  const overlayTmp = tmpPath('overlay.pdf');
  const outTmp = tmpPath('output.pdf');

  try {
    fs.writeFileSync(tmplTmp, templateBuf);
    fs.writeFileSync(overlayTmp, overlayBuf);

    try {
      execSync(
        `qpdf --overlay ${JSON.stringify(overlayTmp)} -- ${JSON.stringify(tmplTmp)} ${JSON.stringify(outTmp)}`,
        { stdio: 'pipe', timeout: 30000 },
      );
    } catch (e: any) {
      // qpdf exit code 3 = warnings, file is still valid
      if (e.status && e.status > 3) throw e;
    }

    return fs.readFileSync(outTmp);
  } finally {
    for (const f of [tmplTmp, overlayTmp, outTmp]) {
      try { fs.unlinkSync(f); } catch {}
    }
  }
}

export async function generateScenarioFiles(
  scenario: Scenario,
  outputDir: string,
): Promise<string[]> {
  if (scenario.forms.length === 0) {
    throw new Error('Scenario must have at least one form');
  }

  const dir = path.join(outputDir, scenario.name);
  fs.mkdirSync(dir, { recursive: true });

  const files: string[] = [];
  const formCodeCounts = scenario.forms.reduce((acc, f) => {
    acc[f.formCode] = (acc[f.formCode] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  for (let i = 0; i < scenario.forms.length; i++) {
    const { formCode, data, label, state } = scenario.forms[i];
    const suffix = label ?? (formCodeCounts[formCode] > 1 ? String(i) : '');
    const filename = suffix ? `${formCode}-${suffix}.pdf` : `${formCode}.pdf`;
    const filepath = path.join(dir, filename);
    const buf = await fillFormInternal(formCode, data, undefined, state);
    fs.writeFileSync(filepath, buf);
    files.push(filepath);
  }

  return files;
}
