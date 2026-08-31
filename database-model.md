# Real Estate Transaction Hub — Database Model

This document defines the relational database model for the TC real-estate transaction hub. It reflects the current production implementation as of April 2026.

The system supports UI workflows, persistent storage, AI/LLM-assisted document processing, email and SMS integrations, workflow template engines, and transaction audit history.

---

## Goals

- A `user` has exactly one `account`
- An `account` participates in one or more organizations via `organization_memberships`
- An organization owns many transactions
- A transaction is the central business object — parties, documents, tasks, events, messages, journals, and workflow steps all hang off it
- Workflow steps are instantiated from reusable templates, keyed by state + transaction type + side
- All significant events are journaled in an append-only timeline
- LLM interactions are recorded in a separate append-only table for cost tracking and auditability

---

## Relationship model

### Identity and organization

- `users` 1:1 `accounts`
- `accounts` M:N `real_estate_organizations` via `organization_memberships`
- `real_estate_organizations` 1:N `real_estate_transactions`

### Transaction domain

- `real_estate_transactions` 1:N `transaction_parties`
- `real_estate_transactions` 1:N `transaction_messages`
- `real_estate_transactions` 1:N `transaction_document_submissions`
- `transaction_document_submissions` 1:N `transaction_documents`
- `transaction_documents` self-ref via `previous_version_id` (version chain)
- `real_estate_transactions` 1:N `transaction_tasks`
- `real_estate_transactions` 1:N `transaction_events`
- `real_estate_transactions` 1:N `transaction_journals`
- `real_estate_transactions` 1:N `transaction_workflow_steps`
- `real_estate_transactions` 1:N `ai_interactions` (nullable)

### Workflow template domain

- `transaction_workflow_templates` 1:N `transaction_workflow_template_steps`
- `transaction_workflow_template_steps` 1:N `transaction_workflow_steps` (instantiated per transaction)

### Form template domain

- `transaction_form_templates` 1:N `transaction_form_template_items`

### Document submission and versioning domain

- `transaction_document_submissions` 1:N `transaction_documents` (via `submission_id`)
- `transaction_documents` self-ref via `previous_version_id` (version chain: v1 ← v2 ← v3)

### Workflow step scoping (cross-cutting)

`transaction_workflow_steps` 1:N `transaction_documents` (via `workflow_step_id`)
`transaction_workflow_steps` 1:N `transaction_tasks` (via `workflow_step_id`)
`transaction_workflow_steps` 1:N `transaction_messages` (via `workflow_step_id`)

---

## Entity overview

| Entity | Table | Notes |
|---|---|---|
| `UserEntity` | `users` | Auth identity — email, password hash, verification |
| `AccountEntity` | `accounts` | User profile — 1:1 with users |
| `OrganizationEntity` | `real_estate_organizations` | Brokerage, TC company, title co, lender, etc. |
| `OrganizationMembershipEntity` | `organization_memberships` | Account ↔ org join with role |
| `TransactionEntity` | `real_estate_transactions` | Core transaction record |
| `ContactEntity` | `contacts` | Reusable person/company directory entries |
| `TransactionPartyEntity` | `transaction_parties` | Party-role mapping within a transaction |
| `TransactionJournalEntity` | `transaction_journals` | Append-only audit timeline |
| `TransactionMessageEntity` | `transaction_messages` | Email, SMS, in-app, AI chat records |
| `TransactionDocumentSubmissionEntity` | `transaction_document_submissions` | One round of document delivery per transaction |
| `TransactionDocumentEntity` | `transaction_documents` | Individual files with versioning and submission grouping |
| `TransactionTaskEntity` | `transaction_tasks` | Checklist items with assignments and dependencies |
| `TransactionEventEntity` | `transaction_events` | Milestone and deadline dates |
| `TransactionWorkflowTemplateEntity` | `transaction_workflow_templates` | Reusable workflow template per state/type/side |
| `TransactionWorkflowTemplateStepEntity` | `transaction_workflow_template_steps` | Steps within a workflow template |
| `TransactionWorkflowStepEntity` | `transaction_workflow_steps` | Per-transaction step instances |
| `TransactionFormTemplateEntity` | `transaction_form_templates` | CAR form package per state/type/side |
| `TransactionFormTemplateItemEntity` | `transaction_form_template_items` | Individual forms within a package |
| `AiInteractionEntity` | `ai_interactions` | Append-only LLM call log |
| `TransactionAccessGrantEntity` | `transaction_access_grants` | Explicit per-transaction access for contractor TCs and external viewers |

---

## Detailed table design

### 1. `users`

Purpose: system identity used for authentication and authorization.

Columns:

- `id` UUID PK
- `email` varchar, unique, not null
- `phone` varchar, nullable
- `password_hash` varchar, not null — **never returned to API clients** (`@HideField`)
- `status` varchar, not null, default `active` — values: `pending`, `active`, `inactive`, `suspended`
- `email_verified_at` timestamptz, nullable
- `verification_token` varchar, nullable — **hidden** — 32-byte hex token; cleared after verification
- `verification_token_expires_at` timestamptz, nullable — **hidden** — 24-hour TTL
- `last_login_at` timestamptz, nullable
- `created_at` timestamptz, not null
- `updated_at` timestamptz, not null

Indexes:

- Unique on `email`

Notes:

- New users register with `status = pending`; email verification sets `status = active`
- `verification_token` and `verification_token_expires_at` are `@HideField` — never exposed in GraphQL or REST responses

---

### 2. `accounts`

Purpose: application-level profile, 1:1 with `users`.

Columns:

- `id` UUID PK
- `user_id` UUID FK → `users.id`, unique, not null (CASCADE delete)
- `display_name` varchar, not null
- `first_name` varchar, nullable
- `last_name` varchar, nullable
- `avatar_url` text, nullable
- `timezone` varchar, nullable
- `locale` varchar, nullable
- `organization_name` varchar, nullable — self-reported org name (not a FK; used for display)
- `cell_phone` varchar, nullable
- `office_phone` varchar, nullable
- `address_line1` varchar, nullable
- `address_line2` varchar, nullable
- `city` varchar, nullable
- `state` varchar, nullable
- `zip_code` varchar, nullable
- `country` varchar, nullable
- `preferences_json` jsonb, nullable — **hidden** — user preferences blob
- `status` varchar, not null, default `active`
- `created_at` timestamptz, not null
- `updated_at` timestamptz, not null

Indexes:

- Unique on `user_id`

---

### 3. `real_estate_organizations`

Purpose: business container for transactions — brokerages, TC companies, title/escrow companies, lenders, law firms.

Columns:

- `id` UUID PK
- `name` varchar, not null
- `type` varchar, not null
- `license_number` varchar, nullable
- `email_domain` varchar, nullable
- `phone` varchar, nullable
- `status` varchar, not null, default `active`
- `address_line1` varchar, nullable
- `address_line2` varchar, nullable
- `city` varchar, nullable
- `state` varchar, nullable
- `postal_code` varchar, nullable
- `country` varchar, nullable
- `metadata_json` jsonb, nullable
- `created_at` timestamptz, not null
- `updated_at` timestamptz, not null

`type` values: `brokerage`, `team`, `transaction_coordination_company`, `title_company`, `escrow_company`, `lender`, `law_firm`

---

### 4. `organization_memberships`

Purpose: M:N join between accounts and organizations with role.

Columns:

- `id` UUID PK
- `organization_id` UUID FK → `real_estate_organizations.id`, not null
- `account_id` UUID FK → `accounts.id`, not null
- `role` varchar, not null
- `access_scope` varchar, not null, default `assigned_only` — controls transaction visibility for this member
- `is_primary` boolean, not null, default `false`
- `permissions_json` jsonb, nullable
- `joined_at` timestamptz, nullable
- `created_at` timestamptz, not null
- `updated_at` timestamptz, not null

Indexes:

- Unique composite on (`organization_id`, `account_id`)

`role` values: `broker_admin`, `agent`, `transaction_coordinator`, `manager`, `assistant`, `viewer`

`access_scope` values:
- `all_transactions` — member sees every transaction belonging to the organization (broker admins, managers, in-house TCs)
- `assigned_only` — member sees only transactions where they appear as a named party (default for agents, assistants, viewers)

Notes:

- `access_scope` is independent of `role` — a `transaction_coordinator` hired by a large brokerage gets `all_transactions`; an agent at the same brokerage may be `assigned_only`
- On migration, existing `broker_admin` and `manager` rows are backfilled to `all_transactions`; all others default to `assigned_only`

---

### 5. `real_estate_transactions`

Purpose: the central business object. All other transaction domain tables reference this.

Columns:

- `id` UUID PK
- `organization_id` UUID FK → `real_estate_organizations.id`, not null (RESTRICT delete)
- `transaction_number` varchar, unique, not null
- `external_ref` varchar, nullable
- `transaction_type` varchar, not null
- `side` varchar, not null
- `status` varchar, not null, default `draft`
- `stage` varchar, not null, default `intake`
- `property_address_line1` varchar, not null
- `property_address_line2` varchar, nullable
- `property_city` varchar, not null
- `property_state` varchar, not null
- `property_postal_code` varchar, nullable
- `property_county` varchar, nullable
- `apn` varchar, nullable
- `mls_number` varchar, nullable
- `bedrooms` numeric(5,2), nullable
- `bathrooms` numeric(5,2), nullable
- `square_feet` integer, nullable
- `lot_size_sqft` integer, nullable
- `year_built` integer, nullable
- `list_price` numeric(14,2), nullable
- `contract_price` numeric(14,2), nullable
- `earnest_money_amount` numeric(14,2), nullable
- `commission_amount` numeric(14,2), nullable
- `offer_accepted_at` timestamptz, nullable
- `open_escrow_at` timestamptz, nullable
- `inspection_deadline_at` timestamptz, nullable
- `finance_deadline_at` timestamptz, nullable
- `appraisal_deadline_at` timestamptz, nullable
- `close_of_escrow_at` timestamptz, nullable
- `closed_at` timestamptz, nullable
- `cancelled_at` timestamptz, nullable
- `created_by_account_id` UUID FK → `accounts.id`, not null (RESTRICT delete)
- `assigned_coordinator_account_id` UUID FK → `accounts.id`, nullable (SET NULL)
- `summary_json` jsonb, nullable — **hidden**
- `created_at` timestamptz, not null
- `updated_at` timestamptz, not null

`transaction_type` values: `purchase`, `sale`, `lease`

`side` values: `buyer_side`, `seller_side`, `dual`

`status` values: `draft`, `active`, `under_contract`, `pending_close`, `closed`, `cancelled`, `archived`

`stage` values (ordered): `intake` → `contract` → `disclosures` → `inspection` → `appraisal` → `loan` → `escrow` → `closing` → `post_close`

Indexes:

- Index on `organization_id`
- Index on `status`
- Index on `stage`
- Unique on `transaction_number`

Notes:

- Transaction is created in `status=draft`, `stage=intake`
- Calling the init-workflow endpoint transitions to `status=active`, `stage=contract`
- Key deadline dates are denormalized here for fast querying; `transaction_events` holds the full structured calendar
- `stage` is a **single varchar** — the transaction is always in exactly one stage at a time. Parallel phases are not supported by design; the linear sequence is the authoritative progression model
- `assigned_coordinator_account_id` is nullable — a TC is not required. Agents can manage their own transactions without a coordinator
- Stage advancement is currently manual — no automated logic promotes `stage` when workflow steps complete. That logic is pending
- Six tables work together to track a transaction's progress: `transaction_workflow_steps` (what must be done), `transaction_tasks` (who does what), `transaction_events` (key dates), `transaction_journals` (immutable audit trail), `transaction_messages` (communications), `ai_interactions` (LLM reasoning log)

---

### 6. `contacts`

Purpose: reusable directory of people and companies referenced by transaction parties.

Columns:

- `id` UUID PK
- `contact_type` varchar, not null — values: `person`, `company`
- `first_name` varchar, nullable
- `last_name` varchar, nullable
- `company_name` varchar, nullable
- `email` varchar, nullable
- `phone` varchar, nullable
- `secondary_phone` varchar, nullable
- `address_line1` varchar, nullable
- `address_line2` varchar, nullable
- `city` varchar, nullable
- `state` varchar, nullable
- `postal_code` varchar, nullable
- `notes` text, nullable
- `metadata_json` jsonb, nullable
- `created_at` timestamptz, not null
- `updated_at` timestamptz, not null

---

### 7. `transaction_parties`

Purpose: explicit party-role mapping within a transaction. Supports both external parties (buyers, sellers) and internal platform users (agents, TCs).

Columns:

- `id` UUID PK
- `transaction_id` UUID FK → `real_estate_transactions.id`, not null (CASCADE delete)
- `contact_id` UUID FK → `contacts.id`, nullable (SET NULL) — external parties (buyers, sellers)
- `organization_id` UUID FK → `real_estate_organizations.id`, nullable (SET NULL) — the party's company
- `account_id` UUID FK → `accounts.id`, nullable (SET NULL) — internal platform users (agents, TCs)
- `delegated_by_party_id` UUID FK → `transaction_parties.id`, nullable (SET NULL) — self-referential; records who delegated work to this party
- `party_role` varchar, not null
- `display_name` varchar, not null
- `email` varchar, nullable
- `phone` varchar, nullable
- `is_primary` boolean, not null, default `false`
- `notes` text, nullable
- `metadata_json` jsonb, nullable — **hidden**
- `created_at` timestamptz, not null
- `updated_at` timestamptz, not null

`party_role` values: `buyer`, `seller`, `buyer_agent`, `buyer_agent_representative`, `seller_agent`, `seller_agent_representative`, `buyer_transaction_coordinator`, `seller_transaction_coordinator`, `lender`, `loan_officer`, `escrow_officer`, `title_officer`, `attorney`, `inspector`, `appraiser`, `other`

Indexes:

- Index on `transaction_id`
- Index on `party_role`

Notes:

- External parties (buyers, sellers) use `contact_id`; internal users use `account_id`; both can be set simultaneously
- `delegated_by_party_id` crosses org boundaries — an agent can delegate to an independent contractor TC not in the same org

---

### 8. `transaction_journals`

Purpose: append-only audit timeline for the transaction. Records what happened, when, and who triggered it. Do not update or delete rows.

Columns:

- `id` UUID PK
- `transaction_id` UUID FK → `real_estate_transactions.id`, not null (CASCADE delete)
- `journal_type` varchar, not null
- `event_at` timestamptz, not null
- `actor_account_id` UUID FK → `accounts.id`, nullable (SET NULL)
- `source` varchar, not null
- `title` varchar, not null
- `body` text, nullable
- `related_entity_type` varchar, nullable — e.g. `transaction_message`, `transaction_document`
- `related_entity_id` UUID, nullable — FK to the related record (not enforced at DB level for flexibility)
- `metadata_json` jsonb, nullable — **hidden**
- `created_at` timestamptz, not null

No `updated_at` — this table is append-only.

`journal_type` values: `note`, `status_change`, `stage_change`, `email_received`, `email_sent`, `sms_received`, `sms_sent`, `task_created`, `task_completed`, `document_uploaded`, `document_signed`, `document_rejected`, `deadline_updated`, `ai_summary`, `ai_action`, `system_event`

`source` values: `ui`, `email`, `sms`, `system`, `ai`, `webhook`, `import`

Indexes:

- Index on (`transaction_id`, `event_at`)
- Index on `journal_type`

---

### 9. `transaction_messages`

Purpose: every communication in or out of a transaction — inbound/outbound email, SMS, in-app messages, AI chat.

Columns:

- `id` UUID PK
- `transaction_id` UUID FK → `real_estate_transactions.id`, not null (CASCADE delete)
- `channel` varchar, not null — values: `email`, `sms`, `in_app`, `ai_chat`
- `direction` varchar, not null — values: `inbound`, `outbound`, `internal`
- `sender_party_id` UUID FK → `transaction_parties.id`, nullable (SET NULL)
- `recipient_party_id` UUID FK → `transaction_parties.id`, nullable (SET NULL)
- `subject` varchar, nullable
- `body_text` text, nullable
- `body_html` text, nullable — **hidden** — raw HTML stored but never returned to clients
- `provider_name` varchar, nullable — e.g. `mailgun`, `twilio`
- `provider_message_id` varchar, nullable — provider's unique message ID
- `provider_thread_id` varchar, nullable — provider's thread/conversation ID
- `thread_key` varchar, nullable — application-level thread grouping key
- `status` varchar, not null, default `received` — values: `queued`, `sent`, `delivered`, `failed`, `received`, `read`
- `sent_at` timestamptz, nullable
- `received_at` timestamptz, nullable
- `workflow_step_id` UUID FK → `transaction_workflow_steps.id`, nullable (SET NULL) — scopes message to a workflow phase
- `metadata_json` jsonb, nullable — **hidden** — LLM-extracted action items and summaries written here
- `created_at` timestamptz, not null
- `updated_at` timestamptz, not null

Indexes:

- Index on `transaction_id`
- Index on `channel`
- Index on `thread_key`
- Index on `provider_message_id`

Notes:

- Inbound emails arrive via `POST /webhooks/email/inbound`; routed by recipient address `txn-{uuid}@txn.mytcapp.net`
- `sender_party_id` / `recipient_party_id` are nullable — inbound emails from external parties have no party FK until matched
- `provider_thread_id` is Mailgun/provider's thread; `thread_key` is the application's own grouping — both coexist
- `metadata_json` is reserved for the LLM email interpretation pipeline (pending)

---

### 10. `transaction_document_submissions`

Purpose: groups documents that arrive together as one delivery round. A new submission is created each time a party sends a revised package. Tracks the status of the entire round independently from individual document statuses.

Columns:

- `id` UUID PK
- `transaction_id` UUID FK → `real_estate_transactions.id`, not null (CASCADE delete)
- `submission_no` integer, not null — auto-incremented per transaction (1, 2, 3…)
- `status` varchar, not null, default `pending`
- `submitted_by_party_id` UUID FK → `transaction_parties.id`, nullable (SET NULL) — the party who sent this batch
- `notes` text, nullable
- `created_at` timestamptz, not null
- `updated_at` timestamptz, not null

`status` values: `pending` | `under_review` | `issues_found` | `accepted` | `superseded`

Indexes:

- Index on `transaction_id`
- Index on `status`
- Unique constraint on (`transaction_id`, `submission_no`)

Notes:

- When a submission is accepted (`PATCH /submissions/:id/accept`), all earlier submissions for the same transaction are automatically set to `superseded`
- `issues_found` is set when extraction flags missing or invalid fields across documents in the round — the TC notifies the submitting party and a new submission round begins
- Does not hard-delete rows — the full history of every round is retained for audit purposes

---

### 11. `transaction_documents`

Purpose: individual files attached to a transaction. Supports a full version chain across submission rounds — when a corrected document is uploaded, the old row is marked `superseded` and a new row is created linked via `previous_version_id`.

Columns:

- `id` UUID PK
- `transaction_id` UUID FK → `real_estate_transactions.id`, not null (CASCADE delete)
- `submission_id` UUID FK → `transaction_document_submissions.id`, nullable (SET NULL) — the round this document belongs to
- `previous_version_id` UUID FK → `transaction_documents.id`, nullable (SET NULL) — self-referential; v2 points to v1 it replaced
- `document_type` varchar, not null — free-form string (e.g. `rpa`, `tds`, `inspection_report`)
- `title` varchar, not null
- `file_name` varchar, nullable
- `mime_type` varchar, nullable
- `storage_key` varchar, nullable — **hidden** — internal S3/R2 object path; never returned to clients
- `storage_url` text, nullable — pre-signed or public URL returned to clients
- `version_no` integer, not null, default `1` — display number; incremented automatically on each new version
- `status` varchar, not null — see lifecycle below
- `requested_from_party_id` UUID FK → `transaction_parties.id`, nullable (SET NULL)
- `uploaded_by_account_id` UUID FK → `accounts.id`, nullable (SET NULL)
- `signed_at` timestamptz, nullable
- `approved_at` timestamptz, nullable
- `due_at` timestamptz, nullable
- `workflow_step_id` UUID FK → `transaction_workflow_steps.id`, nullable (SET NULL) — scopes document to a workflow phase
- `ai_interaction_id` UUID FK → `ai_interactions.id`, nullable (SET NULL) — the LLM call that produced the extraction result for this document
- `metadata_json` jsonb, nullable — **hidden** — PDF extraction results and compliance scores per version (see structure below)
- `created_at` timestamptz, not null
- `updated_at` timestamptz, not null

`status` values:
- `requested` — TC has requested this document from a party; not yet uploaded
- `uploaded` — file received; extraction not yet run
- `under_review` — extraction complete; TC reviewing
- `signed` — document has been signed
- `approved` — TC approved; no further action needed
- `rejected` — TC explicitly rejected after review (distinct from superseded)
- `expired` — deadline passed without approval
- `superseded` — automatically set when `POST /transaction-documents/:id/new-version` is called; the old row is retired

Status lifecycle:
```
requested → uploaded → under_review → signed → approved
                                             ↘ rejected   (TC action)
                                             ↘ expired    (deadline passed)
                                             ↘ superseded (new version uploaded)
```

Version chain example:
```
doc_v1  versionNo=1, status=superseded, previousVersionId=NULL        (submission 1)
  ↑
doc_v2  versionNo=2, status=superseded, previousVersionId=doc_v1.id   (submission 2)
  ↑
doc_v3  versionNo=3, status=approved,   previousVersionId=doc_v2.id   (submission 2)
```

Indexes:

- Index on `transaction_id`
- Index on `submission_id`
- Index on `previous_version_id`
- Index on `status`
- Index on `due_at`
- Index on `workflow_step_id`

Indexes:

- Index on `ai_interaction_id`

`metadata_json` structure (JSONB — TypeORM deserialises to a native JS object on retrieval; no `JSON.parse()` needed):

```json
{
  "extraction":          { /* full ExtractionResult — property, parties, terms, etc. */ },
  "compliance":          { /* full ComplianceResult — rules, overallStatus, etc. */ },
  "extractedAt":         "2025-04-26T12:34:56.789Z",
  "pdfSource":           "acroform | llm_extraction",
  "acroFieldCount":      42,
  "complianceStatus":    "pass | fail | warning",
  "confidenceOverall":   0.91,
  "extractionWarnings":  ["seller signature missing", "..."]
}
```

This is the canonical location for per-version extraction data. It is populated by `TransactionDraftService.recordContractDocument()` when a PDF is uploaded via `POST /api/v1/document-extraction/extract-and-draft`.

Notes:

- `document_type` is the grouping label across versions — all versions of an RPA share `document_type = 'rpa'`
- `storage_key` is `@HideField` — clients receive only `storage_url`
- Each version row keeps its own `metadata_json` — extraction results are per-version so the TC can compare what changed between rounds
- `ai_interaction_id` links back to the `ai_interactions` row whose `metadata_json` holds the raw LLM output; the document row stores the processed/compiled result including compliance
- Active document set query: `WHERE status NOT IN ('superseded', 'rejected')` — returns one current row per document type
- A document does not need to belong to a submission (`submission_id` is nullable) — documents can be created independently (e.g. TC-generated requests)

---

### 12. `transaction_tasks`

Purpose: checklist items with assignments, priorities, and dependencies.

Columns:

- `id` UUID PK
- `transaction_id` UUID FK → `real_estate_transactions.id`, not null (CASCADE delete)
- `template_key` varchar, nullable — links back to the workflow template step that spawned this task
- `title` varchar, not null
- `description` text, nullable
- `status` varchar, not null, default `todo` — values: `todo`, `in_progress`, `blocked`, `done`, `waived`
- `priority` varchar, not null, default `normal` — values: `low`, `normal`, `high`, `urgent`
- `assigned_account_id` UUID FK → `accounts.id`, nullable (SET NULL)
- `depends_on_task_id` UUID FK → `transaction_tasks.id`, nullable (SET NULL) — self-referential dependency
- `due_at` timestamptz, nullable
- `completed_at` timestamptz, nullable
- `created_by_account_id` UUID FK → `accounts.id`, nullable (SET NULL)
- `workflow_step_id` UUID FK → `transaction_workflow_steps.id`, nullable (SET NULL) — scopes task to a workflow phase
- `metadata_json` jsonb, nullable — **hidden**
- `created_at` timestamptz, not null
- `updated_at` timestamptz, not null

Indexes:

- Index on `transaction_id`
- Index on `assigned_account_id`
- Index on `status`
- Index on `due_at`

Notes:

- `depends_on_task_id` is a self-referential FK — enables ordered task chains within a step (e.g. "prepare repair request" depends on "review inspection report")
- `template_key` ties a task back to its originating workflow template step for programmatic identification
- `assigned_account_id` links only to platform accounts (agents, TCs) — external parties (buyers, sellers, lenders) cannot be assignees. Tasks involving external parties are assigned to the agent or TC who owns the follow-up
- `workflow_step_id` scopes a task to a phase — the primary way to query "all open tasks for the INSPECTION step"
- Tasks are the granular action items within a workflow step. Steps are phases ("complete inspection contingency"); tasks are the individual to-dos within that phase ("schedule inspector", "review report", "send repair request")
- When no TC is involved, all task `assigned_account_id` values default to the agent's account

---

### 13. `transaction_events`

Purpose: structured milestone and deadline calendar for the transaction.

Columns:

- `id` UUID PK
- `transaction_id` UUID FK → `real_estate_transactions.id`, not null (CASCADE delete)
- `event_type` varchar, not null — closed enum (see below)
- `event_date` timestamptz, not null
- `status` varchar, not null, default `scheduled` — values: `scheduled`, `completed`, `cancelled`, `missed`, `rescheduled`
- `notes` text, nullable
- `created_by_account_id` UUID FK → `accounts.id`, nullable (SET NULL)
- `metadata_json` jsonb, nullable — **hidden**
- `created_at` timestamptz, not null
- `updated_at` timestamptz, not null

`event_type` values: `offer_accepted`, `open_escrow`, `inspection`, `appraisal`, `loan_commitment`, `contingency_deadline`, `final_walkthrough`, `closing`, `post_close_followup`

Indexes:

- Index on `transaction_id`
- Index on `event_date`

Notes:

- `event_type` is a closed enum — only real estate milestone types are modelled; custom calendar events are not currently supported
- Key dates on `real_estate_transactions` (e.g. `inspection_deadline_at`, `close_of_escrow_at`) are denormalized copies for fast querying — events are the authoritative structured calendar
- Events are "things that happen on a date" (the inspection is Tuesday May 10). Tasks are "things someone must do" (schedule the inspector). Both can reference the same workflow step
- `missed` status enables the AI pipeline to detect overdue milestones and suggest follow-up actions

---

### 14. `transaction_workflow_templates`

Purpose: reusable workflow definitions scoped by state, transaction type, and side. System templates are platform-provided; orgs can create custom templates.

Columns:

- `id` UUID PK
- `organization_id` UUID FK → `real_estate_organizations.id`, nullable (CASCADE delete) — null = system template available to all orgs
- `name` varchar, not null
- `description` text, nullable
- `state_code` varchar, nullable — e.g. `CA`, `IL`; null = national fallback
- `transaction_type` varchar, not null
- `side` varchar, not null
- `version` integer, not null, default `1`
- `is_system` boolean, not null, default `false` — true = platform-provided
- `is_active` boolean, not null, default `true`
- `created_by_account_id` UUID FK → `accounts.id`, nullable (SET NULL)
- `created_at` timestamptz, not null
- `updated_at` timestamptz, not null

Indexes:

- Index on `organization_id`
- Index on `state_code`

Template resolution priority (highest wins): org + state > org + national > system + state > system + national.

---

### 15. `transaction_workflow_template_steps`

Purpose: ordered steps within a workflow template. Defines what needs to happen, in what order, and who is responsible.

Columns:

- `id` UUID PK
- `template_id` UUID FK → `transaction_workflow_templates.id`, not null (CASCADE delete)
- `step_key` varchar, not null — stable machine-readable key, unique within a template
- `step_name` varchar, not null
- `description` text, nullable
- `category` varchar, not null — e.g. `disclosure`, `inspection`, `financial`, `closing`, `post_close`
- `responsible_role` varchar, not null — party role primarily responsible (e.g. `seller_agent`, `escrow_officer`)
- `sort_order` integer, not null — gaps of 1000 (1000, 2000…) allow inserting without renumbering
- `is_optional` boolean, not null, default `false`
- `default_duration_days` integer, nullable — days from reference date (`offer_accepted_at`) to auto-compute `due_at`
- `prerequisite_keys` jsonb, nullable — **hidden** — JSON array of `step_key` strings that must complete before this step
- `metadata_json` jsonb, nullable — **hidden**
- `created_at` timestamptz, not null
- `updated_at` timestamptz, not null

Indexes:

- Index on `template_id`
- Index on (`template_id`, `sort_order`)

---

### 16. `transaction_workflow_steps`

Purpose: per-transaction instances of workflow template steps. Created when a transaction's workflow is initialized.

Columns:

- `id` UUID PK
- `transaction_id` UUID FK → `real_estate_transactions.id`, not null (CASCADE delete)
- `template_step_id` UUID FK → `transaction_workflow_template_steps.id`, nullable (SET NULL) — null = ad-hoc step added outside a template
- `step_key` varchar, not null — copied from template at init time; stable for code logic
- `step_name` varchar, not null — copied from template; can be overridden per transaction
- `category` varchar, not null — copied from template
- `responsible_role` varchar, not null — copied from template
- `sort_order` integer, not null
- `is_optional` boolean, not null, default `false`
- `status` varchar, not null, default `pending` — values: `pending`, `in_progress`, `awaiting_response`, `completed`, `waived`, `failed`
- `due_at` timestamptz, nullable — computed at init: `offer_accepted_at + default_duration_days`
- `started_at` timestamptz, nullable
- `completed_at` timestamptz, nullable
- `waived_at` timestamptz, nullable
- `notes` text, nullable
- `metadata_json` jsonb, nullable — **hidden**
- `created_at` timestamptz, not null
- `updated_at` timestamptz, not null

Indexes:

- Index on `transaction_id`
- Index on (`transaction_id`, `sort_order`)
- Index on `status`

Notes:

- Steps are instantiated by `InitWorkflowService` — loads the matching template (resolved by state + transaction_type + side), filters optional steps, computes `due_at` from `offer_accepted_at + default_duration_days`, saves instances, sets transaction `status=active`, and sends intro emails to all parties
- `step_key` is copied from the template at init time and is stable — business logic (including the AI pipeline) references steps by `step_key`, not by name, so template renames don't break logic
- Documents, tasks, and messages are scoped to a step via `workflow_step_id` — the primary axis for phase-level queries (e.g. "all open tasks and pending documents for the INSPECTION step")
- `awaiting_response` status means the TC has acted and is now waiting on an external party (e.g. waiting for seller agent to return the signed repair request)
- `template_step_id` is nullable — a step with null `template_step_id` was added ad-hoc to this specific transaction outside of any template
- Stage advancement is **not automated** — no code currently promotes `transaction.stage` when steps complete. That is pending. Steps can be in any status independently of the transaction's current stage
- **Parallel phases are not supported** — `transaction.stage` is a single value. All active steps belong to the current stage. This is a deliberate design decision

---

### 17. `transaction_form_templates`

Purpose: named packages of CAR forms scoped by state, transaction type, and side. Used to pre-select required forms when creating a transaction.

Columns:

- `id` UUID PK
- `organization_id` UUID FK → `real_estate_organizations.id`, nullable (CASCADE delete) — null = system template
- `name` varchar, not null
- `description` text, nullable
- `state_code` varchar, nullable — e.g. `CA`; null = national
- `transaction_type` varchar, not null — e.g. `residential`, `income_property`, `commercial`, `land`, `manufactured_home`, `new_construction`
- `side` varchar, not null — `buyer_side`, `seller_side`, `dual`, `listing`
- `is_system` boolean, not null, default `false`
- `is_active` boolean, not null, default `true`
- `created_by_account_id` UUID FK → `accounts.id`, nullable (SET NULL)
- `created_at` timestamptz, not null
- `updated_at` timestamptz, not null

Indexes:

- Index on `organization_id`
- Index on `state_code`
- Index on (`transaction_type`, `side`)

---

### 18. `transaction_form_template_items`

Purpose: individual CAR forms within a form template package.

Columns:

- `id` UUID PK
- `template_id` UUID FK → `transaction_form_templates.id`, not null (CASCADE delete)
- `form_code` varchar, not null — CAR form code, e.g. `RPA`, `TDS`, `CR-B`
- `form_name` varchar, not null — full display name
- `category` varchar, not null — groups forms in UI (see categories below)
- `is_required` boolean, not null, default `true`
- `sort_order` integer, not null, default `100`
- `notes` text, nullable — conditional requirement explanation (e.g. "Required if built before 1978")
- `created_at` timestamptz, not null
- `updated_at` timestamptz, not null

Indexes:

- Index on `template_id`
- Index on (`template_id`, `sort_order`)

`category` values: `purchase_agreement`, `counter_offer`, `listing_agreement`, `buyer_representation`, `disclosure`, `advisory`, `addendum`, `contingency_performance`, `inspection_repair`, `finance`, `federal_compliance`, `commercial`, `lease_rental`, `new_construction`

Current form library: **78 CAR forms** across 14 categories. 7 pre-built system packages: `ca_residential_buyer` (18), `ca_residential_seller` (18), `ca_residential_dual` (25), `ca_residential_listing` (15), `ca_residential_buyer_fha_va` (20), `ca_income_property_buyer` (16), `ca_land_buyer` (10).

---

### 19. `ai_interactions`

Purpose: append-only log of every LLM call made by the system. Used for cost tracking, debugging, and auditability. No update or delete.

Columns:

- `id` UUID PK
- `transaction_id` UUID FK → `real_estate_transactions.id`, nullable (SET NULL)
- `actor_account_id` UUID FK → `accounts.id`, nullable (SET NULL)
- `model_name` varchar, not null — e.g. `claude-sonnet-4-6`
- `feature` varchar, not null — e.g. `contract_extraction`, `draft_email`, `action_suggestions`
- `prompt_text` text, not null — **hidden**
- `response_text` text, nullable
- `prompt_tokens` integer, nullable
- `completion_tokens` integer, nullable
- `cost_usd` numeric(10,6), nullable
- `status` varchar, not null, default `success` — values: `success`, `failed`, `moderated`
- `error_message` text, nullable
- `tool_calls_json` jsonb, nullable — **hidden**
- `metadata_json` jsonb, nullable — **hidden**
- `created_at` timestamptz, not null

No `updated_at` — this table is append-only.

`feature` values (current and planned):
- `contract_extraction` — PDF field extraction from uploaded contract (active)
- `compliance_check` — RPA compliance validation (active)
- `email_interpretation` — extract action items and party references from inbound email body (pending)
- `transaction_summary` — summarise current state of a transaction for TC review (pending)
- `action_suggestions` — given current workflow step and journal context, suggest next steps (pending)
- `draft_email` — generate outbound email draft to a party (pending)

Indexes:

- Index on `transaction_id`
- Index on `actor_account_id`

Notes:

`metadata_json` structure varies by `feature` (JSONB — TypeORM deserialises to a native JS object on retrieval):

| `feature` | `metadata_json` written | `response_text` |
|---|---|---|
| `contract_extraction` | `{ extraction: ExtractionResult }` — parsed structured result | Raw LLM JSON string |
| `contract_extraction` (failure) | `{ error: "message" }` | Raw partial response or `null` |
| Other features | TBD — populated as each pipeline is implemented | Raw LLM output |

The `response_text` column always stores the raw string returned by the LLM (or `null` on hard failure) for debugging and replay purposes. `metadata_json` stores the parsed/structured result for application use — it is the source of truth for downstream processing.

Notes:

- `prompt_text` and `tool_calls_json` are `@HideField` — never returned to clients
- `transaction_id` is nullable — platform-level AI calls not tied to a specific transaction can also be logged
- Each `ai_interactions` row that produces a user-visible result should also write a corresponding `AI_SUMMARY` or `AI_ACTION` journal entry so the output appears in the transaction timeline
- The AI pipeline flow (pending): trigger (email received / document uploaded / TC request) → build context from `transaction` + `workflow_steps` + recent `journals` + `tasks` → call Claude → write `ai_interactions` row → parse response → write journal entries → optionally auto-create tasks from suggested next steps
- `transaction_documents.ai_interaction_id` → `ai_interactions.id` (one-directional FK on the document side — the interaction is not updated after creation, preserving append-only semantics)

---

## How the six tracking tables work together

Six tables collectively track every aspect of a transaction's progress. Each has a distinct role:

| Table | Role | Mutable? |
|---|---|---|
| `transaction_workflow_steps` | Structured phase checklist — what must be done and in what order | Yes |
| `transaction_tasks` | Granular assignable action items within a step | Yes |
| `transaction_events` | Key milestone dates with status (scheduled / missed / completed) | Yes |
| `transaction_journals` | Immutable audit trail — everything that happened | No (append-only) |
| `transaction_messages` | Inbound/outbound email and SMS communications | Yes |
| `ai_interactions` | LLM call log with cost tracking and response text | No (append-only) |

**How they connect via `workflow_step_id`:**

`transaction_tasks`, `transaction_documents`, and `transaction_messages` each carry a nullable `workflow_step_id` FK pointing to `transaction_workflow_steps`. This is the primary axis for phase-level queries — "show me everything for the INSPECTION step" joins all three tables on the same step id.

**Example: INSPECTION phase in progress**

```
transaction.stage = 'inspection'

workflow_steps:
  order_inspection       → completed
  review_report          → in_progress   ← active step
  submit_repair_request  → pending

tasks (scoped to review_report step):
  "Download inspection PDF"    → done    (alice_tc)
  "Run compliance check"       → done    (alice_tc)
  "Flag issues to buyer agent" → in_progress (alice_tc)
  "Prepare RR form"            → todo    depends_on above

events:
  inspection  → scheduled, eventDate=2026-05-10, status=completed
  contingency_deadline → scheduled, eventDate=2026-05-15

journals (append-only timeline):
  document_uploaded: "Inspection report received" (source=ui)
  ai_summary:        "3 items flagged for repair request" (source=ai)

ai_interactions:
  feature=action_suggestions → responseText="Next: draft RR for items 1-3, send by May 13"
```

**Journal write pattern:**

Every significant state change writes to both the operational table AND the journal:
- Email received → `transaction_messages` row + `email_received` journal entry (relatedEntityId → message id)
- Document uploaded → `transaction_documents` row + `document_uploaded` journal entry
- Task completed → `transaction_tasks` status update + `task_completed` journal entry
- Workflow initiated → `transaction_workflow_steps` rows created + `system_event` journal entry
- LLM produces output → `ai_interactions` row + `ai_summary` or `ai_action` journal entry

This gives both normalized operational data (queryable by status, assignee, due date) and an efficient timeline UI from a single indexed journal query.

**Stage advancement (pending):**

Currently stage is advanced manually. The planned automated logic: when all non-optional workflow steps for the current stage reach `completed` or `waived` status, promote `transaction.stage` to the next value in the sequence, create a `stage_change` journal entry, and trigger the AI pipeline to suggest next-stage tasks.

**Parallel phases: not supported by design.** `transaction.stage` is a single varchar. All active workflow steps belong to the current stage. This keeps the model simple and the UI unambiguous.

---

## Communication and AI integration

- Inbound emails arrive at `POST /webhooks/email/inbound`, routed by `txn-{uuid}@txn.mytcapp.net`
- `provider_message_id` and `provider_thread_id` on `transaction_messages` enable reliable deduplication and reply-chain resolution
- `thread_key` groups all communications in the same application-level conversation thread
- `metadata_json` on `transaction_messages` is where the LLM interpretation pipeline writes extracted action items, summaries, and party references (pending implementation)
- `ai_interactions` records every LLM call with token counts and cost for billing and debugging

---

## High-level ERD

```
users (1) ──────────── (1) accounts
                              │
                  ┌───────────┴────────────────┐
                  │                            │
organization_memberships          real_estate_transactions
                  │                            │
real_estate_organizations    ┌─────────────────┼─────────────────────────┐
        │                    │                 │                         │
        └────────────────────┘          transaction_parties         transaction_journals
                                               │                         (append-only)
                                    ┌──────────┴──────────┐
                                    │                     │
                                contacts           transaction_workflow_steps
                                                          │
                        ┌─────────────────────────────────┼──────────────────────┐
                        │                                 │                      │
               transaction_documents           transaction_tasks       transaction_messages
               transaction_events
               ai_interactions (append-only)

transaction_workflow_templates (1) ── (N) transaction_workflow_template_steps
                                                     │
                                          (instantiated into)
                                      transaction_workflow_steps

transaction_form_templates (1) ── (N) transaction_form_template_items
```

---

## Implementation order

Safe order respecting foreign-key dependencies:

1. `users`
2. `accounts`
3. `real_estate_organizations`
4. `organization_memberships`
5. `real_estate_transactions`
6. `contacts`
7. `transaction_parties`
8. `transaction_journals`
9. `transaction_tasks`
10. `transaction_document_submissions`
11. `transaction_documents`
12. `transaction_events`
13. `transaction_messages`
14. `ai_interactions`
15. `transaction_workflow_templates`
16. `transaction_workflow_template_steps`
17. `transaction_workflow_steps`
18. `transaction_form_templates`
19. `transaction_form_template_items`
20. `transaction_access_grants`

---

## Naming and technical conventions

- UUID primary keys across all tables
- `jsonb` for flexible metadata; core searchable workflow fields as typed columns
- `created_at` + `updated_at` on all mutable tables; append-only tables (`transaction_journals`, `ai_interactions`) have `created_at` only
- Enums stored as `varchar` in DB for forward-compatibility without migrations on enum expansion; validated at the application layer
- All sensitive fields annotated `@HideField()` in GraphQL — never returned to clients: `password_hash`, `verification_token`, `verification_token_expires_at`, `preferences_json`, `storage_key`, `body_html`, `prompt_text`, `tool_calls_json`, `summary_json`, `metadata_json` (on most tables)
- No `synchronize: true` in TypeORM config — all schema changes via timestamped migration files
- Soft-delete not used — append-only journaling provides the audit trail

---

### 20. `transaction_access_grants`

Purpose: explicit per-transaction access grants for accounts who are not org members — primarily independent contractor TCs working across multiple organizations. Also used for view-only access (e.g. a supervising broker reviewing a deal outside their org).

Columns:

- `id` UUID PK
- `transaction_id` UUID FK → `real_estate_transactions.id`, not null (CASCADE delete)
- `account_id` UUID FK → `accounts.id`, not null (CASCADE delete)
- `granted_by_account_id` UUID FK → `accounts.id`, nullable (SET NULL)
- `access_level` varchar, not null, default `collaborate`
- `granted_at` timestamptz, not null
- `expires_at` timestamptz, nullable — optional expiry; null = permanent until revoked
- `revoked_at` timestamptz, nullable — soft revoke; null = active
- `created_at` timestamptz, not null

`access_level` values:
- `read` — view-only; see transaction, parties, documents, messages
- `collaborate` — read + add tasks, upload documents, send messages (default for contractor TCs)
- `manage` — full access; same as an org member on this transaction

Indexes:

- Index on `transaction_id`
- Index on `account_id`
- Unique on (`transaction_id`, `account_id`)

Notes:

- A grant is active when `revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now())`
- This table is separate from `transaction_parties` — a contractor TC will typically appear in both (as a party with role `buyer_transaction_coordinator` AND as a grant recipient). The party row describes their real-estate role; the grant row controls their system access level.

---

## Access resolution

An account can access transaction T if ANY of the following is true:

1. **Org-wide** — `organization_memberships` where `organization_id = T.organization_id` AND `access_scope = 'all_transactions'`
2. **Party-based** — `transaction_parties` where `transaction_id = T.id` AND `account_id = account.id`
3. **Grant-based** — `transaction_access_grants` where `transaction_id = T.id` AND `account_id = account.id` AND `revoked_at IS NULL` AND (`expires_at IS NULL` OR `expires_at > now()`)

Modes are additive — qualifying under any one is sufficient.

| Mode | Typical who | Mechanism |
|---|---|---|
| Org-wide | Broker admin, manager, in-house TC | `organization_memberships.access_scope = all_transactions` |
| Party-based | Agent assigned to specific deals | `transaction_parties.account_id` |
| Grant-based | Independent contractor TC | `transaction_access_grants` |
| Hybrid | Broker reviewing deals outside their org | Any combination of the above |

---

## Potential future tables

- `notification_deliveries` — email/SMS/push delivery tracking per recipient
- `webhook_events` — raw inbound provider payloads before processing
- `tags` + `transaction_tags` — classification and search labels on transactions
- `audit_logs` — low-level security/compliance event log
- `transaction_attachments` — multiple file attachments per message or document record
