import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStageToFormTemplateItems1746600000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE transaction_form_template_items
      ADD COLUMN IF NOT EXISTS stage varchar;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_form_template_items_stage
      ON transaction_form_template_items ("templateId", stage);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_form_template_items_stage;`);
    await queryRunner.query(`ALTER TABLE transaction_form_template_items DROP COLUMN IF EXISTS stage;`);
  }
}
