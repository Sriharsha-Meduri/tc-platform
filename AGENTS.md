# AGENTS.md — TC Monorepo

## Git rules
- Do NOT commit to `main` unless explicitly told to. Commit to feature branches and create PRs.
- Do NOT merge PRs unless explicitly asked.
- Do NOT commit, push, or create PRs unless explicitly told to. Only stage/commit/push when the user says so.

Real estate transaction coordination platform. Turborepo monorepo with NestJS API, Next.js web, React Native mobile, and shared packages.

## Entrypoints

| Package | Path | Entry |
|---|---|---|
| API | `apps/api/src/main.ts` | NestJS bootstrap |
| Web | `apps/web/` | Next.js App Router (port 3001) |
| Mobile | `apps/mobile/App.tsx` | Expo + React Navigation |
| Shared types | `packages/shared/src/` | DTOs, constants, types |
| API client | `packages/api-client/src/` | `apiFetch`, `gqlFetch` helpers |
| Doc intelligence | `packages/document-intelligence/` | PDF extraction + compliance (Vitest) |

## First-time setup (order matters)

```bash
docker compose up -d                    # PostgreSQL on localhost:5432
pnpm install
pnpm --filter @tc/api db:setup          # migration:run + seed (idempotent)
pnpm dev                                # all 3 apps
```

Ports: API `3000`, Web `3001`, Expo `8081`.

Database: user `tc`, password `tc_dev`, database `tc`. Seeded dev accounts all use password `Password1!`.

## Environment loading

`apps/api/src/env.ts` **must be the first import** in `main.ts` and `data-source.ts`. Controlled by `APP_ENV` env var:

| APP_ENV | `.env` file loaded | Database |
|---|---|---|
| `local` (default) | `.env.local` | Docker PostgreSQL |
| `dev` | `.env.dev` | Neon dev |
| `production` | `.env.production` | Neon production |

All `pnpm` scripts set `APP_ENV` automatically. On Fly.io, secrets are injected before startup — `.env.*` file is absent and silently skipped.

The web app needs only `apps/web/.env.local`: `NEXT_PUBLIC_API_URL=http://localhost:3000`.

## Commands

### Root (Turborepo)
- `pnpm dev` / `pnpm build` / `pnpm lint` / `pnpm test`
- No root `typecheck` script exists — run per-package: `pnpm --filter @tc/api typecheck`

### API (`@tc/api`)
- `pnpm dev` — `APP_ENV=local nest start --watch`
- `pnpm test` / `pnpm test:watch` / `pnpm test:coverage`
- `pnpm lint` / `pnpm typecheck`
- `pnpm migration:generate --name=<PascalCase>` — generate from entity diff
- `pnpm migration:run` / `pnpm migration:revert` / `pnpm migration:show`
- `pnpm seed` / `pnpm db:setup` (migration + seed)
- Single test: `npx jest src/modules/<name>/<file>.spec.ts`

### Web (`@tc/web`)
- `pnpm dev` — `next dev --port 3001`
- `pnpm test` / `pnpm lint` / `pnpm typecheck`
- Single test: `npx jest` (via next/jest wrapper)


### Document intelligence (`@tc/document-intelligence`)
- `pnpm test` — Vitest (not Jest), 120s timeout, loads API keys from `apps/api/.env.local`
- `pnpm test:unit` — unit tests only (skips LLM-dependent tests)
- See `test/README.md` for comprehensive test documentation (45 unit tests + extraction/reasoning LLM tests)

### Test PDF generator (`@tc/test-pdf-generator`)
- `pnpm test` — Vitest, generates PDFs to `test/fixtures/{scenario-name}/`
- Single fixture call creates one or more standalone PDF files
- Requires `qpdf` on `$PATH`

### Deploy
```bash
fly deploy --config fly.dev.toml        # API dev
fly deploy --config fly.toml            # API production
# Web auto-deploys on git push to main (Vercel)
```

## Architecture rules

### Database & ORM
- **Never `synchronize: true`** — always use migration files
- **Never edit `src/schema.gql`** — auto-generated at NestJS startup
- **New entity = new migration** (even in local dev)
- Enums are `varchar` in DB: `@Column({ type: 'varchar' })`, never `enum: MyEnum`
- JSONB columns return as native JS objects — no `JSON.parse()`
- Database connection: `DATABASE_URL` (Neon) takes precedence over individual `DB_*` vars

### Append-only tables
`transaction_journals` and `ai_interactions`: no update/delete service methods, no PATCH/DELETE endpoints, no `updatedAt` column, no cascade deletes.

### Sensitive fields
`@HideField()` on: `passwordHash`, `preferencesJson`, `storageKey`, `bodyHtml`, `promptText`, `toolCallsJson`.

### Module convention
Each NestJS module under `apps/api/src/modules/<name>/`:
```
entities/    ← TypeORM entities (= GraphQL @ObjectType)
dto/         ← GraphQL InputTypes
*.service.ts ← business logic
*.controller.ts ← REST endpoints
*.resolver.ts  ← GraphQL resolvers
*.module.ts    ← NestJS module
```

### API prefix
Global prefix `/api/v1` (set in `main.ts`) — excluded routes: `/admin(.*)`, `/webhooks(.*)`.

### Cross-app types
Add to `packages/shared/src/dtos/index.ts`. All apps reference via `workspace:*`.

### Next.js web
- Server Components by default; `'use client'` only for interactivity
- API calls through `@tc/api-client` helpers, never raw `fetch`
- UI: Tailwind v4 + lucide-react + `cn()` helper at `src/lib/utils.ts`
- No Chakra UI / MUI
- `next.config.ts`: `transpilePackages: ['@tc/shared', '@tc/api-client']`, `eslint.ignoreDuringBuilds: true`, `typescript.ignoreBuildErrors: true`

## Verification order before committing

```bash
pnpm --filter @tc/api typecheck   # or the relevant package
pnpm lint
pnpm test
```

## Testing quirks

- **API (Jest + ts-jest)**: specs live next to source, match `*.spec.ts`. Mock repos with `getRepositoryToken`. Integration tests use `@nestjs/testing` with in-memory SQLite.
- **Web (Jest + next/jest + jsdom)**: Server Components: `await Component()` then `render()`. Client components: `userEvent` for interaction.
- **Mobile (Jest + jest-expo)**: Wrap in `NavigationContainer` for nav-dependent tests. `@testing-library/react-native` API mirrors web.
- **Document-intelligence (Vitest)**: separate test runner with LLM API calls. CI should use `pnpm test:unit` to avoid API costs. 120s timeout. Loads env from both package dir and `apps/api/.env.local`.

## Packages

| Package | Resolved via | Consumers | Purpose |
|---|---|---|---|---|
| `@tc/shared` | `workspace:*` in package.json | API, web, mobile | DTOs, constants (`API_PREFIX`), shared types |
| `@tc/api-client` | `workspace:*` in package.json | web, mobile | `apiFetch`, `gqlFetch` helpers — never raw `fetch` |
| `@tc/config` | workspace node_modules resolution | API, web, mobile (tsconfig `extends`, eslint `extends`) | Shared ESLint configs + tsconfig presets |
| `@tc/document-intelligence` | TypeScript path mapping in `apps/api/tsconfig.json` (points to `dist/index.d.ts`) | API only (`document-extraction` module) | PDF extraction, form identification, compliance validation, stage reasoning |
| `@tc/test-pdf-generator` | `workspace:*` in package.json | dev-only (tests, E2E) | Fill blank C.A.R. form PDFs with fixture data for testing |

### `@tc/document-intelligence` — important quirks

- **Not a `package.json` dependency** of the API — only linked via tsconfig paths. The Turborepo build graph does **not** automatically build it before the API. Run `pnpm --filter @tc/document-intelligence build` explicitly if imports fail.
- **Compiled to `dist/`** — must be built (`pnpm build` in that package) before the API can resolve its types at dev time.
- **Re-exports from API**: The API's `document-extraction` module re-exports types from this package. Source of truth lives in `packages/document-intelligence/src/`, not in `apps/api/`.
- **Two LLM providers**: Anthropic (default) and Gemini. Controlled by `LLM_EXTRACTION_PROVIDER` / `LLM_REASONING_PROVIDER` env vars in `apps/api/.env.local`.
- **Subsystems**: `extractor/` (AcroForm + LLM extraction), `identifier/` (page/PDF type detection), `splitter/` (PDF page splitting), `reasoner/` (stage reasoning), `validator/` (stage compliance, blocker/warning catalogs), `comparison/` (form version diffing, material change detection), `sequence/` (form family grouping, cross-version resolution), `page-converter/` (PDF→PNG rendering via pdfjs-dist + OffscreenCanvas, optional configurable DPI), `pipeline/` (orchestrates all above).

### `@tc/config` exports

```
eslint-base, eslint-next, eslint-react-native   ← eslint configs
tsconfig-base, tsconfig-nest, tsconfig-next, tsconfig-react-native  ← tsconfig presets
```

### `@tc/test-pdf-generator` — important quirks

- **File-per-form output**: `generateScenarioFiles(scenario, outputDir)` writes one `.pdf` per `FormGeneration` entry to `{outputDir}/{scenario.name}/`. Each is a standalone filled PDF.
- **Label-based naming**: `{label}` on `FormGeneration` produces `{FormCode}-{label}.pdf`. No label + single form → `{FormCode}.pdf`. No label + multi-form → `{FormCode}-{index}.pdf`.
- **Fixture files export Scenario directly**: No registry. Each `src/fixtures/*.ts` exports a `Scenario` object with `name` and `forms[]`. The `name` becomes the subfolder name on disk.
- **Multi-form scenarios**: Bundle RPA + SCO + BCO into one call — each gets its own PDF file (not merged). The `rpa.counter-offer.ts` fixture generates a 5-form chain: RPA → SCO-1 → BCO-1 → SCO-2 → BCO-2 with `offer_reference` linking each round.
- **SCO/BCO shared schema**: Both forms share the same JSON data schema but have different physical layouts — SCO is 2 pages, BCO is 1 page. Separate coordinate files (`sco.ts` / `bco.ts`) reflect this.
- **Resubmission testing**: `rpa.resubmit.ts` fixture generates `RPA-V1.pdf` + `RPA-V2.pdf` for version comparison testing.
- **Raw data exports**: Fixtures also export the raw data constant (e.g., `rpaValidData`, `scoValidData`, `bcoValidData`) for composition in other fixtures.
- **Self-contained scenarios**: Each fixture is independent — `rpa.counter-offer.ts` has its own RPA data (not shared with `rpa.valid.ts`) to avoid cross-fixture coupling.
- Blank templates live in `templates/`, auto-decrypted via `qpdf`. Requires `qpdf` on `$PATH`. See `docs/local-workspace-setup.md` §21 for full docs.

## Entity list (20+ tables)

Audit trail: `audit_logs` (append-only, no update/delete).

Core tracking tables all share `workflow_step_id` as FK axis: `transaction_workflow_steps`, `transaction_tasks`, `transaction_events`, `transaction_journals`, `transaction_messages`, `ai_interactions`.

Transaction stages (linear, `stage` varchar): `INTAKE → CONTRACT → DISCLOSURES → INSPECTION → APPRAISAL → LOAN → ESCROW → CLOSING → POST_CLOSE`. Advancement is manual.

TC is optional: `assigned_coordinator_account_id` nullable on transactions.

## Blocker/warning constant-code system

Blockers and warnings use a constant-code system with composite ID convention:
`TYPE-FORMCODE-NUMBER` — e.g., `BLOCKER-RPA-1`, `WARN-RPA-AD-1001`.

### Number range allocation (5000-wide blocks per form)

| Form | Range | Sub-ranges |
|---|---|---|---|
| RPA | 1–5000 | 1–1000 form-specific, 1001–2000 cross-form, 2001–3000 business, 3001–5000 reserved |
| AD | 5001–10000 | same sub-range split |
| TDS | 10001–15000 | same |
| SPQ | 15001–20000 | same |
| NHD | 20001–25000 | same |
| AVID | 25001–30000 | same |
| BIA | 30001–35000 | same |
| SCO/BCO/SMCO/BMCO | 35001–40000 | same (shared role-neutral schema) |

### Catalog style

- **Stage-level catalogs** (not monolithic): co-located with stage files — `contract.blocker-catalog.ts`, `disclosures.blocker-catalog.ts`
- Each entry has `effective: boolean` — set to `false` to retire a rule without deleting the entry
- `combinations` field uses format `FORMCODE:v1,v2,v3` or `FORMCODE:*` — documentation-only for now, rule functions handle preconditions
- `ComplianceResult` carries optional `blockers: BlockerOutput[]` and `warnings: WarningOutput[]` alongside backward-compatible `checks: ComplianceCheck[]`

## Validation phases per stage

Stage validation runs in 3 phases:

1. **Per-form** — validate each form's internal data quality (e.g., buyer/seller names populated on RPA)
2. **Cross-form** — compare consistency across forms (e.g., buyer name matches across RPA and AD)
3. **Stage-level** — apply combined business logic against normalized data (e.g., sale price vs loan amount)

### STAGE_FORM_EXPECTATIONS — API-driven

Replaces `STAGE_REQUIRED_FORMS`. Distinguishes required vs expected forms for progressive upload:

- **Required** → `BlockingOutput` when form is missing (cannot advance stage)
- **Expected** → `WarningOutput` when form is missing (progressive upload allowed)

**Now configurable from the API**, not hardcoded. `StageValidator.validate()` accepts an optional `formExpectations: StageFormExpectation[]` parameter. When provided, these override the hardcoded `STAGE_FORM_EXPECTATIONS` constant. The pipeline threads this through via `PipelineOptions.formExpectations`.

Usage in API:
```ts
// page-routing-pipeline.service.ts
process(pdfBuffer, onProgress, formExpectations)
```
Backward compatible — omitting `formExpectations` falls back to the defaults in `registry.ts`.

Example: uploading RPA alone at CONTRACT stage gets warnings for missing AD/AVID/BIA, not blockers.

## Transaction state machine & upload/submission flow

Transaction entity statuses (state machine): `DRAFT` → `ACTIVE` → `UNDER_CONTRACT` → `PENDING_CLOSE` → `CLOSED`. Terminal: `CANCELLED`, `ARCHIVED`.

### Initial RPA upload (`extract-and-draft`)

The RPA gate (`isRpaDocument()` in `document-extraction.controller.ts:681`) is the only hard enforcement:

| Condition | Result |
|---|---|
| No RPA detected in uploaded PDF(s) | `422 RPA_NOT_FOUND` — cannot initiate a transaction |
| RPA detected, **invalid data** (missing price, signatures, etc.) | **Succeeds** — creates DRAFT transaction, stores compliance blockers in `metadataJson.compliance` |
| RPA detected, valid data | Same flow, fewer blockers |

**Validation is diagnostic, not blocking** at upload time. The compliance result is a report stored in `metadataJson` — the upload proceeds regardless of data quality. The `extract-and-draft` endpoint also runs a duplicate check (`409 DUPLICATE_TRANSACTION`) per org+address.

The draft transaction is created with `status: DRAFT`, and subsequent `upload-and-extract` calls add documents to it (no RPA gate on subsequent uploads).

### Submission (`submit-contract`)

Converts DRAFT → ACTIVE. **Does NOT enforce compliance** — there is no blocker check before submission. Creates a `TransactionDocumentSubmission` row (auto-incremented `submissionNo`, status `UNDER_REVIEW`), activates CONTRACT stage, seeds calendar events from extraction, and sends welcome emails.

**Compliance is not enforced anywhere** — neither the API nor the UI gates submission on compliance. The `Step5Confirm.tsx:144-156` submit button only checks `isSubmitting`, not compliance status. This is pending work.

### Subsequent document uploads (`upload-and-extract`)

- **No RPA gate** — any form code accepted (transaction already exists)
- **Version detection**: re-uploading same `detectedFormCode` in same `transactionId+stage` creates a new version: old doc marked SUPERSEDED, new doc linked via `previousVersionId`, `versionNo` incremented
- **Version comparison**: RPA → `compareRpaExtractions()`, SCO/BCO/SMCO/BMCO → `compareScoExtractions()`, other forms → null
- **Version action**: `critical` form + material changes → `void_suggested`; otherwise → `superseded`; no previous version → `none`
- **Stage auto-classification**: form code → category → stage; if resolved stage differs from submitted stage, `reclassified: true` is returned
- **One active document per form code per stage** — no parallel active RPAs

### Key architectural note

`TransactionDocumentSubmission` tracks submission rounds but compliance isn't wired into it yet — the submission endpoint doesn't re-validate blockers before advancing DRAFT → ACTIVE.

## Per-page extraction routing

`FormDefinition` can carry optional `pageDefinitions: PageDefinition[]` where each entry specifies:

```
{
  pageNumber: number;
  systemPrompt: string;
  userPrompt: string;
  model?: string;     // override per page
  provider?: string;  // override per page
}
```

- Per-page files live in `rpa/pages/` (e.g., `rpa.page-01.ts`, `rpa.page-02.ts`)
- An aggregator file (e.g., `rpa.standard.v12-23.pages.ts`) imports all pages and exports as array
- `FormExtractor` builds prompt buckets per unique `(model, provider, prompt)`, batching pages with no definition into a fallback call
- Provider cache keyed by `provider::model` to avoid re-initializing providers
- Results are deep-merged across all buckets (first non-null wins for overlapping keys)

## Form criticality system

`FormDefinition` has optional `criticality?: FormCriticality` field:

| Value | Purpose |
|---|---|
| `'critical'` | Material changes trigger void/reupload suggestion (default for main forms) |
| `'routine'` | Changes tracked but no automatic void suggestion |

Forms marked `critical: 'critical'`: RPA, AD, TDS, SPQ, AVID, BIA, SCO/BCO/SMCO/BMCO.

## Form comparison & material change detection

New `comparison/` module in `@tc/document-intelligence` for versioning:

### Types
```ts
type ChangeSeverity = 'material' | 'minor' | 'none';
interface FieldChange { path: string; oldValue: unknown; newValue: unknown; severity: ChangeSeverity; label: string; }
interface FormComparisonResult { hasChanges: boolean; hasMaterialChanges: boolean; changes: FieldChange[]; }
```

### Functions
- `compareRpaExtractions(oldData, newData, config?)` — compares purchase price, COE days, contingencies, buyer/seller names, property address, counter offer flag
- `compareScoExtractions(oldData, newData)` — compares counter offer terms, expiration, signatures
- `isMaterialChange(result)` — helper to check if material changes exist
- `DEFAULT_RPA_MATERIAL_CONFIG` — thresholds: $1000 price change, 3 days COE/contingency change

### Exports
All exported from `@tc/document-intelligence`:
```ts
import { compareRpaExtractions, compareScoExtractions, isMaterialChange, DEFAULT_RPA_MATERIAL_CONFIG } from '@tc/document-intelligence';
```

## API versioning

Current: single `API_VERSION = 'v1'` constant in `@tc/shared`, global prefix `/api/v1`. No multi-version support yet. Recommended approach for future evolution:

- New endpoints as separate controllers (`@Controller('v2/...')`) alongside v1
- Additive optional fields on response types (backward-compatible pattern already used for `blockers`/`warnings`)
- No URL-based versioning for the whole API — too costly to maintain parallel modules

## Pending work (don't assume exists)

### Previous session work
- CI pipeline (no GitHub Actions yet)
- JWT/session guards on REST/GraphQL (currently unprotected)
- Wizard submit not wired to API
- React Native has only scaffolding
- `packages/api-client` has limited helpers

### Current session (May 24 2026) — batch 1 (API-driven expectations + blocker system)
- Per-page prompt/JSON template support with `PageDefinition` and provider routing
- Blocker/warning constant-code system with stage-level catalogs (CONTRACT: 42 entries, DISCLOSURES: 21+ entries)
- 3-phase validation (per-form → cross-form → stage-level)
- Backward-compat fix: `resolveIssues()` pushes fail/warning `ComplianceCheck` entries into `checks` array
- **STAGE_FORM_EXPECTATIONS made API-driven** — `StageValidator.validate()` accepts optional `formExpectations` param; threaded through pipeline (`PipelineOptions`) and API service (`PageRoutingPipelineService.process()`); defaults remain in `registry.ts` for backward compat
- Added eslint configs for `@tc/shared` and `@tc/api-client` packages
- Fixed `@tc/config` tsconfig extends paths to resolve correctly from node_modules symlinks
- Added `passWithNoTests` to API, web, and mobile Jest configs

### Current session (May 24 2026) — batch 2 (SCO/BCO counter-offer form extraction + validation)
- Added SCO `FormDefinition` (`sco.standard.v12-24.ts`) — JSON template + system/user prompts for 2-page C.A.R. Seller Counter Offer form extraction
- Registered SCO in `FORM_REGISTRY` with shorthand and pinned version keys; BCO/SMCO/BMCO aliases all point to same shared schema
- Added 7 SCO per-form data quality warnings (WARN-SCO-35001..35007) — property address, offeror/acceptor names, offer reference, offeror signature, acceptor signature, expiration
- Added stage-level rule `validateCounterOfferExpected()` — if RPA `seller_acceptance.accepted_subject_to_counter_offer === true`, validates a counter offer form (SCO/BCO/SMCO/BMCO/COP/COUNTER) is present (`WARN-RPA-2001`)
- SCO per-form validator also applies to BCO, SMCO, BMCO variants (same role-neutral schema shape — `section_4_offer`/`section_5_acceptance`, offeror/acceptor fields)
- 6 new unit tests covering: well-formed SCO, empty SCO warnings, BCO variant, missing counter offer warning, SCO present passes, no-counter-offer-flag skips

### Current session (May 24 2026) — batch 3 (DISCLOSURES validators + comparison module)
- Added **TDS per-form validator** (`validateTdsExtraction()`) — validates property address, seller signatures (WARN-TDS-10001, WARN-TDS-10002)
- Added **SPQ per-form validator** (`validateSpqExtraction()`) — validates property address, seller/buyer signatures (WARN-SPQ-15001, WARN-SPQ-15002, WARN-SPQ-15003)
- Added **NHD per-form validator** (`validateNhdExtraction()`) — validates property address (WARN-NHD-20001)
- Added **AD cross-form validators** (`validateCrossForm()`) — compares property address, city, county across RPA-TDS-SPQ-NHD (WARN-CROSS-*)
- Added **16 new DISCLOSURES catalog entries** to `disclosures.blocker-catalog.ts`:
  - 3 TDS blockers (BLOCKER-TDS-*) for missing required fields
  - 8 TDS warnings (WARN-TDS-10001..10008)
  - 5 SPQ warnings (WARN-SPQ-15001..15005)
  - 1 NHD warning (WARN-NHD-20001)
  - 2 cross-form warnings (WARN-CROSS-*)
- Added **form criticality system**: `FormCriticality` type (`'critical'` | `'routine'`), `criticality` field on `FormDefinition`
- Updated 7 key forms with `criticality: 'critical'`: RPA, AD, SCO, TDS, SPQ, AVID, BIA
- Added **form comparison module** (`comparison/`):
  - `compareRpaExtractions()` with configurable thresholds (purchase price, COE days, contingencies)
  - `compareScoExtractions()` for counter offer forms
  - `ChangeSeverity`, `FieldChange`, `FormComparisonResult` types
  - `DEFAULT_RPA_MATERIAL_CONFIG`: $1000 price threshold, 3 days COE/contingency threshold
  - 13 new unit tests in `comparison.test.ts` (no changes, material vs minor, field-specific comparisons)
- All builds, typechecks, lint, and tests pass

### Current session (May 24 2026) — batch 4 (API versioning & re-upload handling)
- Integrated comparison functions into `runUploadAndExtract()` in `document-extraction.controller.ts`
- Added **existing document detection**: `findExistingDocumentByFormCode()` helper finds active documents with matching `detectedFormCode` in same `transactionId + stage`
- Added **comparison dispatch**: `compareExtractions()` routes to appropriate comparer based on form code (RPA → `compareRpaExtractions`, SCO/BCO/SMCO/BMCO → `compareScoExtractions`)
- Added **version action logic**:
  - `critical` form + material changes → `versionAction: 'void_suggested'`
  - Any changes (minor) or non-critical forms → `versionAction: 'superseded'`
  - No previous version → `versionAction: 'none'`
- Uses existing `createNewVersion()` from `TransactionDocumentsService` (marks old as `SUPERSEDED`, increments `versionNo`, links via `previousVersionId`)
- Extended `UploadAndExtractResult` interface with new fields:
  - `hasPreviousVersion: boolean`
  - `previousVersionId: string | null`
  - `versionNo: number`
  - `versionComparison: FormComparisonResult | null`
  - `versionAction: 'none' | 'superseded' | 'void_suggested'`
- Stores `versionComparison` in document's `metadataJson` for audit trail

### Current session (May 24 2026) — batch 5 (multi-stage PDF filtering)
- Enhanced `UploadAndExtractResult` response for explicit stage mismatch handling:
  - Added `submittedStage: string` — the stage the user uploaded the document to
  - Added `detectedFormCode: string | null` — the CAR form code that was detected (e.g. 'RPA', 'TDS')
  - Already had `resolvedStage: string` — the stage where the document was actually stored
  - Already had `reclassified: boolean` — whether the document was automatically moved to a different stage
- This enables UI to:
  - Show user: "You uploaded a TDS to the CONTRACT tab — we moved it to DISCLOSURES"
  - Ask for confirmation before auto-moving if needed in future
- Existing auto-reclassification logic: form code → form category → stage mapping (via `resolveStageFromFormCode()`)

### Current session (May 25 2026) — batch 6 (auth guards, roles, enrollment flow + audit log)
- Added `UserRole` enum (`user` | `support_admin`) and `role` column on `users` (default `'user'`)
- Added `OrgStatus` enum (`pending_approval` | `active` | `inactive` | `suspended`) replacing plain string on `real_estate_organizations`
- Added `MembershipStatus` enum (`pending` | `active` | `rejected`) and `status` column on `organization_memberships` (default `'active'`)
- Created `AuditLogEntity` (append-only table `audit_logs`) with `AuditLogService`; indexes on `(accountId, createdAt)`, `(action, createdAt)`, `(targetType, targetId)`
- Updated shared DTOs: `UserDto.role`, `OrganizationDto.status → OrgStatus`, `OrganizationMembershipDto.status`
- Migration `1749000000000-AddAuthAndOrgMembershipEnums` for all 3 schema changes + audit_logs table creation
- Fixed column type mismatch (`varchar→uuid`) in `1748000000000-AddFormTemplateIdToTransactions` migration

### Current session (May 25 2026) — batch 7 (auth guards, enrollment flows, admin UI, web role display)
- **Global auth guards**: `JwtAuthGuard` (respects `@Public()`) + `RolesGuard` registered via `APP_GUARD` in `AuthModule`. Only routes with `@Public()` are unauthenticated.
- **Decorators**: `@Public()`, `@Roles(...)` on `apps/api/src/modules/auth/decorators/`. `@Public()` applied to auth/register, login, verify-email, admin pages, webhooks, dev controller.
- **JWT payload**: Now includes `role` in token payload. `JwtStrategy` returns `{ userId, email, role }`. `login()` returns `user.role`, updates `lastLoginAt`.
- **Broker registration** (`POST /auth/register-broker`): Creates user (PENDING) + account + org (PENDING_APPROVAL) + BROKER_ADMIN membership. Audit log `ORG_CREATED`.
- **Agent join flow** (`POST /auth/join-brokerage`): Resolves account from userId, creates PENDING membership, audit log.
- **Invite member** (`POST /auth/invite-member`): Creates user/account if new or finds existing, creates PENDING membership, audit log.
- **Org search** (`GET /organizations/search?q=`): Searches ACTIVE orgs by name/city/state via `Like` query.
- **Membership approve/reject** (`PATCH /organization-memberships/:id/approve`, `/reject`): Updates membership status with audit logging.
- **Admin org approval** (`POST /admin/organizations/:id/approve`, `/reject`): Sets org status ACTIVE/INACTIVE with audit logging.
- **Admin service**: Real stats (user count, pending orgs), wired to Dashboard.
- **Admin templates**: Organizations list (with approve/reject buttons), Audit Logs table, updated Users table (role/status/verified), updated Dashboard (4 stat cards).
- **Admin CSS**: Custom styles at `public/css/admin.css` with status colors, buttons, sidebar layout.
- **Admin sidebar**: Links to Dashboard, Users, Organizations, Audit Logs.
- **Handlebars `eq` helper**: Registered in `main.ts` for template conditionals.
- **Web sidebar**: Admin Panel link (purple, only for `support_admin` role). Role badge in user footer.
- **Web DashboardShell**: Accepts `role` prop, passes to Sidebar.
- **MembershipsService**: Added `findOne()`, `updateStatus()` (sets `joinedAt` on activation).
- **OrganizationsService**: Added `search()`, `findByStatus()`, `updateStatus()`.
- **Seed lint fixes**: Removed unused imports (`UserRole`, `MembershipStatus`).
- `pnpm lint` (all packages), `pnpm test` (all packages), `pnpm --filter @tc/api typecheck` all pass. API builds and starts with all routes mapped.

### Current session (May 25 2026) — batch 8 (Playwright e2e tests — removed May 27 2026)
- Added Playwright e2e testing (14 tests, 2 projects, auth storage state)
- **Removed in batch 10** — tests no longer matched the UI after registration/role changes; cleanest path was removal since the test surface was small and would need rewrites

### Current session (May 27 2026) — batch 9 (multi-role, admin-provisioned brokerages, SSR registration, broker team management, TC assignment)
- **Multi-role system**: `UserEntity.role` varchar → `roles text[]` array column; `UserRole` enum expanded to `USER | AGENT | TRANSACTION_COORDINATOR | BROKER_ADMIN | SUPPORT_ADMIN`; JWT payload returns `roles: string[]` instead of `role: string`; `RolesGuard` uses intersection-based check
- **Migration**: `AddUserRolesArray1779947878846` (generated + applied on dev DB); seed re-run
- **Admin-provisioned brokerage**: `POST /admin/api/organizations` creates pending User + Account + Organization (ACTIVE) + Membership (broker_admin) + sends invite email via MailgunService.sendInviteEmail() with Handlebars HTML template
- **Admin Handlebars form**: `views/admin/organizations-create.hbs` with JS fetch; "Create Organization" button added to `organizations.hbs`; Admin module imports AuthModule for MailgunService
- **SSR registration pages**: `/register/agent` (AgentRegisterForm), `/register/coordinator` (CoordinatorRegisterForm), `/register/invite?token=xxx` (InviteRegisterForm) — all use `useActionState` with discriminated union form state (`{ status: 'success' } | { status: 'error', error: string }`)
- **Register landing page**: rewritten as role picker (Agent or TC); removed "Register as Broker" link from login page
- **Old files removed**: `/register/broker/` directory, `/register/RegisterForm.tsx`
- **Broker team management**: `/dashboard/team/members` page with MembersList client component; approve/reject/remove buttons for broker_admin; sidebar renamed "Team" → "Broker" section with "Team Members" + "Invite Member" links
- **Server actions**: `getOrgMembersAction`, `approveMembershipAction`, `rejectMembershipAction`, `removeMemberAction`, `searchCoordinatorsAction`, `assignCoordinatorAction`
- **TC search endpoint**: `GET /accounts/search-coordinators?q=` in AccountsController → AccountsService.searchCoordinators()
- **TC assignment**: `/dashboard/transactions/[id]/assign-coordinator` page with search + select + save; uses existing nullable FK `assignedCoordinatorAccountId`
- **Backward compat**: `UserDto.role` kept as `user.roles[0]`; login returns both `role` and `roles`
- All typecheck (`--noEmit`), lint (5/5 tasks), and test (all packages) green

### Current session (May 27 2026) — batch 10 (manual verification + bugfixes)
- **Fixed**: `assignedCoordinatorAccountId` missing `@Field(() => String, { nullable: true })` in `UpdateTransactionInput` — caused GraphQL schema crash on boot
- **Fixed**: admin seed user had `roles: ['user']` instead of `['user', 'support_admin']` — DB `UPDATE` applied directly; seed updated to auto-fix roles on re-seed
- **Fixed**: admin controller `POST /admin/api/organizations` set `roles: [BROKER_ADMIN]` without `USER` base role — changed to `[USER, BROKER_ADMIN]`
- **Fixed**: `registerWithInvite()` didn't add `USER` role — now ensures `USER` is always present
- **Verified**: API + Web servers boot cleanly
- **Verified**: Admin create org → invite → register → login (4-part flow works end-to-end)
- **Verified**: Agent self-registration (creates user with `[USER, AGENT]` roles)
- **Verified**: Coordinator self-registration (creates user with `[USER, TRANSACTION_COORDINATOR]` roles)
- **Verified**: Broker team management (org members list with role/status, TC search)
- **Verified**: TC assignment (search coordinators → select → save on transaction)
- **Verified**: Lint + tests pass with no regressions
- **Updated docs**: `AGENTS.md` (this entry), `docs/local-workspace-setup.md` (roles table, new testing sections 15.11-15.13), `docs/cloud-install-details.md` (roles table)

### Current session (May 28 2026) — batch 11 (paginated audit logs + sidebar role + bugfix)
- Added paginated audit logs admin endpoint (`GET /admin/api/audit-logs`) with page/limit/category/action/search params + `findAllPaginated()` in `AuditLogService`
- Added `USER_CATEGORY_ACTIONS` / `TRANSACTION_CATEGORY_ACTIONS` category constants on `AuditAction` enum
- Rewrote `/admin/audit-logs` page with URL-driven tabs (All/User Management/Transaction Management), pagination controls
- Added role label display under username in sidebar (gray, 11px, via `ROLE_LABELS` map)
- Fixed unused `closed` variable lint error in `dashboard/page.tsx:246`
- **Backlog**: audit-logs page errors on Vercel with digest `2364832736` — suspect `'use server'` action called from Server Component fails in production. Fixed by calling API directly with `cookies() + fetch()` in the page instead of through `getAdminAuditLogsAction` (server action). If the fix doesn't hold, investigate further: could be page chunk loading order, or Next.js server action serialization issue with optional object args

### Current session (May 29 2026) — batch 12 (Playwright E2E test framework with mock extractions)
- **Built full Playwright E2E test framework** at `apps/web/e2e/` — 20 test scenarios across 6 groups covering upload errors, compliance display, submission flow, wizard integrity, multi-form display, and roles/permissions
- **Architecture**: Uses `page.route()` to intercept API responses at the browser level — no LLM calls, no DB writes, deterministic and CI-safe. API already had `mockExtractions` support which was discovered; the existing infrastructure was leveraged directly.
- **Created infrastructure**: `playwright.config.ts` (auth-setup + chrome projects), `auth.setup.ts` (login via UI as `alice@tcco.com`), `helpers/constants.ts`, `helpers/api-intercepts.ts` (route fulfillment helpers), `helpers/mock-data.ts` (extraction data builders + response constructors)
- **Page Objects**: `LoginPage`, `ContractUploadPage`, `ContractReviewPage` — encapsulates locators, reusable across all scenarios
- **Test groups**:
  - `01-upload-errors` (3 tests): non-RPA doc → 422 UI error, duplicate → 409 UI error, disabled button with no files
  - `02-compliance` (4 tests): valid RPA → compliant, missing price → blocker, missing signatures → warnings, counter-offer → warning
  - `03-submission` (3 tests): happy path submit, submit-with-warnings, submit error state
  - `04-wizard-integrity` (3 tests): 5-step navigation, party data visible, back to upload
  - `05-multi-form` (2 tests): dashboard shows forms `✓`/`○` icons after upload
  - `06-roles-permissions` (3 tests): unauthenticated redirect, dashboard accessible, sidebar user info
- **Test numbering**: Each scenario gets `NNNN0` with gaps of 10 for future insertion. Example: `010010`, `010020`. Groups numbered 01–99.
- **Fixtures**: 9 JSON snapshots copied from `packages/document-intelligence/test/fixtures/`, 1 minimal dummy PDF (232 bytes) for file uploads
- **Scripts**: `pnpm test:e2e`, `pnpm test:e2e:ui`, `pnpm test:e2e:debug` in web package
- **Convention**: Added `e2e/` to web `tsconfig.json` exclude list, `e2e/.auth/` to web `.gitignore`
- **Verified**: API typecheck ✅, web lint ✅, all unit tests pass (117/117), E2E test listing shows 19 tests in 7 files across 2 projects

### Current session (Jun 2 2026) — batch 13 (SCO/BCO test PDF generator)
- **Added SCO/BCO templates**: `SCO.pdf` (2-page seller counter offer), `BCO.pdf` (1-page buyer counter offer) dropped in `templates/`
- **Added SCO coordinate map** (`src/coordinates/sco.ts`): 2-page layout — header/parties/terms/expiration/offer on page 1, acceptance on page 2
- **Added BCO coordinate map** (`src/coordinates/bco.ts`): 1-page layout — all sections on single page (different from SCO despite shared schema)
- **Created `sco.valid.ts` fixture**: standalone seller counter offer data + scenario
- **Created `bco.valid.ts` fixture**: standalone buyer counter offer data + scenario
- **Expanded `rpa.counter-offer.ts`**: now generates 5 forms per run — `RPA.pdf`, `SCO-1.pdf`, `BCO-1.pdf`, `SCO-2.pdf`, `BCO-2.pdf` — forming a realistic multi-round counter-offer chain (RPA → SCO-1 → BCO-1 → SCO-2 → BCO-2) with `offer_reference` linking each round
- **Decoupled RPA data**: `rpa.counter-offer.ts` no longer imports from `rpa.valid.ts` — has its own standalone `rpaCounterOfferData` object to prevent cross-fixture conflicts
- **Cleaned blue text**: Removed gray/blue placeholder text from `RPA.pdf` template using PyMuPDF redaction → saved as `RPA-revised.pdf`
- **RPA coordinate updates**: Added broker/agent checkbox fields, page 1-4 initials fields, buyer agent checkbox coordinates
- **Updated test**: 8 tests total (added multi-form counter-offer, standalone SCO, standalone BCO)
- **Updated README**: scenarios table with all 6 fixtures, multi-row note
- All typecheck, lint, tests green

### Current session (Jun 2 2026) — batch 14 (test-pdf-generator restructuring + full template set)
- **State-aware architecture**: Added `state?: string` to `FormGeneration` type; state-aware `resolveTemplatePath(formCode, state)` and `getCoordinates(formCode, state)`; templates in `templates/ca/`, coordinates in `coordinates/ca/`
- **Template cleanup**: Moved all 8 templates into `templates/ca/` subdirectory. Added AD, AVID, BIA, TDS, SPQ templates (cleaned blue placeholder text via content stream replacement of `0 0 0.501961 rg`). Trimmed AD.pdf from 29-page zipForm bundle to standalone 2-page form
- **New form templates**: Added 14 additional C.A.R. form templates to `templates/ca/`: SBSA, PRBS, BCA, BHIA, CCPA, DIA, FHDA, MCA, QS, SA, SFLS, WCMD, WFDA, AS (all cleaned, with zipform-source backups)
- **Fixture restructuring**: Removed shared data constants — every scenario is fully self-contained with inline data. No standalone SCO/BCO scenarios (every scenario starts with RPA). Renamed to `CA-RPA-*` / `CA-disclosure-*` pattern
- **New stage scenarios**: `CA-RPA-contract-standard` (RPA + AD + AVID + BIA), `CA-disclosures-standard` (RPA + AD + AVID + BIA + TDS + SPQ), `CA-RPA-counter-offer` (RPA + AD + AVID + BIA + 2-round SCO/BCO chain)
- **Label fix**: Filename logic only adds numeric suffix when same formCode appears multiple times (not just when forms.length > 1)
- **Coordinate stubs**: Created stub coordinate files for AD, AVID, BIA, TDS, SPQ (placeholder x/y/w/h — need real positions filled in)
- 8 tests, all pass

### Current session (Jun 14 2026) — batch 15 (swimlane system message display)
- **Transaction Assistant track**: Added parallel system message track to the swimlane. System-generated messages (email alerts, scheduled jobs, background processes) appear on a dedicated "Transaction Assistant" row below the human conversation, with lettered sequence (A, B, C...) on a separate timeline track.
- **Three approaches documented for future reference** (current implementation = A):

  **A (current) — Dedicated "Transaction Assistant" Row**
  - Synthetic "Transaction Assistant" party added below all human parties
  - System messages (null `senderPartyId` + outbound, or `direction === 'internal'`) rendered on TA row
  - TA events use lettered sequence (A, B, C...) on a separate timeline track
  - Human events keep numeric sequence (1, 2, 3...) unchanged
  - TA→recipient edges: dashed vertical connectors from TA row up to recipient party lanes
  - TA cards: gray dashed border, muted styling, "TA" badge
  - Human/TA tracks separated by a visual divider

  **B — Recipient Row + System Badge**
  - System-outbound messages sit on the recipient party's row (not a separate TA row)
  - Styled gray/dashed with a "SYSTEM" badge
  - Internal events (no party) hidden from main swimlane
  - No dedicated row — less vertical space consumed

  **C — Hybrid (Recipient Row + Collapsible Log)**
  - Same as B for system-to-human messages
  - Internal system events in a collapsible "System Activity" section below the swimlane
  - Clean by default, expandable when needed

- Added `type: 'human' | 'system'` and `sequenceLabel: string` to `SwimlaneEvent`, `systemEvents` array to `SwimlaneData`
- Added `SwimlaneEdgeType` for distinguishing human-conversation vs TA-connector edges
- All existing swimlane rendering backward compatible

### Current session (Jun 16 2026) — batch 16 (DB-backed extraction job store)
- **Problem**: `ExtractionJobStore` was in-memory (`Map<string, ExtractionJob>`). Fly dev has 2 machines due to `auto_stop_machines` — POST (create job) and SSE/GET (read job) could hit different machines → "Job not found" errors during upload.
- **Fix**: Rewrote `ExtractionJobStore` to persist jobs in PostgreSQL via `ExtractionJobEntity`:
  - New table `extraction_jobs` with columns: `id` (UUID PK), `status`, `progressJson`, `progressVersion`, `resultJson`, `draftResultJson`, `error`, `errorDetailsJson`, `createdAt`, `updatedAt`
  - Raw SQL queries for atomic `progressVersion` increment on `emit()`/`complete()`/`fail()`
  - 30-min TTL handled by filtering (no in-memory `setTimeout`)
- **SSE rewrite**: Both `streamDraftProgress` and `streamProgress` now poll the database every 1s instead of subscribing to an in-memory `ReplaySubject`. Compares `progressVersion` from DB to detect new events. Works across any number of Fly machines.
- **Files created**:
  - `apps/api/src/modules/document-extraction/entities/extraction-job.entity.ts` — TypeORM entity
  - `apps/api/src/database/migrations/1779947878848-CreateExtractionJobsTable.ts` — migration
- **Files modified**:
  - `apps/api/src/modules/document-extraction/extraction-job.store.ts` — Map → TypeORM
  - `apps/api/src/modules/document-extraction/document-extraction.controller.ts` — SSE polling, async store calls, fire-and-forget emit with `.catch()` logging
  - `apps/api/src/modules/document-extraction/document-extraction.module.ts` — added `TypeOrmModule.forFeature([ExtractionJobEntity])`
  - `apps/api/src/database/data-source.ts` — registered entity
- **Pre-existing**: 4 type errors in `main` (missing `@tc/document-intelligence` exports) — build `@tc/document-intelligence` before typechecking API

### Current session (Jul 12 2026) — batch 17 (per-form PDF splitting + S3 storage)
- **Problem**: Multi-form uploads (e.g. RPA + AD + AVID + BIA) stored the original multi-form PDF on all per-form document rows — no way to retrieve just one form's pages from S3.
- **Fix**: Split each source PDF into per-form PDFs and upload them separately to S3. Each derived document row now has its own `storageKey` pointing to a single-form PDF, plus provenance metadata.
- **New DB columns** on `transaction_documents`:
  - `sourceDocumentId` (varchar, FK → transaction_documents.id) — the original multi-form document this was split from
  - `sourcePageStart` (integer, 1-indexed) — first page of this form within the source
  - `sourcePageEnd` (integer, 1-indexed) — last page of this form within the source
  - `formCode` (varchar) — detected CAR form code (e.g. 'RPA', 'TDS', 'AD')
  - Partial indexes on `sourceDocumentId` and `formCode`
- **New utility**: `mergePageBuffers()` exported from `@tc/document-intelligence` (`packages/document-intelligence/src/splitter/pdf-merge.ts`)
- **extract-and-draft flow**: After S3 upload of original files, groups extractions by source file, splits each file once via `PdfSplitter`, builds per-form PDFs via `mergePageBuffers`, uploads each to S3, and creates per-form document rows with provenance fields
- **upload-and-extract flow**: After main document creation, runs the pipeline with `minPagesForExtraction: Infinity` (classify + group only, no LLM) to identify form groups within the single file. Builds per-form PDFs for each additional form group and creates derived document rows
- **`PageRoutingPipelineService.process()`**: Added `minPagesForExtraction` parameter (6th positional arg) to support identification-only pipeline runs
- **`TransactionDocumentsService.createDocumentWithMetadata()`**: Extended with optional `sourceDocumentId`, `sourcePageStart`, `sourcePageEnd`, `formCode` params
- **Files created**:
  - `packages/document-intelligence/src/splitter/pdf-merge.ts` — `mergePageBuffers()` utility
  - `apps/api/src/database/migrations/1783659718000001-AddFormProvenanceToDocuments.ts` — migration
- **Files modified**:
  - `packages/document-intelligence/src/index.ts` — exported `mergePageBuffers`
  - `apps/api/src/modules/transaction-documents/entities/transaction-document.entity.ts` — 4 new columns + self-referential FK
  - `apps/api/src/modules/transaction-documents/transaction-documents.service.ts` — extended `createDocumentWithMetadata` params
  - `apps/api/src/modules/document-extraction/document-extraction.controller.ts` — added `buildPerFormPdfs()` helper, rewired both extract-and-draft and upload-and-extract per-form doc creation
  - `apps/api/src/modules/document-extraction/page-routing-pipeline.service.ts` — added `minPagesForExtraction` parameter

### Current session (Jul 12 2026) — batch 18 (DocuSign eSignature API)
- **Removed**: DocuSeal module entirely (entity, service, controller, module, 2 migrations, email templates refs)
- **Added**: DocuSign eSignature API integration using JWT Grant OAuth 2.0 authentication
- **Authentication flow**: JWT signed with RSA private key → OAuth token endpoint → user info lookup for account_id/base_uri → REST API v2.1 calls
- **Envelope creation flow**: Load PDFs from S3 → build envelope with documents + recipients → POST to DocuSign REST API → send envelope (DocuSign handles email delivery)
- **Env vars**: `DOCUSIGN_INTEGRATION_KEY`, `DOCUSIGN_IMPERSONATED_USER_ID`, `DOCUSIGN_ACCOUNT_ID`, `DOCUSIGN_PRIVATE_KEY` (PEM or base64-encoded), `DOCUSIGN_AUTH_SERVER` (defaults to demo: `account-d.docusign.com`)
- **Statuses**: `created → sent → delivered → completed` (terminal: `declined`, `voided`)
- **Status sync**: `syncEnvelopeStatus()` / `syncAllForTransaction()` poll DocuSign REST API
- **API surface**: `POST /api/v1/docusign/envelopes` (create), `GET /api/v1/docusign/envelopes?transactionId=` (list), `GET /api/v1/docusign/envelopes/:id/sync`, `POST /api/v1/docusign/transactions/:txnId/sync`
- **New files**:
  - `apps/api/src/modules/docusign/docusign.module.ts`
  - `apps/api/src/modules/docusign/docusign.service.ts`
  - `apps/api/src/modules/docusign/docusign.controller.ts`
  - `apps/api/src/modules/docusign/entities/docusign-envelope.entity.ts`
  - `apps/api/src/database/migrations/1783659718000003-ReplaceDocuSealWithDocuSign.ts` — drops `docuseal_submissions`, creates `docusign_envelopes`
- **Modified files**:
  - `apps/api/src/app.module.ts` — replaced `DocuSealModule` with `DocuSignModule`
  - `apps/api/src/database/data-source.ts` — replaced `DocuSealSubmissionEntity` with `DocuSignEnvelopeEntity`
  - `apps/api/.env.local` / `.env.example` — replaced DocuSeal vars with DocuSign vars
  - `apps/web/.../SendViaDocuSignModal.tsx` — renamed from `SendViaDocuSealModal`, updated API endpoint to `/api/v1/docusign/envelopes`
  - `apps/web/.../DisclosuresDetailView.tsx` — replaced all DocuSeal branding/references with DocuSign
  - `apps/web/.../StagedSwimlane.tsx` — updated import path
- **Deleted files**: `apps/api/src/modules/docuseal/` (4 files), `1783659718000000-CreateDocuSealSubmissionsTable.ts`, `1783659718000002-AddMailgunTrackingToDocuSealSubmissions.ts`
- **Architecture**: DocuSign handles email delivery + signing workflow. JWT grant tokens auto-renew 5 min before expiry. RSA signing uses Node.js `crypto` (no external JWT library). Supports both inline PEM and base64-encoded private keys.
