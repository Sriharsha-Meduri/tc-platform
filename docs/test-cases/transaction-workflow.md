# Transaction Workflow — Test Cases

Covers transaction lifecycle: creation, duplicate detection, submission, versioning, stage advancement, and status transitions.

## ID Numbering

`TXFLOW-0010` to `TXFLOW-9990` (steps of 10).

| Range | Focus |
|---|---|
| 0010–0990 | [Transaction creation and duplicate detection](#range-tx-creation) |
| 1000–1990 | [Submission (DRAFT → ACTIVE)](#range-tx-submission) |
| 2000–2990 | [Document versioning and re-upload](#range-tx-versioning) |
| 3000–3990 | [Stage advancement and reclassification](#range-tx-stage-advance) |
| 4000–4990 | Transaction status transitions (ACTIVE → UNDER_CONTRACT → CLOSED) |

---

<a id="range-tx-creation"></a>

## Reference Example: TXFLOW-0010 — Initial RPA Upload Creates DRAFT Transaction

| Field | Value |
|---|---|
| **ID** | `TXFLOW-0010` |
| **Scenario** | First RPA upload for a new address creates a DRAFT transaction |
| **Prerequisites** | Authenticated as agent; no existing transaction at this address for this org |
| **Test Data** | `CA-RPA-valid` fixture (123 Main Street) |
| **Steps** | 1. POST /api/v1/document-extraction/extract-and-draft with RPA PDF<br>2. Check response<br>3. Verify DB state |
| **Expected Result** | Status 200. `data.transaction.status === "DRAFT"`. Transaction created in `transactions` table. `TransactionDocument` created with `versionNo: 1`. `metadataJson.compliance` populated. |
| **Last Tested** | |
| **Status** | Draft |

### Detail

**API call:**
```
POST /api/v1/document-extraction/extract-and-draft
Content-Type: multipart/form-data
Body: { file: <RPA.pdf>, organizationId: "..." }
```

**Key assertions:**
- Response includes `existingTransactionId: null` (no duplicate)
- Response includes `data.transaction.id` (UUID)
- DB: `transactions` row exists with status `DRAFT`
- DB: `transaction_documents` row exists with `detectedFormCode: "RPA"`, `versionNo: 1`, `previousVersionId: null`
- `metadataJson` contains `compliance` object with extraction results

**Screenshot:** `screenshots/txflow-0010-wizard-step3.png`

---

## Reference Example: TXFLOW-0020 — Duplicate RPA for Same Address Returns 200 with `duplicate: true`

| Field | Value |
|---|---|
| **ID** | `TXFLOW-0020` |
| **Scenario** | Upload RPA for an address that already has an existing transaction in the same org |
| **Prerequisites** | Existing DRAFT transaction at "123 Main Street" for this org |
| **Test Data** | Same `CA-RPA-valid` fixture (same address, same org) |
| **Steps** | 1. Upload RPA (same file as TXFLOW-0010)<br>2. Check response<br>3. Verify no new transaction created |
| **Expected Result** | Status 200. `data.duplicate === true`. `data.existingTransactionId` matches the earlier transaction. No new `transactions` row created. No new `transaction_documents` row created (duplicate was rejected before storage). |
| **Last Tested** | |
| **Status** | Draft |

### Detail

**Key assertions:**
- `response.data.duplicate === true`
- `existingTransactionId` is the UUID from TXFLOW-0010
- `extractionResult` still returned (extraction ran, but not stored)
- `compliance` still returned (validation ran, diagnostic only)
- DB count of `transactions` for this org+address is still 1
- No second version of the RPA document created

**Failure modes:**
- Different address → no duplicate detection (correct behavior)
- Different org → no duplicate detection (correct behavior)
- Same address, different form code (e.g., TDS) → NOT a duplicate (only RPA triggers the gate on initial upload; subsequent uploads check at the document level, not the transaction level)

---

## Reference Example: TXFLOW-0030 — Duplicate DRAFT: "Keep Existing" Routes to Step 4

| Field | Value |
|---|---|
| **ID** | `TXFLOW-0030` |
| **Scenario** | User clicks "Keep Existing" on a duplicate DRAFT transaction |
| **Prerequisites** | Duplicate detection showed DRAFT transaction (TXFLOW-0020), user is on the duplicate banner |
| **Steps** | 1. Click "Keep Existing" button on duplicate banner<br>2. Observe UI transition |
| **Expected Result** | Duplicate banner dismissed. UI jumps to Step 4 (compliance) of the existing transaction's wizard. No navigation to a new route. |
| **Last Tested** | |
| **Status** | Draft |

**Key assertions:**
- `dismissDuplicate` state set to `true`
- `step` state set to `4`
- URL does not change (stays on wizard)
- Existing transaction's compliance data loads in Step 4

**Screenshot:** `screenshots/txflow-0030-keep-existing-draft.png`

---

## Reference Example: TXFLOW-0040 — Duplicate ACTIVE+: "Keep Existing" Routes to Dashboard with hideMeta

| Field | Value |
|---|---|
| **ID** | `TXFLOW-0040` |
| **Scenario** | User clicks "Keep Existing" on a duplicate ACTIVE transaction |
| **Prerequisites** | Duplicate detection showed ACTIVE transaction |
| **Expected Result** | Browser navigates to `/dashboard/transactions/{id}?hideMeta=1`. Key dates and InitWorkflowPanel hidden. StagedSwimlane still visible. |
| **Last Tested** | |
| **Status** | Draft |

---

<a id="range-tx-submission"></a>

## Reference Example: TXFLOW-1010 — Submit Contract Converts DRAFT → ACTIVE

| Field | Value |
|---|---|
| **ID** | `TXFLOW-1010` |
| **Scenario** | User submits a DRAFT transaction through the wizard |
| **Prerequisites** | Transaction in DRAFT status; RPA extracted; wizard at step 5 |
| **Steps** | 1. Click "Submit" on Step 5 (Confirm)<br>2. Check response<br>3. Verify DB state |
| **Expected Result** | Status 200. `transaction.status` transitions to `ACTIVE`. `TransactionDocumentSubmission` row created with `submissionNo: 1`, `status: UNDER_REVIEW`. CONTRACT stage activated. Webhook/email sent. |
| **Last Tested** | |
| **Status** | Draft |

**Key assertions:**
- `transactions.status` changed from `DRAFT` to `ACTIVE`
- `transaction_workflow_steps` row created for CONTRACT stage (status: `active`)
- `transaction_document_submissions` row exists with `submissionNo: 1`
- Calendar events seeded from extraction dates
- Welcome email sent to parties (if configured)

---

<a id="range-tx-versioning"></a>

## Reference Example: TXFLOW-2010 — Re-Upload RPA Creates New Version (Material Change → void_suggested)

| Field | Value |
|---|---|
| **ID** | `TXFLOW-2010` |
| **Scenario** | Re-upload RPA with materially different purchase price |
| **Prerequisites** | Existing ACTIVE transaction with RPA at $900,000. User uploads corrected RPA at $875,000 (change > $1000 threshold). |
| **Test Data** | V1: `CA-RPA-resubmit` RPA-V1 (V1 = $900K). V2: RPA-V2 ($875K). |
| **Expected Result** | Old document marked `status: SUPERSEDED`. New document created with `versionNo: 2`, `previousVersionId` linking to V1. `versionComparison.hasMaterialChanges === true`. `versionAction === "void_suggested"`. |
| **Last Tested** | |
| **Status** | Draft |

**Key assertions:**
- Old document: `status === "SUPERSEDED"`
- New document: `versionNo === 2`, `previousVersionId === <V1 id>`
- `versionComparison.changes` includes a change to `purchase_price`
- `versionComparison.changes.find(c => c.path === "purchase_price").severity === "material"`
- `versionAction === "void_suggested"`
- `metadataJson.versionComparison` stored on new document

---

## Reference Example: TXFLOW-2020 — Re-Upload RPA (Minor Change → superseded)

| Field | Value |
|---|---|
| **ID** | `TXFLOW-2020` |
| **Scenario** | Re-upload RPA with minor change (closing cost credit change < $1000) |
| **Prerequisites** | Existing RPA at $900,000. Re-upload has $900,500 (change < threshold). |
| **Expected Result** | `versionComparison.hasMaterialChanges === false`. `versionAction === "superseded"`. (No void suggestion) |
| **Last Tested** | |
| **Status** | Draft |

---

<a id="range-tx-stage-advance"></a>

## Reference Example: TXFLOW-3010 — Upload TDS to CONTRACT Tab → Reclassified to DISCLOSURES

| Field | Value |
|---|---|
| **ID** | `TXFLOW-3010` |
| **Scenario** | User uploads a TDS form through the CONTRACT tab interface |
| **Prerequisites** | Transaction is in CONTRACT stage. User clicks "Upload Forms" in the CONTRACT tab but selects a TDS PDF. |
| **Test Data** | `CA-TDS-valid` fixture |
| **Expected Result** | `reclassified: true`. `submittedStage: "CONTRACT"`. `resolvedStage: "DISCLOSURES"`. Document stored under DISCLOSURES. UI shows message: "You uploaded a TDS to the CONTRACT tab — we moved it to DISCLOSURES." |
| **Last Tested** | |
| **Status** | Draft |

---

## Scenarios to Add

_Checklist of high-value test cases not yet cataloged:_

- [ ] TXFLOW-0050 — Upload non-RPA PDF first → 422 RPA_NOT_FOUND
- [ ] TXFLOW-1020 — Submit with compliance blockers still present → submit still succeeds (compliance not enforced)
- [ ] TXFLOW-1030 — Submit already-submitted transaction → error (no double-submit)
- [ ] TXFLOW-2030 — Re-upload SCO (counter-offer update) → version comparison + supersede
- [ ] TXFLOW-2040 — Re-upload non-critical form (e.g., AD) → version action = superseded (never void_suggested)
- [ ] TXFLOW-3020 — Advance stage CONTRACT → DISCLOSURES → verify stage gate
- [ ] TXFLOW-4010 — Cancel transaction (DRAFT → CANCELLED)
- [ ] TXFLOW-4020 — Archive transaction (ACTIVE → ARCHIVED)
- [ ] TXFLOW-4030 — Close transaction (ACTIVE → PENDING_CLOSE → CLOSED)
