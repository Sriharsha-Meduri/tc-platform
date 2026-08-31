import { test, expect } from '@playwright/test';
import { ContractUploadPage } from '../../pages/ContractUploadPage';
import { ContractReviewPage } from '../../pages/ContractReviewPage';
import { interceptExtractAndDraft } from '../../helpers/api-intercepts';
import {
  MOCK_RPA_MULTI_COUNTER_OFFER,
  MOCK_RPA_BCO_ONLY,
  MOCK_RPA_FLAG_FALSE_WITH_SCO,
  MOCK_RPA_FLAG_TRUE_NO_COUNTER,
  buildMockExtractResponse,
  buildMockExtractResponseWithWarnings,
} from '../../helpers/mock-data';

test.describe('Counter-offer edge cases', () => {

  test('070010 RPA with SCO/BCO counter offers shows updated price and forms', async ({ page }) => {
    const complianceWarning = {
      code: 'WARN-RPA-2001',
      compositeId: 'WARN-RPA-2001',
      message: 'RPA indicates acceptance subject to counter offer; a counter offer form (SCO/BCO/COP/COUNTER) was found.',
      formCode: 'RPA',
      type: 'warning' as const,
    };
    const mockResponse = buildMockExtractResponseWithWarnings(MOCK_RPA_MULTI_COUNTER_OFFER, 1);
    mockResponse.compliance.warnings = [complianceWarning];
    await interceptExtractAndDraft(page, mockResponse);

    const upload = new ContractUploadPage(page);
    await upload.goto();
    await upload.uploadDummyPdf();
    await upload.clickExtract();

    const review = new ContractReviewPage(page);
    await review.waitForReady();

    await review.goToStep(4);
    await expect(page.locator('text=1 warning').first()).toBeVisible({ timeout: 5000 });
    await expect(review.warningIndicators.first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('No forms or disclosures found')).not.toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Seller Counter Offer')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Buyer Counter Offer')).toBeVisible({ timeout: 5000 });

    await page.click('button:has-text("Back")');
    await page.click('button:has-text("Back")');
    await page.click('button:has-text("Back")');
    await review.goToStep(2);
    await expect(page.locator('text=$925,000')).toBeVisible({ timeout: 5000 });
  });

  test('070020 BCO-only counter offer (SCO alias) shows BCO form and updated price', async ({ page }) => {
    const complianceWarning = {
      code: 'WARN-RPA-2001',
      compositeId: 'WARN-RPA-2001',
      message: 'RPA indicates acceptance subject to counter offer; a counter offer form (SCO/BCO/COP/COUNTER) was found.',
      formCode: 'RPA',
      type: 'warning' as const,
    };
    const mockResponse = buildMockExtractResponseWithWarnings(MOCK_RPA_BCO_ONLY, 1);
    mockResponse.compliance.warnings = [complianceWarning];
    await interceptExtractAndDraft(page, mockResponse);

    const upload = new ContractUploadPage(page);
    await upload.goto();
    await upload.uploadDummyPdf();
    await upload.clickExtract();

    const review = new ContractReviewPage(page);
    await review.waitForReady();

    await review.goToStep(4);
    await expect(page.locator('text=1 warning').first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('No forms or disclosures found')).not.toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Buyer Counter Offer')).toBeVisible({ timeout: 5000 });

    await page.click('button:has-text("Back")');
    await page.click('button:has-text("Back")');
    await page.click('button:has-text("Back")');
    await review.goToStep(2);
    await expect(page.locator('text=$950,000')).toBeVisible({ timeout: 5000 });
  });

  test('070030 Counter-offer flag false with SCO present shows form without warnings', async ({ page }) => {
    const mockResponse = buildMockExtractResponse(MOCK_RPA_FLAG_FALSE_WITH_SCO);
    await interceptExtractAndDraft(page, mockResponse);

    const upload = new ContractUploadPage(page);
    await upload.goto();
    await upload.uploadDummyPdf();
    await upload.clickExtract();

    const review = new ContractReviewPage(page);
    await review.waitForReady();

    // Step 2: verify price (no counter-offer flag, no price update expected)
    await review.goToStep(2);
    await expect(page.locator('text=$880,000')).toBeVisible({ timeout: 5000 });

    // Step 4: no compliance warnings, but SCO form is listed
    await review.clickNext();
    await review.clickNext();
    await expect(page.getByText('Compliant').first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('No forms or disclosures found')).not.toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Seller Counter Offer')).toBeVisible({ timeout: 5000 });
  });

  test('070040 Counter-offer flag true with no counter form shows missing form warning', async ({ page }) => {
    const complianceWarning = {
      code: 'WARN-RPA-2001',
      compositeId: 'WARN-RPA-2001',
      message: 'RPA indicates acceptance subject to counter offer; no counter offer form (SCO/BCO/COP/COUNTER) was found.',
      formCode: 'RPA',
      type: 'warning' as const,
    };
    const mockResponse = buildMockExtractResponseWithWarnings(MOCK_RPA_FLAG_TRUE_NO_COUNTER, 1);
    mockResponse.compliance.warnings = [complianceWarning];
    await interceptExtractAndDraft(page, mockResponse);

    const upload = new ContractUploadPage(page);
    await upload.goto();
    await upload.uploadDummyPdf();
    await upload.clickExtract();

    const review = new ContractReviewPage(page);
    await review.waitForReady();

    await review.goToStep(4);
    await expect(page.locator('text=1 warning').first()).toBeVisible({ timeout: 5000 });
    await expect(review.warningIndicators.first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('No forms or disclosures found')).not.toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Seller Counter Offer')).not.toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Buyer Counter Offer')).not.toBeVisible({ timeout: 5000 });

    await page.click('button:has-text("Back")');
    await page.click('button:has-text("Back")');
    await page.click('button:has-text("Back")');
    await review.goToStep(2);
    await expect(page.locator('text=$975,000')).toBeVisible({ timeout: 5000 });
  });
});
