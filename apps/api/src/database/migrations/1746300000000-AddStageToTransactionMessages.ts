import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `stage` varchar to `transaction_messages`.
 *
 * Records the transaction stage that was active when the message was
 * sent or received. Used by the swimlane UI to filter messages per tab.
 * Nullable for messages created before this migration.
 */
export class AddStageToTransactionMessages1746300000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE transaction_messages
      ADD COLUMN IF NOT EXISTS stage varchar;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_transaction_messages_stage
      ON transaction_messages ("transactionId", stage);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_transaction_messages_stage;`);
    await queryRunner.query(`ALTER TABLE transaction_messages DROP COLUMN IF EXISTS stage;`);
  }
}
