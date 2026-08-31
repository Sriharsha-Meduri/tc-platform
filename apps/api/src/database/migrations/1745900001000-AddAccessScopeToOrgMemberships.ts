import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAccessScopeToOrgMemberships1745900001000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE organization_memberships
        ADD COLUMN access_scope varchar NOT NULL DEFAULT 'assigned_only'
    `);

    // Broker admins and managers get org-wide access by default
    await queryRunner.query(`
      UPDATE organization_memberships
        SET access_scope = 'all_transactions'
        WHERE role = 'broker_admin'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE organization_memberships DROP COLUMN access_scope
    `);
  }
}
