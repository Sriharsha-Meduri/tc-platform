# Contract Stage — Test Cases

Covers form extraction, validation, and compliance for the CONTRACT stage. Forms: **RPA**, **AD**, **AVID**, **BIA**, **SCO**, **BCO**, **SMCO**, **BMCO**.

## ID Numbering

`CONTRACT-0010` to `CONTRACT-9990` (steps of 10).

| Range | Focus |
|---|---|
| 0010–0990 | [RPA per-form validation](#range-rpa-per-form) |
| 1000–1990 | [RPA cross-form and stage-level](#range-rpa-cross-form) |
| 2000–2990 | AD, AVID, BIA |
| 3000–3990 | [SCO, BCO, SMCO, BMCO](#range-counter-offer) |
| 4000–4990 | [Multi-form bundles and re-upload](#range-multi-form-bundles) |

---

<a id="range-rpa-per-form"></a>

## Reference Example: CONTRACT-0010 — Valid RPA Upload (No Blockers)

| Field | Value |
|---|---|
| **ID** | `CONTRACT-0010` |
| **Scenario** | Upload a well-formed RPA — all required fields populated |
| **Prerequisites** | Authenticated as agent; no existing transaction for same address |
| **Test Data** | `CA-RPA-valid` fixture (`$900,000`, conventional loan, 17-day inspection, both buyer/seller signed) |
| **Steps** | 1. Navigate to Upload page<br>2. Upload RPA PDF<br>3. Click Extract<br>4. Observe compliance result |
| **Expected Result** | Extraction succeeds with `detectedFormCode: "RPA"`. Compliance: zero blockers, zero warnings. `transaction.status === "DRAFT"`. |
| **Last Tested** | |
| **Status** | Draft |
| **Covered By** | `apps/web/e2e/scenarios/02-compliance/010010-valid-rpa.spec.ts` |
| **Issue** | [#000](https://github.com/sepra/tc/issues/000) |

### Detail

**Setup:**
```ts
const file = generateScenarioFiles(caRpaValid, outputDir);
// produces: test/fixtures/CA-RPA-valid/RPA.pdf
```

**Key assertions:**
- `compliance.checks` contains no `BLOCKER-RPA-*` entries
- `compliance.blockers` is empty or absent
- `extractionResult.purchase_price === 900000`
- `extractionResult.buyer_name === "Alice Buyer"`
- `extractionResult.seller_name === "Bob Seller"`

**Screenshot:** `screenshots/contract-0010-compliance-clean.png`

**Failure modes:**
- LLM hallucinates price → extraction returns wrong value → validation passes but data is wrong (covered by doc-intelligence extraction tests, not this scenario)

---

## Reference Example: CONTRACT-0020 — RPA with Missing Purchase Price

| Field | Value |
|---|---|
| **ID** | `CONTRACT-0020` |
| **Scenario** | Upload RPA where purchase price is missing or unparsable |
| **Prerequisites** | Same as CONTRACT-0010 |
| **Test Data** | `CA-RPA-missing-price` fixture (`purchasePrice: null`) |
| **Expected Result** | Extraction succeeds. Compliance returns `BLOCKER-RPA-1` (missing purchase price). No RPA-level blocker prevents upload (diagnostic only). |
| **Last Tested** | |
| **Status** | Draft |

**Key assertions:**
- `compliance.blockers[0].code === "BLOCKER-RPA-1"`
- `compliance.blockers[0].severity === "blocking"`
- Upload returns 200 (not 422) — validation is diagnostic

---

## Reference Example: CONTRACT-0030 — RPA with Missing Signatures

| Field | Value |
|---|---|
| **ID** | `CONTRACT-0030` |
| **Scenario** | Upload RPA where buyer/seller signatures are missing |
| **Prerequisites** | Same as CONTRACT-0010 |
| **Test Data** | `CA-RPA-valid` with both signature dates set to `null` |
| **Expected Result** | Warnings triggered for missing buyer/seller acceptance dates. Upload still succeeds. |
| **Last Tested** | |
| **Status** | Draft |

---

<a id="range-rpa-cross-form"></a>

## Reference Example: CONTRACT-1010 — Counter-Offer Flag Requires SCO/BCO

| Field | Value |
|---|---|
| **ID** | `CONTRACT-1010` |
| **Scenario** | RPA with `accepted_subject_to_counter_offer === true` but no counter-offer form uploaded |
| **Prerequisites** | RPA already extracted; no SCO/BCO/SMCO/BMCO uploaded |
| **Test Data** | `CA-RPA-counter-offer` fixture (RPA only, not the full chain) |
| **Expected Result** | Stage-level rule triggers `WARN-RPA-2001` — expected a counter-offer form. |
| **Last Tested** | |
| **Status** | Draft |

---

<a id="range-counter-offer"></a>

## Reference Example: CONTRACT-3010 — Valid SCO Upload and Extraction

| Field | Value |
|---|---|
| **ID** | `CONTRACT-3010` |
| **Scenario** | Upload a well-formed Seller Counter Offer |
| **Prerequisites** | RPA already uploaded; SCO is a follow-on |
| **Test Data** | `CA-RPA-counter-offer` generates SCO-1.pdf (2-page SCO) |
| **Expected Result** | SCO extraction succeeds. WARN-SCO-35001..35007 are clear (all fields present). |
| **Last Tested** | |
| **Status** | Draft |

---

<a id="range-multi-form-bundles"></a>

## Reference Example: CONTRACT-4010 — Full CONTRACT Bundle Upload

| Field | Value |
|---|---|
| **ID** | `CONTRACT-4010` |
| **Scenario** | Upload all CONTRACT-stage forms in one pass (multi-file or merged PDF) |
| **Prerequisites** | Authenticated agent; no existing transaction |
| **Test Data** | `CA-RPA-contract-standard` fixture (RPA + AD + AVID + BIA) |
| **Expected Result** | All 4 forms extracted. Each document appears in the documents list with correct `detectedFormCode`. Compliance checks run per-form and cross-form. `reclassified: false` for all (they stay in CONTRACT). |
| **Last Tested** | |
| **Status** | Draft |

---

## Scenarios to Add

_Checklist of high-value test cases not yet cataloged:_

- [ ] CONTRACT-1020 — RPA contingency dates: all populated, partial, nulls
- [ ] CONTRACT-2010 — AD per-form validation (property address match)
- [ ] CONTRACT-2020 — AVID per-form validation
- [ ] CONTRACT-2030 — BIA per-form validation
- [ ] CONTRACT-3020 — BCO per-form validation (same schema as SCO, different layout)
- [ ] CONTRACT-3030 — Counter-offer chain: SCO → BCO → SCO (multi-round)
- [ ] CONTRACT-4020 — Re-upload RPA: version detection + material change comparison
- [ ] CONTRACT-4030 — Upload non-CONTRACT form (TDS) to CONTRACT tab → reclassified to DISCLOSURES
