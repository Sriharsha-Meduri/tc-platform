import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAiInteractionsTable1743724812000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "ai_interactions" (
        "id"               UUID           NOT NULL DEFAULT gen_random_uuid(),
        "transactionId"    UUID,
        "actorAccountId"   UUID,
        "modelName"        VARCHAR        NOT NULL,
        "feature"          VARCHAR        NOT NULL,
        "promptText"       TEXT           NOT NULL,
        "responseText"     TEXT,
        "promptTokens"     INTEGER,
        "completionTokens" INTEGER,
        "costUsd"          NUMERIC(10,6),
        "status"           VARCHAR        NOT NULL DEFAULT 'success',
        "errorMessage"     TEXT,
        "toolCallsJson"    JSONB,
        "metadataJson"     JSONB,
        "createdAt"        TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_ai_interactions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_ai_transaction"
          FOREIGN KEY ("transactionId") REFERENCES "real_estate_transactions"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_ai_actor"
          FOREIGN KEY ("actorAccountId") REFERENCES "accounts"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_AI_TX"      ON "ai_interactions" ("transactionId")`);
    await queryRunner.query(`CREATE INDEX "IDX_AI_ACCOUNT" ON "ai_interactions" ("actorAccountId")`);
    await queryRunner.query(`CREATE INDEX "IDX_AI_FEATURE" ON "ai_interactions" ("feature")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "ai_interactions" CASCADE`);
  }
}
