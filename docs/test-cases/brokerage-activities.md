# Brokerage Activities — Test Cases

Covers broker admin workflows: team management, member invites, membership lifecycle, coordinator assignment, and org-level oversight.

## ID Numbering

`BROKER-0010` to `BROKER-9990` (steps of 10).

| Range | Focus |
|---|---|
| 0010–0990 | [Dashboard and org-level views](#range-broker-dashboard) |
| 0500–0590 | [Brokerage creation — cross-ref to `AUTH-2010`](#range-broker-creation) |
| 0600–0690 | [Broker admin invite acceptance & setup](#range-broker-invite-accept) |
| 1000–1990 | [Team members list (filter, sort, paginate)](#range-broker-team-list) |
| 2000–2990 | [Invite member flow](#range-broker-invite) |
| 3000–3990 | [Membership lifecycle (approve, reject, remove)](#range-broker-membership) |
| 4000–4990 | [TC search and assignment](#range-broker-tc) |
| 5000–5990 | [Org settings and profile](#range-broker-org-settings) |

---

<a id="range-broker-dashboard"></a>

## Reference Example: BROKER-0010 — Broker Admin Dashboard Displays Correct Stats

| Field | Value |
|---|---|
| **ID** | `BROKER-0010` |
| **Scenario** | Broker admin views dashboard — verify org-level stats are accurate |
| **Prerequisites** | Authenticated as broker_admin. Org has: 5 active agents, 2 pending members, 3 TCs, 15 active transactions |
| **Steps** | 1. Login as broker_admin<br>2. Navigate to /dashboard<br>3. Observe dashboard cards |
| **Expected Result** | Dashboard shows correct counts: Active Agents: 5, Pending Invitations: 2, Active Transactions: 15. No org-level stats leak across org boundaries. |
| **Last Tested** | |
| **Status** | Draft |

**Key assertions:**
- Stats cards render with correct numbers
- Org scope is correct (no cross-org data)
- Pending count matches DB query of `organization_memberships WHERE status = 'pending'`

**Screenshot:** `screenshots/broker-0010-dashboard.png`

---

<a id="range-broker-creation"></a>

## Reference Example: BROKER-0500 — Create Brokerage and Provision Broker Admin

> **Note:** This flow is owned by `AUTH-2010` in `auth-enrollment.md`. This entry is a cross-reference — see the source for full detail. The invite it produces is consumed by `BROKER-0060`.

| Field | Value |
|---|---|
| **ID** | `BROKER-0500` |
| **Scenario** | Support admin creates a new brokerage org and provisions the first broker admin user |
| **Prerequisites** | Authenticated as `SUPPORT_ADMIN` |
| **Test Data** | Org name: "Acme Realty", City: "Sacramento", State: "CA", Admin email: "broker@acme.com" |
| **Expected Result** | See [`AUTH-2010`](auth-enrollment.md#reference-example-auth-2010--admin-creates-brokerage). Org created ACTIVE. Pending User + Account created. Membership with BROKER_ADMIN role. Invite email sent. |
| **Last Tested** | |
| **Status** | Draft |

---

<a id="range-broker-invite-accept"></a>

## Reference Example: BROKER-0060 — Broker Admin Accepts Invite and Completes Registration

| Field | Value |
|---|---|
| **ID** | `BROKER-0060` |
| **Scenario** | Invited broker admin clicks invite link, registers, and logs in for the first time |
| **Prerequisites** | Org created via `AUTH-2010` / `BROKER-0500`. Invite email sent to `broker@acme.com`. Token is valid. |
| **Test Data** | Invite token from `AUTH-2010` flow. Registration payload: name: "Alice Broker", password, phone: "916-555-0100" |
| **Steps** | 1. Click invite link from email<br>2. Land on /register/invite?token=xxx<br>3. Fill name, password, phone<br>4. Submit<br>5. Login with new credentials<br>6. Observe dashboard |
| **Expected Result** | Account activated with `roles: [USER, BROKER_ADMIN]`. Membership auto-activated (`status: active`). Redirected to dashboard. Dashboard shows org stats (0 agents, 0 transactions). Sidebar shows "Broker" section with "Team Members" and "Invite Member". No "Admin Panel" link (only SUPPORT_ADMIN sees it). |
| **Last Tested** | |
| **Status** | Draft |

**Key assertions:**
- DB: `users.roles` contains `"USER"` and `"BROKER_ADMIN"`
- DB: `organization_memberships.status === "active"`, `joinedAt` is set
- After login: JWT contains both roles
- Dashboard: org name displayed, agent count = 0, pending count = 0
- Sidebar: "Broker" section visible with "Team Members" + "Invite Member"
- Sidebar: no "Admin Panel" link
- No agent-only features visible (TC search, transaction creation without agent)

**Screenshot:** `screenshots/broker-0060-first-login.png`

**Failure modes:**
- Expired token → error message, request new invite
- Already registered user → redirected to login, membership auto-activated
- Wrong email domain restrictions (if configured) → 403

---

<a id="range-broker-team-list"></a>

## Reference Example: BROKER-1010 — Team Members List — All Statuses Visible

| Field | Value |
|---|---|
| **ID** | `BROKER-1010` |
| **Scenario** | Broker admin views team members page — sees all members across membership statuses |
| **Prerequisites** | Org has members in each status: active (3), pending (2), rejected (1) |
| **Steps** | 1. Navigate to /dashboard/team/members<br>2. Observe the members table |
| **Expected Result** | All 6 members listed. Each row shows: name, email, role badge, status badge, joined date (if active). Pending members show approve/reject buttons. Active members show remove button. Rejected members show re-invite option. |
| **Last Tested** | |
| **Status** | Draft |

**Key assertions:**
- Table rows match total membership count
- Status badge colors: active=green, pending=yellow, rejected=red
- Approve/reject buttons only visible for pending members
- Remove button only visible for active members
- Broker_admin cannot remove themselves
- Pagination works if > 20 members

**Screenshot:** `screenshots/broker-1010-team-members.png`

---

## Reference Example: BROKER-1020 — Team Members List — Filter by Role

| Field | Value |
|---|---|
| **ID** | `BROKER-1020` |
| **Scenario** | Broker admin filters team members by role (e.g., show only AGENTs) |
| **Prerequisites** | Org has mix of AGENT, TRANSACTION_COORDINATOR, and BROKER_ADMIN members |
| **Expected Result** | Filter dropdown present. Selecting "Agent" shows only AGENT-role members. "Transaction Coordinator" shows only TC-role members. "All" resets to full list. URL updates with query param (e.g., `?role=agent`). |
| **Last Tested** | |
| **Status** | Draft |

---

<a id="range-broker-invite"></a>

## Reference Example: BROKER-2010 — Invite New Member — Valid Email

| Field | Value |
|---|---|
| **ID** | `BROKER-2010` |
| **Scenario** | Broker admin invites a new agent by email — member does not yet have an account |
| **Prerequisites** | Authenticated as broker_admin. Target email does not exist in any user table. |
| **Test Data** | Email: `newagent@example.com`, Role: AGENT |
| **Steps** | 1. Navigate to Invite Member form<br>2. Enter email + select role<br>3. Submit<br>4. Check DB and email |
| **Expected Result** | Status 200. New User + Account created with status PENDING. Membership created with status PENDING, role AGENT. Invite email sent via Mailgun (or mock). Audit log: `MEMBER_INVITED`. |
| **Last Tested** | |
| **Status** | Draft |

### Detail

**API call:**
```
POST /api/v1/auth/invite-member
Body: { email: "newagent@example.com", role: "AGENT", organizationId: "..." }
```

**Key assertions:**
- `users` table has new row: `email = "newagent@example.com"`, `status = "PENDING"`
- `organization_memberships` table: `status = "pending"`, `role = "AGENT"`
- `audit_logs` table: `action = "MEMBER_INVITED"`, `targetType = "organization_membership"`
- Email sent to `newagent@example.com` with invite link containing token
- Invite link URL includes `?token=` parameter

**Failure modes:**
- Invalid email format → 400 validation error
- Already active member in same org → 409 conflict
- Deactivated user → re-invite allowed (status reset to pending)

---

## Reference Example: BROKER-2020 — Invite Existing User to Join Org

| Field | Value |
|---|---|
| **ID** | `BROKER-2020` |
| **Scenario** | Invite someone who already has a TC account to join the brokerage as an agent |
| **Prerequisites** | Target user exists with roles: [USER, TRANSACTION_COORDINATOR]. No existing membership in this org. |
| **Expected Result** | No duplicate user created. Membership created linking to existing account. Invite email sent. After accept, user gains AGENT role alongside existing TC role. |
| **Last Tested** | |
| **Status** | Draft |

---

<a id="range-broker-membership"></a>

## Reference Example: BROKER-3010 — Approve Pending Membership

| Field | Value |
|---|---|
| **ID** | `BROKER-3010` |
| **Scenario** | Broker admin approves a pending agent membership request |
| **Prerequisites** | Member has status `pending`. Broker admin is logged in. |
| **Steps** | 1. Navigate to team members list<br>2. Click "Approve" on pending member<br>3. Confirm |
| **Expected Result** | `PATCH /api/v1/organization-memberships/:id/approve` returns 200. Row status changes to `active`. `joinedAt` timestamp set to current time. Audit log: `MEMBER_APPROVED`. Member now appears under active agents. Welcome email sent. |
| **Last Tested** | |
| **Status** | Draft |

**Key assertions:**
- DB: `status === "active"`, `joinedAt` is non-null
- UI: row moves from pending section to active section
- Audit log: `action = "MEMBER_APPROVED"`

---

## Reference Example: BROKER-3020 — Reject Pending Membership

| Field | Value |
|---|---|
| **ID** | `BROKER-3020` |
| **Scenario** | Broker admin rejects a pending membership |
| **Expected Result** | `PATCH /api/v1/organization-memberships/:id/reject` returns 200. Status changes to `rejected`. Audit log: `MEMBER_REJECTED`. Member filtered out of active views. Re-invite is possible. |
| **Last Tested** | |
| **Status** | Draft |

---

## Reference Example: BROKER-3030 — Remove Active Member

| Field | Value |
|---|---|
| **ID** | `BROKER-3030` |
| **Scenario** | Broker admin removes an active member from the brokerage |
| **Prerequisites** | Member is active. Member is not the only broker_admin (cannot leave org without an admin). |
| **Expected Result** | Membership deleted from DB. Audit log: `MEMBER_REMOVED`. Removed member no longer has access to org transactions. If last broker_admin → 409 (cannot remove). |
| **Last Tested** | |
| **Status** | Draft |

---

<a id="range-broker-tc"></a>

## Reference Example: BROKER-4010 — Search for Coordinators

| Field | Value |
|---|---|
| **ID** | `BROKER-4010` |
| **Scenario** | Broker admin searches for available transaction coordinators to assign |
| **Prerequisites** | At least 3 TCs exist across orgs. Query string matches 1 TC by name and 1 by email. |
| **Steps** | 1. Navigate to assign-coordinator search<br>2. Type partial name<br>3. Observe results |
| **Expected Result** | `GET /api/v1/accounts/search-coordinators?q=alice` returns matching TCs only. Agents and broker_admins are excluded from results. Empty query returns empty list (or top 5). Rate-limited to prevent abuse. |
| **Last Tested** | |
| **Status** | Draft |

**Key assertions:**
- Response only includes accounts with `roles` containing `TRANSACTION_COORDINATOR`
- Results filtered by name or email (case-insensitive LIKE)
- Max results capped (e.g., 20)
- 400 if query < 2 characters

---

## Reference Example: BROKER-4020 — Assign TC to Transaction

| Field | Value |
|---|---|
| **ID** | `BROKER-4020` |
| **Scenario** | Broker admin selects a TC from search results and assigns them to a transaction |
| **Prerequisites** | Transaction exists in ACTIVE status. No TC currently assigned (or replacing existing). |
| **Steps** | 1. Select TC from search results<br>2. Click "Assign"<br>3. Save |
| **Expected Result** | `Mutation: updateTransaction(assignedCoordinatorAccountId: <tc-account-id>)` succeeds. Transaction's `assignedCoordinatorAccountId` set to the TC's account ID. TC can now see this transaction in their dashboard. Audit log: `TC_ASSIGNED`. |
| **Last Tested** | |
| **Status** | Draft |

**Key assertions:**
- DB: `transactions.assignedCoordinatorAccountId === <tc-account-id>`
- TC login → dashboard shows this transaction
- Re-assigning to different TC: old TC loses access, new TC gains access, audit log tracks both

---

<a id="range-broker-org-settings"></a>

## Reference Example: BROKER-5010 — Update Org Profile

| Field | Value |
|---|---|
| **ID** | `BROKER-5010` |
| **Scenario** | Broker admin updates org name, phone, or address |
| **Prerequisites** | Authenticated as broker_admin of the org |
| **Expected Result** | Changes saved. Org listed in search reflects new name. Only broker_admin can edit org profile (agents cannot). |
| **Last Tested** | |
| **Status** | Draft |

---

## Scenarios to Add

_Checklist of high-value test cases not yet cataloged:_

- [ ] BROKER-1030 — Team members list with >20 members shows pagination
- [ ] BROKER-1040 — Search/filter team members by name or email
- [ ] BROKER-2030 — Invite with invalid email format → 400 error shown in form
- [ ] BROKER-2040 — Invite duplicate (already pending) → friendly error, not crash
- [ ] BROKER-3040 — Self-removal by broker_admin → 409 (must have at least one admin)
- [ ] BROKER-4030 — Assign TC then unassign (set to null)
- [ ] BROKER-5020 — Agent attempts to edit org profile → 403
- [ ] BROKER-5030 — Broker admin views org transaction list filtered by status
