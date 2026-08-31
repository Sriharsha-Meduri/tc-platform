# Inspection Stage — Test Cases

Covers forms, business logic, and compliance for the INSPECTION stage. Key forms: **RR** (Request for Repair), **Inspection Contingency Removal**, and related correspondence.

## ID Numbering

`INSPECT-0010` to `INSPECT-9990` (steps of 10).

| Range | Focus |
|---|---|
| 0010–0990 | [RR (Request for Repair) — per-form validation](#range-rr) |
| 1000–1990 | [Inspection contingency removal](#range-contingency-removal) |
| 2000–2990 | [Seller response / counter to RR](#range-seller-response) |
| 3000–3990 | [Cross-form checks (RR ↔ RPA inspection clauses)](#range-inspect-cross-form) |
| 4000–4990 | [Inspection bundle (RR + photos + reports)](#range-inspect-bundle) |

---

<a id="range-rr"></a>

## Reference Example: INSPECT-0010 — Valid RR Upload (Buyer Requests Repairs)

| Field | Value |
|---|---|
| **ID** | `INSPECT-0010` |
| **Scenario** | Buyer submits a Request for Repair listing items found during inspection |
| **Prerequisites** | Transaction is in INSPECTION stage; inspection period is active (not expired); buyer is the submitting party |
| **Test Data** | RR fixture with: property address, buyer name, seller name, 3 repair items (plumbing, electrical, roof), requested completion date, buyer signature, date |
| **Steps** | 1. Navigate to INSPECTION tab<br>2. Upload RR PDF<br>3. Observe extraction and compliance result |
| **Expected Result** | Extraction succeeds with `detectedFormCode: "RR"`. Compliance validates: repair items are present, parties named, signatures present. No blocking issues. |
| **Last Tested** | |
| **Status** | Draft |

### Detail

**Form data (RR minimum viable):**
```ts
{
  property_address: "123 Main Street, Sacramento, CA 95814",
  buyer_name: "John Buyer",
  seller_name: "Jane Seller",
  inspection_date: "2026-06-15",
  repair_items: [
    { description: "Fix leaking pipe under kitchen sink", estimated_cost: 500 },
    { description: "Replace faulty electrical outlet in garage", estimated_cost: 200 },
    { description: "Repair missing roof shingles (3 sections)", estimated_cost: 1500 },
  ],
  completion_requested_by: "2026-07-01",
  buyer_signature: "John Buyer",
  buyer_signature_date: "2026-06-18",
  contingency_removal_if_no_agreement: false,
}
```

**Key assertions:**
- `detectedFormCode === "RR"`
- At least one repair item extracted → no warning
- Buyer signature present → no warning
- Seller name present → cross-form check against RPA seller name passes
- `compliance.blockers` is empty

**Screenshot:** `screenshots/inspection-0010-rr-valid.png`

---

## Reference Example: INSPECT-0020 — RR with No Repair Items

| Field | Value |
|---|---|
| **ID** | `INSPECT-0020` |
| **Scenario** | Buyer submits RR with an empty repair items list |
| **Prerequisites** | Same as INSPECT-0010 |
| **Test Data** | RR fixture with `repair_items: []` |
| **Expected Result** | Extraction succeeds. Compliance warning triggered: RR requires at least one repair item (e.g., `WARN-RR-*`). This is a warning, not a blocker — buyer may be planning a separate attachment. |
| **Last Tested** | |
| **Status** | Draft |

---

## Reference Example: INSPECT-0030 — RR with Missing Buyer Signature

| Field | Value |
|---|---|
| **ID** | `INSPECT-0030` |
| **Scenario** | RR uploaded without buyer signature |
| **Prerequisites** | Same as INSPECT-0010 |
| **Test Data** | RR fixture with `buyer_signature: null` |
| **Expected Result** | Per-form warning for missing buyer signature. Upload proceeds (diagnostic only). |
| **Last Tested** | |
| **Status** | Draft |

---

<a id="range-contingency-removal"></a>

## Reference Example: INSPECT-1010 — Inspection Contingency Removal (Buyer Waives)

| Field | Value |
|---|---|
| **ID** | `INSPECT-1010` |
| **Scenario** | Buyer signs contingency removal to waive the inspection contingency |
| **Prerequisites** | Transaction in INSPECTION stage; buyer has completed inspections |
| **Test Data** | Contingency removal form with buyer signature, date, property address |
| **Expected Result** | Form accepted. Inspection contingency marked as removed in transaction metadata. Stage advancement eligibility updated. |
| **Last Tested** | |
| **Status** | Draft |

---

<a id="range-seller-response"></a>

## Reference Example: INSPECT-2010 — Seller Responds to RR (Partial Acceptance)

| Field | Value |
|---|---|
| **ID** | `INSPECT-2010` |
| **Scenario** | Seller accepts some repair requests and rejects others via seller response form |
| **Prerequisites** | RR previously submitted by buyer |
| **Test Data** | Seller response form: accepts plumbing repair, rejects roof repair, counters electrical at $300 |
| **Expected Result** | Seller response extracted. Cross-form check matches repair items to original RR. Mismatches flagged. If all items resolved → stage may advance. |
| **Last Tested** | |
| **Status** | Draft |

---

<a id="range-inspect-cross-form"></a>

## Reference Example: INSPECT-3010 — Cross-Form: RR Repair Cost vs RPA Price Threshold

| Field | Value |
|---|---|
| **ID** | `INSPECT-3010` |
| **Scenario** | RR total repair cost exceeds a percentage of the purchase price |
| **Prerequisites** | RPA with purchase price of $500,000. RR requests $50,000 in repairs (10%+). |
| **Expected Result** | Stage-level rule flags a warning: total repair cost exceeds reasonable threshold relative to purchase price. Cross-form check ensures both forms reference the same property address and parties. |
| **Last Tested** | |
| **Status** | Draft |

---

<a id="range-inspect-bundle"></a>

## Reference Example: INSPECT-4010 — Inspection Bundle Upload (RR + Report + Photos)

| Field | Value |
|---|---|
| **ID** | `INSPECT-4010` |
| **Scenario** | Upload all inspection documents as a multi-file bundle |
| **Prerequisites** | Transaction in INSPECTION stage |
| **Test Data** | RR PDF + inspection report PDF + photo pages PDF |
| **Expected Result** | RR extracted as structured data. Report and photo pages stored as supporting documents (no structured extraction). All documents linked to the same workflow step. |
| **Last Tested** | |
| **Status** | Draft |

---

## RR (Request for Repair) — Form Reference

The C.A.R. RR form is used by the buyer to request repairs after inspection. Key sections:

| Section | Field | Type | Required |
|---|---|---|---|
| Header | Property Address | text | ✅ |
| Header | Date | date | ✅ |
| Section 1 | Buyer Name | text | ✅ |
| Section 1 | Seller Name | text | ✅ |
| Section 2 | Repair Items | list[{description, est_cost}] | ✅ (≥1 item) |
| Section 2 | Completion Requested By | date | ✅ |
| Section 3 | Buyer Signature | text | ✅ |
| Section 3 | Buyer Signature Date | date | ✅ |
| Section 4 | Contingency Removal if No Agreement | boolean | optional |

---

## Scenarios to Add

_Checklist of high-value test cases not yet cataloged:_

- [ ] INSPECT-0040 — RR with estimated costs but no completion date → warning
- [ ] INSPECT-0050 — RR submitted outside inspection period → stage-level block
- [ ] INSPECT-1020 — Seller rejects all repairs → buyer must choose: accept or cancel
- [ ] INSPECT-2020 — Seller response missing signature → warning
- [ ] INSPECT-3020 — RR names different property address than RPA → cross-form blocker
- [ ] INSPECT-4020 — Upload inspection documents to wrong stage (e.g., APPRAISAL) → reclassified
- [ ] INSPECT-4030 — Re-upload corrected RR → version comparison + supersede
