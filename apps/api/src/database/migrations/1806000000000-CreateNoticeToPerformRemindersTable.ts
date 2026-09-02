import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateNoticeToPerformRemindersTable1806000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE notice_to_perform_reminders (
        id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        transaction_id        UUID NOT NULL
          REFERENCES real_estate_transactions(id) ON DELETE CASCADE,
        transaction_event_id  UUID NOT NULL
          REFERENCES transaction_events(id) ON DELETE CASCADE,
        contingency_type      VARCHAR NOT NULL,
        deadline_at           TIMESTAMPTZ NOT NULL,
        fire_at               TIMESTAMPTZ NOT NULL,
        recipient_email       VARCHAR NOT NULL,
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
      CREATE INDEX idx_ntp_transaction_id ON notice_to_perform_reminders(transaction_id);
    `);
    await queryRunner.query(`
      CREATE INDEX idx_ntp_transaction_contingency ON notice_to_perform_reminders(transaction_id, contingency_type);
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX idx_ntp_bull_job_id ON notice_to_perform_reminders(bull_job_id);
    `);

    await queryRunner.query(`
      COMMENT ON TABLE notice_to_perform_reminders IS
        'One row per scheduled/sent/cancelled Notice to Perform (NTP) prompt to the Listing TC, fired after a contingency deadline passes without removal. Seller-side only.';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS notice_to_perform_reminders;`);
  }
}
