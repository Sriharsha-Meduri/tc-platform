import { test, expect } from '@playwright/test';
import { ContractUploadPage } from '../../pages/ContractUploadPage';
import { ContractReviewPage } from '../../pages/ContractReviewPage';
import { interceptExtractAndDraft } from '../../helpers/api-intercepts';
import {
  MOCK_RPA_VALID,
  MOCK_RPA_MISSING_PRICE,
  MOCK_RPA_MISSING_SIGNATURES,
  MOCK_RPA_COUNTER_OFFER,
  buildMockExtractResponse,
  buildMockExtractResponseWithBlockers,
  buildMockExtractResponseWithWarnings,
} from '../../helpers/mock-data';

test.describe('Compliance display in review wizard', () => {

  test('020010 valid RPA shows compliant status', async ({ page }) => {
    const mockResponse = buildMockExtractResponse(MOCK_RPA_VALID);
    await interceptExtractAndDraft(page, mockResponse);

    const upload = new ContractUploadPage(page);
    await upload.goto();
    await upload.uploadDummyPdf();
    await upload.clickExtract();

    const review = new ContractReviewPage(page);
    await review.waitForReady();

    // Verify compliance section shows compliant status
    await review.goToStep(4);
    await expect(page.locator('text=Compliant').first()).toBeVisible({ timeout: 5000 });
  });

  test('020020 missing purchase price shows blocker', async ({ page }) => {
    const mockResponse = buildMockExtractResponseWithBlockers(MOCK_RPA_MISSING_PRICE, 1);
    await interceptExtractAndDraft(page, mockResponse);

    const upload = new ContractUploadPage(page);
    await upload.goto();
    await upload.uploadDummyPdf();
    await upload.clickExtract();

    const review = new ContractReviewPage(page);
    await review.waitForReady();
    await review.goToStep(4);

    // Should show a blocker indicator
    await expect(review.blockerIndicators.first()).toBeVisible({ timeout: 5000 });
  });

  test('020030 missing signatures shows warnings', async ({ page }) => {
    const mockResponse = buildMockExtractResponseWithWarnings(MOCK_RPA_MISSING_SIGNATURES, 2);
    await interceptExtractAndDraft(page, mockResponse);

    const upload = new ContractUploadPage(page);
    await upload.goto();
    await upload.uploadDummyPdf();
    await upload.clickExtract();

    const review = new ContractReviewPage(page);
    await review.waitForReady();
    await review.goToStep(4);

    await expect(review.warningIndicators.first()).toBeVisible({ timeout: 5000 });
  });

  test('020040 counter-offer flag triggers warning', async ({ page }) => {
    const mockResponse = buildMockExtractResponseWithWarnings(MOCK_RPA_COUNTER_OFFER, 1);
    await interceptExtractAndDraft(page, mockResponse);

    const upload = new ContractUploadPage(page);
    await upload.goto();
    await upload.uploadDummyPdf();
    await upload.clickExtract();

    const review = new ContractReviewPage(page);
    await review.waitForReady();
    await review.goToStep(4);

    await expect(review.warningIndicators.first()).toBeVisible({ timeout: 5000 });
  });
});
