# @tc/document-intelligence

PDF extraction, form identification, compliance validation, stage reasoning, and document comparison for the TC platform.

## Subsystems

- **extractor/** — AcroForm + LLM-based extraction
- **identifier/** — page/PDF type detection
- **splitter/** — PDF page splitting
- **reasoner/** — stage reasoning
- **validator/** — stage compliance, blocker/warning catalogs
- **comparison/** — form version diffing, material change detection
- **sequence/** — form family grouping, cross-version resolution
- **page-converter/** — PDF→PNG rendering via pdfjs-dist + OffscreenCanvas
- **pipeline/** — orchestrates all above

## Development

```bash
pnpm test         # all tests (includes LLM-dependent tests)
pnpm test:unit    # unit tests only (skips LLM-dependent)
pnpm build        # compile to dist/
```

## Exports

See `src/index.ts` for the public API surface.