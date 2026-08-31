# Scenario: contract-03-lasselle-st-rpa-bundle

**Purpose:** Real-world fully-executed RPA bundle from 15982 Lasselle St Unit 1 in Moreno Valley.
Exercises the full 9-form extraction pipeline on a scanned (non-AcroForm) PDF.

---

## Test status

| Item | Status |
|---|---|
| PDF | ✓ present (`15982-LasselleStUnit-1-FE_RPA.pdf`) |
| Snap files | ✓ 9 forms locked |
| SET 1 — form identification assertions | ✓ implemented |
| SET 2 — JSON extraction assertions | ✓ implemented (fires when snap absent) |
| Snap assertions | ✓ implemented (free, no API key) |
| Stage reasoning test | ✓ implemented — formCodes filter to RPA + FRR-PA |

**Reference implementation:** this scenario is the canonical example of fixture-only
stage reasoning tests. See `scenario.test.ts` for the full pattern including `formCodes`
filtering, `expect` assertions, and free snap assertion blocks.

**Note:** Snaps in this scenario were created before the universal `FORM_FOOTER_FIELDS` were added.
The `header` section of each form does **not** contain `form_code` or `form_version`. If you
re-extract any form, those fields will now appear in the output — update the snap and assertions
accordingly.

---

## Source PDF

| Field | Value |
|---|---|
| Filename | `15982-LasselleStUnit-1-FE_RPA.pdf` |
| Size | ~21 MB |
| Pages | 29 |
| Type | Scanned — no AcroForm fields, full LLM extraction |
| Property | 15982 Lasselle St Unit 1, Moreno Valley, CA 92551 (Riverside County) |
| Buyer | Varun Srivastava (+ co-buyers Jeannette Gonzalez, Esteban Roberto Xala Flores per PRBS) |
| Purchase price | $451,000 |
| Status | Fully Executed — 2026-02-26 |

---

## Forms in this scenario

These are the actual forms detected and snapped. Page ranges are approximate.

| Order | Form code | Form name | Est. pages | Snap file |
|---|---|---|---|---|
| 1 | `RPA` | Residential Purchase Agreement | 1–10 | `extractions/rpa.standard.snap.json` ✓ |
| 2 | `AD` | Disclosure Regarding Real Estate Agency Relationships | 11–12 | `extractions/ad.standard.snap.json` ✓ |
| 3 | `FRR-PA` | Federal Reporting Requirement Purchase Addendum | 13 | `extractions/frr-pa.standard.snap.json` ✓ |
| 4 | `BIA` | Buyer's Investigation Advisory | 14–16 | `extractions/bia.standard.snap.json` ✓ |
| 5 | `PRBS` | Possible Representation of More Than One Buyer or Seller | 17 | `extractions/prbs.standard.snap.json` ✓ |
| 6 | `FHDA` | Fair Housing and Discrimination Advisory | 18–20 | `extractions/fhda.standard.snap.json` ✓ |
| 7 | `BHIA` | Buyer Homeowners' Insurance Advisory | 21–23 | `extractions/bhia.standard.snap.json` ✓ |
| 8 | `WFA` | Wire Fraud and Electronic Funds Transfer Advisory | 24–26 | `extractions/wfa.standard.snap.json` ✓ |
| 9 | `CCPA` | CCPA Advisory, Disclosure and Notice | 27–29 | `extractions/ccpa.standard.snap.json` ✓ |

**Not present in this bundle:** TDS, SPQ, AVID, SBSA — these are delivered separately in the
disclosures stage or were not included in this particular bundle.

---

## Known values from snaps

| Form | Key values |
|---|---|
| `RPA` | `purchase_price = 451000`, `property_address = "15982 Lasselle St."`, `city = "Moreno Valley"`, `county = "Riverside"` |
| `AD` | `listing_agent.name = "Ashok Patil"`, `listing_agent.brokerage_name = "Blue Lotus Reality"`, `selling_agent.is_same_as_listing_agent = true` |
| `FRR-PA` | `property.streetAddress = "15982 Lasselle St."`, `transaction.offerDate = "02/26/2026"` |
| `BIA` | `buyer_names = ["Varun Srivastava"]`, `date = "2026-02-26"` |
| `PRBS` | `parties.buyer_names = ["Varun Srivastava", "Jeannette Gonzalez", "Esteban Roberto Xala Flores"]` |
| `FHDA` | Advisory form — no transaction-specific data |
| `BHIA` | Advisory form — no transaction-specific data |
| `WFA` | Advisory form — `transaction.offerDate = "2026-02-26"` |
| `CCPA` | Advisory form — `transaction.offerDate = "2026-02-26"` |

---

## Directory structure

```
contract-03-lasselle-st-rpa-bundle/
├── README.md
├── pdfs/
│   └── 15982-LasselleStUnit-1-FE_RPA.pdf   (gitignored — ~21 MB)
├── extractions/
│   ├── rpa.standard.snap.json
│   ├── ad.standard.snap.json
│   ├── frr-pa.standard.snap.json
│   ├── bia.standard.snap.json
│   ├── prbs.standard.snap.json
│   ├── fhda.standard.snap.json
│   ├── bhia.standard.snap.json
│   ├── wfa.standard.snap.json
│   └── ccpa.standard.snap.json
└── scenario.test.ts
```

---

## Running tests

```bash
cd packages/document-intelligence

# Full run — identification + reasoning (snaps skip LLM extraction)
pnpm exec vitest run test/scenarios/contract-03-lasselle-st-rpa-bundle

# Watch mode
pnpm test:watch -- contract-03

# Reasoning only (free if snaps present, skip extraction)
pnpm test:watch -- contract-03 -t "reasoning"
```

---

## Re-extracting a single form

To re-run extraction for one form (e.g. after updating its schema):

1. Delete that form's snap: `rm extractions/rpa.standard.snap.json`
2. Run the test — only that form calls the LLM; all others still use their snaps
3. Review the new JSON output in the console
4. Copy the printed JSON back into the snap file to re-lock it

---

## AI engineer notes

- Snaps were created before universal `FORM_FOOTER_FIELDS` were added — `form_code` and `form_version`
  will not be in the snapped `header` sections. Re-extract to get the updated fields.
- FHDA, BHIA, WFA, CCPA are advisory forms — they use a generic extraction schema. Their data is
  mostly structural with little transaction-specific content.
- PRBS lists three buyers — this is a multi-buyer transaction with dual-representation disclosure.
- The AD snap shows `selling_agent.is_same_as_listing_agent = true` — single-brokerage dual representation.
