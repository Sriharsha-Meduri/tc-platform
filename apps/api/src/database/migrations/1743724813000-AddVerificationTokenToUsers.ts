import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddVerificationTokenToUsers1743724813000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
        ADD COLUMN IF NOT EXISTS "verificationToken"          VARCHAR,
        ADD COLUMN IF NOT EXISTS "verificationTokenExpiresAt" TIMESTAMPTZ,
        ALTER COLUMN "status" SET DEFAULT 'pending'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
        DROP COLUMN IF EXISTS "verificationToken",
        DROP COLUMN IF EXISTS "verificationTokenExpiresAt",
        ALTER COLUMN "status" SET DEFAULT 'active'
    `);
  }
}
