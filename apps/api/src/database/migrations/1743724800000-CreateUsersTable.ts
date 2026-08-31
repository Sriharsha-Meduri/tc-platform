import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUsersTable1743724800000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "users" (
        "id"                UUID         NOT NULL DEFAULT gen_random_uuid(),
        "email"             VARCHAR      NOT NULL,
        "phone"             VARCHAR,
        "passwordHash"      VARCHAR      NOT NULL,
        "status"            VARCHAR      NOT NULL DEFAULT 'active',
        "emailVerifiedAt"   TIMESTAMPTZ,
        "lastLoginAt"       TIMESTAMPTZ,
        "createdAt"         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        "updatedAt"         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_users" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_USERS_EMAIL"  ON "users" ("email")`);
    await queryRunner.query(`CREATE INDEX         "IDX_USERS_STATUS" ON "users" ("status")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "users" CASCADE`);
  }
}
