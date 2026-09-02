import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateDisclosurePacketsTable1807000000000 implements MigrationInterface {
  name = 'CreateDisclosurePacketsTable1807000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'disclosure_packets',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, generationStrategy: 'uuid', default: 'uuid_generate_v4()' },
          { name: 'transactionId', type: 'uuid', isNullable: false, isUnique: true },
          { name: 'status', type: 'varchar', isNullable: false, default: `'sent_to_seller'` },
          { name: 'sentToSellerAt', type: 'timestamptz', isNullable: true },
          { name: 'sellerCompletedAt', type: 'timestamptz', isNullable: true },
          { name: 'reviewedAt', type: 'timestamptz', isNullable: true },
          { name: 'reviewedByAccountId', type: 'uuid', isNullable: true },
          { name: 'forwardedAt', type: 'timestamptz', isNullable: true },
          { name: 'forwardedTo', type: 'jsonb', isNullable: true },
          { name: 'reviewNotes', type: 'text', isNullable: true },
          { name: 'createdAt', type: 'timestamptz', isNullable: false, default: 'now()' },
          { name: 'updatedAt', type: 'timestamptz', isNullable: false, default: 'now()' },
        ],
        foreignKeys: [
          { columnNames: ['transactionId'], referencedTableName: 'real_estate_transactions', referencedColumnNames: ['id'], onDelete: 'CASCADE' },
        ],
        indices: [
          { name: 'idx_disclosure_packets_status', columnNames: ['status'] },
        ],
      }),
      true,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('disclosure_packets');
    const fk = table?.foreignKeys.find((f) => f.columnNames.includes('transactionId'));
    if (fk) await queryRunner.dropForeignKey('disclosure_packets', fk);
    await queryRunner.dropTable('disclosure_packets', true);
  }
}
