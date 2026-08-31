# Disclosures Stage — Test Cases

Covers form extraction, validation, and compliance for the DISCLOSURES stage. Forms: **TDS**, **SPQ**, **NHD**, plus cross-form consistency checks.

## ID Numbering

`DISCLOS-0010` to `DISCLOS-9990` (steps of 10).

| Range | Focus |
|---|---|
| 0010–0990 | [TDS per-form validation](#range-tds) |
| 1000–1990 | [SPQ per-form validation](#range-spq) |
| 2000–2990 | [NHD per-form validation](#range-nhd) |
| 3000–3990 | [Cross-form consistency](#range-cross-form) |
| 4000–4990 | [Multi-form disclosure bundles](#range-disclosure-bundles) |

---

<a id="range-spq"></a>

## Reference Example: DISCLOS-1010 — Valid SPQ Upload (No Warnings)

| Field | Value |
|---|---|
| **ID** | `DISCLOS-1010` |
| **Scenario** | Upload a well-formed Seller Property Questionnaire — all required fields populated |
| **Prerequisites** | Authenticated as agent; transaction already in DISCLOSURES stage; CONTRACT-stage forms previously uploaded |
| **Test Data** | SPQ fixture with populated property address, seller signature, buyer signature, and date |
| **Steps** | 1. Navigate to DISCLOSURES tab<br>2. Upload SPQ PDF<br>3. Observe compliance result |
| **Expected Result** | Extraction succeeds with `detectedFormCode: "SPQ"`. Per-form validation passes with zero SPQ warnings. |
| **Last Tested** | |
| **Status** | Draft |

### Detail

**Form data (SPQ minimum viable):**
```ts
{
  property_address: "123 Main Street, Sacramento, CA 95814",
  seller_name: "Jane Seller",
  seller_signature_date: "2026-06-01",
  buyer_name: "John Buyer",
  buyer_signature_date: "2026-06-01",
}
```

**Key assertions:**
- No `WARN-SPQ-15001` (property address missing)
- No `WARN-SPQ-15002` (seller signature missing)
- No `WARN-SPQ-15003` (buyer signature missing)
- No `WARN-SPQ-15004` or `WARN-SPQ-15005`
- `compliance.blockers` is empty
- Document appears under DISCLOSURES stage

**Screenshot:** `screenshots/disclosures-1010-spq-valid.png`

---

## Reference Example: DISCLOS-1020 — SPQ with Missing Seller Signature

| Field | Value |
|---|---|
| **ID** | `DISCLOS-1020` |
| **Scenario** | Upload SPQ where seller signature date is null |
| **Prerequisites** | Same as DISCLOS-1010 |
| **Test Data** | SPQ fixture with `seller_signature_date: null` |
| **Expected Result** | Extraction succeeds. `WARN-SPQ-15002` triggered. Warning is non-blocking — upload proceeds. |
| **Last Tested** | |
| **Status** | Draft |

---

<a id="range-tds"></a>

## Reference Example: DISCLOS-0010 — Valid TDS Upload (No Warnings)

| Field | Value |
|---|---|
| **ID** | `DISCLOS-0010` |
| **Scenario** | Upload a well-formed Transfer Disclosure Statement |
| **Prerequisites** | Same as DISCLOS-1010 |
| **Test Data** | `CA-TDS-valid` fixture |
| **Expected Result** | Extraction succeeds. Zero TDS blockers (`BLOCKER-TDS-*`) and zero TDS warnings (`WARN-TDS-10001..10008`). |
| **Last Tested** | |
| **Status** | Draft |

**Key assertions:**
- `detectedFormCode === "TDS"`
- Property address populated → no `WARN-TDS-10001`
- Seller signature present → no `WARN-TDS-10002`
- All applicable sections filled → no data quality warnings

---

<a id="range-nhd"></a>

## Reference Example: DISCLOS-2010 — NHD with Property Address

| Field | Value |
|---|---|
| **ID** | `DISCLOS-2010` |
| **Scenario** | Upload Natural Hazard Disclosure with property address only |
| **Prerequisites** | Same as DISCLOS-1010 |
| **Test Data** | NHD fixture with `property_address` populated, no other fields |
| **Expected Result** | Extraction succeeds. Only `WARN-NHD-20001` is expected if address is missing; populated case passes clean. |
| **Last Tested** | |
| **Status** | Draft |

---

<a id="range-cross-form"></a>

## Reference Example: DISCLOS-3010 — Cross-Form Address Mismatch TDS↔SPQ

| Field | Value |
|---|---|
| **ID** | `DISCLOS-3010` |
| **Scenario** | Upload TDS and SPQ with different property addresses |
| **Prerequisites** | Both TDS and SPQ uploaded; addresses do not match |
| **Test Data** | TDS address: "123 Main St", SPQ address: "456 Oak Ave" |
| **Expected Result** | Cross-form validator triggers `WARN-CROSS-*` for property address mismatch. Also checks city and county consistency. |
| **Last Tested** | |
| **Status** | Draft |

---

<a id="range-disclosure-bundles"></a>

## Reference Example: DISCLOS-4010 — Full DISCLOSURES Bundle Upload

| Field | Value |
|---|---|
| **ID** | `DISCLOS-4010` |
| **Scenario** | Upload all disclosure forms at once (multi-file upload) |
| **Prerequisites** | Transaction exists in DISCLOSURES stage; CONTRACT forms previously uploaded |
| **Test Data** | `CA-disclosures-standard` fixture (RPA+AD+AVID+BIA+TDS+SPQ) |
| **Expected Result** | All 6 forms extracted. TDS and SPQ assigned to DISCLOSURES stage. RPA/AD/AVID/BIA are `reclassified: false` (already in CONTRACT). Cross-form validation runs across all forms. |
| **Last Tested** | |
| **Status** | Draft |

**Key assertions:**
- 6 documents created
- TDS and SPQ have `resolvedStage === "DISCLOSURES"`
- RPA stays in CONTRACT (no duplicate)
- Cross-form address checks compare RPA ↔ TDS ↔ SPQ ↔ NHD

---

## Scenarios to Add

_Checklist of high-value test cases not yet cataloged:_

- [ ] DISCLOS-0020 — TDS with missing property address → `WARN-TDS-10001`
- [ ] DISCLOS-0030 — TDS with missing seller signature → `WARN-TDS-10002`
- [ ] DISCLOS-1030 — SPQ with no buyer signature → `WARN-SPQ-15003`
- [ ] DISCLOS-2020 — NHD missing property address → `WARN-NHD-20001`
- [ ] DISCLOS-3020 — Cross-form county mismatch (TDS vs RPA)
- [ ] DISCLOS-4020 — Upload disclosure form to CONTRACT tab → auto-reclassified to DISCLOSURES
- [ ] DISCLOS-4030 — Mixed bundle: TDS valid + TDS with missing fields
