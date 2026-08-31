import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStageToTransactionDocuments1747000000000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      ALTER TABLE transaction_documents
        ADD COLUMN IF NOT EXISTS stage VARCHAR NULL
    `);

    await runner.query(`
      CREATE INDEX IF NOT EXISTS idx_transaction_documents_transaction_stage
        ON transaction_documents ("transactionId", stage)
        WHERE stage IS NOT NULL
    `);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`DROP INDEX IF EXISTS idx_transaction_documents_transaction_stage`);
    await runner.query(`ALTER TABLE transaction_documents DROP COLUMN IF EXISTS stage`);
  }
}
