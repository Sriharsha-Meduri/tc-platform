import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateTransactionBlockerOverrides1797000000000 implements MigrationInterface {
  name = 'CreateTransactionBlockerOverrides1797000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(new Table({
      name: 'transaction_blocker_overrides',
      columns: [
        { name: 'id', type: 'uuid', isPrimary: true, default: 'uuid_generate_v4()' },
        { name: 'transactionId', type: 'uuid' },
        { name: 'blockerId', type: 'varchar' },
        { name: 'documentId', type: 'uuid', isNullable: true },
        { name: 'formCode', type: 'varchar', isNullable: true },
        { name: 'status', type: 'varchar', default: `'OVERRIDDEN'` },
        { name: 'overriddenByAccountId', type: 'uuid' },
        { name: 'overriddenAt', type: 'timestamptz' },
        { name: 'reason', type: 'text', isNullable: true },
        { name: 'createdAt', type: 'timestamptz', default: 'now()' },
      ],
    }));

    await queryRunner.createIndex('transaction_blocker_overrides', new TableIndex({
      name: 'IDX_transaction_blocker_overrides_transactionId',
      columnNames: ['transactionId'],
    }));
    await queryRunner.createIndex('transaction_blocker_overrides', new TableIndex({
      name: 'IDX_transaction_blocker_overrides_transactionId_blockerId',
      columnNames: ['transactionId', 'blockerId'],
    }));
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('transaction_blocker_overrides');
  }
}
