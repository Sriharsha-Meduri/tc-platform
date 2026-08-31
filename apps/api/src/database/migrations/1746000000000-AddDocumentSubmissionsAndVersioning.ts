import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDocumentSubmissionsAndVersioning1746000000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Create transaction_document_submissions table
    await queryRunner.query(`
      CREATE TABLE "transaction_document_submissions" (
        "id"                    UUID          NOT NULL DEFAULT gen_random_uuid(),
        "transaction_id"        UUID          NOT NULL,
        "submission_no"         INTEGER       NOT NULL,
        "status"                VARCHAR       NOT NULL DEFAULT 'pending',
        "submitted_by_party_id" UUID,
        "notes"                 TEXT,
        "created_at"            TIMESTAMPTZ   NOT NULL DEFAULT now(),
        "updated_at"            TIMESTAMPTZ   NOT NULL DEFAULT now(),
        CONSTRAINT "PK_transaction_document_submissions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_tds_transaction"
          FOREIGN KEY ("transaction_id")
          REFERENCES "real_estate_transactions"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_tds_submitted_by_party"
          FOREIGN KEY ("submitted_by_party_id")
          REFERENCES "transaction_parties"("id") ON DELETE SET NULL,
        CONSTRAINT "UQ_tds_transaction_submission_no"
          UNIQUE ("transaction_id", "submission_no")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_tds_transaction_id" ON "transaction_document_submissions" ("transaction_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_tds_status" ON "transaction_document_submissions" ("status")
    `);

    // 2. Add submission_id FK to transaction_documents
    await queryRunner.query(`
      ALTER TABLE "transaction_documents"
        ADD COLUMN "submission_id" UUID,
        ADD COLUMN "previous_version_id" UUID
    `);

    await queryRunner.query(`
      ALTER TABLE "transaction_documents"
        ADD CONSTRAINT "FK_td_submission"
          FOREIGN KEY ("submission_id")
          REFERENCES "transaction_document_submissions"("id") ON DELETE SET NULL,
        ADD CONSTRAINT "FK_td_previous_version"
          FOREIGN KEY ("previous_version_id")
          REFERENCES "transaction_documents"("id") ON DELETE SET NULL
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_td_submission_id" ON "transaction_documents" ("submission_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_td_previous_version_id" ON "transaction_documents" ("previous_version_id")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_td_previous_version_id"`);
    await queryRunner.query(`DROP INDEX "IDX_td_submission_id"`);
    await queryRunner.query(`
      ALTER TABLE "transaction_documents"
        DROP CONSTRAINT "FK_td_previous_version",
        DROP CONSTRAINT "FK_td_submission",
        DROP COLUMN "previous_version_id",
        DROP COLUMN "submission_id"
    `);
    await queryRunner.query(`DROP INDEX "IDX_tds_status"`);
    await queryRunner.query(`DROP INDEX "IDX_tds_transaction_id"`);
    await queryRunner.query(`DROP TABLE "transaction_document_submissions"`);
  }
}
