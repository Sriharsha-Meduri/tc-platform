import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTransactionEventRemindersTable1746100000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE transaction_event_reminders (
        id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        transaction_id        UUID NOT NULL
          REFERENCES real_estate_transactions(id) ON DELETE CASCADE,
        transaction_event_id  UUID NOT NULL
          REFERENCES transaction_events(id) ON DELETE CASCADE,
        bull_job_id           VARCHAR NOT NULL,
        days_before_deadline  INT NOT NULL,
        scheduled_fire_at     TIMESTAMPTZ NOT NULL,
        status                VARCHAR NOT NULL DEFAULT 'scheduled',
        cancelled_reason      TEXT NULL,
        sent_at               TIMESTAMPTZ NULL,
        cancelled_at          TIMESTAMPTZ NULL,
        created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await queryRunner.query(`
      CREATE INDEX idx_ter_transaction_id   ON transaction_event_reminders(transaction_id);
    `);
    await queryRunner.query(`
      CREATE INDEX idx_ter_event_id         ON transaction_event_reminders(transaction_event_id);
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX idx_ter_bull_job_id ON transaction_event_reminders(bull_job_id);
    `);
    await queryRunner.query(`
      CREATE INDEX idx_ter_status_fire ON transaction_event_reminders(status, scheduled_fire_at);
    `);

    await queryRunner.query(`
      COMMENT ON TABLE transaction_event_reminders IS
        'One row per scheduled reminder job. DB is the source of truth — Bull is just the
         delivery mechanism. The processor checks status before sending; cancelling a row
         prevents the email even if the Bull job already fired.';
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN transaction_event_reminders.bull_job_id IS
        'Matches the jobId set in Bull: reminder:{transactionEventId}:{N}d.
         Unique constraint prevents double-scheduling the same reminder.';
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN transaction_event_reminders.status IS
        'scheduled → sent (email delivered) | cancelled (user/system cancelled) | skipped (deadline passed at fire time)';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS transaction_event_reminders;`);
  }
}
