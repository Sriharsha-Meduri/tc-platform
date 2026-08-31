# Scenario: disclosures-01-single-bundle

**Story:** Seller delivers a complete disclosure package as a single PDF upload at the
DISCLOSURES stage. All standard California required forms are included, fully signed, with no
material defects disclosed.

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

**To activate this scenario:** drop a real disclosure package PDF into `pdfs/upload.pdf`, run
extraction, save snaps, and add `assertIdentification` / `assertExtraction` callbacks plus a
`describe('snap assertions')` block to `scenario.test.ts`.

See `rpa-01-bycroft-cir/scenario.test.ts` for the reference implementation.

---

## Forms in this scenario

| File | Form code | Form name | Est. pages |
|---|---|---|---|
| `upload.pdf` | `TDS` | Transfer Disclosure Statement | ~3 |
| `upload.pdf` | `SPQ` | Seller Property Questionnaire | ~4 |
| `upload.pdf` | `NHD` | Natural Hazard Disclosure | ~2 |
| `upload.pdf` | `BIA` | Buyer's Investigation Advisory | ~3 |
| `upload.pdf` | `BHIA` | Buyer Homeowners' Insurance Advisory | ~1 |
| `upload.pdf` | `MCA` | Market Conditions Advisory | ~2 |

All six forms bundled in one PDF. The pipeline splits pages, identifies each form via Gemini,
and extracts them independently.

---

## Expected behavior

**Extraction:**
- Gemini classifies each page to its form code
- Six JSON extraction outputs produced (one per form)
- `header.form_code` and `header.form_version` populated from page footers

**Reasoning:**
- `formsReceived` = `["TDS", "SPQ", "NHD", "BIA", "BHIA", "MCA"]`
- `formsMissing` = `[]` (all standard forms present)
- `sellerSignaturesMissing` = `[]`
- `disclosedIssues` = `[]` (no material defects in this scenario)
- `readyToAdvance` = `true`

---

## How to run

```bash
cd packages/document-intelligence

# 1. Drop the PDF (tests skip if absent)
cp ~/Downloads/my-disclosures.pdf test/scenarios/disclosures-01-single-bundle/pdfs/upload.pdf

# 2. Run extraction
pnpm exec vitest run test/scenarios/disclosures-01-single-bundle

# 3. Watch mode
pnpm test:watch -- disclosures-01
```

---

## After extraction: save snaps

The console prints a `💾 Save & lock` hint with the filename for each form. Snap files go
directly into `extractions/` (no round subfolders — this is a single-upload scenario):

```
extractions/
├── tds.standard.snap.json
├── spq.standard.snap.json
├── nhd.standard.snap.json
├── bia.standard.snap.json
├── bhia.standard.snap.json
└── mca.standard.snap.json
```

---

## Defect variant

To test the case where the seller discloses a foundation issue in TDS Section II-B:
1. Use a TDS PDF where the foundation defect box is checked
2. The reasoner should include it in `disclosedIssues`
3. `readyToAdvance` may still be `true` — a disclosed defect does not block stage advancement
