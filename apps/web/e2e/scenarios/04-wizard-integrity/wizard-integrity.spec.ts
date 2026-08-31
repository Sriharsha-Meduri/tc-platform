import { test, expect } from '@playwright/test';
import { ContractUploadPage } from '../../pages/ContractUploadPage';
import { ContractReviewPage } from '../../pages/ContractReviewPage';
import { interceptExtractAndDraft } from '../../helpers/api-intercepts';
import { MOCK_RPA_VALID, buildMockExtractResponse } from '../../helpers/mock-data';

test.describe('Wizard integrity', () => {

  test('040010 step navigation works through all 5 steps', async ({ page }) => {
    // Seed the review wizard by going through upload with mock data
    const mockResponse = buildMockExtractResponse(MOCK_RPA_VALID);
    await interceptExtractAndDraft(page, mockResponse);

    const upload = new ContractUploadPage(page);
    await upload.goto();
    await upload.uploadDummyPdf();
    await upload.clickExtract();

    const review = new ContractReviewPage(page);
    await review.waitForReady();

    // Navigate through all steps using buttons
    const expectedHeadings = ['Parties', 'Dates', 'Deadlines', 'Compliance', 'Confirm'];
    for (const heading of expectedHeadings) {
      await expect(page.locator(`text=${heading}`).first()).toBeVisible({ timeout: 3000 });
      const nextBtn = page.locator('button:has-text("Next")');
      if (await nextBtn.isVisible()) {
        await nextBtn.click();
        await page.waitForTimeout(300);
      }
    }
  });

  test('040020 extracted parties data appears on step 1', async ({ page }) => {
    const mockResponse = buildMockExtractResponse(MOCK_RPA_VALID);
    await interceptExtractAndDraft(page, mockResponse);

    const upload = new ContractUploadPage(page);
    await upload.goto();
    await upload.uploadDummyPdf();
    await upload.clickExtract();

    const review = new ContractReviewPage(page);
    await review.waitForReady();

    // Step 1 should show extracted party names
    await expect(page.locator('text=John Buyer')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Jane Seller')).toBeVisible({ timeout: 5000 });
  });

  test('040030 back navigation from review to upload', async ({ page }) => {
    const mockResponse = buildMockExtractResponse(MOCK_RPA_VALID);
    await interceptExtractAndDraft(page, mockResponse);

    const upload = new ContractUploadPage(page);
    await upload.goto();
    await upload.uploadDummyPdf();
    await upload.clickExtract();

    const review = new ContractReviewPage(page);
    await review.waitForReady();

    // Click "Back" in the review header to return to upload
    await page.click('a:has-text("Back")');
    await page.waitForURL('**/transactions/new/contract', { timeout: 5000 });

    // Should be back on the upload page
    await expect(page.locator('text=Upload Contract Documents')).toBeVisible();
  });
});
