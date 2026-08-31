import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTransactionJournalsTable1743724807000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "transaction_journals" (
        "id"                UUID        NOT NULL DEFAULT gen_random_uuid(),
        "transactionId"     UUID        NOT NULL,
        "journalType"       VARCHAR     NOT NULL,
        "eventAt"           TIMESTAMPTZ NOT NULL,
        "actorAccountId"    UUID,
        "source"            VARCHAR     NOT NULL,
        "title"             VARCHAR     NOT NULL,
        "body"              TEXT,
        "relatedEntityType" VARCHAR,
        "relatedEntityId"   UUID,
        "metadataJson"      JSONB,
        "createdAt"         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_journals" PRIMARY KEY ("id"),
        CONSTRAINT "FK_journal_transaction"
          FOREIGN KEY ("transactionId") REFERENCES "real_estate_transactions"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_journal_actor"
          FOREIGN KEY ("actorAccountId") REFERENCES "accounts"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_JOURNALS_TX_DATE" ON "transaction_journals" ("transactionId", "eventAt" DESC)`);
    await queryRunner.query(`CREATE INDEX "IDX_JOURNALS_TYPE"    ON "transaction_journals" ("journalType")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "transaction_journals" CASCADE`);
  }
}
