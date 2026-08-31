import { MigrationInterface, QueryRunner, TableColumn, TableForeignKey } from 'typeorm';

export class AddCcRecipientToUploadLinks1787000000000 implements MigrationInterface {
  name = 'AddCcRecipientToUploadLinks1787000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumns('upload_links', [
      new TableColumn({ name: 'ccPartyId', type: 'uuid', isNullable: true }),
      new TableColumn({ name: 'ccRole', type: 'varchar', isNullable: true }),
      new TableColumn({ name: 'ccName', type: 'varchar', isNullable: true }),
      new TableColumn({ name: 'ccEmail', type: 'varchar', isNullable: true }),
    ]);

    await queryRunner.createForeignKey('upload_links', new TableForeignKey({
      columnNames: ['ccPartyId'],
      referencedTableName: 'transaction_parties',
      referencedColumnNames: ['id'],
      onDelete: 'SET NULL',
    }));
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('upload_links');
    const fk = table?.foreignKeys.find((f) => f.columnNames.includes('ccPartyId'));
    if (fk) await queryRunner.dropForeignKey('upload_links', fk);
    await queryRunner.dropColumns('upload_links', ['ccPartyId', 'ccRole', 'ccName', 'ccEmail']);
  }
}
