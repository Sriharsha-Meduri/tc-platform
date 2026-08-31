import { describe, it, expect } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import {
  extractRpaContingencyTextOverrides,
  applyRpaContingencyTextOverrides,
  clearEmptyOtherTermsModifications,
} from '../../src/extractor/rpa-contingency-text-override';
import type { RpaContingencyTextOverrides } from '../../src/extractor/rpa-contingency-text-override';

/**
 * Build a synthetic RPA page-2 that reproduces the section 3L geometry of the
 * real form: row title at x≈131, "17 (or" at x≈280, the override digit (if any)
 * between x≈301 and x≈325, and ") Days after Acceptance" at x≈325.
 */
async function makePage2Pdf(rows: Array<{ label: string; y: number; override?: string }>): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);

  for (const row of rows) {
    page.drawText(row.label, { x: 131, y: row.y, size: 9, font });
    page.drawText('17 (or', { x: 280, y: row.y, size: 9, font });
    if (row.override) {
      page.drawText(row.override, { x: 312, y: row.y, size: 9, font });
    }
    page.drawText(') Days after Acceptance', { x: 325, y: row.y, size: 9, font });
  }

  return Buffer.from(await doc.save());
}

describe('extractRpaContingencyTextOverrides', () => {
  it('reads typed digits from the override blanks and skips blank ones', async () => {
    const pdf = await makePage2Pdf([
      { label: 'Loan(s)', y: 531, override: '9' },
      { label: 'Appraisal', y: 518 },
      { label: 'Investigation of Property', y: 469, override: '4' },
      { label: 'Common Interest Disclosures', y: 363, override: '10' },
    ]);

    const overrides = await extractRpaContingencyTextOverrides(pdf);

    expect(overrides.loan_days).toBe(9);
    expect(overrides.investigation_days).toBe(4);
    expect(overrides.common_interest_disclosures_days).toBe(10);
    expect(overrides.appraisal_days).toBeUndefined();
  });

  it('returns an empty object for a page with no override digits', async () => {
    const pdf = await makePage2Pdf([
      { label: 'Loan(s)', y: 531 },
      { label: 'Investigation of Property', y: 469 },
    ]);

    const overrides = await extractRpaContingencyTextOverrides(pdf);
    expect(overrides).toEqual({});
  });

  it('does not treat non-digit text (e.g. the "No loan contingency" label) as an override', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([612, 792]);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    page.drawText('Loan(s)', { x: 131, y: 531, size: 9, font });
    page.drawText('17 (or', { x: 280, y: 531, size: 9, font });
    page.drawText('No loan contingency', { x: 469, y: 531, size: 9, font });
    page.drawText(') Days after Acceptance', { x: 325, y: 531, size: 9, font });
    const pdf = Buffer.from(await doc.save());

    const overrides = await extractRpaContingencyTextOverrides(pdf);
    expect(overrides.loan_days).toBeUndefined();
  });
});

describe('applyRpaContingencyTextOverrides', () => {
  it('merges into both the template block and the per-page L_contingencies row', () => {
    const data: Record<string, unknown> = {
      contingencies_and_time_periods: { loan_contingency_days: 17, investigation_of_property_days: 17 },
      section_3_terms_and_allocation_of_costs_page_2: {
        L_contingencies: {
          L1_loan: { override_days_after_acceptance: null, days_after_acceptance: 17 },
          L3_investigation_of_property: {
            investigation: { override_days_after_acceptance: null, days_after_acceptance: 17 },
          },
        },
      },
    };

    applyRpaContingencyTextOverrides(data, { loan_days: 9, investigation_days: 4 });

    const ctp = data.contingencies_and_time_periods as Record<string, unknown>;
    expect(ctp.loan_contingency_days).toBe(9);
    expect(ctp.investigation_of_property_days).toBe(4);

    const l = (data.section_3_terms_and_allocation_of_costs_page_2 as Record<string, unknown>)
      .L_contingencies as Record<string, unknown>;
    expect((l.L1_loan as Record<string, unknown>).override_days_after_acceptance).toBe(9);
    expect((l.L1_loan as Record<string, unknown>).days_after_acceptance).toBe(9);
    expect((l.L3_investigation_of_property as Record<string, unknown>).investigation).toMatchObject({
      override_days_after_acceptance: 4,
      days_after_acceptance: 4,
    });
  });

  it('creates the per-page L_contingencies block when absent', () => {
    const data: Record<string, unknown> = {
      contingencies_and_time_periods: { loan_contingency_days: 17 },
    };

    applyRpaContingencyTextOverrides(data, { loan_days: 9 });

    const l = ((data.section_3_terms_and_allocation_of_costs_page_2 as Record<string, unknown>)
      .L_contingencies as Record<string, unknown>);
    expect((l.L1_loan as Record<string, unknown>).override_days_after_acceptance).toBe(9);
  });

  it('is a no-op for an empty overrides object', () => {
    const data: Record<string, unknown> = {
      contingencies_and_time_periods: { loan_contingency_days: 17 },
    };
    applyRpaContingencyTextOverrides(data, {} as RpaContingencyTextOverrides);
    expect(data).toEqual({ contingencies_and_time_periods: { loan_contingency_days: 17 } });
  });
});

describe('clearEmptyOtherTermsModifications', () => {
  const echoedMods = {
    loan_contingency_days: 17,
    appraisal_contingency_days: 17,
    investigation_days: 17,
    informational_access_days: 7,
    insurance_days: 17,
    seller_document_days: 3,
    preliminary_title_report_days: 5,
    common_interest_disclosures_days: 3,
    review_leased_liened_items_days: 3,
  };

  it('clears fabricated modifications when Section R text is empty', () => {
    const data: Record<string, unknown> = {
      other_terms_text: '',
      terms_of_purchase: { other_terms_modifications: { ...echoedMods } },
      section_3_terms_and_allocation_of_costs_page_3: {
        R_other_terms: {
          text: '',
          modifications: { loan_contingency_days: 17 },
        },
      },
    };

    const cleared = clearEmptyOtherTermsModifications(data);

    expect(cleared).toBe(true);
    expect((data.terms_of_purchase as Record<string, unknown>).other_terms_modifications).toBeNull();
    const rOther = ((data.section_3_terms_and_allocation_of_costs_page_3 as Record<string, unknown>)
      .R_other_terms as Record<string, unknown>);
    expect(rOther.modifications).toBeNull();
  });

  it('clears a top-level other_terms_modifications block', () => {
    const data: Record<string, unknown> = {
      other_terms_text: null,
      other_terms_modifications: { ...echoedMods },
    };

    const cleared = clearEmptyOtherTermsModifications(data);

    expect(cleared).toBe(true);
    expect(data.other_terms_modifications).toBeNull();
  });

  it('keeps modifications when any Other Terms text source is non-empty', () => {
    const data: Record<string, unknown> = {
      other_terms_text: 'Buyer to provide escrow deposit within 5 days.',
      terms_of_purchase: { other_terms_modifications: { ...echoedMods } },
    };

    const cleared = clearEmptyOtherTermsModifications(data);

    expect(cleared).toBe(false);
    expect((data.terms_of_purchase as Record<string, unknown>).other_terms_modifications).toEqual(echoedMods);
  });

  it('keeps modifications when per-page R_other_terms.text is non-empty', () => {
    const data: Record<string, unknown> = {
      other_terms_text: '',
      section_3_terms_and_allocation_of_costs_page_3: {
        R_other_terms: {
          text: 'Loan contingency reduced to 10 days.',
          modifications: { loan_contingency_days: 10 },
        },
      },
    };

    const cleared = clearEmptyOtherTermsModifications(data);

    expect(cleared).toBe(false);
    const rOther = ((data.section_3_terms_and_allocation_of_costs_page_3 as Record<string, unknown>)
      .R_other_terms as Record<string, unknown>);
    expect(rOther.modifications).toEqual({ loan_contingency_days: 10 });
  });

  it('returns false when there is nothing to clear', () => {
    const data: Record<string, unknown> = {
      other_terms_text: '',
      terms_of_purchase: { purchase_price: 626000 },
    };

    const cleared = clearEmptyOtherTermsModifications(data);

    expect(cleared).toBe(false);
    expect(data).toEqual({ other_terms_text: '', terms_of_purchase: { purchase_price: 626000 } });
  });
});
