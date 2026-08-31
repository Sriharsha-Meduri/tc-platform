import { Page, Locator } from '@playwright/test';
import { TEST_USER, WEB_URL } from '../helpers/constants';

export class LoginPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async goto(): Promise<void> {
    await this.page.goto(`${WEB_URL}/login`);
    await this.page.waitForSelector('#email', { state: 'visible' });
  }

  async login(email?: string, password?: string): Promise<void> {
    await this.page.fill('#email', email ?? TEST_USER.email);
    await this.page.fill('#password', password ?? TEST_USER.password);
    await this.page.click('button[type="submit"]');
    await this.page.waitForURL('**/dashboard', { timeout: 15000 });
  }
}
