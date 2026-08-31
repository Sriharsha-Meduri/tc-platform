# TC — Claude Code Project Guide

Real estate transaction coordination platform. Turborepo monorepo with NestJS API, Next.js web, and React Native mobile.

For full product design, architecture decisions, and detailed subsystem docs see [`docs/design.md`](./docs/design.md).

---

## Starting a session

```bash
docker compose up -d                    # start PostgreSQL (required before anything else)
pnpm install                            # if dependencies changed
pnpm --filter @tc/api db:setup          # run migrations + seed (idempotent)
pnpm dev                                # start all three apps
```

Ports: API `3000` · Web `3001` · Expo `8081`

---

## Environments

Three environments controlled by the `APP_ENV` variable (`local` | `dev` | `production`).

| Environment | Database | API host | Web host |
|---|---|---|---|
| `local` | Docker PostgreSQL (`localhost:5432`) | `localhost:3000` | `localhost:3001` |
| `dev` | Neon dev project | `https://tc-api-dev.fly.dev` | Vercel preview |
| `production` | Neon production project | `https://tc-api.fly.dev` | Vercel production |

**Env files** (gitignored — never commit):
- `apps/api/.env.local` — Docker DB credentials + feature flags for local dev
- `apps/api/.env.dev` — `DATABASE_URL` for Neon dev
- `apps/api/.env.production` — `DATABASE_URL` for Neon production
- `apps/web/.env.local` — `NEXT_PUBLIC_API_URL=http://localhost:3000`

**Key feature flags:**

| Variable | local | dev | production | Effect |
|---|---|---|---|---|
| `CREATE_ACCT_EMAIL_NOTIFY_ENABLED` | `true` | `true` | `true` | When `false`, registration skips Mailgun and prints the verification URL to the API console |

`apps/api/src/env.ts` loads the correct file at startup based on `APP_ENV`. Imported as the **first line** of `main.ts` and `data-source.ts` — do not move it.

**Per-environment pnpm scripts:**

```bash
# Migrations
pnpm --filter @tc/api migration:run          # local
pnpm --filter @tc/api migration:run:dev      # dev (Neon)
pnpm --filter @tc/api migration:run:prod     # production (requires build first)

# Seeding
pnpm --filter @tc/api seed                   # local
pnpm --filter @tc/api seed:dev               # dev — never seed production
```

**Deploying:**

```bash
fly deploy --config fly.dev.toml             # deploy API to dev
fly deploy --config fly.toml                 # deploy API to production
# Web: Vercel auto-deploys on git push to main
```

---

## Codebase layout

```
apps/api/src/modules/       ← 15 NestJS domain modules (one per DB table group)
apps/api/src/database/
  migrations/               ← PostgreSQL migrations (timestamped filenames)
  seeds/data/               ← Idempotent seed files per entity
apps/api/views/             ← Handlebars admin UI templates
packages/shared/src/dtos/   ← Cross-app TypeScript DTOs
docs/design.md              ← Full product design, architecture, subsystem docs
database-model.md           ← 20-table DB schema reference
```

---

## The 15 domain modules

| Module folder | DB table(s) | Notes |
|---|---|---|
| `users` | `users` | Auth identity — email, passwordHash, status |
| `accounts` | `accounts` | User profile — 1:1 with users |
| `organizations` | `real_estate_organizations` + `organization_memberships` | Brokerages, title cos; membership has `access_scope` |
| `contacts` | `contacts` | Buyers, sellers, third parties (not platform users) |
| `transactions` | `real_estate_transactions` | Core record — single `stage` varchar (linear, no parallel phases) |
| `transaction-parties` | `transaction_parties` | 16 roles; `account_id` links to platform users; `delegated_by_party_id` self-ref |
| `transaction-journals` | `transaction_journals` | **Append-only** — no update/delete; `related_entity_id` soft FK |
| `transaction-messages` | `transaction_messages` | Email/SMS inbound + outbound; `workflow_step_id` scoping |
| `transaction-documents` | `transaction_documents` + `transaction_document_submissions` | Submission rounds + version chain via `previous_version_id` |
| `transaction-tasks` | `transaction_tasks` | Checklist; `depends_on_task_id` self-ref; `workflow_step_id` scoping |
| `transaction-events` | `transaction_events` | Milestone dates (closed enum); distinct from tasks |
| `ai-interactions` | `ai_interactions` | **Append-only** — LLM call log; `feature` identifies use case |
| `transaction-form-templates` | `transaction_form_templates` + `transaction_form_template_items` | 78 CAR forms in 14 categories; 7 pre-built packages |
| `transaction-workflow-templates` | `transaction_workflow_templates` + `transaction_workflow_template_steps` | Reusable templates by state/type/side |
| `transaction-access-grants` | `transaction_access_grants` | Explicit per-transaction grants for contractor TCs |

---

## Transaction stages

9 ordered stages stored as `stage` varchar on `real_estate_transactions`. **Single value — no parallel phases.**

```
INTAKE → CONTRACT → DISCLOSURES → INSPECTION → APPRAISAL → LOAN → ESCROW → CLOSING → POST_CLOSE
```

Stage advancement is currently manual. Automated promotion (when all workflow steps complete) is pending.

---

## Transaction tracking model — six tables

These six tables track progress, work, communications, and AI reasoning for every transaction. They are the core of the platform:

| Table | What it tracks | Key design point |
|---|---|---|
| `transaction_workflow_steps` | Ordered phase checklist; instantiated from a template at init | `step_key` stable for code logic; `workflow_step_id` is shared FK axis |
| `transaction_tasks` | Granular to-dos within a step | `depends_on_task_id` self-ref; only assignable to platform accounts |
| `transaction_events` | Milestone dates (inspection, closing, etc.) | Closed enum; distinct from tasks — events are dates, tasks are actions |
| `transaction_journals` | Immutable audit trail | Append-only; every operation writes here; `related_entity_id` soft FK |
| `transaction_messages` | Inbound/outbound email/SMS | Routed by `txn-{uuid}@txn.mytcapp.net`; `workflow_step_id` scoping |
| `ai_interactions` | LLM call log | Append-only; `feature` field identifies use case; pending pipeline wires these together |

**`workflow_step_id`** on tasks, documents, and messages is the primary axis for phase-level queries.

**TC is optional** — `assigned_coordinator_account_id` on the transaction is nullable. Agents can manage transactions without a coordinator.

See `docs/design.md` §6 for full interaction design and AI pipeline spec.

---

## Document submission and versioning

- `transaction_document_submissions` — one row per delivery round (submission 1, 2, 3…)
- `transaction_documents.previous_version_id` — self-referential FK forming a version chain
- `superseded` status — set automatically when a new version replaces the old one
- Active document set: `WHERE status NOT IN ('superseded', 'rejected')`

See `docs/design.md` §7 for full model.

---

## Access control — four modes (additive)

| Mode | Mechanism |
|---|---|
| Org-wide | `organization_memberships.access_scope = 'all_transactions'` |
| Party-based | `transaction_parties.account_id = account.id` |
| Grant-based | `transaction_access_grants` row (not revoked, not expired) |
| Hybrid | Any combination of the above |

See `docs/design.md` §12 for full resolution algorithm.

---

## Forms & documents quick reference

- **Generic documents** — `transaction_documents` table; free-form `documentType`, status lifecycle, `workflowStepId` scoping
- **CAR forms** — 78 California forms across 14 categories (purchase_agreement, disclosure, inspection_repair, finance, etc.); 7 pre-built packages keyed by state + transactionType + side
- **Form picker UI** — `apps/web/src/app/transactions/new/steps/Step2FormChecklist.tsx`
- **CAR form definitions** — `apps/api/src/modules/transaction-form-templates/metadata/car-forms.metadata.ts`

See `docs/design.md` §7 for full category list, form codes, and package details.

---

## Rules to follow

- **Never `synchronize: true`** in production or development TypeORM config — always use migration files
- **Never edit `src/schema.gql`** — it is auto-generated at startup
- **Append-only tables** (`transaction_journals`, `ai_interactions`): no update or delete service methods, no PATCH/DELETE endpoints, no `updatedAt` column
- **`@HideField()`** on all sensitive columns: `passwordHash`, `preferencesJson`, `storageKey`, `bodyHtml`, `promptText`, `toolCallsJson`
- **Enums stored as `varchar`** in the DB — use `{ type: 'varchar' }` on `@Column()`, not `enum: MyEnum`
- **New entity = new migration file** — even in local dev
- **New cross-app type = add to `packages/shared/src/dtos/index.ts`**
- Each module follows: `entities/` subfolder for entity, `dto/` subfolder for InputTypes, plus `*.service.ts`, `*.controller.ts`, `*.resolver.ts`, `*.module.ts`

---

## Database credentials (Docker)

| Setting | Value |
|---|---|
| Host | `localhost` |
| Port | `5432` |
| User | `tc` |
| Password | `tc_dev` |
| Database | `tc` |

---

## Seeded dev accounts

All passwords: `Password1!`

| Email | Role |
|---|---|
| `sarah.broker@sunsetrealty.com` | Broker admin |
| `alice.tc@sunsetrealty.com` | Transaction coordinator |
| `bob.tc@sunsetrealty.com` | Transaction coordinator |
| `carol.agent@sunsetrealty.com` | Agent |
| `david.agent@sunsetrealty.com` | Agent |

---

## Web app — current state

**UI stack:** Tailwind CSS v4 · lucide-react · clsx + tailwind-merge via `cn()` at `src/lib/utils.ts`. No Chakra UI / MUI — they conflict with Tailwind v4.

**Implemented pages:**

| Route | File(s) | Notes |
|---|---|---|
| `/login` | `app/login/page.tsx` + `LoginForm.tsx` | Email/password, sets `tc_token` httpOnly cookie |
| `/register` | `app/register/page.tsx` + `RegisterForm.tsx` | Full registration form; sends verification email |
| `/dashboard` | `app/dashboard/layout.tsx` + `page.tsx` + `DashboardShell.tsx` | Protected; stat cards + transaction list |
| `/dashboard/transactions/[id]` | `app/dashboard/transactions/[id]/page.tsx` + `TransactionSwimlane.tsx` | Swimlane view of parties × messages |
| `/transactions/new` | `app/transactions/new/page.tsx` + `WizardForm.tsx` + `steps/` | 2-step wizard: people & addresses → documents |

**Auth:** `src/middleware.ts` protects all routes except `/login`, `/register`, `/verify-email`. Session = `tc_token` httpOnly cookie validated against `GET /auth/me`.

**Dashboard layout:** `DashboardShell.tsx` wraps all `/dashboard/**` pages with `<Sidebar>`. Never put sidebar code in individual page files.

**Wizard submit:** currently logs to console — not yet wired to `POST /transactions`.

---

## Email & webhooks quick reference

- **Outbound:** Mailgun, domain `txn.mytcapp.net`, from `noreply@txn.mytcapp.net`
- **Inbound webhook:** `POST /webhooks/email/inbound` (outside `/api/v1`); HMAC-SHA256 auth; always returns 200
- **Transaction email address pattern:** `txn-{uuid}@txn.mytcapp.net`

See `docs/design.md` §9 for full integration design.

---

## PDF processing quick reference

- AcroForm PDFs → `pdf-lib` field extraction (no LLM cost)
- Scanned PDFs → Claude LLM extraction (`claude-sonnet-4-6`, prompt cached with `cache_control: ephemeral`)
- Compliance check → `RpaComplianceValidator` (deterministic, no LLM)
- Endpoints: `POST /api/v1/document-extraction/{extract|compliance-check|extract-and-draft}`

**JSONB storage (implemented):**
- `ai_interactions.metadata_json` → `{ extraction: ExtractionResult }` — parsed LLM result as JSONB
- `ai_interactions.response_text` → raw LLM JSON string (TEXT, for debug/replay)
- `transaction_documents.metadata_json` → `{ extraction, compliance, extractedAt, pdfSource, … }` — full compiled result
- `transaction_documents.ai_interaction_id` → FK back to the `ai_interactions` row (one-directional; append-only semantics preserved)
- TypeORM returns JSONB columns as native JS objects — no `JSON.parse()` needed

See `docs/design.md` §10 for full design.

---

## Pending work

**Core wiring:**
- [ ] Wire wizard submit to `POST /transactions` API endpoint
- [ ] JWT / session guard on all REST and GraphQL endpoints (currently unprotected)
- [ ] Automated stage advancement — promote `transaction.stage` when all workflow steps complete

**AI pipeline:**
- [ ] Email interpretation — call Claude after inbound email saved; write `email_interpretation` ai_interaction + journal entry
- [ ] Transaction summary — on-demand Claude call summarising current state
- [ ] Action suggestions — Claude suggests next steps based on workflow step + journal context
- [ ] Draft email — Claude generates outbound email draft to a party

**Infrastructure:**
- [ ] AWS Textract integration — third PDF extraction path for high-accuracy scans
- [ ] React Native mobile — scaffolding only, no real screens yet
- [ ] Admin UI pages for domain entities
- [ ] `packages/api-client` — REST and GraphQL helpers
- [ ] CI pipeline — no GitHub Actions yet

**Seller flow:**
- [ ] Seller-initiated transaction wizard — property details → parties → document selection → initiate (see `docs/design.md` §11)

---

## Developer guide

See `docs/local-workspace-setup.md` for full setup instructions, code examples, testing patterns, and conventions.
