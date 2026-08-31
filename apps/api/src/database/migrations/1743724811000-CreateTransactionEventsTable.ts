import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTransactionEventsTable1743724811000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "transaction_events" (
        "id"                  UUID        NOT NULL DEFAULT gen_random_uuid(),
        "transactionId"       UUID        NOT NULL,
        "eventType"           VARCHAR     NOT NULL,
        "eventDate"           TIMESTAMPTZ NOT NULL,
        "status"              VARCHAR     NOT NULL DEFAULT 'scheduled',
        "notes"               TEXT,
        "createdByAccountId"  UUID,
        "metadataJson"        JSONB,
        "createdAt"           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt"           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_events" PRIMARY KEY ("id"),
        CONSTRAINT "FK_event_transaction"
          FOREIGN KEY ("transactionId") REFERENCES "real_estate_transactions"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_event_created_by"
          FOREIGN KEY ("createdByAccountId") REFERENCES "accounts"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_EVENTS_TX"         ON "transaction_events" ("transactionId")`);
    await queryRunner.query(`CREATE INDEX "IDX_EVENTS_EVENT_DATE" ON "transaction_events" ("eventDate")`);
    await queryRunner.query(`CREATE INDEX "IDX_EVENTS_TYPE"       ON "transaction_events" ("eventType")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "transaction_events" CASCADE`);
  }
}
