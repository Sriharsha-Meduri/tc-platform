import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWorkflowStepIdToTasksDocumentsMessages1745800004000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Optional FK scoping tasks, documents, and messages to a workflow step.
    // null = belongs to the transaction generally, not a specific step.

    await queryRunner.query(`
      ALTER TABLE "transaction_tasks"
        ADD COLUMN IF NOT EXISTS "workflowStepId" UUID
    `);
    await queryRunner.query(`
      ALTER TABLE "transaction_tasks"
        ADD CONSTRAINT "FK_task_workflow_step"
          FOREIGN KEY ("workflowStepId") REFERENCES "transaction_workflow_steps"("id") ON DELETE SET NULL
    `);
    await queryRunner.query(`CREATE INDEX "IDX_TASKS_WF_STEP" ON "transaction_tasks" ("workflowStepId")`);

    await queryRunner.query(`
      ALTER TABLE "transaction_documents"
        ADD COLUMN IF NOT EXISTS "workflowStepId" UUID
    `);
    await queryRunner.query(`
      ALTER TABLE "transaction_documents"
        ADD CONSTRAINT "FK_doc_workflow_step"
          FOREIGN KEY ("workflowStepId") REFERENCES "transaction_workflow_steps"("id") ON DELETE SET NULL
    `);
    await queryRunner.query(`CREATE INDEX "IDX_DOCS_WF_STEP" ON "transaction_documents" ("workflowStepId")`);

    await queryRunner.query(`
      ALTER TABLE "transaction_messages"
        ADD COLUMN IF NOT EXISTS "workflowStepId" UUID
    `);
    await queryRunner.query(`
      ALTER TABLE "transaction_messages"
        ADD CONSTRAINT "FK_message_workflow_step"
          FOREIGN KEY ("workflowStepId") REFERENCES "transaction_workflow_steps"("id") ON DELETE SET NULL
    `);
    await queryRunner.query(`CREATE INDEX "IDX_MESSAGES_WF_STEP" ON "transaction_messages" ("workflowStepId")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_MESSAGES_WF_STEP"`);
    await queryRunner.query(`ALTER TABLE "transaction_messages" DROP CONSTRAINT IF EXISTS "FK_message_workflow_step"`);
    await queryRunner.query(`ALTER TABLE "transaction_messages" DROP COLUMN IF EXISTS "workflowStepId"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_DOCS_WF_STEP"`);
    await queryRunner.query(`ALTER TABLE "transaction_documents" DROP CONSTRAINT IF EXISTS "FK_doc_workflow_step"`);
    await queryRunner.query(`ALTER TABLE "transaction_documents" DROP COLUMN IF EXISTS "workflowStepId"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_TASKS_WF_STEP"`);
    await queryRunner.query(`ALTER TABLE "transaction_tasks" DROP CONSTRAINT IF EXISTS "FK_task_workflow_step"`);
    await queryRunner.query(`ALTER TABLE "transaction_tasks" DROP COLUMN IF EXISTS "workflowStepId"`);
  }
}
