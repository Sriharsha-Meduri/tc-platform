import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddWillSendDocumentsToBuyerToEscrowInformation1789000000000 implements MigrationInterface {
  name = 'AddWillSendDocumentsToBuyerToEscrowInformation1789000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'escrow_information',
      new TableColumn({ name: 'willSendDocumentsToBuyer', type: 'boolean', isNullable: true }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('escrow_information', 'willSendDocumentsToBuyer');
  }
}
