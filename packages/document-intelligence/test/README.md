# Document Intelligence Tests

This test suite covers PDF form extraction, compliance validation, stage reasoning, and form comparison for California real estate transaction forms (C.A.R. forms).

## Quick Start

```bash
# Run only unit tests (no LLM calls, no API keys needed)
pnpm test:unit

# Run all tests including LLM-dependent extraction/reasoning (needs API keys)
pnpm test
```

---

## Test Structure

```
test/
├── unit/                          # Pure unit tests (no LLM, fast)
│   ├── comparison.test.ts        # Form comparison (RPA/SCO diffing)
│   ├── contract-stage.test.ts    # CONTRACT stage validators
│   ├── form-registry.test.ts     # Form definition lookups
│   └── sequence.test.ts          # Form family and version sequence resolution
│
├── extraction/                    # LLM extraction tests (needs API keys)
│   ├── contract-01-single-bundle/
│   ├── contract-02-counter-offers/
│   ├── contract-03-lasselle-st-rpa-bundle/
│   ├── disclosures-01-single-bundle/
│   └── rpa-01-bycroft-cir/
│
├── reasoning/                     # Stage reasoning tests (needs API keys)
│   ├── appraisal-01-below-value/
│   ├── closing-01-walkthrough/
│   ├── contract-01-lasselle-st/
│   ├── contract-02-bycroft-cir/
│   ├── escrow-01-instructions/
│   ├── inspection-01-rr-rrr/
│   └── loan-01-approval/
│
├── helpers/
│   ├── scenario.ts               # Test runner DSL + file loaders
│   └── pipeline.ts               # Build pipeline/reasoner for tests
│
└── fixtures/                     # Reserved for shared test data (currently empty)
```

## Helpers (`test/helpers/`)

### `pipeline.ts`

Builds test instances of the pipeline and reasoner with API keys from environment variables.

| Function | Purpose |
|----------|---------|
| `buildPipeline()` | Creates `DocumentIntelligencePipeline` with configured providers |
| `buildReasoner()` | Creates `StageReasoner` with configured provider |

**Environment variables used**:
- `GEMINI_API_KEY` - for form identification
- `ANTHROPIC_API_KEY` - for extraction/reasoning
- `LLM_EXTRACTION_PROVIDER` - 'anthropic' or 'gemini'
- `LLM_REASONING_PROVIDER` - 'anthropic' or 'gemini'

### `scenario.ts`

The main test infrastructure. Provides a DSL for defining scenario-based tests.

#### File Loaders

| Function | Purpose |
|----------|---------|
| `loadPdf(scenarioDir, filename)` | Load PDF buffer from `pdfs/` directory |
| `loadExtractions(scenarioDir)` | Load all JSON fixtures from `extractions/` |
| `loadRound(scenarioDir, round)` | Load JSON from `extractions/round-NN/` (temporal scenarios) |
| `loadSnaps(scenarioDir)` | Load `.snap.json` files keyed by form code |
| `assertSnap(scenarioDir, formCode)` | Assert against a saved snap (throws if missing) |

#### `describeScenario()` DSL

The main entry point for scenario tests. Call this in your `scenario.test.ts`:

```typescript
describeScenario(__dirname, {
  stage: 'CONTRACT',
  
  // Extraction tests (runs pipeline on PDFs)
  extraction: {
    pdfFiles: ['RPA.pdf'],
    assertIdentification: (formGroups) => {
      expect(formGroups[0].formCode).toBe('RPA');
    },
    assertExtraction: (forms) => {
      const rpa = forms.find(f => f.formCode === 'RPA');
      expect(rpa?.data.terms_of_purchase.purchase_price).toBe(850000);
    },
  },
  
  // Reasoning tests (loads saved extractions, runs LLM reasoning)
  reasoning: [
    {
      label: 'initial RPA review',
      formCodes: ['RPA', 'AD'],  // filter out compliance forms
      expect: {
        nextAction: 'request_counter_signatures',
        requiresTcReview: true,
      },
    },
  ],
});
```

#### Scenario Test Flow

**Extraction tests**:
1. Load PDF from `pdfs/`
2. Run `DocumentIntelligencePipeline.process()`
3. **Step 1 (always runs)**: `assertIdentification()` - verify form codes/page counts
4. **Step 2 (only without snap)**: `assertExtraction()` - verify extracted field values
5. Prints JSON to console + suggested filename for saving as snap

**Reasoning tests**:
1. Load JSON fixtures from `extractions/`
2. Filter by `formCodes` (if specified)
3. Run `StageReasoner.reason()`
4. Assert against `result.data` using `expect` keys

## Fixtures (`test/fixtures/`)

Currently empty (only `.gitkeep`). Reserved for:
- Shared JSON fixtures used across multiple scenarios
- Shared PDF samples
- Common test data helpers

**Currently unused** - use scenario-specific `extractions/` and `pdfs/` directories instead.

---

## Unit Tests (`test/unit/`)

These are pure TypeScript/JavaScript tests with no external dependencies. Run these frequently during development.

### comparison.test.ts (13 tests)

Tests the form comparison module for detecting material changes between re-uploads.

| Test | Description |
|------|-------------|
| `should detect no changes when data is identical` | Baseline: same data → no changes |
| `should detect material change in purchase price above threshold` | $850k → $855k = material (>$1000 threshold) |
| `should detect minor change in purchase price below threshold` | $850k → $850.5k = minor (<$1000 threshold) |
| `should detect material change in property address` | Different street = material |
| `should detect material change in buyer/seller names` | Different parties = material |
| `should detect material change in accepted_subject_to_counter_offer` | Counter offer flag change = material |
| `should use custom threshold config` | Override default $1000 to $10000 |
| `should detect SCO material changes` | Counter offer specific comparisons |

**Key functions tested**:
- `compareRpaExtractions()`
- `compareScoExtractions()`
- `isMaterialChange()`
- `DEFAULT_RPA_MATERIAL_CONFIG`

### contract-stage.test.ts (21 tests)

Tests CONTRACT stage compliance validators.

#### RPA Per-Form Validators

| Test | Description |
|------|-------------|
| `empty RPA has expected blockers` | Missing fields = BLOCKERs |
| `empty RPA has expected warnings` | Incomplete fields = WARNINGs |
| `well-formed RPA passes with no blockers` | Complete RPA = no blockers |
| `well-formed RPA with minor issues still has some warnings` | Partial data = warnings only |
| `well-formed RPA with no accepted flag, missing buyer/seller addresses` | Missing data = warnings |
| `signed RPA passes signature check` | Signatures present = no signature warnings |

#### Contingency Date Warnings (WARN-RPA-19..22)

| Test | Description |
|------|-------------|
| `emits WARN_INSPECTION_CONTINGENCY when null` | Missing inspection days = WARN-RPA-19 |
| `emits WARN_LOAN_CONTINGENCY when null` | Missing loan days (non-cash) = WARN-RPA-20 |
| `skips WARN_LOAN_CONTINGENCY for cash` | Cash transaction → status `skipped`, no warning |
| `emits WARN_APPRAISAL_CONTINGENCY when null` | Missing appraisal days = WARN-RPA-21 |
| `emits WARN_DISCLOSURES_DUE when null` | Missing disclosures due = WARN-RPA-22 |
| `emits all 4 when all contractTerms null` | All null → 4 warnings, `needs_review` status |
| `produces pass checks when present` | All 4 populated → 4 `pass` checks, no warnings |

#### SCO Per-Form Validators

| Test | Description |
|------|-------------|
| `empty SCO has expected warnings` | Missing fields = warnings |
| `BCO variant uses same validators` | BCO = same schema as SCO (role-neutral) |

#### Stage-Level Rules

| Test | Description |
|------|-------------|
| `RPA with counter offer flag + SCO present = passes` | Counter offer expected and found |
| `RPA with counter offer flag but no SCO = warning` | Missing counter form = WARN-RPA-2001 |
| `RPA without counter offer flag + no SCO = passes` | No counter expected = skip check |

#### Cross-Form Validators

| Test | Description |
|------|-------------|
| `RPA + AD with matching names/address = passes` | Consistent data across forms |
| `RPA + AD with address mismatch = cross-form warning` | Different property addresses = warning |

### form-registry.test.ts (18 tests)

Tests form definition lookups from `FORM_REGISTRY`.

| Test Category | Examples |
|---------------|----------|
| Shorthand lookup | `'RPA'` → latest version |
| Pinned version lookup | `'RPA@v12-23'` → specific version |
| SCO aliases | `'BCO'`, `'SMCO'`, `'BMCO'` → same `scoStandardV1224` definition |
| Fallback behavior | Unknown code → `undefined` |

---

## Extraction Tests (`test/extraction/`)

These are LLM-dependent tests that require API keys. They test the full PDF extraction pipeline.

Each extraction scenario has:
- `pdfs/` — Real PDF files (C.A.R. forms)
- `extractions/*.snap.json` — Saved extraction outputs (snapshots)
- `scenario.test.ts` — Test that runs extraction and compares against snapshot
- `README.md` — Human-readable description of the scenario

### How Extraction Tests Work

1. Test loads PDF from `pdfs/`
2. Runs `DocumentIntelligencePipeline.process()` 
3. Compares result against `extractions/*.snap.json`
4. If snapshot doesn't exist, creates it (first run)

**To regenerate snapshots**: Delete the `.snap.json` file and re-run the test.

### Model Configuration (RPA)

The RPA form uses **per-page extraction routing** with different models:

| Page(s) | Model | Purpose |
|---|---|---|
| 1, 2, 3, 17 | `gemini-2.5-pro` | Complex sections (Offer, Agency, Terms, Signatures) |
| 4-16 | `gemini-3.1-flash-lite` | Remaining pages (default model) |

**Configuration files:**
- `src/extractor/forms/rpa/pages/rpa.page-XX.ts` — PageDefinitions with explicit `model: 'gemini-2.5-pro'`
- `src/extractor/providers/gemini.provider.ts` — Default model `gemini-3.1-flash-lite` (was `gemini-2.5-flash-lite`)

### Per-Page Schema

The RPA extraction uses a **nested per-page schema** instead of the old unified schema. Key paths:

| Old Schema Path | New Schema Path |
|---|---|
| `header.property_address` | `section_1_offer.B_property.street_address` |
| `parties.buyer_names` | `section_1_offer.A_offer_from.buyer_names` |
| `terms_of_purchase.purchase_price` | `section_3_terms_and_allocation_of_costs_page_1.A_purchase_price.purchase_price` |
| `terms_of_purchase.is_all_cash` | `section_3_terms_and_allocation_of_costs_page_1.A_purchase_price.all_cash_checked` |
| `agency.seller_agent` | `section_2_agency.B_confirmation.seller_agent` |
| `agency.buyer_agent` | `section_2_agency.B_confirmation.buyer_agent` |

### Extraction Scenarios

| Scenario | Description |
|----------|-------------|
| `contract-01-single-bundle` | Single contract form bundle |
| `contract-02-counter-offers` | Counter offer forms (SCO/BCO) |
| `contract-03-lasselle-st-rpa-bundle` | Complex RPA with multiple addenda |
| `disclosures-01-single-bundle` | Disclosure forms (TDS, SPQ, NHD) |
| `rpa-01-bycroft-cir` | Standalone RPA extraction (per-page schema)

---

## Reasoning Tests (`test/reasoning/`)

These are LLM-dependent tests that test stage reasoning (what happens next based on extracted forms).

### Reasoning Scenarios

| Scenario | Stage | Description |
|----------|-------|-------------|
| `appraisal-01-below-value` | APPRAISAL | Appraisal came in below value |
| `closing-01-walkthrough` | CLOSING | Final walkthrough and closing |
| `contract-01-lasselle-st` | CONTRACT | Contract execution scenario 1 |
| `contract-02-bycroft-cir` | CONTRACT | Contract execution scenario 2 |
| `escrow-01-instructions` | ESCROW | Escrow instructions |
| `inspection-01-rr-rrr` | INSPECTION | Request for Repair flow |
| `loan-01-approval` | LOAN | Loan approval |

### How Reasoning Tests Work

1. Loads saved extractions from `extractions/*.snap.json`
2. Runs `StageReasoner.reason()` 
3. Verifies expected decisions/actions
4. Some tests also verify document extraction pipeline

---

## Test Patterns

### Unit Test Pattern

```typescript
describe('Feature being tested', () => {
  it('should do X when condition Y', () => {
    // 1. Setup
    const input = { ... };
    
    // 2. Execute
    const result = functionUnderTest(input);
    
    // 3. Verify
    expect(result.hasChanges).toBe(true);
    expect(result.changes[0].severity).toBe('material');
  });
});
```

### Validator Test Pattern (Contract Stage)

```typescript
// Well-formed test data = minimal valid data
const wellFormedRpa = {
  header: { property_address: '123 Main St' },
  parties: { buyer_names: ['Buyer'], seller_names: ['Seller'] },
  signatures: { buyer_signed: true, seller_signed: true },
  // ...
};

// Test: validates that validation runs as expected
const result = validateContractStage([rpaExtraction]);
expect(result.blockers.length).toBe(0);  // No blockers for valid data
```

### Comparison Test Pattern

```typescript
// Same data = no changes
const identical = compareRpaExtractions(oldData, oldData);
expect(identical.hasChanges).toBe(false);

// Different data = material changes
const changed = compareRpaExtractions(oldData, newData);
expect(changed.hasMaterialChanges).toBe(true);
```

---

## Environment Setup for LLM Tests

Create `apps/api/.env.local` with:

```bash
# For Gemini (identifier)
GEMINI_API_KEY=your-gemini-key

# For Anthropic (extraction/reasoning)
ANTHROPIC_API_KEY=your-anthropic-key

# Choose provider
LLM_EXTRACTION_PROVIDER=anthropic
LLM_REASONING_PROVIDER=anthropic
```

---

## Adding New Tests

### For a new validator function:

1. Add tests in appropriate stage file (e.g., `contract-stage.test.ts`)
2. Test both:
   - Well-formed input (should pass)
   - Invalid/incomplete input (should produce blockers/warnings)

### For a new form comparison function:

1. Add tests in `comparison.test.ts`
2. Test:
   - Identical data (no changes)
   - Material changes (above thresholds)
   - Minor changes (below thresholds)

### For a new extraction/reasoning scenario:

1. Create directory under `test/extraction/` or `test/reasoning/`
2. Add PDF files to `pdfs/`
3. Add `scenario.test.ts` using helpers from `test/helpers/`
4. Add `README.md` explaining the scenario
5. Run test once to generate snapshot

---

## Common Issues

### Tests failing because snapshot is stale

Delete the `.snap.json` file and re-run. The test will create a new snapshot.

### "Provider not configured" error

Make sure `apps/api/.env.local` exists with valid API keys. Use `pnpm test:unit` instead if you don't have keys.

### Import errors from `@tc/document-intelligence`

Run `pnpm --filter @tc/document-intelligence build` first. The API uses tsconfig path mapping to the compiled `dist/` folder.

---

## Test Commands Reference

| Command | Description |
|---------|-------------|
| `pnpm test:unit` | Unit tests only (fast, no LLM) |
| `pnpm test` | All tests (needs API keys) |
| `pnpm vitest run test/unit/comparison.test.ts` | Single test file |
| `pnpm vitest run test/unit/comparison.test.ts -t "material change"` | Single test by name |
