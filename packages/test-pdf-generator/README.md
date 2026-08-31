# @tc/test-pdf-generator

Generate filled C.A.R. form PDFs from blank templates + fixture data. One PDF file per form, no merging. Used by tests and E2E to produce realistic documents for the extract-and-validate pipeline.

## Usage

```ts
import { generateScenarioFiles } from '@tc/test-pdf-generator';
import { rpaValid } from '@tc/test-pdf-generator/fixtures/CA-RPA-valid';

const files = await generateScenarioFiles(rpaValid, 'test/fixtures');
// → test/fixtures/CA-RPA-valid/RPA.pdf
```

Requires `qpdf` on `$PATH` for template decryption and overlay merge.

## Scenarios

| Scenario | File | Output files | Key characteristics |
|---|---|---|---|
| `CA-RPA-valid` | `CA-RPA-valid.ts` | `RPA.pdf` | $900K price, conventional loan, both signed, 17-day inspection contingency |
| `CA-RPA-missing-price` | `CA-RPA-missing-price.ts` | `RPA.pdf` | Same as valid, `purchasePrice: null` |
| `CA-RPA-resubmit` | `CA-RPA-resubmit.ts` | `RPA-V1.pdf`, `RPA-V2.pdf` | V1 = $900K original, V2 = $875K revised for version comparison |
| `CA-RPA-counter-offer` | `CA-RPA-counter-offer.ts` | `RPA.pdf`, `AD.pdf`, `AVID.pdf`, `BIA.pdf`, `SCO-1.pdf`, `BCO-1.pdf`, `SCO-2.pdf`, `BCO-2.pdf` | RPA + advisory forms + 2-round SCO/BCO counter chain with `accepted_subject_to_counter_offer: true` |
| `CA-RPA-counter-offer-2` | `CA-RPA-counter-offer-2.ts` | `RPA.pdf`, `AD.pdf`, `AVID.pdf`, `BIA.pdf`, `SCO-1.pdf`, `BCO-1.pdf` | Single-round SCO/BCO counter chain, all date/signature/expiration fields `enabled: false` |
| `CA-RPA-contract-standard` | `CA-RPA-contract-standard.ts` | `RPA.pdf`, `AD.pdf`, `AVID.pdf`, `BIA.pdf` | Full CONTRACT stage upload: RPA + advisory forms |
| `CA-disclosures-standard` | `CA-disclosures-standard.ts` | `RPA.pdf`, `AD.pdf`, `AVID.pdf`, `BIA.pdf`, `TDS.pdf`, `SPQ.pdf` | CONTRACT forms + DISCLOSURES forms (TDS + SPQ) |
| `CA-SMCO-valid` | `CA-SMCO-valid.ts` | `SMCO.pdf` | 2-page seller counter offer, buyer/seller signed, valid expiration |
| `CA-SMCO-with-addendum` | `CA-SMCO-with-addendum.ts` | `SMCO-WITH-ADDENDUM.pdf` | 4-page SMCO with 2 addendum pages, both buyer and seller signatures on each addendum, additional terms text |
| `CA-TDS-valid` | `CA-TDS-valid.ts` | `TDS.pdf` | 3-page Transfer Disclosure Statement, property address and county populated |

## Structure

```
templates/
  ca/              ← form templates (one PDF per form, organized by state)
    RPA.pdf  AD.pdf  AVID.pdf  BIA.pdf
    TDS.pdf  SPQ.pdf  SCO.pdf  BCO.pdf  SMCO.pdf
    SMCO-WITH-ADDENDUM.pdf
    SBSA.pdf PRBS.pdf BCA.pdf  BHIA.pdf CCPA.pdf
    DIA.pdf  FHDA.pdf MCA.pdf  QS.pdf   SA.pdf
    SFLS.pdf WCMD.pdf WFDA.pdf AS.pdf

src/
  coordinates/
    ca/             ← coordinate maps (x/y/w/h per field, per form)
      rpa.ts  sco.ts  bco.ts  ad.ts  avid.ts  bia.ts
      tds.ts  spq.ts  smco.ts  smco-with-addendum.ts
    index.ts        ← state-aware registry (`getCoordinates(formCode, state)`)
  fixtures/         ← one file per scenario, fully self-contained
    CA-RPA-valid.ts
    CA-RPA-missing-price.ts
    CA-RPA-resubmit.ts
    CA-RPA-counter-offer.ts
    CA-RPA-counter-offer-2.ts
    CA-RPA-contract-standard.ts
    CA-disclosures-standard.ts
    CA-SMCO-valid.ts
    CA-SMCO-with-addendum.ts
    CA-TDS-valid.ts
  pdf-filler.ts     ← generates PDFs from scenario data
  templates.ts      ← resolves template paths by state
  types.ts          ← Scenario, FormGeneration (with `state?` field)
```

## Adding a new scenario

Create a new file in `src/fixtures/` that exports a `Scenario`:

```ts
import type { Scenario } from '../types';

export const myScenario: Scenario = {
  name: 'my-scenario',         // → subfolder name
  forms: [
    { state: 'CA', formCode: 'RPA', data: { ... }, label: 'V1' },  // → RPA-V1.pdf
  ],
};
```

No registry to update — import the Scenario directly where needed.
