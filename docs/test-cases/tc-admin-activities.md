# TC Admin Activities — Test Cases

Covers Transaction Coordinator workflows: cross-transaction oversight, document monitoring, compliance review, party communication, and stage tracking.

## ID Numbering

`TCADMIN-0010` to `TCADMIN-9990` (steps of 10).

| Range | Focus |
|---|---|
| 0010–0990 | [TC dashboard and transaction list](#range-tc-dashboard) |
| 1000–1990 | [Document and compliance monitoring](#range-tc-compliance) |
| 2000–2990 | [Stage tracking and advancement](#range-tc-stage) |
| 3000–3990 | [Party communication and notes](#range-tc-notes) |
| 4000–4990 | [TC assignment and handoff](#range-tc-handoff) |
| 5000–5990 | [Multi-org TC support](#range-tc-multi-org) |

---

<a id="range-tc-dashboard"></a>

## Reference Example: TCADMIN-0010 — TC Dashboard — Shows Only Assigned Transactions

| Field | Value |
|---|---|
| **ID** | `TCADMIN-0010` |
| **Scenario** | TC logs in and sees only transactions they are assigned to |
| **Prerequisites** | TC account exists with roles: [USER, TRANSACTION_COORDINATOR]. TC is assigned to 3 transactions across 2 orgs. There are other transactions in the system not assigned to this TC. |
| **Steps** | 1. Login as TC<br>2. Navigate to /dashboard<br>3. Observe transaction list |
| **Expected Result** | Dashboard shows exactly 3 transactions (assigned). No transactions from other TCs or unassigned transactions appear. Each transaction shows: address, status, stage, assigned agent, last activity date, compliance summary (blocker count). |
| **Last Tested** | |
| **Status** | Draft |

### Detail

**Key assertions:**
- Transaction count in list = 3
- No transactions with `assignedCoordinatorAccountId !== <tc-account-id>` leak in
- Transaction cards/rows show:
  - Property address
  - Current stage badge (e.g., "CONTRACT", "DISCLOSURES")
  - Status badge (e.g., "ACTIVE")
  - Assigned agent name
  - Compliance indicator (green = no blockers, yellow = warnings, red = blockers)
- Cross-org: transactions from both orgs visible (TC works across orgs)

**Screenshot:** `screenshots/tcadmin-0010-dashboard.png`

**Failure modes:**
- Re-assigned to new TC: old TC loses access at next refresh
- Unassigned (set to null): TC loses access, dashboard shows empty state
- TC with 0 assigned transactions → empty state with guidance message

---

## Reference Example: TCADMIN-0020 — TC Dashboard — Filter by Stage

| Field | Value |
|---|---|
| **ID** | `TCADMIN-0020` |
| **Scenario** | TC filters assigned transactions by stage |
| **Prerequisites** | TC has transactions in CONTRACT, DISCLOSURES, and INSPECTION stages |
| **Steps** | 1. Click stage filter dropdown<br>2. Select "CONTRACT" |
| **Expected Result** | List filters to only CONTRACT-stage transactions. Selecting "All Stages" resets. URL updates (e.g., `?stage=CONTRACT`). Count reflects filtered total. |
| **Last Tested** | |
| **Status** | Draft |

---

<a id="range-tc-compliance"></a>

## Reference Example: TCADMIN-1010 — TC Views Transaction Compliance Details

| Field | Value |
|---|---|
| **ID** | `TCADMIN-1010` |
| **Scenario** | TC opens a transaction to review compliance blockers and warnings |
| **Prerequisites** | Transaction has: 1 blocker (missing purchase price) and 2 warnings (missing signatures) |
| **Steps** | 1. Click on transaction from dashboard<br>2. Navigate to compliance section<br>3. Observe blocker/warning list |
| **Expected Result** | Compliance section shows: BLOCKER-RPA-1 with description and severity. Both warnings listed with descriptions. TC can mark individual items as "acknowledged" (not resolved — resolution requires document re-upload). Acknowledged items visually dim but remain visible. |
| **Last Tested** | |
| **Status** | Draft |

**Key assertions:**
- Blocker count badge shows "1"
- Warning count badge shows "2"
- Each item shows: code, description, severity badge (red/yellow)
- Acknowledge action is per-item, not per-section
- Acknowledged state persists across page reloads
- TC acknowledgement does NOT change compliance result (only diagnostic)

**Screenshot:** `screenshots/tcadmin-1010-compliance-review.png`

---

## Reference Example: TCADMIN-1020 — TC Views All Uploaded Documents

| Field | Value |
|---|---|
| **ID** | `TCADMIN-1020` |
| **Scenario** | TC opens transaction and reviews document list per stage |
| **Prerequisites** | Transaction has: RPA + AD + AVID in CONTRACT, TDS in DISCLOSURES |
| **Steps** | 1. Open transaction<br>2. Switch between stage tabs<br>3. Observe documents |
| **Expected Result** | CONTRACT tab shows RPA, AD, AVID documents. DISCLOSURES tab shows TDS document. Each document card shows: form code, version number, upload date, status (active/superseded). Superseded documents show version history link. TC can click to preview/download document. |
| **Last Tested** | |
| **Status** | Draft |

---

<a id="range-tc-stage"></a>

## Reference Example: TCADMIN-2010 — TC Advances Transaction Stage

| Field | Value |
|---|---|
| **ID** | `TCADMIN-2010` |
| **Scenario** | TC advances a transaction from CONTRACT to DISCLOSURES stage |
| **Prerequisites** | Transaction is in CONTRACT stage. All CONTRACT-stage compliance checks pass (or TC has acknowledged blockers). Transaction status is ACTIVE. |
| **Steps** | 1. Open transaction<br>2. Click "Advance Stage"<br>3. Select "DISCLOSURES"<br>4. Confirm |
| **Expected Result** | Stage transitions to DISCLOSURES. New workflow step created for DISCLOSURES. Previous CONTRACT step marked complete. UI shows DISCLOSURES as active stage. Stage history available. If compliance blockers exist and not acknowledged → confirmation dialog warns TC before proceeding. |
| **Last Tested** | |
| **Status** | Draft |

**Key assertions:**
- DB: `transaction_workflow_steps` new row for DISCLOSURES with `status: "active"`
- DB: CONTRACT step `status` changed to `"completed"`
- UI: swimlane shows DISCLOSURES highlighted
- If blockers unacknowledged: confirmation modal shows blocker count and requires explicit confirmation
- If all clear: no confirmation modal, advances immediately

---

## Reference Example: TCADMIN-2020 — TC Cannot Advance to Stage Without Required Forms

| Field | Value |
|---|---|
| **ID** | `TCADMIN-2020` |
| **Scenario** | TC attempts to advance to DISCLOSURES but TDS has not been uploaded |
| **Prerequisites** | Transaction in CONTRACT. No TDS or SPQ uploaded yet. `STAGE_FORM_EXPECTATIONS` marks TDS as required for DISCLOSURES. |
| **Expected Result** | Advance blocked. UI shows message: "Cannot advance to DISCLOSURES: TDS is required. Please upload before advancing." If form is expected (not required), show warning but allow advance. |
| **Last Tested** | |
| **Status** | Draft |

---

<a id="range-tc-notes"></a>

## Reference Example: TCADMIN-3010 — TC Adds Internal Note to Transaction

| Field | Value |
|---|---|
| **ID** | `TCADMIN-3010` |
| **Scenario** | TC adds an internal note visible to the agent but not to buyer/seller |
| **Prerequisites** | TC is assigned to the transaction |
| **Steps** | 1. Open transaction<br>2. Navigate to Notes section<br>3. Type note: "Waiting on seller to sign TDS — followed up via phone on 6/8"<br>4. Save |
| **Expected Result** | Note saved with timestamp and author (TC name). Note visible to agent. Note NOT visible to external parties (no buyer/seller access). Audit log: `NOTE_ADDED`. Note can be edited or deleted by author within 24 hours. |
| **Last Tested** | |
| **Status** | Draft |

---

<a id="range-tc-handoff"></a>

## Reference Example: TCADMIN-4010 — TC Handoff to Another TC

| Field | Value |
|---|---|
| **ID** | `TCADMIN-4010` |
| **Scenario** | Current TC reassigns transaction to another TC |
| **Prerequisites** | TC-A is assigned. TC-B exists with TRANSACTION_COORDINATOR role. |
| **Expected Result** | TC-A can search for TC-B (reuses search-coordinators endpoint). On reassign: `assignedCoordinatorAccountId` changes to TC-B. TC-A loses access. TC-B gains access. Audit log: `TC_REASSIGNED` with both old and new IDs. Email notification sent to both TCs. |
| **Last Tested** | |
| **Status** | Draft |

---

<a id="range-tc-multi-org"></a>

## Reference Example: TCADMIN-5010 — TC Works Across Multiple Orgs

| Field | Value |
|---|---|
| **ID** | `TCADMIN-5010` |
| **Scenario** | TC is assigned transactions in two different brokerages and sees both |
| **Prerequisites** | TC has active memberships in Org A and Org B. TC assigned to 2 transactions in Org A and 1 in Org B. |
| **Expected Result** | Dashboard shows all 3 transactions. Org indicator visible per transaction (e.g., badge or subtle label). Filters include org filter. TC can switch between org views. Cross-org data isolation: cannot access Org A data from Org B context. |
| **Last Tested** | |
| **Status** | Draft |

<a id="range-tc-notifications"></a>

## Reference Example: TCADMIN-6010 — TC Receives Notification on Document Upload

| Field | Value |
|---|---|
| **ID** | `TCADMIN-6010` |
| **Scenario** | TC receives notification when agent uploads a new document to an assigned transaction |
| **Prerequisites** | TC is assigned. Agent uploads a new TDS to the transaction. |
| **Expected Result** | TC receives in-app notification: "New document uploaded: TDS — 123 Main Street". Optional email notification if configured. Notification links to transaction document section. Notification marked as read after click. |
| **Last Tested** | |
| **Status** | Draft |

---

## Scenarios to Add

_Checklist of high-value test cases not yet cataloged:_

- [ ] TCADMIN-0030 — TC dashboard sort by last activity (most recent first)
- [ ] TCADMIN-0040 — TC dashboard search by address or agent name
- [ ] TCADMIN-1030 — TC views version comparison diff between RPA V1 and V2
- [ ] TCADMIN-1040 — TC downloads document PDF from document list
- [ ] TCADMIN-2030 — TC reverts stage advance (go back to previous stage)
- [ ] TCADMIN-2040 — Stage advancement history visible in audit trail
- [ ] TCADMIN-3020 — TC sends message to agent through platform messenger
- [ ] TCADMIN-4020 — TC unassigned from transaction (no replacement) → transaction becomes unassigned
- [ ] TCADMIN-5020 — TC leaves one org → loses access to those transactions only
- [ ] TCADMIN-6020 — TC notification preferences (in-app only vs email + in-app)
