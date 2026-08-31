# Scenario: contract-02-counter-offers

**Story:** A realistic counter-offer negotiation played out over several days. Tests the temporal
reasoning model — the reasoner is re-run after each new form arrives and must resolve the final
agreed price from the chain of offers and acceptances.

---

## Test status

| Item | Status |
|---|---|
| PDFs | ✗ not added — drop each day's PDF into `pdfs/` to enable extraction |
| Snap files | ✗ none — run extraction first to generate |
| SET 1 — form identification assertions | ✗ not yet implemented |
| SET 2 — JSON extraction assertions | ✗ not yet implemented |
| Snap assertions | ✗ not yet implemented |
| Reasoning assertions | ✓ `readyToAdvance` per round; `finalAgreedPrice` on round 3 |

**To activate this scenario:** drop the three PDFs into `pdfs/`, run extraction for each, save
snaps into the appropriate `round-NN/` folders, then add `assertIdentification` and
`assertExtraction` callbacks to `scenario.test.ts`.

---

## Forms in this scenario

| File | Form code | Day | What it contains |
|---|---|---|---|
| `pdfs/day-01-rpa.pdf` | `RPA` | Day 1 | Initial offer at $950,000 — seller acceptance shows "subject to counter offer" |
| `pdfs/day-03-counter-1.pdf` | `COUNTER` | Day 3 | Seller Counter Offer at $925,000 |
| `pdfs/day-05-counter-2.pdf` | `COUNTER` | Day 5 | Buyer accepts $925,000 — all signatures present |

---

## Extraction rounds

Round folders are **cumulative** — each round contains all forms available up to that point.
Copy prior-round snaps forward when building a new round.

### Round 01 — Day 1 (RPA only)

```
extractions/round-01/
└── rpa.standard.snap.json
```

Reasoning expects: `readyToAdvance = false` (seller has not yet responded)

### Round 02 — Day 3 (RPA + first counter)

```
extractions/round-02/
├── rpa.standard.snap.json         (copied from round-01)
└── counter.standard.snap.json     (new — seller counter offer)
```

Reasoning expects: `readyToAdvance = false` (buyer acceptance still pending)

### Round 03 — Day 5 (RPA + both counters, fully executed)

```
extractions/round-03/
├── rpa.standard.snap.json         (copied from round-01)
├── counter.standard.snap.json     (copied from round-02)
└── counter-2.standard.snap.json   (new — buyer acceptance)
```

Reasoning expects: `finalAgreedPrice = 925000`, `readyToAdvance = true`

---

## How to run

```bash
cd packages/document-intelligence

# All rounds (extraction + reasoning) — requires API keys and PDFs
pnpm exec vitest run test/scenarios/contract-02-counter-offers

# Watch mode
pnpm test:watch -- contract-02

# Reasoning only — once round fixtures are saved
pnpm test:watch -- contract-02 -t "reasoning"

# One specific round
pnpm test:watch -- contract-02 -t "round 3"
```

---

## Building round fixtures

```bash
# Step 1: extract each PDF and copy the printed JSON into the round folder
pnpm test:watch -- contract-02 -t "day-01"   # extracts day-01-rpa.pdf
# → copy output to extractions/round-01/rpa.standard.snap.json

pnpm test:watch -- contract-02 -t "day-03"   # extracts day-03-counter-1.pdf
# → copy output to extractions/round-02/counter.standard.snap.json
# → also copy round-01/rpa.standard.snap.json into round-02/

pnpm test:watch -- contract-02 -t "day-05"   # extracts day-05-counter-2.pdf
# → copy output to extractions/round-03/counter-2.standard.snap.json
# → also copy round-02/ snaps into round-03/
```

---

## Reference implementation

See `rpa-01-bycroft-cir/scenario.test.ts` for a complete example of `assertIdentification`,
`assertExtraction`, and snap assertion blocks. Once PDFs are added here, follow the same pattern.
