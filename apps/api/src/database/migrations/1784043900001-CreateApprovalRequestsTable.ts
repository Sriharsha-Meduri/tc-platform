import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateApprovalRequestsTable1784043900001 implements MigrationInterface {
  name = 'CreateApprovalRequestsTable1784043900001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'approval_requests',
        columns: [
          { name: 'id',             type: 'uuid',         isPrimary: true, default: 'uuid_generate_v4()' },
          { name: 'transactionId',  type: 'uuid',         isNullable: false },
          { name: 'type',           type: 'varchar',      isNullable: false },
          { name: 'status',         type: 'varchar',      isNullable: false, default: `'pending'` },
          { name: 'requestedBy',    type: 'uuid',         isNullable: true },
          { name: 'requestedAt',    type: 'timestamptz',  isNullable: false, default: 'now()' },
          { name: 'respondedBy',    type: 'uuid',         isNullable: true },
          { name: 'respondedAt',    type: 'timestamptz',  isNullable: true },
          { name: 'comments',       type: 'text',         isNullable: true },
          { name: 'emailInfo',      type: 'jsonb',        isNullable: true },
        ],
        indices: [
          { columnNames: ['transactionId'] },
          { columnNames: ['transactionId', 'type'] },
          { columnNames: ['status'] },
        ],
        foreignKeys: [
          { columnNames: ['transactionId'], referencedTableName: 'real_estate_transactions', referencedColumnNames: ['id'], onDelete: 'CASCADE' },
          { columnNames: ['requestedBy'], referencedTableName: 'accounts', referencedColumnNames: ['id'], onDelete: 'SET NULL' },
          { columnNames: ['respondedBy'], referencedTableName: 'accounts', referencedColumnNames: ['id'], onDelete: 'SET NULL' },
        ],
      }),
      true,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('approval_requests', true);
  }
}
