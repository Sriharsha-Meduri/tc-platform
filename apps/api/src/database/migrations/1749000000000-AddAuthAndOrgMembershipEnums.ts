import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAuthAndOrgMembershipEnums1749000000000 implements MigrationInterface {
  public async up(runner: QueryRunner): Promise<void> {
    // ── 1. Add role column to users ──────────────────────────────────────────
    await runner.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS role varchar NOT NULL DEFAULT 'user'
    `);

    // ── 2. Add status column to organization_memberships ─────────────────────
    await runner.query(`
      ALTER TABLE organization_memberships
        ADD COLUMN IF NOT EXISTS status varchar NOT NULL DEFAULT 'active'
    `);

    // ── 3. Create audit_logs table (append-only) ─────────────────────────────
    await runner.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id              uuid NOT NULL DEFAULT uuid_generate_v4(),
        "accountId"     uuid,
        action          varchar NOT NULL,
        "targetType"    varchar,
        "targetId"      uuid,
        "targetDisplayName" varchar,
        description     varchar NOT NULL,
        "detailsJson"   jsonb,
        "createdAt"     timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_audit_logs" PRIMARY KEY (id)
      )
    `);

    await runner.query(`
      CREATE INDEX IF NOT EXISTS idx_audit_logs_account_created
        ON audit_logs ("accountId", "createdAt")
    `);

    await runner.query(`
      CREATE INDEX IF NOT EXISTS idx_audit_logs_action_created
        ON audit_logs (action, "createdAt")
    `);

    await runner.query(`
      CREATE INDEX IF NOT EXISTS idx_audit_logs_target
        ON audit_logs ("targetType", "targetId")
    `);

    await runner.query(`
      ALTER TABLE audit_logs
        ADD CONSTRAINT fk_audit_logs_account
        FOREIGN KEY ("accountId") REFERENCES accounts(id)
        ON DELETE SET NULL
    `);
  }

  public async down(runner: QueryRunner): Promise<void> {
    await runner.query(`ALTER TABLE audit_logs DROP CONSTRAINT fk_audit_logs_account`);
    await runner.query(`DROP INDEX IF EXISTS idx_audit_logs_target`);
    await runner.query(`DROP INDEX IF EXISTS idx_audit_logs_action_created`);
    await runner.query(`DROP INDEX IF EXISTS idx_audit_logs_account_created`);
    await runner.query(`DROP TABLE IF EXISTS audit_logs`);
    await runner.query(`ALTER TABLE organization_memberships DROP COLUMN IF EXISTS status`);
    await runner.query(`ALTER TABLE users DROP COLUMN IF EXISTS role`);
  }
}
