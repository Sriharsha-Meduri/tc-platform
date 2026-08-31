# API Testing Guide

## Table of Contents

1. [Overview](#overview)
2. [Endpoint Naming Convention](#endpoint-naming-convention)
3. [buyer-agent-init-tran](#buyer-agent-init-tran)
   - [Payload Schema](#payload-schema)
   - [Response Shape](#response-shape)
   - [Curl Command](#curl-command)
4. [buyer-agent-init-submit](#buyer-agent-init-submit-future)
5. [Testing Flow](#testing-flow)
6. [Virtual Clock](#virtual-clock)
7. [Payload Directory](#payload-directory)
8. [CAR Forms Reference](#car-forms-reference)
9. [Dev Account Reference](#dev-account-reference)

---

## Overview

Dev-only seed endpoints create pre-populated transactions for testing. They are registered only
when `APP_ENV !== 'production'` and live under `POST /api/v1/dev/transactions/`.

---

## Endpoint Naming Convention

```
POST /api/v1/dev/transactions/{persona}-{lifecycle-step}
```

| Endpoint | Status | Purpose |
|---|---|---|
| `buyer-agent-init-tran` | **Active** | Create DRAFT transaction — document, parties, clock |
| `buyer-agent-init-submit` | Planned | Advance DRAFT → active in one call |
| `seller-agent-init-tran` | Future | Seller-side DRAFT transaction |
| `seller-agent-init-submit` | Future | Seller DRAFT → active |

---

## buyer-agent-init-tran

Creates a **DRAFT** transaction with contract dates, all parties, and extraction metadata
pre-populated. Nothing is activated — use the UI to initialize workflow when ready.

### Payload Schema

```json
{
  "transaction": {
    "type": "purchase",           // "purchase" | "sale" | "lease"  (default: "purchase")
    "side": "buyer",              // "buyer" | "seller" | "dual"    (default: "buyer")
    "property": {
      "addressLine1": "string",   // required
      "city": "string",           // required
      "state": "CA",              // required — 2-letter code
      "postalCode": "string",     // optional
      "county": "string",         // optional
      "contractPrice": 850000,    // optional
      "earnestMoney": 17000       // optional
    }
  },
  "contract": {
    "acceptanceDate": "2026-05-01",    // required — ISO date
    "closingDate": "2026-07-15",       // required — ISO date
    "disclosuresDueDays": 7,           // optional — days from acceptance
    "inspectionContingencyDays": 17,   // optional
    "appraisalContingencyDays": 21,    // optional
    "loanContingencyDays": 21          // optional
  },
  "parties": [
    {
      "role": "buyer",                 // PartyRole value (see list below)
      "displayName": "Michael Chen",
      "email": "michael.chen@gmail.com",
      "phone": "310-555-0011"          // optional
    }
  ],
  "forms": ["RPA", "TDS", "NHD"]      // optional — CAR form codes (stored, not yet processed)
}
```

**Supported party roles:**
`buyer` · `seller` · `buyer_agent` · `seller_agent` · `buyer_agent_representative` ·
`seller_agent_representative` · `buyer_transaction_coordinator` · `seller_transaction_coordinator` ·
`lender` · `loan_officer` · `escrow_officer` · `title_officer` · `attorney` ·
`inspector` · `appraiser` · `other`

### Response Shape

```json
{
  "transactionId": "uuid",
  "transactionNumber": "TXN-2026-XXXXXX",
  "status": "draft",
  "nextStep": "Open /dashboard/transactions/{id} → click \"Initialize Workflow\""
}
```

### Curl Command

```bash
curl -s -X POST http://localhost:3000/api/v1/dev/transactions/buyer-agent-init-tran \
  -H 'Content-Type: application/json' \
  -d @test/api/buyer-agent/buyer-agent-init-tran.json | jq .
```

---

## buyer-agent-init-submit (Future)

```bash
POST /api/v1/dev/transactions/buyer-agent-init-submit
```

Currently returns `501 Not Implemented`. When built, will accept a `transactionId` and
advance the DRAFT to active in one call — seeding events, scheduling reminders, and
optionally initializing the workflow.

---

## Testing Flow

1. **Seed** — `POST /api/v1/dev/transactions/buyer-agent-init-tran`
2. **Inspect** — open `/dashboard/transactions/{id}` to verify the DRAFT
3. **Initialize Workflow** — click the button to:
   - Create workflow steps from the CA buyer template
   - Seed `transaction_events` from the contract dates (acceptance + contingency days)
   - Schedule deadline reminders in Bull (7d / 3d / day-of per event)
   - Send intro emails to all parties
   - Advance status → `active`
4. **Advance virtual clock** — use the Clock panel or API to simulate time passing
5. **Void** — click "Void Draft" to discard and start over (only available on DRAFT)

---

## Virtual Clock

Each transaction has its own virtual clock. Advancing it re-enqueues all reminders
relative to the new "now" — past-due reminders fire immediately.

**Set virtual clock:**
```bash
curl -s -X PATCH http://localhost:3000/api/v1/transactions/{id}/clock \
  -H 'Content-Type: application/json' \
  -d '{"virtualNow": "2026-05-08T10:00:00Z"}' | jq .
```

**Reset to real time:**
```bash
curl -s -X PATCH http://localhost:3000/api/v1/transactions/{id}/clock \
  -H 'Content-Type: application/json' \
  -d '{"virtualNow": null}' | jq .
```

**Via UI:** Dashboard → Utils → Virtual Clock (left sidebar)

---

## Payload Directory

```
test/api/buyer-agent/
  buyer-agent-init-tran.json    ← full buyer purchase: all parties, all CA contingency forms
```

Add new payloads alongside existing ones, following the `{persona}-{lifecycle-step}.json`
naming pattern.

---

## CAR Forms Reference

Standard forms included in `buyer-agent-init-tran.json`:

| Code | Form Name | Required |
|---|---|---|
| RPA | Residential Purchase Agreement | Yes |
| TDS | Transfer Disclosure Statement | Yes |
| SPQ | Seller Property Questionnaire | Yes |
| NHD | Natural Hazard Disclosure | Yes |
| AD | Agency Disclosure | Yes |
| AVID | Agent Visual Inspection Disclosure | Yes |
| BIA | Buyer's Inspection Advisory | Yes |
| SBSA | Statewide Buyer and Seller Advisory | Yes |
| GLVAR | Lead-Based Paint Disclosure (federal) | Conditional |
| CR-B | Contingency Removal — Buyer | Conditional |
| PEAD | Possible Representation of More than One Buyer or Seller | Yes |

Full form catalog: `apps/api/src/modules/transaction-form-templates/metadata/car-forms.metadata.ts`

---

## Dev Account Reference

All passwords: `Password1!`

| Email | Role |
|---|---|
| `sarah.broker@sunsetrealty.com` | Broker admin |
| `alice.tc@sunsetrealty.com` | Transaction coordinator (buyer TC in payload) |
| `bob.tc@sunsetrealty.com` | Transaction coordinator (seller TC in payload) |
| `carol.agent@sunsetrealty.com` | Agent (seller agent in payload) |
| `david.agent@sunsetrealty.com` | Agent (buyer agent in payload) |
