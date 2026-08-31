import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDocuSignTemplateIdToFormTemplateItems1783659718007 implements MigrationInterface {
  name = 'AddDocuSignTemplateIdToFormTemplateItems1783659718007';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE transaction_form_template_items
        ADD COLUMN "docusign_template_id" varchar NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE transaction_form_template_items
        DROP COLUMN IF EXISTS "docusign_template_id"
    `);
  }
}
