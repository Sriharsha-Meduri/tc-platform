import { Page } from '@playwright/test';
import { WEB_URL, DUMMY_PDF_PATH } from '../helpers/constants';

export class ContractUploadPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async goto(): Promise<void> {
    await this.page.goto(`${WEB_URL}/transactions/new/contract`);
  }

  async uploadDummyPdf(): Promise<void> {
    const fileChooserPromise = this.page.waitForEvent('filechooser');
    await this.page.click('input[type="file"]');
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(DUMMY_PDF_PATH);
  }

  async clickExtract(): Promise<void> {
    await this.page.click('button:has-text("Extract & Create Draft")');
  }

  get extractButton() {
    return this.page.locator('button:has-text("Extract & Create Draft")');
  }

  get errorMessage() {
    return this.page.locator('text=Only PDF files are accepted');
  }

  get rpaNotFoundMessage() {
    return this.page.locator('text=Residential Purchase Agreement (RPA) required');
  }

  get duplicateMessage() {
    return this.page.locator('text=Transaction already exists');
  }
}
