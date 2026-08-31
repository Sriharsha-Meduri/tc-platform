export const WEB_URL = process.env.E2E_WEB_URL || 'http://localhost:3001';
export const API_BASE = process.env.E2E_API_URL || 'http://localhost:3000/api/v1';

export const TEST_USER = {
  email: process.env.E2E_USER_EMAIL || 'alice.tc@sunsetrealty.com',
  password: process.env.E2E_USER_PASSWORD || 'Password1!',
};

/** Dummy PDF fixture path for file uploads. */
export const DUMMY_PDF_PATH = 'e2e/fixtures/dummy.pdf';
