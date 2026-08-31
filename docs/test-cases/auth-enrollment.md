# Auth & Enrollment — Test Cases

Covers user registration, role assignment, organization membership flows, admin provisioning, and invite-based enrollment.

## ID Numbering

`AUTH-0010` to `AUTH-9990` (steps of 10).

| Range | Focus |
|---|---|
| 0010–0990 | [Self-registration (agent, coordinator, broker)](#range-self-registration) |
| 1000–1990 | [Invite-based enrollment](#range-invite-enrollment) |
| 2000–2990 | [Admin-provisioned brokerages](#range-admin-brokerage) |
| 3000–3990 | [Organization membership (approve, reject, remove)](#range-org-membership) |
| 4000–4990 | [Authentication edge cases (login, token expiry, role checks)](#range-auth-edge) |
| 5000–5990 | [Role-based access (guards, sidebar, permission)](#range-role-access) |

---

<a id="range-self-registration"></a>

## Reference Example: AUTH-0010 — Agent Self-Registration

| Field | Value |
|---|---|
| **ID** | `AUTH-0010` |
| **Scenario** | New agent registers through the /register/agent page with valid details |
| **Prerequisites** | No existing account with this email |
| **Test Data** | Email: `newagent@example.com`, Password: `TestPass123!`, Name: "Alice Newagent", License: "DRE# 12345678", Phone: "916-555-0100" |
| **Steps** | 1. Navigate to /register/agent<br>2. Fill all required fields<br>3. Submit<br>4. Check redirect and DB state |
| **Expected Result** | Account created with `roles: [USER, AGENT]`. User redirected to login with success flash. No email verification required if skipVerify mode. |
| **Last Tested** | |
| **Status** | Draft |

### Detail

**API call:**
```
POST /api/v1/auth/register-agent
Body: { email, password, name, dreLicense, phone }
```

**Key assertions:**
- Response status: 201
- `users` table has row with `email = "newagent@example.com"`
- `roles` array contains `"USER"` and `"AGENT"`
- No organization created
- Password is hashed (not stored in plaintext)
- `lastLoginAt` is null (not yet logged in)

**Screenshot:** `screenshots/auth-0010-register-page.png`

**Failure modes:**
- Duplicate email → 409 Conflict
- Weak password → 400 validation error
- Missing DRE license → 400 (required for AGENT role)

---

## Reference Example: AUTH-0020 — Coordinator Self-Registration

| Field | Value |
|---|---|
| **ID** | `AUTH-0020` |
| **Scenario** | New transaction coordinator registers through /register/coordinator |
| **Prerequisites** | No existing account with this email |
| **Test Data** | Email: `newtc@example.com`, Name: "Tom Coordinator", Phone: "916-555-0200" |
| **Expected Result** | Account created with `roles: [USER, TRANSACTION_COORDINATOR]`. Redirected to login. |
| **Last Tested** | |
| **Status** | Draft |

---

<a id="range-invite-enrollment"></a>

## Reference Example: AUTH-1010 — Register via Invite Link

| Field | Value |
|---|---|
| **ID** | `AUTH-1010` |
| **Scenario** | Invited user clicks invite link, completes registration, and is auto-activated |
| **Prerequisites** | Broker admin sent invite to `invited@example.com`. Invite token is valid and not expired. |
| **Test Data** | Token from `POST /auth/invite-member`. Registration payload: name, password, phone. |
| **Steps** | 1. Click invite URL containing token<br>2. Land on /register/invite?token=xxx<br>3. Fill name, password, phone<br>4. Submit |
| **Expected Result** | Account created. User automatically activated in the membership (status: `active`). Redirect to dashboard. |
| **Last Tested** | |
| **Status** | Draft |

---

<a id="range-admin-brokerage"></a>

## Reference Example: AUTH-2010 — Admin Creates Brokerage

| Field | Value |
|---|---|
| **ID** | `AUTH-2010` |
| **Scenario** | Support admin provisions a new brokerage org and sends invite to broker admin |
| **Prerequisites** | Authenticated as `SUPPORT_ADMIN` |
| **Test Data** | Org name: "Acme Realty", City: "Sacramento", State: "CA", Admin email: "broker@acme.com" |
| **Steps** | 1. Navigate to /admin/organizations/create<br>2. Fill org details and admin email<br>3. Submit |
| **Expected Result** | Organization created with `status: ACTIVE`. Pending User + Account created for admin email. Membership created with `role: [BROKER_ADMIN]`. Invite email sent. |
| **Last Tested** | |
| **Status** | Draft |

---

<a id="range-org-membership"></a>

## Reference Example: AUTH-3010 — Approve Pending Membership

| Field | Value |
|---|---|
| **ID** | `AUTH-3010` |
| **Scenario** | Broker admin approves an agent's pending membership request |
| **Prerequisites** | Agent has `PENDING` membership in the brokerage. Broker admin is logged in. |
| **Expected Result** | `PATCH /api/v1/organization-memberships/:id/approve` returns 200. Membership status changes to `active`. `joinedAt` timestamp set. Audit log created. |
| **Last Tested** | |
| **Status** | Draft |

---

<a id="range-auth-edge"></a>

## Reference Example: AUTH-4010 — Login with Valid Credentials

| Field | Value |
|---|---|
| **ID** | `AUTH-4010` |
| **Scenario** | Registered user logs in with correct email and password |
| **Prerequisites** | User exists with active status |
| **Expected Result** | JWT token returned. `user.role` and `user.roles` both populated in response. `lastLoginAt` updated. Redirected to /dashboard. |
| **Last Tested** | |
| **Status** | Draft |

---

<a id="range-role-access"></a>

## Reference Example: AUTH-5010 — Unauthenticated Redirect

| Field | Value |
|---|---|
| **ID** | `AUTH-5010` |
| **Scenario** | Unauthenticated user tries to access /dashboard/transactions |
| **Prerequisites** | No auth cookie or token |
| **Expected Result** | Redirected to /login. Original URL preserved as redirect parameter. |
| **Last Tested** | |
| **Status** | Draft |

---

## Reference Example: AUTH-5020 — support_admin Sidebar Shows Admin Link

| Field | Value |
|---|---|
| **ID** | `AUTH-5020` |
| **Scenario** | User with SUPPORT_ADMIN role sees Admin Panel link in sidebar |
| **Prerequisites** | Authenticated as admin-support@tcco.com (roles: USER, SUPPORT_ADMIN) |
| **Expected Result** | Sidebar contains purple "Admin Panel" link. Non-admin users do not see this link. |
| **Last Tested** | |
| **Status** | Draft |

---

## Scenarios to Add

_Checklist of high-value test cases not yet cataloged:_

- [ ] AUTH-0030 — Register with existing email → 409
- [ ] AUTH-0040 — Register with weak password → 400
- [ ] AUTH-1020 — Expired invite token → error page
- [ ] AUTH-1030 — Already-registered user accepts invite → membership created, no duplicate user
- [ ] AUTH-2020 — Admin create org with existing email → links existing user as broker admin
- [ ] AUTH-3020 — Reject membership → status set to `rejected`
- [ ] AUTH-3030 — Remove active member → 200, membership deleted
- [ ] AUTH-4020 — Login with wrong password → 401
- [ ] AUTH-4030 — Login for PENDING user → 403 or redirect to pending page
- [ ] AUTH-5030 — TC search endpoint returns only coordinators (not agents)
- [ ] AUTH-5040 — Assign TC to a transaction → stored in `assignedCoordinatorAccountId`
