import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddBuyerAgentPaymentAddressToBuyerSideInformation1799000000000 implements MigrationInterface {
  name = 'AddBuyerAgentPaymentAddressToBuyerSideInformation1799000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'buyer_side_information',
      new TableColumn({ name: 'buyerAgentPaymentAddress', type: 'varchar', isNullable: true }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('buyer_side_information', 'buyerAgentPaymentAddress');
  }
}
