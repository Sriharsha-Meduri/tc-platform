import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIsOriginalPackageToDocuments1783659718005 implements MigrationInterface {
  name = 'AddIsOriginalPackageToDocuments1783659718005';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE transaction_documents
        ADD COLUMN IF NOT EXISTS "isOriginalPackage" boolean NOT NULL DEFAULT false
    `);

    await queryRunner.query(`
      CREATE INDEX idx_transaction_documents_is_original
      ON transaction_documents ("isOriginalPackage")
      WHERE "isOriginalPackage" = true
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS idx_transaction_documents_is_original');
    await queryRunner.query(`
      ALTER TABLE transaction_documents
        DROP COLUMN IF EXISTS "isOriginalPackage"
    `);
  }
}
