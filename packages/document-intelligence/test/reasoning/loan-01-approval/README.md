# Scenario: loan-01-approval

**Story:** Lender issues a conditional approval with outstanding conditions. Buyer satisfies
all conditions and lender issues a final clear-to-close. Buyer removes loan contingency.
Tests the conditional → fully approved progression and open condition tracking.

---

## Test status

| Item | Status |
|---|---|
| PDFs | ✗ not added — drop each form's PDF into `pdfs/` to enable extraction |
| Snap files | ✗ none — run extraction first to generate |
| Reasoning assertions | ✓ `loanStatus`, `openConditions`, `loanContingencyRemoved`, `readyToAdvance` per round |

---

## Forms in this scenario

| File | Form code | Day | What it contains |
|---|---|---|---|
| `pdfs/day-15-conditional-approval.pdf` | `LOAN_APPROVAL` | Day 15 | Conditional approval — 3 outstanding conditions |
| `pdfs/day-19-clear-to-close.pdf` | `LOAN_APPROVAL` | Day 19 | Final clear-to-close, all conditions satisfied |
| `pdfs/day-20-cr-b.pdf` | `CR-B` | Day 20 | Buyer removes loan contingency |

---

## Extraction rounds

### Round 01 — Day 15 (conditional approval)

```
extractions/round-01/
└── loan_approval.standard.snap.json
```

Reasoning expects: `loanStatus = 'conditionally_approved'`, `openConditions.length > 0`, `readyToAdvance = false`

### Round 02 — Day 19 (clear-to-close)

```
extractions/round-02/
└── loan_approval.standard.snap.json   (replaced with CTC letter)
```

Reasoning expects: `loanStatus = 'fully_approved'`, `openConditions = []`, `loanContingencyRemoved = false`

### Round 03 — Day 20 (CR-B added)

```
extractions/round-03/
├── loan_approval.standard.snap.json   (copied from round-02)
└── cr-b.standard.snap.json
```

Reasoning expects: `loanContingencyRemoved = true`, `readyToAdvance = true`

---

## TransactionContext for reasoning tests

```json
{
  "finalAgreedPrice": 900000,
  "financingType": "Conventional",
  "loanAmount": 720000,
  "closeOfEscrowDate": "2026-03-15",
  "buyerNames": ["John Buyer"],
  "sellerNames": ["Jane Seller"]
}
```

---

## How to run

```bash
pnpm test:watch -- loan-01 -t "reasoning"
```
