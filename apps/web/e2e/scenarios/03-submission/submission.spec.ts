import { test, expect } from '@playwright/test';
import { ContractUploadPage } from '../../pages/ContractUploadPage';
import { ContractReviewPage } from '../../pages/ContractReviewPage';
import {
  interceptExtractAndDraft,
  interceptSubmitContract,
  interceptSubmitContractError,
} from '../../helpers/api-intercepts';
import {
  MOCK_RPA_VALID,
  MOCK_RPA_MISSING_PRICE,
  buildMockExtractResponse,
  buildMockExtractResponseWithBlockers,
} from '../../helpers/mock-data';

test.describe('Contract submission flow', () => {

  test('030010 full happy path: upload → review → submit → success', async ({ page }) => {
    const mockResponse = buildMockExtractResponse(MOCK_RPA_VALID);
    await interceptExtractAndDraft(page, mockResponse);

    // Intercept the submit endpoint too
    await interceptSubmitContract(page, mockResponse.transaction.id);

    // Upload
    const upload = new ContractUploadPage(page);
    await upload.goto();
    await upload.uploadDummyPdf();
    await upload.clickExtract();

    // Submit from review wizard
    const review = new ContractReviewPage(page);
    await review.waitForReady();
    await review.submitWithDefaults();

    // Should redirect to transaction detail page on success
    await page.waitForURL(/transactions/, { timeout: 10000 });
  });

  test('030020 submit succeeds with warnings present', async ({ page }) => {
    const mockResponse = buildMockExtractResponseWithBlockers(MOCK_RPA_MISSING_PRICE, 0, 1);
    await interceptExtractAndDraft(page, mockResponse);
    await interceptSubmitContract(page, mockResponse.transaction.id);

    const upload = new ContractUploadPage(page);
    await upload.goto();
    await upload.uploadDummyPdf();
    await upload.clickExtract();

    const review = new ContractReviewPage(page);
    await review.waitForReady();
    await review.submitWithDefaults();

    // Submission should still succeed even with warnings
    await page.waitForURL(/transactions/, { timeout: 10000 });
  });

  test('030030 submit error shows error state', async ({ page }) => {
    const mockResponse = buildMockExtractResponse(MOCK_RPA_VALID);
    await interceptExtractAndDraft(page, mockResponse);
    await interceptSubmitContractError(page, 500, 'Internal server error during submission');

    const upload = new ContractUploadPage(page);
    await upload.goto();
    await upload.uploadDummyPdf();
    await upload.clickExtract();

    const review = new ContractReviewPage(page);
    await review.waitForReady();
    await review.submitWithDefaults();

    // Should show error message
    await expect(review.submitError).toBeVisible({ timeout: 5000 });
  });
});
