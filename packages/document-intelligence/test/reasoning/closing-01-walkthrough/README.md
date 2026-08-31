# Scenario: closing-01-walkthrough

**Story:** Buyer completes the final walkthrough and notes one issue — the seller left
equipment behind. Seller clears the property. Buyer signs the BWCA confirming acceptance.
Closing Disclosure is received, documents are signed, and the transaction records.

---

## Test status

| Item | Status |
|---|---|
| PDFs | ✗ not added — drop each form's PDF into `pdfs/` to enable extraction |
| Snap files | ✗ none — run extraction first to generate |
| Reasoning assertions | ✓ `walkthroughCompleted`, `walkthroughIssues`, `closingDocumentsSigned`, `readyToAdvance` per round |

---

## Forms in this scenario

| File | Form code | Day | What it contains |
|---|---|---|---|
| `pdfs/day-28-bwca-issues.pdf` | `BWCA` | Day 28 | Walkthrough advisory — buyer notes seller equipment present |
| `pdfs/day-29-bwca-accepted.pdf` | `BWCA` | Day 29 | Final signed BWCA — property accepted |
| `pdfs/day-29-cd.pdf` | `CD` | Day 29 | Closing Disclosure — final settlement figures |

---

## Extraction rounds

### Round 01 — Day 28 (BWCA with issues)

```
extractions/round-01/
└── bwca.standard.snap.json
```

Reasoning expects: `walkthroughCompleted = false`, `walkthroughIssues.length > 0`, `readyToAdvance = false`

### Round 02 — Day 29 (BWCA accepted + CD)

```
extractions/round-02/
├── bwca.standard.snap.json    (replaced with signed acceptance)
└── cd.standard.snap.json      (new)
```

Reasoning expects: `walkthroughCompleted = true`, `walkthroughIssues = []`, `closingDisclosureReceived = true`, `readyToAdvance = true`

---

## TransactionContext for reasoning tests

```json
{
  "finalAgreedPrice": 900000,
  "closeOfEscrowDate": "2026-03-15",
  "buyerNames": ["John Buyer"],
  "sellerNames": ["Jane Seller"],
  "escrowNumber": "12345",
  "escrowOfficer": "Jane Escrow"
}
```

---

## How to run

```bash
pnpm test:watch -- closing-01 -t "reasoning"
```
