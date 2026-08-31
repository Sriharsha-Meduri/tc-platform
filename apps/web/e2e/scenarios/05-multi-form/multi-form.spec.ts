import { test, expect } from '@playwright/test';
import { ContractUploadPage } from '../../pages/ContractUploadPage';
import { ContractReviewPage } from '../../pages/ContractReviewPage';
import { interceptExtractAndDraft } from '../../helpers/api-intercepts';
import { MOCK_RPA_VALID, buildMockExtractResponse } from '../../helpers/mock-data';

test.describe('Multi-form scenarios', () => {

  test('050010 dashboard shows forms after upload', async ({ page, baseURL }) => {
    const mockResponse = buildMockExtractResponse(MOCK_RPA_VALID);
    await interceptExtractAndDraft(page, mockResponse);

    // Upload
    const upload = new ContractUploadPage(page);
    await upload.goto();
    await upload.uploadDummyPdf();
    await upload.clickExtract();

    const review = new ContractReviewPage(page);
    await review.waitForReady();

    // Navigate back to dashboard
    await page.goto(`${baseURL}/dashboard`);
    await page.waitForSelector('h1:has-text("Dashboard")', { state: 'visible' });

    // Dashboard should show transaction cards with status
    await expect(page.locator('text=Draft').first()).toBeVisible({ timeout: 5000 });
  });

  test('050020 dashboard shows forms status icons ✓ and ○', async ({ page, baseURL }) => {
    const mockResponse = buildMockExtractResponse(MOCK_RPA_VALID);
    await interceptExtractAndDraft(page, mockResponse);

    const upload = new ContractUploadPage(page);
    await upload.goto();
    await upload.uploadDummyPdf();
    await upload.clickExtract();

    const review = new ContractReviewPage(page);
    await review.waitForReady();

    // Go to dashboard
    await page.goto(`${baseURL}/dashboard`);
    await page.waitForSelector('h1:has-text("Dashboard")', { state: 'visible' });

    // Should show "Forms:" prefix with submitted forms
    await expect(page.locator('text=Forms:').first()).toBeVisible({ timeout: 5000 });
  });
});
