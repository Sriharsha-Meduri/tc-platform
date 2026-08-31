import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddEscrowNumberToEscrowInformation1789500000000 implements MigrationInterface {
  name = 'AddEscrowNumberToEscrowInformation1789500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'escrow_information',
      new TableColumn({ name: 'escrowNumber', type: 'varchar', isNullable: true }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('escrow_information', 'escrowNumber');
  }
}
