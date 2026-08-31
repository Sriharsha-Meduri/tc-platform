import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateTitleContactsTable1784000000000 implements MigrationInterface {
  name = 'CreateTitleContactsTable1784000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'title_contacts',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'uuid_generate_v4()' },
          { name: 'userId', type: 'uuid', isNullable: false },
          { name: 'contactName', type: 'varchar', isNullable: false },
          { name: 'companyName', type: 'varchar', isNullable: false },
          { name: 'email', type: 'varchar', isNullable: false },
          { name: 'cellPhone', type: 'varchar', isNullable: false },
          { name: 'addressLine1', type: 'varchar', isNullable: true },
          { name: 'city', type: 'varchar', isNullable: true },
          { name: 'state', type: 'varchar', isNullable: true },
          { name: 'zipCode', type: 'varchar', isNullable: true },
          { name: 'isDefault', type: 'boolean', default: false },
          { name: 'createdAt', type: 'timestamptz', default: 'now()' },
          { name: 'updatedAt', type: 'timestamptz', default: 'now()' },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'title_contacts',
      new TableIndex({ name: 'IDX_title_contacts_userId', columnNames: ['userId'] }),
    );

    await queryRunner.createIndex(
      'title_contacts',
      new TableIndex({ name: 'IDX_title_contacts_user_default', columnNames: ['userId', 'isDefault'] }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('title_contacts');
  }
}
