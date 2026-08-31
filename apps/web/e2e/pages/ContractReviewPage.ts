import { Page } from '@playwright/test';
import { WEB_URL } from '../helpers/constants';

export class ContractReviewPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async goto(): Promise<void> {
    await this.page.goto(`${WEB_URL}/transactions/new/contract/review`);
  }

  /** Verify the review wizard is visible (step 1 should render). */
  async waitForReady(): Promise<void> {
    await this.page.waitForSelector('text=Parties', { state: 'visible' });
  }

  /** Navigate to a specific wizard step by clicking Next repeatedly. */
  async goToStep(step: number): Promise<void> {
    for (let i = 1; i < step; i++) {
      await this.page.click('button:has-text("Next")');
    }
  }

  /** Click Next to advance to the next step. */
  async clickNext(): Promise<void> {
    await this.page.click('button:has-text("Next")');
  }

  /** Click Back to return to the previous step. */
  async clickBack(): Promise<void> {
    await this.page.click('button:has-text("Back")');
  }

  /** Fill party fields on Step 5 and click Submit. */
  async submitWithDefaults(): Promise<void> {
    await this.goToStep(5);
    await this.page.waitForSelector('button:has-text("Submit & Send Emails")', { state: 'visible' });
    await this.page.click('button:has-text("Submit & Send Emails")');
  }

  // ── Locators ──────────────────────────────────────────────────────────

  get stepIndicators() {
    return this.page.locator('[class*="step"]');
  }

  get partyNames() {
    return this.page.locator('text=John Buyer');
  }

  get complianceSection() {
    return this.page.locator('text=Compliance');
  }

  get blockerIndicators() {
    return this.page.locator('[class*="bg-red"]');
  }

  get warningIndicators() {
    return this.page.locator('[class*="bg-amber"]');
  }

  get submitButton() {
    return this.page.locator('button:has-text("Submit & Send Emails")');
  }

  get submitError() {
    return this.page.locator('text=Internal server error during');
  }

  /** After successful submit, user is redirected to transaction detail. */
  get transactionDetailPage() {
    return this.page.locator('text=Transaction');
  }

  /** Locate a deadline row by its label text on step 3. */
  deadlineRow(label: string) {
    return this.page.locator(`text="${label}"`).locator('..');
  }
}
