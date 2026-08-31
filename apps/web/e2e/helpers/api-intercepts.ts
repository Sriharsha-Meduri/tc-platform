import { Page } from '@playwright/test';
import { API_BASE } from './constants';
import type { MockExtractResponse } from './mock-data';

/**
 * Intercept POST /document-extraction/extract-and-draft and return mock data.
 * The browser client stores this in sessionStorage and navigates to the review wizard.
 */
export async function interceptExtractAndDraft(
  page: Page,
  response: MockExtractResponse,
): Promise<void> {
  await page.route(`${API_BASE}/document-extraction/extract-and-draft`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(response),
    });
  });
}

/**
 * Intercept POST /document-extraction/extract-and-draft and return an error response.
 */
export async function interceptExtractAndDraftError(
  page: Page,
  status: number,
  body: Record<string, unknown>,
): Promise<void> {
  await page.route(`${API_BASE}/document-extraction/extract-and-draft`, async (route) => {
    await route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
}

/**
 * Intercept POST /transactions/:id/submit-contract and return mock success.
 */
export async function interceptSubmitContract(
  page: Page,
  transactionId: string,
): Promise<void> {
  await page.route(`${API_BASE}/transactions/*/submit-contract`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        transaction: { id: transactionId, status: 'active' },
        submission: { id: 'mock-sub-1', submissionNo: 1, status: 'under_review' },
        message: 'Contract submitted successfully',
      }),
    });
  });
}

/**
 * Intercept POST /transactions/:id/submit-contract and return an error.
 */
export async function interceptSubmitContractError(
  page: Page,
  status: number,
  message: string,
): Promise<void> {
  await page.route(`${API_BASE}/transactions/*/submit-contract`, async (route) => {
    await route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify({ message, code: 'SUBMIT_FAILED' }),
    });
  });
}

/**
 * Remove all previously registered mock routes for a given URL pattern.
 */
export async function removeMockRoutes(page: Page, urlPattern: string | RegExp): Promise<void> {
  await page.unroute(urlPattern);
}
