import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTransactionPartiesTable1743724806000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "transaction_parties" (
        "id"             UUID        NOT NULL DEFAULT gen_random_uuid(),
        "transactionId"  UUID        NOT NULL,
        "contactId"      UUID,
        "organizationId" UUID,
        "partyRole"      VARCHAR     NOT NULL,
        "displayName"    VARCHAR     NOT NULL,
        "email"          VARCHAR,
        "phone"          VARCHAR,
        "isPrimary"      BOOLEAN     NOT NULL DEFAULT false,
        "notes"          TEXT,
        "metadataJson"   JSONB,
        "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_parties" PRIMARY KEY ("id"),
        CONSTRAINT "FK_party_transaction"
          FOREIGN KEY ("transactionId") REFERENCES "real_estate_transactions"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_party_contact"
          FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_party_org"
          FOREIGN KEY ("organizationId") REFERENCES "real_estate_organizations"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_PARTIES_TX"   ON "transaction_parties" ("transactionId")`);
    await queryRunner.query(`CREATE INDEX "IDX_PARTIES_ROLE" ON "transaction_parties" ("partyRole")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "transaction_parties" CASCADE`);
  }
}
