import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddDreLicenseNumberToAccounts1784044000002 implements MigrationInterface {
  name = 'AddDreLicenseNumberToAccounts1784044000002';

  async up(qr: QueryRunner): Promise<void> {
    const hasColumn = await qr.hasColumn('accounts', 'dreLicenseNumber');
    if (!hasColumn) {
      await qr.addColumn('accounts', new TableColumn({
        name: 'dreLicenseNumber',
        type: 'varchar',
        isNullable: true,
      }));
    }
  }

  async down(qr: QueryRunner): Promise<void> {
    const hasColumn = await qr.hasColumn('accounts', 'dreLicenseNumber');
    if (hasColumn) {
      await qr.dropColumn('accounts', 'dreLicenseNumber');
    }
  }
}
