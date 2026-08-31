import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDocuSignTemplateIdToFormTemplates1783659718006 implements MigrationInterface {
  name = 'AddDocuSignTemplateIdToFormTemplates1783659718006';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE transaction_form_templates
        ADD COLUMN "docusign_template_id" varchar NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE transaction_form_templates
        DROP COLUMN IF EXISTS "docusign_template_id"
    `);
  }
}
