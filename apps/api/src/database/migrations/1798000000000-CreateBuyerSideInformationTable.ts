import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateBuyerSideInformationTable1798000000000 implements MigrationInterface {
  name = 'CreateBuyerSideInformationTable1798000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'buyer_side_information',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, generationStrategy: 'uuid', default: 'uuid_generate_v4()' },
          { name: 'transactionId', type: 'uuid', isNullable: false, isUnique: true },
          { name: 'brokerageName', type: 'varchar', isNullable: true },
          { name: 'brokerFullName', type: 'varchar', isNullable: true },
          { name: 'brokerEmail', type: 'varchar', isNullable: true },
          { name: 'clientCredits', type: 'numeric', isNullable: true },
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
    const table = await queryRunner.getTable('buyer_side_information');
    const fk = table?.foreignKeys.find((f) => f.columnNames.includes('transactionId'));
    if (fk) await queryRunner.dropForeignKey('buyer_side_information', fk);
    await queryRunner.dropTable('buyer_side_information', true);
  }
}
