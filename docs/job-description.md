# Job Description — Full-Stack Engineer, myTC

**Position:** Senior Full-Stack Software Engineer
**Stack:** TypeScript · NestJS · Next.js · React Native · PostgreSQL · AWS S3 · Docker
**Location:** Remote
**Reports to:** CTO

## About the product

myTC is a real-estate transaction coordination platform. Transaction Coordinators
manage the lifecycle of a home purchase — from initial RPA intake, through
document upload and compliance analysis, escrow/esign workflows, commission (CDA)
generation, to closing and final storage. External parties (buyer/seller agents,
brokers, escrow officers) interact through token-scoped upload-link pages; an
LLM-driven "document intelligence" engine extracts data from CAR-form PDFs,
splits multi-form uploads, detects form versions, and validates compliance
across stages.

## The role

Own features end-to-end across a Turborepo monorepo: NestJS REST/GraphQL API,
Next.js dashboard, React Native companion app, shared TypeScript packages, and a
document-intelligence pipeline. You will work with PDF parsing, LLM integration,
asynchronous job queues, email automation, e-signature APIs, and a strict
migration-first database workflow.

## Responsibilities

- Build and maintain backend modules (NestJS): transactions, document extraction,
  upload links, onboarding, CDA generation, reminders, audit logging.
- Maintain the document-intelligence engine: PDF form extraction, page splitting,
  LLM prompting (Anthropic/Gemini), per-page prompt routing, form comparison and
  material-change detection, compliance validation with a constant-code blocker
  system.
- Ship the Next.js App Router dashboard: Server Components, server actions,
  Tailwind v4, per-role UIs (TC, broker admin, support admin).
- Own the React Native (Expo) mobile app.
- Manage relational data with TypeORM entities + hand-written migrations — never
  `synchronize: true`.
- Integrate and monitor third parties: S3, Mailgun, DocuSign, LLM providers.
- Add and maintain automated tests (Jest, Vitest, Playwright E2E).
- Follow the repository's migration/seed, lint, typecheck, and test gates before
  committing; work on feature branches with PRs.

## Required skills

### Backend (NestJS / Node.js / TypeScript) — advanced

- 3+ years NestJS: modules, DI, guards, interceptors, `APP_GUARD`-registered
  global auth (JWT + role-based guards), `@Public()` route decoration.
- REST controllers and GraphQL resolvers/entities (`@ObjectType`, `@HideField`
  for sensitive columns).
- Background jobs: Bull + Redis queues with delayed jobs and DB-backed idempotency
  (jobId dedupe, status re-checks at fire time).
- Server-Sent Events (SSE) for progress streaming.
- Secure token-based flows (e.g. upload links): persist hashes, never raw tokens;
  regenerate-at-fire-time for reminder emails.

### Data layer — advanced

- PostgreSQL schema design across 20+ tables with shared `workflow_step_id` FK
  axes and append-only tables (audit logs, journals, AI interactions) that must
  never have update/delete paths.
- TypeORM entities, repositories, JSONB columns, partial indexes, varchar-backed
  enums.
- Hand-written TypeORM migrations (`migration:generate` + `migration:run`), with
  a "new entity = new migration" rule and migration-first discipline.

### Frontend (Next.js / React / TypeScript) — advanced

- App Router with Server Components by default and `'use client'` only for
  interactivity; `useActionState` + discriminated-union server-action forms.
- Tailwind CSS (v4), `cn()` helpers, lucide-react iconography.
- Client components calling the API only through `@tc/api-client` helpers
  (`apiFetch`, `gqlFetch`) — never raw `fetch`.

### Mobile (React Native / Expo) — intermediate

- Expo + React Navigation; `jest-expo` testing with `@testing-library/react-native`.

### Document intelligence / PDF — intermediate-to-advanced

- PDF parsing/generation (pdfjs-dist, pdf-lib, AcroForm extraction), page
  splitting/merging, coordinate-based field rendering onto form templates.
- Designing LLM extraction/reasoning prompts with per-page and per-provider
  routing; provider abstraction (Anthropic + Gemini).
- Defensive parsing: LLM output → typed JSON merge with "first non-null wins".

### DevOps / infrastructure — intermediate

- Docker + docker-compose local services (Postgres); environment-segmented
  `.env` loading (`APP_ENV` → `.env.local` / `.env.dev` / `.env.production`).
- Deploy on Fly.io (API) and Vercel (web); secrets injection, multi-machine-safe
  job stores (DB-backed, not in-memory).
- S3 object storage with server-side-proxied file serving (never presigned URLs
  to clients).

### Third-party integrations — intermediate

- Mailgun email + inbound webhook handling (HMAC verification, reply parsing,
  attachment form-code auto-detection).
- DocuSign eSignature (JWT grant OAuth, envelope creation, status sync).

### Testing — advanced

- Unit/integration specs: mock TypeORM repos via `getRepositoryToken`; in-memory
  SQLite integration tests.
- E2E: Playwright with API route interception / mock extraction fixtures, CI-safe
  and deterministic (no LLM or DB calls).
- Testing discipline: every package linted, typechecked, and green before commit.

### Soft skills

- Self-direction across a large monorepo; reads and respects AGENTS.md
  conventions, module layout, and verification gates.
- Documentation habits: diagrams (Mermaid), design notes, updated runbooks.
- Careful git hygiene: feature branches, focused commits, no direct pushes to
  main, no secret commits.

## Nice to have

- Real-estate domain knowledge (CAR forms: RPA, AD, TDS, SPQ, SCO/BCO).
- Playwright test-authoring with page objects and route fulfillment.
- Handlebars email templates; transactional email design.
- Mermaid/sequence-diagram documentation.

## Tools you'll use daily

`pnpm` (Turborepo workspace) · NestJS CLI · TypeORM CLI · Next.js · Expo ·
Jest · Vitest · Playwright · Bull/Redis · Docker · PostgreSQL · AWS S3 ·
Fly.io · Vercel · Anthropic + Gemini APIs · DocuSign · Mailgun · GitHub
