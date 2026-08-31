import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateBrokerInformationTable1801000000000 implements MigrationInterface {
  name = 'CreateBrokerInformationTable1801000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'broker_information',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, generationStrategy: 'uuid', default: 'uuid_generate_v4()' },
          { name: 'transactionId', type: 'uuid', isNullable: false, isUnique: true },
          { name: 'brokerPaymentAddress', type: 'varchar', isNullable: true },
          { name: 'brokerCommissionType', type: 'varchar', isNullable: true },
          { name: 'brokerCommissionValue', type: 'numeric', isNullable: true },
          { name: 'brokerCommissionAmount', type: 'numeric', isNullable: true },
          { name: 'buyerAgentCommissionAmount', type: 'numeric', isNullable: true },
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
    const table = await queryRunner.getTable('broker_information');
    const fk = table?.foreignKeys.find((f) => f.columnNames.includes('transactionId'));
    if (fk) await queryRunner.dropForeignKey('broker_information', fk);
    await queryRunner.dropTable('broker_information', true);
  }
}
