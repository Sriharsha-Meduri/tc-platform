# Scenario: escrow-01-instructions

**Story:** Escrow is opened. Preliminary title report reveals a mechanic's lien that must be
resolved before closing. Seller clears the lien; amended prelim is issued. Escrow instructions
are signed by all parties. Tests title exception detection and resolution tracking.

---

## Test status

| Item | Status |
|---|---|
| PDFs | ✗ not added — drop each form's PDF into `pdfs/` to enable extraction |
| Snap files | ✗ none — run extraction first to generate |
| Reasoning assertions | ✓ `escrowNumber`, `preliminaryReportReceived`, `titleExceptions`, `readyToAdvance` per round |

---

## Forms in this scenario

| File | Form code | Day | What it contains |
|---|---|---|---|
| `pdfs/day-22-escrow-instructions.pdf` | `ESCROW_INST` | Day 22 | Escrow instructions — escrow #12345, officer Jane Escrow |
| `pdfs/day-22-prelim.pdf` | `PRELIM` | Day 22 | Preliminary title report — mechanic's lien exception |
| `pdfs/day-26-prelim-amended.pdf` | `PRELIM` | Day 26 | Amended prelim — lien released, title clear |

---

## Extraction rounds

### Round 01 — Day 22 (escrow opened, prelim with lien)

```
extractions/round-01/
├── escrow_inst.standard.snap.json
└── prelim.standard.snap.json
```

Reasoning expects: `escrowNumber = '12345'`, `preliminaryReportReceived = true`, `titleExceptions.length > 0`, `readyToAdvance = false`

### Round 02 — Day 26 (amended prelim, title clear)

```
extractions/round-02/
├── escrow_inst.standard.snap.json   (copied from round-01)
└── prelim.standard.snap.json        (replaced with amended prelim)
```

Reasoning expects: `titleExceptions = []`, `escrowInstructionsSigned = true`, `readyToAdvance = true`

---

## TransactionContext for reasoning tests

```json
{
  "finalAgreedPrice": 900000,
  "closeOfEscrowDate": "2026-03-15",
  "buyerNames": ["John Buyer"],
  "sellerNames": ["Jane Seller"],
  "loanApprovalDate": "2026-03-05"
}
```

---

## How to run

```bash
pnpm test:watch -- escrow-01 -t "reasoning"
```
