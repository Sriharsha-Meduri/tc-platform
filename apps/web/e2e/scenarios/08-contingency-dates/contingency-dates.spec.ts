import { test, expect } from '@playwright/test';
import { ContractUploadPage } from '../../pages/ContractUploadPage';
import { ContractReviewPage } from '../../pages/ContractReviewPage';
import { interceptExtractAndDraft } from '../../helpers/api-intercepts';
import {
  MOCK_RPA_VALID,
  MOCK_RPA_NULL_CONTINGENCIES,
  MOCK_RPA_PARTIAL_CONTINGENCIES,
  MOCK_RPA_NULL_ACCEPTANCE,
  buildMockExtractResponse,
  buildMockWithOtherDeadlines,
} from '../../helpers/mock-data';

test.describe('Contingency dates display in review wizard', () => {

  test('080010 all contingency dates display correctly', async ({ page }) => {
    const mockResponse = buildMockExtractResponse(MOCK_RPA_VALID);
    await interceptExtractAndDraft(page, mockResponse);

    const upload = new ContractUploadPage(page);
    await upload.goto();
    await upload.uploadDummyPdf();
    await upload.clickExtract();

    const review = new ContractReviewPage(page);
    await review.waitForReady();
    await review.goToStep(3);

    // Days pills are static values from extraction — always reliable
    await expect(page.locator('text="Inspection Contingency"').locator('..')).toContainText('17 days');
    await expect(page.locator('text="Loan Contingency"').locator('..')).toContainText('21 days');
    await expect(page.locator('text="Appraisal Contingency"').locator('..')).toContainText('17 days');
    await expect(page.locator('text="Disclosures Due"').locator('..')).toContainText('7 days');

    // Calculated dates are timezone-dependent; just verify they render as dates (not dashes)
    for (const label of ['Inspection Contingency', 'Loan Contingency', 'Appraisal Contingency', 'Disclosures Due']) {
      await expect(page.locator(`text="${label}"`).locator('..').locator('text=—')).not.toBeVisible();
      await expect(page.locator(`text="${label}"`).locator('..')).toContainText('2026');
    }
  });

  test('080020 missing all contingency dates shows dashes', async ({ page }) => {
    const mockResponse = buildMockExtractResponse(MOCK_RPA_NULL_CONTINGENCIES);
    await interceptExtractAndDraft(page, mockResponse);

    const upload = new ContractUploadPage(page);
    await upload.goto();
    await upload.uploadDummyPdf();
    await upload.clickExtract();

    const review = new ContractReviewPage(page);
    await review.waitForReady();
    await review.goToStep(3);

    // Row labels still visible but no days pill — shows "—" for date
    const labels = ['Inspection Contingency', 'Loan Contingency', 'Appraisal Contingency', 'Disclosures Due'];
    for (const label of labels) {
      const row = page.locator(`text="${label}"`).locator('..');
      await expect(row).toBeVisible();
      await expect(row.locator('text=days')).not.toBeVisible();
      await expect(row).toContainText('—');
    }
  });

  test('080030 null acceptance date shows amber warning', async ({ page }) => {
    const mockResponse = buildMockExtractResponse(MOCK_RPA_NULL_ACCEPTANCE);
    await interceptExtractAndDraft(page, mockResponse);

    const upload = new ContractUploadPage(page);
    await upload.goto();
    await upload.uploadDummyPdf();
    await upload.clickExtract();

    const review = new ContractReviewPage(page);
    await review.waitForReady();
    await review.goToStep(3);

    // Amber warning text visible
    await expect(page.locator('text=Acceptance date not found')).toBeVisible();

    // Days pills still visible (contractTerms values are present)
    await expect(page.locator('text="Inspection Contingency"').locator('..')).toContainText('17 days');
    await expect(page.locator('text="Loan Contingency"').locator('..')).toContainText('21 days');
    await expect(page.locator('text="Disclosures Due"').locator('..')).toContainText('7 days');

    // But no calculated dates (since acceptanceDate is null) — all show "—"
    const labels = ['Inspection Contingency', 'Loan Contingency', 'Appraisal Contingency', 'Disclosures Due'];
    for (const label of labels) {
      await expect(page.locator(`text="${label}"`).locator('..')).toContainText('—');
    }
  });

  test('080040 partial contingency data renders correctly', async ({ page }) => {
    const mockResponse = buildMockExtractResponse(MOCK_RPA_PARTIAL_CONTINGENCIES);
    await interceptExtractAndDraft(page, mockResponse);

    const upload = new ContractUploadPage(page);
    await upload.goto();
    await upload.uploadDummyPdf();
    await upload.clickExtract();

    const review = new ContractReviewPage(page);
    await review.waitForReady();
    await review.goToStep(3);

    // Inspection: present — days pill visible, valid date rendered
    await expect(page.locator('text="Inspection Contingency"').locator('..')).toContainText('17 days');
    const inspRow = page.locator('text="Inspection Contingency"').locator('..');
    await expect(inspRow.locator('text=—')).not.toBeVisible();
    await expect(inspRow).toContainText('2026');

    // Loan: null — no days pill, shows dash
    const loanRow = page.locator('text="Loan Contingency"').locator('..');
    await expect(loanRow).toBeVisible();
    await expect(loanRow.locator('text=days')).not.toBeVisible();
    await expect(loanRow).toContainText('—');

    // Appraisal: null — same as loan
    const appraisalRow = page.locator('text="Appraisal Contingency"').locator('..');
    await expect(appraisalRow).toBeVisible();
    await expect(appraisalRow.locator('text=days')).not.toBeVisible();
    await expect(appraisalRow).toContainText('—');

    // Disclosures Due: present
    await expect(page.locator('text="Disclosures Due"').locator('..')).toContainText('7 days');
    const ddRow = page.locator('text="Disclosures Due"').locator('..');
    await expect(ddRow.locator('text=—')).not.toBeVisible();
    await expect(ddRow).toContainText('2026');
  });

  test('080050 other deadlines section renders with custom entries', async ({ page }) => {
    const data = buildMockWithOtherDeadlines([
      { label: 'HOA Docs Due', value: 'Feb 1, 2026' },
      { label: 'Pest Inspection', value: 'Jan 25, 2026' },
    ]);
    const mockResponse = buildMockExtractResponse(data);
    await interceptExtractAndDraft(page, mockResponse);

    const upload = new ContractUploadPage(page);
    await upload.goto();
    await upload.uploadDummyPdf();
    await upload.clickExtract();

    const review = new ContractReviewPage(page);
    await review.waitForReady();
    await review.goToStep(3);

    // Other deadlines section header visible
    await expect(page.locator('text=Other deadlines')).toBeVisible();

    // Each custom entry visible
    await expect(page.locator('text=HOA Docs Due')).toBeVisible();
    await expect(page.locator('text=Feb 1, 2026')).toBeVisible();
    await expect(page.locator('text=Pest Inspection')).toBeVisible();
    await expect(page.locator('text=Jan 25, 2026')).toBeVisible();

    // Standard deadlines still render
    await expect(page.locator('text="Inspection Contingency"').locator('..')).toContainText('17 days');
  });
});
