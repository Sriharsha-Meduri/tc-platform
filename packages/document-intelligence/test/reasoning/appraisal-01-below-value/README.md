# Scenario: appraisal-01-below-value

**Story:** Appraisal comes in $25,000 below the agreed purchase price. Buyer and seller
renegotiate — seller agrees to reduce the purchase price to the appraised value. Buyer
then removes the appraisal contingency. Tests the value gap detection and resolution flow.

---

## Test status

| Item | Status |
|---|---|
| PDFs | ✗ not added — drop each form's PDF into `pdfs/` to enable extraction |
| Snap files | ✗ none — run extraction first to generate |
| SET 1 — form identification assertions | ✗ not yet implemented |
| SET 2 — JSON extraction assertions | ✗ not yet implemented |
| Reasoning assertions | ✓ `appraisedValue`, `appraisalContingencyStatus`, `valueGap`, `readyToAdvance` per round |

---

## Forms in this scenario

| File | Form code | Day | What it contains |
|---|---|---|---|
| `pdfs/day-12-appraisal.pdf` | `APPRAISAL` | Day 12 | Appraisal report: value $875,000 vs. agreed $900,000 |
| `pdfs/day-14-paa.pdf` | `PAA` | Day 14 | Purchase addendum — seller agrees to reduce price to $875,000 |
| `pdfs/day-14-cr-b.pdf` | `CR-B` | Day 14 | Buyer removes appraisal contingency |

---

## Extraction rounds

### Round 01 — Day 12 (appraisal report only)

```
extractions/round-01/
└── appraisal.standard.snap.json
```

Reasoning expects: `appraisedValue = 875000`, `appraisalContingencyStatus = 'below_value'`, `valueGap = 25000`, `readyToAdvance = false`

### Round 02 — Day 14 (appraisal + PAA + CR-B)

```
extractions/round-02/
├── appraisal.standard.snap.json   (copied from round-01)
├── paa.standard.snap.json         (new)
└── cr-b.standard.snap.json        (new)
```

Reasoning expects: `appraisalContingencyStatus = 'removed'`, `appraisalContingencyRemoved = true`, `readyToAdvance = true`

---

## TransactionContext for reasoning tests

```json
{
  "finalAgreedPrice": 900000,
  "loanAmount": 720000,
  "closeOfEscrowDate": "2026-03-15",
  "buyerNames": ["John Buyer"],
  "sellerNames": ["Jane Seller"]
}
```

---

## How to run

```bash
pnpm test:watch -- appraisal-01 -t "reasoning"
```
