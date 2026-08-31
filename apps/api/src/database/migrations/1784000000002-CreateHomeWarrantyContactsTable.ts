import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateHomeWarrantyContactsTable1784000000002 implements MigrationInterface {
  name = 'CreateHomeWarrantyContactsTable1784000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'home_warranty_contacts',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'uuid_generate_v4()' },
          { name: 'userId', type: 'uuid', isNullable: false },
          { name: 'contactName', type: 'varchar', isNullable: false },
          { name: 'jobTitle', type: 'varchar', isNullable: true },
          { name: 'companyName', type: 'varchar', isNullable: false },
          { name: 'email', type: 'varchar', isNullable: false },
          { name: 'officePhone', type: 'varchar', isNullable: true },
          { name: 'website', type: 'varchar', isNullable: true },
          { name: 'orderingPortalUrl', type: 'varchar', isNullable: true },
          { name: 'isDefault', type: 'boolean', default: false },
          { name: 'createdAt', type: 'timestamptz', default: 'now()' },
          { name: 'updatedAt', type: 'timestamptz', default: 'now()' },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'home_warranty_contacts',
      new TableIndex({ name: 'IDX_hw_contacts_userId', columnNames: ['userId'] }),
    );
    await queryRunner.createIndex(
      'home_warranty_contacts',
      new TableIndex({ name: 'IDX_hw_contacts_user_default', columnNames: ['userId', 'isDefault'] }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('home_warranty_contacts');
  }
}
