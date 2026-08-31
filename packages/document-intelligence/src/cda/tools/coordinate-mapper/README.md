# CDA Coordinate Mapper (dev-only tool)

A temporary browser tool for visually mapping CDA field coordinates onto
`src/cda/templates/cda-template.pdf`. Click a field, click the PDF, and the
tool writes `src/cda/config/cda-field-mappings.ts` for you.

**Dev only.** Binds to `127.0.0.1`. Never deploy or expose this in production.

## Start

From `packages/document-intelligence`:

```bash
node src/cda/tools/coordinate-mapper/server.ts
# or
pnpm cda:mapper
```

Then open **http://127.0.0.1:8787** in your browser.

Optional port override: `CDA_MAPPER_PORT=9000 node src/cda/tools/coordinate-mapper/server.ts`

## How to use

1. **Select a field** from the dropdown (brokerage, agent, salePrice, …).
2. **Click the PDF** where that value should be drawn. The tool captures the
   page, x, and y in PDF points (bottom-left origin, matching pdf-lib), and
   drops a color-coded marker with the field's name.
3. **Multiple coordinates per field:** keep the field selected and click
   another spot (e.g. `agent` on pages 1 and 2). Each click appends a marker.
4. **Edit / remove:** the sidebar lists every coordinate for the selected
   field — tweak page/x/y/width/height/fontSize/type/alignment in the inputs,
   or press × to delete a marker.
5. **Create a field:** type a name (letters/digits/underscores, starts with
   a letter) into the *newFieldName* box, pick its **Type**
   (text / currency / date / signature), and press **Add**. The field is
   immediately registered in the code — added to the `CdaFieldName` union and
   as an optional, type-appropriate property on `CdaGenerationInput` /
   `ResolvedCdaValues` in `src/cda/types/cda.types.ts`, and as an empty `[]`
   entry in the mappings file — so the package still typechecks. The chosen
   type also becomes the field's default coordinate type: new clicks on the
   PDF for that field start as that type (currency → `number`, date →
   `Date|string` input / `string` resolved, signature → `Buffer|string`,
   text → `string`). Custom fields show a `*` in the dropdown.
6. **Delete a field:** select a custom field (shows a `*`) and press
   **Delete selected field**. Its coordinates, mappings entry, type entries,
   and remembered type are removed from the code. Canonical fields can't be
   deleted.
7. **Save / Apply to code:** click **Save / Apply to code**. The server
   rewrites `src/cda/config/cda-field-mappings.ts`, preserving the file's
   header comment, and runs `tsc --noEmit` to verify. Status shows the result.

## Coordinate math

pdf.js renders the page top-left origin in CSS pixels at scale `S = 1.5`;
pdf-lib (what `cda-generator.ts` uses) expects PDF points with a bottom-left
Y origin. A click at CSS `(cx, cy)` on a page of size `(W, H)` points maps to:

```
pdfX = cx / S
pdfY = H - cy / S
```

So a click in the top-left corner of a 612×792 page yields `(0, 792)`, and
the bottom-right yields `(612, 0)`. Markers are drawn back at `(x·S, (H−y)·S)`
so they sit exactly where you clicked.

## Verify

After saving, `tsc --noEmit` runs automatically. To confirm the file changed:

```bash
git diff --stat src/cda/config/cda-field-mappings.ts
```

or open the file and check the coordinates match your markers.

## Files

| File | Purpose |
|---|---|
| `server.ts` | Dev HTTP server: serves the page, template PDF, pdf.js, and the mappings API (GET/POST `/api/mappings`) + field API (POST/DELETE `/api/fields`) |
| `coordinate-mapper.ts` | Browser client: renders the PDF, captures clicks, edits coordinates, creates/deletes fields, saves |
| `index.html` | Tool UI shell |

Custom fields are derived from the mappings file (any key that isn't one of
the canonical fields), so there's no separate state file to keep in sync. A
custom field's chosen type is remembered in `field-types.json` (in this
directory, gitignored) purely so new clicks default to it; if that file is
lost, custom fields simply fall back to `text`.

The `tools/` directory is excluded from the package's `tsc` build, so it
never ships in `dist/` or the production bundle.
