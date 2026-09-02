# Seller-Side (Listing TC) Workflow: Implementation Status

This branch (`feat/seller-side-workflow`) implements the seller-side Listing TC
workflow described in the August brief. It builds on the existing platform
rather than replacing anything. Everything here is additive and gated so buyer-side
behavior is untouched.

All work was verified with `pnpm --filter @tc/api typecheck` (clean) and the full
API test suite (`1031` tests passing across `49` suites).

## What is done

### P0. Seller-side activation
- Flipped `TRANSACTION_FEATURES.sellerSideEnabled` to `true`
  (`packages/shared/src/constants/index.ts` and its compiled output).
- Exposed the coordinator side (`transactionSide`, BUYER or SELLER) on the create
  and update transaction inputs, and persisted it in `TransactionsService`
  (`create` and `update`), with the same lock the extraction path already used
  (a SELLER value is only honored while the flag is on).
- The web Seller Side selector now unlocks automatically from the same flag.
- Updated the flag tests to mock the flag explicitly (both the locked and
  unlocked paths stay covered).

### P2. Escrow opening email and seller-side information
- New `seller_side_information` table and entity (one row per transaction):
  preferred escrow company, preferred title company and contact, seller-agent
  commission, home warranty company, a "seller pays home warranty" flag, and NHD
  company. Migration `1805000000000-CreateSellerSideInformationTable.ts`.
- New `SellerSideInformationService` (upsert with diff, same pattern as the
  buyer-side service), registered in the contact-information module.
- New `EscrowOpeningEmailService`, cloned from the welcome-email service:
  idempotent, resolves the escrow company as the recipient (from
  `escrow_information`, falling back to the Escrow Officer party), CCs the seller
  agent, buyer agent, and seller TC, and logs to `transaction_messages` plus the
  audit log. Templates: `views/emails/escrow-opening.{html,text}.hbs`.
- Endpoints on the transactions controller:
  - `GET  /transactions/:id/seller-side-information`
  - `PATCH /transactions/:id/seller-side-information`
  - `POST /transactions/:id/escrow-opening-email` (activates the ESCROW stage on
    a successful send)

### P3. Seller disclosure packet lifecycle
- New `disclosure_packets` table and entity (one per transaction) with a status
  lifecycle: `sent_to_seller`, `seller_completed`, `tc_reviewed`, `sent_to_buyer`,
  plus per-transition timestamps. Migration
  `1807000000000-CreateDisclosurePacketsTable.ts`.
- New `DisclosurePacketService`: get-or-create, mark seller completed, mark
  reviewed (Listing TC), and forward to the buyer side. Forwarding emails the
  Buyer TC and Buyer Agent a summary of the completed disclosure forms and moves
  the packet to `sent_to_buyer`. Templates:
  `views/emails/disclosures-forwarded.{html,text}.hbs`.
- New `DisclosurePacketController`:
  - `GET  /transactions/:id/disclosure-packet`
  - `POST /transactions/:id/disclosure-packet/seller-completed`
  - `POST /transactions/:id/disclosure-packet/review`
  - `POST /transactions/:id/disclosure-packet/forward`
- Unit test coverage for the lifecycle transitions and the forward guards.

### P4. Notice to Perform (NTP) reminder
- New `notice_to_perform_reminders` table and entity, `NoticeToPerformReminderSchedulerService`,
  and a processor branch, cloned from the contingency-removal reminder. Migration
  `1806000000000-CreateNoticeToPerformRemindersTable.ts`. Templates:
  `views/emails/notice-to-perform-reminder.{html,text}.hbs`.
- Seller-side only: the scheduler no-ops for buyer-side and legacy transactions.
  Fires the configured number of days after a contingency deadline passes without
  the contingency being removed, and prompts the Listing TC (not the buyer side)
  to consider an NTP. Skips at fire time if the contingency was removed since
  scheduling. Wired into `EventSeederService` alongside the existing reminders.

## Default decisions on the open questions

The brief listed several forks. Since these needed to move forward, the following
defaults were chosen. Each is easy to change and is called out here so it can be
confirmed or corrected.

- Q1 (what counts as a signed disclosure): the packet exposes an explicit
  "seller completed" transition rather than auto-detecting from DocuSign or an
  uploaded scan. Auto-detection can be wired to the existing validation signal
  later.
- Q2 (how reviewed disclosures reach the buyer side): an emailed summary to the
  Buyer TC and Buyer Agent. Secure-link or DocuSign delivery is a later
  refinement; the forward action and audit trail are already in place.
- Q3 (how NTP fires): it prompts the Listing TC rather than auto-sending an NTP
  to the buyer. Default window is 2 days after the deadline (the C.A.R. RPA
  default). The per-contract extracted NTP day count is not yet plumbed through
  Final Terms; see "Remaining work".
- Q6 (where the escrow-email fields come from): the seller-side fields are
  TC-editable through the seller-side-information endpoint, with room to prefill
  from extraction later.

## How to run and verify

Bring up the database, then run the new migrations:

```bash
pnpm --filter @tc/api migration:run
```

(The three new migrations are `1805`, `1806`, `1807`.)

Then, on a seller-side transaction:
1. Save the seller-side info: `PATCH /transactions/:id/seller-side-information`.
2. Open escrow: `POST /transactions/:id/escrow-opening-email`.
3. Move the disclosure packet through review and forward it to the buyer side.

## Remaining work

- P1. Listing Agreement intake: an upload route for the RLA and consumption of
  the extracted commission. The extraction itself is the OCR team's; this waits
  on the agreed handoff shape (Q8) and on whether an RLA should open a
  transaction file (Q5).
- P5. C.A.R. form fill (temporary): generalize the CDA generator into a reusable
  filler over the existing blank templates and coordinate maps. Self-contained,
  but needs the priority form list (Q7) and visual verification of field
  placement.
- P6. ZipForm API integration: waits on Lone Wolf API access. The form catalog
  already stores a per-form provider template id, so a ZipForm id slots in
  alongside it.
- NTP day count: plumb `buyer/seller_notice_to_perform_days` through the Final
  Terms resolver so the per-contract value replaces the default.
- Web surfaces: composer and tracker UI for the escrow email, the disclosure
  packet, and the seller-side info form. The backend endpoints above are ready
  for them.
