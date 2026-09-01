import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateSellerSideInformationTable1805000000000 implements MigrationInterface {
  name = 'CreateSellerSideInformationTable1805000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'seller_side_information',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, generationStrategy: 'uuid', default: 'uuid_generate_v4()' },
          { name: 'transactionId', type: 'uuid', isNullable: false, isUnique: true },
          { name: 'preferredEscrowCompany', type: 'varchar', isNullable: true },
          { name: 'preferredTitleCompany', type: 'varchar', isNullable: true },
          { name: 'titleContactName', type: 'varchar', isNullable: true },
          { name: 'titleContactEmail', type: 'varchar', isNullable: true },
          { name: 'titleContactPhone', type: 'varchar', isNullable: true },
          { name: 'sellerAgentCommission', type: 'numeric', isNullable: true },
          { name: 'homeWarrantyCompany', type: 'varchar', isNullable: true },
          { name: 'sellerPaysHomeWarranty', type: 'boolean', isNullable: true },
          { name: 'nhdCompany', type: 'varchar', isNullable: true },
          { name: 'createdAt', type: 'timestamptz', isNullable: false, default: 'now()' },
          { name: 'updatedAt', type: 'timestamptz', isNullable: false, default: 'now()' },
        ],
        foreignKeys: [
          { columnNames: ['transactionId'], referencedTableName: 'real_estate_transactions', referencedColumnNames: ['id'], onDelete: 'CASCADE' },
        ],
      }),
      true,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('seller_side_information');
    const fk = table?.foreignKeys.find((f) => f.columnNames.includes('transactionId'));
    if (fk) await queryRunner.dropForeignKey('seller_side_information', fk);
    await queryRunner.dropTable('seller_side_information', true);
  }
}
