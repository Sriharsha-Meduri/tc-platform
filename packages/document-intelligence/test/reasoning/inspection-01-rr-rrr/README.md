# Scenario: inspection-01-rr-rrr

**Story:** Buyer submits a Request for Repair (RR) after inspection. Seller responds with a
partial Response to Request for Repair (RRR) — agreeing to some items and offering a cash
credit in lieu of others. Buyer accepts. Tests the RR → RRR negotiation chain and the
carry-forward of `creditAgreed` into TransactionContext.

---

## Test status

| Item | Status |
|---|---|
| PDFs | ✗ not added — drop each form's PDF into `pdfs/` to enable extraction |
| Snap files | ✗ none — run extraction first to generate |
| SET 1 — form identification assertions | ✗ not yet implemented |
| SET 2 — JSON extraction assertions | ✗ not yet implemented |
| Snap assertions | ✗ not yet implemented |
| Reasoning assertions | ✓ `rrStatus`, `rrrStatus`, `creditAgreed`, `readyToAdvance` per round |

**To activate this scenario:** drop the PDFs into `pdfs/`, run extraction for each,
save snaps into the appropriate `round-NN/` folders, then add `assertIdentification`
and `assertExtraction` callbacks to `scenario.test.ts`.

---

## Forms in this scenario

| File | Form code | Day | What it contains |
|---|---|---|---|
| `pdfs/day-05-rr.pdf` | `RR` | Day 5 (post-inspection) | Buyer requests 12 items: roof, HVAC, plumbing, electrical |
| `pdfs/day-08-rrr.pdf` | `RRR` | Day 8 | Seller agrees to 6 items; offers $3,500 credit for HVAC in lieu of repair |
| `pdfs/day-10-cr-b.pdf` | `CR-B` | Day 10 | Buyer removes inspection contingency after accepting RRR |

---

## Extraction rounds

Round folders are **cumulative** — each round contains all forms available up to that point.
Copy prior-round snaps forward when building a new round.

### Round 01 — Day 5 (RR only)

```
extractions/round-01/
└── rr.standard.snap.json
```

Reasoning expects: `rrStatus = 'submitted'`, `rrrStatus = 'none'`, `readyToAdvance = false`

### Round 02 — Day 8 (RR + RRR)

```
extractions/round-02/
├── rr.standard.snap.json        (copied from round-01)
└── rrr.standard.snap.json       (new — seller response)
```

Reasoning expects: `rrStatus = 'responded'`, `rrrStatus = 'agreed'`, `creditAgreed = 3500`, `readyToAdvance = false` (CR-B still needed)

### Round 03 — Day 10 (RR + RRR + CR-B)

```
extractions/round-03/
├── rr.standard.snap.json        (copied from round-01)
├── rrr.standard.snap.json       (copied from round-02)
└── cr-b.standard.snap.json      (new — contingency removal)
```

Reasoning expects: `inspectionContingencyRemoved = true`, `readyToAdvance = true`

---

## TransactionContext for reasoning tests

Pass the following context (from a completed CONTRACT stage) when running reasoning tests:

```json
{
  "finalAgreedPrice": 900000,
  "closeOfEscrowDate": "2026-03-15",
  "buyerNames": ["John Buyer"],
  "sellerNames": ["Jane Seller"]
}
```

---

## How to run

```bash
cd packages/document-intelligence

# All rounds (extraction + reasoning) — requires API keys and PDFs
pnpm exec vitest run test/scenarios/inspection-01-rr-rrr

# Reasoning only — once round fixtures are saved
pnpm test:watch -- inspection-01 -t "reasoning"

# One specific round
pnpm test:watch -- inspection-01 -t "round 2"
```
