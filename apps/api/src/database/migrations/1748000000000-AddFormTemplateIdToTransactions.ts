import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFormTemplateIdToTransactions1748000000000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      ALTER TABLE real_estate_transactions
        ADD COLUMN IF NOT EXISTS form_template_id uuid NULL
    `);

    await runner.query(`
      ALTER TABLE real_estate_transactions
        ADD CONSTRAINT fk_transaction_form_template
        FOREIGN KEY (form_template_id) REFERENCES transaction_form_templates(id)
        ON DELETE SET NULL
    `);

    await runner.query(`
      CREATE INDEX IF NOT EXISTS idx_real_estate_transactions_form_template_id
        ON real_estate_transactions (form_template_id)
    `);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`DROP INDEX IF EXISTS idx_real_estate_transactions_form_template_id`);
    await runner.query(`ALTER TABLE real_estate_transactions DROP CONSTRAINT IF EXISTS fk_transaction_form_template`);
    await runner.query(`ALTER TABLE real_estate_transactions DROP COLUMN IF EXISTS form_template_id`);
  }
}
