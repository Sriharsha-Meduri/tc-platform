import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTransactionClockSettings1746400000000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      CREATE TABLE transaction_clock_settings (
        id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "transactionId"         UUID NOT NULL UNIQUE
          REFERENCES real_estate_transactions(id) ON DELETE CASCADE,
        timezone                VARCHAR NOT NULL DEFAULT 'America/Los_Angeles',
        "virtualClockOffsetMs"  BIGINT,
        created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    await runner.query(`
      CREATE INDEX idx_tcs_transaction_id ON transaction_clock_settings ("transactionId")
    `);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`DROP TABLE IF EXISTS transaction_clock_settings`);
  }
}
