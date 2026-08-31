# Scenario: contract-01-single-bundle

**Story:** Buyer submits a complete contract package as a single bundled PDF. The bundle contains
an RPA along with supporting advisories. The seller accepts without counter offer and all parties
have signed.

---

## Test status

| Item | Status |
|---|---|
| PDF | ✗ not added — drop `upload.pdf` into `pdfs/` to enable extraction |
| Snap files | ✗ none — run extraction first to generate |
| SET 1 — form identification assertions | ✗ not yet implemented |
| SET 2 — JSON extraction assertions | ✗ not yet implemented |
| Snap assertions | ✗ not yet implemented |
| Reasoning assertion | ✓ `readyToAdvance = true` |

**To activate this scenario:** drop a real bundled RPA PDF into `pdfs/upload.pdf`, then follow
the steps below to run extraction, save snaps, and add assertions.

---

## Forms in this scenario

| File | Form code | Form name | Est. pages |
|---|---|---|---|
| `upload.pdf` | `RPA` | Residential Purchase Agreement | ~16 |
| `upload.pdf` | `AD` | Disclosure Regarding Real Estate Agency Relationships | ~1–2 |
| `upload.pdf` | `FRR-PA` | First Right of Refusal Addendum | ~2 |
| `upload.pdf` | `BIA` | Buyer's Investigation Advisory | ~3 |

All four forms are bundled into one PDF. The pipeline splits pages, identifies each form via
Gemini, and extracts them independently using their own prompts.

---

## Expected behavior

**Extraction:**
- Gemini classifies each page to its form code
- Each form group is extracted separately — four JSON outputs produced (one per form)
- `header.form_code` and `header.form_version` populated from page footers for each form

**Reasoning:**
- `finalAgreedPrice` = RPA purchase price (no counter offer)
- `readyToAdvance` = true (all parties signed, no open contingencies)

---

## How to run

```bash
cd packages/document-intelligence

# 1. Drop the PDF (required — tests skip if PDF absent)
cp ~/Downloads/my-contract.pdf test/scenarios/contract-01-single-bundle/pdfs/upload.pdf

# 2. Run extraction — prints JSON + snap filename hints to console
pnpm exec vitest run test/scenarios/contract-01-single-bundle

# 3. Watch mode for iteration
pnpm test:watch -- contract-01
```

---

## After running extraction: save snaps and add assertions

The console prints a `💾 Save & lock` line with the exact filename for each form. Copy the
printed JSON into those files. Then add assertions to `scenario.test.ts`:

**Snap filenames:**
```
extractions/rpa.standard.snap.json
extractions/ad.standard.snap.json
extractions/frr-pa.standard.snap.json
extractions/bia.standard.snap.json
```

See `rpa-01-bycroft-cir/scenario.test.ts` for the full reference implementation showing how to
add `assertIdentification`, `assertExtraction`, and a `describe('snap assertions')` block.

---

## Round structure

This is a single-round scenario (no counter offers). The `extractions/` folder is flat — no
`round-NN/` subfolders needed.
