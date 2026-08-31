import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAccountsTable1743724801000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "accounts" (
        "id"              UUID        NOT NULL DEFAULT gen_random_uuid(),
        "userId"          UUID        NOT NULL,
        "displayName"     VARCHAR     NOT NULL,
        "firstName"       VARCHAR,
        "lastName"        VARCHAR,
        "avatarUrl"       TEXT,
        "timezone"        VARCHAR,
        "locale"          VARCHAR,
        "preferencesJson" JSONB,
        "status"          VARCHAR     NOT NULL DEFAULT 'active',
        "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_accounts"         PRIMARY KEY ("id"),
        CONSTRAINT "UQ_accounts_userId"  UNIQUE ("userId"),
        CONSTRAINT "FK_accounts_user"
          FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_ACCOUNTS_STATUS" ON "accounts" ("status")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "accounts" CASCADE`);
  }
}
