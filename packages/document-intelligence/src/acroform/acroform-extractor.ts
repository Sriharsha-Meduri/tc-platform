import {
  PDFDocument,
  PDFTextField,
  PDFCheckBox,
  PDFRadioGroup,
  PDFDropdown,
  PDFSignature,
  PDFName,
} from 'pdf-lib';
import type { AcroFieldInfo } from '../validator/validator.types';

export interface AcroFormExtractionResult {
  hasAcroForm: boolean;
  fieldCount: number;
  fields: AcroFieldInfo[];
  signatureFields: AcroFieldInfo[];
  emptyValueFields: AcroFieldInfo[];
  formTitle: string | null;
  pageCount: number;
}

export class AcroFormExtractor {
  async extract(buffer: Buffer): Promise<AcroFormExtractionResult> {
    try {
      return await this.doExtract(buffer);
    } catch {
      return this.emptyResult(0);
    }
  }

  private async doExtract(buffer: Buffer): Promise<AcroFormExtractionResult> {
    let doc: PDFDocument;
    try {
      doc = await PDFDocument.load(buffer, {
        ignoreEncryption: true,
        throwOnInvalidObject: false,
      });
    } catch {
      return this.emptyResult(0);
    }

    let pageCount = 0;
    try {
      pageCount = doc.getPageCount();
    } catch {
      return this.emptyResult(0);
    }

    let rawFields: ReturnType<ReturnType<PDFDocument['getForm']>['getFields']>;
    try {
      rawFields = doc.getForm().getFields();
    } catch {
      return this.emptyResult(pageCount);
    }

    if (rawFields.length === 0) {
      return this.emptyResult(pageCount);
    }

    const fields: AcroFieldInfo[] = rawFields.map((field) => {
      let name = '(unknown)';
      try { name = field.getName(); } catch { /* leave as placeholder */ }
      try {
        if (field instanceof PDFTextField) {
          const value = field.getText() ?? '';
          return { name, type: 'text' as const, value, isEmpty: value.trim() === '' };
        }
        if (field instanceof PDFCheckBox) {
          return { name, type: 'checkbox' as const, value: field.isChecked(), isEmpty: false };
        }
        if (field instanceof PDFRadioGroup) {
          const value = field.getSelected() ?? null;
          return { name, type: 'radio' as const, value, isEmpty: value === null };
        }
        if (field instanceof PDFDropdown) {
          const selected = field.getSelected();
          const value = selected.length > 0 ? selected[0] : null;
          return { name, type: 'dropdown' as const, value, isEmpty: !value };
        }
        if (field instanceof PDFSignature) {
          let isSigned = false;
          try {
            const v = field.acroField.dict.lookup(PDFName.of('V'));
            isSigned = v !== undefined && v !== null;
          } catch { /* leave isSigned = false */ }
          return { name, type: 'signature' as const, value: null, isSigned, isEmpty: !isSigned };
        }
      } catch { /* ignore */ }
      return { name, type: 'unknown' as const, value: null, isEmpty: true };
    });

    const signatureFields = fields.filter((f) => f.type === 'signature');
    const emptyValueFields = fields.filter(
      (f) => f.isEmpty && f.type !== 'checkbox' && f.type !== 'signature' && f.type !== 'unknown',
    );

    let formTitle: string | null = null;
    try { formTitle = doc.getTitle() ?? null; } catch { /* ignore */ }

    return { hasAcroForm: true, fieldCount: fields.length, fields, signatureFields, emptyValueFields, formTitle, pageCount };
  }

  async isScannedPdf(buffer: Buffer): Promise<boolean> {
    try {
      const doc = await PDFDocument.load(buffer, { ignoreEncryption: true, throwOnInvalidObject: false });
      const fields = doc.getForm().getFields();
      if (fields.length > 0) return false;
    } catch { /* continue */ }

    const raw = buffer.toString('latin1');
    return !raw.includes('/Widget') && !raw.includes('/AcroForm');
  }

  emptyResult(pageCount: number): AcroFormExtractionResult {
    return {
      hasAcroForm: false,
      fieldCount: 0,
      fields: [],
      signatureFields: [],
      emptyValueFields: [],
      formTitle: null,
      pageCount,
    };
  }
}
