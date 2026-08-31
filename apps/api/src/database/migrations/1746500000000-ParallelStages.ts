import { MigrationInterface, QueryRunner } from 'typeorm';

export class ParallelStages1746500000000 implements MigrationInterface {
  name = 'ParallelStages1746500000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Create transaction_stage_instances table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "transaction_stage_instances" (
        "id"                    uuid NOT NULL DEFAULT gen_random_uuid(),
        "transactionId"         uuid NOT NULL,
        "stage"                 varchar NOT NULL,
        "status"                varchar NOT NULL DEFAULT 'pending',
        "startedAt"             TIMESTAMPTZ,
        "completedAt"           TIMESTAMPTZ,
        "waivedAt"              TIMESTAMPTZ,
        "createdByAccountId"    uuid,
        "notes"                 text,
        "createdAt"             TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt"             TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_transaction_stage_instances" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_transaction_stage_instances_tx_stage" UNIQUE ("transactionId", "stage"),
        CONSTRAINT "FK_transaction_stage_instances_transaction"
          FOREIGN KEY ("transactionId")
          REFERENCES "real_estate_transactions"("id")
          ON DELETE CASCADE,
        CONSTRAINT "FK_transaction_stage_instances_account"
          FOREIGN KEY ("createdByAccountId")
          REFERENCES "accounts"("id")
          ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_stage_instances_transactionId" ON "transaction_stage_instances" ("transactionId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_stage_instances_status" ON "transaction_stage_instances" ("status")`);

    // 2. Migrate existing data: create one active instance per transaction using current stage value
    // Wrapped in a DO block in case the stage column was already dropped (e.g. re-running migration)
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'real_estate_transactions' AND column_name = 'stage'
        ) THEN
          INSERT INTO "transaction_stage_instances"
            ("transactionId", "stage", "status", "startedAt", "createdAt", "updatedAt")
          SELECT "id", "stage", 'active', now(), now(), now()
          FROM "real_estate_transactions"
          WHERE "stage" IS NOT NULL;
        END IF;
      END $$
    `);

    // 3. Drop stage column and its index from real_estate_transactions (if still present)
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_real_estate_transactions_stage"`);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'real_estate_transactions' AND column_name = 'stage'
        ) THEN
          ALTER TABLE "real_estate_transactions" DROP COLUMN "stage";
        END IF;
      END $$
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Restore stage column with a best-guess value from stage instances
    await queryRunner.query(`ALTER TABLE "real_estate_transactions" ADD COLUMN "stage" varchar NOT NULL DEFAULT 'intake'`);
    await queryRunner.query(`CREATE INDEX "IDX_real_estate_transactions_stage" ON "real_estate_transactions" ("stage")`);

    // Backfill: use the most recently started active instance per transaction
    await queryRunner.query(`
      UPDATE "real_estate_transactions" t
      SET "stage" = si.stage
      FROM (
        SELECT DISTINCT ON ("transactionId")
          "transactionId", stage
        FROM transaction_stage_instances
        WHERE status = 'active'
        ORDER BY "transactionId", "startedAt" DESC
      ) si
      WHERE t.id = si."transactionId"
    `);

    // Drop the stage instances table
    await queryRunner.query(`DROP TABLE "transaction_stage_instances"`);
  }
}
