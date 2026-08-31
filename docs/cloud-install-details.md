# TC Platform — Cloud Deployment Guide

Deploying the TC monorepo across three environments using a free cloud stack:
**Neon** (PostgreSQL) · **Fly.io** (NestJS API) · **Vercel** (Next.js web)

---

## Table of Contents

1. [Overview](#1-overview)
2. [Three-Environment Model](#2-three-environment-model)
3. [Prerequisites](#3-prerequisites)
4. [Environment Configuration Files](#4-environment-configuration-files)
   - 4.1 [API env files](#41-api-env-files)
   - 4.2 [Web env files](#42-web-env-files)
   - 4.3 [How APP_ENV works](#43-how-app_env-works)
5. [Neon — PostgreSQL Database](#5-neon--postgresql-database)
   - 5.1 [Create two Neon projects](#51-create-two-neon-projects)
   - 5.2 [Run migrations](#52-run-migrations)
   - 5.3 [Run seeds](#53-run-seeds)
   - 5.4 [Re-seeding or wiping a Neon database](#54-re-seeding-or-wiping-a-neon-database)
6. [Fly.io — NestJS API](#6-flyio--nestjs-api)
   - 6.1 [Install Fly CLI and log in](#61-install-fly-cli-and-log-in)
   - 6.2 [Create the apps](#62-create-the-apps)
   - 6.3 [Set secrets](#63-set-secrets)
   - 6.4 [Deploy to dev](#64-deploy-to-dev)
   - 6.5 [Deploy to production](#65-deploy-to-production)
   - 6.6 [Verify the API](#66-verify-the-api)
7. [Vercel — Next.js Web](#7-vercel--nextjs-web)
   - 7.1 [Push to GitHub](#71-push-to-github)
   - 7.2 [Create Vercel projects](#72-create-vercel-projects)
   - 7.3 [Configure environment variables](#73-configure-environment-variables)
   - 7.4 [Deploy](#74-deploy)
8. [Wire Everything Together](#8-wire-everything-together)
9. [Startup Configuration Reference](#9-startup-configuration-reference)
   - 9.1 [Local startup](#91-local-startup)
   - 9.2 [Dev startup](#92-dev-startup)
   - 9.3 [Production startup](#93-production-startup)
10. [Redeploying After Changes](#10-redeploying-after-changes)
11. [Free Tier Limits](#11-free-tier-limits)
12. [Mailgun — Email Configuration](#12-mailgun--email-configuration)
    - 12.1 [How Mailgun is used](#121-how-mailgun-is-used)
    - 12.2 [Local testing with sandbox domain](#122-local-testing-with-sandbox-domain)
    - 12.3 [Dev and production sending domain](#123-dev-and-production-sending-domain)
13. [Upstash Redis — Job Queue](#13-upstash-redis--job-queue)
    - 13.1 [What it is used for](#131-what-it-is-used-for)
    - 13.2 [Create an Upstash database](#132-create-an-upstash-database)
    - 13.3 [Configure the REDIS_URL](#133-configure-the-redis_url)
    - 13.4 [Set secrets on Fly.io](#134-set-secrets-on-flyio)
    - 13.5 [Free tier limits](#135-free-tier-limits)
14. [AWS S3 — Document Storage](#14-aws-s3--document-storage)
    - 14.1 [What it is used for](#141-what-it-is-used-for)
    - 14.2 [Create an S3 bucket and IAM user](#142-create-an-s3-bucket-and-iam-user)
    - 14.3 [Required environment variables](#143-required-environment-variables)
    - 14.4 [Set secrets on Fly.io](#144-set-secrets-on-flyio)
15. [Troubleshooting](#15-troubleshooting)

---

## 1. Overview

```
Browser
  │
  ▼
Vercel (Next.js)          apps/web         → https://tc-app-dev.vercel.app (dev) / https://tc-app.vercel.app (prod)
  │  server-side API calls via NEXT_PUBLIC_API_URL
  ▼
Fly.io  (NestJS API)      apps/api         → https://tc-api.fly.dev
  │  TypeORM + SSL
  ▼
Neon    (PostgreSQL 16)   managed DB       → ep-xxx.neon.tech:5432
```

All three services have free tiers sufficient for a small team doing QA:

| Service | What it hosts | Free limit |
|---------|--------------|------------|
| Neon | PostgreSQL 16 | 0.5 GB storage, always on |
| Fly.io | NestJS API (Docker container) | 3 shared VMs, 256 MB RAM, no cold starts |
| Vercel | Next.js (Hobby tier) | Unlimited deployments, 100 GB bandwidth/month |

---

## 2. Three-Environment Model

| | **local** | **dev** | **production** |
|---|---|---|---|
| Purpose | Individual dev, day-to-day coding | Shared team QA and verification | Live system |
| Database | Docker PostgreSQL (localhost:5432) | Neon — dev project | Neon — production project |
| API | localhost:3000 | tc-api-dev.fly.dev | tc-api.fly.dev |
| Web | localhost:3001 | tc-app-dev.vercel.app | tc-app.vercel.app |
| Fly config | — | `fly.dev.toml` | `fly.toml` |
| Env file loaded | `.env.local` | `.env.dev` | `.env.production` (overridden by Fly secrets in cloud) |
| `APP_ENV` value | `local` (default) | `dev` | `production` |
| `NODE_ENV` value | `development` | `production` | `production` |

**Key rule**: Neon has two separate projects — one for dev, one for production. They never share data. Always run migrations against both after a schema change.

---

## 3. Prerequisites

### Tools

```bash
# Verify Node.js and pnpm
node --version    # must be >= 20
pnpm --version    # must be >= 9

# Fly CLI
brew install flyctl          # macOS
curl -L https://fly.io/install.sh | sh   # Linux / WSL

# Verify
fly version
```

### Accounts

Sign up with GitHub at each:
- **Neon** — https://neon.tech
- **Fly.io** — https://fly.io
- **Vercel** — https://vercel.com

### Log in

```bash
fly auth login    # opens browser
vercel login      # or use the Vercel dashboard throughout
```

---

## 4. Environment Configuration Files

### 4.1 API env files

Located in `apps/api/`. All are gitignored — never committed.

**`.env.local`** — local Docker dev (already filled in, works out of the box):
```
# ── Database (Docker) ─────────────────────────────────────────────────────────
DB_HOST=localhost
DB_PORT=5432
DB_USER=tc
DB_PASSWORD=tc_dev
DB_NAME=tc

# ── API ───────────────────────────────────────────────────────────────────────
PORT=3000
ALLOWED_ORIGINS=http://localhost:3001
API_BASE_URL=http://localhost:3000
JWT_SECRET=local-dev-secret-change-in-production

# ── LLM document extraction ───────────────────────────────────────────────────
# Providers: LLM_EXTRACTION_PROVIDER and LLM_REASONING_PROVIDER accept 'anthropic' or 'gemini'
# LLM_TEMPERATURE: 0 = deterministic, 1.0 = provider default. Defaults to 0 if unset.
ANTHROPIC_API_KEY=
GEMINI_API_KEY=
LLM_EXTRACTION_PROVIDER=anthropic
LLM_REASONING_PROVIDER=anthropic
LLM_TEMPERATURE=0

# ── Mailgun — inbound webhooks ────────────────────────────────────────────────
MAILGUN_WEBHOOK_SIGNING_KEY=local-dev-key

# ── Mailgun — outbound email ──────────────────────────────────────────────────
# Leave MAILGUN_API_KEY blank to skip sending (verification URL prints to API console)
MAILGUN_API_KEY=your-mailgun-api-key
MAILGUN_DOMAIN=sandboxXXX.mailgun.org
MAILGUN_FROM_EMAIL=noreply@sandboxXXX.mailgun.org
MAILGUN_API_URL=https://api.mailgun.net

# ── Web app ───────────────────────────────────────────────────────────────────
WEB_APP_URL=http://localhost:3001
CREATE_ACCT_EMAIL_NOTIFY_ENABLED=false

# ── Redis (Upstash) — Bull job queue for deadline reminders ───────────────────
# REDIS_URL=rediss://default:yourpassword@your-host.upstash.io:6379

# ── Reminder schedule ─────────────────────────────────────────────────────────
REMINDER_SCHEDULE=5m,2m,0m
REMINDER_CANCEL_CUTOFF_MINUTES=3

# ── AWS S3 — file storage ─────────────────────────────────────────────────────
# S3_ENDPOINT: override for S3-compatible services (MinIO, Cloudflare R2); leave blank for real AWS S3
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
S3_BUCKET_NAME=my-bucket
S3_REGION=us-east-1
# S3_ENDPOINT=
```

**`.env.dev`** — fill in after creating the Neon dev project:
```
# ── Database (Neon) ───────────────────────────────────────────────────────────
DATABASE_URL=postgresql://USER:PASSWORD@ep-xxx.region.aws.neon.tech/tc-db?sslmode=require

# ── API ───────────────────────────────────────────────────────────────────────
PORT=3000
ALLOWED_ORIGINS=https://tc-app-dev.vercel.app
API_BASE_URL=https://tc-api-dev.fly.dev
JWT_SECRET=dev-secret-change-me

# ── LLM document extraction ───────────────────────────────────────────────────
# Providers: LLM_EXTRACTION_PROVIDER and LLM_REASONING_PROVIDER accept 'anthropic' or 'gemini'
# LLM_TEMPERATURE: 0 = deterministic, 1.0 = provider default. Defaults to 0 if unset.
ANTHROPIC_API_KEY=
GEMINI_API_KEY=
LLM_EXTRACTION_PROVIDER=anthropic
LLM_REASONING_PROVIDER=anthropic
LLM_TEMPERATURE=0

# ── Mailgun — inbound webhooks ────────────────────────────────────────────────
MAILGUN_WEBHOOK_SIGNING_KEY=your-mailgun-signing-key

# ── Mailgun — outbound email ──────────────────────────────────────────────────
MAILGUN_API_KEY=your-mailgun-api-key
MAILGUN_DOMAIN=your-sending-domain.com
MAILGUN_FROM_EMAIL=noreply@your-sending-domain.com
MAILGUN_API_URL=https://api.mailgun.net

# ── Web app ───────────────────────────────────────────────────────────────────
WEB_APP_URL=https://tc-app-dev.vercel.app
CREATE_ACCT_EMAIL_NOTIFY_ENABLED=true

# ── Redis (Upstash) — Bull job queue for deadline reminders ───────────────────
# REDIS_URL=rediss://default:yourpassword@your-host.upstash.io:6379

# ── Reminder schedule ─────────────────────────────────────────────────────────
# REMINDER_SCHEDULE=7d,3d,0d
# REMINDER_CANCEL_CUTOFF_MINUTES=3

# ── AWS S3 — contract PDF storage ─────────────────────────────────────────────
# S3_ENDPOINT: override for S3-compatible services (MinIO, Cloudflare R2); leave blank for real AWS S3
AWS_ACCESS_KEY_ID=AKIAxxxxxxxxxxxxx
AWS_SECRET_ACCESS_KEY=your-secret-access-key
S3_BUCKET_NAME=tc-documents-dev
S3_REGION=us-east-1
# S3_ENDPOINT=
```

**`.env.production`** — fill in after creating the Neon production project.
Used only when running migrations locally against production. In Fly.io the actual
values come from `fly secrets set` and this file is never read at runtime.
```
# ── Database (Neon) ───────────────────────────────────────────────────────────
DATABASE_URL=postgresql://USER:PASSWORD@ep-xxx.region.aws.neon.tech/tc-db?sslmode=require

# ── API ───────────────────────────────────────────────────────────────────────
PORT=3000
ALLOWED_ORIGINS=https://your-app.vercel.app
API_BASE_URL=https://tc-api.fly.dev
JWT_SECRET=prod-secret-change-me

# ── LLM document extraction ───────────────────────────────────────────────────
# Providers: LLM_EXTRACTION_PROVIDER and LLM_REASONING_PROVIDER accept 'anthropic' or 'gemini'
# LLM_TEMPERATURE: 0 = deterministic, 1.0 = provider default. Defaults to 0 if unset.
ANTHROPIC_API_KEY=
GEMINI_API_KEY=
LLM_EXTRACTION_PROVIDER=anthropic
LLM_REASONING_PROVIDER=anthropic
LLM_TEMPERATURE=0

# ── Mailgun — inbound webhooks ────────────────────────────────────────────────
MAILGUN_WEBHOOK_SIGNING_KEY=your-mailgun-signing-key

# ── Mailgun — outbound email ──────────────────────────────────────────────────
MAILGUN_API_KEY=your-mailgun-api-key
MAILGUN_DOMAIN=your-sending-domain.com
MAILGUN_FROM_EMAIL=noreply@your-sending-domain.com
MAILGUN_API_URL=https://api.mailgun.net

# ── Web app ───────────────────────────────────────────────────────────────────
WEB_APP_URL=https://your-app.vercel.app
CREATE_ACCT_EMAIL_NOTIFY_ENABLED=true

# ── Redis (Upstash) — Bull job queue for deadline reminders ───────────────────
# REDIS_URL=rediss://default:yourpassword@your-host.upstash.io:6379

# ── Reminder schedule ─────────────────────────────────────────────────────────
# REMINDER_SCHEDULE=7d,3d,0d
# REMINDER_CANCEL_CUTOFF_MINUTES=3

# ── AWS S3 — contract PDF storage ─────────────────────────────────────────────
# S3_ENDPOINT: override for S3-compatible services (MinIO, Cloudflare R2); leave blank for real AWS S3
AWS_ACCESS_KEY_ID=AKIAxxxxxxxxxxxxx
AWS_SECRET_ACCESS_KEY=your-secret-access-key
S3_BUCKET_NAME=tc-documents-prod
S3_REGION=us-east-1
# S3_ENDPOINT=
```

### 4.2 Web env files

Located in `apps/web/`. Gitignored.

**`.env.local`** — local dev, loaded automatically by Next.js:
```
NEXT_PUBLIC_API_URL=http://localhost:3000
```

For **dev** and **production** web deployments, `NEXT_PUBLIC_API_URL` is set in the
Vercel dashboard per environment — no file needed.

### 4.3 How APP_ENV works

`APP_ENV` is the single switch that controls which `.env.*` file the API loads at startup.

```
APP_ENV=local       → loads apps/api/.env.local       (Docker DB, default)
APP_ENV=dev         → loads apps/api/.env.dev          (Neon dev DB)
APP_ENV=production  → loads apps/api/.env.production   (Neon prod DB)
```

`dotenv` never overrides variables already set in the process, so:
- When running locally with `pnpm dev`, `APP_ENV=local` is set automatically by the script.
- When running on Fly.io, `APP_ENV` and `DATABASE_URL` are already set as Fly secrets — the
  `.env.*` file is not present in the container and is silently skipped.

The env file is loaded in `src/env.ts`, which is the first import in both `main.ts` and
`data-source.ts`, ensuring it runs before any module-level code reads `process.env`.

---

## 5. Neon — PostgreSQL Database

### 5.1 Create two Neon projects

Create one project for dev and one for production. They are completely independent.

**Dev project:**
1. Sign in at https://neon.tech → **New Project**
2. Name: `tc-dev` · Database: `tc-db` · Region: match your Fly.io region (`us-west` for `sjc`)
3. Copy the connection string → paste into `apps/api/.env.dev` as `DATABASE_URL`

**Production project:**
1. **New Project** again
2. Name: `tc-production` · Database: `tc-db` · Region: same region
3. Copy the connection string → paste into `apps/api/.env.production` as `DATABASE_URL`

Connection string format:
```
postgresql://tc_db_owner:AbCdEf123@ep-cool-name-a1b2c3d4.us-east-2.aws.neon.tech/tc-db?sslmode=require
```

### 5.2 Run migrations

Run from the monorepo root. This creates all tables (currently 35 migrations covering ~20 tables).

```bash
# Dev Neon
pnpm --filter @tc/api migration:run:dev

# Production Neon
# First build the API so dist/database/data-source.js exists
pnpm --filter @tc/api build
pnpm --filter @tc/api migration:run:prod
```

Expected output:
```
query: CREATE TABLE "users" ...
query: CREATE TABLE "accounts" ...
...
All migrations have been run successfully.
```

### 5.3 Run seeds

Seeds are idempotent — safe to run multiple times. They populate 6 users (5 brokerage + 1
support admin), 4 organizations (2 active, 2 pending-approval), 5 memberships, 2 transactions,
9 parties, 10 email messages for the swimlane demo, and 20+ audit log entries covering
registration, login, org creation, membership, transaction lifecycle, and admin actions.

```bash
# Dev Neon
pnpm --filter @tc/api seed:dev

# Production — seed only if needed (usually leave prod data-free initially)
# No seed:prod script by design — run manually if required:
APP_ENV=production ts-node -r tsconfig-paths/register apps/api/src/database/seeds/seed.ts
```

Seeded login credentials (all passwords: `Password1!`):

| Email | Roles | Org Role | Login URL | Notes |
|-------|-------|----------|-----------|-------|
| alice.tc@sunsetrealty.com | `[USER, TRANSACTION_COORDINATOR]` | Transaction coordinator | `https://tc-app-dev.vercel.app/login` | |
| carol.agent@sunsetrealty.com | `[USER, AGENT]` | Agent | `https://tc-app-dev.vercel.app/login` | |
| sarah.broker@sunsetrealty.com | `[USER, BROKER_ADMIN]` | Broker admin | `https://tc-app-dev.vercel.app/login` | |
| bob.tc@sunsetrealty.com | `[USER, TRANSACTION_COORDINATOR]` | Transaction coordinator | `https://tc-app-dev.vercel.app/login` | |
| david.agent@sunsetrealty.com | `[USER, AGENT]` | Agent | `https://tc-app-dev.vercel.app/login` | |
| admin@tcplatform.com | `[SUPPORT_ADMIN]` | — | `https://tc-app-dev.vercel.app/admin-login` | Platform support admin — dark-themed admin login |

The `Roles` column shows the system-level roles (PostgreSQL `text[]` array). The `Org Role`
is their role within the brokerage. Only users with `SUPPORT_ADMIN` role can access admin endpoints.
For production, replace `tc-app-dev` with `tc-app` in the login URLs.

**Seeded organizations:**

| Name | Type | Status |
|------|------|--------|
| Sunset Realty Group | BROKERAGE | `active` |
| Pacific Title & Escrow | TITLE_COMPANY | `active` |
| Bayview Realty Partners | BROKERAGE | `pending_approval` |
| Desert Oasis Properties | BROKERAGE | `pending_approval` |

All memberships for pending-approval orgs have no members yet — a broker must register
and be approved to populate them.

### 5.4 Re-seeding or wiping a Neon database

```bash
# Option 1 — psql (install via brew install libpq)
psql "postgresql://..." -c "
TRUNCATE TABLE
  audit_logs, transaction_form_templates, transaction_form_template_items,
  transaction_messages, transaction_tasks, transaction_journals,
  transaction_parties, real_estate_transactions, contacts,
  organization_memberships, real_estate_organizations, accounts, users
RESTART IDENTITY CASCADE;
"

# Option 2 — Neon dashboard → Reset branch (wipes and re-initialises the DB)

# Then re-seed
pnpm --filter @tc/api seed:dev
```

---

## 6. Fly.io — NestJS API

### 6.1 Install Fly CLI and log in

```bash
brew install flyctl    # macOS
fly auth login         # opens browser
```

### 6.2 Create the apps

Two separate Fly apps — one per cloud environment. Run from the **repo root**.

```bash
# Dev app
fly apps create tc-api-dev

# Production app
fly apps create tc-api
```

If the name is taken, choose a unique variant (e.g. `tc-api-dev-yourname`) and update
the `app =` line in `fly.dev.toml` / `fly.toml` to match.

### 6.3 Set secrets

Secrets are encrypted environment variables stored in Fly's infrastructure. They are never
in the Docker image or the repo.

**Dev secrets:**
```bash
fly secrets set --app tc-api-dev \
  DATABASE_URL="postgresql://... (Neon dev connection string)" \
  APP_ENV="dev" \
  NODE_ENV="production" \
  ALLOWED_ORIGINS="https://your-app-dev.vercel.app" \
  API_BASE_URL="https://tc-api-dev.fly.dev" \
  JWT_SECRET="dev-jwt-secret-min-32-chars" \
  ANTHROPIC_API_KEY="sk-ant-..." \
  GEMINI_API_KEY="AIza..." \
  LLM_EXTRACTION_PROVIDER="anthropic" \
  LLM_REASONING_PROVIDER="anthropic" \
  LLM_TEMPERATURE="0" \
  MAILGUN_WEBHOOK_SIGNING_KEY="your-mailgun-webhook-signing-key" \
  MAILGUN_API_KEY="your-mailgun-api-key" \
  MAILGUN_DOMAIN="your-sending-domain.com" \
  MAILGUN_FROM_EMAIL="noreply@your-sending-domain.com" \
  MAILGUN_API_URL="https://api.mailgun.net" \
  WEB_APP_URL="https://your-app-dev.vercel.app" \
  CREATE_ACCT_EMAIL_NOTIFY_ENABLED="true" \
  REDIS_URL="rediss://default:yourpassword@your-host.upstash.io:6379" \
  REMINDER_SCHEDULE="7d,3d,0d" \
  REMINDER_CANCEL_CUTOFF_MINUTES="3" \
  AWS_ACCESS_KEY_ID="AKIAxxxxxxxxxxxxx" \
  AWS_SECRET_ACCESS_KEY="your-secret-access-key" \
  S3_BUCKET_NAME="tc-documents-dev" \
  S3_REGION="us-east-1"
```

**Production secrets:**
```bash
fly secrets set --app tc-api \
  DATABASE_URL="postgresql://... (Neon production connection string)" \
  APP_ENV="production" \
  NODE_ENV="production" \
  ALLOWED_ORIGINS="https://your-app.vercel.app" \
  API_BASE_URL="https://tc-api.fly.dev" \
  JWT_SECRET="prod-jwt-secret-min-32-chars-different-from-dev" \
  ANTHROPIC_API_KEY="sk-ant-..." \
  GEMINI_API_KEY="AIza..." \
  LLM_EXTRACTION_PROVIDER="anthropic" \
  LLM_REASONING_PROVIDER="anthropic" \
  LLM_TEMPERATURE="0" \
  MAILGUN_WEBHOOK_SIGNING_KEY="your-mailgun-webhook-signing-key" \
  MAILGUN_API_KEY="your-mailgun-api-key" \
  MAILGUN_DOMAIN="your-sending-domain.com" \
  MAILGUN_FROM_EMAIL="noreply@your-sending-domain.com" \
  MAILGUN_API_URL="https://api.mailgun.net" \
  WEB_APP_URL="https://your-app.vercel.app" \
  CREATE_ACCT_EMAIL_NOTIFY_ENABLED="true" \
  REDIS_URL="rediss://default:yourpassword@your-host.upstash.io:6379" \
  REMINDER_SCHEDULE="7d,3d,0d" \
  REMINDER_CANCEL_CUTOFF_MINUTES="3" \
  AWS_ACCESS_KEY_ID="AKIAxxxxxxxxxxxxx" \
  AWS_SECRET_ACCESS_KEY="your-secret-access-key" \
  S3_BUCKET_NAME="tc-documents-prod" \
  S3_REGION="us-east-1"
```

> You won't know the Vercel URLs yet. Temporarily set `ALLOWED_ORIGINS="*"` and `WEB_APP_URL` to a placeholder, then update both after completing Section 7.

**Secret variable reference:**

| Variable | Required | Purpose | Where to find it |
|---|---|---|---|
| `DATABASE_URL` | Yes | Neon PostgreSQL connection string | Neon Console → project → Connection Details |
| `APP_ENV` | Yes | Controls which `.env.*` file is loaded (set to `dev` or `production`) | Hardcoded per environment — never changes at runtime |
| `NODE_ENV` | Yes | Node.js environment mode — always `production` in cloud | Hardcoded — never changes at runtime |
| `ALLOWED_ORIGINS` | Yes | Comma-separated CORS origins (e.g. Vercel URLs). API also sets `credentials: true` so cookie-based JWT works cross-origin | Your Vercel deployment URL |
| `API_BASE_URL` | Yes | Base URL of the API itself — used for generating document download links | Your Fly.io URL |
| `JWT_SECRET` | Yes | Signs JWT access tokens — use a long random string | Generate via `openssl rand -hex 32` |
| `ANTHROPIC_API_KEY` | Depends on provider | Authenticates calls to the Claude API for PDF extraction | Anthropic Console → API Keys |
| `GEMINI_API_KEY` | Depends on provider | Authenticates calls to the Gemini API for PDF extraction | Google AI Studio → API Keys |
| `LLM_EXTRACTION_PROVIDER` | No | Extraction LLM provider (`anthropic` or `gemini`). Default: `anthropic` | Set per environment |
| `LLM_REASONING_PROVIDER` | No | Reasoning LLM provider (`anthropic` or `gemini`). Default: `anthropic` | Set per environment |
| `LLM_TEMPERATURE` | No | LLM temperature (0 = deterministic, 1.0 = provider default). Default: `0` | Set per environment |
| `MAILGUN_WEBHOOK_SIGNING_KEY` | Yes | Verifies inbound email webhooks | Mailgun dashboard → Send → Webhooks → Signing key |
| `MAILGUN_API_KEY` | When email enabled | Authenticates outbound email sending API calls | Mailgun dashboard → API Keys |
| `MAILGUN_DOMAIN` | When email enabled | The sending domain emails are sent from | Mailgun dashboard → Send → Sending Domains |
| `MAILGUN_FROM_EMAIL` | No | The `From:` address on outgoing emails | Must be `anything@{MAILGUN_DOMAIN}` |
| `MAILGUN_API_URL` | No | Mailgun API base URL | `https://api.mailgun.net` (US) or `https://api.eu.mailgun.net` (EU) |
| `WEB_APP_URL` | Yes | Base URL of the Next.js app — used to build email verification links | Your Vercel URL |
| `CREATE_ACCT_EMAIL_NOTIFY_ENABLED` | No | When `true`, sends verification emails on registration. Default: `false` | Set per environment |
| `REDIS_URL` | When reminders enabled | Upstash Redis connection URL for Bull job queue (deadline reminders) | Upstash Console → database → TCP connection string |
| `REMINDER_SCHEDULE` | No | Comma-separated reminder offsets (e.g. `7d,3d,0d`). Default: `7d,3d,0d` | Set per environment |
| `REMINDER_CANCEL_CUTOFF_MINUTES` | No | Minutes before a reminder fires within which cancellation is blocked. Default: `3` | Set per environment |
| `AWS_ACCESS_KEY_ID` | When S3 enabled | AWS IAM access key for S3 uploads | AWS Console → IAM → Users → your user → Security credentials |
| `AWS_SECRET_ACCESS_KEY` | When S3 enabled | AWS IAM secret key for S3 uploads | Same IAM page — copy at creation time, cannot be retrieved later |
| `S3_BUCKET_NAME` | When S3 enabled | S3 bucket that stores contract PDFs | The name you give the bucket when creating it (e.g. `tc-documents-dev`) |
| `S3_REGION` | When S3 enabled | AWS region where the bucket lives (e.g. `us-east-1`) | Must match the region selected when the bucket was created |
| `S3_ENDPOINT` | No | Override S3 endpoint URL — only needed for S3-compatible services (MinIO, Cloudflare R2) | Leave unset for real AWS S3 |

### 6.4 Deploy to dev

```bash
fly deploy --config fly.dev.toml
```

First deploy: 3–5 minutes (builds Docker image, uploads to Fly registry, starts VM).
Subsequent deploys: ~90 seconds due to layer caching.

```
--> Monitoring deployment
 1 desired, 1 placed, 1 healthy, 0 unhealthy
--> v1 deployed successfully
```

Dev API is live at: `https://tc-api-dev.fly.dev`

**Watch logs during and after deploy:**

```bash
fly logs --app tc-api-dev
```

Look for this line to confirm a clean startup:
```
NestJS application is running on: http://0.0.0.0:3000
```

If you see repeated restarts, the error above the restart line is the cause.

### 6.5 Deploy to production

```bash
fly deploy --config fly.toml
```

Production API is live at: `https://tc-api.fly.dev`

**Watch logs during and after deploy:**

```bash
fly logs --app tc-api
```

### 6.6 Verify the API

**Step 1 — Health check (no auth required):**

```bash
# Dev — expect {"message":"Unauthorized","statusCode":401}
curl https://tc-api-dev.fly.dev/api/v1/auth/me

# Production
curl https://tc-api.fly.dev/api/v1/auth/me
```

A `401` response confirms the app started and connected to the database. A `502` or timeout means the app is still crashing — check logs.

**Step 2 — Login to get a token:**

```bash
# Dev
curl -s -X POST https://tc-api-dev.fly.dev/api/v1/auth/login -H "Content-Type: application/json" -d '{"email":"alice.tc@sunsetrealty.com","password":"Password1!"}' | python3 -m json.tool

# Production
curl -s -X POST https://tc-api.fly.dev/api/v1/auth/login -H "Content-Type: application/json" -d '{"email":"alice.tc@sunsetrealty.com","password":"Password1!"}' | python3 -m json.tool
```

Copy the `accessToken` value from the response.

**Step 3 — Fetch data with the token:**

```bash
# List transactions (replace TOKEN with the accessToken from Step 2)
curl -s https://tc-api-dev.fly.dev/api/v1/transactions -H "Authorization: Bearer TOKEN" | python3 -m json.tool
```

Expect a JSON array of transactions from the seeded data.

**Tail logs:**

```bash
fly logs --app tc-api-dev    # dev
fly logs --app tc-api        # production
```

**Check deployment status:**

```bash
fly status --app tc-api-dev
fly status --app tc-api
```

---

## 7. Vercel — Next.js Web

### 7.1 Push to GitHub

```bash
git add .
git commit -m "Add deployment config"
git push origin main
```

### 7.2 Create Vercel projects

Create **two separate Vercel projects** — one per cloud environment.

1. Go to https://vercel.com/new → **Import Git Repository** → select your repo
2. Set **Root Directory** → `apps/web`
3. Framework Preset → **Next.js** (auto-detected)
4. Name the project `tc-app-dev` for dev and `tc-app` for production
5. Do **not** deploy yet — set environment variables first

### 7.3 Configure environment variables

In Vercel project settings → **Environment Variables**:

**Dev project (`tc-app-dev`):**

| Name | Value | Environment |
|------|-------|-------------|
| `NEXT_PUBLIC_API_URL` | `https://tc-api-dev.fly.dev` | Production, Preview, Development |

**Production project (`tc-app`):**

| Name | Value | Environment |
|------|-------|-------------|
| `NEXT_PUBLIC_API_URL` | `https://tc-api.fly.dev` | Production, Preview, Development |

### 7.4 Deploy

Click **Deploy** on each project. Vercel:
1. Pulls the repo
2. Runs `pnpm install` and `pnpm build` inside `apps/web`
3. Deploys to its global CDN

| Project | URL |
|---------|-----|
| Dev | `https://tc-app-dev.vercel.app` |
| Production | `https://tc-app.vercel.app` |

---

## 8. Wire Everything Together

> **Important:** The API's CORS config in `main.ts` now includes `credentials: true` and `allowedHeaders: ['Content-Type', 'Authorization']` to support cookie-based JWT auth from the web app. The `ALLOWED_ORIGINS` secret must match the Vercel URL exactly (no trailing slash).

### Update CORS on each Fly app

Now that you have the Vercel URLs, update `ALLOWED_ORIGINS` on both Fly apps:

```bash
# Dev
fly secrets set --app tc-api-dev \
  ALLOWED_ORIGINS="https://tc-app-dev.vercel.app"

# Production
fly secrets set --app tc-api \
  ALLOWED_ORIGINS="https://tc-app.vercel.app"
```

Each `secrets set` triggers an automatic rolling redeploy.

### Verify end-to-end for each environment

**Dev:**
1. Open `https://tc-app-dev.vercel.app`
2. Log in with `alice.tc@sunsetrealty.com` / `Password1!`
3. Dashboard shows 2 transactions from the dev Neon DB
4. Click **456 Maple Street** → swimlane with 10 email events

**Production:**
1. Open `https://tc-app.vercel.app`
2. Database is clean (no seed data unless you ran `seed:prod`)

---

## 9. Startup Configuration Reference

### 9.1 Local startup

Runs entirely on your machine using Docker for PostgreSQL.

```bash
# 1. Start PostgreSQL
docker compose up -d

# 2. Start all apps
pnpm dev
```

What happens under the hood:
- `pnpm dev` runs `turbo dev` which starts API, web, and mobile in parallel
- API script: `APP_ENV=local nest start --watch` → loads `.env.local` → connects to Docker DB
- Web script: `next dev` → reads `apps/web/.env.local` → `NEXT_PUBLIC_API_URL=http://localhost:3000`
- No cloud resources are touched

| Service | URL |
|---------|-----|
| API REST | http://localhost:3000/api/v1 |
| API GraphQL Playground | http://localhost:3000/graphql |
| Web app | http://localhost:3001 |
| Web app — Admin Login | http://localhost:3001/admin-login |
| Web app — Admin Panel | http://localhost:3001/admin |

DB setup (first time or after reset):
```bash
pnpm --filter @tc/api db:setup      # migrations + seed against Docker DB
```

### 9.2 Dev startup

Cloud environment for team QA. Services run in Fly.io and Vercel. The DB is on Neon.
There is no `pnpm dev` for this environment — it's always-on in the cloud.

**First-time setup:**
```bash
# 1. Fill in apps/api/.env.dev with the Neon dev connection string
# 2. Run migrations and seed
pnpm --filter @tc/api db:setup:dev

# 3. Deploy API to Fly.io
fly deploy --config fly.dev.toml

# 4. Web deploys automatically on git push to main (if Vercel is connected to GitHub)
```

**Share with your team:**
- URL: `https://tc-app-dev.vercel.app`
- Login: `alice.tc@sunsetrealty.com` / `Password1!`

**Redeploying after code changes:**
```bash
fly deploy --config fly.dev.toml   # API
git push origin main               # Web (auto-deploys via Vercel GitHub integration)
```

**Running migrations after a schema change:**
```bash
pnpm --filter @tc/api migration:run:dev
```

### 9.3 Production startup

Production is the live system. Deployments are manual and deliberate.

**First-time setup:**
```bash
# 1. Fill in apps/api/.env.production with the Neon production connection string
# 2. Build API and run migrations
pnpm --filter @tc/api build
pnpm --filter @tc/api migration:run:prod

# 3. Deploy API to Fly.io
fly deploy --config fly.toml

# 4. Deploy web via Vercel dashboard or:
vercel --prod
```

**Redeploying after code changes:**
```bash
fly deploy --config fly.toml   # API
vercel --prod                  # Web
```

**Running migrations after a schema change:**
```bash
# Always run against dev first and verify, then run against production
pnpm --filter @tc/api migration:run:dev    # verify on dev first
pnpm --filter @tc/api build               # ensure compiled JS is up to date
pnpm --filter @tc/api migration:run:prod  # run against production Neon
```

---

## 10. Redeploying After Changes

### Summary table

| Change | Local | Dev | Production |
|--------|-------|-----|------------|
| API code | `pnpm dev` restarts automatically | `fly deploy --config fly.dev.toml` | `fly deploy --config fly.toml` |
| Web code | `pnpm dev` hot-reloads | `git push` (auto-deploys) | `vercel --prod` |
| New migration | `pnpm --filter @tc/api db:setup` | `pnpm --filter @tc/api migration:run:dev` | build then `migration:run:prod` |
| Env var change | Edit `.env.local`, restart | `fly secrets set --app tc-api-dev` | `fly secrets set --app tc-api` |
| Document-intelligence prompts | `pnpm --filter @tc/document-intelligence build` then restart | `pnpm --filter @tc/document-intelligence build` then `fly deploy --config fly.dev.toml` | `pnpm --filter @tc/document-intelligence build` then `fly deploy --config fly.toml` |

### Adding a new migration

```bash
# 1. Modify an entity file in apps/api/src/modules/

# 2. Generate the migration (runs against local DB to diff)
pnpm --filter @tc/api migration:generate --name DescribeYourChange

# 3. Review the generated file in apps/api/src/database/migrations/

# 4. Apply locally
pnpm --filter @tc/api migration:run

# 5. Apply to dev
pnpm --filter @tc/api migration:run:dev

# 6. Apply to production (after verifying on dev)
pnpm --filter @tc/api build
pnpm --filter @tc/api migration:run:prod
```

---

### Document-intelligence package updates

The `@tc/document-intelligence` package (`packages/document-intelligence/`) owns PDF extraction, LLM form prompts, stage reasoning, compliance validation, and form comparison logic. It is linked to the API via TypeScript path mapping, not `package.json` dependencies.

To deploy prompt or validation changes:

```bash
# 1. Build the package (compiles to dist/)
pnpm --filter @tc/document-intelligence build

# 2. Re-deploy the API (it resolves @tc/document-intelligence from dist/)
fly deploy --config fly.dev.toml          # dev
fly deploy --config fly.toml              # production
```

Key subsystems:
- **Extractor** — per-form and per-page LLM extraction with Anthropic/Gemini
- **Identifier** — CAR form code detection from PDF pages
- **Reasoner** — cross-form LLM reasoning per transaction stage
- **Validator** — deterministic compliance rules with constant-code blocker/warning system
- **Comparison** — form version diffing and material change detection
- **Sequence** — form family grouping and cross-version resolution
- **Page converter** — PDF→PNG rendering for LLM vision analysis
- **Pipeline** — orchestrates extraction → reasoning → validation

The package has its own Vitest test suite. Run locally without any cloud dependencies:
```bash
pnpm --filter @tc/document-intelligence test:unit     # no API key needed
pnpm --filter @tc/document-intelligence test           # includes LLM-dependent tests
```

---

## 11. Free Tier Limits

### Neon (per project)
| Resource | Limit |
|----------|-------|
| Storage | 0.5 GB |
| Compute | 191.9 hours/month (auto-suspends after 5 min idle, resumes < 1 s) |
| Branches | 10 |
| Concurrent connections | 100 |

You have two projects (dev + production) — each has its own 0.5 GB and compute hours.

### Fly.io
| Resource | Limit |
|----------|-------|
| Shared VMs always free | 3 |
| RAM per VM | 256 MB |
| Outbound bandwidth | 100 GB/month |
| Cold starts | None — VMs are persistent |

`auto_stop_machines = "stop"` in both toml files stops the VM after ~15 min idle and
restarts on the next request (~2 second wake). Set `min_machines_running = 1` to keep
a VM always warm.

### Vercel Hobby
| Resource | Limit |
|----------|-------|
| Projects | Unlimited |
| Deployments | Unlimited |
| Bandwidth | 100 GB/month |
| Function timeout | 10 seconds |
| Team members | 1 login (Hobby is personal) |

For team access, share a single Vercel login or upgrade to Pro ($20/month).

### Upstash Redis (Free tier)
| Resource | Limit |
|----------|-------|
| Databases | 1 |
| Commands/day | 10,000 |
| Max data size | 256 MB |
| Max connection duration | 20 seconds (TCP) |
| Regions | 1 |

The 20-second TCP connection limit means the Bull worker will periodically get disconnected. The `stalledInterval: 300_000` setting tolerates this. No jobs are lost — Bull re-queues stalled jobs on reconnect. For production, upgrade to Upstash Pay-as-you-go ($0.20 per 100K commands).

---

## 12. Mailgun — Email Configuration

Mailgun is used for two distinct purposes that use **different credentials**:

| Purpose | Variable | Direction |
|---|---|---|
| Sending verification emails on registration | `MAILGUN_API_KEY` + `MAILGUN_DOMAIN` | Outbound — API → Mailgun |
| Receiving inbound emails routed to transactions | `MAILGUN_WEBHOOK_SIGNING_KEY` | Inbound — Mailgun → API webhook |

### 12.1 How Mailgun is used

**Outbound (registration emails):**
When a user registers, the API calls `POST https://api.mailgun.net/v3/{MAILGUN_DOMAIN}/messages` using `MAILGUN_API_KEY` to send a verification email. The email contains a link to `{WEB_APP_URL}/verify-email?token=...`. This is a simple outbound HTTP call — it works from localhost with no public URL required.

**Inbound (transaction email routing):**
Mailgun routes inbound emails addressed to `txn-{uuid}@mg.yourdomain.com` to the API webhook at `POST /webhooks/mailgun`. The webhook guard verifies the request using `MAILGUN_WEBHOOK_SIGNING_KEY`. This requires a public URL and only works in dev/production (not localhost without a tunnel).

### 12.2 Local testing with sandbox domain

Mailgun provides a free sandbox domain for testing outbound emails without a real domain. Sandbox emails can only be sent to pre-authorized recipient addresses.

**Setup (one time):**
1. Log into Mailgun → **Send** → **Sending Domains** → note your sandbox domain (e.g. `sandboxabc123.mailgun.org`)
2. Click the sandbox domain → **Authorized Recipients** → add your personal email → click the confirmation link Mailgun sends you
3. Copy your API key from Mailgun → **API Keys**

**Configure `apps/api/.env.local`:**
```
MAILGUN_API_KEY=your-mailgun-api-key
MAILGUN_DOMAIN=sandboxabc123.mailgun.org
MAILGUN_FROM_EMAIL=noreply@sandboxabc123.mailgun.org
MAILGUN_API_URL=https://api.mailgun.net
WEB_APP_URL=http://localhost:3001
```

**If MAILGUN_API_KEY is left blank**, the API skips sending and instead prints the verification URL to the console:
```
[MailgunService] Verification URL for user@example.com: http://localhost:3001/verify-email?token=abc123...
```
Copy and paste that URL into the browser to complete verification without any email.

### 12.3 Dev and production sending domain

For dev and production, use a real Mailgun sending domain so emails can be delivered to any address (not just sandbox-authorized ones).

**Setup (one time):**
1. Mailgun → **Send** → **Sending Domains** → **Add Domain**
2. Name it `mg.yourdomain.com` (a subdomain of a domain you own)
3. Follow the DNS setup steps Mailgun shows — add the TXT and MX records to your DNS provider
4. Wait for DNS verification (can take up to 24h, usually faster)

**Set secrets on Fly.io after the domain is verified:**
```bash
# Dev
fly secrets set --app tc-api-dev \
  MAILGUN_API_KEY="your-api-key" \
  MAILGUN_DOMAIN="mg.yourdomain.com" \
  MAILGUN_FROM_EMAIL="noreply@mg.yourdomain.com" \
  MAILGUN_API_URL="https://api.mailgun.net" \
  WEB_APP_URL="https://your-app-dev.vercel.app"

# Production
fly secrets set --app tc-api \
  MAILGUN_API_KEY="your-api-key" \
  MAILGUN_DOMAIN="mg.yourdomain.com" \
  MAILGUN_FROM_EMAIL="noreply@mg.yourdomain.com" \
  MAILGUN_API_URL="https://api.mailgun.net" \
  WEB_APP_URL="https://your-app.vercel.app"
```

> **EU accounts:** If your Mailgun account is in the EU region (dashboard URL contains `eu`), set `MAILGUN_API_URL=https://api.eu.mailgun.net` instead.

---

## 13. Upstash Redis — Job Queue

### 13.1 What it is used for

The TC platform uses **Bull** (`@nestjs/bull`) as a job queue to send deadline reminder emails. When a contract is submitted and transaction events are seeded, Bull schedules delayed jobs for each deadline (7 days, 3 days, and day-of). At the scheduled time, a Bull processor sends reminder emails to the buyer agent, seller agent, and any coordinators via Mailgun.

Bull requires a Redis backend to store the job queue. **Upstash** provides managed Redis with a TLS-enabled TCP endpoint compatible with Bull.

### 13.2 Create an Upstash database

You need **one Upstash database shared across dev and production** (each uses the same Redis instance; jobs are prefixed by transaction ID so there is no collision). Alternatively, create two separate databases for full isolation.

1. Sign up or log in at [console.upstash.com](https://console.upstash.com)
2. Click **Create Database**
3. Name: `tc-reminders` (or any name)
4. Type: **Regional** (not Global — simpler, lower latency for single-region Fly.io)
5. Region: match your Fly.io region (e.g. `us-east-1` for `iad`)
6. Click **Create**

### 13.3 Configure the REDIS_URL

After creating the database:

1. In the Upstash Console, open your database
2. Scroll to **Connect** → select **Redis CLI** tab → look for the **TCP** (not REST) connection string
3. Copy the connection string — it looks like:
   ```
   rediss://default:AbCdEf123@nice-rattler-12345.upstash.io:6379
   ```
   Note `rediss://` (double-s) — this means TLS is required. Do not use the `redis://` (single-s) variant.

**Add to local env:**
```
# apps/api/.env.local
REDIS_URL=rediss://default:yourpassword@your-host.upstash.io:6379
```

### 13.4 Set secrets on Fly.io

```bash
# Dev
fly secrets set --app tc-api-dev \
  REDIS_URL="rediss://default:yourpassword@your-host.upstash.io:6379"

# Production
fly secrets set --app tc-api \
  REDIS_URL="rediss://default:yourpassword@your-host.upstash.io:6379"
```

Each `secrets set` triggers an automatic rolling redeploy. After restart, confirm the queue connects:

```bash
fly logs --app tc-api-dev | grep -i "bull\|redis\|reminder"
```

You should see no Redis connection errors in the logs.

### 13.5 Free tier limits

See §11 Free Tier Limits → Upstash section. For a test deployment the free tier is sufficient. The main constraint is the 10,000 commands/day limit — each Bull job poll costs ~2 commands. At the default `guardInterval: 300s`, the worker polls ~288 times/day, using ~576 commands/day — well within the limit.

**To upgrade:** In the Upstash Console, select your database → **Upgrade** → choose Pay-as-you-go. No code or configuration changes are needed after upgrading.

---

## 14. AWS S3 — Document Storage

### 14.1 What it is used for

When a buyer agent uploads a contract PDF through the TC wizard, the API:

1. Extracts structured data from the PDF (AcroForm fields or LLM-based OCR)
2. Creates a draft transaction in the database
3. Uploads the PDF to **AWS S3** for persistent, secure storage

The S3 object key format is:

```
transactions/{transactionId}/contract/{filename}
```

The `storageKey` is saved on the `transaction_documents` row so the document can be retrieved or displayed later. S3 upload is fire-and-forget — it happens in the background after the draft is created so it never blocks the wizard from proceeding.

### 14.2 Create an S3 bucket and IAM user

You need **two separate buckets** (dev and production) to prevent accidental cross-environment access.

**Step 1 — Create the buckets:**

1. Sign in to the [AWS Console](https://console.aws.amazon.com) → **S3** → **Create bucket**
2. Bucket names: `tc-documents-dev` and `tc-documents-prod` (must be globally unique — append a suffix if taken)
3. Region: pick one close to your Fly.io region (e.g. `us-east-1` for `iad`, `us-west-2` for `sjc`)
4. **Block all public access** — leave all four checkboxes checked (documents must never be publicly accessible)
5. Versioning: off (the app tracks versions in the DB)
6. Click **Create bucket**

**Step 2 — Create an IAM user with least-privilege access:**

1. AWS Console → **IAM** → **Users** → **Create user**
2. Name: `tc-s3-app` (or any name)
3. Skip console access — this is a service account
4. **Permissions** → Attach policies directly → **Create inline policy**
5. Use this JSON policy (replace `tc-documents-dev` and `tc-documents-prod` with your actual bucket names):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::tc-documents-dev",
        "arn:aws:s3:::tc-documents-dev/*",
        "arn:aws:s3:::tc-documents-prod",
        "arn:aws:s3:::tc-documents-prod/*"
      ]
    }
  ]
}
```

6. Create the policy, then create the user
7. Go to the user → **Security credentials** → **Create access key** → Application running outside AWS
8. **Copy both the Access Key ID and Secret Access Key now** — the secret is shown only once

### 14.3 Required environment variables

| Variable | Example value | Description |
|---|---|---|
| `AWS_ACCESS_KEY_ID` | `AKIAxxxxxxxxxxxxx` | IAM access key ID |
| `AWS_SECRET_ACCESS_KEY` | `wJalrXUtnFEMI/K7MDENG/...` | IAM secret access key |
| `S3_BUCKET_NAME` | `tc-documents-dev` | Bucket name for this environment |
| `S3_REGION` | `us-east-1` | AWS region where the bucket lives |
| `S3_ENDPOINT` | *(leave unset)* | Override only for S3-compatible services (MinIO, Cloudflare R2) |

Add these to `apps/api/.env.local` for local development using the same IAM credentials (pointing to the dev bucket is fine for local testing):

```
AWS_ACCESS_KEY_ID=AKIAxxxxxxxxxxxxx
AWS_SECRET_ACCESS_KEY=your-secret-access-key
S3_BUCKET_NAME=tc-documents-dev
S3_REGION=us-east-1
```

### 14.4 Set secrets on Fly.io

```bash
# Dev
fly secrets set --app tc-api-dev \
  AWS_ACCESS_KEY_ID="AKIAxxxxxxxxxxxxx" \
  AWS_SECRET_ACCESS_KEY="your-secret-access-key" \
  S3_BUCKET_NAME="tc-documents-dev" \
  S3_REGION="us-east-1"

# Production
fly secrets set --app tc-api \
  AWS_ACCESS_KEY_ID="AKIAxxxxxxxxxxxxx" \
  AWS_SECRET_ACCESS_KEY="your-secret-access-key" \
  S3_BUCKET_NAME="tc-documents-prod" \
  S3_REGION="us-east-1"
```

Each `fly secrets set` triggers an automatic rolling redeploy. After the API restarts, upload a test contract through the wizard and confirm the file appears in the S3 console under `transactions/`.

> **Cost:** AWS S3 Standard is $0.023/GB/month and $0.005 per 1,000 PUT requests. For a small team doing QA, monthly cost is well under $1. S3 has no free tier for storage, but the AWS Free Tier includes 5 GB for the first 12 months.

---

## 15. Troubleshooting

### API unreachable (502 / timeout)

```bash
fly logs --app tc-api-dev    # dev
fly logs --app tc-api        # production
```

Common causes:
- `DATABASE_URL` secret missing or wrong — check Neon connection string includes `?sslmode=require`
- App name in `fly.toml` doesn't match the created app — run `fly apps list`
- Port mismatch — confirm `PORT=3000` secret is set and `internal_port = 3000` in toml

### Login works but no transactions on dashboard

- Check `NEXT_PUBLIC_API_URL` in Vercel — must not have a trailing slash
- Check `ALLOWED_ORIGINS` on Fly — must exactly match the Vercel URL
- Open browser DevTools → Network tab → look for CORS error on `/api/v1/transactions`

### `fly deploy` fails at Docker build

```bash
# Reproduce locally before pushing
docker build -f apps/api/Dockerfile -t tc-api-test .
```

### Neon SSL error in logs

The connection string must end with `?sslmode=require`. `data-source.ts` sets
`ssl: { rejectUnauthorized: false }` automatically when `DATABASE_URL` is present.
If you see `SSL SYSCALL error`, the connection string is missing the SSL parameter.

### Secrets not taking effect

After `fly secrets set`, Fly triggers an automatic redeploy. Wait for it to finish:
```bash
fly status --app tc-api-dev
```

### Vercel build fails — cannot find module

Vercel must know the Root Directory is `apps/web`. Check **Project Settings → General →
Root Directory** in the Vercel dashboard.
