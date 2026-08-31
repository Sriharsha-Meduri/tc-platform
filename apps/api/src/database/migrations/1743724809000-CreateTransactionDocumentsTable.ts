import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTransactionDocumentsTable1743724809000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "transaction_documents" (
        "id"                    UUID        NOT NULL DEFAULT gen_random_uuid(),
        "transactionId"         UUID        NOT NULL,
        "documentType"          VARCHAR     NOT NULL,
        "title"                 VARCHAR     NOT NULL,
        "fileName"              VARCHAR,
        "mimeType"              VARCHAR,
        "storageKey"            VARCHAR,
        "storageUrl"            TEXT,
        "versionNo"             INTEGER     NOT NULL DEFAULT 1,
        "status"                VARCHAR     NOT NULL,
        "requestedFromPartyId"  UUID,
        "uploadedByAccountId"   UUID,
        "signedAt"              TIMESTAMPTZ,
        "approvedAt"            TIMESTAMPTZ,
        "dueAt"                 TIMESTAMPTZ,
        "metadataJson"          JSONB,
        "createdAt"             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt"             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_documents" PRIMARY KEY ("id"),
        CONSTRAINT "FK_doc_transaction"
          FOREIGN KEY ("transactionId") REFERENCES "real_estate_transactions"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_doc_requested_from"
          FOREIGN KEY ("requestedFromPartyId") REFERENCES "transaction_parties"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_doc_uploaded_by"
          FOREIGN KEY ("uploadedByAccountId") REFERENCES "accounts"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_DOCS_TX"     ON "transaction_documents" ("transactionId")`);
    await queryRunner.query(`CREATE INDEX "IDX_DOCS_STATUS" ON "transaction_documents" ("status")`);
    await queryRunner.query(`CREATE INDEX "IDX_DOCS_DUE_AT" ON "transaction_documents" ("dueAt")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "transaction_documents" CASCADE`);
  }
}
