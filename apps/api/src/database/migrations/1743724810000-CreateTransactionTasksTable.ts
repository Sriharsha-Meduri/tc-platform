import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTransactionTasksTable1743724810000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "transaction_tasks" (
        "id"                  UUID        NOT NULL DEFAULT gen_random_uuid(),
        "transactionId"       UUID        NOT NULL,
        "templateKey"         VARCHAR,
        "title"               VARCHAR     NOT NULL,
        "description"         TEXT,
        "status"              VARCHAR     NOT NULL DEFAULT 'todo',
        "priority"            VARCHAR     NOT NULL DEFAULT 'normal',
        "assignedAccountId"   UUID,
        "dependsOnTaskId"     UUID,
        "dueAt"               TIMESTAMPTZ,
        "completedAt"         TIMESTAMPTZ,
        "createdByAccountId"  UUID,
        "metadataJson"        JSONB,
        "createdAt"           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt"           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_tasks" PRIMARY KEY ("id"),
        CONSTRAINT "FK_task_transaction"
          FOREIGN KEY ("transactionId") REFERENCES "real_estate_transactions"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_task_assigned"
          FOREIGN KEY ("assignedAccountId") REFERENCES "accounts"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_task_depends_on"
          FOREIGN KEY ("dependsOnTaskId") REFERENCES "transaction_tasks"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_task_created_by"
          FOREIGN KEY ("createdByAccountId") REFERENCES "accounts"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_TASKS_TX"       ON "transaction_tasks" ("transactionId")`);
    await queryRunner.query(`CREATE INDEX "IDX_TASKS_ASSIGNED" ON "transaction_tasks" ("assignedAccountId")`);
    await queryRunner.query(`CREATE INDEX "IDX_TASKS_STATUS"   ON "transaction_tasks" ("status")`);
    await queryRunner.query(`CREATE INDEX "IDX_TASKS_DUE_AT"   ON "transaction_tasks" ("dueAt")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "transaction_tasks" CASCADE`);
  }
}
