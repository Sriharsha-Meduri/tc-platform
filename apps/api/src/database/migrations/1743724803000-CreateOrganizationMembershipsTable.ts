import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateOrganizationMembershipsTable1743724803000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "organization_memberships" (
        "id"             UUID        NOT NULL DEFAULT gen_random_uuid(),
        "organizationId" UUID        NOT NULL,
        "accountId"      UUID        NOT NULL,
        "role"           VARCHAR     NOT NULL,
        "isPrimary"      BOOLEAN     NOT NULL DEFAULT false,
        "permissionsJson" JSONB,
        "joinedAt"       TIMESTAMPTZ,
        "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_org_memberships" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_org_member" UNIQUE ("organizationId", "accountId"),
        CONSTRAINT "FK_membership_org"
          FOREIGN KEY ("organizationId") REFERENCES "real_estate_organizations"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_membership_account"
          FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_MEMBERSHIPS_ACCOUNT" ON "organization_memberships" ("accountId")`);
    await queryRunner.query(`CREATE INDEX "IDX_MEMBERSHIPS_ROLE"    ON "organization_memberships" ("role")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "organization_memberships" CASCADE`);
  }
}
