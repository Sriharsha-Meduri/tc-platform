# TC — Local Workspace Setup & Developer Guide

> Complete guide for setting up the local development environment, understanding the project structure, and expanding each part of the codebase.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Repository Structure](#2-repository-structure)
3. [Prerequisites](#3-prerequisites)
4. [Environments](#4-environments)
   - 4.1 [Three-environment model](#41-three-environment-model)
   - 4.2 [Environment files](#42-environment-files)
   - 4.3 [Complete environment variable reference](#43-complete-environment-variable-reference)
   - 4.4 [How APP_ENV works](#44-how-app_env-works)
5. [Local Setup](#5-local-setup)
6. [Running the Apps](#6-running-the-apps)
7. [Shared Packages](#7-shared-packages)
8. [Expanding the NestJS API](#8-expanding-the-nestjs-api)
   - 8.1 [Adding a New Module (Business Logic)](#81-adding-a-new-module-business-logic)
   - 8.2 [Database — Adding a New Entity & Migration](#82-database--adding-a-new-entity--migration)
   - 8.3 [Expanding REST API Endpoints](#83-expanding-rest-api-endpoints)
   - 8.4 [Expanding the GraphQL API](#84-expanding-the-graphql-api)
9. [Expanding the Next.js Web App](#9-expanding-the-nextjs-web-app)
   - 9.1 [Adding a New Page](#91-adding-a-new-page)
   - 9.2 [Server Components vs Client Components](#92-server-components-vs-client-components)
   - 9.3 [Fetching API Data](#93-fetching-api-data)
   - 9.4 [Adding a New Route Group](#94-adding-a-new-route-group)
10. [Expanding the Admin UI](#10-expanding-the-admin-ui)
    - 10.1 [Adding a New Admin Page](#101-adding-a-new-admin-page)
    - 10.2 [Adding Interactivity with HTMX](#102-adding-interactivity-with-htmx)
    - 10.3 [Updating the Sidebar Navigation](#103-updating-the-sidebar-navigation)
11. [Expanding the React Native App](#11-expanding-the-react-native-app)
    - 11.1 [Adding a New Screen](#111-adding-a-new-screen)
    - 11.2 [Adding a New Navigation Stack](#112-adding-a-new-navigation-stack)
    - 11.3 [Consuming the API](#113-consuming-the-api)
    - 11.4 [Shared UI Components](#114-shared-ui-components)
12. [Database Reference](#12-database-reference)
    - 12.0 [Domain Model Overview](#120-domain-model-overview)
    - 12.1 [Migration Commands](#121-migration-commands)
    - 12.2 [Seeding](#122-seeding)
    - 12.3 [Deploying to Cloud Environments](#123-deploying-to-cloud-environments)
13. [Ports & URLs](#13-ports--urls)
14. [Conventions & Rules](#14-conventions--rules)
15. [Functional Testing — API Flows](#15-functional-testing--api-flows)
    - 15.1 [User Registration & Login](#151-user-registration--login)
    - 15.2 [Contract Upload & Draft Transaction](#152-contract-upload--draft-transaction)
    - 15.3 [Compliance Check](#153-compliance-check)
    - 15.4 [Wizard Flow (Web UI)](#154-wizard-flow-web-ui)
    - 15.5 [Contract Submission](#155-contract-submission)
    - 15.6 [Document Re-upload (Versioning)](#156-document-re-upload-versioning)
    - 15.7 [Transaction Lifecycle](#157-transaction-lifecycle)
    - 15.8 [Page-Routed Extraction Pipeline](#158-page-routed-extraction-pipeline)
    - 15.9 [Send Upload Link](#159-send-upload-link-email-invite)
     - 15.10 [Support Admin Access](#1510-support-admin-access)
 16. [Document Intelligence Package](#16-document-intelligence-package)
     - 16.1 [Subsystems overview](#161-subsystems-overview)
     - 16.2 [Deploying prompt changes](#162-deploying-prompt-changes)
 17. [Unit Testing](#17-unit-testing)
    - 17.1 [Test Stack Overview](#171-test-stack-overview)
    - 17.2 [Running Tests](#172-running-tests)
    - 17.3 [NestJS — Testing Services](#173-nestjs--testing-services)
    - 17.4 [NestJS — Testing Controllers](#174-nestjs--testing-controllers)
    - 17.5 [NestJS — Integration Tests with TestingModule](#175-nestjs--integration-tests-with-testingmodule)
    - 17.6 [Next.js — Testing Server Components](#176-nextjs--testing-server-components)
    - 17.7 [Next.js — Testing Client Components](#177-nextjs--testing-client-components)
    - 17.8 [React Native — Testing Screens & Components](#178-react-native--testing-screens--components)
    - 17.9 [Adding Tests for a New Module (Checklist)](#179-adding-tests-for-a-new-module-checklist)
18. [Linting & Code Quality](#18-linting--code-quality)
    - 18.1 [ESLint Overview](#181-eslint-overview)
    - 18.2 [Running the Linter](#182-running-the-linter)
    - 18.3 [Per-App ESLint Config](#183-per-app-eslint-config)
    - 18.4 [Adding or Adjusting Rules](#184-adding-or-adjusting-rules)
    - 18.5 [Prettier](#185-prettier)
    - 18.6 [TypeScript Type Checking](#186-typescript-type-checking)
19. [Mailgun Inbound Webhook](#19-mailgun-inbound-webhook)
    - 19.1 [How it works](#191-how-it-works)
    - 19.2 [Local environment setup](#192-local-environment-setup)
    - 19.3 [Testing with curl](#193-testing-with-curl)
    - 19.4 [Verifying the result](#194-verifying-the-result)
    - 19.5 [Error responses](#195-error-responses)
    - 19.6 [Transaction routing convention](#196-transaction-routing-convention)
    - 19.7 [Adding a new inbound email handler](#197-adding-a-new-inbound-email-handler)
20. [Design Decisions](#20-design-decisions)
    - 20.1 [Two-track Transaction Creation Flow](#201-two-track-transaction-creation-flow)
    - 20.2 [PDF Contract Extraction via LLM](#202-pdf-contract-extraction-via-llm)
    - 20.3 [PDF Type Detection and AcroForm Field Extraction](#203-pdf-type-detection-and-acroform-field-extraction)
    - 20.4 [RPA Compliance Validation Engine](#204-rpa-compliance-validation-engine)
    - 20.5 [AI Engineer — `@tc/document-intelligence` package](#205-ai-engineer---tcdocument-intelligence-package)
      - [What you own](#what-you-own)
      - [One-time setup](#one-time-setup)
      - [Daily test commands](#daily-test-commands--scoped-to-avoid-llm-costs)
      - [Browser UI](#browser-ui--pnpm-testui)
      - [Locking extraction with snaps](#locking-a-form-extraction-with-a-snap-file)
      - [Test structure](#test-structure--three-tiers)
      - [Creating a new scenario](#creating-a-new-scenario-from-scratch)
      - [Running an existing scenario](#running-scenarios)
      - [File and version naming](#file-and-version-naming-convention)
      - [Adding a new form](#adding-a-new-form)
      - [Adding a stage reasoner](#adding-a-stage-reasoner)
      - [Adding a validation rule](#adding-a-validation-rule-to-an-existing-stage)
      - [Deploying prompt changes](#deploying-prompt-changes-to-dev-or-production)
      - [Environment variables](#environment-variables)
      - [Key types](#key-types)
  21. [Test PDF Generator — `@tc/test-pdf-generator`](#21-test-pdf-generator---tctest-pdf-generator)
      - [21.1 Dependencies](#211-dependencies)
      - [21.2 Package structure](#212-package-structure)
      - [21.3 Setup](#213-setup)
      - [21.4 How it works](#214-how-it-works-pipeline)
      - [21.5 Commands](#215-commands)
      - [21.6 API](#216-api)
      - [21.7 Adding a fixture variant](#217-adding-a-new-fixture-variant)
      - [21.8 Adding a scenario](#218-adding-a-new-scenario)
      - [21.9 Adding a new form type](#219-adding-a-new-form-type-eg-sco)
      - [21.10 Integration with document-intelligence tests](#2110-integration-with-tcdocument-intelligence-tests)

---

## 1. Project Overview

TC is a Turborepo monorepo containing three apps that share code through common packages:

| App | Tech | Purpose |
|---|---|---|---|
| `apps/api` | NestJS | REST API + GraphQL API |
| `apps/web` | Next.js 15 | React web app — dashboard, admin, transaction management |
| `apps/mobile` | React Native / Expo | iOS and Android mobile app |

All three apps share types, DTOs, and an API client through the `packages/` layer.

---

### Technology Reference

A quick-reference guide for every technology and tool used in this project. If a term is unfamiliar, start here before diving into the code.

#### Languages

| Technology | What it is | Where used |
|---|---|---|
| **TypeScript** | A strongly-typed superset of JavaScript. You write TypeScript (`.ts` / `.tsx` files) and it compiles down to plain JavaScript. Catches type errors at development time before the code runs. | Every app and package in this repo |
| **JavaScript** | The language TypeScript compiles to. You rarely write plain JS here — TypeScript handles everything. | Config files (`.eslintrc.js`, `jest.config.ts`) |
| **HTML / Handlebars** | HTML is the markup language for web pages. Handlebars is a template engine that adds `{{variables}}` and `{{#each}}` loops to HTML, letting the server inject data before sending the page to the browser. | Admin UI templates in `apps/api/views/` |

#### Backend Framework

| Technology | What it is | Where used |
|---|---|---|
| **NestJS** | An opinionated Node.js framework for building server-side applications. Inspired by Spring Boot (Java) and Angular. Uses decorators (`@Controller`, `@Injectable`, `@Module`) to wire things together. Organises code into modules, each containing a controller (HTTP routes), service (business logic), and optionally a resolver (GraphQL). | `apps/api` |
| **Express** | A minimal HTTP server library for Node.js. NestJS uses it internally as its HTTP engine — you rarely interact with it directly. | Underlying engine of `apps/api` |

#### Frontend Frameworks

| Technology | What it is | Where used |
|---|---|---|
| **React** | A JavaScript library for building user interfaces from reusable components. A component is a function that returns JSX (HTML-like syntax in TypeScript). React re-renders components automatically when their data changes. | `apps/web`, `apps/mobile` |
| **Next.js** | A React framework built for production. Adds Server-Side Rendering (SSR — the server generates HTML before sending it to the browser), file-based routing (folder structure = URL structure), and API routes on top of React. Version 15 uses the App Router, where every component is a Server Component by default. | `apps/web` |
| **React Native** | A framework that lets you write React components that render as native iOS and Android UI elements — not a web page in a browser wrapper. Uses the same React mental model but with components like `<View>`, `<Text>`, and `<FlatList>` instead of `<div>`, `<p>`, and `<ul>`. | `apps/mobile` |
| **Expo** | A toolchain built on top of React Native that simplifies setup, building, and device testing. Provides the `expo start` dev server, the Expo Go app for instant device preview, and managed workflows for building iOS/Android binaries. | `apps/mobile` |

#### API Layer

| Technology | What it is | Where used |
|---|---|---|
| **REST API** | The most common API style. Clients make HTTP requests to URL endpoints (`GET /api/v1/transactions`, `POST /api/v1/contacts`). Each URL represents a resource, and the HTTP method describes the action (GET = read, POST = create, PATCH = update, DELETE = remove). | `apps/api` REST controllers |
| **GraphQL** | An alternative API style where clients send a query describing exactly what data they need, and the server returns only that data — nothing more, nothing less. Replaces multiple REST calls with a single flexible query. Uses a single endpoint (`/graphql`). | `apps/api` resolvers |
| **Apollo Server** | The GraphQL server library used inside NestJS. Handles parsing GraphQL queries, executing resolvers, and serving the GraphQL Playground in development. | `apps/api` |

#### Database

| Technology | What it is | Where used |
|---|---|---|
| **TypeORM** | An Object-Relational Mapper (ORM) for TypeScript. Lets you define your database tables as TypeScript classes (Entities) using decorators. Handles SQL query generation, relationships, and migrations so you rarely write raw SQL. | `apps/api` |
| **PostgreSQL 16** | A powerful open-source relational database. Used for both local development (via Docker) and production. Supports advanced types like `jsonb` (queried JSON columns), `timestamptz` (timezone-aware timestamps), and `gen_random_uuid()` — all used throughout this project. | `apps/api` |
| **Docker / Docker Compose** | Docker runs software in isolated containers. Docker Compose defines multi-container setups in a single `docker-compose.yml`. Used here to start a local PostgreSQL server with one command (`docker compose up -d`). No PostgreSQL installation needed — Docker provides it. | Root `docker-compose.yml` |
| **Migrations** | Version-controlled scripts that define database schema changes (create table, add column, add index). TypeORM generates them automatically when you change an Entity. Every developer runs the same migrations to ensure their local database matches the current schema. | `apps/api/src/database/migrations/` |
| **Seeds** | Scripts that populate the database with realistic development data (sample users, accounts, etc.) so developers can work with a pre-filled database immediately after setup. | `apps/api/src/database/seeds/` |

#### Monorepo & Build Tools

| Technology | What it is | Where used |
|---|---|---|
| **Monorepo** | A single Git repository that contains multiple related projects (apps and packages). The alternative is one repo per project. A monorepo makes it easy to share code, run all apps together, and refactor across projects in one commit. | This entire repository |
| **Turborepo** | A build system designed for monorepos. It understands the dependency graph between apps and packages, runs tasks in parallel, and caches build outputs so unchanged packages are never rebuilt. Running `pnpm build` triggers Turbo, not each app directly. | Root `turbo.json` |
| **pnpm** | A fast Node.js package manager (alternative to npm and yarn). The key feature here is **workspaces** — pnpm understands the monorepo structure and lets any app reference a local package (`workspace:*`) without publishing it to npm. | Root `pnpm-workspace.yaml` |
| **Webpack / SWC** | Bundlers that compile and bundle TypeScript + React code for the browser. Next.js uses SWC (a fast Rust-based compiler) internally — you never configure these directly. | Hidden inside Next.js |
| **ts-node** | Runs TypeScript files directly without a separate compilation step. Used for the TypeORM migration CLI and seed scripts so you can run `.ts` files from the command line. | `apps/api` scripts |

#### Testing

| Technology | What it is | Where used |
|---|---|---|
| **Jest** | The most widely used JavaScript testing framework. Provides the `describe`, `it`, `expect` functions, mocking utilities (`jest.fn()`, `jest.mock()`), and a test runner. | All apps |
| **ts-jest** | A Jest plugin that teaches Jest how to understand TypeScript files directly, without a separate compilation step. | `apps/api`, `apps/web` |
| **jest-expo** | A Jest preset configured by the Expo team for React Native projects. Handles the complex transform rules needed to process React Native's JavaScript. | `apps/mobile` |
| **@nestjs/testing** | NestJS utilities for unit tests. `Test.createTestingModule()` lets you spin up a mini NestJS module in a test with real or mocked providers injected via the DI container. | `apps/api` |
| **@testing-library/react** | The standard library for testing React components. Encourages testing from a user's perspective — find elements by their visible text or role, not by CSS class or internal state. | `apps/web` |
| **@testing-library/react-native** | The React Native equivalent of Testing Library. Same query API (`getByText`, `getByRole`) but for native components. | `apps/mobile` |


#### Code Quality

| Technology | What it is | Where used |
|---|---|---|
| **ESLint** | A static analysis tool that reads your code without running it and flags problems: unused variables, unsafe patterns, rule violations. Runs in your editor in real time and as a CI check. | All apps |
| **@typescript-eslint** | ESLint plugins and rules specifically for TypeScript. Adds checks like no implicit `any`, no unused TypeScript types, and correct use of TypeScript-specific syntax. | All apps via `packages/config/` |
| **Prettier** | An opinionated code formatter. Automatically rewrites your code to a consistent style (indentation, quotes, trailing commas). Removes all formatting debates from code review. | All apps via root `.prettierrc` |

#### Navigation (Mobile)

| Technology | What it is | Where used |
|---|---|---|
| **React Navigation** | The standard navigation library for React Native. Manages the stack of screens the user can move through (push, pop, go back), tab bars, and drawer menus. Analogous to a router in a web app. | `apps/mobile` |

---

## 2. Repository Structure

```
tc/                               ← Monorepo root
├── apps/
│   ├── api/                      ← NestJS backend (port 3000)
│   │   ├── src/
│   │   │   ├── admin/            ← Admin UI controllers (@Render → Handlebars)
│   │   │   ├── database/
│   │   │   │   ├── data-source.ts        ← TypeORM CLI config
│   │   │   │   ├── migrations/           ← One file per schema change
│   │   │   │   └── seeds/                ← Dev seed data
│   │   │   │       └── data/             ← Seed data per entity
│   │   │   ├── modules/          ← One folder per domain feature
│   │   │   │   ├── users/                ← Auth identity (email, passwordHash, status)
│   │   │   │   │   ├── entities/         ← TypeORM entity (= GraphQL ObjectType)
│   │   │   │   │   ├── dto/              ← GraphQL InputTypes
│   │   │   │   │   ├── users.controller.ts
│   │   │   │   │   ├── users.resolver.ts
│   │   │   │   │   ├── users.service.ts
│   │   │   │   │   └── users.module.ts
│   │   │   │   ├── accounts/             ← User profile (displayName, timezone, etc.)
│   │   │   │   ├── organizations/        ← Brokerage/team/title companies + memberships
│   │   │   │   ├── contacts/             ← Buyers, sellers, third-party directory
│   │   │   │   ├── transactions/         ← Core real estate transaction record
│   │   │   │   ├── transaction-parties/  ← Buyer/seller/agent/lender per transaction
│   │   │   │   ├── transaction-journals/ ← Append-only audit trail
│   │   │   │   ├── transaction-messages/ ← Email/SMS inbound and outbound
│   │   │   │   ├── transaction-documents/← File attachments with versioning
│   │   │   │   ├── transaction-tasks/    ← Checklist items with dependencies
│   │   │   │   ├── transaction-events/   ← Milestones and calendar events
│   │   │   │   └── ai-interactions/      ← AI prompt/response audit log
│   │   │   ├── app.module.ts     ← Root module (DB + GraphQL config)
│   │   │   └── main.ts           ← Bootstrap, ports, middleware
│   │   ├── views/                ← Handlebars templates for admin UI
│   │   │   ├── layouts/main.hbs  ← Base HTML layout
│   │   │   ├── partials/         ← navbar, sidebar fragments
│   │   │   └── admin/            ← One .hbs file per admin page
│   │   ├── public/               ← Static assets (CSS, JS, images)
│   │   ├── .env.example          ← Copy to .env for local dev
│   │   └── nest-cli.json
│   │
│   ├── web/                      ← Next.js (port 3001)
│   │   └── src/
│   │       └── app/              ← App Router (layouts, pages, API routes)
│   │
│   └── mobile/                   ← Expo / React Native
│       ├── App.tsx               ← Entry point, NavigationContainer
│       └── src/
│           ├── screens/          ← One file per screen
│           ├── components/       ← Reusable UI components
│           ├── navigation/       ← Stack/Tab navigators
│           └── hooks/            ← Custom hooks
│
├── packages/
│   ├── shared/       (@tc/shared)              ← Types, DTOs, constants — used by all apps
│   ├── api-client/   (@tc/api-client)          ← REST + GraphQL fetch helpers — used by web + mobile
│   ├── config/       (@tc/config)              ← Shared ESLint + TypeScript configs
│   └── test-pdf-generator/ (@tc/test-pdf-generator) ← Fill blank C.A.R. forms with fixture data for testing
│
├── turbo.json         ← Turborepo pipeline (build, dev, lint, test)
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── .prettierrc
```

---

## 3. Prerequisites

Install these tools before starting:

| Tool | Version | Install |
|---|---|---|
| Node.js | >= 20 | [nodejs.org](https://nodejs.org) or `nvm install 20` |
| pnpm | >= 9 | `npm install -g pnpm` |
| Git | any | [git-scm.com](https://git-scm.com) |
| Xcode | latest (macOS) | App Store — required for iOS simulator |
| Android Studio | latest | Required for Android emulator |
| Expo Go app | latest | Install on physical device for quick mobile testing |
| Docker Desktop | latest | [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop) — required to run PostgreSQL locally |

---

## 4. Environments

### 4.1 Three-environment model

The project supports three distinct environments. Each has its own database, API URL, and
configuration file. The active environment is controlled by the `APP_ENV` variable.

| | **local** | **dev** | **production** |
|---|---|---|---|
| Purpose | Day-to-day coding on your machine | Shared cloud environment for team QA | Live system |
| `APP_ENV` | `local` (default) | `dev` | `production` |
| `NODE_ENV` | `development` | `production` | `production` |
| Database | Docker PostgreSQL (localhost:5432) | Neon — dev project | Neon — production project |
| API | localhost:3000 | tc-api-dev.fly.dev | tc-api.fly.dev |
| Web | localhost:3001 | tc-app-dev.vercel.app | tc-app.vercel.app |
| Fly config | — | `fly.dev.toml` | `fly.toml` |
| Env file | `.env.local` | `.env.dev` | `.env.production` |

### 4.2 Environment files

All env files live in `apps/api/` and are **gitignored** — never committed.

**`.env.local`** — local Docker dev. Created automatically during setup, works out of the box:
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

**`.env.dev`** — fill in after creating a Neon dev project:
```
# ── Database (Neon) ────────────────────────────────────────────────────────────
DATABASE_URL=postgresql://USER:PASSWORD@ep-xxx.region.aws.neon.tech/tc-db?sslmode=require

# ── API ────────────────────────────────────────────────────────────────────────
ALLOWED_ORIGINS=https://your-app-dev.vercel.app
JWT_SECRET=dev-secret-change-me

# ── Mailgun (inbound webhooks) ─────────────────────────────────────────────────
MAILGUN_WEBHOOK_SIGNING_KEY=your-mailgun-webhook-signing-key

# ── Mailgun (outbound email) ───────────────────────────────────────────────────
MAILGUN_API_KEY=your-mailgun-api-key
MAILGUN_DOMAIN=mg.yourdomain.com
MAILGUN_FROM_EMAIL=noreply@mg.yourdomain.com
MAILGUN_API_URL=https://api.mailgun.net

# ── Feature flags ──────────────────────────────────────────────────────────────
CREATE_ACCT_EMAIL_NOTIFY_ENABLED=true    # Enable email on register for dev

# ── Web app ────────────────────────────────────────────────────────────────────
WEB_APP_URL=https://your-app-dev.vercel.app
```

**`.env.production`** — fill in after creating a Neon production project. Used only when
running production migrations from your local machine. Fly.io reads its own secrets at
runtime and never uses this file in the cloud:
```
# ── Database (Neon) ────────────────────────────────────────────────────────────
DATABASE_URL=postgresql://USER:PASSWORD@ep-xxx.region.aws.neon.tech/tc-db?sslmode=require

# ── API ────────────────────────────────────────────────────────────────────────
ALLOWED_ORIGINS=https://your-app.vercel.app
JWT_SECRET=prod-secret-change-me

# ── Mailgun (inbound webhooks) ─────────────────────────────────────────────────
MAILGUN_WEBHOOK_SIGNING_KEY=your-mailgun-webhook-signing-key

# ── Mailgun (outbound email) ───────────────────────────────────────────────────
MAILGUN_API_KEY=your-mailgun-api-key
MAILGUN_DOMAIN=mg.yourdomain.com
MAILGUN_FROM_EMAIL=noreply@mg.yourdomain.com
MAILGUN_API_URL=https://api.mailgun.net

# ── Feature flags ──────────────────────────────────────────────────────────────
CREATE_ACCT_EMAIL_NOTIFY_ENABLED=true    # Enable email on register for production

# ── Web app ────────────────────────────────────────────────────────────────────
WEB_APP_URL=https://your-app.vercel.app
```

### 4.3 Complete environment variable reference

All variables consumed by `apps/api`. Variables marked **required** will cause startup
failure or broken behaviour if missing; **optional** ones have safe defaults.

All three `.env.*` files share the same variable names — only values differ per environment.

#### Database

| Variable | Required | local | dev / production | Notes |
|---|---|---|---|---|
| `DB_HOST` | local only | `localhost` | — | Docker Postgres host; ignored when `DATABASE_URL` is set |
| `DB_PORT` | local only | `5432` | — | Docker Postgres port |
| `DB_USER` | local only | `tc` | — | |
| `DB_PASSWORD` | local only | `tc_dev` | — | |
| `DB_NAME` | local only | `tc` | — | |
| `DATABASE_URL` | dev/prod | — | Neon connection string | Takes precedence over individual DB vars; enables SSL automatically |

#### API config

| Variable | Required | Default | Notes |
|---|---|---|---|
| `PORT` | No | `3000` | HTTP port the API listens on |
| `ALLOWED_ORIGINS` | Yes | `http://localhost:3001` | Comma-separated list of origins allowed for CORS (e.g. `https://app.vercel.app`). Must match Vercel URL exactly. The API also sets `credentials: true` for cookie-based JWT auth. |
| `API_BASE_URL` | Yes | `http://localhost:3000` | The API's own base URL — used for generating document download links |
| `JWT_SECRET` | Yes | — | Signs JWT access tokens. Use a long random string in dev/production. |

#### LLM document extraction

| Variable | Required | Default | Notes |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | Depends | — | API key for Claude (Anthropic). Required when using `anthropic` as provider. |
| `GEMINI_API_KEY` | Depends | — | API key for Gemini (Google). Required when using `gemini` as provider. |
| `LLM_EXTRACTION_PROVIDER` | No | `anthropic` | Extraction LLM provider — `anthropic` or `gemini` |
| `LLM_REASONING_PROVIDER` | No | `anthropic` | Reasoning LLM provider — `anthropic` or `gemini` |
| `LLM_TEMPERATURE` | No | `0` | LLM temperature: `0` = deterministic, `1.0` = provider default |

#### Mailgun — Inbound webhooks

| Variable | Required | Notes |
|---|---|---|
| `MAILGUN_WEBHOOK_SIGNING_KEY` | Yes | HMAC key to verify incoming Mailgun webhook payloads. Found in Mailgun dashboard → Webhooks → Signing Key. API returns 403 if missing. |

#### Mailgun — Outbound email

| Variable | Required | Default | Notes |
|---|---|---|---|
| `MAILGUN_API_KEY` | When email enabled | — | Private API key for sending. Found in Mailgun → API Keys. Leave blank locally to skip sending (URL prints to console). |
| `MAILGUN_DOMAIN` | When email enabled | — | Sending domain (`sandboxXXX.mailgun.org` locally, `mg.yourdomain.com` in prod). |
| `MAILGUN_FROM_EMAIL` | No | `noreply@{MAILGUN_DOMAIN}` | `From:` address on all outbound emails. Must belong to `MAILGUN_DOMAIN`. |
| `MAILGUN_API_URL` | No | `https://api.mailgun.net` | US region endpoint. Change to `https://api.eu.mailgun.net` for EU accounts. |

#### Web app

| Variable | Required | Default | Notes |
|---|---|---|---|
| `WEB_APP_URL` | Yes | `http://localhost:3001` | Base URL of the Next.js app. Used to build verification links in registration emails. |
| `CREATE_ACCT_EMAIL_NOTIFY_ENABLED` | No | `false` | When `true`, sends verification emails on registration. Set to `false` locally to skip Mailgun sandbox restrictions. |

#### Redis — Job queue (Bull / Upstash)

| Variable | Required | Default | Notes |
|---|---|---|---|
| `REDIS_URL` | When reminders enabled | — | Upstash Redis connection string (`rediss://default:{password}@{host}:{port}`). Required for Bull deadline reminder jobs. |

#### Reminder schedule

| Variable | Required | Default | Notes |
|---|---|---|---|
| `REMINDER_SCHEDULE` | No | `7d,3d,0d` | Comma-separated offsets: number + unit suffix (`d`=days, `h`=hours, `m`=minutes). Use `5m,2m,0m` for local testing. |
| `REMINDER_CANCEL_CUTOFF_MINUTES` | No | `3` | Minimum minutes before a reminder fires within which cancellation is blocked. |

#### AWS S3 — File storage

| Variable | Required | Default | Notes |
|---|---|---|---|
| `AWS_ACCESS_KEY_ID` | When S3 enabled | — | IAM access key for programmatic S3 uploads |
| `AWS_SECRET_ACCESS_KEY` | When S3 enabled | — | IAM secret key — copy at creation time, cannot be retrieved later |
| `S3_BUCKET_NAME` | When S3 enabled | — | S3 bucket that stores contract PDFs |
| `S3_REGION` | When S3 enabled | `us-east-1` | AWS region where the bucket lives |
| `S3_ENDPOINT` | No | — | Override endpoint for S3-compatible services (MinIO, Cloudflare R2). Leave blank for real AWS S3. |

---

For the **web app** (`apps/web`), only one variable is needed locally:

**`apps/web/.env.local`** — created automatically, loaded by Next.js:
```
# ── Local environment — Next.js web app ──────────────────────────────────────
# Loaded automatically by Next.js for local dev. Never committed.

NEXT_PUBLIC_API_URL=http://localhost:3000
NEXT_PUBLIC_APP_ENV=local
```

| Variable | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | Yes | Full URL of the API server. Exposed to the browser (hence the `NEXT_PUBLIC_` prefix). Set per environment in the Vercel dashboard for dev and production deployments. |
| `NEXT_PUBLIC_APP_ENV` | No | Exposed to browser — used for environment-specific UI labels (e.g. showing "Dev" badge). |

For dev and production web deployments, these are set as environment
variables in the Vercel dashboard per deployment environment.

### 4.4 How APP_ENV works

`APP_ENV` is the single switch that controls which `.env.*` file the API loads.

```
APP_ENV not set  →  loads .env.local   (Docker DB — the default for all local commands)
APP_ENV=dev      →  loads .env.dev     (Neon dev DB)
APP_ENV=production → loads .env.production (Neon prod DB)
```

The env file is loaded in `src/env.ts` which is the **very first import** in both `main.ts`
and `data-source.ts`. This ensures `process.env` is fully populated before any NestJS module
or TypeORM config evaluates it.

`dotenv` never overrides variables already set in the process. On Fly.io, `DATABASE_URL` and
other secrets are injected by the platform before the process starts — the `.env.*` file is
absent from the container and silently skipped.

All `pnpm` scripts already set `APP_ENV` for you:

```bash
pnpm --filter @tc/api dev             # APP_ENV=local (default)
pnpm --filter @tc/api migration:run   # APP_ENV=local
pnpm --filter @tc/api seed            # APP_ENV=local

pnpm --filter @tc/api migration:run:dev   # APP_ENV=dev
pnpm --filter @tc/api seed:dev            # APP_ENV=dev
pnpm --filter @tc/api db:setup:dev        # APP_ENV=dev (migration + seed)

pnpm --filter @tc/api migration:run:prod  # APP_ENV=production (compiled JS)
```

---

## 5. Local Setup

### Step 1 — Clone and install

```bash
git clone <repo-url> tc
cd tc
pnpm install
```

### Step 2 — Environment file

`.env.local` is already present in `apps/api/` and `apps/web/` — no copying needed.
The defaults work immediately with Docker. If the files are missing, recreate them:

```bash
# API
cat > apps/api/.env.local << 'EOF'
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
JWT_SECRET=local-dev-secret

# ── LLM document extraction ───────────────────────────────────────────────────
ANTHROPIC_API_KEY=
GEMINI_API_KEY=
LLM_EXTRACTION_PROVIDER=anthropic
LLM_REASONING_PROVIDER=anthropic
LLM_TEMPERATURE=0

# ── Mailgun — inbound webhooks ────────────────────────────────────────────────
MAILGUN_WEBHOOK_SIGNING_KEY=local-dev-key

# ── Mailgun — outbound email ──────────────────────────────────────────────────
MAILGUN_API_KEY=
MAILGUN_DOMAIN=
MAILGUN_FROM_EMAIL=
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
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
S3_BUCKET_NAME=my-bucket
S3_REGION=us-east-1
# S3_ENDPOINT=
EOF

# Web
cat > apps/web/.env.local << 'EOF'
# ── Local environment — Next.js web app ──────────────────────────────────────
# Loaded automatically by Next.js for local dev. Never committed.

NEXT_PUBLIC_API_URL=http://localhost:3000
NEXT_PUBLIC_APP_ENV=local
EOF
```

### Step 3 — Start PostgreSQL

```bash
docker compose up -d
```

Exposes PostgreSQL on `localhost:5432`. Credentials: user `tc`, password `tc_dev`, database `tc`.
These match `.env.local` — no changes needed.

### Step 4 — Database setup

```bash
pnpm --filter @tc/api db:setup
```

This runs `migration:run` then `seed` against the local Docker DB (`APP_ENV=local`). Safe to run
multiple times — seeders skip tables that already have data.

Seeded data:

**Users (all password `Password1!`):**

| Email | Roles | Login URL | Notes |
|-------|-------|-----------|-------|
| `sarah.broker@sunsetrealty.com` | `[USER, BROKER_ADMIN]` | `/login` | Broker admin for Sunset Realty Group |
| `alice.tc@sunsetrealty.com` | `[USER, TRANSACTION_COORDINATOR]` | `/login` | Transaction coordinator |
| `bob.tc@sunsetrealty.com` | `[USER, TRANSACTION_COORDINATOR]` | `/login` | Transaction coordinator |
| `carol.agent@sunsetrealty.com` | `[USER, AGENT]` | `/login` | Agent |
| `david.agent@sunsetrealty.com` | `[USER, AGENT]` | `/login` | Agent |
| `admin@tcplatform.com` | `[SUPPORT_ADMIN]` | `/admin-login` | Platform support admin — dark-themed admin login |

**Organizations:**

| Name | Type | Status | Description |
|------|------|--------|-------------|
| Sunset Realty Group | BROKERAGE | `active` | Main brokerage — has 5 members |
| Pacific Title & Escrow | TITLE_COMPANY | `active` | Title/escrow partner |
| Bayview Realty Partners | BROKERAGE | `pending_approval` | Awaiting support admin approval |
| Desert Oasis Properties | BROKERAGE | `pending_approval` | Awaiting support admin approval |

**Organization Memberships (Sunset Realty Group only):**

| Account | Role | Status |
|---------|------|--------|
| Sarah (sarah.broker) | `broker_admin` | `active` (primary) |
| Alice (alice.tc) | `transaction_coordinator` | `active` |
| Bob (bob.tc) | `transaction_coordinator` | `active` |
| Carol (carol.agent) | `agent` | `active` |
| David (david.agent) | `agent` | `active` |

**Other seeded data:**
- 2 transactions: 456 Maple Street (Inspection stage) + 789 Oak Drive (Intake)
- 9 parties, 10 email messages with 2 reply threads (swimlane demo data)
- Form templates: "Residential CA Buyer" (contract + disclosure stages), "Residential CA Seller" (disclosure stage)
- Audit logs — 20+ entries covering org lifecycle, user registrations, logins, memberships, transactions (TXN-2024-0001 + TXN-2024-0002), and admin actions

### Step 5 — Start the apps

```bash
pnpm dev
```

| App | URL |
|---|---|
| API — REST | http://localhost:3000/api/v1 |
| API — GraphQL Playground | http://localhost:3000/graphql |
| API — Admin UI | http://localhost:3000/admin |
| Web | http://localhost:3001 |
| Mobile | Expo DevTools in terminal, scan QR with Expo Go |

---

## 6. Running the Apps

> **Prerequisite:** Docker must be running and `docker compose up -d` must have been executed
> before starting any app locally.

### All apps at once (local)

```bash
pnpm dev
```

Turborepo starts all three apps in parallel. Each app script sets `APP_ENV=local` automatically
so the local Docker DB is used. No extra configuration required.

### Docker management

```bash
docker compose up -d       # start PostgreSQL in the background
docker compose down        # stop container (data volume preserved)
docker compose down -v     # stop and wipe all data (full reset)
docker compose logs -f     # tail PostgreSQL logs
```

### Reset local database

```bash
docker compose down -v           # wipe the Docker volume
docker compose up -d             # start fresh container
pnpm --filter @tc/api db:setup   # re-run migrations + seed
```

### Individual apps

```bash
pnpm --filter @tc/api     dev   # NestJS only  (APP_ENV=local)
pnpm --filter @tc/web     dev   # Next.js only
pnpm --filter @tc/mobile  dev   # Expo only
```

### Build for production

```bash
pnpm build                     # builds all apps
pnpm --filter @tc/api build    # API only (outputs to apps/api/dist/)
```

---

## 7. Shared Packages

These packages are consumed by all apps via `workspace:*` references and TypeScript path aliases. You never need to publish them — pnpm workspaces resolves them locally.

### `@tc/shared` — Types, DTOs, Constants

**Location:** `packages/shared/src/`

```
shared/src/
├── types/index.ts      ← Generic types: PaginatedResponse, ApiResponse, ID
├── dtos/index.ts       ← CreateUserDto, AccountDto, etc.
└── constants/index.ts  ← API_PREFIX, GRAPHQL_PATH
```

**When to add here:** Any type or constant that is used by more than one app (e.g., NestJS validates a DTO and the mobile app uses the same shape for its form).

**Example — adding a new DTO for a domain feature:**

```typescript
// packages/shared/src/dtos/index.ts
export interface CreatePropertyListingDto {
  transactionId: string;
  mlsNumber: string;
  listPrice?: number;
}

export interface PropertyListingDto {
  id: string;
  transactionId: string;
  mlsNumber: string;
  listPrice: number | null;
  daysOnMarket: number | null;
  createdAt: string;
  updatedAt: string;
}
```

### `@tc/api-client` — REST + GraphQL Client

**Location:** `packages/api-client/src/`

```
api-client/src/
├── rest/index.ts       ← apiFetch<T>(path, options) helper
└── graphql/index.ts    ← gqlFetch<T>(query, variables) helper
```

Both `apps/web` and `apps/mobile` import from here so API calls are never duplicated. Add domain-specific functions here rather than inline fetches in components.

---

## 8. Expanding the NestJS API

### 8.1 Adding a New Module (Business Logic)

Every domain feature in NestJS follows the same four-file pattern. Use this as a checklist every time.

**Example: adding a `PropertyListing` feature** (a listing record attached to a transaction)

#### 1. Create the entity (database + GraphQL type)

```typescript
// apps/api/src/modules/property-listings/entities/property-listing.entity.ts
import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn,
} from 'typeorm';
import { ObjectType, Field, ID, Float, Int } from '@nestjs/graphql';
import { TransactionEntity } from '../../transactions/entities/transaction.entity';

@ObjectType()
@Entity('property_listings')
export class PropertyListingEntity {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  transactionId: string;

  @Field(() => TransactionEntity)
  @ManyToOne(() => TransactionEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'transactionId' })
  transaction: TransactionEntity;

  @Field()
  @Column()
  mlsNumber: string;

  @Field(() => Float, { nullable: true })
  @Column({ type: 'numeric', precision: 14, scale: 2, nullable: true })
  listPrice: number | null;

  @Field(() => Int, { nullable: true })
  @Column({ type: 'integer', nullable: true })
  daysOnMarket: number | null;

  @Field()
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Field()
  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
```

#### 2. Create the service

```typescript
// apps/api/src/modules/property-listings/property-listings.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PropertyListingEntity } from './entities/property-listing.entity';

@Injectable()
export class PropertyListingsService {
  constructor(
    @InjectRepository(PropertyListingEntity)
    private readonly listingsRepo: Repository<PropertyListingEntity>,
  ) {}

  findByTransaction(transactionId: string): Promise<PropertyListingEntity[]> {
    return this.listingsRepo.find({ where: { transactionId } });
  }

  async findOne(id: string): Promise<PropertyListingEntity> {
    const listing = await this.listingsRepo.findOne({ where: { id } });
    if (!listing) throw new NotFoundException(`Listing ${id} not found`);
    return listing;
  }

  async create(dto: { transactionId: string; mlsNumber: string; listPrice?: number }): Promise<PropertyListingEntity> {
    const listing = this.listingsRepo.create(dto);
    return this.listingsRepo.save(listing);
  }

  async update(id: string, dto: Partial<PropertyListingEntity>): Promise<PropertyListingEntity> {
    const listing = await this.findOne(id);
    Object.assign(listing, dto);
    return this.listingsRepo.save(listing);
  }
}
```

#### 3. Create the module (wires everything together)

```typescript
// apps/api/src/modules/property-listings/property-listings.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PropertyListingEntity } from './entities/property-listing.entity';
import { PropertyListingsController } from './property-listings.controller';
import { PropertyListingsResolver } from './property-listings.resolver';
import { PropertyListingsService } from './property-listings.service';

@Module({
  imports: [TypeOrmModule.forFeature([PropertyListingEntity])],
  controllers: [PropertyListingsController],
  providers: [PropertyListingsResolver, PropertyListingsService],
  exports: [PropertyListingsService],
})
export class PropertyListingsModule {}
```

#### 4. Register in AppModule

```typescript
// apps/api/src/app.module.ts
import { PropertyListingsModule } from './modules/property-listings/property-listings.module';

@Module({
  imports: [
    // ... existing imports
    PropertyListingsModule,   // ← add here
  ],
})
export class AppModule {}
```

#### 5. Add a migration

```bash
cd apps/api
pnpm migration:generate --name=CreatePropertyListingsTable
pnpm migration:run
```

#### 6. Add DTOs to shared package

```typescript
// packages/shared/src/dtos/index.ts
export interface CreatePropertyListingDto {
  transactionId: string;
  mlsNumber: string;
  listPrice?: number;
}
export interface UpdatePropertyListingDto {
  listPrice?: number;
  daysOnMarket?: number;
}
export interface PropertyListingDto {
  id: string;
  transactionId: string;
  mlsNumber: string;
  listPrice: number | null;
  daysOnMarket: number | null;
  createdAt: string;
  updatedAt: string;
}
```

---

### 8.2 Database — Adding a New Entity & Migration

Whenever you add or change an entity, you must create a migration. **Never use `synchronize: true` — it can destroy data.**

#### Generate a migration

```bash
cd apps/api

# After creating/changing your entity:
pnpm migration:generate --name=CreatePropertyListingsTable
```

This compares the current entity definitions against the live PostgreSQL database and generates a new migration file in `src/database/migrations/`.

#### Review and run it

```bash
# Check what will run
pnpm migration:show

# Apply pending migrations
pnpm migration:run
```

#### Revert if something is wrong

```bash
pnpm migration:revert   # reverts the last migration
```

#### Manual migration example (adding a column + FK to an existing table)

```typescript
// src/database/migrations/1743900000000-AddAssignedAgentToTransactions.ts
import { MigrationInterface, QueryRunner, TableColumn, TableForeignKey } from 'typeorm';

export class AddAssignedAgentToTransactions1743900000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'real_estate_transactions',
      new TableColumn({ name: 'assignedAgentAccountId', type: 'uuid', isNullable: true }),
    );
    await queryRunner.createForeignKey(
      'real_estate_transactions',
      new TableForeignKey({
        name: 'FK_transactions_assigned_agent',
        columnNames: ['assignedAgentAccountId'],
        referencedTableName: 'accounts',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('real_estate_transactions');
    const fk = table?.foreignKeys.find(k => k.name === 'FK_transactions_assigned_agent');
    if (fk) await queryRunner.dropForeignKey('real_estate_transactions', fk);
    await queryRunner.dropColumn('real_estate_transactions', 'assignedAgentAccountId');
  }
}
```

#### Adding a seeder

```typescript
// src/database/seeds/data/property-listings.seed-data.ts
import { DataSource } from 'typeorm';
import { PropertyListingEntity } from '../../../modules/property-listings/entities/property-listing.entity';
import { TransactionEntity } from '../../../modules/transactions/entities/transaction.entity';

export async function seedPropertyListings(
  dataSource: DataSource,
  transactions: TransactionEntity[],
): Promise<void> {
  const repo = dataSource.getRepository(PropertyListingEntity);

  const existing = await repo.count();
  if (existing > 0) {
    console.log(`  [property-listings] Skipped — ${existing} listings already exist.`);
    return;
  }

  await repo.save(
    repo.create([
      { transactionId: transactions[0].id, mlsNumber: 'MLS-2024-56789', listPrice: 875000 },
      { transactionId: transactions[1].id, mlsNumber: 'MLS-2024-00123', listPrice: 720000 },
    ]),
  );
  console.log('  [property-listings] Seeded 2 listings.');
}
```

Then register it in the seed runner (after the data it depends on):

```typescript
// src/database/seeds/seed.ts  (current full order)
import { seedPropertyListings } from './data/property-listings.seed-data';

async function run() {
  await AppDataSource.initialize();
  const users        = await seedUsers(AppDataSource);
  const accounts     = await seedAccounts(AppDataSource, users);
  const orgs         = await seedOrganizations(AppDataSource);
  await seedMemberships(AppDataSource, orgs[0], accounts);
  const contacts     = await seedContacts(AppDataSource);
  await seedTransactions(AppDataSource, orgs[0], accounts, contacts);
  // await seedPropertyListings(AppDataSource, transactions);  // ← add here
  await AppDataSource.destroy();
}
```

---

### 8.3 Expanding REST API Endpoints

REST controllers live in `apps/api/src/modules/<feature>/`. They follow standard HTTP conventions.

#### Controller pattern — Transactions

```typescript
// apps/api/src/modules/transactions/transactions.controller.ts
import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { CreateTransactionDto, UpdateTransactionDto } from '@tc/shared';

@Controller('transactions')   // resolves to /api/v1/transactions
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  // GET /api/v1/transactions
  @Get()
  findAll() {
    return this.transactionsService.findAll();
  }

  // GET /api/v1/transactions?organizationId=<id>
  @Get()
  findByOrg(@Query('organizationId') organizationId: string) {
    return this.transactionsService.findByOrganization(organizationId);
  }

  // GET /api/v1/transactions/:id
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.transactionsService.findOne(id);
  }

  // POST /api/v1/transactions
  @Post()
  create(@Body() dto: CreateTransactionDto) {
    return this.transactionsService.create(dto);
  }

  // PATCH /api/v1/transactions/:id
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateTransactionDto) {
    return this.transactionsService.update(id, dto);
  }
}
```

All controllers are automatically prefixed `/api/v1/` because `main.ts` sets `app.setGlobalPrefix(API_PREFIX, { exclude: ['/admin(.*)'] })`. You never need to add the prefix manually.

#### Nested resource example

For `GET /api/v1/transactions/:transactionId/tasks`:

```typescript
// Inside TransactionTasksController
@Controller('transactions/:transactionId/tasks')
export class TransactionTasksController {
  @Get()
  findByTransaction(@Param('transactionId') transactionId: string) {
    return this.tasksService.findByTransaction(transactionId);
  }
}
```

Or keep tasks under their own flat controller (`/api/v1/tasks?transactionId=<id>`) — both patterns are valid.

#### Current REST endpoints (seeded and working)

| Method | URL | Description |
|---|---|---|
| GET | `/api/v1/users` | List all users |
| GET | `/api/v1/users/:id` | Get user by id |
| POST | `/api/v1/users` | Create user |
| PATCH | `/api/v1/users/:id` | Update user |
| GET | `/api/v1/accounts` | List all accounts |
| GET | `/api/v1/accounts/user/:userId` | Account by user id |
| GET | `/api/v1/organizations` | List organizations |
| GET | `/api/v1/contacts` | List contacts |
| GET | `/api/v1/transactions` | List transactions |
| GET | `/api/v1/transactions/:id` | Transaction detail |
| POST | `/api/v1/transactions` | Create transaction |
| PATCH | `/api/v1/transactions/:id` | Update transaction |

---

### 8.4 Expanding the GraphQL API

The API uses **code-first GraphQL** via `@nestjs/graphql`. The schema (`src/schema.gql`) is auto-generated — never edit it by hand.

#### Resolver pattern — Transactions

```typescript
// apps/api/src/modules/transactions/transactions.resolver.ts
import { Resolver, Query, Mutation, Args } from '@nestjs/graphql';
import { TransactionsService } from './transactions.service';
import { TransactionEntity } from './entities/transaction.entity';
import { CreateTransactionInput } from './dto/create-transaction.input';
import { UpdateTransactionInput } from './dto/update-transaction.input';

@Resolver(() => TransactionEntity)
export class TransactionsResolver {
  constructor(private readonly transactionsService: TransactionsService) {}

  // query { transactions { id transactionNumber status propertyAddressLine1 } }
  @Query(() => [TransactionEntity], { name: 'transactions' })
  findAll() {
    return this.transactionsService.findAll();
  }

  // query { transaction(id: "...") { id transactionNumber stage status } }
  @Query(() => TransactionEntity, { name: 'transaction' })
  findOne(@Args('id') id: string) {
    return this.transactionsService.findOne(id);
  }

  // mutation { createTransaction(input: { ... }) { id transactionNumber } }
  @Mutation(() => TransactionEntity)
  createTransaction(@Args('input') input: CreateTransactionInput) {
    return this.transactionsService.create(input);
  }

  // mutation { updateTransaction(id: "...", input: { status: "closed" }) { id status } }
  @Mutation(() => TransactionEntity)
  updateTransaction(
    @Args('id') id: string,
    @Args('input') input: UpdateTransactionInput,
  ) {
    return this.transactionsService.update(id, input);
  }
}
```

#### GraphQL InputType

```typescript
// apps/api/src/modules/transactions/dto/create-transaction.input.ts
import { InputType, Field } from '@nestjs/graphql';
import { IsNotEmpty, IsEnum } from 'class-validator';
import { TransactionType, TransactionSide } from '../entities/transaction.entity';

@InputType()
export class CreateTransactionInput {
  @Field()
  @IsNotEmpty()
  organizationId: string;

  @Field()
  @IsNotEmpty()
  transactionNumber: string;

  @Field(() => TransactionType)
  @IsEnum(TransactionType)
  transactionType: TransactionType;

  @Field(() => TransactionSide)
  @IsEnum(TransactionSide)
  side: TransactionSide;

  @Field()
  propertyAddressLine1: string;

  @Field()
  propertyCity: string;

  @Field()
  propertyState: string;

  @Field()
  createdByAccountId: string;
}
```

#### Resolving relations (ResolveField)

When a field needs a separate database call (avoids over-fetching on list queries):

```typescript
import { ResolveField, Parent } from '@nestjs/graphql';
import { TransactionTasksService } from '../transaction-tasks/transaction-tasks.service';

@Resolver(() => TransactionEntity)
export class TransactionsResolver {
  constructor(
    private readonly transactionsService: TransactionsService,
    private readonly tasksService: TransactionTasksService,
  ) {}

  // Only fetches tasks when the client explicitly requests the `tasks` field
  @ResolveField('tasks', () => [TransactionTaskEntity])
  getTasks(@Parent() transaction: TransactionEntity) {
    return this.tasksService.findByTransaction(transaction.id);
  }
}
```

#### Testing GraphQL in the Playground

Navigate to `http://localhost:3000/graphql` while `pnpm dev` is running. Example queries against seeded data:

```graphql
# List all users
query {
  users {
    id
    email
    phone
    status
    createdAt
  }
}

# Get a user's account (profile)
query {
  accounts {
    id
    displayName
    firstName
    lastName
    timezone
    status
  }
}

# List transactions with key fields
query {
  transactions {
    id
    transactionNumber
    transactionType
    side
    status
    stage
    propertyAddressLine1
    propertyCity
    propertyState
    listPrice
    contractPrice
    closeOfEscrowAt
  }
}

# Create a new user
mutation {
  createUser(input: {
    email: "newagent@sunsetrealty.com"
    phone: "+15550009999"
    password: "Password1!"
  }) {
    id
    email
  }
}

# Create a transaction
mutation {
  createTransaction(input: {
    organizationId: "<org-uuid>"
    transactionNumber: "TXN-2024-0003"
    transactionType: purchase
    side: buyer_side
    propertyAddressLine1: "100 New St"
    propertyCity: "Los Angeles"
    propertyState: "CA"
    createdByAccountId: "<account-uuid>"
  }) {
    id
    transactionNumber
    status
    stage
  }
}
```

---

## 9. Expanding the Next.js Web App

The web app uses **Next.js 15 App Router** with React Server Components by default.

### 9.1 Adding a New Page

Create a `page.tsx` file inside a folder under `apps/web/src/app/`. The folder name becomes the URL path.

```
apps/web/src/app/
├── layout.tsx                  ← Root layout (html, body)
├── page.tsx                    ← / (home / dashboard)
├── transactions/
│   ├── page.tsx                ← /transactions (list)
│   └── [id]/
│       └── page.tsx            ← /transactions/:id (detail)
└── contacts/
    └── page.tsx                ← /contacts
```

**Example page — Transaction list:**

```typescript
// apps/web/src/app/transactions/page.tsx
import { apiFetch } from '@tc/api-client';
import { TransactionDto } from '@tc/shared';

// Server Component — fetches data on the server, no useEffect needed
export default async function TransactionsPage() {
  const transactions = await apiFetch<TransactionDto[]>('/transactions');

  return (
    <main>
      <h1>Transactions</h1>
      <table>
        <thead>
          <tr>
            <th>Number</th><th>Property</th><th>Status</th><th>Stage</th><th>Close Date</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((tx) => (
            <tr key={tx.id}>
              <td>{tx.transactionNumber}</td>
              <td>{tx.propertyAddressLine1}, {tx.propertyCity}</td>
              <td>{tx.status}</td>
              <td>{tx.stage}</td>
              <td>{tx.closeOfEscrowAt ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
```

### 9.2 Server Components vs Client Components

| | Server Component (default) | Client Component (`'use client'`) |
|---|---|---|
| Fetches data | Yes — directly, no loading state | No — use `useEffect` or SWR/React Query |
| Uses hooks | No | Yes |
| Handles events | No | Yes |
| Access to browser APIs | No | Yes |
| Bundle size | 0 JS sent to browser | JS included in bundle |

**Rule of thumb:** keep pages and data-fetching as Server Components; only add `'use client'` to leaf components that need interactivity (buttons, forms, modals).

```typescript
// apps/web/src/app/transactions/UpdateStatusButton.tsx
'use client';

import { useState } from 'react';

export function UpdateStatusButton({ transactionId }: { transactionId: string }) {
  const [loading, setLoading] = useState(false);

  async function handleClose() {
    setLoading(true);
    await fetch(`/api/proxy/transactions/${transactionId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'closed' }),
    });
    setLoading(false);
  }

  return (
    <button onClick={handleClose} disabled={loading}>
      {loading ? 'Saving…' : 'Mark Closed'}
    </button>
  );
}
```

### 9.3 Fetching API Data

Use `@tc/api-client` helpers so the base URL and headers are centralised.

```typescript
import { apiFetch, gqlFetch } from '@tc/api-client';
import { TransactionDto, ContactDto } from '@tc/shared';

// REST — list transactions
const transactions = await apiFetch<TransactionDto[]>('/transactions');

// REST — create a contact
const newContact = await apiFetch<ContactDto>('/contacts', {
  method: 'POST',
  body: JSON.stringify({ contactType: 'person', firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com' }),
});

// GraphQL — fetch transactions with selected fields
const { transactions: txList } = await gqlFetch<{ transactions: TransactionDto[] }>(`
  query {
    transactions {
      id
      transactionNumber
      status
      stage
      propertyAddressLine1
      propertyCity
      contractPrice
    }
  }
`);
```

For client-side data fetching, add [SWR](https://swr.vercel.app) or [TanStack Query](https://tanstack.com/query):

```typescript
'use client';
import useSWR from 'swr';
import { apiFetch } from '@tc/api-client';
import { TransactionDto } from '@tc/shared';

export function useTransactions() {
  return useSWR('/transactions', (path) => apiFetch<TransactionDto[]>(path));
}
```

### 9.4 Adding a New Route Group

Route groups (folders wrapped in parentheses) let you share layouts without affecting the URL.

```
apps/web/src/app/
├── (marketing)/          ← URL: /
│   ├── layout.tsx        ← Marketing layout (header, footer)
│   └── page.tsx
├── (dashboard)/          ← URL: /dashboard, /settings
│   ├── layout.tsx        ← Dashboard layout (sidebar, nav)
│   ├── dashboard/page.tsx
│   └── settings/page.tsx
```

---

## 10. Expanding the Admin UI

The admin UI has been **migrated from Handlebars templates inside the NestJS API to Next.js pages** in `apps/web`. Admin pages live under the `/admin` route group, with a separate login page at `/admin-login` (dark theme). Only users with `role: support_admin` can access admin pages.

### 10.1 Architecture

```
apps/web/src/app/
├── admin-login/          ← Separate dark-themed login page
├── admin/                ← Route group for admin pages
│   ├── layout.tsx        ← Admin layout: dark navbar, sidebar nav, role guard
│   ├── page.tsx          ← Dashboard (stats: user count, pending orgs)
│   ├── users/
│   │   ├── page.tsx      ← Users table + UserActions (enable/disable, edit, assign)
│   │   └── UserActions.tsx  ← Client component with modals for user management
│   ├── organizations/
│   │   └── page.tsx      ← Org list with approve/reject buttons
│   └── audit-logs/
│       └── page.tsx      ← Audit log viewer
```

### 10.2 Admin API Endpoints

The NestJS admin controller (`apps/api/src/admin/admin.controller.ts`) provides JSON API endpoints consumed by the admin pages:

| Endpoint | Purpose |
|---|---|
| `GET /admin/api/dashboard` | Stats (users, pending orgs) |
| `GET /admin/api/users` | All platform users (excludes `support_admin` accounts) |
| `GET /admin/api/users/:id` | Single user detail |
| `PATCH /admin/api/users/:id/status` | Enable/disable user |
| `POST /admin/api/users/:id/resend-verification` | Resend verification email (optional email change) |
| `POST /admin/api/users/:id/assign-brokerage` | Assign user to a brokerage |
| `GET /admin/api/organizations` | All organizations |
| `POST /admin/organizations/:id/approve` | Approve pending org |
| `POST /admin/organizations/:id/reject` | Reject pending org |
| `GET /admin/api/audit-logs` | Paginated audit log entries |
| `GET /admin/api/accounts/search?q=` | Search accounts by email/name |

### 10.3 Auth & Guards

- Admin controller endpoints are protected by `@Roles(UserRole.SUPPORT_ADMIN)` — only users with `role: 'support_admin'` can access
- JWT is extracted from either `Authorization: Bearer` header or `tc_token` cookie
- Cookie-based auth (`httpOnly: false` in dev) enables server actions to pass JWT to client-side JS
- CORS config: `origin: ['http://localhost:3001']`, `credentials: true`
- Admin mutation endpoints have an `ensureNotAdmin()` guard: support_admin accounts cannot modify other support_admin accounts (returns 403)
- Form template management is gated to `broker_admin` role via `requireBrokerAdmin()` helper in the controller

### 10.4 Adding a New Admin Page

**Step 1 — Add a JSON API endpoint** in `apps/api/src/admin/admin.controller.ts`:

```typescript
@Get('api/reports')
@Roles(UserRole.SUPPORT_ADMIN)
async getReports() {
  return this.adminService.getReports();
}
```

**Step 2 — Create a server action** in `apps/web/src/lib/admin-actions.ts`:

```typescript
'use server';
export async function fetchReports() {
  const token = await getServerSessionToken();
  const res = await fetch(`${API_BASE_URL}/admin/api/reports`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
}
```

**Step 3 — Create the page** at `apps/web/src/app/admin/reports/page.tsx`:

```typescript
import { fetchReports } from '@/lib/admin-actions';

export default async function ReportsPage() {
  const reports = await fetchReports();
  return <div>{/* render reports */}</div>;
}
```

**Step 4 — Add sidebar link** in `apps/web/src/app/admin/layout.tsx`.

### 10.5 Client-side API Calls (from admin pages)

For mutation operations (enable/disable, resend verification), use the `client-api.ts` helper which reads the JWT from the `tc_token` cookie:

```typescript
import { apiPost } from '@/lib/client-api';

await apiPost(`/admin/api/users/${id}/status`, { status: 'suspended' });
```

### 10.6 Key Files

| File | Purpose |
|---|---|
| `apps/api/src/admin/admin.controller.ts` | All Handlebars + JSON API endpoints |
| `apps/api/src/admin/admin.service.ts` | Service for admin stats and queries |
| `apps/web/src/app/admin-login/page.tsx` | Dark-themed admin login page |
| `apps/web/src/app/admin/layout.tsx` | Admin layout with sidebar + role guard |
| `apps/web/src/app/admin/users/UserActions.tsx` | Enable/disable, edit, resend verification, assign brokerage |
| `apps/web/src/lib/admin-actions.ts` | Server actions for admin API calls |
| `apps/web/src/lib/client-api.ts` | Client-side fetch helper with Bearer token from cookie |

---

## 11. Expanding the React Native App

The mobile app uses **Expo** with **React Navigation** for screen routing.

### 11.1 Adding a New Screen

#### Step 1 — Create the screen component

```typescript
// apps/mobile/src/screens/TransactionsScreen.tsx
import { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { apiFetch } from '@tc/api-client';
import { TransactionDto } from '@tc/shared';
import { RootStackParamList } from '../navigation/RootNavigator';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function TransactionsScreen() {
  const [transactions, setTransactions] = useState<TransactionDto[]>([]);
  const navigation = useNavigation<Nav>();

  useEffect(() => {
    apiFetch<TransactionDto[]>('/transactions').then(setTransactions);
  }, []);

  return (
    <FlatList
      data={transactions}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      renderItem={({ item }) => (
        <TouchableOpacity
          style={styles.card}
          onPress={() => navigation.navigate('TransactionDetail', { id: item.id })}
        >
          <Text style={styles.number}>{item.transactionNumber}</Text>
          <Text style={styles.address}>{item.propertyAddressLine1}, {item.propertyCity}</Text>
          <Text style={styles.meta}>{item.status} · {item.stage}</Text>
        </TouchableOpacity>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list:    { padding: 16 },
  card:    { backgroundColor: '#fff', borderRadius: 8, padding: 12, marginBottom: 12, elevation: 2 },
  number:  { fontWeight: 'bold', fontSize: 16 },
  address: { marginTop: 4, color: '#444' },
  meta:    { marginTop: 4, color: '#888', fontSize: 12 },
});
```

#### Step 2 — Register the screen in the navigator

```typescript
// apps/mobile/src/navigation/RootNavigator.tsx
import { TransactionsScreen } from '../screens/TransactionsScreen';
import { TransactionDetailScreen } from '../screens/TransactionDetailScreen';

export type RootStackParamList = {
  Home: undefined;
  Transactions: undefined;
  TransactionDetail: { id: string };
};

export function RootNavigator() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="Home"              component={HomeScreen} />
      <Stack.Screen name="Transactions"      component={TransactionsScreen} />
      <Stack.Screen name="TransactionDetail" component={TransactionDetailScreen} />
    </Stack.Navigator>
  );
}
```

#### Step 3 — Navigate to it

```typescript
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/RootNavigator';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function HomeScreen() {
  const navigation = useNavigation<Nav>();
  return (
    <Button title="My Transactions" onPress={() => navigation.navigate('Transactions')} />
  );
}
```

### 11.2 Adding a New Navigation Stack

For apps with multiple top-level sections (Transactions, Contacts, Profile), use a Bottom Tab Navigator:

```typescript
// apps/mobile/src/navigation/RootNavigator.tsx
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

const Tab = createBottomTabNavigator();

export function RootNavigator() {
  return (
    <Tab.Navigator>
      <Tab.Screen name="Transactions" component={TransactionsScreen} />
      <Tab.Screen name="Contacts"     component={ContactsScreen} />
      <Tab.Screen name="Profile"      component={ProfileScreen} />
    </Tab.Navigator>
  );
}
```

Install the dependency:

```bash
pnpm --filter @tc/mobile add @react-navigation/bottom-tabs
```

### 11.3 Consuming the API

Both REST and GraphQL are available through `@tc/api-client`.

```typescript
import { apiFetch, gqlFetch } from '@tc/api-client';
import { TransactionDto, ContactDto } from '@tc/shared';

// REST
const transactions = await apiFetch<TransactionDto[]>('/transactions');

// GraphQL
const { transactions: txList } = await gqlFetch<{ transactions: TransactionDto[] }>(`
  query GetTransactions {
    transactions {
      id
      transactionNumber
      status
      stage
      propertyAddressLine1
      propertyCity
      contractPrice
    }
  }
`);
```

For real-time updates or offline support, consider adding [TanStack Query](https://tanstack.com/query/latest/docs/framework/react/react-native) to the mobile app:

```bash
pnpm --filter @tc/mobile add @tanstack/react-query
```

### 11.4 Shared UI Components

Place components used across multiple screens in `apps/mobile/src/components/`:

```typescript
// apps/mobile/src/components/Card.tsx
import { View, StyleSheet, ViewProps } from 'react-native';

interface CardProps extends ViewProps {
  children: React.ReactNode;
}

export function Card({ children, style, ...props }: CardProps) {
  return (
    <View style={[styles.card, style]} {...props}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
});
```

---

## 12. Database Reference

### 12.0 Domain Model Overview

The database uses PostgreSQL 16. All tables are created by migrations in `src/database/migrations/`.

| Table | Entity | Description |
|---|---|---|
| `users` | `UserEntity` | Auth identity — email, hashed password, status |
| `accounts` | `AccountEntity` | User profile — display name, timezone, preferences |
| `real_estate_organizations` | `OrganizationEntity` | Brokerage, title company, lender, etc. |
| `organization_memberships` | `OrganizationMembershipEntity` | Account ↔ Organization with role + permissions |
| `contacts` | `ContactEntity` | Buyers, sellers, third-party people/companies |
| `real_estate_transactions` | `TransactionEntity` | Core transaction record — property, financials, dates |
| `transaction_parties` | `TransactionPartyEntity` | Buyer/seller/agent/lender per transaction |
| `transaction_journals` | `TransactionJournalEntity` | Append-only audit trail (no updates or deletes) |
| `transaction_messages` | `TransactionMessageEntity` | Inbound/outbound email and SMS |
| `transaction_documents` | `TransactionDocumentEntity` | File attachments with version tracking |
| `transaction_tasks` | `TransactionTaskEntity` | Checklist items, supports task dependencies |
| `transaction_events` | `TransactionEventEntity` | Milestone dates and calendar events |
| `ai_interactions` | `AiInteractionEntity` | AI prompt/response audit log (append-only) |

**Key design rules:**
- `users` → `accounts` is a 1:1 relationship (one profile per auth user)
- `accounts` → `organization_memberships` → `organizations` is many-to-many with a role
- Most transaction sub-tables cascade delete when the parent transaction is deleted
- `transaction_journals` and `ai_interactions` are append-only — no `updatedAt`, no service update/delete methods
- Sensitive fields (`passwordHash`, `bodyHtml`, `storageKey`, `preferencesJson`) are decorated with `@HideField()` and never appear in GraphQL responses

### 12.1 Migration Commands

Run all commands from the `apps/api/` directory, or prefix with `pnpm --filter @tc/api`.

**Local (Docker PostgreSQL):**

| Command | What it does |
|---|---|
| `pnpm --filter @tc/api migration:run` | Apply all pending migrations to local DB |
| `pnpm --filter @tc/api migration:revert` | Undo the last applied migration on local DB |
| `pnpm --filter @tc/api migration:generate --name=<Name>` | Generate a migration from entity diff (uses local DB to compare) |
| `pnpm --filter @tc/api migration:show` | List applied and pending migrations on local DB |

**Dev (Neon — remote):**

| Command | What it does |
|---|---|
| `pnpm --filter @tc/api migration:run:dev` | Apply all pending migrations to Neon dev DB |
| `pnpm --filter @tc/api migration:revert:dev` | Undo the last applied migration on Neon dev DB |

**Production (Neon — remote, requires compiled JS):**

```bash
# Build the API first so dist/database/data-source.js exists:
pnpm --filter @tc/api build

# Then run migrations against the production Neon database:
pnpm --filter @tc/api migration:run:prod
```

> Production migrations use `APP_ENV=production`, which loads `.env.production` and compiles path `dist/database/migrations/*.js`. Never run dev or local migration commands against production.

**Migration naming convention:** Use `PascalCase` and describe what changes — `AddEmailIndexToUsers`, `CreateTransactionsTable`, `AddCategoryForeignKeyToProducts`.

### 12.2 Seeding

**Local (Docker):**

```bash
pnpm --filter @tc/api seed
```

**Dev (Neon):**

```bash
pnpm --filter @tc/api seed:dev
```

> There is no `seed:prod` — never seed production. Use real data entry or a separate migration for required bootstrap records.

Seeders live in `src/database/seeds/data/`. Each one:
- Checks `repo.count()` before inserting — safe to run multiple times
- Uses `repo.create([...])` + `repo.save()` — triggers TypeORM hooks
- Is called in order from `seed.ts` (respect foreign key dependencies)

**Shortcut — migrate + seed in one command:**

```bash
pnpm --filter @tc/api db:setup        # local: migration:run + seed
pnpm --filter @tc/api db:setup:dev    # dev:   migration:run:dev + seed:dev
```

**Adding a new seeder checklist:**
1. Create `src/database/seeds/data/<entity>.seed-data.ts`
2. Export an `async function seed<Entity>(dataSource: DataSource)`
3. Import and call it in `src/database/seeds/seed.ts` after its dependencies

### 12.3 Deploying to Cloud Environments

The project uses three environments — `local` (Docker), `dev` (Fly.io + Neon), and `production` (Fly.io + Neon). See `cloud-install-details.md` for the full one-time setup guide.

**Deploy API to dev:**

```bash
fly deploy --config fly.dev.toml
```

**Deploy API to production:**

```bash
fly deploy --config fly.toml
```

**Deploy web (Vercel — auto on push):**

Vercel is connected to the GitHub repo. Pushes to `main` trigger automatic deployments. For manual deploy:

```bash
# From repo root — requires Vercel CLI
vercel --cwd apps/web --prod            # production
vercel --cwd apps/web                   # preview (dev)
```

**Standard release workflow:**

```bash
# 1. Apply migrations to target environment
pnpm --filter @tc/api migration:run:dev       # or migration:run:prod

# 2. Deploy API
fly deploy --config fly.dev.toml              # or fly.toml for prod

# 3. Web deploys automatically via Vercel on git push
```

**Environment variable locations:**

| Env | API vars | Web vars |
|---|---|---|
| local | `apps/api/.env.local` | `apps/web/.env.local` |
| dev | Fly.io secrets (`fly secrets set --config fly.dev.toml`) | Vercel dashboard → dev project |
| production | Fly.io secrets (`fly secrets set --config fly.toml`) | Vercel dashboard → prod project |

---

## 13. Ports & URLs

### Local

| Service | URL | Notes |
|---|---|---|
| NestJS REST API | `http://localhost:3000/api/v1` | Global prefix set in `main.ts` |
| NestJS GraphQL | `http://localhost:3000/graphql` | Playground available in development |
| Next.js Web — Dashboard | `http://localhost:3001` | SSR + React |
| Next.js Web — Admin | `http://localhost:3001/admin` | Next.js admin pages (login at `/admin-login`) |
| Expo / React Native | `http://localhost:8081` | Expo DevTools; scan QR for device |
| PostgreSQL | `localhost:5432` | Docker; credentials in `apps/api/.env.local` |

### Dev (cloud)

| Service | URL | Notes |
|---|---|---|
| NestJS API | `https://tc-api-dev.fly.dev` | Fly.io app `tc-api-dev` |
| NestJS REST | `https://tc-api-dev.fly.dev/api/v1` | |
| NestJS GraphQL | `https://tc-api-dev.fly.dev/graphql` | |
| Next.js Web | Vercel preview URL | Set `NEXT_PUBLIC_API_URL=https://tc-api-dev.fly.dev` in Vercel dev project |
| PostgreSQL | Neon dev project | Connection string in Fly secrets + `apps/api/.env.dev` |

### Production (cloud)

| Service | URL | Notes |
|---|---|---|
| NestJS API | `https://tc-api.fly.dev` | Fly.io app `tc-api` |
| NestJS REST | `https://tc-api.fly.dev/api/v1` | |
| NestJS GraphQL | `https://tc-api.fly.dev/graphql` | |
| Next.js Web | Vercel production URL | Set `NEXT_PUBLIC_API_URL=https://tc-api.fly.dev` in Vercel prod project |
| PostgreSQL | Neon production project | Connection string in Fly secrets + `apps/api/.env.production` |

---

## 14. Conventions & Rules

### TypeScript
- Strict mode is on everywhere — no `any` without justification
- All entities double as GraphQL `@ObjectType()` — one class, no duplication
- DTOs that cross the API boundary belong in `@tc/shared`, not inside an app

### NestJS Modules
- One module per domain feature (users, accounts, transactions, contacts, …)
- Services own all business logic — controllers and resolvers only call services
- Use `exports: [Service]` in a module only when another module needs it
- Never use `synchronize: true` — always use migrations

### Database
- `passwordHash` is always decorated with `@HideField()` — never sent to clients
- Every new entity needs a migration file — even in development
- Seeders must be idempotent (check count before inserting)
- Foreign key names follow `FK_<TABLE>_<RELATION>` (e.g., `FK_ACCOUNTS_USER`)

### Next.js
- Default to Server Components; add `'use client'` only when hooks or browser APIs are needed
- All API calls go through `@tc/api-client` — no raw `fetch` calls in components
- Page-level data fetching in Server Components; client-side mutations via `'use client'` form/button components

### React Native
- All screens in `src/screens/`, all reusable components in `src/components/`
- Navigation types are declared in `RootNavigator.tsx` — always keep them up to date
- Same API client (`@tc/api-client`) as web — no duplicated fetch logic

### Git
- One migration per pull request per schema change
- Never commit `.env` (it contains real credentials) — only commit `.env.example`
- Never commit generated `src/schema.gql` — it is auto-generated at startup

### Testing
- Every service method has a corresponding unit test
- Mock external dependencies (repositories, other services) — never the module under test
- Use `describe` blocks to group by method name; use `it` for each scenario
- Tests live next to the source file they test: `users.service.spec.ts` beside `users.service.ts`

### Linting
- All lint errors are blocking — no merging with `eslint` errors
- `@typescript-eslint/no-explicit-any` is a warning, not an error — avoid `any` but don't be blocked by it
- Auto-fix before committing: `pnpm lint:fix`

---

## 15. Functional Testing — API Flows

This section documents every user-facing API flow that can be tested locally.
All commands assume the API is running at `http://localhost:3000` with seeded data.

**Setup for all flows:** save the base URL as a variable and get a JWT token:

```bash
API="http://localhost:3000/api/v1"
SEEDED_EMAIL="alice.tc@sunsetrealty.com"
PASSWORD="Password1!"

# Get a token for the seeded user
TOKEN=$(curl -s -X POST "$API/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$SEEDED_EMAIL\",\"password\":\"$PASSWORD\"}" \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['accessToken'])")
echo "$TOKEN"
```

---

### 15.1 User Registration & Login

**UI flow:**
1. Open `http://localhost:3001`
2. Click **Sign Up** (or navigate to `/signup`)
3. Fill in: name, email (`newuser@example.com`), phone, password (`Password1!`)
4. Submit → see success message: "Please check your email to verify your account"
5. Check the API console output for the verification URL (email sending is disabled locally)
6. Copy/paste that URL into the browser → "Email verified successfully"
7. Navigate to `/login`, enter credentials → logged in, redirected to dashboard

**API (curl):**
```bash
curl -s -X POST "$API/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "testuser@example.com",
    "password": "Password1!",
    "firstName": "Test",
    "lastName": "User",
    "cellPhone": "+15550001000"
  }'
```
Expected: `201` with `{"message":"Registration successful. Please check your email to verify your account."}`

The verification URL prints to the API console (email sending is disabled locally by default).

**Verify email:**
```bash
# Copy the token from the API console output, then:
curl -s "$API/auth/verify-email?token=<TOKEN_FROM_CONSOLE>"
```
Expected: `200` with `{"message":"Email verified successfully. You can now sign in."}`

**Login:**
```bash
curl -s -X POST "$API/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"alice.tc@sunsetrealty.com","password":"Password1!"}'
```
Expected: `200` with `accessToken`, `user`, and `account` in the response body.

**Get authenticated user:**
```bash
curl -s "$API/auth/me" -H "Authorization: Bearer $TOKEN"
```
Expected: `200` with logged-in user + account.

---

### 15.2 Contract Upload & Draft Transaction

Uploads a contract PDF, runs extraction + compliance, creates a draft transaction.

**UI flow:**
1. Log in at `http://localhost:3001` as any seeded user
2. In the sidebar, click **New Transaction** → **From Contract**
3. *(Optional)* Select a form template from the dropdown (fetched from `GET /form-templates?organizationId=...`)
4. Drag & drop or click to select a contract PDF
5. Click **Upload & Extract**
6. Wait for the upload progress bar to complete
7. On success → redirected to the **Review** page with extracted data (parties, dates, price)
8. On error:
   - `RPA_NOT_FOUND` (422) — the PDF is not a Residential Purchase Agreement
   - `DUPLICATE_TRANSACTION` (409) — same property address already exists in this org
9. The draft transaction is created with status `DRAFT` — visible at `/transactions`

**API (curl):**
```bash
curl -s -X POST "$API/document-extraction/extract-and-draft" \
  -H "Authorization: Bearer $TOKEN" \
  -F "files=@/path/to/rpa-contract.pdf" \
  -F 'organizationId=<SUNSET_ORG_UUID>' \
  -F 'createdByAccountId=<ACCOUNT_UUID>'
```

**Using the seeded data (get UUIDs from existing org/account):**
```bash
# Grab the first active org ID
ORG_ID=$(curl -s "$API/organizations" | python3 -c "
import sys,json
orgs = json.load(sys.stdin)
for o in orgs:
  if o['status'] == 'active':
    print(o['id'])
    break
")

# Grab the account ID from the auth/me response
ACCT_ID=$(curl -s "$API/auth/me" -H "Authorization: Bearer $TOKEN" \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['account']['id'])")

# Upload — uses the stub extraction if LLM keys not configured
curl -s -X POST "$API/document-extraction/extract-and-draft" \
  -H "Authorization: Bearer $TOKEN" \
  -F "files=@apps/api/test/fixtures/sample-rpa.pdf" \
  -F "organizationId=$ORG_ID" \
  -F "createdByAccountId=$ACCT_ID"
```

Expected: `201` with `DraftWithComplianceResult` containing:
- `transaction` — the draft transaction (status `DRAFT`)
- `extractionResult` — extracted fields (parties, price, dates)
- `compliance` — blocker/warning report
- `document` — the stored document row with `metadataJson`

**Duplicate check:** Upload the same PDF again with the same org — expect `409 DUPLICATE_TRANSACTION`.

**Without RPA:** Upload a non-RPA PDF — expect `422 RPA_NOT_FOUND`.

**With form template:**
```bash
# Add the optional formTemplateId parameter
curl -s -X POST "$API/document-extraction/extract-and-draft" \
  -H "Authorization: Bearer $TOKEN" \
  -F "files=@sample-rpa.pdf" \
  -F "organizationId=$ORG_ID" \
  -F "createdByAccountId=$ACCT_ID" \
  -F "formTemplateId=<TEMPLATE_UUID>"
```

---

### 15.3 Compliance Check

Run compliance validation on a PDF without creating a transaction.

**UI flow:**
1. Navigate to `/transactions/new/contract` and upload a PDF as in §15.2
2. After extraction, the review page opens to **Step 4: Compliance**
3. Three tiers are displayed:
   - **Red section (Blockers):** Critical missing data (purchase price, signatures, property address). Each blocker must be resolved before submission.
   - **Amber section (Warnings):** Informational issues (missing phone, low confidence). Does not block submission.
   - **Neutral section (All Checks):** Every individual check with pass/fail/warn status.
4. Click **Re-upload** in the blocker section to replace the PDF with a corrected version

**API (curl):**
```bash
curl -s -X POST "$API/document-extraction/compliance-check" \
  -H "Authorization: Bearer $TOKEN" \
  -F "files=@sample-rpa.pdf"
```
Expected: `200` with `pdfType`, `extractionResult`, and `compliance` (blockers/warnings/checks).

Key things to inspect in the response:
- `compliance.blockers[]` — red items blocking submission (e.g., missing purchase price)
- `compliance.warnings[]` — amber items (e.g., missing buyer phone)
- `compliance.checks[]` — all individual checks with their `status: 'pass' | 'fail' | 'warn'`
- `pdfType` — `'digital_acroform'` or `'scanned_or_flattened'`

---

### 15.4 Wizard Flow (Full End-to-End)

Complete walkthrough from login to submission.

**UI flow:**
1. Open `http://localhost:3001/login`
2. Log in as `alice.tc@sunsetrealty.com` / `Password1!`
3. Sidebar → **New Transaction** → **From Contract**
4. **Step 1 — Upload:** Select a form template (optional), upload a contract PDF, click upload
5. After extraction completes, the review page loads with scroll-spy navigation:
   - **Compliance & Issues** — extraction warnings, blocker badge count
   - **Property** — address, APN, MLS number
   - **Transaction Terms** — price, earnest money, closing date
   - **Parties** — grouped by role, email links, signature status
   - **Dates & Deadlines** — inspection/loan/appraisal periods
   - **Contingencies** — each contingency with its status
6. **Step 4 — Compliance:** Review blockers (red), warnings (amber), and all checks
   - If blockers exist, use **Re-upload** to upload a corrected PDF
7. **Step 5 — Confirm:**
   - Submit button behaviour:
     - **Disabled + tooltip** when `compliance.blockers.length > 0`
     - **Enabled** when blockers = 0
   - Fill in buyer agent name/email, seller agent name/email, TC name/email
   - Click **Submit Contract**
8. On success → redirected to the transaction detail page
9. Seeded CONTRACT + DISCLOSURES stages are now active

---

### 15.5 Contract Submission

Submits a draft transaction for review — activates CONTRACT and DISCLOSURES stages.

**Prerequisites:** The transaction must have zero compliance blockers.

**UI flow:**
1. Start from a draft transaction with no blockers (see §15.4 steps 1–6)
2. On the **Confirm** step, fill in all required fields:
   - Buyer Agent name and email
   - Seller Agent name and email
   - Transaction Coordinator name and email (optional but recommended)
3. Verify the **Submit** button is enabled (no blockers)
4. Click **Submit Contract**
5. Success → redirected to the transaction detail page
6. Check that CONTRACT and DISCLOSURES stage badges show as `active`
7. Welcome emails are sent (skipped locally if Mailgun not configured)
8. **To test blocker enforcement:**
   - Upload a PDF with missing critical fields (e.g., no purchase price)
   - On the Confirm step, verify the Submit button is disabled
   - Hover over the button to see the tooltip with blocker count
   - Re-upload a corrected PDF → submit re-enables

```bash
# Get the draft transaction ID
TX_ID=$(curl -s "$API/transactions" -H "Authorization: Bearer $TOKEN" \
  | python3 -c "
import sys,json
txs = json.load(sys.stdin)
for t in txs:
  if t['status'] == 'draft':
    print(t['id'])
    break
")

# Submit
curl -s -X POST "$API/transactions/$TX_ID/submit-contract" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "buyerAgentName": "Alice Agent",
    "buyerAgentEmail": "alice.agent@example.com",
    "sellerAgentName": "Bob Broker",
    "sellerAgentEmail": "bob.broker@example.com",
    "tcName": "Carol Coordinator",
    "tcEmail": "carol@example.com"
  }'
```

Expected: `201` with:
- `submission` — auto-incremented submission #1, status `UNDER_REVIEW`
- `emailsSent[]` — addresses welcome emails were delivered to

**With blockers present:** Submit a transaction with unresolved blockers — expect `422 BLOCKERS_PENDING`.

**Check that stages are activated:**
```bash
curl -s "$API/transactions/$TX_ID/stages" -H "Authorization: Bearer $TOKEN"
```
Expected: CONTRACT and DISCLOSURES stages both present with status `active`.

---

### 15.6 Document Re-upload (Versioning)

Upload an additional form to an existing transaction, or re-upload a corrected RPA.

**UI flow:**
1. Open an existing transaction's detail page (seeded data at `/transactions`)
2. Scroll to the **Documents** section
3. Click **Upload Additional Document**
4. Select a PDF and the target stage (e.g., `disclosures`)
5. After upload, the new document appears in the list with its version number
6. **Versioning behaviour:**
   - Upload the same form code twice → old version marked SUPERSEDED, new version has `versionNo` incremented
   - Upload a corrected RPA → old version void-suggested (UI shows prompt to void)
   - Upload TDS to `contract` stage → auto-reclassified to `disclosures` stage

```bash
curl -s -X POST "$API/document-extraction/upload-and-extract" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@sample-tds.pdf" \
  -F "transactionId=$TX_ID" \
  -F "stage=disclosures" \
  -F "documentType=disclosure" \
  -F "title=Transfer Disclosure Statement"
```

Expected: `201` with `UploadAndExtractResult` including:
- `resolvedStage` — may differ from `submittedStage` if auto-reclassified
- `reclassified` — `true` if form was moved to a different stage
- `hasPreviousVersion` — `true` if a previous version of this form existed
- `versionAction` — `'none'` | `'superseded'` | `'void_suggested'`
- `versionComparison` — field-by-field diff against the previous version

**Scenarios to test:**
1. Upload TDS → resolves to DISCLOSURES stage, `reclassified: true`
2. Upload same form code twice → `versionAction: 'superseded'`
3. Upload corrected RPA → `versionAction: 'void_suggested'` (critical form + material change)

---

### 15.7 Transaction Lifecycle

**UI flow:**
1. Sidebar → **Transactions** → see all transactions for your org
2. Click any transaction to open its detail page
3. **Stage swimlane** shows all 9 stages with the current stage highlighted
4. Click a stage badge to view its details and documents
5. **Void a transaction:**
   - From the transaction detail page, click **Void Transaction**
   - Confirm the dialog → status changes to `CANCELLED`
   - The transaction is soft-deleted and hidden from default lists

**API (curl):**
```bash
curl -s "$API/transactions" -H "Authorization: Bearer $TOKEN"
```

**Get by organization:**
```bash
curl -s "$API/transactions/organization/$ORG_ID" -H "Authorization: Bearer $TOKEN"
```

**Update status:**
```bash
curl -s -X PATCH "$API/transactions/$TX_ID/status" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"active"}'
```

**Activate a stage:**
```bash
curl -s -X POST "$API/transactions/$TX_ID/stages" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"stage":"inspection"}'
```

**Void (soft-delete):**
```bash
curl -s -X PATCH "$API/transactions/$TX_ID/void" \
  -H "Authorization: Bearer $TOKEN"
```
Expected: status changes to `CANCELLED`.

---

### 15.8 Page-Routed Extraction Pipeline

For multi-form PDFs (e.g., a bundle with RPA + AD + TDS). Uses SSE for progress streaming.

**UI flow:**
1. Navigate to `/transactions/new/contract`
2. Upload a multi-form bundle PDF (e.g., RPA + AD + TDS combined)
3. The pipeline processes the PDF through stages:
   - **Splitting** — separates individual form pages
   - **Classifying** — identifies each form (RPA, AD, TDS, etc.)
   - **Grouping** — groups pages by form family
   - **Extracting** — runs extraction per form
   - **Complete** — all forms extracted
4. Progress is shown as a real-time progress bar (SSE-powered)
5. On completion, each extracted form appears as its own section

```bash
# Step 1: Start the job
JOB=$(curl -s -X POST "$API/document-extraction/extract-routed" \
  -H "Authorization: Bearer $TOKEN" \
  -F "files=@sample-bundle.pdf")
echo "$JOB"
# → {"jobId":"abc-123"}

JOB_ID=$(echo "$JOB" | python3 -c "import sys,json;print(json.load(sys.stdin)['jobId'])")

# Step 2: Stream progress (SSE)
curl -s -N "$API/document-extraction/extract-routed/$JOB_ID/progress"

# Step 3 (after SSE completes): Get results
curl -s "$API/document-extraction/extract-routed/$JOB_ID/result"
```

---

### 15.9 Send Upload Link (Email Invite)

Generates a signed 7-day link and emails it to a third party (e.g., a seller agent who needs to upload disclosures).

**UI flow:**
1. Open an existing transaction
2. Click **Request Documents** → **Send Upload Link**
3. Enter the recipient's email and name
4. Select the target stage (e.g., `disclosures`)
5. Click **Send** → a signed link is emailed to the recipient (prints to console locally)
6. The recipient opens the link → public upload page (no login required)
7. Recipient selects and uploads a PDF → document is stored under the transaction
8. **No auth required:** The link contains a JWT token scoped to this specific transaction+stage

**API (curl):**

```bash
curl -s -X POST "$API/document-extraction/send-upload-link" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "transactionId": "'"$TX_ID"'",
    "stage": "disclosures",
    "recipientEmail": "partner@example.com",
    "recipientName": "Partner"
  }'
```

Expected: `201` with `{"uploadUrl":"http://localhost:3001/upload/<JWT>"}` (email is skipped locally since Mailgun is not configured).

---

### 15.10 Support Admin Access

Platform support admin (`roles: [SUPPORT_ADMIN]`) can access admin pages at `http://localhost:3001/admin`. The admin UI lives in the **Next.js web app** (not the API).

**UI flow:**
1. Open `http://localhost:3001/admin-login` in the browser (dark-themed admin login page)
2. Log in with `admin@tcplatform.com` / `Password1!`
3. You are redirected to `http://localhost:3001/admin` — **Dashboard** with real stats (user count, pending orgs)
4. Navigate to **Users** → table of all platform users (support_admin accounts excluded), with actions:
   - Enable / Disable user account
   - Resend verification email (with optional email change)
   - Edit user profile
   - Assign user to a brokerage
5. Navigate to **Organizations** → table with approve/reject buttons for pending brokerages; **Create Organization** button
6. Navigate to **Audit Logs** → time-ordered list of platform actions (registration, login, transaction creation, etc.)
7. The sidebar always shows: Dashboard, Users, Organizations, Audit Logs
8. `support_admin` users cannot modify other `support_admin` accounts — 403 Forbidden on mutation endpoints

**API (curl):**

```bash
ADMIN_TOKEN=$(curl -s -X POST "$API/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@tcplatform.com","password":"Password1!"}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['accessToken'])")

# Fetch admin dashboard stats
curl -s "http://localhost:3000/admin/api/dashboard" -H "Authorization: Bearer $ADMIN_TOKEN"

# List all platform users
curl -s "http://localhost:3000/admin/api/users" -H "Authorization: Bearer $ADMIN_TOKEN"
```

### 15.11 Admin-Provisioned Brokerage (Create Org + Invite)

Admin creates a brokerage, which creates a pending user + active org + sends an invite email to the broker. The broker then registers via the invite link.

**UI flow (admin):**
1. Log in as admin at `http://localhost:3001/admin-login`
2. Navigate to **Organizations** → click **Create Organization**
3. Fill in: Organization Name, Type (BROKERAGE), Broker Email, Broker First/Last Name, Broker Phone
4. Click **Create Organization & Send Invite**
5. The invite URL is logged to the API console if `CREATE_ACCT_EMAIL_NOTIFY_ENABLED=false`

**UI flow (broker — register via invite):**
1. Open the invite URL: `http://localhost:3001/register/invite?token=xxx`
2. The form displays the broker's email (pre-filled, read-only) and account details
3. Fill in: First Name, Last Name, Display Name, Phone, Password
4. Submit — creates account, activates user, creates membership (broker_admin)
5. Log in at `/login` with the registered email/password

**API (curl):**

```bash
ADMIN_TOKEN=$(curl -s -X POST "http://localhost:3000/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@tcplatform.com","password":"Password1!"}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['accessToken'])")

# Create org + user + send invite
curl -s -X POST "http://localhost:3000/admin/api/organizations" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Acme Realty",
    "type": "BROKERAGE",
    "brokerEmail": "broker@acmerealty.com",
    "brokerFirstName": "John",
    "brokerLastName": "Smith",
    "brokerPhone": "555-0100"
  }'

# Get invite info from token (copy the token from the API console log)
curl -s "http://localhost:3000/api/v1/auth/invite-info?token=xxx"

# Register with invite
curl -s -X POST "http://localhost:3000/api/v1/auth/register-with-invite" \
  -H "Content-Type: application/json" \
  -d '{
    "token": "xxx",
    "firstName": "John",
    "lastName": "Smith",
    "displayName": "John Smith",
    "cellPhone": "555-0100",
    "password": "Password1!"
  }'
```

### 15.12 Broker Team Management

Broker admins can manage team members (approve/reject pending join requests, remove members) from the dashboard.

**UI flow:**
1. Log in as `sarah.broker@sunsetrealty.com` / `Password1!` at `/login`
2. Sidebar → **Broker** → **Team Members** (`/dashboard/team/members`)
3. The page shows three sections:
   - **Pending Approval** — members who requested to join (approve/reject buttons)
   - **Active Members** — current team members (remove button for broker_admin)
   - **Others** — rejected members
4. **Invite Member** link in sidebar → (future: send email invitation)

**API (curl):**

```bash
# Login as broker admin
TOKEN=$(curl -s -X POST "http://localhost:3000/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"sarah.broker@sunsetrealty.com","password":"Password1!"}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['accessToken'])")

# Get user info to find account ID
ME=$(curl -s "http://localhost:3000/api/v1/auth/me" \
  -H "Authorization: Bearer $TOKEN")
ACCOUNT_ID=$(echo $ME | python3 -c "import sys,json;print(json.load(sys.stdin)['account']['id'])")

# Get org members
curl -s "http://localhost:3000/api/v1/organization-memberships/my-org-members/$ACCOUNT_ID" \
  -H "Authorization: Bearer $TOKEN"

# Approve a pending membership (replace MEMBERSHIP_ID)
curl -s -X PATCH "http://localhost:3000/api/v1/organization-memberships/MEMBERSHIP_ID/approve" \
  -H "Authorization: Bearer $TOKEN"

# Reject a pending membership
curl -s -X PATCH "http://localhost:3000/api/v1/organization-memberships/MEMBERSHIP_ID/reject" \
  -H "Authorization: Bearer $TOKEN"
```

### 15.13 TC Assignment

Transactions can have a coordinator assigned via the `assignedCoordinatorAccountId` nullable FK. Broker admins can search and assign a TC from the transaction detail page.

**UI flow:**
1. Log in as `sarah.broker@sunsetrealty.com` / `Password1!`
2. Navigate to a transaction (e.g., `/dashboard/transactions/{id}`)
3. Click **Assign Coordinator** link
4. Type a search query in the coordinator search field (searches by display name and email)
5. Select a coordinator from the results
6. Click **Save** to assign the TC to the transaction

**API (curl):**

```bash
# Login as broker admin
TOKEN=$(curl -s -X POST "http://localhost:3000/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"sarah.broker@sunsetrealty.com","password":"Password1!"}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['accessToken'])")

# Search coordinators
curl -s "http://localhost:3000/api/v1/accounts/search-coordinators?q=alice" \
  -H "Authorization: Bearer $TOKEN"

# Assign coordinator to transaction (replace TX_ID and COORD_ACCT_ID)
curl -s -X PATCH "http://localhost:3000/api/v1/transactions/TX_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"assignedCoordinatorAccountId": "COORD_ACCT_ID"}'
```

---

## 16. Document Intelligence Package

The `packages/document-intelligence` package owns all PDF processing logic, LLM prompt definitions, stage reasoning, form comparison, and compliance validation. It has **no NestJS dependency** — develop and test entirely without running the application stack. See **§20.5** for the full AI engineer workflow.

### 16.1 Subsystems Overview

| Subsystem | Location | Purpose |
|-----------|----------|---------|
| AcroForm extraction | `src/acroform/` | Reads fillable PDF form fields directly via `pdf-lib` (no LLM cost) |
| LLM extraction | `src/extractor/` | Per-page and per-form JSON extraction via Anthropic/Gemini |
| Form definitions | `src/extractor/forms/` | System prompts + JSON templates for each CAR form and version |
| Form identification | `src/identifier/` | Detects which CAR form a PDF page belongs to |
| PDF splitting | `src/splitter/` | Page-level PDF splitting for per-page routing |
| Stage reasoning | `src/reasoner/` | LLM reasoning across extracted forms per stage |
| Compliance validation | `src/validator/` | Deterministic pass/fail/warn rules per stage |
| Form comparison | `src/comparison/` | Version diffing + material change detection (RPA, SCO) |
| Form sequence | `src/sequence/` | Form family grouping and cross-version resolution |
| Page conversion | `src/page-converter/` | PDF→PNG rendering via `pdfjs-dist` + OffscreenCanvas |
| Pipeline orchestration | `src/pipeline/` | Orchestrates extraction → identification → reasoning → validation |
| Blocker/warning catalogs | `src/validator/stages/` | Constant-code system per stage (e.g. `BLOCKER-RPA-1`, `WARN-TDS-10001`) |

### 16.2 Deploying prompt changes

After editing a form definition or prompt in `packages/document-intelligence/`:

```bash
pnpm --filter @tc/document-intelligence build     # compile to dist/
```

Then re-deploy the API (the API resolves `@tc/document-intelligence` via tsconfig path mapping to `dist/`). On Fly.io:

```bash
fly deploy --config fly.dev.toml                  # dev
fly deploy --config fly.toml                      # production
```

For the AI test loop (no build needed): see §20.5.

---

## 17. Unit Testing

### 17.1 Test Stack Overview

| Layer | Framework | Libraries |
|---|---|---|
| API unit (NestJS) | Jest + ts-jest | `@nestjs/testing` |
| Web unit (Next.js) | Jest + ts-jest | `@testing-library/react`, `@testing-library/jest-dom` |
| Mobile (React Native) | Jest + jest-expo | `@testing-library/react-native`, `@testing-library/jest-native` |


Config files:

```
apps/api/jest.config.ts        ← node environment, ts-jest transform
apps/web/jest.config.ts        ← jsdom environment, next/jest wrapper
apps/web/jest.setup.ts         ← imports @testing-library/jest-dom matchers
apps/mobile/jest.config.ts     ← jest-expo preset, RN transform whitelist
```

### 17.2 Running Tests

#### All apps at once

```bash
pnpm test             # run all tests across the monorepo (Turbo)
pnpm test:coverage    # with coverage reports
```

#### Individual apps

```bash
pnpm --filter @tc/api     test
pnpm --filter @tc/web     test
pnpm --filter @tc/mobile  test
```

#### Watch mode (during development)

```bash
pnpm --filter @tc/api     test:watch
pnpm --filter @tc/web     test:watch
pnpm --filter @tc/mobile  test:watch
```

#### Single file

```bash
# from inside apps/api/
npx jest src/modules/users/users.service.spec.ts
npx jest --testPathPattern=users.service
```

Coverage reports are written to `apps/<app>/coverage/` and include an HTML report at `coverage/index.html`.

---

### 17.3 NestJS — Testing Services

Services are the most important layer to test. They hold all business logic.

**Key pattern:** inject a mocked repository using `getRepositoryToken`.

```typescript
// apps/api/src/modules/users/users.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { UsersService } from './users.service';
import { UserEntity, UserStatus } from './entities/user.entity';

// Factory keeps tests DRY — matches the actual UserEntity shape
const mockUser = (): UserEntity => ({
  id: 'uuid-1',
  email: 'alice.tc@sunsetrealty.com',
  phone: '+15550001002',
  passwordHash: '$2a$10$hashedvalue',
  status: UserStatus.ACTIVE,
  emailVerifiedAt: null,
  lastLoginAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
});

describe('UsersService', () => {
  let service: UsersService;
  let repo: jest.Mocked<Repository<UserEntity>>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: getRepositoryToken(UserEntity),
          useValue: {
            find:    jest.fn(),
            findOne: jest.fn(),
            create:  jest.fn(),
            save:    jest.fn(),
            remove:  jest.fn(),
            count:   jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(UsersService);
    repo    = module.get(getRepositoryToken(UserEntity));
  });

  // ── findAll ──────────────────────────────────────────────────────────────
  describe('findAll', () => {
    it('returns an array of users', async () => {
      repo.find.mockResolvedValue([mockUser()]);
      const result = await service.findAll();
      expect(result).toHaveLength(1);
      expect(repo.find).toHaveBeenCalledTimes(1);
    });
  });

  // ── findOne ──────────────────────────────────────────────────────────────
  describe('findOne', () => {
    it('returns a user when found', async () => {
      repo.findOne.mockResolvedValue(mockUser());
      const result = await service.findOne('uuid-1');
      expect(result.email).toBe('alice.tc@sunsetrealty.com');
    });

    it('throws NotFoundException when user does not exist', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.findOne('bad-id')).rejects.toThrow(NotFoundException);
    });
  });

  // ── create ───────────────────────────────────────────────────────────────
  describe('create', () => {
    it('saves a new user with a hashed password', async () => {
      repo.findOne.mockResolvedValue(null); // email not taken
      repo.create.mockReturnValue(mockUser());
      repo.save.mockResolvedValue(mockUser());

      const result = await service.create({
        email: 'alice.tc@sunsetrealty.com',
        phone: '+15550001002',
        password: 'Password1!',
      });

      expect(repo.save).toHaveBeenCalledTimes(1);
      expect(result.passwordHash).not.toBe('Password1!'); // must be hashed
    });

    it('throws ConflictException when email already exists', async () => {
      repo.findOne.mockResolvedValue(mockUser()); // email taken
      await expect(
        service.create({ email: 'alice.tc@sunsetrealty.com', password: 'pw' }),
      ).rejects.toThrow(ConflictException);
    });
  });
});
```

---

### 17.4 NestJS — Testing Controllers

Controllers are thin wrappers — only test that they call the right service method and return the result. Use a mocked service.

```typescript
// apps/api/src/modules/users/users.controller.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { UserEntity, UserStatus } from './entities/user.entity';

const mockUser = (): UserEntity =>
  ({
    id: 'uuid-1',
    email: 'alice.tc@sunsetrealty.com',
    phone: '+15550001002',
    passwordHash: '$2a$10$hash',
    status: UserStatus.ACTIVE,
    emailVerifiedAt: null,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }) as UserEntity;

describe('UsersController', () => {
  let controller: UsersController;
  let service: jest.Mocked<UsersService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        {
          provide: UsersService,
          useValue: {
            findAll:     jest.fn(),
            findOne:     jest.fn(),
            findByEmail: jest.fn(),
            create:      jest.fn(),
            update:      jest.fn(),
            remove:      jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get(UsersController);
    service    = module.get(UsersService) as jest.Mocked<UsersService>;
  });

  it('findAll delegates to service', async () => {
    service.findAll.mockResolvedValue([mockUser()]);
    const result = await controller.findAll();
    expect(result).toHaveLength(1);
    expect(service.findAll).toHaveBeenCalledTimes(1);
  });

  it('findOne passes id to service', async () => {
    service.findOne.mockResolvedValue(mockUser());
    const result = await controller.findOne('uuid-1');
    expect(result.id).toBe('uuid-1');
    expect(service.findOne).toHaveBeenCalledWith('uuid-1');
  });
});
```

---

### 17.5 NestJS — Integration Tests with TestingModule

Integration tests spin up a real NestJS module with a real SQLite in-memory database. Use these for testing that your module, service, and DB layer work together correctly.

```typescript
// apps/api/src/modules/users/users.integration.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from './users.module';
import { UsersService } from './users.service';
import { UserEntity } from './entities/user.entity';

describe('UsersService (integration)', () => {
  let service: UsersService;
  let module: TestingModule;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [
        // In-memory SQLite for fast, isolated integration tests
        // Requires: pnpm --filter @tc/api add -D better-sqlite3 @types/better-sqlite3
        TypeOrmModule.forRoot({
          type: 'better-sqlite3',
          database: ':memory:',
          entities: [UserEntity],
          synchronize: true, // OK for tests — no migration files needed
        }),
        UsersModule,
      ],
    }).compile();

    service = module.get(UsersService);
  });

  afterAll(async () => {
    await module.close();
  });

  it('creates and retrieves a user', async () => {
    const created = await service.create({
      email: 'test.agent@sunsetrealty.com',
      phone: '+15550009001',
      password: 'Password1!',
    });

    expect(created.id).toBeDefined();

    const found = await service.findOne(created.id);
    expect(found.email).toBe('test.agent@sunsetrealty.com');
    expect(found.passwordHash).not.toBe('Password1!');
    expect(found.status).toBe('active');
  });
});
```

> Integration tests are slower than unit tests. Keep them focused on DB interactions or complex multi-step flows. For simple logic, prefer unit tests.

---

### 17.6 Next.js — Testing Server Components

Server Components are async functions that return JSX. Test them by awaiting the component and asserting on the rendered output using `@testing-library/react`.

```typescript
// apps/web/src/app/transactions/page.spec.tsx
import { render, screen } from '@testing-library/react';
import TransactionsPage from './page';

// Mock the API client — we don't want real HTTP in unit tests
jest.mock('@tc/api-client', () => ({
  apiFetch: jest.fn(),
}));

import { apiFetch } from '@tc/api-client';

describe('TransactionsPage', () => {
  it('renders a list of transactions', async () => {
    (apiFetch as jest.Mock).mockResolvedValue([
      {
        id: 'tx-1',
        transactionNumber: 'TXN-2024-0001',
        propertyAddressLine1: '456 Maple Street',
        propertyCity: 'Pasadena',
        status: 'under_contract',
        stage: 'inspection',
        closeOfEscrowAt: '2024-04-01',
        createdAt: '2024-03-01',
        updatedAt: '2024-03-04',
      },
    ]);

    // Server Components are async — await them before rendering
    render(await TransactionsPage());

    expect(screen.getByText('TXN-2024-0001')).toBeInTheDocument();
    expect(screen.getByText(/456 Maple Street/)).toBeInTheDocument();
    expect(screen.getByText('under_contract')).toBeInTheDocument();
  });

  it('renders empty table when no transactions', async () => {
    (apiFetch as jest.Mock).mockResolvedValue([]);
    render(await TransactionsPage());
    expect(screen.queryByRole('row')).not.toBeInTheDocument();
  });
});
```

---

### 17.7 Next.js — Testing Client Components

Client components use `userEvent` for interaction testing.

```typescript
// apps/web/src/app/transactions/UpdateStatusButton.spec.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UpdateStatusButton } from './UpdateStatusButton';

// Mock fetch — we don't want real HTTP in unit tests
global.fetch = jest.fn().mockResolvedValue({ ok: true });

describe('UpdateStatusButton', () => {
  it('renders the button', () => {
    render(<UpdateStatusButton transactionId="tx-1" />);
    expect(screen.getByRole('button', { name: /mark closed/i })).toBeInTheDocument();
  });

  it('shows loading state while saving', async () => {
    render(<UpdateStatusButton transactionId="tx-1" />);
    const button = screen.getByRole('button', { name: /mark closed/i });
    await userEvent.click(button);
    expect(screen.getByText(/saving/i)).toBeInTheDocument();
  });
});
```

**Matcher reference** (provided by `@testing-library/jest-dom`):

```typescript
expect(element).toBeInTheDocument();
expect(element).toBeVisible();
expect(element).toBeDisabled();
expect(element).toHaveTextContent('some text');
expect(element).toHaveValue('input value');
expect(element).toHaveClass('my-class');
```

---

### 17.8 React Native — Testing Screens & Components

Use `@testing-library/react-native` — the API mirrors the web testing library.

```typescript
// apps/mobile/src/screens/TransactionsScreen.spec.tsx
import { render, screen, waitFor } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import { TransactionsScreen } from './TransactionsScreen';

// Wrap in NavigationContainer so useNavigation() works
function renderWithNav(ui: React.ReactElement) {
  return render(<NavigationContainer>{ui}</NavigationContainer>);
}

describe('TransactionsScreen', () => {
  it('shows a loading state then renders transactions', async () => {
    renderWithNav(<TransactionsScreen />);
    // After API resolves, transactions appear
    await waitFor(() => {
      expect(screen.getByText('TXN-2024-0001')).toBeTruthy();
    });
  });
});
```

**Testing navigation behaviour:**

```typescript
// apps/mobile/src/screens/HomeScreen.spec.tsx
import { render, screen, fireEvent } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { HomeScreen } from './HomeScreen';
import { TransactionsScreen } from './TransactionsScreen';

const Stack = createNativeStackNavigator();

function TestNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen name="Home"         component={HomeScreen} />
        <Stack.Screen name="Transactions" component={TransactionsScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

it('navigates to Transactions screen on button press', async () => {
  render(<TestNavigator />);
  fireEvent.press(screen.getByText('My Transactions'));
  expect(await screen.findByText('Transactions')).toBeTruthy();
});
```

**Testing a screen that calls the API:**

```typescript
// apps/mobile/src/screens/TransactionsScreen.spec.tsx
import { render, screen, waitFor } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import { TransactionsScreen } from './TransactionsScreen';

jest.mock('@tc/api-client', () => ({
  apiFetch: jest.fn().mockResolvedValue([
    {
      id: 'tx-1',
      transactionNumber: 'TXN-2024-0001',
      propertyAddressLine1: '456 Maple Street',
      propertyCity: 'Pasadena',
      status: 'under_contract',
      stage: 'inspection',
      createdAt: '2024-03-01',
      updatedAt: '2024-03-04',
    },
  ]),
}));

it('displays transactions after loading', async () => {
  render(
    <NavigationContainer>
      <TransactionsScreen />
    </NavigationContainer>,
  );
  await waitFor(() => {
    expect(screen.getByText('TXN-2024-0001')).toBeTruthy();
    expect(screen.getByText(/456 Maple Street/)).toBeTruthy();
  });
});
```

**React Native matcher reference** (provided by `@testing-library/jest-native`):

```typescript
expect(element).toBeOnTheScreen();
expect(element).toHaveTextContent('text');
expect(element).toBeDisabled();
expect(element).toHaveProp('accessibilityLabel', 'label');
expect(element).toHaveStyle({ color: '#fff' });
```

---

### 17.9 Adding Tests for a New Module (Checklist)

When adding a new module (e.g., `property-listings`), create these test files alongside the source:

```
src/modules/property-listings/
├── entities/
│   └── property-listing.entity.ts
├── dto/
│   ├── create-property-listing.input.ts
│   └── update-property-listing.input.ts
├── property-listings.module.ts
├── property-listings.service.ts
├── property-listings.service.spec.ts      ← Unit test: mock repo, test each method
├── property-listings.controller.ts
├── property-listings.controller.spec.ts   ← Unit test: mock service, test delegation
├── property-listings.resolver.ts
├── property-listings.resolver.spec.ts     ← Unit test: mock service, test queries/mutations
└── property-listings.integration.spec.ts  ← Integration test: real in-memory DB
```

**Service test checklist per method:**
- Happy path (returns correct data)
- Not found → throws `NotFoundException`
- Duplicate / conflict → throws `ConflictException`
- Invalid input (if not caught by `class-validator`)

---

## 18. Playwright E2E Testing

End-to-end tests live in `apps/web/e2e/` and use Playwright to test the web UI
against a real backend with mock extraction data — no LLM calls, deterministic
results, CI-safe.

### 18.1 Architecture

The framework uses **browser-level API route interception** via `page.route()`
instead of mocking at the service layer. When the browser's JavaScript calls
`POST /api/v1/document-extraction/extract-and-draft`, Playwright returns a mock
response without the request ever reaching the server:

```
Browser (React app)  ── POST /extract-and-draft ──▶  Playwright intercept
                                                       │
                                                       ▼
                                                  Mock JSON response
                                                  (transaction, extraction,
                                                   compliance data)
                                                       │
                                                       ▼
Browser stores in sessionStorage ──▶ Review wizard renders from mock data
```

The API already supports a `mockExtractions` body field on all three extraction
endpoints that skips LLM calls when present. The Playwright tests go further by
intercepting at the browser level, which means:

- **Zero LLM calls** — deterministic, free, fast
- **Zero DB writes** — except auth, which uses the real login flow
- **Real UI state** — sessionStorage is populated by the real client code
- **No API changes needed** — the existing infrastructure handles everything

### 18.2 Test Structure

```
apps/web/e2e/
├── auth.setup.ts                   # One-time login → saved storage state
├── playwright.config.ts            # auth-setup + chrome projects
├── helpers/
│   ├── constants.ts                # URLs, test credentials, file paths
│   ├── api-intercepts.ts           # page.route() helpers (extract, submit)
│   └── mock-data.ts                # Extraction data + response constructors
├── pages/
│   ├── LoginPage.ts                # Email/password form
│   ├── ContractUploadPage.ts       # File upload + extract button
│   └── ContractReviewPage.ts       # 5-step wizard
├── fixtures/
│   ├── dummy.pdf                   # Minimal valid PDF (232 bytes)
│   └── *.json                      # 9 extraction snapshots (valid-rpa, etc.)
└── scenarios/
    ├── 01-upload-errors/           # 3 tests — non-PDF, 422, 409
    ├── 02-compliance/              # 4 tests — blockers, warnings, counter-offer
    ├── 03-submission/              # 3 tests — happy path, warnings, error
    ├── 04-wizard-integrity/        # 3 tests — step nav, party data, back btn
    ├── 05-multi-form/              # 2 tests — dashboard forms display
    ├── 06-roles-permissions/       # 3 tests — auth guard, sidebar
    └── 07-multi-counter-offer/     # 1 test — SCO/BCO forms + updated price
```

**Total: 19 test scenarios + 1 auth setup** across 7 groups.

### 18.3 Test Numbering Convention

Scenarios are numbered with gaps of 10 for easy insertion:

| Group | Range | Scenarios |
|---|---|---|
| Upload errors | 010010–019990 | non-RPA doc (422), duplicate (409), disabled button |
| Compliance | 020010–029990 | compliant, blocker, warnings, counter-offer flag |
| Submission | 030010–039990 | happy path, warnings-ok, submit error |
| Wizard integrity | 040010–049990 | 5-step nav, party data visible, back to upload |
| Multi-form | 050010–059990 | dashboard forms list, status icons |
| Roles & permissions | 060010–069990 | unauthenticated redirect, dashboard, sidebar |
| Multi-counter-offer | 070010–079990 | SCO/BCO forms with updated price, forms list |

A new scenario in an existing group uses the next free `NNNN0` number:
- First scenario in group 07: `070010`
- Fifteenth scenario in group 01: `011510` (after `010010` through `011490`)
- First scenario in group 07: `070010`

**Known gotcha:** `goToStep(N)` always clicks "Next" `(N-1)` times from step 1. If
you call `goToStep(2)` then `goToStep(4)` later, the second call overshoots to
step 5. Navigate back to step 1 before calling `goToStep` again, or reorder
your checks to go from highest step to lowest.

### 18.4 How Mock Data Flows Through the App

The upload page (`ContractUpload.tsx`) calls `POST /document-extraction/extract-and-draft`
and stores the JSON response in `sessionStorage` under the key `tc_draft_session`.
The review wizard (`ContractReview.tsx`) reads from `sessionStorage` in a
`useEffect` — it never re-fetches from the API.

This is why browser-level intercept works cleanly:

1. **Page loads** the upload screen at `/transactions/new/contract`
2. **User selects** a dummy PDF via Playwright's file chooser
3. **User clicks** "Extract & Create Draft"
4. **Browser POSTs** the form — Playwright intercepts with `page.route()`
5. **Mock response** is returned with `{ transaction, extractionResult, compliance }`
6. **Client code** stores the mock data into `sessionStorage`
7. **Router navigates** to `/transactions/new/contract/review`
8. **Review wizard** reads `sessionStorage` and renders the mock extraction

No test ever needs to manually set `sessionStorage` — the real client code does it.

### 18.5 Page Objects

Each major page has a Page Object Model that encapsulates locators and actions:

```typescript
// e2e/pages/ContractUploadPage.ts
export class ContractUploadPage {
  async goto(): Promise<void>
  async uploadDummyPdf(): Promise<void>
  async clickExtract(): Promise<void>

  get extractButton(): Locator       // button:has-text("Extract & Create Draft")
  get errorMessage(): Locator         // text=Only PDF files are accepted
  get rpaNotFoundMessage(): Locator   // text=Residential Purchase Agreement (RPA) required
  get duplicateMessage(): Locator     // text=Transaction already exists
}
```

```typescript
// e2e/pages/ContractReviewPage.ts
export class ContractReviewPage {
  async waitForReady(): Promise<void>
  async goToStep(step: number): Promise<void>
  async submitWithDefaults(): Promise<void>

  get blockerIndicators(): Locator    // [class*="bg-red"]
  get warningIndicators(): Locator    // [class*="bg-amber"]
  get submitButton(): Locator
}
```

### 18.6 Writing a New Scenario

1. Choose a group number (`07-my-feature/`) or add to an existing group
2. Pick the next free number (e.g., `021050` for the 6th compliance test)
3. Write the test using page objects + intercept helpers:

```typescript
import { test, expect } from '@playwright/test';
import { ContractUploadPage } from '../../pages/ContractUploadPage';
import { ContractReviewPage } from '../../pages/ContractReviewPage';
import { interceptExtractAndDraft } from '../../helpers/api-intercepts';
import {
  MOCK_RPA_VALID,
  buildMockExtractResponse,
} from '../../helpers/mock-data';

test('021050 specific compliance rule displays correctly', async ({ page }) => {
  // 1. Set up mock extraction data
  const mockResponse = buildMockExtractResponse(MOCK_RPA_VALID);

  // 2. Register the route interceptor BEFORE navigating
  await interceptExtractAndDraft(page, mockResponse);

  // 3. Drive the UI via page objects
  const upload = new ContractUploadPage(page);
  await upload.goto();
  await upload.uploadDummyPdf();
  await upload.clickExtract();

  // 4. Assert on the review wizard
  const review = new ContractReviewPage(page);
  await review.waitForReady();
  await review.goToStep(4);
  await expect(page.locator('text=Compliant')).toBeVisible();
});
```

### 18.7 Scenario Groups — What Each Tests

**01 — Upload errors (3 tests)**
- `010010`: Verifies the extract button is disabled when no files are selected
- `010020`: Intercepts `extract-and-draft` with a 422 `RPA_NOT_FOUND` error and
  asserts the red error banner with the "Residential Purchase Agreement (RPA)
  required" heading is visible
- `010030`: Intercepts with a 409 `DUPLICATE_TRANSACTION` error and asserts the
  amber "Transaction already exists" banner with a link to the existing transaction

**02 — Compliance display (4 tests)**
- `020010`: Valid RPA mock → navigates to step 4 → asserts "Compliant" badge visible
- `020020`: RPA with null purchasePrice → step 4 → blocker with red indicator visible
- `020030`: RPA with unsigned parties → step 4 → warning indicators visible
- `020040`: RPA with `seller_acceptance.accepted_subject_to_counter_offer: true`
  → step 4 → counter-offer warning visible (same assertion pattern as other warnings)

**03 — Submission flow (3 tests)**
- `030010`: Intercepts both `extract-and-draft` (mock RPA) and the submit endpoint
  (success). Uploads → navigates to step 5 → clicks "Submit Contract" → asserts
  redirect to the transaction detail page
- `030020`: Same flow but with a warning in the compliance data — asserts
  submission still succeeds (warnings are non-blocking)
- `030030`: Submit endpoint returns a 500 error — asserts the error banner appears

**04 — Wizard integrity (3 tests)**
- `040010`: Clicks "Next" through all 5 steps, asserting each step heading is
  visible before advancing. Verifies the full wizard navigation loop
- `040020`: After upload, verifies step 1 shows extracted party names ("John Buyer"
  and "Jane Seller") from the mock data
- `040030`: Clicks the "Upload Contract" link from the review page and asserts
  the browser navigates back to the upload page with its heading visible

**05 — Multi-form (2 tests)**
- `050010`: After upload + review, navigates to `/dashboard` and asserts the
  "Draft" stat card is visible (transaction was created)
- `050020`: Same flow, asserts the "Forms:" prefix is visible in the transaction
  card (dashboard shows submitted form codes with `✓`/`○` icons)

**06 — Roles & permissions (3 tests)**
- `060010`: Creates a new browser context without auth cookies, visits
  `/dashboard`, asserts redirect to `/login`
- `060020`: Uses the authenticated auth storage, visits `/dashboard`, asserts
  page heading "Dashboard" is visible
- `060030`: Same authenticated session, asserts "Sign out" is visible in the
  sidebar (user session is intact)

**07 — Multi-counter-offer (1 test)**
- `070010`: RPA with `accepted_subject_to_counter_offer: true`, `purchasePrice: 925000`,
  and `formsAndDisclosures` containing SCO (Seller Counter Offer) + BCO (Buyer Counter Offer).
  Step 4: amber "1 warning" badge visible + SCO/BCO listed in Forms & Disclosures section.
  Step 2: `$925,000` price displayed. Verifies the wizard handles sequential counter offers
  with a final updated price.

### 18.8 Prerequisites

- PostgreSQL running (`docker compose up -d`)
- API server on port 3000 (`pnpm dev` from project root)
- Web server on port 3001 (`pnpm dev` from project root)
- Database seeded (`pnpm --filter @tc/api db:setup`) with test user
  `alice.tc@sunsetrealty.com` / `Password1!`

### 18.9 Running

```bash
# From apps/web/
pnpm test:e2e              # all 19 tests, headless
pnpm test:e2e:ui           # Playwright UI mode (interactive)
pnpm test:e2e:debug        # step-by-step with inspector

# Single scenario file
npx playwright test --config e2e/playwright.config.ts scenarios/01-upload-errors/upload-errors.spec.ts

# Single test by name pattern
npx playwright test --config e2e/playwright.config.ts -g "020010"
```

---

## 19. Linting & Code Quality

### 19.1 ESLint Overview

Each app has its own `.eslintrc` file that extends from `packages/config/`. This means:
- All apps share base rules (no `any`, no unused vars)
- Each app can add framework-specific rules on top

```
packages/config/
├── eslint-base.js          ← Shared: @typescript-eslint rules
├── eslint-next.js          ← Extends: next/core-web-vitals + next/typescript
└── eslint-react-native.js  ← Extends: base + react + react-native plugins

apps/api/.eslintrc.js       ← Extends: eslint-base, adds NestJS env
apps/web/.eslintrc.json     ← Extends: eslint-next
apps/mobile/.eslintrc.js    ← Extends: eslint-react-native
```

---

### 19.2 Running the Linter

#### All apps (Turborepo — runs in parallel, cached)

```bash
pnpm lint           # check for errors
pnpm lint:fix       # auto-fix fixable errors
```

Add `lint:fix` to root `package.json` scripts:

```json
"lint:fix": "turbo lint -- --fix"
```

#### Individual apps

```bash
pnpm --filter @tc/api     lint
pnpm --filter @tc/web     lint
pnpm --filter @tc/mobile  lint
```

#### Single file

```bash
# from inside apps/api/
npx eslint src/modules/users/users.service.ts
npx eslint src/modules/users/users.service.ts --fix
```

---

### 18.3 Per-App ESLint Config

#### NestJS — `apps/api/.eslintrc.js`

```javascript
module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: 'tsconfig.json',
    tsconfigRootDir: __dirname,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  root: true,
  env: { node: true, jest: true },
  ignorePatterns: ['.eslintrc.js', 'jest.config.ts', 'dist/'],
  rules: {
    '@typescript-eslint/explicit-function-return-type': 'off',  // NestJS decorators make this noisy
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
  },
};
```

#### Next.js — `apps/web/.eslintrc.json`

```json
{
  "extends": ["next/core-web-vitals", "next/typescript"],
  "rules": {
    "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
    "@typescript-eslint/no-explicit-any": "warn"
  }
}
```

`next/core-web-vitals` adds rules that enforce React best practices and catch performance issues specific to Next.js (e.g., using `next/image` instead of `<img>`, `next/link` instead of `<a>`).

#### React Native — `apps/mobile/.eslintrc.js`

```javascript
module.exports = {
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint', 'react', 'react-native'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime',  // React 17+ — no need to import React in every file
  ],
  env: { 'react-native/react-native': true, jest: true },
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    'react/prop-types': 'off',  // TypeScript covers this
  },
  settings: { react: { version: 'detect' } },
};
```

---

### 18.4 Adding or Adjusting Rules

**To add a rule to all apps**, edit `packages/config/eslint-base.js`:

```javascript
rules: {
  '@typescript-eslint/no-explicit-any': 'error',   // upgrade from warn to error
  'no-console': ['warn', { allow: ['warn', 'error'] }], // allow console.warn/error
},
```

**To add a rule to one app only**, add it to that app's `.eslintrc` file:

```javascript
// apps/api/.eslintrc.js
rules: {
  '@typescript-eslint/explicit-function-return-type': 'error', // enforce in API only
},
```

**To disable a rule for a single line:**

```typescript
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const raw: any = JSON.parse(body);
```

**To disable a rule for a block:**

```typescript
/* eslint-disable @typescript-eslint/no-explicit-any */
// legacy code that needs gradual migration
const a: any = {};
const b: any = {};
/* eslint-enable @typescript-eslint/no-explicit-any */
```

---

### 18.5 Prettier

Prettier handles formatting (indentation, quotes, semicolons). It is configured at the root and applies to all apps.

**Config file:** `.prettierrc` (root)

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2
}
```

**Commands:**

```bash
# Check formatting
pnpm format:check

# Fix formatting
pnpm format
```

Add these to root `package.json`:

```json
"format": "prettier --write \"**/*.{ts,tsx,js,jsx,json,md}\"",
"format:check": "prettier --check \"**/*.{ts,tsx,js,jsx,json,md}\""
```

**Editor integration:** Install the Prettier extension for VS Code and add to `.vscode/settings.json`:

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode"
}
```

**ESLint + Prettier:** Prettier handles formatting; ESLint handles code correctness. They do not overlap. Never enable ESLint formatting rules (`indent`, `quotes`, `semi`) — let Prettier own those.

---

### 18.6 TypeScript Type Checking

Type checking runs separately from ESLint. It catches type errors that ESLint misses (e.g., wrong argument types, missing properties).

```bash
# Type-check all apps (Turbo)
pnpm typecheck

# Individual app
pnpm --filter @tc/api     typecheck
pnpm --filter @tc/web     typecheck
pnpm --filter @tc/mobile  typecheck
```

**Recommended order before committing:**

```bash
pnpm typecheck   # catch type errors first
pnpm lint        # catch style / correctness issues
pnpm test        # catch logic errors
```

Or run all three in one command via Turbo:

```bash
turbo typecheck lint test
```

---

## 19. Mailgun Inbound Webhook

The API receives inbound emails forwarded by Mailgun and stores them as `transaction_messages` rows with a corresponding `transaction_journals` audit entry.

### 19.1 How it works

1. A Mailgun **Route** matches an inbound email addressed to `txn-{transaction-uuid}@mg.yourdomain.com` and forwards it as a `multipart/form-data` POST to your API.
2. `POST /webhooks/mailgun` — this route is **outside** the `/api/v1` global prefix.
3. The `MailgunWebhookGuard` verifies the HMAC-SHA256 signature before any business logic runs.
4. `MailgunWebhookService` extracts the transaction UUID from the recipient address, saves the message, and appends a journal entry.

### 19.2 Local environment setup

Add the signing key to your local environment. Create or edit `apps/api/.env`:

```
MAILGUN_WEBHOOK_SIGNING_KEY=test-signing-key-dev
```

Start the API with the variable in scope:

```bash
# Option A — .env file loaded automatically by NestJS ConfigModule (if configured)
pnpm --filter @tc/api dev

# Option B — inline for a one-off run
MAILGUN_WEBHOOK_SIGNING_KEY=test-signing-key-dev pnpm --filter @tc/api dev
```

> **Finding your real key:** Mailgun dashboard → **Sending** → **Webhooks** → **HTTP webhook signing key** (top of page). Use this value in production; use any string locally as long as your curl commands use the same string.

### 19.3 Testing with curl

Build the HMAC signature from `timestamp + token` using the same key the server has, then POST all required fields as multipart form data.

```bash
# Set these to match whatever your server has
SIGNING_KEY="test-signing-key-dev"
TIMESTAMP=$(date +%s)
TOKEN="abc12345678901234567890123456789012345678901234567"
SIGNATURE=$(printf '%s%s' "$TIMESTAMP" "$TOKEN" \
  | openssl dgst -sha256 -hmac "$SIGNING_KEY" \
  | awk '{print $2}')

# Replace with a real transaction UUID from your local DB
TXN_ID="cc6b7798-9643-45aa-b514-a4ac02cbc50c"

curl --noproxy 'localhost,127.0.0.1' \
  -X POST http://localhost:3000/webhooks/mailgun \
  --form "recipient=txn-${TXN_ID}@mg.yourdomain.com" \
  --form "sender=james.buyer@email.com" \
  --form "from=James Buyer <james.buyer@email.com>" \
  --form "subject=Re: 456 Maple Street - inspection question" \
  --form "stripped-text=Hi Alice, just following up on the inspection report." \
  --form "body-plain=Hi Alice, just following up on the inspection report." \
  --form "Message-Id=test-msg-001@mail.gmail.com" \
  --form "timestamp=$TIMESTAMP" \
  --form "token=$TOKEN" \
  --form "signature=$SIGNATURE"
```

Expected response: `{"status":"ok"}` with HTTP 200.

> **curl gotcha:** Do **not** wrap `Message-Id` values in angle brackets (`<...>`) when using `--form`. curl interprets `<` as a file read directive and silently fails with exit code 26. Pass the raw ID string without brackets.

#### Get a real transaction UUID from the database

```bash
docker exec $(docker ps -q --filter "ancestor=postgres:16-alpine") \
  psql -U tc -d tc -t \
  -c "SELECT id, transaction_number FROM real_estate_transactions LIMIT 5;"
```

### 19.4 Verifying the result

After a successful POST, confirm both rows were written:

```bash
# Message saved
docker exec $(docker ps -q --filter "ancestor=postgres:16-alpine") \
  psql -U tc -d tc \
  -c 'SELECT id, subject, "bodyText", direction, "providerMessageId", "receivedAt"
      FROM transaction_messages
      ORDER BY "createdAt" DESC LIMIT 3;'

# Journal entry appended
docker exec $(docker ps -q --filter "ancestor=postgres:16-alpine") \
  psql -U tc -d tc \
  -c 'SELECT title, source, "journalType", "relatedEntityType", "relatedEntityId"
      FROM transaction_journals
      ORDER BY "createdAt" DESC LIMIT 3;'
```

### 19.5 Error responses

| Status | Cause | Meaning |
|---|---|---|
| `200 {"status":"ok"}` | Success | Message saved (or silently dropped if no matching transaction) |
| `403 Missing signature fields` | `timestamp`, `token`, or `signature` absent | Malformed request |
| `403 Webhook timestamp expired` | `timestamp` older than 15 minutes | Replay attempt or stale test data |
| `403 Invalid webhook signature` | HMAC mismatch | Wrong signing key, or payload tampered |
| `403 Webhook signing key not configured` | `MAILGUN_WEBHOOK_SIGNING_KEY` env var missing | Missing server config |

> The controller catches all processing errors and returns `200` regardless — returning `5xx` would cause Mailgun to retry the same webhook repeatedly.

### 19.6 Transaction routing convention

| Mailgun recipient address | Matches transaction |
|---|---|
| `txn-cc6b7798-9643-45aa-b514-a4ac02cbc50c@mg.yourdomain.com` | Transaction UUID `cc6b7798-...` |
| `alice.tc@sunsetrealty.com` (direct) | **No match** — silently dropped |

The service looks for a local part matching `txn-{uuid}` (36-character UUID v4). Anything else is logged as unresolvable and ignored.

In Mailgun, configure a **Route** with:
- **Expression**: `match_recipient("txn-.*@mg\.yourdomain\.com")`
- **Action**: `forward("https://yourapi.com/webhooks/mailgun")`
- **Action**: `stop()`

### 19.7 Adding a new inbound email handler

To act on inbound email beyond storing the message (e.g. auto-creating a task, sending a reply):

1. Open `apps/api/src/modules/webhooks/mailgun/mailgun-webhook.service.ts`
2. Add logic after the `this.journalsService.createEntry(...)` call in `processInbound()`
3. Inject any additional services into `MailgunWebhookService` and declare them in `WebhooksModule`

---

## 20. Design Decisions

### 20.1 Two-track Transaction Creation Flow

The "Create Transaction" entry point in the sidebar offers two distinct flows:

| Flow | Route | Use case |
|---|---|---|
| **From Contract** | `/transactions/new/contract` | TC has the signed PDF — upload and let Claude extract everything |
| **Manual Entry** | `/transactions/new/manual` | No PDF available — fill in details step by step |

The sidebar always shows both options expanded (no dropdown toggle) so they are immediately visible.

#### Contract flow pages

```
/transactions/new/contract          ContractUpload.tsx   — drag & drop PDFs, calls extraction API
/transactions/new/contract/review   ContractReview.tsx   — full review page with all extracted sections
```

After extraction succeeds, a draft transaction is created immediately and the result is stored in `sessionStorage` under the key `tc_draft_session` (a JSON object with `transactionId`, `extractionResult`, `partiesCreated`, and `compliance`). The user is redirected to the review page, which reads from `sessionStorage` on mount — if no data is found it sends the user back to the upload page.

**Review page sections** (left-nav scrollspy):
1. **Compliance & Issues** — deterministic checks from the LLM output: missing signatures, missing purchase price/address/closing date, missing forms, low confidence score; also shows raw `extractionWarnings` from Claude
2. **RPA Compliance** — programmatic rule engine results (see §18.4); grouped by category with pass/fail/warning/skipped per rule
3. **Property** — address, APN, MLS, legal description + per-section confidence bar
4. **Transaction Terms** — price, earnest money, dates, financing type
5. **Parties** — grouped by role (buyers, sellers, buyer agents, listing agents, escrow, lenders, brokers, attorneys); signature status pills; email links
6. **Contingencies & Deadlines** — inspection/loan/appraisal/disclosure days + other deadlines
7. **Forms & Disclosures** — with `attached` / `referenced` / `missing` status badges

#### Manual flow

```
/transactions/new/manual   WizardForm.tsx   — 2-step wizard: People & Addresses → Documents
```

Step 0 (entry method selection) was removed — the user already chose manual entry via the sidebar. The wizard starts directly at Step 1.

#### Legacy route

`/transactions/new` redirects to `/transactions/new/contract`.

---

### 18.2 PDF Contract Extraction via LLM

**Feature**: `POST /api/v1/document-extraction/extract`
**Module**: `apps/api/src/modules/document-extraction/`

#### Overview

When a user uploads real-estate contract PDFs via the contract flow, the files are sent directly to the Claude API (`claude-sonnet-4-6`) as base64-encoded `document` content blocks. Claude reads the PDFs natively and returns structured JSON matching the extraction schema. No server-side PDF text extraction library (e.g. `pdf-parse`) is used — the LLM handles document understanding end-to-end.

The full extraction result is stored in `sessionStorage` and displayed on the review page. Every API call is logged to the `ai_interactions` table regardless of success or failure.

#### Prompt architecture

The system prompt and JSON output schema are defined as module-level constants in `document-extraction.service.ts`:

- `CACHED_SYSTEM_TEXT` — extraction rules + output schema combined into one string
- `USER_TEXT` — a short static instruction sent as the user turn alongside the PDF document blocks

The schema is embedded in the system prompt (not the user message) so the entire static payload is covered by a single cache block.

#### Token optimisation

**Prompt caching** (`cache_control: { type: 'ephemeral' }`):
- The system prompt + schema block (~600 tokens) is marked for caching.
- First call within a 5-minute window writes to the cache (small cost premium).
- Every subsequent call within the same window reads from cache at ~10% of normal input token cost.
- The PDF content itself is not cached — it changes per call and dominates input token count.
- The API logs cache stats on every call: `cache_write`, `cache_read`, `input`, `output` tokens.

**`rawFacts` removed from output schema**:
- The `rawFacts` field (raw text snippets from the document) was removed from the schema sent to Claude.
- It generated ~100–300 extra output tokens per call without being consumed by any downstream feature.
- The field remains optional (`rawFacts?`) in the TypeScript types so it can be re-added to the schema later without a breaking change.

**`max_tokens` set to 16 000**:
- A complex real-estate contract with many parties, forms, and contingencies can exceed 4 096 output tokens.
- Setting `max_tokens: 16000` prevents truncated JSON (which causes a parse error).

#### File limits

- Maximum file size: **25 MB per PDF**
- Maximum files per request: **10**
- Enforced at both the multer interceptor layer (`limits.fileSize`) and the service layer.

#### Evolving the prompt

Prompts and JSON output schemas live in the **`@tc/document-intelligence`** package. Each form has its own subfolder with a versioned file:

| Form | File |
|------|------|
| RPA (Residential Purchase Agreement, v12/23) | `.../forms/rpa/rpa.standard.v12-23.ts` |
| AD (Agency Disclosure, v12/23) | `.../forms/ad/ad.standard.v12-23.ts` |
| TDS (Transfer Disclosure Statement, v06/24) | `.../forms/tds/tds.standard.v06-24.ts` |
| SPQ (Seller Property Questionnaire, v12/25) | `.../forms/spq/spq.standard.v12-25.ts` |
| NHD (Natural Hazard Disclosure, v12/22) | `.../forms/nhd/nhd.standard.v12-22.ts` |
| AVID (Agent Visual Inspection Disclosure, v12/22) | `.../forms/avid/avid.standard.v12-22.ts` |
| BIA (Buyer Inspection Advisory, v12/22) | `.../forms/bia/bia.standard.v12-22.ts` |
| SCO (Seller Counter Offer, v12/24) | `.../forms/sco/sco.standard.v12-24.ts` |
| SFLS (Seller Financial Literacy Statement, v12/24) | `.../forms/sfls/sfls.standard.v12-24.ts` |
| SA (Supplemental Agreement, v06/25) | `.../forms/sa/sa.standard.v06-25.ts` |
| MCA (Market Conditions Addendum, v06/24) | `.../forms/mca/mca.standard.v06-24.ts` |
| FHDA (First Home Deposit Assistance, v12/24) | `.../forms/fhda/fhda.standard.v12-24.ts` |
| BHIA (Buyer Home Inspection Addendum, v06/24) | `.../forms/bhia/bhia.standard.v06-24.ts` |
| BCA (Buyer Credit Addendum, v06/25) | `.../forms/bca/bca.standard.v06-25.ts` |
| AS (Arbitration Statement, v06/25) | `.../forms/as/as.standard.v06-25.ts` |
| WFDA (Water Fixture Disclosure Addendum, v12/25) | `.../forms/wfda/wfda.standard.v12-25.ts` |
| WCMD (Wire, Cashiers Check or Money Order Disclosure, v06/24) | `.../forms/wcmd/wcmd.standard.v06-24.ts` |
| QS (Quiet Satisfaction, v06/25) | `.../forms/qs/qs.standard.v06-25.ts` |
| DIA (Designated Intermediary Addendum, v12/25) | `.../forms/dia/dia.standard.v12-25.ts` |
| CCPA (CCPA Privacy Notice, v12/22) | `.../forms/ccpa/ccpa.standard.v12-22.ts` |
| PRBS (Personal Residential Brokerage Services, v12/22) | `.../forms/prbs/prbs.standard.v12-22.ts` |
| SBSA (Short-term Business Service Agreement, v12/22) | `.../forms/sbsa/sbsa.standard.v12-22.ts` |
| New form | create `.../forms/<code>/<code>.standard.<vMM-YY>.ts`, register in `registry.ts` |

After editing, rebuild so the API picks up the change:
```bash
pnpm --filter @tc/document-intelligence build
```

The AI engineer's test loop does not require a build — `pnpm --filter @tc/document-intelligence test:watch` runs directly against TypeScript source. Only a build is needed to deploy changes into the running API.

See **§18.5** for the full AI engineer workflow.

#### Why `rawFacts` was omitted (and when to restore it)

`rawFacts` is a `Record<string, string>` of verbatim text snippets from the document that back up important extracted values — e.g. `"closingDateText": "Close of Escrow: May 15, 2026"`.

It was removed from the output schema to save ~100–300 output tokens per call. Nothing in the current application reads it — the contract review page displays the structured fields but does not surface the raw source text.

**Restore it when any of these are built:**

- **Audit / dispute resolution** — if an extracted value is challenged, `rawFacts` is the only way to show the exact clause the value came from without re-processing the PDF.
- **Validation rules** — a validation layer checking extracted values against business rules (e.g. closing date after acceptance date) needs the source text to reason against, not just the derived value.
- **Confidence debugging** — when `confidenceSummary` scores are low, `rawFacts` explains why (conflicting clauses, ambiguous phrasing).

**To restore**: add `rawFacts` back to `EXTRACTION_SCHEMA` in `document-extraction.service.ts` and remove the `?` from `rawFacts?` in both `extraction-result.types.ts` files (`apps/api` and `apps/web`). No other changes needed.

---

### 18.3 PDF Type Detection and AcroForm Field Extraction

**Module**: `apps/api/src/modules/document-extraction/acroform-extractor.service.ts`
**Library**: `pdf-lib` (pure TypeScript, no native binary dependencies)

#### What is an AcroForm?

AcroForm is Adobe's standard for interactive fillable PDF forms. A fillable PDF has two layers:

1. **Visual layer** — the rendered page content (text, images, layout)
2. **AcroForm dictionary** — a hidden data structure listing every form field by name, type, and current value

```
PDF file
├── Pages (visual content — what you see)
└── AcroForm dictionary (structured data — what we read)
    ├── BuyerName        = "Varun Srivastava"
    ├── PurchasePrice    = "451000"
    ├── CloseOfEscrow    = "04/05/2026"
    ├── BuyerSignature   = [signature object — signed or unsigned]
    └── InspectionDays   = "8"
```

When an agent completes a CAR form digitally in DotLoop, DocuSign, or CAR Zipforms and saves the PDF, all the typed values are stored in this dictionary. `pdf-lib` reads directly from the dictionary — no AI, no OCR, no interpretation.

#### Two types of contract PDF you will encounter

| Type | Created by | AcroForm fields | Extraction path |
|---|---|---|---|
| **Digital / fillable** | Agent typed into DotLoop / DocuSign / Zipforms and saved | Yes — all data in the dictionary | `pdf-lib` reads named fields directly — deterministic, no LLM cost |
| **Scanned / flattened** | Paper contract signed by hand, scanned; or digital form fields flattened at export | No — page content is JPEG images | Claude LLM reads images via OCR — probabilistic, confidence scores apply |

The Lasselle St. test PDF (21 MB, 29 pages of embedded JPEGs) is a scanned PDF — `AcroFormExtractorService.extract()` correctly reports `hasAcroForm: false` and the system falls back to Claude.

#### AcroForm field types

| pdf-lib class | Form element | Value read |
|---|---|---|
| `PDFTextField` | Text input | `field.getText()` — string |
| `PDFCheckBox` | Checkbox | `field.isChecked()` — boolean |
| `PDFRadioGroup` | Radio buttons | `field.getSelected()` — selected option string |
| `PDFDropdown` | Dropdown / select | `field.getSelected()` — array, first element taken |
| `PDFSignature` | Signature field | Whether `/V` dict entry exists — indicates if signed |

#### What `AcroFormExtractorService` returns

```typescript
interface AcroFormExtractionResult {
  hasAcroForm: boolean;       // false for scanned/flattened PDFs
  fieldCount: number;         // total AcroForm fields found
  fields: AcroFieldInfo[];    // all fields with name, type, value, isEmpty
  signatureFields: AcroFieldInfo[];   // fields of type 'signature'
  emptyValueFields: AcroFieldInfo[];  // text/radio/dropdown fields with no value
  formTitle: string | null;   // PDF metadata title
  pageCount: number;
}
```

#### Detecting scanned PDFs

```typescript
// Check before routing to compliance validator
const acro = await acroFormExtractorService.extract(buffer);

if (acro.hasAcroForm && acro.fieldCount > 0) {
  // Digital PDF — validate directly from AcroForm fields
  compliance = rpaComplianceValidator.fromAcroForm(acro);
} else {
  // Scanned — run Claude extraction first, then validate from LLM output
  const extraction = await documentExtractionService.extractFromPdfs(files);
  compliance = rpaComplianceValidator.fromLlmExtraction(extraction);
}
```

`isScannedPdf(buffer)` is also available as a utility method when you only need to know the PDF type without reading all fields.

---

### 18.4 RPA Compliance Validation Engine

**Module**: `apps/api/src/modules/document-extraction/rpa-compliance.validator.ts`
**Types**: `apps/api/src/modules/document-extraction/compliance-result.types.ts`

#### Overview

The `RpaComplianceValidator` is a purely programmatic rule engine for California Residential Purchase Agreement (CAR RPA) compliance. It has **no LLM involvement** — every rule is a deterministic check that produces exactly one of four outcomes: `pass`, `fail`, `warning`, or `skipped`.

There are no confidence scores in the compliance result. A rule either passes or it doesn't.

#### Two entry points — same output shape

```typescript
// Path 1 — Digital/fillable PDF (AcroForm fields from pdf-lib)
const result = rpaComplianceValidator.fromAcroForm(acroFormResult);

// Path 2 — Scanned/flattened PDF (structured data from Claude LLM)
const result = rpaComplianceValidator.fromLlmExtraction(extractionResult);
```

Both return `ComplianceResult` with the same structure. The consuming code (controller, UI) does not need to know which path was taken.

#### Rule categories and checks

| Category | Rules checked |
|---|---|
| **Parties** | At least one buyer present; all buyer/seller names filled; buyer agent and listing agent identified; DRE license numbers present; escrow company identified |
| **Property** | Street address, city, state, postal code all present; APN present |
| **Financial** | Purchase price present and > 0; earnest money / initial deposit specified; financing type specified; loan amount present if not a cash transaction; loan amount does not exceed purchase price; earnest money does not exceed purchase price |
| **Dates** | Offer date present and parseable; acceptance date present and ≥ offer date; close of escrow date present and > acceptance/offer date |
| **Signatures** | Buyer(s) signed; seller(s) signed (warning if unsigned — may be pending counter-offer); no missing signature lines |
| **Contingencies** | Inspection contingency days specified or waived; loan contingency days specified or waived; appraisal contingency days specified or waived; disclosures due period specified |
| **Forms & Disclosures** | Forms and disclosures identified; no forms referenced but missing; SPQ (Seller Property Questionnaire) referenced or attached; TDS (Transfer Disclosure Statement) referenced or attached; NHD (Natural Hazard Disclosure) referenced or attached |

#### Severity levels

| Status | Meaning |
|---|---|
| `pass` | Rule satisfied — no action needed |
| `fail` + `error` severity | Blocking issue — contract is likely non-compliant without resolution |
| `warning` | Non-blocking issue — needs human review but may be intentional (e.g. seller unsigned on buyer copy) |
| `skipped` | Rule not applicable to this transaction type, or the relevant field was not found by pattern match |

#### Overall status

```
failCount > 0      →  non_compliant   (at least one blocking issue)
warningCount > 0   →  needs_review    (no failures but warnings present)
otherwise          →  compliant
```

#### AcroForm field name pattern matching

For digital PDFs, the validator uses case-insensitive regex patterns to locate fields rather than hardcoding exact field names. This handles variation across CAR form versions and brokerage-customised templates:

```typescript
// Finds fields named BuyerName, Buyer1Name, BUYER_NAME, buyer_name, etc.
findFields(fields, 'buyer.*name', 'purchaser.*name')

// Finds purchase price fields across naming conventions
findFields(fields, 'purchase.*price', 'offer.*price', 'sales.*price')
```

#### Real-world result on the Lasselle St. RPA (scanned PDF)

```
PDF type  : scanned_or_flattened (no AcroForm — JPEG images)
Source    : llm_extraction
Overall   : non_compliant

Pass  29  — all parties, property, financial, contingencies, forms checks
Fail   1  — closing date: expressed as "30 days after Acceptance" not a fixed date
Warn   1  — 5 missing signature lines (second buyer slots + escrow holder acknowledgment)
```

The closing date failure is accurate — the contract defines COE relatively ("30 days after Acceptance") rather than as a fixed calendar date. The LLM extraction warning notes the calculated date (~April 5, 2026) but the validator correctly requires an explicit date in the field.

#### Endpoints

| Endpoint | Description |
|---|---|
| `POST /api/v1/document-extraction/compliance-check` | Standalone compliance check — accepts PDF files, auto-detects type, returns `{ pdfType, extractionResult, compliance }` |
| `POST /api/v1/document-extraction/extract-and-draft` | Enriched draft creation — runs extraction + compliance + creates draft transaction, returns `{ transaction, extractionResult, partiesCreated, compliance }` |

#### Adding a new compliance rule

Compliance rules for the LLM extraction path live in the **`@tc/document-intelligence`** package, not in the NestJS module:

| Stage | File |
|---|---|
| CONTRACT (RPA) | `packages/document-intelligence/src/validator/stages/contract.stage.ts` |
| DISCLOSURES | `packages/document-intelligence/src/validator/stages/disclosures.stage.ts` |
| New stage | create `packages/document-intelligence/src/validator/stages/<stage>.stage.ts`, register in `registry.ts` |

Steps to add a rule:
1. Open the appropriate stage file
2. Add the check using the `pass()`, `fail()`, `warn()`, or `skip()` helper functions defined at the top of the file
3. Use a unique `ruleId` string (e.g. `'hoa_disclosure'`)
4. Run `pnpm --filter @tc/document-intelligence test` to verify — unit tests use fixture extraction data, no PDF needed
5. Run `pnpm --filter @tc/document-intelligence build` to deploy into the API

The AcroForm validation path (`fromAcroForm()`) stays in `apps/api/src/modules/document-extraction/rpa-compliance.validator.ts` since it depends on pdf-lib field types that are specific to the NestJS module.

#### Future: AWS Textract for scanned PDFs

For higher accuracy on scanned contracts (especially handwritten dates and signatures), AWS Textract is the recommended next step:

```
pnpm add @aws-sdk/client-textract --filter @tc/api
```

Textract's `AnalyzeDocument` API with `FORMS` + `SIGNATURES` features returns:
- Key-value pairs extracted by OCR from scanned form fields
- Bounding boxes and confidence scores for each detected signature

The compliance validator would accept Textract output through a third entry point `fromTextractResult()` returning the same `ComplianceResult` shape. The UI and downstream logic would not change.

Environment variable to add when Textract is integrated:

| Variable | Required | Notes |
|---|---|---|
| `AWS_REGION` | Yes | e.g. `us-west-2` |
| `AWS_ACCESS_KEY_ID` | Yes | IAM key with `textract:AnalyzeDocument` permission |
| `AWS_SECRET_ACCESS_KEY` | Yes | Corresponding secret |

---

### 18.5 AI Engineer — `@tc/document-intelligence` package

The `packages/document-intelligence` package owns all PDF processing logic, LLM prompt definitions, and stage reasoning. It has **no NestJS dependency** — develop and test entirely without running the application stack.

### What you own

| Layer | Your files | What it does |
|---|---|---|
| Shared template constants | `src/extractor/forms/form-definition.ts` | `FORM_FOOTER_FIELDS` and `FORM_FOOTER_INSTRUCTION` — universal header fields and prompt snippet included in every form |
| Form prompts | `src/extractor/forms/<code>/<code>.<variant>.<vMM-YY>.ts` | System prompt + JSON output template per CAR form and version |
| Form registry | `src/extractor/forms/registry.ts` | Maps form code (and pinned version) → form definition |
| Stage reasoners | `src/reasoner/stages/<stage>.reason.ts` | LLM reasoning prompt that aggregates multiple form JSONs |
| Reasoner registry | `src/reasoner/registry.ts` | Maps stage → reasoning definition |
| Stage validators | `src/validator/stages/<stage>.stage.ts` | Deterministic pass/fail/warn rules per stage |
| Validator registry | `src/validator/stages/registry.ts` | Maps stage → validator function |
| Blocker/warning catalogs | `src/validator/stages/*.blocker-catalog.ts` | Constant-code system per stage (e.g. `BLOCKER-RPA-1`, `WARN-TDS-10001`) |
| Form comparison | `src/comparison/` | Version diffing + material change detection (RPA, SCO) |
| Form sequence | `src/sequence/` | Form family grouping and cross-version resolution |
| Page converter | `src/page-converter/` | PDF→PNG rendering via `pdfjs-dist` + OffscreenCanvas |
| Unit tests | `test/unit/` | No PDF, no API key — run in <1 second |
| Extraction scenarios | `test/extraction/<name>/` | PDF + snap files — iterate on form identification and JSON schema |
| Reasoning scenarios | `test/reasoning/<name>/` | JSON fixtures only — iterate on stage reasoning prompts; no PDF needed |

You do **not** need to touch: providers, the pipeline orchestrator, the NestJS module, the database, or the web app.

---

### One-time setup

```bash
# From the repo root
pnpm install
```

**API keys** — the vitest config automatically loads `apps/api/.env.local` so you do not need to export keys manually. Just make sure that file contains:

```bash
GEMINI_API_KEY="AIza..."           # required — page identification always uses Gemini
ANTHROPIC_API_KEY="sk-ant-..."     # required if LLM_EXTRACTION_PROVIDER=anthropic (default)

# To use Gemini for extraction and reasoning too (one key for everything):
LLM_EXTRACTION_PROVIDER=gemini
LLM_REASONING_PROVIDER=gemini
```

Docker and a running database are **not needed**.

---

### Daily test commands — scoped to avoid LLM costs

LLM calls cost money. Run the narrowest scope that covers your change.

```bash
cd packages/document-intelligence

# ── Free (no API key, <1 second) ─────────────────────────────────────────────

pnpm test:unit                                      # unit tests only
pnpm test:watch:unit                                # watch mode

# Snap assertions run free inside any scenario — no API key needed
pnpm test:watch -- contract-01-lasselle -t "snap"

# ── Cheap — reasoning only (one LLM call) ────────────────────────────────────

# All reasoning scenarios (loads JSON fixtures, no PDF processing)
pnpm exec vitest run test/reasoning

# One specific reasoning scenario
pnpm exec vitest run test/reasoning/contract-01-lasselle-st

# One specific round inside a reasoning scenario
pnpm test:watch -- contract-01-lasselle -t "round 2"

# ── Moderate — extraction (PDF identification + selective JSON extraction) ────

# One PDF — LLM called only for forms without a .snap.json
pnpm exec vitest run test/extraction/contract-03-lasselle-st-rpa-bundle

# Watch mode — reruns on every file save
pnpm test:watch -- contract-03 -t "extraction"

# ── Full (only when finalising) ───────────────────────────────────────────────

pnpm exec vitest run test/extraction                # all extraction scenarios
pnpm test                                           # everything
```

**Filter syntax:** argument after `--` = filename substring; `-t` = test-name substring (regex).

---

### Browser UI — `pnpm test:ui`

The Vitest UI gives every AI engineer a browser-based view of all tests. No tests run automatically when you open it — you click to run exactly what you want.

```bash
cd packages/document-intelligence
pnpm test:ui
```

The browser opens at `http://localhost:51204`. From there you can run any test individually.

#### What you see

The left panel lists every test file grouped by directory:

```
test/unit/form-registry.test.ts
test/unit/contract-stage.test.ts
test/extraction/rpa-01-bycroft-cir/scenario.test.ts
test/extraction/contract-03-lasselle-st-rpa-bundle/scenario.test.ts
...
test/reasoning/contract-01-lasselle-st/scenario.test.ts
test/reasoning/contract-02-bycroft-cir/scenario.test.ts
test/reasoning/inspection-01-rr-rrr/scenario.test.ts
...
```

Click any file to expand its individual `it()` blocks. Each test shows one of these states:

| Icon | State | What it means |
|---|---|---|
| ▶ (grey) | Not yet run | Waiting for you to click run |
| ✓ (green) | Passed | Test passed |
| ✗ (red) | Failed | Assertion failed — check the output tab |
| ↷ (blue) | Todo / Skipped | PDF absent or API key missing — test is intentionally inactive |

#### Running tests from the UI

| What to click | What runs |
|---|---|
| ▶ next to a file | All tests in that scenario |
| ▶ next to a `describe` block | That group only (e.g. just snap assertions) |
| ▶ next to an `it()` | That single test |
| "Run all" button (top bar) | Everything — avoid this to control LLM cost |

#### Cost safety in the UI

The snap mechanism protects you regardless of how you trigger tests:

- **Snap assertions** (`describe('... snap assertions')`) — always free, run instantly
- **Extraction tests with a snap** — identifier runs (cheap), extractor is skipped
- **Extraction tests without a snap** — one LLM call fires; only click these intentionally
- **Tests without a PDF** — show as `todo` (skipped), never cost anything

The UI makes this visible: skipped tests show as blue ↷ so you can see at a glance which ones are inactive.

#### Minimum setup to appear in the UI

A scenario appears in the UI as soon as you create **two things**:

```
# Extraction scenario
test/extraction/my-new-scenario/
├── extractions/          ← empty folder is fine
├── pdfs/                 ← empty folder is fine
└── scenario.test.ts      ← this is what the UI reads

# Reasoning scenario
test/reasoning/my-new-scenario/
├── extractions/          ← drop decision-form snap files here
└── scenario.test.ts
```

You do **not** need a PDF or a snap file to see the scenario in the UI. Without them, tests
show as `todo` (skipped) — which is correct until you are ready to run them.

The `README.md` is for humans, not the test runner — it does not affect what appears in the UI.

---

### Locking a form extraction with a snap file

When you are happy with an extraction result and want to stop paying for it on every run, save the output as a `.snap.json` file. The pipeline will use the snap and skip the LLM call for that form:

```
extractions/
├── rpa.standard.v12-23.snap.json   ← locked — LLM skipped, snap used instead
└── tds.standard.v06-24.json        ← plain fixture — still calls LLM for TDS
```

**How to create a snap:**
1. Run the extraction test — the console prints the JSON and a `💾 Save & lock` hint with the exact filename
2. Copy the printed JSON into that file
3. Next run: `[SNAP] RPA — using cached extraction, skipping LLM` appears instead of an API call

**Snap file format** (same as the reasoning fixture, just saved with `.snap.json`):
```json
{
  "formCode": "RPA",
  "formName": "Residential Purchase Agreement",
  "variant": "standard",
  "version": "v12-23",
  "data": { ... extracted fields ... }
}
```

**Snap precedence:** if both `rpa.standard.v12-23.snap.json` and `rpa.standard.v12-23.json` exist, the snap wins for both extraction caching and reasoning input. Delete the snap to force a fresh LLM extraction.

**Typical prompt iteration cycle:**
1. `pnpm test:unit` — free, run first after any change
2. `pnpm exec vitest run test/reasoning/contract-01-lasselle-st` — iterate on the CONTRACT reasoning prompt against saved fixtures (one LLM call)
3. Need to re-extract only the RPA? Delete its snap in `test/extraction/contract-03-lasselle-st-rpa-bundle/extractions/` → run the extraction scenario → re-save snap → copy into the reasoning scenario's `extractions/`
4. `pnpm exec vitest run test/reasoning` — full reasoning pass when stable

---

### Test structure — three tiers

```
test/
├── unit/                              ← fast, no API key, always runs
│   ├── form-registry.test.ts          ← validates form definitions and registry keys
│   └── contract-stage.test.ts         ← validates CONTRACT compliance rules
│
├── helpers/                           ← shared utilities (do not edit)
│   ├── scenario.ts                    ← describeScenario() helper
│   └── pipeline.ts                    ← buildPipeline(), buildReasoner()
│
├── extraction/                        ← PDF-based: identification + JSON extraction
│   ├── rpa-01-bycroft-cir/            ← single RPA, all-cash (snap locked)
│   ├── contract-03-lasselle-st-rpa-bundle/  ← 9-form bundle (all snaps locked)
│   ├── contract-01-single-bundle/     ← placeholder (no PDF yet)
│   ├── contract-02-counter-offers/    ← placeholder (no PDFs yet)
│   └── disclosures-01-single-bundle/  ← placeholder (no PDF yet)
│
└── reasoning/                         ← fixture-only: stage reasoning, no PDFs
    ├── contract-01-lasselle-st/       ← RPA + FRR-PA from Lasselle St bundle
    ├── contract-02-bycroft-cir/       ← RPA from Bycroft Cir (all-cash)
    ├── inspection-01-rr-rrr/          ← 3-round RR → RRR → CR-B chain
    ├── appraisal-01-below-value/      ← below-value appraisal + renegotiation
    ├── loan-01-approval/              ← conditional → clear-to-close → CR-B
    ├── escrow-01-instructions/        ← mechanic's lien resolution
    └── closing-01-walkthrough/        ← walkthrough issues → accepted
```

**Extraction scenario folder layout:**
```
extraction/<name>/
├── README.md
├── pdfs/                   ← drop real PDFs here (gitignored — never committed)
├── extractions/            ← locked *.snap.json files (committed)
│   ├── rpa.standard.snap.json
│   └── frr-pa.standard.snap.json
└── scenario.test.ts        ← extraction: + assertIdentification + assertExtraction + snap it() blocks
```

**Reasoning scenario folder layout:**
```
reasoning/<name>/
├── README.md
├── extractions/            ← decision-form JSON fixtures (copied from extraction snaps)
│   ├── rpa.standard.snap.json    ← only decision forms — compliance forms excluded
│   └── frr-pa.standard.snap.json
│   or, for temporal scenarios:
│   ├── round-01/           ← forms available at time 1
│   │   └── rpa.standard.snap.json
│   ├── round-02/           ← cumulative: round-01 forms + newly arrived
│   │   ├── rpa.standard.snap.json
│   │   └── counter.standard.snap.json
│   └── round-03/
└── scenario.test.ts        ← reasoning: + formCodes filter + expect assertions + snap it() blocks
```

---

### Creating a new scenario from scratch

There are two kinds of scenarios — choose based on what you are iterating on.

---

#### Creating an extraction scenario (new PDF / schema change)

Use this when you have a real PDF and want to iterate on form identification or the JSON output schema.

##### Step 1 — create the folder structure

```bash
cd packages/document-intelligence

SCENARIO=rpa-02-my-property         # choose a name: <stage>-<NN>-<slug>

mkdir -p test/extraction/$SCENARIO/pdfs
mkdir -p test/extraction/$SCENARIO/extractions
```

Naming convention: `<stage>-<NN>-<slug>` where `<stage>` is `rpa`, `contract`, `disclosures`, etc.

> **UI tip:** Once you create the folder and write `scenario.test.ts`, your scenario
> immediately appears in `pnpm test:ui` — even with empty `pdfs/` and `extractions/` folders.
> Tests show as `todo` (skipped) until you add a PDF.

---

##### Step 2 — drop in the PDF

```bash
cp ~/Downloads/my-contract.pdf test/extraction/$SCENARIO/pdfs/my-contract.pdf
```

PDFs are gitignored — they never get committed.

---

##### Step 3 — write `scenario.test.ts`

Create `test/extraction/$SCENARIO/scenario.test.ts`. Use this template:

```typescript
import { describe, it, expect } from 'vitest';
import { describeScenario, assertSnap } from '../../helpers/scenario';

const SCENARIO_DIR = __dirname;

// One sentence describing what this scenario tests.
// List the forms in the PDF and notable characteristics.
//
// HOW TO ITERATE:
//   1. Edit src/extractor/forms/<code>/<code>.standard.<vMM-YY>.ts
//   2. Delete extractions/<code>.standard.snap.json
//   3. Run: pnpm exec vitest run test/extraction/rpa-02-my-property
//   4. Review SET 1 (identification) and SET 2 (extraction) console output
//   5. Fix assertions or schema until both pass
//   6. Save printed JSON as the snap file to lock cost at zero

describeScenario(SCENARIO_DIR, {
  stage: 'CONTRACT',   // CONTRACT, DISCLOSURES, INSPECTION, etc.

  extraction: {
    pdfFiles: ['my-contract.pdf'],   // filename under pdfs/

    // SET 1 — fires every run, even with snaps present
    assertIdentification(formGroups) {
      const rpa = formGroups.find((g) => g.formCode === 'RPA');
      expect(rpa, 'Gemini must identify RPA in this PDF').toBeDefined();
      expect(rpa!.pageIndices.length).toBeGreaterThanOrEqual(15);
      const unexpected = formGroups.filter(
        (g) => g.formCode !== 'RPA' && g.formCode !== 'UNKNOWN',
      );
      expect(unexpected, 'No unexpected form codes').toHaveLength(0);
    },

    // SET 2 — fires only when snap is absent (LLM called)
    assertExtraction(forms) {
      const rpa = forms.find((f) => f.formCode === 'RPA');
      expect(rpa, 'RPA must be present').toBeDefined();
      const header = rpa!.data.header as Record<string, unknown>;
      expect(header.form_code).toBe('RPA');
      expect(header.form_version).toBe('Revised 12/25');   // adjust
      const parties = rpa!.data.parties as Record<string, unknown>;
      expect(parties.buyer_names as string[]).toContain('Jane Smith');   // adjust
      const terms = rpa!.data.terms_of_purchase as Record<string, unknown>;
      expect(terms.purchase_price).toBe(850000);   // adjust
    },
  },
});

// Snap assertions — free, no API key, always run
describe('rpa-02 snap assertions', () => {
  it('header contains form_code and form_version', () => {
    const rpa = assertSnap(SCENARIO_DIR, 'RPA');
    const header = rpa.header as Record<string, unknown>;
    expect(header.form_code).toBe('RPA');
    expect(header.form_version).toBe('Revised 12/25');
  });

  it('purchase price is correct', () => {
    const rpa = assertSnap(SCENARIO_DIR, 'RPA');
    const terms = rpa.terms_of_purchase as Record<string, unknown>;
    expect(terms.purchase_price).toBe(850000);
  });
});
```

**Key fields to adjust:** `pdfFiles`, `stage`, form codes in `assertIdentification`, field values in `assertExtraction`, and snap assertion `it()` blocks.

---

##### Step 4 — run the extraction (costs one LLM call)

```bash
cd packages/document-intelligence
pnpm exec vitest run test/extraction/rpa-02-my-property
```

The console prints the extracted JSON and the snap file path:

```
── my-contract.pdf: 17 pages, 1 forms ──
  RPA: pages 1, 2, 3 ...

── RPA (v12-25) — LLM extracted ──
{ "header": { "form_code": "RPA", ... }, ... }

💾 Save & lock: test/extraction/rpa-02-my-property/extractions/rpa.standard.snap.json
{ "formCode": "RPA", "formName": "...", "data": { ... } }
```

---

##### Step 5 — save the snap file

Copy the JSON printed after `💾 Save & lock` into that exact path. Once saved, all future runs skip the LLM for this form: `[SNAP] RPA — skipped LLM, used cached extraction`.

---

##### Step 6 — fill in snap assertions and verify

Update the `it()` blocks with actual values from your snap, then re-run to confirm everything passes.

```bash
pnpm exec vitest run test/extraction/rpa-02-my-property
```

---

#### Creating a reasoning scenario (stage prompt iteration)

Use this when you already have extraction snaps and want to iterate on the stage reasoning prompt. No PDF needed — the reasoning LLM only sees JSON.

##### Step 1 — create the folder and copy decision-form fixtures

```bash
cd packages/document-intelligence

SCENARIO=contract-03-my-deal
mkdir -p test/reasoning/$SCENARIO/extractions

# Copy only the decision forms from the matching extraction scenario
# (omit compliance forms: BIA, BHIA, PRBS, WFA, AVID, SBSA, FHDA, CCPA, AD)
cp test/extraction/<source-scenario>/extractions/rpa.standard.snap.json \
   test/reasoning/$SCENARIO/extractions/
cp test/extraction/<source-scenario>/extractions/frr-pa.standard.snap.json \
   test/reasoning/$SCENARIO/extractions/
```

For temporal scenarios, create `round-01/`, `round-02/` … subfolders and populate each cumulatively.

---

##### Step 2 — write `scenario.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { describeScenario, assertSnap } from '../../helpers/scenario';

const SCENARIO_DIR = __dirname;

describeScenario(SCENARIO_DIR, {
  stage: 'CONTRACT',

  // Optional: inject resolved facts from prior stages
  // context: { finalAgreedPrice: 900000, closeOfEscrowDate: '2026-05-01', ... },

  reasoning: [
    {
      label: 'RPA + FRR-PA — Conventional loan, counter pending',

      // Whitelist which fixture files are passed to the LLM.
      // Mirrors StageReasoningService.decisionFormCodes in production.
      formCodes: ['RPA', 'FRR-PA'],

      // Assert on result.data fields returned by the reasoning LLM.
      expect: {
        finalAgreedPrice: 850000,    // adjust to your fixtures
        financingType: 'Conventional',
        readyToAdvance: false,
      },
    },
  ],
});

// Snap assertions — free, no API key
describe('contract-03-my-deal snap assertions — RPA', () => {
  it('purchase price matches fixture', () => {
    const rpa = assertSnap(SCENARIO_DIR, 'RPA');
    const terms = rpa.terms_of_purchase as Record<string, unknown>;
    expect(terms.purchase_price).toBe(850000);
  });
});
```

---

##### Step 3 — run the reasoning test (costs one LLM call)

```bash
pnpm exec vitest run test/reasoning/contract-03-my-deal
```

Adjust `expect` values to match the actual LLM output. See the reference implementation at `test/reasoning/contract-01-lasselle-st/` for a fully wired example.

---

### Running scenarios

**Preferred — browser UI (no accidental LLM calls):**

```bash
cd packages/document-intelligence
pnpm test:ui          # opens http://localhost:51204
```

**Terminal commands:**

```bash
cd packages/document-intelligence

# Run all extraction scenarios
pnpm exec vitest run test/extraction

# Run all reasoning scenarios
pnpm exec vitest run test/reasoning

# One specific scenario
pnpm exec vitest run test/extraction/rpa-01-bycroft-cir
pnpm exec vitest run test/reasoning/contract-01-lasselle-st

# Watch mode
pnpm test:watch -- contract-01-lasselle -t "snap"
pnpm test:watch -- contract-01-lasselle -t "reasoning"

# Run everything
pnpm test
```

**What each test block does:**

| Block name | LLM cost | When it fires |
|---|---|---|
| `<name> — extraction` | Identifier always; Extractor only if no snap | PDF present + `GEMINI_API_KEY` set |
| `<name> — reasoning` | One reasoning call | Fixtures present + `ANTHROPIC_API_KEY` or `GEMINI_API_KEY` set |
| `<name> snap assertions` (plain `describe`) | Zero | Always — loads snap from disk |

Missing PDF → extraction shows as `todo`. Missing API key → extraction/reasoning shows as `skipped`. Snap assertions always run.

---

### Understanding the test console output

```
[100%] Done                                    ← pipeline progress

── my-contract.pdf: 17 pages, 1 forms ──       ← Splitter + Identifier summary
  RPA: pages 1, 2, 3, 4, 5, 6, 7 ...          ← pages assigned to each form

[SNAP] RPA — skipped LLM, used cached          ← Snap was found, no LLM call

── RPA (v12-25) — LLM extracted ──             ← Snap absent: LLM ran
{ ... }                                        ← extracted JSON (review this)

💾 Save & lock: extractions/rpa.standard.snap.json   ← copy JSON above here
{ "formCode": "RPA", "formName": "...", "data": {...} }

── Reasoning: RPA only — contract state ──     ← Reasoning result
{ "finalAgreedPrice": 850000, ... }
```

---

### File and version naming convention

| Thing | Convention | Example |
|---|---|---|
| Form definition file | `<code>/<code>.<variant>.<vMM-YY>.ts` | `rpa/rpa.standard.v12-23.ts` |
| Exported constant | `<code><Variant>V<MMYY>` (camelCase) | `rpaStandardV1223` |
| Registry shorthand key | `<CODE>` (always latest standard) | `'RPA'` |
| Registry pinned key | `<CODE>@<vMM-YY>` | `'RPA@v12-23'` |
| Extraction fixture file | `<code>.<variant>.<vMM-YY>.json` | `rpa.standard.v12-23.json` |
| Counter offer variant | `counter` | `rpa.counter.v12-23.ts` |

The version matches what is printed on the CAR form: "Revised 12/23" → `v12-23`.

---

### Universal form footer fields

Every CAR form page has a bottom-left footer:

```
RPA  Revised 12/25  Page 1 of 17
```

All form templates include `form_code` and `form_version` in their `header` section via shared constants in `form-definition.ts`:

```typescript
import { FORM_FOOTER_FIELDS, FORM_FOOTER_INSTRUCTION } from '../form-definition';

const MY_TEMPLATE = {
  header: {
    ...FORM_FOOTER_FIELDS,         // injects form_code: '<string | null>', form_version: '<string | null>'
    property_address: '<string | null>',
    date: '<date: YYYY-MM-DD | null>',
    purchase_price: '<number | null>',
    loan_type: "<'Conventional' | 'FHA' | 'VA' | 'Other' | null>",
    buyer_names: ['<string>'],
  },
  // ...
};

systemPrompt: `...
${FORM_FOOTER_INSTRUCTION}   // injects the footer reading instruction
...
${JSON.stringify(MY_TEMPLATE, null, 2)}`
```

Each leaf value is a typed sentinel the LLM fills in:
- `'<string | null>'` — optional text field
- `'<boolean>'` — checkbox (true/false)
- `'<number | null>'` — numeric value (dollars, days, etc.)
- `'<date: YYYY-MM-DD | null>'` — date field with required format
- `"<'Buyer' | 'Seller' | 'Both' | null>"` — closed enum (use exact string)
- `['<string>']` — repeating array (one entry per item)

Extracted output:
```json
"header": {
  "form_code": "RPA",
  "form_version": "Revised 12/25",
  "property_address": "4041 Bycroft",
  ...
}
```

This gives a cross-check between what Gemini identified (Layer 2) and what is physically printed on the form (Layer 3). If they differ, the `assertIdentification` callback will surface it.

---

### Two-set assertion pattern

Every `scenario.test.ts` has two distinct sets of assertions corresponding to the two LLM steps.

**SET 1 — Form identification** (`assertIdentification`)
- Fires every time the pipeline runs, even when snaps are present
- Validates that Gemini correctly detected the right form codes and page counts
- Zero extraction cost — identification always runs

**SET 2 — JSON field and value extraction** (`assertExtraction`)
- Fires **only** when the LLM extracts fresh JSON (snap absent)
- Validates that template and prompt changes produce the expected field values
- Delete the snap to trigger this on the next run

**Snap assertions** (`describe` block with `assertSnap`)
- Load the locked `.snap.json` from disk — no LLM, no API call
- Run in every CI pass and locally at zero cost
- Fail with a clear message if the snap has been deleted

```typescript
describeScenario(SCENARIO_DIR, {
  stage: 'CONTRACT',
  extraction: {
    pdfFiles: ['RPA-FE.pdf'],

    // SET 1: always runs — validates Gemini page identification
    assertIdentification(formGroups) {
      const rpa = formGroups.find((g) => g.formCode === 'RPA');
      expect(rpa).toBeDefined();
      expect(rpa!.pageIndices.length).toBeGreaterThanOrEqual(15);
      const unexpected = formGroups.filter(
        (g) => g.formCode !== 'RPA' && g.formCode !== 'UNKNOWN',
      );
      expect(unexpected).toHaveLength(0);
    },

    // SET 2: only runs when snap is absent — validates LLM fills the template correctly
    assertExtraction(forms) {
      const rpa = forms.find((f) => f.formCode === 'RPA')!;
      const header = rpa.data.header as Record<string, unknown>;
      expect(header.form_code).toBe('RPA');
      expect(header.form_version).toBe('Revised 12/25');
      const terms = rpa.data.terms_of_purchase as Record<string, unknown>;
      expect(terms.purchase_price).toBe(1539900);
    },
  },
});

// Free regression tests — no LLM, no API call
describe('snap assertions', () => {
  it('form footer fields are present', () => {
    const rpa = assertSnap(SCENARIO_DIR, 'RPA');
    const header = rpa.header as Record<string, unknown>;
    expect(header.form_code).toBe('RPA');
    expect(header.form_version).toBe('Revised 12/25');
  });
});
```

See `test/scenarios/rpa-01-bycroft-cir/scenario.test.ts` for the full reference implementation.

---

### Adding a new form

1. Create the form file:
   ```
   src/extractor/forms/spq/spq.standard.v06-24.ts
   ```
   - Copy `rpa/rpa.standard.v12-23.ts` as a template
   - Update `formCode`, `formName`, `variant`, `version`
   - Replace the template object and system prompt for the new form
   - **Always** spread `FORM_FOOTER_FIELDS` into the header and embed `FORM_FOOTER_INSTRUCTION` in the system prompt
   - Export named: `spqStandardV0624`

2. Register it in `src/extractor/forms/registry.ts`:
   ```typescript
   import { spqStandardV0624 } from './spq/spq.standard.v06-24';
   
   export const FORM_REGISTRY = {
     ...
     'SPQ':        spqStandardV0624,   // latest standard
     'SPQ@v06-24': spqStandardV0624,   // pinned key
   };
   ```

3. Add a unit test in `test/unit/form-registry.test.ts`:
   ```typescript
   it('SPQ is registered', () => {
     expect(FORM_REGISTRY['SPQ']).toBeDefined();
     expect(FORM_REGISTRY['SPQ'].formCode).toBe('SPQ');
   });
   ```

4. Create a scenario (see above) and test against a real PDF.

5. Build so the API picks up the new form:
   ```bash
   pnpm --filter @tc/document-intelligence build
   ```

---

### Adding a new version of an existing form

When CAR releases a new revision (e.g. RPA revised 8/24):

1. Create `src/extractor/forms/rpa/rpa.standard.v08-24.ts` — copy from the previous version, update the template and prompt for any field changes.

2. Update `registry.ts`:
   ```typescript
   import { rpaStandardV0824 } from './rpa/rpa.standard.v08-24';
   import { rpaStandardV1223 } from './rpa/rpa.standard.v12-23';  // keep old version

   export const FORM_REGISTRY = {
     'RPA':        rpaStandardV0824,   // ← update shorthand to new version
     'RPA@v08-24': rpaStandardV0824,   // new pinned key
     'RPA@v12-23': rpaStandardV1223,   // old pinned key stays — existing fixtures still resolve
   };
   ```

3. Existing fixture files named `rpa.standard.v12-23.json` continue to work unchanged because the `version` field in the JSON is informational — the reasoner reads the data, not the version.

---

### Adding a stage reasoner

1. Create `src/reasoner/stages/<stage>.reason.ts` — copy `contract.reason.ts` as a template:
   - Set `stage` to match the registry key (e.g. `'INSPECTION'`)
   - Write the `systemPrompt` explaining what forms the LLM will receive and what JSON to return
   - Add the output template object and embed `JSON.stringify(template, null, 2)` in the prompt

2. Register it in `src/reasoner/registry.ts`:
   ```typescript
   import { inspectionReason } from './stages/inspection.reason';
   
   export const REASONING_REGISTRY = {
     CONTRACT:    contractReason,
     DISCLOSURES: disclosuresReason,
     INSPECTION:  inspectionReason,
   };
   ```

3. Add extraction fixtures to a new scenario folder and write a `scenario.test.ts` with reasoning rounds.

---

### Adding a validation rule to an existing stage

Validators are deterministic (no LLM). Use the `pass()`, `fail()`, `warn()`, `skip()` helpers:

```typescript
// src/validator/stages/contract.stage.ts — inside validateForms()
const hoaAttached = e.formsAndDisclosures.some(
  (f) => /\bhoa\b|homeowner.*assoc/i.test(f.title),
);
if (e.property.county && !hoaAttached) {
  out.push(warn('hoa_disclosure', 'forms_disclosures', 'RPA',
    'HOA disclosure attached if applicable',
    'HOA disclosure not detected — confirm if property has HOA'));
}
```

Add a unit test in `test/unit/contract-stage.test.ts` using a hardcoded extraction object — no PDF needed.

---

### Deploying prompt changes to dev or production

```bash
# 1. Build the package (regenerates dist/ consumed by the API)
pnpm --filter @tc/document-intelligence build

# 2. Deploy the API
fly deploy --config fly.dev.toml        # dev
fly deploy --config fly.toml            # production
```

The `dist/` folder does not need to be committed — the deploy container builds it.

---

### Environment variables

| Variable | Required for | Value |
|---|---|---|
| `GEMINI_API_KEY` | Page identification (always Gemini) + Gemini extraction/reasoning | `AIza...` |
| `ANTHROPIC_API_KEY` | Anthropic extraction and reasoning (default provider) | `sk-ant-...` |
| `LLM_EXTRACTION_PROVIDER` | Switch extraction provider | `anthropic` (default) or `gemini` |
| `LLM_REASONING_PROVIDER` | Switch reasoning provider | `anthropic` (default) or `gemini` |

---

### Key types

All public types are exported from `src/index.ts`:

| Type | Description |
|---|---|
| `FormDefinition` | What each form file exports: `{ formCode, formName, variant, version, systemPrompt, userPrompt }` |
| `ReasoningDefinition` | What each reasoner file exports: `{ stage, systemPrompt, buildUserPrompt? }` |
| `ReasoningInput` | Input to the reasoner: `{ formCode, formName, variant?, version?, data }` |
| `ReasoningResult` | Output of `StageReasoner.reason()`: `{ stage, data, rawResponse, tokens }` |
| `FormExtractionOutput` | Output of `FormExtractor.extract()`: `{ formCode, formName, data, rawResponse, tokens }` |
| `ComplianceResult` | Output of any stage validator: `{ checks[], summary, … }` |
| `StageValidationResult` | Full stage assessment: `{ complete, missingForms, checks[], decisions }` |
| `TransactionStage` | Union of 9 stage strings: `'CONTRACT' \| 'DISCLOSURES' \| …` |

---

## 21. Test PDF Generator — `@tc/test-pdf-generator`

**Location:** `packages/test-pdf-generator/`

Generates filled C.A.R. form PDFs from blank templates + fixture JSON data. Used to produce realistic test fixtures for the document-intelligence pipeline.

### 21.1 Dependencies

| Tool | Required for | Install |
|---|---|---|
| `pdf-lib` | Creating overlay PDFs with text/checkboxes | Auto-installed via `pnpm install` |
| `qpdf` | PDF decryption + overlay merge | `brew install qpdf` (macOS) |

The original C.A.R. blank PDFs are encrypted. `qpdf` decrypts them on first use and caches the decrypted version. No other runtime dependencies.

### 21.2 Package structure

```
packages/test-pdf-generator/
├── templates/                     ← Blank C.A.R. PDFs (gitignored, must be copied here)
│   ├── RPA.pdf                   ← California-Residential-Purchase-Agreement.pdf
│   ├── TDS.pdf                   ← Real Estate Transfer Disclosure Statement
│   ├── SPQ.pdf                   ← Seller Property Questionnaire
│   └── ...                       ← Add more forms here
├── src/
│   ├── index.ts                  ← Public API: generateScenarioFiles, types
│   ├── types.ts                  ← Scenario, FormGeneration, CoordinateMap
│   ├── templates.ts              ← FormCode → blank PDF path resolver (auto-decrypts via qpdf)
│   ├── pdf-filler.ts             ← Core engine + public generateScenarioFiles()
│   ├── coordinates/              ← Per-form page region maps
│   │   ├── index.ts              ← Registry: formCode → CoordinateMap
│   │   └── rpa.ts                ← RPA: field positions per page
│   └── fixtures/                 ← One file per scenario, each exports a Scenario object
│       ├── rpa.valid.ts          ← Well-formed RPA ($900K, conventional, all signed)
│       ├── rpa.missing-price.ts  ← purchasePrice: null
│       ├── rpa.counter-offer.ts  ← accepted_subject_to_counter_offer: true
│       └── rpa.resubmit.ts       ← 2 RPAs (V1 original, V2 revised) for resubmission testing
└── test/
    ├── fixtures/                 ← Generated PDFs land here (gitignored)
    └── generator.test.ts         ← 6 unit tests
```

### 21.3 Setup

Copy blank C.A.R. form PDFs into `templates/`. Name them by form code (e.g., `RPA.pdf`):

```bash
cp /path/to/California-Residential-Purchase-Agreement.pdf \
   packages/test-pdf-generator/templates/RPA.pdf
```

### 21.4 How it works (pipeline)

```
blank C.A.R. template PDF (encrypted)
    │
    ▼
qpdf --decrypt → decrypted template (cached)
    │
    ├── pdf-lib creates transparent overlay PDF
    │   (same page count/size, only text at coordinates)
    │
    ▼
qpdf --overlay (merge overlay onto decrypted template)
    │
    ▼
filled PDF (original form preserved + data overlaid)
```

The overlay PDF is a fresh document with transparent pages — it never touches the original template's content streams. `qpdf --overlay` merges the two, preserving all original images (DCTDecode) and Form XObjects.

### 21.5 Commands

| Command | What it does |
|---|---|
| `pnpm --filter @tc/test-pdf-generator build` | Compile TypeScript |
| `pnpm --filter @tc/test-pdf-generator test` | Run unit tests (generates PDFs to `test/fixtures/`) |
| `pnpm --filter @tc/test-pdf-generator typecheck` | TypeScript check only |

### 21.6 API

```typescript
import { generateScenarioFiles } from '@tc/test-pdf-generator';
```

#### `generateScenarioFiles(scenario, outputDir): Promise<string[]>`

Single entrypoint. Writes one PDF file per `FormGeneration` entry to `{outputDir}/{scenario.name}/`. Returns array of written file paths.

##### Single form, no label

```typescript
import { rpaValid } from '@tc/test-pdf-generator/fixtures/rpa.valid';

const files = await generateScenarioFiles(rpaValid, 'test/fixtures');
// → test/fixtures/rpa-valid/RPA.pdf
```

##### Multi-form, labeled (resubmission testing)

```typescript
import { rpaResubmit } from '@tc/test-pdf-generator/fixtures/rpa.resubmit';

const files = await generateScenarioFiles(rpaResubmit, 'test/fixtures');
// → test/fixtures/rpa-resubmit/RPA-V1.pdf
// → test/fixtures/rpa-resubmit/RPA-V2.pdf
```

##### Mixed form codes (RPA + SCO + BCO)

Each gets its own PDF file (not merged):

```typescript
const files = await generateScenarioFiles({
  name: 'contract-bundle',
  forms: [
    { formCode: 'RPA', data: rpaValid, label: 'V1' },
    { formCode: 'SCO', data: scoOffer, label: 'V1' },
    { formCode: 'SCO', data: scoCounter, label: 'V2' },
    { formCode: 'BCO', data: bco1, label: 'V1' },
    { formCode: 'BCO', data: bco2, label: 'V2' },
  ],
}, 'test/fixtures');
// → test/fixtures/contract-bundle/RPA-V1.pdf
// → test/fixtures/contract-bundle/SCO-V1.pdf
// → test/fixtures/contract-bundle/SCO-V2.pdf
// → test/fixtures/contract-bundle/BCO-V1.pdf
// → test/fixtures/contract-bundle/BCO-V2.pdf
```

### 21.7 Fixture file layout

Each fixture file in `src/fixtures/` exports a `Scenario` object. The folder name on disk equals `scenario.name`. No registry to update — import the Scenario directly.

```
src/fixtures/
├── rpa.valid.ts          → exports rpaValid: Scenario, rpaValidData (raw data)
├── rpa.missing-price.ts  → exports rpaMissingPrice: Scenario, rpaMissingPriceData
├── rpa.counter-offer.ts  → exports rpaCounterOffer: Scenario, rpaCounterOfferData
└── rpa.resubmit.ts       → exports rpaResubmit: Scenario (2 forms with labels)
```

**Naming convention:**

| Condition | Example filename |
|---|---|
| `label` provided | `{FormCode}-{label}.pdf` → `RPA-V1.pdf` |
| No label, single form | `{FormCode}.pdf` → `RPA.pdf` |
| No label, multiple forms | `{FormCode}-{index}.pdf` → `RPA-0.pdf`, `RPA-1.pdf` |

### 21.8 Adding a new fixture

Create a new file in `src/fixtures/`. No registry update needed.

```bash
cat > src/fixtures/rpa.no-signatures.ts << 'EOF'
import type { Scenario } from '../types';
import { rpaValidData } from './rpa.valid';

export const rpaNoSignaturesData = {
  ...rpaValidData,
  signatures: { buyerSigned: false, sellerSigned: false,
    signedParties: [], missingSignatures: ['John Buyer', 'Jane Seller'] },
};

export const rpaNoSignatures: Scenario = {
  name: 'rpa-no-signatures',
  forms: [{ formCode: 'RPA', data: rpaNoSignaturesData }],
};
EOF
```

Usage:

```typescript
const files = await generateScenarioFiles(rpaNoSignatures, 'test/fixtures');
// → test/fixtures/rpa-no-signatures/RPA.pdf
```

### 21.9 Adding a new form type (e.g., SCO)

Requires three files:

| Step | File | What |
|---|---|---|
| 1 | `templates/SCO.pdf` | Copy the blank C.A.R. SCO PDF here |
| 2 | `src/coordinates/sco.ts` | Define field positions per page |
| 3 | `src/fixtures/sco.valid.ts` | Fixture exporting a Scenario with SCO form code |

**Coordinate file example (`coordinates/sco.ts`):**

```typescript
import { CoordinateMap } from '../types';

export const SCO: CoordinateMap = [
  {
    pageNumber: 1,
    fields: {
      'header.property_address': { x: 88, y: 650, w: 340, fontSize: 10 },
      'parties.buyer_names.0':    { x: 88, y: 570, w: 240, fontSize: 10 },
      'parties.seller_names.0':   { x: 344, y: 570, w: 240, fontSize: 10 },
      'expiration.expiration_date': { x: 88, y: 250, w: 120, fontSize: 10 },
    },
  },
  {
    pageNumber: 2,
    fields: {
      'section_4_offer.offeror_1_signature_date': { x: 88, y: 480, w: 120, fontSize: 10 },
      'section_5_acceptance.acceptor_1_signature_date': { x: 88, y: 240, w: 120, fontSize: 10, isCheckbox: true },
    },
  },
];
```

Coordinates use standard PDF space (0,0 = bottom-left, y increases upward).

Register the coordinate map in `coordinates/index.ts`:

```typescript
import { SCO } from './sco';

const registry: Record<string, CoordinateMap> = {
  RPA,
  SCO,   // ← add
};
```

### 21.10 Integration with `@tc/document-intelligence` tests

Add `@tc/test-pdf-generator` as a devDependency in the document-intelligence package:

```json
// packages/document-intelligence/package.json
{
  "devDependencies": {
    "@tc/test-pdf-generator": "workspace:*"
  }
}
```

Then use generated PDFs in pipeline tests:

```typescript
import { generateScenarioFiles } from '@tc/test-pdf-generator';
import { rpaValid } from '@tc/test-pdf-generator/fixtures/rpa.valid';
import { buildPipeline } from '../helpers/pipeline';

describe('RPA extraction', () => {
  it('extracts purchase price from generated PDF', async () => {
    const [pdfPath] = await generateScenarioFiles(rpaValid, os.tmpdir());
    const pdfBuf = fs.readFileSync(pdfPath);
    const pipeline = buildPipeline();
    const result = await pipeline.process(pdfBuf);

    expect(result.extractions[0].data.transaction.purchasePrice).toBe(900000);
  });
});
```
