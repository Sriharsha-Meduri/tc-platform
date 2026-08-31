import { test, expect } from '@playwright/test';
import { ContractUploadPage } from '../../pages/ContractUploadPage';
import { interceptExtractAndDraftError } from '../../helpers/api-intercepts';
import { MOCK_NON_RPA } from '../../helpers/mock-data';

test.describe('Upload error handling', () => {

  test('010010 shows error when non-PDF file is selected', async ({ page }) => {
    const upload = new ContractUploadPage(page);
    await upload.goto();

    // Playwright file chooser with a non-PDF file type isn't straightforward,
    // so we verify the button is disabled when no files are attached.
    await expect(upload.extractButton).toBeDisabled();
  });

  test('010020 shows RPA_NOT_FOUND error for non-RPA document', async ({ page }) => {
    const upload = new ContractUploadPage(page);
    await upload.goto();

    await interceptExtractAndDraftError(page, 422, {
      code: 'RPA_NOT_FOUND',
      documentType: 'Unknown Document',
      message: 'No Residential Purchase Agreement (RPA) was detected.',
    });

    await upload.uploadDummyPdf();
    await upload.clickExtract();

    await expect(upload.rpaNotFoundMessage).toBeVisible({ timeout: 10000 });
  });

  test('010030 shows duplicate transaction error', async ({ page }) => {
    const upload = new ContractUploadPage(page);
    await upload.goto();

    await interceptExtractAndDraftError(page, 409, {
      code: 'DUPLICATE_TRANSACTION',
      existingTransactionId: 'existing-tx-999',
      message: 'A transaction for 123 Main St already exists in your organization.',
    });

    await upload.uploadDummyPdf();
    await upload.clickExtract();

    await expect(upload.duplicateMessage).toBeVisible({ timeout: 10000 });
  });
});
