import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEffectiveRetiredDatesToFormTemplates1779947878847 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      ALTER TABLE transaction_form_templates
        ADD COLUMN IF NOT EXISTS effective_date date NULL,
        ADD COLUMN IF NOT EXISTS retired_date date NULL
    `);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`ALTER TABLE transaction_form_templates DROP COLUMN IF EXISTS retired_date`);
    await runner.query(`ALTER TABLE transaction_form_templates DROP COLUMN IF EXISTS effective_date`);
  }
}
