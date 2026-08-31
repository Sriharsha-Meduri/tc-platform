import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTransactionWorkflowStepsTable1745800001000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Per-transaction workflow step instances.
    // Populated by copying from a template when "Init Workflow" fires.
    // templateStepId = null means a custom step added ad-hoc to this transaction.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "transaction_workflow_steps" (
        "id"               UUID        NOT NULL DEFAULT gen_random_uuid(),
        "transactionId"    UUID        NOT NULL,
        "templateStepId"   UUID,
        "stepKey"          VARCHAR     NOT NULL,
        "stepName"         VARCHAR     NOT NULL,
        "category"         VARCHAR     NOT NULL,
        "responsibleRole"  VARCHAR     NOT NULL,
        "sortOrder"        INTEGER     NOT NULL,
        "isOptional"       BOOLEAN     NOT NULL DEFAULT false,
        "status"           VARCHAR     NOT NULL DEFAULT 'pending',
        "dueAt"            TIMESTAMPTZ,
        "startedAt"        TIMESTAMPTZ,
        "completedAt"      TIMESTAMPTZ,
        "waivedAt"         TIMESTAMPTZ,
        "notes"            TEXT,
        "metadataJson"     JSONB,
        "createdAt"        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt"        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_workflow_steps" PRIMARY KEY ("id"),
        CONSTRAINT "FK_wf_step_transaction"
          FOREIGN KEY ("transactionId") REFERENCES "real_estate_transactions"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_wf_step_template_step"
          FOREIGN KEY ("templateStepId") REFERENCES "transaction_workflow_template_steps"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_WF_STEPS_TX"     ON "transaction_workflow_steps" ("transactionId")`);
    await queryRunner.query(`CREATE INDEX "IDX_WF_STEPS_STATUS" ON "transaction_workflow_steps" ("status")`);
    await queryRunner.query(`CREATE INDEX "IDX_WF_STEPS_ORDER"  ON "transaction_workflow_steps" ("transactionId", "sortOrder")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "transaction_workflow_steps" CASCADE`);
  }
}
