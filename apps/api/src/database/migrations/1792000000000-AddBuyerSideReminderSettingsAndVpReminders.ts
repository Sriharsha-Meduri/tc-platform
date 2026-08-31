import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBuyerSideReminderSettingsAndVpReminders1792000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE real_estate_transactions
        ADD COLUMN buyer_side_reminder_lead_days INTEGER NULL;
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN real_estate_transactions.buyer_side_reminder_lead_days IS
        'How many days before a Buyer Side deadline (currently: Verification of Property, tied to
         Close of Escrow) to send a reminder. NULL means "use the default" (3 days) — left NULL
         rather than defaulted at the DB level so "explicitly set to 3" and "using the default"
         stay distinguishable at the application layer.';
    `);

    await queryRunner.query(`
      CREATE TABLE verification_of_property_reminders (
        id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        transaction_id        UUID NOT NULL
          REFERENCES real_estate_transactions(id) ON DELETE CASCADE,
        upload_link_id        UUID NOT NULL
          REFERENCES upload_links(id) ON DELETE CASCADE,
        transaction_event_id  UUID NOT NULL
          REFERENCES transaction_events(id) ON DELETE CASCADE,
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
      CREATE INDEX idx_vpr_transaction_id ON verification_of_property_reminders(transaction_id);
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX idx_vpr_bull_job_id ON verification_of_property_reminders(bull_job_id);
    `);

    await queryRunner.query(`
      COMMENT ON TABLE verification_of_property_reminders IS
        'One row per scheduled/sent/cancelled reminder for the Verification of Property checklist
         item on the Buyer Agent secure upload link, fired N days (buyer_side_reminder_lead_days,
         default 3) before Close of Escrow. Unlike contingency_removal_reminders, this reminder
         embeds a working secure upload link in the email body, minted fresh at fire time.';
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN verification_of_property_reminders.bull_job_id IS
        'Matches the jobId set in Bull: vp-reminder:{transactionId}:{deadlineAt}.
         Unique constraint prevents double-scheduling the same reminder.';
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN verification_of_property_reminders.status IS
        'scheduled -> sent (email delivered) | cancelled (VP validated, or deadline/lead-time changed) | skipped (VP validated at fire time)';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS verification_of_property_reminders;`);
    await queryRunner.query(`ALTER TABLE real_estate_transactions DROP COLUMN IF EXISTS buyer_side_reminder_lead_days;`);
  }
}
