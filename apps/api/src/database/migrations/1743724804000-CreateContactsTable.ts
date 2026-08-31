import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateContactsTable1743724804000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "contacts" (
        "id"            UUID        NOT NULL DEFAULT gen_random_uuid(),
        "contactType"   VARCHAR     NOT NULL,
        "firstName"     VARCHAR,
        "lastName"      VARCHAR,
        "companyName"   VARCHAR,
        "email"         VARCHAR,
        "phone"         VARCHAR,
        "secondaryPhone" VARCHAR,
        "addressLine1"  VARCHAR,
        "addressLine2"  VARCHAR,
        "city"          VARCHAR,
        "state"         VARCHAR,
        "postalCode"    VARCHAR,
        "notes"         TEXT,
        "metadataJson"  JSONB,
        "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_contacts" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_CONTACTS_TYPE"  ON "contacts" ("contactType")`);
    await queryRunner.query(`CREATE INDEX "IDX_CONTACTS_EMAIL" ON "contacts" ("email")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "contacts" CASCADE`);
  }
}
