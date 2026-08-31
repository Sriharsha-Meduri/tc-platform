import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateTransactionContactInformationTables1788000000000 implements MigrationInterface {
  name = 'CreateTransactionContactInformationTables1788000000000';

  private async createOneRowPerTransactionTable(
    queryRunner: QueryRunner,
    name: string,
    extraColumns: Array<{ name: string; type: string; isNullable: boolean }>,
  ): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name,
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, generationStrategy: 'uuid', default: 'uuid_generate_v4()' },
          { name: 'transactionId', type: 'uuid', isNullable: false, isUnique: true },
          ...extraColumns,
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

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.createOneRowPerTransactionTable(queryRunner, 'lender_information', [
      { name: 'lenderName', type: 'varchar', isNullable: true },
      { name: 'lenderEmail', type: 'varchar', isNullable: true },
    ]);

    await this.createOneRowPerTransactionTable(queryRunner, 'escrow_information', [
      { name: 'escrowContactName', type: 'varchar', isNullable: true },
      { name: 'escrowEmail', type: 'varchar', isNullable: true },
    ]);

    await this.createOneRowPerTransactionTable(queryRunner, 'hoa_information', [
      { name: 'hasHoa', type: 'boolean', isNullable: true },
    ]);

    await this.createOneRowPerTransactionTable(queryRunner, 'buyer_broker_commission', [
      { name: 'commissionType', type: 'varchar', isNullable: true },
      { name: 'commissionValue', type: 'numeric', isNullable: true },
      { name: 'brokerageName', type: 'varchar', isNullable: true },
      { name: 'notes', type: 'text', isNullable: true },
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const name of ['buyer_broker_commission', 'hoa_information', 'escrow_information', 'lender_information']) {
      const table = await queryRunner.getTable(name);
      const fk = table?.foreignKeys.find((f) => f.columnNames.includes('transactionId'));
      if (fk) await queryRunner.dropForeignKey(name, fk);
      await queryRunner.dropTable(name, true);
    }
  }
}
