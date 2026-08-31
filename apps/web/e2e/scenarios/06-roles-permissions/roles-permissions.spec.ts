import { test, expect } from '@playwright/test';
import { WEB_URL } from '../../helpers/constants';

test.describe('Roles and permissions', () => {

  test('060010 unauthenticated user redirected from dashboard to login', async ({ page }) => {
    // Create a new context without auth storage
    const ctx = await page.context();
    await ctx.clearCookies();
    await page.goto(`${WEB_URL}/dashboard`);

    // Should be redirected to login
    await expect(page).toHaveURL(/login/, { timeout: 10000 });
  });

  test('060020 authenticated user can access dashboard', async ({ page }) => {
    await page.goto(`${WEB_URL}/dashboard`);
    await page.waitForSelector('h1:has-text("Dashboard")', { state: 'visible' });
    await expect(page.locator('h1:has-text("Dashboard")')).toBeVisible();
  });

  test('060030 dashboard shows user info in sidebar', async ({ page }) => {
    await page.goto(`${WEB_URL}/dashboard`);
    await page.waitForSelector('h1:has-text("Dashboard")', { state: 'visible' });

    // Sidebar user section
    await expect(page.locator('text=Sign out')).toBeVisible({ timeout: 5000 });
  });
});
