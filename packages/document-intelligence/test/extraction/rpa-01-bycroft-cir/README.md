# Scenario: rpa-01-bycroft-cir

**Purpose:** Focused RPA-only extraction test. A single fully-executed RPA with no companion forms,
used to iterate on the RPA schema and prompt without the cost of a full bundle pipeline.

---

## Test status

| Item | Status |
|---|---|
| PDF | ✓ present (`RPA-FE_pdfaa05.pdf`) |
| Snap file | ✓ present (`extractions/rpa.standard.snap.json`) |
| SET 1 — form identification assertions | ✓ implemented |
| SET 2 — JSON extraction assertions | ✓ implemented (updated for per-page schema) |
| Snap assertions | ✓ implemented (7 tests) |

---

## Source PDF

| Field | Value |
|---|---|
| Filename | `RPA-FE_pdfaa05.pdf` |
| Pages | 17 |
| Property | 4041 Bycroft Cir, Yorba Linda, CA 92866 (Orange County) |
| Buyer | Pam Vovos |
| Seller agents | Ashok Patil — Blue Lotus Realty (DRE 02055556) |
| Buyer agent | Andrea Kaesbauer — Keller Williams Coastal Properties (DRE 01807749) |
| Purchase price | $1,539,900 — all-cash (no loan) |
| Close of escrow | 21 days |
| Status | Fully Executed — seller accepted 2026-01-28 without counter offer |

---

## Forms in this scenario

| Form code | Form name | Pages | Snap file |
|---|---|---|---|
| `RPA` | Residential Purchase Agreement | 17 | `extractions/rpa.standard.snap.json` ✓ |

---

## LLM Configuration

This scenario uses **per-page extraction routing** with different models for different pages:

| Page(s) | Model | Purpose |
|---|---|---|
| 1, 2, 3, 17 | `gemini-2.5-pro` | Complex sections (Offer, Agency, Terms, Signatures) |
| 4-16 | `gemini-3.1-flash-lite` | Remaining pages (default model) |

**Configuration in code:**
- `src/extractor/forms/rpa/pages/` — PageDefinitions for pages 1, 2, 3, 17 with explicit `model: 'gemini-2.5-pro'`
- `src/extractor/providers/gemini.provider.ts` — Default model `gemini-3.1-flash-lite`

---

## Schema Structure (Per-Page)

The extraction uses a **per-page nested schema** instead of the old unified schema:

| Old Schema Path | New Schema Path |
|---|---|
| `header.form_code` | `header.form_code` |
| `header.property_address` | `section_1_offer.B_property.street_address` |
| `parties.buyer_names` | `section_1_offer.A_offer_from.buyer_names` |
| `terms_of_purchase.purchase_price` | `section_3_terms_and_allocation_of_costs_page_1.A_purchase_price.purchase_price` |
| `terms_of_purchase.is_all_cash` | `section_3_terms_and_allocation_of_costs_page_1.A_purchase_price.all_cash_checked` |
| `terms_of_purchase.close_of_escrow_days` | `section_3_terms_and_allocation_of_costs_page_1.B_close_of_escrow.days_after_acceptance` |
| `agency.seller_agent` | `section_2_agency.B_confirmation.seller_agent` |
| `agency.buyer_agent` | `section_2_agency.B_confirmation.buyer_agent` |
| `seller_acceptance.*` | `seller_acceptance.*` (same path) |

**Top-level sections in the new schema:**
- `section_1_offer` — Page 1: Offer, Property, Parties
- `section_2_agency` — Page 1: Agency relationships
- `section_3_terms_and_allocation_of_costs_page_1` — Page 1: Purchase price, COE, Deposit
- `section_3_terms_and_allocation_of_costs_page_2` — Page 2: Contingencies, Possession
- `section_3_terms_and_allocation_of_costs_page_3` — Page 3: Items included, Allocation of costs
- `real_estate_brokers_section` — Page 17: Broker signatures
- `escrow_holder_acknowledgment` — Page 17: Escrow acknowledgment
- `seller_acceptance` — Acceptance dates and counter offer flag

---

## Verifications implemented

### SET 1 — Form identification (fires every run, even with snap present)

Validates Gemini's page classification output (`assertIdentification` in `scenario.test.ts`):

| Assertion | Expected |
|---|---|
| RPA form group is found | `toBeDefined()` |
| Pages assigned to RPA | `>= 15` out of 17 |
| No unexpected form codes | Only `RPA` and `UNKNOWN` allowed |

### SET 2 — JSON extraction (fires only when snap is absent)

Delete `extractions/rpa.standard.snap.json` to trigger this. Validates LLM output
(`assertExtraction` in `scenario.test.ts`):

| Section | Field | Expected value |
|---|---|---|
| `header` | `form_code` | `"RPA"` |
| `header` | `form_version` | `"Revised 12/25"` |
| `section_1_offer.B_property` | `street_address` | contains `"Bycroft"` |
| `section_1_offer.B_property` | `city` | `"Yorba Linda"` |
| `section_1_offer.B_property` | `county` | `"Orange"` |
| `section_1_offer.A_offer_from` | `buyer_names` | contains `"Pam Vovos"` |
| `section_3_terms...page_1.A_purchase_price` | `purchase_price` | `1539900` |
| `section_3_terms...page_1.A_purchase_price` | `all_cash_checked` | `true` |
| `section_3_terms...page_1.B_close_of_escrow` | `days_after_acceptance` | `21` |
| `section_2_agency.B_confirmation` | `seller_agent` | `"Ashok Patil"` |
| `section_2_agency.B_confirmation` | `buyer_agent` | `"Andrea Kaesbauer"` |
| `seller_acceptance` | `accepted_subject_to_counter_offer` | `false` |

### Snap assertions — always run, zero LLM cost

These load the locked snap from disk. No API key required. They appear in the `describe('rpa-01 snap assertions')` block at the bottom of `scenario.test.ts`:

| Test name | Fields verified |
|---|---|
| header contains form_code and form_version | `form_code = "RPA"`, `form_version = "Revised 12/25"` |
| header contains correct property details | `street_address` contains `"Bycroft"`, `city = "Yorba Linda"`, `county = "Orange"` |
| purchase price and financing type | `purchase_price = 1539900`, `all_cash_checked = true`, `days_after_acceptance = 21` |
| buyer is identified | `buyer_names` contains `"Pam Vovos"` |
| listing and buyer agents are identified | `seller_agent = "Ashok Patil"`, `seller_brokerage_firm = "Blue Lotus Realty"`, `buyer_agent = "Andrea Kaesbauer"`, `buyer_brokerage_firm` contains `"Keller Williams"` |
| contract accepted without counter offer | `accepted_subject_to_counter_offer = false`, `seller_signature_date = "2026-01-28"`, `buyer_signature_date = "2026-01-27"` |

---

## LLM usage

| Step | Tool | Cost |
|---|---|---|
| Split | `pdf-lib` (local) | Free |
| Identify pages | `gemini-2.5-flash-lite` | 17 calls |
| Extract RPA JSON (pages 1,2,3,17) | `gemini-2.5-pro` | 4 calls |
| Extract RPA JSON (pages 4-16) | `gemini-3.1-flash-lite` | 1 call (batched) |

**With snap locked: identifier runs (17 calls). Extractor is skipped entirely.**

---

## Running tests

```bash
cd packages/document-intelligence

# Full run — identification + snap assertions + reasoning
pnpm exec vitest run test/extraction/rpa-01-bycroft-cir

# Watch mode — reruns on every file save
pnpm test:watch -- rpa-01-bycroft-cir

# Snap assertions only (free — no API key needed)
pnpm test:watch -- rpa-01 -t "snap assertions"
```

---

## Iterating on the RPA schema

1. Edit page-specific schemas in `src/extractor/forms/rpa/pages/rpa.page-XX.ts`
2. Edit page aggregations in `src/extractor/forms/rpa/rpa.standard.v12-23.pages.ts`
3. Delete `extractions/rpa.standard.snap.json`
4. Run: `pnpm exec vitest run test/extraction/rpa-01-bycroft-cir`
5. Review SET 1 (identification) and SET 2 (extraction) console output
6. Fix assertions or schema until both pass
7. Copy the printed JSON into `extractions/rpa.standard.snap.json` to lock cost at zero

---

## Per-Page Extraction Architecture

The RPA form uses **page-specific extraction** with the following flow:

1. `FormExtractor.extract()` checks for `pageDefinitions` on the FormDefinition
2. If present, `buildPageBuckets()` creates separate extraction buckets:
   - Pages with PageDefinition → own bucket with page-specific prompt/model
   - Pages without PageDefinition → generic bucket with form-level fallback
3. `executeBuckets()` runs all buckets in parallel
4. `deepMergeAll()` merges results (first non-null wins for overlapping keys)

**Benefits:**
- Different models can be used for different pages (Pro for complex pages, Flash for others)
- Page-specific prompts can be more focused
- Schema can evolve per-page without breaking other pages
