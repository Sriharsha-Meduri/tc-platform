import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateDocuSignConnectionsTable1784043757001 implements MigrationInterface {
  name = 'CreateDocuSignConnectionsTable1784043757001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'docusign_connections',
        columns: [
          { name: 'id',                    type: 'uuid',         isPrimary: true, default: 'uuid_generate_v4()' },
          { name: 'accountId',             type: 'uuid',         isNullable: false },
          { name: 'docusignAccountName',   type: 'varchar',      isNullable: false },
          { name: 'docusignEmail',         type: 'varchar',      isNullable: false },
          { name: 'docusignAccountId',     type: 'varchar',      isNullable: false },
          { name: 'docusignBaseUri',       type: 'varchar',      isNullable: false },
          { name: 'accessToken',           type: 'varchar',      isNullable: false },
          { name: 'refreshToken',          type: 'varchar',      isNullable: false },
          { name: 'tokenExpiresAt',        type: 'timestamptz',  isNullable: false },
          { name: 'connectedAt',           type: 'timestamptz',  isNullable: false, default: 'now()' },
          { name: 'disconnectedAt',        type: 'timestamptz',  isNullable: true },
          { name: 'createdAt',             type: 'timestamptz',  isNullable: false, default: 'now()' },
          { name: 'updatedAt',             type: 'timestamptz',  isNullable: false, default: 'now()' },
        ],
        indices: [{ columnNames: ['accountId'] }],
        foreignKeys: [{
          columnNames: ['accountId'],
          referencedTableName: 'accounts',
          referencedColumnNames: ['id'],
          onDelete: 'CASCADE',
        }],
      }),
      true,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('docusign_connections', true);
  }
}
