# E2E Tests — Playwright + Mock Extractions

End-to-end tests for the TC transaction coordination platform. Uses browser-level
API route interception so tests are deterministic, LLM-free, and CI-safe.

**28 tests** across 9 files (1 auth setup + 27 test scenarios in 8 groups).

---

## Table of Contents

1. [Architecture](#architecture)
2. [Mock Data Flow](#mock-data-flow)
3. [How Scenarios Are Organized](#how-scenarios-are-organized)
4. [Scenario Reference](#scenario-reference)
   - [01 — Upload Errors](#01--upload-errors-3-tests)
   - [02 — Compliance Display](#02--compliance-display-4-tests)
   - [03 — Submission Flow](#03--submission-flow-3-tests)
   - [04 — Wizard Integrity](#04--wizard-integrity-3-tests)
    - [05 — Multi-Form Dashboard](#05--multi-form-dashboard-2-tests)
    - [06 — Roles & Permissions](#06--roles--permissions-3-tests)
    - [07 — Multi-Counter-Offer](#07--multi-counter-offer-4-tests)
    - [08 — Contingency Dates](#08--contingency-dates-5-tests)
5. [Page Objects](#page-objects)
6. [Prerequisites & Running](#prerequisites--running)
7. [Adding a New Scenario](#adding-a-new-scenario)

---

## Architecture

Each test uses `page.route()` to intercept the browser's API requests and return
mock JSON responses. The real API never receives the request — tests are
fully self-contained for extraction, compliance, and submission flows.

```
Browser (React)           Playwright intercept              Test assertion
     │                          │                               │
     ├── POST /extract-and-draft──→ mock JSON response          │
     │   (FormData with PDF)      { transaction, extraction,    │
     │                             compliance }                 │
     │                                                          │
     ├── sessionStorage.setItem('tc_draft_session', ...)        │
     ├── router.push('/.../review')                             │
     │                                                          │
     ├── Review wizard renders from sessionStorage ─────────────→ expect(...).toBeVisible()
     │                                                          │
     ├── POST /transactions/{id}/submit-contract ──→ mock 200 ──→ expect(page).toHaveURL(...)
```

Only the login flow hits the real API (authenticates via
the seeded database). Once logged in, the storage state is saved and reused
across all tests.

## Mock Data Flow

The key insight enabling this architecture: **the review wizard reads from
`sessionStorage`, not from the API**.

The upload page (`ContractUpload.tsx`) is the only place that calls
`POST /extract-and-draft`. On success, it stores the JSON response into
`sessionStorage` under key `tc_draft_session`, then navigates to the review
wizard. The review wizard (`ContractReview.tsx`) reads that data in a
`useEffect` — it never fetches from the API.

This means intercepting the API call at step 1 is sufficient to seed the
entire wizard, all 5 steps, and the submission flow. No test ever sets
`sessionStorage` manually.

```
Browser step                What happens
────────────────────────────────────────────────────────────────────
1. Upload page loads        /transactions/new/contract
2. User selects PDF         Playwright file chooser → dummy.pdf
3. User clicks Extract      POST /extract-and-draft intercepted
4. Mock response returned   { transaction, extractionResult, compliance }
5. Client stores data       sessionStorage.tc_draft_session = {...}
6. Browser navigates        router.push('/transactions/new/contract/review')
7. Review wizard renders    reads sessionStorage → shows extraction data
8. Test asserts             expect(party name).toBeVisible();
                           expect(compliant badge).toBeVisible();
```

## How Scenarios Are Organized

### Group numbering (01–99)

| Group | Folder | Tests | What it covers |
|---|---|---|---|
| 01 | `01-upload-errors` | 3 | API error responses rendered as UI banners |
| 02 | `02-compliance` | 4 | Blocker/warning badges in step 4 of the wizard |
| 03 | `03-submission` | 3 | Submit button → API call → redirect or error |
| 04 | `04-wizard-integrity` | 3 | Step navigation, party data rendering, back button |
| 05 | `05-multi-form` | 2 | Dashboard forms icons after upload |
| 06 | `06-roles-permissions` | 3 | Auth redirect, authenticated access, sidebar |
| 07 | `07-multi-counter-offer` | 4 | Counter-offer edge cases: dual forms, BCO-only, flag-false, missing counter |
| 08 | `08-contingency-dates` | 5 | Contingency deadline display, null data, partial data, other deadlines |

### Test numbering (NNNN0, +10 gaps)

Each scenario gets a 5-digit number ending in 0, with gaps of 10 so new tests
can be inserted without renumbering existing ones:

```
010010, 010020, 010030, ...   ← first group
021050                        ← 6th test in group 02
```

### Per-group numbering allocation

| Group | Range | Slots |
|---|---|---|
| 01 | 010010–019990 | 1999 |
| 02 | 020010–029990 | 1999 |
| 03 | 030010–039990 | 1999 |
| 04 | 040010–049990 | 1999 |
| 05 | 050010–059990 | 1999 |
| 06 | 060010–069990 | 1999 |
| 07–99 | 070010–999990 | 93,000 |

---

## Scenario Reference

### 01 — Upload Errors (3 tests)

These tests validate how the upload page renders different API error responses
as visible UI banners. All stay on the upload page — no navigation to the
review wizard.

| ID | Name | What it does |
|---|---|---|
| 010010 | Disabled button without files | Loads the upload page, asserts the Extract button is `disabled` when no files are attached. This is a pure UI state test — no intercept needed. |
| 010020 | RPA_NOT_FOUND error (422) | Registers a mock 422 response with `{ code: 'RPA_NOT_FOUND', documentType: 'Unknown Document' }`. Uploads a dummy PDF, clicks Extract, asserts the red error banner with heading "Residential Purchase Agreement (RPA) required" is visible. |
| 010030 | DUPLICATE_TRANSACTION error (409) | Registers a mock 409 response with `{ code: 'DUPLICATE_TRANSACTION', existingTransactionId: 'existing-tx-999', message: 'A transaction for 123 Main St already exists...' }`. Asserts the amber "Transaction already exists" banner appears with a link to the existing transaction. |

**UI pages tested:** `ContractUploadPage` only.

### 02 — Compliance Display (4 tests)

These test the compliance step (step 4) of the review wizard. Each test uploads
a different mock extraction variant then navigates to step 4 and checks for
blocker/warning indicators.

| ID | Name | Mock data | Assertion |
|---|---|---|---|
| 020010 | Valid RPA is compliant | `MOCK_RPA_VALID` — all fields populated, both parties signed | "Compliant" badge visible on step 4 |
| 020020 | Missing price shows blocker | `MOCK_RPA_MISSING_PRICE` — `purchasePrice: null`, compliance set to `non_compliant` with `blockerCount: 1` | Red blocker indicator (`[class*="bg-red"]`) visible |
| 020030 | Missing signatures shows warnings | `MOCK_RPA_MISSING_SIGNATURES` — both `buyerSigned: false`, `sellerSigned: false`, compliance with `warningCount: 2` | Amber warning indicator (`[class*="bg-amber"]`) visible |
| 020040 | Counter-offer flag shows warning | `MOCK_RPA_COUNTER_OFFER` — `seller_acceptance.accepted_subject_to_counter_offer: true`, compliance with `warningCount: 1` | Warning indicator visible (counter-offer flags are diagnostic, not blocking) |

**UI pages tested:** `ContractUploadPage` → `ContractReviewPage` (step 4).

**Navigation pattern:** Upload → auto-navigate to review → `goToStep(4)` → assert.

### 03 — Submission Flow (3 tests)

These test the submit contract action on step 5. They intercept _both_ the
extract endpoint (for mock data) and the submit endpoint (for success/failure).

| ID | Name | Mock setup | Assertion |
|---|---|---|---|
| 030010 | Happy path submit | Valid RPA + submit returns 200 | After clicking "Submit Contract", browser navigates to URL matching `/transactions/` (the transaction detail page) |
| 030020 | Submit with warnings | Missing price RPA (`blockerCount: 0, warningCount: 1`) + submit returns 200 | Same navigation assertion — warnings are non-blocking, submission succeeds |
| 030030 | Submit server error | Valid RPA + submit returns 500 `{ message: 'Internal server error during submission' }` | Error banner (`[class*="bg-red-50"]`) remains visible on the review page — no navigation |

**UI pages tested:** `ContractUploadPage` → `ContractReviewPage` (step 5).

**Navigation pattern:** Upload → navigate to step 5 → `submitWithDefaults()` → assert
redirect or error state.

### 04 — Wizard Integrity (3 tests)

These test that the wizard UI components work correctly — step navigation,
data rendering across steps, and back-navigation.

| ID | Name | What it does |
|---|---|---|
| 040010 | Step navigation through all 5 steps | Uploads valid RPA, waits for review wizard. Clicks "Next" while iterating through expected headings: `Parties`, `Dates`, `Deadlines`, `Compliance`, `Confirm`. Each heading must be visible before advancing. |
| 040020 | Extracted parties visible on step 1 | Same upload. Asserts `text=John Buyer` (from mock RPA buyer) and `text=Jane Seller` (from mock RPA seller) are visible on the first step without any navigation. |
| 040030 | Back link returns to upload page | Same upload. Clicks the "Upload Contract" link from the review page heading. Asserts URL changes to `/transactions/new/contract` and the upload page heading "Upload Contract Documents" is visible. |

**UI pages tested:** `ContractUploadPage` → `ContractReviewPage` (all 5 steps)
→ back to `ContractUploadPage`.

### 05 — Multi-Form Dashboard (2 tests)

These test that after uploading a contract and creating a draft, the dashboard
renders the transaction card with form status information.

| ID | Name | What it does |
|---|---|---|
| 050010 | Dashboard shows transaction after upload | Uploads valid RPA via intercepted API. Review wizard loads. Then navigates to `/dashboard` and asserts the "Draft" stat card is visible (the transaction exists in the list). |
| 050020 | Dashboard shows form status icons | Same upload flow. Navigates to dashboard. Asserts the `Forms:` label prefix is visible in the transaction card, indicating that submitted form codes are rendered with `✓`/`○` icons. |

**UI pages tested:** `ContractUploadPage` → `ContractReviewPage` → `DashboardPage`
(direct navigation).

**Note:** Dashboard tests rely on the mock transaction from the intercept, not
a real API call. The dashboard may show cached/mock data for the draft
transaction count.

### 06 — Roles & Permissions (3 tests)

These test authentication guards and sidebar rendering.

| ID | Name | What it does |
|---|---|---|
| 060010 | Unauthenticated user redirected | Clears cookies, navigates to `/dashboard`. Asserts URL redirects to `/login`. No authenticated storage used — this test runs in the same context but with cookies wiped. |
| 060020 | Authenticated user can access dashboard | Uses the shared auth storage (logged in as test user via auth setup). Navigates to `/dashboard`. Asserts `h1:has-text("Dashboard")` is visible. |
| 060030 | Sidebar shows user session info | Same authenticated session. Asserts "Sign out" button is visible in the sidebar, confirming the session is intact and the user menu renders. |

**UI pages tested:** `LoginPage` (redirect target), `DashboardPage` (sidebar
for 060030).

**Note:** `060010` clears cookies in the shared context, which may affect
subsequent tests. Since the config uses `workers: 1`, tests run serially.

### 07 — Multi-Counter-Offer (4 tests)

These tests validate counter-offer edge cases — different combinations of
counter-offer flags and counter form codes (SCO, BCO).

| ID | Name | Mock data | Key assertions |
|---|---|---|---|
| 070010 | RPA with SCO/BCO counter offers | `MOCK_RPA_MULTI_COUNTER_OFFER` — `purchasePrice: 925000`, `accepted_subject_to_counter_offer: true`, forms: RPA + SCO + BCO | Step 4: amber badge, SCO & BCO visible. Step 2: `$925,000` |
| 070020 | BCO-only counter offer | `MOCK_RPA_BCO_ONLY` — `purchasePrice: 950000`, `accepted_subject_to_counter_offer: true`, forms: RPA + BCO only | Step 4: amber badge, BCO visible, no SCO. Step 2: `$950,000` |
| 070030 | Flag false with SCO present | `MOCK_RPA_FLAG_FALSE_WITH_SCO` — `purchasePrice: 880000`, `accepted_subject_to_counter_offer: false`, forms: RPA + SCO | Step 4: green compliant badge, SCO visible. No warnings. |
| 070040 | Flag true, no counter form | `MOCK_RPA_FLAG_TRUE_NO_COUNTER` — `purchasePrice: 975000`, `accepted_subject_to_counter_offer: true`, forms: RPA only | Step 4: amber badge, no SCO/BCO visible. Step 2: `$975,000` |

**Key mock data features:**
- `transaction.purchasePrice` varies per scenario to verify price display
- `seller_acceptance.accepted_subject_to_counter_offer` drives compliance warnings
- `formsAndDisclosures` array determines which form codes appear in the wizard

**UI pages tested:** `ContractUploadPage` → `ContractReviewPage` (step 4, then step 2).

### 08 — Contingency Dates (5 tests)

These tests validate the step 3 ("Contingencies & Deadlines") UI — deadline row labels, days pills, calculated dates, and edge cases.

| ID | Name | Mock data | Key assertions |
|---|---|---|---|
| 080010 | All contingency dates display | `MOCK_RPA_VALID` — `inspectionContingencyDays: 17`, `loanContingencyDays: 21`, `appraisalContingencyDays: 17`, `disclosuresDueDays: 7` | Step 3: "Inspection Contingency" + "17 days" + "Jan 19, 2026"; Loan: "21 days" + "Jan 23, 2026"; Disclosures: "7 days" + "Jan 9, 2026" |
| 080020 | Missing all contingency dates | `MOCK_RPA_NULL_CONTINGENCIES` — all 4 fields `null` | Step 3: row labels visible, no days pills, 4 "—" placeholders |
| 080030 | Null acceptance date | `MOCK_RPA_NULL_ACCEPTANCE` — `acceptanceDate: null` | Step 3: amber warning "Acceptance date not found", days pills still visible, 4 "—" dates |
| 080040 | Partial contingency data | `MOCK_RPA_PARTIAL_CONTINGENCIES` — inspection=17, disclosures=7, loan=null, appraisal=null | Step 3: Inspection/Disclosures show pills + dates; Loan/Appraisal show no pills + "—" |
| 080050 | Other deadlines section | `buildMockWithOtherDeadlines()` — HOA + Pest entries | Step 3: "Other deadlines" header visible, custom entries rendered, standard rows still present |

**UI pages tested:** `ContractUploadPage` → `ContractReviewPage` (step 3).

---

## Page Objects

All locators and page interactions are encapsulated in reusable classes under
`pages/`. Tests never use raw `page.locator()` — they call page object methods.

### LoginPage

```typescript
class LoginPage {
  async goto(): Promise<void>             // Navigate to /login
  async login(email?, password?): void    // Fill form, submit, wait for dashboard
}
```

### ContractUploadPage

```typescript
class ContractUploadPage {
  async goto(): Promise<void>             // Navigate to /transactions/new/contract
  async uploadDummyPdf(): Promise<void>   // Trigger file chooser, select dummy.pdf
  async clickExtract(): Promise<void>     // Click "Extract & Create Draft"

  get extractButton(): Locator            // Locator for submit button
  get rpaNotFoundMessage(): Locator       // Red banner: "RPA required"
  get duplicateMessage(): Locator         // Amber banner: "Transaction already exists"
}
```

### ContractReviewPage

```typescript
class ContractReviewPage {
  async waitForReady(): Promise<void>             // Wait for "Parties" heading
  async goToStep(step: number): Promise<void>     // Click step indicator button
  async clickNext(): Promise<void>
  async clickBack(): Promise<void>
  async submitWithDefaults(): Promise<void>       // Navigate to step 5, click Submit

  get blockerIndicators(): Locator                // Elements with bg-red class
  get warningIndicators(): Locator                // Elements with bg-amber class
  get submitButton(): Locator
  get submitError(): Locator                      // Error banner after failed submit
}
```

---

## Prerequisites & Running

### Prerequisites

| Requirement | Command |
|---|---|
| PostgreSQL | `docker compose up -d` |
| API server (port 3000) | `pnpm --filter @tc/api dev` |
| Web server (port 3001) | `pnpm --filter @tc/web dev` |
| Seeded database | `pnpm --filter @tc/api db:setup` |
| Chromium browser | `pnpm --filter @tc/web exec playwright install chromium` |

The auth setup logs in as the test user from `E2E_USER_EMAIL` (password
`Password1!`) which must exist in the seeded database.

### Commands

```bash
pnpm test:e2e              # All 23 tests (22 scenarios + auth setup), headless
pnpm test:e2e:ui           # Playwright UI mode (interactive)
pnpm test:e2e:debug        # Step-by-step with Paused inspector

# Single file
npx playwright test --config e2e/playwright.config.ts scenarios/01-upload-errors/upload-errors.spec.ts

# Single test by number
npx playwright test --config e2e/playwright.config.ts -g "020010"
```

### Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `E2E_WEB_URL` | `http://localhost:3001` | Next.js app URL |
| `E2E_API_URL` | `http://localhost:3000/api/v1` | NestJS API URL |
| `E2E_USER_EMAIL` | `alice.tc@sunsetrealty.com` | Login email |
| `E2E_USER_PASSWORD` | `Password1!` | Login password |

### CI considerations

In CI the Playwright config uses `retries: 1` to handle flaky tests.
Screenshots are captured on every test and saved to `test-results/`.
Traces (DOM snapshots + network logs) are captured on first retry.

---

## Adding a New Scenario

```typescript
import { test, expect } from '@playwright/test';
import { ContractUploadPage } from '../../pages/ContractUploadPage';
import { ContractReviewPage } from '../../pages/ContractReviewPage';
import { interceptExtractAndDraft } from '../../helpers/api-intercepts';
import {
  MOCK_RPA_VALID,
  buildMockExtractResponse,
} from '../../helpers/mock-data';

test('021050 specific compliance rule displays correctly', async ({ page }) => {
  // 1. Pick the next free number in the target group
  // 2. Construct mock response with appropriate compliance data
  const mockResponse = buildMockExtractResponse(MOCK_RPA_VALID, {
    blockerCount: 1,
    status: 'non_compliant',
  });

  // 3. Register interceptor BEFORE the page makes the API call
  await interceptExtractAndDraft(page, mockResponse);

  // 4. Drive the UI via page objects
  const upload = new ContractUploadPage(page);
  await upload.goto();
  await upload.uploadDummyPdf();
  await upload.clickExtract();

  // 5. Assert on the review wizard
  const review = new ContractReviewPage(page);
  await review.waitForReady();
  await review.goToStep(4);
  await expect(review.blockerIndicators.first()).toBeVisible();
});
```

### Available mock data builders

| Builder | Use when |
|---|---|
| `buildMockExtractResponse(data, complianceInput?)` | General purpose — specify blocker/warning counts |
| `buildMockExtractResponseWithBlockers(data, blockerCount, warningCount?)` | Testing blocker display (sets `non_compliant`) |
| `buildMockExtractResponseWithWarnings(data, warningCount?)` | Testing warning display (sets `needs_review` status) |

### Available extraction data constants

| Constant | Description |
|---|---|
| `MOCK_RPA_VALID` | Full RPA with price, signatures, agents, parties |
| `MOCK_RPA_MISSING_PRICE` | Same but `purchasePrice: null` |
| `MOCK_RPA_MISSING_SIGNATURES` | Same but `buyerSigned: false`, `sellerSigned: false` |
| `MOCK_RPA_COUNTER_OFFER` | Same with `seller_acceptance.accepted_subject_to_counter_offer: true` |
| `MOCK_RPA_MULTI_COUNTER_OFFER` | Counter-offer scenario with `purchasePrice: 925000`, SCO + BCO in `formsAndDisclosures`, and counter-offer acceptance flag |
| `MOCK_RPA_BCO_ONLY` | Counter-offer with `purchasePrice: 950000`, only BCO form (no SCO), counter-offer flag true |
| `MOCK_RPA_FLAG_FALSE_WITH_SCO` | No counter-offer (`accepted_subject_to_counter_offer: false`), `purchasePrice: 880000`, SCO present in forms |
| `MOCK_RPA_FLAG_TRUE_NO_COUNTER` | Counter-offer flag true but no SCO/BCO forms, `purchasePrice: 975000` |
| `MOCK_RPA_NULL_CONTINGENCIES` | All 4 `contractTerms` fields set to `null` |
| `MOCK_RPA_PARTIAL_CONTINGENCIES` | `inspectionContingencyDays: 17`, `disclosuresDueDays: 7`, loan/appraisal `null` |
| `MOCK_RPA_NULL_ACCEPTANCE` | `transaction.acceptanceDate: null`, contingency days still populated |
| `buildMockWithOtherDeadlines(deadlines)` | Returns RPA data with custom `otherDeadlines` array |
| `MOCK_NON_RPA` | Unknown document type, all fields empty — triggers 422 |

### Available intercept helpers

| Helper | Purpose |
|---|---|
| `interceptExtractAndDraft(page, response)` | Returns mock `extract-and-draft` response |
| `interceptExtractAndDraftError(page, status, body)` | Returns error status + body |
| `interceptSubmitContract(page, transactionId)` | Returns submit success |
| `interceptSubmitContractError(page, status, message)` | Returns submit error |
| `removeMockRoutes(page, pattern)` | Tears down a route interceptor |
