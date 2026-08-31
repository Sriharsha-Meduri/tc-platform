import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSellerSideReminderSettingsAndDocumentReminders1793000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE real_estate_transactions
        ADD COLUMN seller_side_reminder_lead_days INTEGER NULL;
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN real_estate_transactions.seller_side_reminder_lead_days IS
        'How many days before the Seller Side deadline (Seller Disclosures Due) to send a
         per-document reminder. NULL means "use the default" (3 days) — left NULL rather than
         defaulted at the DB level so "explicitly set to 3" and "using the default" stay
         distinguishable at the application layer.';
    `);

    await queryRunner.query(`
      CREATE TABLE seller_side_document_reminders (
        id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        transaction_id        UUID NOT NULL
          REFERENCES real_estate_transactions(id) ON DELETE CASCADE,
        upload_link_id        UUID NOT NULL
          REFERENCES upload_links(id) ON DELETE CASCADE,
        transaction_event_id  UUID NOT NULL
          REFERENCES transaction_events(id) ON DELETE CASCADE,
        form_code             VARCHAR NOT NULL,
        form_name             VARCHAR NOT NULL,
        deadline_at           TIMESTAMPTZ NOT NULL,
        bull_job_id           VARCHAR NOT NULL,
        status                VARCHAR NOT NULL DEFAULT 'scheduled',
        cancelled_reason      TEXT NULL,
        sent_at               TIMESTAMPTZ NULL,
        cancelled_at          TIMESTAMPTZ NULL,
        created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await queryRunner.query(`
      CREATE INDEX idx_ssdr_transaction_id ON seller_side_document_reminders(transaction_id);
    `);
    await queryRunner.query(`
      CREATE INDEX idx_ssdr_transaction_id_form_code ON seller_side_document_reminders(transaction_id, form_code);
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX idx_ssdr_bull_job_id ON seller_side_document_reminders(bull_job_id);
    `);

    await queryRunner.query(`
      COMMENT ON TABLE seller_side_document_reminders IS
        'One row per (transaction, required CAR form) scheduled/sent/cancelled reminder on the
         Seller Agent secure upload link, fired N days (seller_side_reminder_lead_days, default 3)
         before the Seller Disclosures Due date. All rows for a transaction share the same
         deadline_at (there is only one seller-side deadline), but each required document gets
         its own row/job so it can be independently satisfied and cancelled. Like
         verification_of_property_reminders, this reminder embeds a working secure upload link
         in the email body, minted fresh at fire time (raw tokens are never persisted).';
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN seller_side_document_reminders.bull_job_id IS
        'Matches the jobId set in Bull: seller-side-reminder:{transactionId}:{formCode}:{deadlineAt}.
         Unique constraint prevents double-scheduling the same document+deadline reminder.';
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN seller_side_document_reminders.status IS
        'scheduled -> sent (email delivered) | cancelled (document validated, or deadline/lead-time changed) | skipped (document validated at fire time)';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS seller_side_document_reminders;`);
    await queryRunner.query(`ALTER TABLE real_estate_transactions DROP COLUMN IF EXISTS seller_side_reminder_lead_days;`);
  }
}
