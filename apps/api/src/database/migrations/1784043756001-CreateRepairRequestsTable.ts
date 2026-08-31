import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateRepairRequestsTable1784043756001 implements MigrationInterface {
  name = 'CreateRepairRequestsTable1784043756001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'repair_requests',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          { name: 'transactionId',            type: 'uuid',    isNullable: false },
          { name: 'requestType',               type: 'varchar', isNullable: false },
          { name: 'rrDocumentId',             type: 'uuid',    isNullable: true },
          { name: 'rrrrDocumentId',           type: 'uuid',    isNullable: true },
          { name: 'crDocumentId',             type: 'uuid',    isNullable: true },
          { name: 'status',                    type: 'varchar', isNullable: false, default: `'pending'` },
          { name: 'reviewerAccountId',         type: 'uuid',    isNullable: true },
          { name: 'buyerNotes',               type: 'text',    isNullable: true },
          { name: 'docusignEnvelopeId',       type: 'varchar', isNullable: true },
          { name: 'metadataJson',              type: 'jsonb',   isNullable: true },
          { name: 'createdAt',                 type: 'timestamptz', isNullable: false, default: 'now()' },
          { name: 'updatedAt',                 type: 'timestamptz', isNullable: false, default: 'now()' },
        ],
        indices: [
          { columnNames: ['transactionId'] },
          { columnNames: ['status'] },
        ],
        foreignKeys: [
          {
            columnNames: ['transactionId'],
            referencedTableName: 'real_estate_transactions',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
          {
            columnNames: ['rrDocumentId'],
            referencedTableName: 'transaction_documents',
            referencedColumnNames: ['id'],
            onDelete: 'SET NULL',
          },
          {
            columnNames: ['rrrrDocumentId'],
            referencedTableName: 'transaction_documents',
            referencedColumnNames: ['id'],
            onDelete: 'SET NULL',
          },
          {
            columnNames: ['crDocumentId'],
            referencedTableName: 'transaction_documents',
            referencedColumnNames: ['id'],
            onDelete: 'SET NULL',
          },
          {
            columnNames: ['reviewerAccountId'],
            referencedTableName: 'accounts',
            referencedColumnNames: ['id'],
            onDelete: 'SET NULL',
          },
        ],
      }),
      true,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('repair_requests', true);
  }
}
