# Test Case Catalog

Central index for all test scenarios across the TC platform. Each domain file catalogs test cases with shared conventions for IDs, test data, and tracking.

## Conventions

### ID Numbering

Format: `{DOMAIN}-{NNNN}` where `NNNN` is 4 digits stepping by 10.

| Prefix | Domain | File |
|---|---|---|
| `CONTRACT` | Contract stage forms (RPA, AD, AVID, BIA, SCO/BCO) | `contract-stage.md` |
| `DISCLOS` | Disclosures stage forms (TDS, SPQ, NHD) | `disclosures-stage.md` |
| `INSPECT` | Inspection stage forms (RR, contingency removal) | `inspection-stage.md` |
| `AUTH` | Authentication, enrollment, roles, org membership | `auth-enrollment.md` |
| `TXFLOW` | Transaction workflow (submit, duplicate, version) | `transaction-workflow.md` |
| `BROKER` | Brokerage activities (team, invites, assignments) | `brokerage-activities.md` |
| `TCADMIN` | TC admin activities (oversight, notes, handoff) | `tc-admin-activities.md` |
| `STAGE` | Stage advancement rules | `stage-advancement.md` |
| `UI` | Visual/UI integrity | `ui-visual.md` |
| `EMAIL` | Notifications and email | `email-notifications.md` |

Gaps of 10 allow insertion of new cases without renumbering (e.g., `CONTRACT-0010`, `CONTRACT-0020`...`CONTRACT-0090`).

### Column Definitions

| Column | Meaning |
|---|---|
| **ID** | Unique test case identifier |
| **Scenario** | One-line description of what is being tested |
| **Prerequisites** | Required state before execution (auth, data, stage) |
| **Test Data** | Form fixture or mock data reference. See `packages/test-pdf-generator/src/fixtures/` |
| **Steps** | High-level execution steps (numbered) |
| **Expected Result** | What should happen on success |
| **Last Tested** | Date of last execution (YYYY-MM-DD) |
| **Status** | `Draft` / `Pass` / `Fail` / `Blocked` / `N/A` |
| **Covered By** | Automated test file + line or issue (blank = manual) |
| **Issue** | GitHub issue link for tracking |

### Status Values

| Status | Meaning |
|---|---|
| `Draft` | Test case written but not yet executed |
| `Pass` | Last execution passed all assertions |
| `Fail` | Last execution failed — bug or regression |
| `Blocked` | Cannot execute — blocked by dependency, missing feature, or environment issue |
| `N/A` | Not applicable (e.g., placeholder, deprecated scenario) |

### Test Data References

- **PDF fixtures**: `packages/test-pdf-generator/src/fixtures/CA-*.ts` — generate filled C.A.R. form PDFs
- **JSON snapshots**: `packages/document-intelligence/test/fixtures/*.json` — extraction results for validator tests
- **E2E mock data**: `apps/web/e2e/helpers/mock-data.ts` — browser-level interceptor payloads

### Adding a New Test Case

1. Pick the next available ID in the domain range (gaps of 10)
2. Add a row to the summary table
3. Write the detail section with steps and expectations
4. Create a GitHub issue with the ID in the title: `[CONTRACT-0010] Valid RPA upload — no blockers`
5. Fill the Issue column
6. When automated, update Covered By with file path

## Coverage Summary

| Domain | Total Cases | Automated | Manual | Not Started |
|---|---|---|---|---|
| Contract Stage | 6 | 0 | 0 | 6 |
| Disclosures Stage | 6 | 0 | 0 | 6 |
| Inspection Stage | 7 | 0 | 0 | 7 |
| Auth & Enrollment | 8 | 0 | 0 | 8 |
| Transaction Workflow | 8 | 0 | 0 | 8 |
| Brokerage Activities | 11 | 0 | 0 | 11 |
| TC Admin Activities | 10 | 0 | 0 | 10 |

## Screenshots

Expected UI screenshots live in `screenshots/` and are referenced from detail sections with relative paths.
