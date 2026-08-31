import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProfileFieldsToAccounts1743724814000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "accounts"
        ADD COLUMN IF NOT EXISTS "organizationName" VARCHAR,
        ADD COLUMN IF NOT EXISTS "officePhone"       VARCHAR,
        ADD COLUMN IF NOT EXISTS "cellPhone"         VARCHAR,
        ADD COLUMN IF NOT EXISTS "addressLine1"      VARCHAR,
        ADD COLUMN IF NOT EXISTS "addressLine2"      VARCHAR,
        ADD COLUMN IF NOT EXISTS "city"              VARCHAR,
        ADD COLUMN IF NOT EXISTS "state"             VARCHAR,
        ADD COLUMN IF NOT EXISTS "zipCode"           VARCHAR,
        ADD COLUMN IF NOT EXISTS "country"           VARCHAR
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "accounts"
        DROP COLUMN IF EXISTS "organizationName",
        DROP COLUMN IF EXISTS "officePhone",
        DROP COLUMN IF EXISTS "cellPhone",
        DROP COLUMN IF EXISTS "addressLine1",
        DROP COLUMN IF EXISTS "addressLine2",
        DROP COLUMN IF EXISTS "city",
        DROP COLUMN IF EXISTS "state",
        DROP COLUMN IF EXISTS "zipCode",
        DROP COLUMN IF EXISTS "country"
    `);
  }
}
