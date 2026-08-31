import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddBuyerCommissionFieldsToBuyerSideInformation1800000000000 implements MigrationInterface {
  name = 'AddBuyerCommissionFieldsToBuyerSideInformation1800000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumns('buyer_side_information', [
      new TableColumn({ name: 'buyerCommissionType', type: 'varchar', isNullable: true }),
      new TableColumn({ name: 'buyerCommissionValue', type: 'numeric', isNullable: true }),
      new TableColumn({ name: 'grossCommission', type: 'numeric', isNullable: true }),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('buyer_side_information', 'grossCommission');
    await queryRunner.dropColumn('buyer_side_information', 'buyerCommissionValue');
    await queryRunner.dropColumn('buyer_side_information', 'buyerCommissionType');
  }
}
