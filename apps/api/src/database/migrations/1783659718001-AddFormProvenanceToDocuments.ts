import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFormProvenanceToDocuments1783659718001 implements MigrationInterface {
  name = 'AddFormProvenanceToDocuments1783659718001';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE transaction_documents
        ADD COLUMN "sourceDocumentId" varchar,
        ADD COLUMN "sourcePageStart" integer,
        ADD COLUMN "sourcePageEnd" integer,
        ADD COLUMN "formCode" varchar
    `);

    // Index on sourceDocumentId for reverse lookups (find all derived form docs from a source)
    await queryRunner.query(`
      CREATE INDEX idx_transaction_documents_source_document
      ON transaction_documents ("sourceDocumentId")
      WHERE "sourceDocumentId" IS NOT NULL
    `);

    // Index on formCode for filtering by detected form type
    await queryRunner.query(`
      CREATE INDEX idx_transaction_documents_form_code
      ON transaction_documents ("formCode")
      WHERE "formCode" IS NOT NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS idx_transaction_documents_form_code');
    await queryRunner.query('DROP INDEX IF EXISTS idx_transaction_documents_source_document');
    await queryRunner.query(`
      ALTER TABLE transaction_documents
        DROP COLUMN IF EXISTS "sourceDocumentId",
        DROP COLUMN IF EXISTS "sourcePageStart",
        DROP COLUMN IF EXISTS "sourcePageEnd",
        DROP COLUMN IF EXISTS "formCode"
    `);
  }
}
