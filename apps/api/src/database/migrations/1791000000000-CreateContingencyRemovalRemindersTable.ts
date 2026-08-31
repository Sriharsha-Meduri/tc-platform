import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateContingencyRemovalRemindersTable1791000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE contingency_removal_reminders (
        id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        transaction_id        UUID NOT NULL
          REFERENCES real_estate_transactions(id) ON DELETE CASCADE,
        upload_link_id        UUID NOT NULL
          REFERENCES upload_links(id) ON DELETE CASCADE,
        transaction_event_id  UUID NOT NULL
          REFERENCES transaction_events(id) ON DELETE CASCADE,
        contingency_type      VARCHAR NOT NULL,
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
      CREATE INDEX idx_crr_transaction_id ON contingency_removal_reminders(transaction_id);
    `);
    await queryRunner.query(`
      CREATE INDEX idx_crr_transaction_contingency ON contingency_removal_reminders(transaction_id, contingency_type);
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX idx_crr_bull_job_id ON contingency_removal_reminders(bull_job_id);
    `);

    await queryRunner.query(`
      COMMENT ON TABLE contingency_removal_reminders IS
        'One row per scheduled/sent/cancelled "1 day before deadline" reminder for a single
         contingency-removal checklist item (inspection/loan/appraisal) on the Buyer Agent
         secure upload link. Distinct from transaction_event_reminders — this replies in the
         upload-link email thread and supports cancel+reschedule when the negotiated deadline
         changes, which the generic reminder path does not.';
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN contingency_removal_reminders.bull_job_id IS
        'Matches the jobId set in Bull: contingency-reminder:{transactionEventId}.
         Unique constraint prevents double-scheduling the same reminder.';
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN contingency_removal_reminders.status IS
        'scheduled -> sent (email delivered) | cancelled (waived or deadline changed) | skipped (contingency already satisfied at fire time)';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS contingency_removal_reminders;`);
  }
}
