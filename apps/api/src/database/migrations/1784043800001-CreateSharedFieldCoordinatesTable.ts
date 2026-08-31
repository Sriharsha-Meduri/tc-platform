import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateSharedFieldCoordinatesTable1784043800001 implements MigrationInterface {
  name = 'CreateSharedFieldCoordinatesTable1784043800001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'shared_field_coordinates',
        columns: [
          { name: 'id',                type: 'uuid',         isPrimary: true, default: 'uuid_generate_v4()' },
          { name: 'formCode',          type: 'varchar',      isNullable: false },
          { name: 'formVersion',       type: 'varchar',      isNullable: true },
          { name: 'pageNumber',        type: 'integer',      isNullable: false },
          { name: 'fieldLabel',        type: 'varchar',      isNullable: false },
          { name: 'fieldType',         type: 'varchar',      isNullable: false },
          { name: 'docuSignTabType',   type: 'varchar',      isNullable: false },
          { name: 'recipientRole',     type: 'varchar',      isNullable: false },
          { name: 'xPosition',         type: 'float',        isNullable: false },
          { name: 'yPosition',         type: 'float',        isNullable: false },
          { name: 'width',             type: 'float',        isNullable: true },
          { name: 'height',            type: 'float',        isNullable: true },
          { name: 'createdBy',         type: 'uuid',         isNullable: false },
          { name: 'createdAt',         type: 'timestamptz',  isNullable: false, default: 'now()' },
          { name: 'lastVerifiedAt',    type: 'timestamptz',  isNullable: true },
          { name: 'verificationCount', type: 'integer',      isNullable: false, default: 1 },
          { name: 'successCount',      type: 'integer',      isNullable: false, default: 0 },
        ],
        indices: [
          { columnNames: ['formCode'] },
          { columnNames: ['formCode', 'fieldLabel', 'recipientRole'] },
          { columnNames: ['lastVerifiedAt'] },
        ],
        foreignKeys: [{
          columnNames: ['createdBy'],
          referencedTableName: 'accounts',
          referencedColumnNames: ['id'],
          onDelete: 'SET NULL',
        }],
      }),
      true,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('shared_field_coordinates', true);
  }
}
