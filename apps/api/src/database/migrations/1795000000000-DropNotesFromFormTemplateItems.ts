import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class DropNotesFromFormTemplateItems1795000000000 implements MigrationInterface {
  name = 'DropNotesFromFormTemplateItems1795000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('transaction_form_template_items', 'notes');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'transaction_form_template_items',
      new TableColumn({ name: 'notes', type: 'text', isNullable: true }),
    );
  }
}
