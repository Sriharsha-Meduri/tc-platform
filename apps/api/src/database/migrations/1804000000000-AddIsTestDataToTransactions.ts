import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddIsTestDataToTransactions1804000000000 implements MigrationInterface {
  name = 'AddIsTestDataToTransactions1804000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumns('real_estate_transactions', [
      new TableColumn({ name: 'isTestData', type: 'boolean', default: false, isNullable: false }),
      new TableColumn({ name: 'testMode', type: 'varchar', isNullable: true }),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumns('real_estate_transactions', ['isTestData', 'testMode']);
  }
}
