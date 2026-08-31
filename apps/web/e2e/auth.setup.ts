import { test as setup } from '@playwright/test';
import { LoginPage } from './pages/LoginPage';
import { WEB_URL } from './helpers/constants';

const AUTH_FILE = 'e2e/.auth/user.json';

setup('authenticate as test user', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login();

  // Wait for dashboard to fully load
  await page.waitForURL('**/dashboard', { timeout: 15000 });
  await page.waitForSelector('h1:has-text("Dashboard")', { state: 'visible' });

  // Save storage state (includes tc_token cookie)
  await page.context().storageState({ path: AUTH_FILE });
});
