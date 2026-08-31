import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateOrganizationsTable1743724802000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "real_estate_organizations" (
        "id"            UUID        NOT NULL DEFAULT gen_random_uuid(),
        "name"          VARCHAR     NOT NULL,
        "type"          VARCHAR     NOT NULL,
        "licenseNumber" VARCHAR,
        "emailDomain"   VARCHAR,
        "phone"         VARCHAR,
        "status"        VARCHAR     NOT NULL DEFAULT 'active',
        "addressLine1"  VARCHAR,
        "addressLine2"  VARCHAR,
        "city"          VARCHAR,
        "state"         VARCHAR,
        "postalCode"    VARCHAR,
        "country"       VARCHAR,
        "metadataJson"  JSONB,
        "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_organizations" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_ORGS_TYPE"   ON "real_estate_organizations" ("type")`);
    await queryRunner.query(`CREATE INDEX "IDX_ORGS_STATUS" ON "real_estate_organizations" ("status")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "real_estate_organizations" CASCADE`);
  }
}
